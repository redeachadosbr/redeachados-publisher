// Criação de anúncio COMERCIAL comum para kit WeDrop. Complementares não
// precisam ter anúncio Shopee. Mantém Kit Formal e otimizador isolados.
import crypto from 'node:crypto';
import {callShopeeShopApi} from './shopee.js';
import {loadKitDraft,claimKitPublication,recordKitPublication} from './shopeeKitDraftStore.js';
import {composeKit} from './shopeeKitBuilder.js';
import {findLiveShopeeSku} from './shopeeSkuFinder.js';
import {kitUploadedMedia,kitVideoStatus} from './shopeeKitPublicationService.js';
import {commercialCategoryFields,commercialAttributePayload,commercialKitFields,commercialKitPayload} from './shopeeKitCommercial.js';
const busy=new Set();
const str=x=>String(x??'').trim();
const validId=x=>Number.isSafeInteger(Number(x))&&Number(x)>0;
const request=(cfg,auth,path,query={})=>callShopeeShopApi(cfg,{
 path,accessToken:auth.accessToken,shopId:auth.shopId,query});
async function getCurrent(auth,kitSku){
 const saved=await loadKitDraft(auth.shopId,kitSku);
 if(!saved?.kit||!Array.isArray(saved.skus))throw Error('Rascunho de kit não salvo nesta loja.');
 if(saved.publication?.itemId||String(saved.publication?.status||'local_draft')!=='local_draft')
  throw Error('A publicação já foi iniciada ou existe Item ID. Consulte o status antes de tentar novamente.');
 if(saved.optimization?.itemId||saved.optimizationFinalization?.itemId)
  throw Error('O kit já está vinculado a um anúncio: use a otimização, não a criação.');
 const savedMain=str(saved.logistics?.mainSku);
 const mainSku=saved.skus.map(str).includes(savedMain)?savedMain:str(saved.kit.components?.[0]?.sku);
 if(!saved.skus.map(str).includes(mainSku))
  throw Error('A SKU principal não pertence aos componentes WeDrop.');
 const kit=await composeKit(auth.shopId,saved.skus,{
  marginPct:Number(saved.kit.quote?.targetMarginPct??15),
  packing:Number(saved.kit.packing||0),shipping:Number(saved.kit.shipping||0)
 });
 if(kit.kitSku!==kitSku||kit.components.map(p=>str(p.sku)).join('|')!==saved.skus.map(str).join('|')||
  Math.abs(Number(kit.kitCost)-Number(saved.kit.kitCost))>.011||
  Math.abs(Number(kit.quote.grossPrice)-Number(saved.kit.quote.grossPrice))>.011)
  throw Error('Custo, margem ou composição WeDrop alterados. Recalcule e salve antes de publicar.');
 if(!str(saved.creative?.title)||!str(saved.creative?.description))
  throw Error('Título e descrição devem estar salvos antes de publicar.');
 return {saved,kit,mainSku};
}
async function channels(cfg,auth){
 const raw=await request(cfg,auth,'/api/v2/logistics/get_channel_list');
 const entries=raw?.response?.logistics_channel_list||raw?.response?.logistic_channel_list||[];
 if(!Array.isArray(entries))throw Error('A Shopee não retornou os canais logísticos.');
 const list=entries.filter(x=>[true,1,'ENABLED','NORMAL'].includes(x.enabled??x.is_enabled??x.status))
  .map(x=>({id:String(x.logistic_channel_id??x.logistic_id??''),
   name:String(x.logistic_channel_name??x.logistic_name??'Canal Shopee')}))
  .filter(x=>validId(x.id));
 if(!list.length)throw Error('Nenhum canal logístico habilitado para a loja.');
 return list;
}
async function recommendations(cfg,auth,title){
 try{
  const data=await request(cfg,auth,'/api/v2/product/category_recommend',{item_name:title});
  return (Array.isArray(data?.response?.category_id)?data.response.category_id:[])
   .filter(validId).slice(0,8).map(Number);
 }catch{return [];}
}
async function attributeTree(cfg,auth,categoryId){
 if(!validId(categoryId))return null;
 return request(cfg,auth,'/api/v2/product/get_attribute_tree',{
  category_id_list:String(categoryId),language:'pt-BR'
 });
}
async function categoryNames(cfg,auth){
 try{
  const data=await request(cfg,auth,'/api/v2/product/get_category',{language:'pt-BR'});
  const rows=data?.response?.category_list;
  return Array.isArray(rows)?rows.map(x=>({
   id:Number(x.category_id),name:str(x.display_category_name||x.original_category_name||x.category_name),
   leaf:!(x.has_children===true)
  })).filter(x=>validId(x.id)):[];}
 catch{return [];}
}
async function checkExistingSku(cfg,auth,sku){
 const found=await findLiveShopeeSku(cfg,auth,callShopeeShopApi,sku,{
  maxPages:20,maxModels:100,fastOnly:false
 });
 if(found.incomplete)throw Error('Consulta Shopee incompleta: não foi possível descartar anúncio duplicado para '+sku+'.');
 const matches=found.matches||[];
 if(matches.length)throw Error('A SKU principal '+sku+' já pertence ao Item ID '+
  matches.slice(0,3).map(x=>x.itemId).join(', ')+
  '. Não criei anúncio duplicado. Use a opção de otimização do Item ID correto.');
 return true;
}
export async function commercialReadiness({cfg,auth,kitSku,categoryId=0}){
 const {saved,kit,mainSku}=await getCurrent(auth,kitSku);
 const [logistics,recommended,names,tree]=await Promise.all([
  channels(cfg,auth),recommendations(cfg,auth,saved.creative.title),
  categoryNames(cfg,auth),attributeTree(cfg,auth,categoryId)
 ]);
 const ids=[...new Set([...recommended,...(validId(categoryId)?[Number(categoryId)]:[])])];
 const candidates=ids.length?ids:names.filter(x=>x.leaf).slice(0,700).map(x=>x.id);
 const categories=candidates.map(id=>({id,name:names.find(x=>x.id===id)?.name||'Categoria Shopee '+id}));
 const attrs=tree?commercialCategoryFields(tree,categoryId,[]):[];
 return {kitSku,mainSku,mode:'commercial',categories,
  requestedCategoryId:validId(categoryId)?Number(categoryId):null,
  attributes:attrs,channels:logistics,
  uploadedImageIds:kitUploadedMedia(auth.shopId,kitSku),
  video:kitVideoStatus(auth.shopId,kitSku),
  logistics:saved.logistics||null,
  title:saved.creative.title,price:Number(kit.quote.grossPrice),
  note:'Anúncio comum com uma SKU principal, um kit comercial WeDrop e estoque inicial de 1 conjunto. Sem criar anúncios para os complementos.'};
}
async function prepared({cfg,auth,kitSku,input}){
 const {saved,kit,mainSku}=await getCurrent(auth,kitSku);
 const [allowed,tree]=await Promise.all([
  channels(cfg,auth),attributeTree(cfg,auth,input?.categoryId)
 ]);
 if(!tree)throw Error('Categoria da Shopee ausente ou não confirmada.');
 const fields=commercialKitFields(input,kit,allowed,kitUploadedMedia(auth.shopId,kitSku));
 if(!saved.skus.map(str).includes(fields.mainSku))throw Error('A SKU principal não pertence ao kit.');
 if(fields.title!==str(saved.creative.title)||fields.description!==str(saved.creative.description))
  throw Error('Título ou descrição divergentes do rascunho. Salve antes de executar.');
 const attributes=commercialAttributePayload(tree,fields.categoryId,fields.attributes);
 const video=kitVideoStatus(auth.shopId,kitSku);
 const videoId=input?.includeVideo===true?(video?.ready?video.videoUploadId:null):null;
 if(input?.includeVideo===true&&!videoId)
  throw Error('O vídeo ainda não foi confirmado na mídia Shopee.');
 const payload=commercialKitPayload(fields,kit,attributes,videoId);
 return {saved,kit,payload,fields};
}
function fingerprint(value){return crypto.createHash('sha256').update(JSON.stringify(value)).digest('hex');}
function signature(data,secret){return crypto.createHmac('sha256',secret).update(data).digest('hex');}
export function commercialSignPreview(kitSku,payload,secret){
 const body=Buffer.from(JSON.stringify({kitSku,hash:fingerprint(payload),exp:Date.now()+10*60*1000})).toString('base64url');
 return body+'.'+signature(body,secret);
}
export function commercialVerifyPreview(token,kitSku,payload,secret){
 const [body,mac,extra]=String(token||'').split('.');
 if(!body||!mac||extra)throw Error('Prévia inválida ou incompleta.');
 const expected=signature(body,secret);
 if(mac.length!==expected.length||
    !crypto.timingSafeEqual(Buffer.from(mac),Buffer.from(expected)))
  throw Error('Assinatura da prévia inválida.');
 let decoded;
 try{decoded=JSON.parse(Buffer.from(body,'base64url').toString('utf8'));}
 catch{throw Error('Prévia inválida.');}
 if(decoded.kitSku!==kitSku||decoded.hash!==fingerprint(payload)||Number(decoded.exp)<Date.now())
  throw Error('Prévia expirada ou alterada. Refaça a conferência sem perder o rascunho.');
 return true;
}
export async function commercialPreview({cfg,auth,kitSku,input,secret}){
 const result=await prepared({cfg,auth,kitSku,input});
 await checkExistingSku(cfg,auth,result.fields.mainSku);
 return {mode:'commercial',token:commercialSignPreview(kitSku,result.payload,secret),
  summary:{title:result.payload.item_name,mainSku:result.fields.mainSku,
   categoryId:result.fields.categoryId,price:result.payload.original_price,
   images:result.payload.image.image_id_list.length,
   stock:result.payload.normal_stock,logistics:result.fields.logistics,
   videoIncluded:Boolean(result.payload.video_upload_id),
   message:'Prévia confirmada. Próximo clique criará UM anúncio normal; componentes complementares ficarão somente na WeDrop.'}};
}
// Erro explícito da API Shopee significa criação rejeitada; falha de transporte
// pode ter sido processada e precisa ficar em estado INCERTO.
export function isDefinitiveShopeeRejection(error){
 const message=str(error?.message||error);
 return /^(?:product\.|error_param\b|error_data\b|logistics\.|media_space\.|error_permission\b|error_auth\b)/i.test(message);
}
export async function commercialExecute({cfg,auth,kitSku,input,token,secret}){
 const key=auth.shopId+':'+kitSku;
 if(busy.has(key))throw Error('Já existe uma criação em andamento para este kit.');
 busy.add(key);
 try{
  const result=await prepared({cfg,auth,kitSku,input});
  commercialVerifyPreview(token,kitSku,result.payload,secret);
  await checkExistingSku(cfg,auth,result.fields.mainSku);
  // Claim condicional no banco: não repetir POST quando outro processo iniciou.
  await claimKitPublication(auth.shopId,kitSku,{
   status:'publishing',message:'Criação comercial autorizada; aguardando resposta oficial.'
  });
  let data;
  try{
   data=await callShopeeShopApi(cfg,{
    path:'/api/v2/product/add_item',method:'POST',
    accessToken:auth.accessToken,shopId:auth.shopId,
    body:result.payload
   });
  }catch(error){
   const definite=isDefinitiveShopeeRejection(error);
   await recordKitPublication(auth.shopId,kitSku,{status:definite?'local_draft':'uncertain',
    message:(definite?'Shopee rejeitou a criação: ':'Resposta de criação incerta: ')+str(error.message||error).slice(0,230)});
   if(definite)throw Error('A Shopee recusou a criação. Corrija somente o campo indicado e use nova prévia: '+
    str(error.message||error).slice(0,240));
   throw Error('A resposta da Shopee não foi confirmada. Não repita a criação: consulte o status do kit. '+str(error.message||error).slice(0,150));
  }
  const itemId=String(data?.response?.item_id??'');
  if(!validId(itemId)){
   await recordKitPublication(auth.shopId,kitSku,{status:'uncertain',
    message:'Shopee respondeu sem Item ID na criação comercial.'});
   throw Error('A Shopee não retornou Item ID. Consulte o catálogo antes de tentar novamente.');
  }
  let state='published_pending',message='Shopee recebeu a criação; confira o Item ID.';
  try{
   const confirmed=await request(cfg,auth,'/api/v2/product/get_item_base_info',{
    item_id_list:itemId,need_tax_info:false});
   const item=confirmed?.response?.item_list?.find(x=>String(x.item_id)===itemId);
   if(item&&str(item.item_sku)===result.fields.mainSku&&
      str(item.item_name)===result.fields.title&&
      ['NORMAL','UNLIST'].includes(str(item.item_status).toUpperCase())){
    state=str(item.item_status).toUpperCase()==='NORMAL'?'published':'published_pending';
    message=state==='published'?'Anúncio comercial confirmado NORMAL na Shopee.':
     'Anúncio criado, mas ainda não ativo; consultar Seller Center.';
   }
  }catch{}
  await recordKitPublication(auth.shopId,kitSku,{status:state,itemId,message});
  return {kitSku,itemId,status:state,message,discountApplied:false,
   note:'O desconto permanece separado e deve ser verificado depois da criação.'};
 }finally{busy.delete(key);}
}
