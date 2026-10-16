// Diagnóstico de divergências SKU WeDrop ↔ Shopee.
// As sugestões são pistas para revisão humana: NUNCA vinculam por aproximação.
import {
  getWeDropCoverage,readWeDropCosts,readWeDropSkuLinks,
  upsertWeDropSkuLink,deleteWeDropSkuLink
} from './wedropCosts.js';

const skuText=s=>String(s??'').trim();
export function normalizedSku(s){
  return skuText(s).normalize('NFKC').toUpperCase().replace(/[^A-Z0-9]/g,'');
}
function differenceAtMostTwo(a,b){
  if(Math.abs(a.length-b.length)>2)return false;
  let prev=Array.from({length:b.length+1},(_,i)=>i);
  for(let i=1;i<=a.length;i++){
    const cur=[i];let min=i;
    for(let j=1;j<=b.length;j++){
      cur[j]=Math.min(cur[j-1]+1,prev[j]+1,
        prev[j-1]+Number(a[i-1]!==b[j-1]));
      min=Math.min(min,cur[j]);
    }
    if(min>2)return false;
    prev=cur;
  }
  return prev[b.length]<=2;
}
export function candidateReason(shopeeSku,supplierSku){
  const a=skuText(shopeeSku),b=skuText(supplierSku);
  if(!a||!b||a===b)return null;
  if(a.toUpperCase()===b.toUpperCase())
    return {rank:1,label:'Diferença apenas de maiúsculas/minúsculas'};
  const na=normalizedSku(a),nb=normalizedSku(b);
  if(na&&na===nb)
    return {rank:2,label:'Mesmo código após remover espaços e separadores'};
  if(na.length>=5&&nb.length>=5&&na!==nb&&
    (na.endsWith(nb)||nb.endsWith(na)))
    return {rank:3,label:'Possível prefixo/sufixo diferente — verificar produto'};
  if(na.length>=6&&nb.length>=6&&differenceAtMostTwo(na,nb))
    return {rank:4,label:'Código parecido — conferir modelo e variação'};
  return null;
}
export function suggestSkuCandidates(sku,costs,{limit=5}={}){
  const list=[];
  for(const row of costs){
    const why=candidateReason(sku,row.supplier_sku);
    if(why)list.push({
      supplierSku:skuText(row.supplier_sku),unitCost:Number(row.unit_cost),
      reason:why.label,kind:why.rank<=2?'Código semelhante':'Revisão necessária',rank:why.rank
    });
  }
  return list.sort((x,y)=>x.rank-y.rank||
    x.supplierSku.localeCompare(y.supplierSku,'pt-BR'))
    .slice(0,Math.max(1,Math.min(10,limit)))
    .map(({rank,...x})=>x);
}
export async function getSkuReview(shopId){
  const [coverage,costs,links]=await Promise.all([
    getWeDropCoverage(shopId,{filter:'unmatched',limit:500}),
    readWeDropCosts(shopId),readWeDropSkuLinks(shopId)
  ]);
  const pending=coverage.rows.map(x=>{
    const suggestions=suggestSkuCandidates(x.sku,costs);
    return {
      itemId:x.itemId,modelId:x.modelId,shopeeSku:x.sku,
      title:x.name,imageUrl:x.imageUrl,price:x.price,reason:
        suggestions.length?'SKU não corresponde exatamente ao catálogo de custos.':
          'SKU não encontrado no catálogo de custos; nenhuma sugestão confiável pelo código.',
      suggestions,canLink:true
    };
  });
  return {
    summary:{pending:coverage.totals.missingCost,
      linked:coverage.totals.matched,compared:coverage.totals.comparedSkus,
      manualLinks:links.length,waitingModels:coverage.totals.waitingModels,
      missingSku:coverage.totals.withoutSku},
    pending,
    warning:'Sugestões são por semelhança do código, não confirmação do produto. O catálogo de custos não contém nomes/fotos da WeDrop. Verifique o item e a variação no fornecedor antes de confirmar. Vincular custo não altera o SKU publicado na Shopee.'
  };
}
export async function searchSupplierSku(shopId,search){
  const term=skuText(search).slice(0,120);
  if(term.length<2)return [];
  const costs=await readWeDropCosts(shopId);
  const upper=term.toUpperCase();
  return costs.filter(x=>skuText(x.supplier_sku).toUpperCase().includes(upper))
    .slice(0,15)
    .map(x=>({supplierSku:String(x.supplier_sku),unitCost:Number(x.unit_cost)}));
}
export async function confirmSkuLink(shopId,payload){
  const itemId=String(payload.itemId||'');
  const modelId=payload.modelId===null||payload.modelId===undefined?'0':String(payload.modelId);
  const shopeeSku=skuText(payload.shopeeSku),supplierSku=skuText(payload.supplierSku);
  if(!/^[1-9]\d{0,15}$/.test(itemId)||!/^(0|[1-9]\d{0,15})$/.test(modelId)||
    !shopeeSku||shopeeSku.length>120||!supplierSku||supplierSku.length>120)
    throw Error('Identificação inválida do anúncio, variação ou SKU.');
  const [coverage,costs]=await Promise.all([
    getWeDropCoverage(shopId,{filter:'unmatched',limit:500}),readWeDropCosts(shopId)
  ]);
  const current=coverage.rows.find(x=>x.itemId===itemId&&String(x.modelId||'0')===modelId);
  if(!current||current.sku!==shopeeSku)
    throw Error('O anúncio não está mais pendente ou seu SKU mudou. Atualize as pendências.');
  const target=costs.find(x=>x.supplier_sku===supplierSku);
  if(!target||!Number.isFinite(Number(target.unit_cost))||Number(target.unit_cost)<=0)
    throw Error('SKU WeDrop inexistente ou sem custo válido.');
  await upsertWeDropSkuLink(shopId,{itemId,modelId,shopeeSku,supplierSku});
  return {itemId,modelId,shopeeSku,supplierSku,unitCost:Number(target.unit_cost),
    message:'Vínculo de custo confirmado. O código SKU do anúncio Shopee NÃO foi alterado.'};
}
export async function undoSkuLink(shopId,payload){
  const itemId=String(payload.itemId||'');
  const modelId=payload.modelId===null||payload.modelId===undefined?'0':String(payload.modelId);
  if(!/^[1-9]\d{0,15}$/.test(itemId)||!/^(0|[1-9]\d{0,15})$/.test(modelId))
    throw Error('Identificação do anúncio ou modelo inválida.');
  const links=await readWeDropSkuLinks(shopId);
  if(!links.some(x=>String(x.item_id)===itemId&&String(x.model_id)===modelId))
    throw Error('Não existe vínculo manual registrado para esse produto.');
  await deleteWeDropSkuLink(shopId,{itemId,modelId});
  return {message:'Vínculo removido. O SKU da Shopee permanece inalterado.'};
}
