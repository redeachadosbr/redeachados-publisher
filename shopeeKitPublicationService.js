// Sequência segura: rascunho -> mídia Shopee -> prévia assinada ->
// add_kit_item (uma única vez) -> confirmação -> etapa de desconto separada.
import {createShopeeMediaApi} from './shopeeMediaApi.js';
import {callShopeeShopApi} from './shopee.js';
import {loadKitDraft,recordKitPublication} from './shopeeKitDraftStore.js';
import {composeKit} from './shopeeKitBuilder.js';
import {resolveKitShopeeComponents,kitShopeeOptions} from './shopeeKitPlatform.js';
import {kitPublishFields,kitPublishPayload,kitApprovalFingerprint,validatePublishedKitResponse} from './shopeeKitPublish.js';
import {signDiscountPreview,verifyDiscountPreview} from './shopeeDiscountPublish.js';
const pendingLocks=new Set(),media=new Map();
const key=(shop,kit)=>String(shop)+':'+String(kit);
async function checkedDraft(auth,kitSku){
 const stored=await loadKitDraft(auth.shopId,kitSku);
 if(!stored||!stored.kit||stored.kit.kitSku!==kitSku)
  throw Error('Salve e revise o kit antes de preparar a publicação.');
 if(stored.publication?.itemId||['publishing','uncertain','published_pending'].includes(stored.publication?.status))
  throw Error('Kit já enviado ou com resultado incerto; verifique o status antes de qualquer nova publicação.');
 const kit=await composeKit(auth.shopId,stored.skus,{
  marginPct:stored.kit.quote?.targetMarginPct,packing:stored.kit.packing,shipping:stored.kit.shipping
 });
 if(kit.kitSku!==kitSku||
  Math.abs(kit.kitCost-Number(stored.kit.kitCost))>.01||
  Math.abs(kit.quote.grossPrice-Number(stored.kit.quote.grossPrice))>.01)
  throw Error('Custo WeDrop ou preço do kit mudou desde o rascunho. Reabra, recalcule e salve antes de publicar.');
 return {stored,kit};
}
export async function kitUploadPhoto({cfg,auth,kitSku,base64,mime}){
 await checkedDraft(auth,kitSku);
 const raw=String(base64||'').replace(/^data:image\/(?:png|jpeg|webp);base64,/,'');
 if(!/^[a-zA-Z0-9+/=]+$/.test(raw)||raw.length>5_000_000||raw.length<200)
  throw Error('Imagem do kit inválida ou grande demais. Envie uma foto até 3,7 MB.');
 const data=Buffer.from(raw,'base64');
 const png=data.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10]));
 const jpeg=data[0]===255&&data[1]===216&&data[2]===255;
 const webp=data.toString('ascii',0,4)==='RIFF'&&data.toString('ascii',8,12)==='WEBP';
 if(!png&&!jpeg&&!webp)throw Error('Arquivo sem assinatura PNG/JPG/WebP válida.');
 const actual=png?'image/png':jpeg?'image/jpeg':'image/webp';
 if(actual!==mime)throw Error('Tipo de arquivo inconsistente.');
 const k=key(auth.shopId,kitSku),photos=media.get(k)||[];
 if(photos.length>=9)throw Error('Limite de nove fotos Shopee por kit.');
 const id=await createShopeeMediaApi(cfg,auth).image(data,actual);
 photos.push({imageId:id,uploadedAt:Date.now()});media.set(k,photos);
 return {imageId:id,count:photos.length,storedIn:'Shopee MediaSpace',
  note:'Imagem enviada somente à galeria de mídia Shopee. O kit ainda não foi publicado.'};
}
export async function kitPublicationReadiness({cfg,auth,kitSku}){
 const {stored,kit}=await checkedDraft(auth,kitSku);
 const [components,options]=await Promise.all([
  resolveKitShopeeComponents(cfg,auth,kit),
  kitShopeeOptions(cfg,auth)
 ]);
 return {kit,stored,linked:components.linked,blockers:[...components.blockers,...options.blockers],
  options,uploadedImageIds:(media.get(key(auth.shopId,kitSku))||[]).map(x=>x.imageId)};
}
export async function kitPublicationPreview({cfg,auth,kitSku,input,secret}){
 const ready=await kitPublicationReadiness({cfg,auth,kitSku});
 if(ready.blockers.length)throw Error('Publicação bloqueada: '+ready.blockers.join(' | '));
 const fields=kitPublishFields({...input,imageIds:ready.uploadedImageIds},ready.kit);
 if(!ready.options.channels.some(x=>Number(x.id)===fields.logisticId))
  throw Error('Canal logístico não habilitado na Shopee. Atualize a prévia.');
 const limit=ready.options.limits;
 if(limit?.item_name_length_limit?.max_limit&&
    fields.title.length>Number(limit.item_name_length_limit.max_limit))
  throw Error('Nome ultrapassa o limite da API Shopee.');
 if(limit?.component_count_limit_of_single_model){
  const x=limit.component_count_limit_of_single_model;
  if(ready.linked.length<Number(x.min_limit)||ready.linked.length>Number(x.max_limit))
   throw Error('Quantidade de componentes fora do limite do Kit Formal.');
 }
 if(fields.preorder){
  const p=limit?.dts_limit;
  const range=p?.days_to_ship_limit;
  if(p?.support_pre_order===false||
     (range&&(fields.days<range.min_limit||fields.days>range.max_limit)))
   throw Error('Prazo de pré-encomenda não permitido nesta categoria.');
 }
 const payload=kitPublishPayload(ready.kit,fields,ready.linked,{
  maxTitleLength:Number(limit?.item_name_length_limit?.max_limit||120)
 });
 // O título e a descrição aprovados devem ser idênticos aos do rascunho.
 if(fields.title!==ready.stored.creative.title||fields.description!==ready.stored.creative.description)
  throw Error('Salve o título e a descrição revisados antes de gerar a prévia final.');
 const fingerprint=kitApprovalFingerprint(ready.kit,fields,ready.linked);
 const token=signDiscountPreview({shopId:String(auth.shopId),kitSku,fingerprint,
  imageIds:fields.photoIds,linked:ready.linked},secret);
 return {token,kitSku,linked:ready.linked,
  payloadSummary:{
   title:payload.item_setting.item_name,
   descriptionLength:fields.description.length,
   skus:ready.linked.map(x=>x.supplierSku),
   gross:ready.kit.quote.grossPrice,
   promoAfterPublication:ready.kit.quote.marketplacePrice,
   couponAfterPromo:ready.kit.quote.afterCoupon,
   margin:ready.kit.quote.netMarginPct,
   weightKg:fields.weight,
   dimensions:fields.dimensions,logisticId:fields.logisticId,
   images:fields.photoIds.length,
   note:'A Shopee criará primeiro o kit com PREÇO BRUTO, sem aplicar descontos. A campanha será etapa posterior.'
  }};
}
export async function kitPublishApproved({cfg,auth,kitSku,input,token,secret}){
 const k=key(auth.shopId,kitSku);
 if(pendingLocks.has(k))throw Error('Publicação deste kit já está em andamento.');
 pendingLocks.add(k);
 try{
  const verified=verifyDiscountPreview(token,secret,auth.shopId);
  if(verified.kitSku!==kitSku)throw Error('Prévia pertence a outro kit.');
  const ready=await kitPublicationReadiness({cfg,auth,kitSku});
  if(ready.blockers.length)throw Error(ready.blockers.join(' | '));
  const fields=kitPublishFields({...input,imageIds:ready.uploadedImageIds},ready.kit);
  if(!ready.options.channels.some(x=>Number(x.id)===fields.logisticId))
   throw Error('Canal de envio mudou. Refaça a prévia.');
  const fingerprint=kitApprovalFingerprint(ready.kit,fields,ready.linked);
  if(fingerprint!==verified.fingerprint)
   throw Error('Imagem, preço, composição ou logística mudou. Refaça a prévia.');
  if(fields.title!==ready.stored.creative.title||fields.description!==ready.stored.creative.description)
   throw Error('Título ou descrição mudaram. Salve antes de publicar.');
  const payload=kitPublishPayload(ready.kit,fields,ready.linked,{
   maxTitleLength:Number(ready.options.limits?.item_name_length_limit?.max_limit||120)
  });
  await recordKitPublication(auth.shopId,kitSku,{status:'publishing',
   message:'Solicitação de criação autorizada; não repetir em caso de falha de rede.'});
  let response;
  try{
   response=await callShopeeShopApi(cfg,{
    path:'/api/v2/product/add_kit_item',method:'POST',
    accessToken:auth.accessToken,shopId:auth.shopId,body:payload
   });
  }catch(e){
   await recordKitPublication(auth.shopId,kitSku,{status:'uncertain',
    message:'Resposta da criação desconhecida: '+String(e.message).slice(0,230)});
   throw Error('A resposta da Shopee não foi confirmada. O kit pode ter sido criado. Verifique Meus Kits pelo SKU '+
     kitSku+' antes de tentar novamente. '+String(e.message).slice(0,160));
  }
  let itemId;
  try{itemId=validatePublishedKitResponse(response);}
  catch(e){
   await recordKitPublication(auth.shopId,kitSku,{status:'uncertain',
    message:'A API respondeu sem Item ID: '+String(e.message).slice(0,220)});
   throw Error('A Shopee respondeu sem confirmar Item ID. Verifique Meus Kits pelo SKU antes de tentar novamente.');
  }
  let status='published_pending',message='Kit criado com Item ID '+itemId+
   '. Aguardando confirmação de anúncio ativo para avançar ao desconto.';
  try{
   const live=await callShopeeShopApi(cfg,{
    path:'/api/v2/product/get_item_base_info',
    accessToken:auth.accessToken,shopId:auth.shopId,
    query:{item_id_list:[itemId]}
   });
   const found=(live.response?.item_list||[]).find(x=>String(x.item_id)===itemId);
   if(String(found?.item_status).toUpperCase()==='NORMAL'){
    status='published';message='Kit Formal criado e confirmado NORMAL na Shopee.';
   }
  }catch{}
  await recordKitPublication(auth.shopId,kitSku,{status,itemId,message});
  return {itemId,kitSku,status,message,discountApplied:false,
   discountNext:'Após confirmar NORMAL, prepare a campanha Minha Promoção separadamente.'};
 }finally{pendingLocks.delete(k);}
}
export async function checkKitPublication({cfg,auth,kitSku}){
 const saved=await loadKitDraft(auth.shopId,kitSku);
 if(!saved)throw Error('Kit não encontrado nos rascunhos.');
 let publication=saved.publication;
 if(!publication?.itemId)return {publication,manualCheckRequired:publication?.status==='uncertain'};
 if(publication.status==='published')return {publication,discountReady:true};
 const id=publication.itemId;
 const data=await callShopeeShopApi(cfg,{
  path:'/api/v2/product/get_item_base_info',
  accessToken:auth.accessToken,shopId:auth.shopId,
  query:{item_id_list:[id]}
 });
 const item=(data.response?.item_list||[]).find(x=>String(x.item_id)===String(id));
 if(item&&String(item.item_status).toUpperCase()==='NORMAL'){
  publication=await recordKitPublication(auth.shopId,kitSku,{status:'published',itemId:id,
   message:'Kit publicado confirmado pela API da Shopee.'});
 }
 return {publication,discountReady:publication?.status==='published'};
}
