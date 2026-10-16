// Armazenamento de custos WeDrop exclusivo da loja Shopee, com acesso service-role.
function envText(k){return String(process.env[k]||'').trim();}
function credentials(){
  const url=envText('SUPABASE_URL').replace(/\/$/,'');
  const key=envText('SUPABASE_SECRET_KEY')||envText('SUPABASE_SERVICE_ROLE_KEY');
  if(!url||!key)throw Error('Supabase não configurado para custos WeDrop.');
  return {url,key};
}
function validShopId(value){
  const id=Number(value);
  if(!Number.isSafeInteger(id)||id<=0)throw Error('Shop ID inválido.');
  return id;
}
async function request(table,query='',{method='GET',rows,prefer}={}){
  const cfg=credentials();
  const headers={apikey:cfg.key,Accept:'application/json','Content-Type':'application/json'};
  if(/^eyJ[A-Za-z0-9_-]*\./.test(cfg.key))headers.Authorization='Bearer '+cfg.key;
  if(prefer)headers.Prefer=prefer;
  const response=await fetch(cfg.url+'/rest/v1/'+table+query,{
    method,headers,...(rows!==undefined?{body:JSON.stringify(rows)}:{}),
    signal:AbortSignal.timeout(16000)
  });
  if(!response.ok)throw Error('Supabase custos HTTP '+response.status+'.');
  if(method==='GET'||prefer?.includes('return=representation')){
    const json=await response.json();
    if(!Array.isArray(json))throw Error('Resposta inesperada do banco de custos.');
    return json;
  }
  return [];
}
async function readAll(table,query,columns){
  const all=[];
  for(let i=0;i<30;i++){
    const more=await request(table,'?'+query+'&select='+columns+'&limit=1000&offset='+(i*1000));
    all.push(...more);
    if(more.length<1000)return all;
  }
  throw Error('Limite de 30.000 registros atingido. Não é possível apresentar cobertura completa.');
}
export async function readWeDropCosts(shopId){
  const id=validShopId(shopId);
  return readAll('shopee_wedrop_costs','shop_id=eq.'+id+'&order=supplier_sku.asc',
    'supplier_sku,unit_cost,source_file,imported_at');
}
export async function saveWeDropCosts(shopId,costs,{overwrite=false,sourceFile=''}={}){
  const id=validShopId(shopId);
  if(!Array.isArray(costs)||costs.length<1||costs.length>15000)
    throw Error('Importação sem custos válidos ou quantidade excessiva.');
  const existing=new Set((await readWeDropCosts(id)).map(x=>x.supplier_sku));
  const incoming=costs.filter(x=>overwrite||!existing.has(x.sku));
  const file=String(sourceFile||'exportacao.csv').split(/[\\/]/).pop().slice(0,130);
  let saved=0;
  // Operações em lotes idempotentes. Se falhar, informar contagem parcial.
  for(let i=0;i<incoming.length;i+=150){
    const chunk=incoming.slice(i,i+150).map(x=>({
      shop_id:id,supplier_sku:x.sku,unit_cost:x.unitCost,source_file:file,
      imported_at:new Date().toISOString()
    }));
    try{
      await request('shopee_wedrop_costs','?on_conflict=shop_id,supplier_sku',{
        method:'POST',rows:chunk,prefer:'resolution=merge-duplicates,return=minimal'
      });
      saved+=chunk.length;
    }catch(e){
      throw Error('Importação parcial: '+saved+' SKUs gravados antes da falha. Retome o mesmo arquivo; operação idempotente. '+String(e.message||e));
    }
  }
  return {totalReceived:costs.length,saved,
    preservedExisting:overwrite?0:costs.length-incoming.length,
    updatedExisting:overwrite?costs.filter(x=>existing.has(x.sku)).length:0,
    overwrite:Boolean(overwrite)};
}
export function matchWeDropCosts(items,models,costs){
  const bySku=new Map(costs.map(x=>[String(x.supplier_sku),Number(x.unit_cost)]));
  const modelByItem=new Map();
  for(const x of models){
    const id=String(x.item_id);
    if(!modelByItem.has(id))modelByItem.set(id,[]);
    modelByItem.get(id).push(x);
  }
  const results=[];
  let waitingModels=0,withoutSku=0;
  for(const item of items){
    const itemId=String(item.item_id);
    const variations=item.has_model?modelByItem.get(itemId)||[]:[];
    if(item.has_model&&!variations.length){waitingModels++;continue;}
    const list=item.has_model?variations:[item];
    for(const model of list){
      const sku=String(item.has_model?model.model_sku||'':item.sku||'').trim();
      if(!sku){withoutSku++;continue;}
      const amount=item.has_model?model.price:item.price;
      const price=amount===null||amount===undefined?null:Number(amount);
      const cost=bySku.has(sku)?bySku.get(sku):null;
      results.push({
        itemId,sku,modelId:item.has_model?String(model.model_id):null,
        name:String(item.item_name||''),status:String(item.item_status||''),
        price:Number.isFinite(price)?price:null,
        unitCost:cost,
        grossDifference:cost!==null&&Number.isFinite(price)?Math.round((price-cost)*100)/100:null,
        costMatched:cost!==null
      });
    }
  }
  const matched=results.filter(x=>x.costMatched).length;
  const priced=results.filter(x=>x.price!==null&&x.costMatched).length;
  const used=new Set(results.filter(x=>x.costMatched).map(x=>x.sku));
  return {
    totals:{
      catalogItems:items.length,variantSkus:models.length,
      skusWithPriceAndCost:priced,
      comparedSkus:results.length,
      matched,missingCost:results.length-matched,withoutSku,waitingModels,
      importedCosts:bySku.size,supplierSkusNotMatched:[...bySku.keys()].filter(x=>!used.has(x)).length
    },
    rows:results.sort((a,b)=>Number(a.costMatched)-Number(b.costMatched)||a.sku.localeCompare(b.sku,'pt-BR')).slice(0,500),
    truncated:results.length>500,
    warning:'Preço do catálogo pode não refletir promoções, frete ou valor efetivamente recebido. Diferença bruta não é lucro líquido.'
  };
}
export async function getWeDropCoverage(shopId){
  const id=validShopId(shopId);
  const [costs,items,models]=await Promise.all([
    readWeDropCosts(id),
    readAll('shopee_catalog_items','shop_id=eq.'+id+'&order=item_id.asc',
      'item_id,sku,item_name,item_status,price,has_model'),
    readAll('shopee_catalog_models','shop_id=eq.'+id+'&order=model_id.asc',
      'item_id,model_id,model_sku,price,stock')
  ]);
  const coverage=matchWeDropCosts(items,models,costs);
  return {shopId:id,...coverage,hasImportedCosts:costs.length>0};
}
