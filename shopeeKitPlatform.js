// Resolver SKUs de fornecedor em produtos reais da loja antes de criar
// Kit Formal. IDs nunca são aceitos do navegador.
import {findExactCatalogSku} from './catalogStore.js';
import {readWeDropSkuLinks,upsertWeDropSkuLink} from './wedropCosts.js';
import {findLiveShopeeSku} from './shopeeSkuFinder.js';
import {callShopeeShopApi} from './shopee.js';
import {enabledShopeeChannels} from './shopeeLogisticsChannels.js';
const safeId=x=>/^[1-9]\d{0,17}$/.test(String(x))&&Number.isSafeInteger(Number(x));
function availableStock(record){
 const value=record?.stock_info_v2?.summary_info?.total_available_stock;
 if(Number.isFinite(Number(value))&&value!==undefined&&value!==null&&value!=='')
  return Number(value);
 const older=record?.stock_info?.find?.(x=>Number.isFinite(Number(x.current_stock)));
 return older?Number(older.current_stock):null;
}
const call=(cfg,auth,path,query={})=>callShopeeShopApi(cfg,{
 path,accessToken:auth.accessToken,shopId:auth.shopId,query
});
const normalize=x=>String(x||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase();
const productTypes=['mochila','estojo','lancheira','lixeira','cesto','escova','dispenser',
 'secador','basquete','bolsa','coqueteleira','fogareiro','marmita','pote','bomba','jogo'];
export function plausibleKitComponentTitle(componentName,itemName){
 const expected=normalize(componentName),actual=normalize(itemName);
 const type=productTypes.find(word=>new RegExp('\\b'+word+'\\b').test(expected));
 return Boolean(actual.trim())&&(!type||new RegExp('\\b'+type+'\\b').test(actual));
}
export function chooseUniqueLiveKitSku(sku,matches){
 const exact=(Array.isArray(matches)?matches:[]).filter(x=>
  String(x.sku||'')===String(sku)&&safeId(x.itemId));
 const unique=[...new Map(exact.map(x=>[String(x.itemId)+':'+String(x.modelId||'0'),x])).values()];
 const normal=unique.filter(x=>String(x.status||'').toUpperCase()==='NORMAL');
 return {candidate:normal.length===1?normal[0]:null,activeCount:normal.length,
  totalCount:unique.length};
}
async function checkKitCandidate(cfg,auth,component,selected){
 if(!safeId(selected.itemId))return {error:'Item ID inválido'};
 try{
  const data=await call(cfg,auth,'/api/v2/product/get_item_base_info',{
   item_id_list:[selected.itemId],need_tax_info:false
  });
  const live=data.response?.item_list?.find(x=>String(x.item_id)===String(selected.itemId));
  if(!live)return {error:'a Shopee não confirmou o anúncio informado'};
  if(String(live.item_status).toUpperCase()!=='NORMAL')
   return {error:'o anúncio encontrado não está ativo na Shopee'};
  if(!plausibleKitComponentTitle(component.name,live.item_name))
   return {error:'o nome do anúncio Shopee não corresponde ao tipo do componente do kit'};
  if(live.item_type==='KIT'||live.is_kit===true)
   return {error:'um Kit Formal não pode ser componente de outro Kit Formal'};
  const modelId=Number(selected.modelId||0);
  if(live.has_model===true){
   if(!Number.isSafeInteger(modelId)||modelId<=0)return {error:'a variação do produto não foi identificada'};
   const models=await call(cfg,auth,'/api/v2/product/get_model_list',{item_id:Number(selected.itemId)});
   const model=(models.response?.model||[]).find(x=>Number(x.model_id)===modelId);
   if(!model||String(model.model_sku)!==String(selected.sku))
    return {error:'o SKU da variação não corresponde ao modelo na Shopee'};
   if(model.model_status&&!['NORMAL','MODEL_NORMAL'].includes(String(model.model_status).toUpperCase()))
    return {error:'a variação está indisponível na Shopee'};
   const quantity=availableStock(model);
   if(quantity===null||quantity<1)return {error:'a variação está sem estoque confirmado na Shopee'};
  }else{
   if(modelId!==0||String(live.item_sku)!==String(selected.sku))
    return {error:'o código do anúncio Shopee mudou'};
   const quantity=availableStock(live);
   if(quantity===null||quantity<1)return {error:'o produto está sem estoque confirmado na Shopee'};
  }
  return {record:{supplierSku:String(component.sku),shopeeSku:String(selected.sku),
   itemId:String(selected.itemId),modelId:String(modelId),status:'NORMAL',
   title:String(live.item_name||''),categoryId:Number(live.category_id)||null,
   source:String(selected.source||'official_live')}};
 }catch(error){
  return {error:'a Shopee não concluiu a validação: '+String(error.message||error).slice(0,125)};
 }
}
async function findVerifiedKitSku(cfg,auth,component){
 // Consultar o vendedor, nunca o marketplace de concorrentes nem por título parecido.
 const sku=String(component.sku);
 const fast=await findLiveShopeeSku(cfg,auth,callShopeeShopApi,sku,{fastOnly:true});
 let result=fast;
 if(!fast.matches?.length){
  result=await findLiveShopeeSku(cfg,auth,callShopeeShopApi,sku,{
   fastOnly:false,maxPages:12,maxModels:55
  });
 }
 return {...chooseUniqueLiveKitSku(sku,result.matches),incomplete:Boolean(result.incomplete),
  warnings:result.warnings||[],source:result.source};
}
export async function resolveKitShopeeComponents(cfg,auth,kit){
 const links=await readWeDropSkuLinks(auth.shopId);
 const linked=[],blockers=[],autoRecovered=[];
 for(const component of kit.components){
  const sku=String(component.sku),label=String(component.name||sku);
  const exact=await findExactCatalogSku(auth.shopId,sku);
  const reviewed=links.filter(x=>String(x.supplier_sku)===sku).map(x=>({
   itemId:String(x.item_id),modelId:String(x.model_id||0),
   sku:String(x.shopee_sku),source:'reviewed-link'
  }));
  const candidates=reviewed.length?reviewed:exact;
  const uniq=[...new Map(candidates.map(x=>[x.itemId+':'+x.modelId,x])).values()];
  let checked=null,error='';
  if(uniq.length===1){
   checked=await checkKitCandidate(cfg,auth,component,uniq[0]);
   error=checked.error||'';
  }else if(uniq.length>1)error='mais de um anúncio encontrado para o mesmo produto';
  if(checked?.record){linked.push(checked.record);continue;}
  // Cache sem vínculo, anúncio antigo ou variação antiga: consulta AO VIVO,
  // com SKU exata e validação da ficha real antes de registrar vínculo.
  let found;
  try{found=await findVerifiedKitSku(cfg,auth,component);}
  catch(e){
   blockers.push(label+': a busca automática na sua loja não terminou ('+
    String(e.message||e).slice(0,140)+'). Nada foi vinculado.');continue;
  }
  if(found.activeCount>1){
   blockers.push(label+': encontrei mais de um anúncio ativo com o mesmo SKU. '+
    'Não é seguro escolher um deles automaticamente.');continue;
  }
  if(found.candidate){
   const validated=await checkKitCandidate(cfg,auth,component,found.candidate);
   if(validated.record){
    const other=links.find(x=>String(x.item_id)===String(found.candidate.itemId)&&
     String(x.model_id||0)===String(found.candidate.modelId||0)&&
     String(x.supplier_sku)!==sku);
    if(other){
     blockers.push(label+': o anúncio localizado está associado a outro produto da WeDrop. '+
      'Não vou sobrescrever esse vínculo.');continue;
    }
    try{
     await upsertWeDropSkuLink(auth.shopId,{
      itemId:validated.record.itemId,modelId:validated.record.modelId,
      shopeeSku:validated.record.shopeeSku,supplierSku:sku
     });
     validated.record.source='auto-confirmed-shopee';
     autoRecovered.push({sku,product:label,itemId:validated.record.itemId});
    }catch(e){
     // A busca oficial já recuperou o catálogo; a confirmação de vínculo
     // não pode ser presumida quando o banco falha.
     blockers.push(label+': anúncio encontrado, mas não consegui salvar o vínculo seguro ('+
      String(e.message||e).slice(0,120)+').');continue;
    }
    linked.push(validated.record);continue;
   }
   error=validated.error||error;
  }
  if(found.totalCount>0&&!found.candidate){
   blockers.push(label+': encontrei o código na Shopee, mas o anúncio não está ativo. '+
    'Não consigo incluir este produto no Kit Formal enquanto estiver inativo.');continue;
  }
  if(error&&found.totalCount===0){
   blockers.push(label+': não foi possível recuperar o vínculo anterior ('+error+
    '). A pesquisa automática pelo código exato não confirmou um anúncio ativo.');continue;
  }
  blockers.push(label+': pesquisei automaticamente na sua loja Shopee, mas não foi encontrado '+
   'um anúncio ativo com o código deste produto.'+
   (found.incomplete?' A consulta do catálogo foi parcial.':
    ' Kit Formal exige anúncio ativo de cada componente; não criei um produto diferente em seu lugar.'));
 }
 return {linked,blockers,autoRecovered};
}
export async function kitShopeeOptions(cfg,auth){
 const [limits,logistics]=await Promise.allSettled([
  call(cfg,auth,'/api/v2/product/get_kit_item_limit'),
  call(cfg,auth,'/api/v2/logistics/get_channel_list')
 ]);
 const blockers=[];
 const max=limits.status==='fulfilled'?limits.value.response:null;
 if(!max)blockers.push('API de limites do Kit Formal não autorizada ou temporariamente indisponível.');
 let channels=[];
 if(logistics.status==='fulfilled'){
  try{channels=enabledShopeeChannels(logistics.value);}
  catch{blockers.push('A Shopee não retornou a lista oficial de canais de envio.');}
 }else blockers.push('Consulta de canais de envio da Shopee indisponível.');
 if(!channels.length)
  blockers.push('A Shopee não confirmou nenhum canal de envio habilitado para esta loja.');
 return {limits:max,channels,blockers};
}
