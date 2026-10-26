// Resolver SKUs de fornecedor em produtos reais da loja antes de criar
// Kit Formal. IDs nunca são aceitos do navegador.
import {findExactCatalogSku} from './catalogStore.js';
import {readWeDropSkuLinks} from './wedropCosts.js';
import {callShopeeShopApi} from './shopee.js';
const safeId=x=>/^[1-9]\d{0,17}$/.test(String(x))&&Number.isSafeInteger(Number(x));
const call=(cfg,auth,path,query={})=>callShopeeShopApi(cfg,{
 path,accessToken:auth.accessToken,shopId:auth.shopId,query
});
export async function resolveKitShopeeComponents(cfg,auth,kit){
 const links=await readWeDropSkuLinks(auth.shopId);
 const linked=[],blockers=[];
 for(const component of kit.components){
  const exact=await findExactCatalogSku(auth.shopId,component.sku);
  const reviewed=links.filter(x=>String(x.supplier_sku)===component.sku);
  const identified=[...exact,...reviewed.map(x=>({
   itemId:String(x.item_id),modelId:String(x.model_id||0),
   sku:String(x.shopee_sku),source:'reviewed-link',status:''
  }))];
  const unique=new Map(identified.map(x=>[x.itemId+':'+x.modelId,x]));
  if(unique.size!==1){
   blockers.push('SKU WeDrop '+component.sku+(unique.size===0
    ?': ainda não está vinculada a um anúncio Shopee. Publique/vincule o item primeiro.'
    :': mais de um anúncio encontrado; resolva o vínculo antes de montar o Kit Formal.'));
   continue;
  }
  const selected=[...unique.values()][0];
  if(!safeId(selected.itemId)){
   blockers.push('SKU '+component.sku+': Item ID inválido.');continue;
  }
  try{
   const b=await call(cfg,auth,'/api/v2/product/get_item_base_info',{
    item_id_list:[selected.itemId],need_tax_info:false
   });
   const live=b.response?.item_list?.find(x=>String(x.item_id)===selected.itemId);
   if(!live||String(live.item_status).toUpperCase()!=='NORMAL'){
    blockers.push('SKU '+component.sku+': anúncio não está publicado como NORMAL.');continue;
   }
   const modelId=Number(selected.modelId||0);
   if(live.has_model===true){
    if(!Number.isSafeInteger(modelId)||modelId<=0){
     blockers.push('SKU '+component.sku+': é variação, mas não possui Model ID selecionado.');continue;
    }
    const data=await call(cfg,auth,'/api/v2/product/get_model_list',{item_id:Number(selected.itemId)});
    const model=(data.response?.model||[]).find(x=>Number(x.model_id)===modelId);
    if(!model||String(model.model_sku)!==String(selected.sku)){
     blockers.push('SKU '+component.sku+': variação/SKU não confere mais na Shopee.');continue;
    }
    if(model.model_status&&String(model.model_status).toUpperCase()!=='NORMAL'){
     blockers.push('SKU '+component.sku+': variação inativa.');continue;
    }
   }else{
    if(modelId!==0||String(live.item_sku)!==String(selected.sku)){
     blockers.push('SKU '+component.sku+': código do anúncio foi alterado ou possui vínculo desatualizado.');continue;
    }
   }
   if(live.item_type==='KIT'||live.is_kit===true){
    blockers.push('SKU '+component.sku+': kit existente não pode ser componente de outro kit sem verificação especial.');continue;
   }
   linked.push({supplierSku:component.sku,shopeeSku:selected.sku,
    itemId:selected.itemId,modelId:String(modelId),status:'NORMAL',title:String(live.item_name||''),
    categoryId:Number(live.category_id)||null,source:selected.source});
  }catch(e){
   blockers.push('SKU '+component.sku+': não foi possível validar anúncio na Shopee. '+String(e.message).slice(0,150));
  }
 }
 return {linked,blockers};
}
export async function kitShopeeOptions(cfg,auth){
 const [limits,logistics]=await Promise.allSettled([
  call(cfg,auth,'/api/v2/product/get_kit_item_limit'),
  call(cfg,auth,'/api/v2/logistics/get_channel_list')
 ]);
 const blockers=[];
 const max=limits.status==='fulfilled'?limits.value.response:null;
 if(!max)blockers.push('API de limites do Kit Formal não autorizada ou temporariamente indisponível.');
 const list=logistics.status==='fulfilled'?(logistics.value.response?.logistics_channel_list||
  logistics.value.response?.logistic_channel_list||[]):[];
 if(!Array.isArray(list)||!list.length)
  blockers.push('Shopee não retornou canais de envio; selecione um canal somente após conectar a logística.');
 const channels=(Array.isArray(list)?list:[]).filter(x=>{
  const flag=x.enabled??x.is_enabled??x.status;
  return flag===true||flag==='ENABLED'||flag==='NORMAL'||flag===1;
 }).map(x=>({id:String(x.logistic_channel_id??x.logistic_id??''),
  name:String(x.logistic_channel_name??x.logistic_name??'Envio Shopee')}))
 .filter(x=>safeId(x.id));
 return {limits:max,channels,blockers};
}
