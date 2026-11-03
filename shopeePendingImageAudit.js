// Auditoria SOMENTE LEITURA: fotos do anúncio-pai e estoque por SKU/modelo.
// Nenhuma etapa é marcada como concluída e nenhum update_item é executado.
import {normalStatus,normalizeCatalogItem,normalizeShopeeModels,validItemId} from './catalog.js';

const IMAGE_GOAL=9;
const STATUSES=['NORMAL','UNLIST','REVIEWING','BANNED'];
export const PENDING_IMAGE_STATUSES=Object.freeze(STATUSES);

export function pendingImageCount(base){
 const image=base?.image||{};
 const ids=image.image_id_list;
 if(Array.isArray(ids))return new Set(ids.filter(x=>
  typeof x==='string'&&x.trim()||Number.isFinite(x)).map(String)).size;
 // A API pode responder somente com URLs. Contar a lista oficial de URLs,
 // mas jamais inferir nove imagens a partir de uma capa ou de um checkbox.
 const urls=image.image_url_list;
 if(Array.isArray(urls))return new Set(urls.filter(x=>
  typeof x==='string'&&x.trim())).size;
 return null;
}
export function pendingImageCategory({listingStatus,modelStatus='',hasModel=false,stock,sku,imageCount}){
 if(imageCount===null||!sku)return 'unverified';
 if(imageCount>=IMAGE_GOAL)return 'complete';
 if(listingStatus!=='NORMAL')return 'inactive';
 if(hasModel&&!modelStatus)return 'unverified';
 if(modelStatus&&modelStatus!=='MODEL_NORMAL'&&modelStatus!=='NORMAL')
  return modelStatus==='MODEL_UNAVAILABLE'?'inactive':'unverified';
 if(stock===null||!Number.isFinite(stock)||stock<0)return 'unverified';
 return stock>0?'active_with_stock':'active_no_stock';
}
const safeInt=value=>value!==null&&value!==undefined&&value!==''&&
 Number.isSafeInteger(Number(value))&&Number(value)>=0?Number(value):null;
const idOf=row=>validItemId(row?.item_id);
const locationOf=base=>{
 const image=base?.image||{};
 const url=image.image_url_list?.[0]||image.image_url||'';
 return typeof url==='string'&&/^https:\/\//i.test(url)?url:'';
};
export function pendingImageRows({status,item,models=null}){
 const count=pendingImageCount(item);
 const itemId=idOf(item);
 const title=String(item.item_name||'').trim();
 const realStatus=String(item.item_status||status).trim().toUpperCase();
 const parent=normalizeCatalogItem({item_id:itemId,item_status:realStatus},item);
 // Não consultar modelos de anúncios já completos nem quando a Shopee
 // omite a lista de imagens: nestes casos o resultado fica não verificado.
 if(count!==null&&count>=IMAGE_GOAL)return [];
 if(count===null)return [{
  key:itemId+':unverified',sku:parent.sku,itemId,modelId:'0',
  title,listingStatus:realStatus,modelStatus:'',
  stock:null,imageCount:null,missingImages:null,imageUrl:locationOf(item),
  category:'unverified',reason:'A Shopee não retornou image_id_list nem image_url_list.'}];
 const options=parent.hasModel?
  (Array.isArray(models)?models:null):
  [{sku:parent.sku,modelId:'0',stock:parent.stock,status:''}];
 if(parent.hasModel&&options===null)
  throw Error('Variações não confirmadas para Item ID '+itemId+'.');
 if(parent.hasModel&&!options.length)
  throw Error('Anúncio '+itemId+' possui variações mas a Shopee retornou zero modelos.');
 return options.map(model=>{
  const sku=String(model.sku||'').trim();
  const stock=model.stock===null||model.stock===undefined?null:Number(model.stock);
  const modelStatus=String(model.status||'').toUpperCase();
  const category=pendingImageCategory({listingStatus:realStatus,modelStatus,
   hasModel:parent.hasModel,stock,sku,imageCount:count});
  const reason=!sku?'SKU não informada pela Shopee; verifique o Item ID.':
   category==='unverified'?'Estoque ou status da variação não confirmado pela Shopee.':
   category==='inactive'?'Anúncio ou variação não está ativo.':
   category==='active_no_stock'?'Anúncio ativo, porém sem estoque disponível.':'';
  return {key:itemId+':'+String(model.modelId||0),sku,itemId,
   modelId:String(model.modelId||'0'),title,listingStatus:realStatus,
   modelStatus,stock:Number.isFinite(stock)&&stock>=0?stock:null,
   imageCount:count,missingImages:Math.max(0,IMAGE_GOAL-count),
   imageUrl:locationOf(item),category,reason};
 });
}
export async function scanShopeePendingImagesPage({cfg,auth,callApi,status='NORMAL',offset=0,pageSize=25}){
 status=normalStatus(status);
 const at=Number(offset),size=Number(pageSize);
 if(!Number.isSafeInteger(at)||at<0||at>100000||
    !Number.isSafeInteger(size)||size<1||size>50)
  throw Error('Paginação inválida para auditoria de imagens.');
 const shared={accessToken:auth.accessToken,shopId:auth.shopId};
 const listing=await callApi(cfg,{path:'/api/v2/product/get_item_list',
  ...shared,query:{item_status:status,offset:at,page_size:size}});
 const body=listing?.response||{};
 const totalCount=safeInt(body.total_count);
 if(totalCount===null)throw Error('A Shopee não informou total_count para '+status+'.');
 const listed=Array.isArray(body.item)?body.item:
  Array.isArray(body.item_list)?body.item_list:null;
 const entries=listed||(totalCount===0&&at===0?[]:null);
 if(!entries)throw Error('Página '+status+' '+at+' sem lista válida de anúncios.');
 if(!entries.length&&at<totalCount)
  throw Error('A Shopee retornou página vazia antes do fim da categoria '+status+'.');
 const ids=entries.map(idOf);
 if(new Set(ids).size!==ids.length)throw Error('Item IDs repetidos na página '+status+' '+at+'.');
 if(at+ids.length>totalCount)
  throw Error('Contagem Shopee inconsistente para '+status+'.');
 const details=new Map();
 for(let i=0;i<ids.length;i+=25){
  const chunk=ids.slice(i,i+25);
  const base=await callApi(cfg,{path:'/api/v2/product/get_item_base_info',
   ...shared,query:{item_id_list:chunk.join(',')}});
  const values=base?.response?.item_list;
  if(!Array.isArray(values))throw Error('Fotos não retornadas para '+chunk.length+' anúncios.');
  for(const item of values){
   const id=idOf(item);
   if(chunk.includes(id)&&!details.has(id))details.set(id,item);
  }
  if(chunk.some(id=>!details.has(id)))
   throw Error('Leitura incompleta das imagens: '+chunk.filter(id=>!details.has(id)).join(', '));
 }
 const rows=[];
 // Somente anúncios com menos de 9 imagens exigem leitura de modelos.
 // Limitar as chamadas simultâneas para preservar o rate-limit da Shopee.
 const targets=ids.map(id=>details.get(id));
 let cursor=0;
 await Promise.all(Array.from({length:Math.min(3,targets.length)},async()=>{
  while(cursor<targets.length){
   const item=targets[cursor++];
   const base=normalizeCatalogItem({item_id:item.item_id,item_status:status},item);
   const count=pendingImageCount(item);
   let models=null;
   if(count!==null&&count<IMAGE_GOAL&&base.hasModel){
    const answer=await callApi(cfg,{path:'/api/v2/product/get_model_list',
     ...shared,query:{item_id:Number(item.item_id)}});
    models=normalizeShopeeModels(answer);
   }
   rows.push(...pendingImageRows({status,item,models}));
  }
 }));
 const nextOffset=at+ids.length;
 const hasNext=Boolean(body.has_next_page)||nextOffset<totalCount;
 if(hasNext&&nextOffset<=at)throw Error('Paginação não avançou para '+status+'.');
 return {source:'shopee-api-live',asOf:new Date().toISOString(),status,
  totalCount,scannedListings:ids.length,offset:at,hasNext,
  nextOffset,rows:rows.sort((a,b)=>Number(a.itemId)-Number(b.itemId)||
   String(a.modelId).localeCompare(String(b.modelId)))};
}


// Confirmação pontual, sem cache, do MESMO Item ID após otimizar imagens.
// Só a galeria real retornada pela Shopee autoriza retirar o anúncio da fila.
export async function verifyShopeePendingImageItem({cfg,auth,callApi,itemId}){
 const id=validItemId(itemId);
 const response=await callApi(cfg,{
  path:'/api/v2/product/get_item_base_info',
  accessToken:auth.accessToken,shopId:auth.shopId,
  query:{item_id_list:id}
 });
 const items=response?.response?.item_list;
 if(!Array.isArray(items)||items.length!==1||String(items[0]?.item_id)!==id)
  throw Error('A Shopee não confirmou a galeria exata do Item ID '+id+'.');
 const imageCount=pendingImageCount(items[0]);
 return {source:'shopee-api-live',itemId:id,shopId:String(auth.shopId),
  verifiedAt:new Date().toISOString(),
  imageCount,requiredImages:IMAGE_GOAL,
  missingImages:imageCount===null?null:Math.max(0,IMAGE_GOAL-imageCount),
  status:imageCount===null?'unverified':imageCount>=IMAGE_GOAL?'confirmed':'pending',
  complete:imageCount!==null&&imageCount>=IMAGE_GOAL};
}
