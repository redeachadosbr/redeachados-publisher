// Auditoria do motor raiz: confirmação exige comparação de dados aprovados com leitura oficial.
// A falta de um check local não desfaz uma correspondência comprovada na Shopee.
import {compileAttributes,compileTax,fieldsVerified,sameData} from './shopeeStructuredFields.js';
import {videoMatches,videoPublishedAfterPlan} from './shopeeExecutionPlan.js';

export const ROOT_EXECUTION_STAGES=Object.freeze([
 ['images','01 · Imagens comerciais'],['video','02 · Vídeo'],
 ['seo','03 · Título SEO'],['description','04 · Descrição'],
 ['technical','05 · Ficha técnica'],['variants','06 · Variações'],
 ['fiscal','07 · Dados fiscais'],['discount','08 · Desconto'],
 ['final','09 · Conferência final']
]);

/**
 * A kit listing can already have a video published by the Seller Center,
 * while the Manager has no locally imported video SHA/task. This is an
 * existence audit, not permission to resend or replace a video.
 * Require the exact linked kit/sku/item and a playable official Shopee
 * listing video. A local approved upload, when present, still needs the
 * normal SHA/task readback comparison instead.
 */
export function verifiedExistingKitListingVideo({sku,itemId,review={},live={},manualVideo=null,job=null}={}){
 const link=review?.kitOptimization;
 if(!link?.kitSku||String(link.sku||link.mainSku||'')!==String(sku)||
    String(link.itemId||'')!==String(itemId)||
    String(live?.item_id||'')!==String(itemId)||manualVideo||
    job?.plan?.video)return false;
 const entries=Array.isArray(live.video_info)?live.video_info:
  live.video_info&&typeof live.video_info==='object'?[live.video_info]:[];
 return entries.some(entry=>{
  if(!entry||typeof entry!=='object')return false;
  const status=String(entry.video_status||entry.status||'').toUpperCase();
  if(/FAILED|REJECTED|CANCELLED|DELETED|TRANSCODING|PROCESSING|PENDING|WAITING/.test(status))
   return false;
  const raw=[entry.video_url,...(Array.isArray(entry.video_url_list)?
   entry.video_url_list.map(x=>typeof x==='string'?x:x?.video_url):[])];
  const validOfficialUrl=raw.some(value=>{
   try{
    const url=new URL(String(value||''));
    const host=url.hostname.toLowerCase();
    const shopeeHost=['.shopee.com.br','.shopee.com','.shopee.sg']
     .some(suffix=>host===suffix.slice(1)||host.endsWith(suffix));
    return url.protocol==='https:'&&shopeeHost&&
     url.pathname.length>5;;
   }catch{return false;}
  });
  const duration=Number(entry.duration??entry.video_duration);
  return validOfficialUrl&&Number.isFinite(duration)&&duration>0;
 });
}

export function auditRootShopeeExecution({
 sku,itemId,record={},review={},live={},images=[],video=null,models=null,
 discountReadback=null,job=null,checkedAt=new Date().toISOString()
}={}){
 const stages=review.stages||{},out=[];
 const add=(id,confirmed,reason,{notApplicable=false}={})=>{
  const label=ROOT_EXECUTION_STAGES.find(x=>x[0]===id)?.[1]||id;
  out.push({id,label,status:notApplicable?'not_applicable':confirmed?'confirmed':'pending',
   reason:String(reason).slice(0,220),confirmedBy:confirmed?'live_shopee_readback':null});
 };
 const identity=String(itemId||'')&&String(live.item_id||'')===String(itemId);
 if(!identity){
  for(const [id,label] of ROOT_EXECUTION_STAGES)
   out.push({id,label,status:'pending',reason:'Item ID ainda não confirmado pela API Shopee',confirmedBy:null});
  return {sku,itemId,checkedAt,complete:false,stages:out,pending:out.map(x=>x.id),jobState:job?.state||null};
 }
 const reviewed=id=>stages[id]?.reviewed===true;
 const imgs=Array.isArray(images)?images:[];
 const expectedImages=imgs.map(x=>String(x.shopee_image_id||''));
 const actualImages=Array.isArray(live.image?.image_id_list)?live.image.image_id_list.map(String):[];
 // A biblioteca manual pode não ter os image IDs após a publicação.
 // Recuperar somente IDs exatos do job da mesma SKU/Item ID e comparar
 // a ordem real no anúncio. O contador de uploads sozinho nunca comprova.
 const jobImages=job?.sku===sku&&String(job?.item_id)===String(itemId)&&
  Array.isArray(job?.result?.imageIds)?job.result.imageIds.map(String):[];
 const approvedJobImages=job?.plan?.images?.length===9&&jobImages.length===9&&
  job?.plan?.images?.every(x=>Boolean(x?.source||x?.url||x?.sha256||x?.shopee_image_id));
 const imageReady=imgs.length===9&&expectedImages.every(x=>x.length>5);
 const exactManualImages=imageReady&&sameData(expectedImages,actualImages);
 const exactJobImages=approvedJobImages&&sameData(jobImages,actualImages);
 add('images',exactManualImages||exactJobImages,
  exactJobImages?'Nove imagens do envio aprovado conferidas por ID e ordem na Shopee':
  !imageReady?'Nove imagens aprovadas não estão prontas ou vinculadas à SKU':
  'Conferir IDs e ordem das imagens publicadas no anúncio');
 const publishedVideo=video?.publication?.sha256&&video.publication.sha256===video.sha256?
  video.publication.video:null;
 const videoEvidence=publishedVideo?{...publishedVideo,phase:'ready'}:(
  job?.state==='verified'&&job.plan?.video?.sha256===video?.sha256?job.result?.video:null);
 const existingKitListingVideo=verifiedExistingKitListingVideo({
  sku,itemId,review,live,manualVideo:video,job
 });
 const officialVideo=Boolean(existingKitListingVideo||(video&&(
  (videoEvidence&&videoMatches(live,videoEvidence))||
  (job?.plan?.video?.sha256===video?.sha256&&
   videoPublishedAfterPlan(job.plan,live,job.result?.video)))));
 add('video',officialVideo,existingKitListingVideo?
  'Vídeo já publicado e confirmado pela leitura oficial do Item ID na Shopee; não reenviar.':
  reviewed('video')?'Vídeo aprovado ainda não corresponde ao vídeo publicado':
  'Vídeo ainda não aprovado para publicação');
 const title=String(review.draftTitle||'').normalize('NFC').replace(/\s+/g,' ').trim();
 add('seo',Boolean(title)&&
  title===String(live.item_name||'').normalize('NFC').replace(/\s+/g,' ').trim(),
  reviewed('seo')?'Título publicado não corresponde ao título aprovado':'Título SEO ainda não aprovado');
 const titleStage=out.at(-1);
 titleStage.currentValue=String(live.item_name||'');
 titleStage.expectedValue=title;
 titleStage.retryable=titleStage.status==='pending'&&reviewed('seo')&&Boolean(title);
 if(titleStage.status==='pending'){
  const deferred=job?.plan?.deferredStages?.find(x=>x.stage==='seo');
  if(deferred?.reason)titleStage.reason+=' · Última preparação: '+String(deferred.reason).slice(0,180);
 }
 const description=String(review.draftDescription||'').replace(/\r\n?/g,'\n').trim();
 add('description',Boolean(description)&&
  description===String(live.description||'').replace(/\r\n?/g,'\n').trim(),
  reviewed('description')?'Descrição publicada difere da versão aprovada':'Descrição ainda não aprovada');
 let technicalOK=false,technicalReason='Ficha técnica não aprovada ou divergente';
 if(Array.isArray(review.attributes)&&review.attributes.length){
  try{
   const compiled=compileAttributes(review.attributes,record,live);
   technicalOK=fieldsVerified({attribute_list:compiled},live);
   technicalReason='Atributos publicados diferem dos atributos aprovados';
  }catch(error){technicalReason='Ficha técnica: '+String(error.message||error).slice(0,150);}
 }
 add('technical',technicalOK,technicalReason);
 const hasVariants=review.variationConfig?.enabled===true||live.has_model===true;
 if(!hasVariants)add('variants',false,'SKU sem variações', {notApplicable:true});
 else{
  const opts=review.variationDetails?.options||[];
  const actual=Array.isArray(models)?models:[];
  // Uma quantidade semelhante de modelos não comprova variações corretas.
  const expectedSkus=opts.map(x=>String(x.sku||'').trim()).filter(Boolean).sort();
  const actualSkus=actual.map(x=>String(x.model_sku||x.sku||'').trim()).filter(Boolean).sort();
  const same=opts.length>=2&&
   expectedSkus.length===opts.length&&actualSkus.length===opts.length&&
   sameData(expectedSkus,actualSkus);
  add('variants',same,'Modelos/SKUs das variações ainda não foram confirmados na Shopee');
 }
 let fiscalOK=false,fiscalReason='Dados fiscais não aprovados ou divergentes';
 if(review.tax){
  try{
   const expected=compileTax(review.tax,live);
   fiscalOK=fieldsVerified({tax_info:expected},live);
   // Um rascunho com apenas NCM/Origem nao pode marcar o KIT como
   // fiscalmente concluido quando CFOP, CSOSN e unidade estao vazios.
   // Validar ambas as fontes: revisao da SKU e leitura REAL da Shopee.
   if(review.kitOptimization?.kitSku){
    const required=[
     ['ncm','NCM'],['origin','Origem'],
     ['same_state_cfop','CFOP mesmo estado'],
     ['diff_state_cfop','CFOP outros estados'],
     ['csosn','CSOSN'],['measure_unit','Unidade de Medida']
    ];
    const missingReview=required.filter(([key])=>
     !String(review.tax?.[key]??'').trim()).map(([,label])=>label);
    const missingLive=required.filter(([key])=>
     !String(live.tax_info?.[key]??'').trim()).map(([,label])=>label);
    if(missingReview.length||missingLive.length){
     fiscalOK=false;
     fiscalReason=(missingReview.length?'Rascunho fiscal sem '+missingReview.join(', ')+'. ':'')+
      (missingLive.length?'Campos vazios na Shopee: '+missingLive.join(', '):'');
    }
   }
  }catch(error){fiscalReason='Dados fiscais: '+String(error.message||error).slice(0,155);}
 }
 add('fiscal',fiscalOK,fiscalReason);
 add('discount',discountReadback===true,
  discountReadback===null?(review.kitDiscountPreview?.status==='prepared'?
   'Desconto sem confirmação: prévia preparada, mas a campanha ainda não foi conferida pela Shopee.':
   'Desconto ainda não verificado: informe a campanha Minha Promoção e confira o preço promocional na Shopee; não presumir que não foi executado.'):
   'Promoção atual não corresponde à campanha aprovada');
 // Associar a última falha ao estágio preciso, sem apagar confirmações
 // já obtidas pela leitura oficial e sem tentar uma segunda escrita incerta.
 const phases={
  images_upload:'images',video_upload:'video',video_processing:'video',
  video_attach_ready:'video',video_attach_updating:'video',video_attach_verifying:'video',
  updating:null,verifying:null,
  variation_ready:'variants',variation_updating:'variants',variation_verifying:'variants',
  fiscal_ready:'fiscal',fiscal_updating:'fiscal',fiscal_verifying:'fiscal',
  discount_ready:'discount',discount_updating:'discount',discount_verifying:'discount',
  kit_discount_ready:'discount',kit_discount_updating:'discount',kit_discount_verifying:'discount'
 };
 if(['failed','uncertain'].includes(job?.state)){
  const phase=String(job?.result?.phase||'');
  let affected=phases[phase]||null;
  if(/video task not found|video_upload_id.*(?:not found|invalid|illegal)/i.test(String(job.last_error||'')))affected='video';
  if(!affected&&/^model_discount_|^discount_|^kit_discount_/.test(phase))affected='discount';
  if(!affected&&/^variation_/.test(phase))affected='variants';
  if(!affected&&/^fiscal_/.test(phase))affected='fiscal';
  if(!affected&&/^video_/.test(phase))affected='video';
  if(!affected&&/^images_/.test(phase))affected='images';
  const selected=affected?out.filter(x=>x.id===affected):out.filter(x=>
   x.status==='pending'&&((job.plan?.actions||[]).some(a=>
    ({images:'images',video:'video',item_name:'seo',description:'description',
      attribute_list:'technical',model_variations:'variants',tax_info:'fiscal',
      kit_discount:'discount',discount:'discount'}[a]||a)===x.id)));
  for(const row of selected){
   if(row.status==='confirmed'||row.status==='not_applicable')continue;
   row.status=job.state==='uncertain'?'uncertain':'failed';
   row.reason=(job.state==='uncertain'?'Resultado incerto: ':'Falha na execução: ')+
    String(job.last_error||'etapa sem confirmação oficial').slice(0,150);
  }
 }
 const missing=out.filter(x=>!['confirmed','not_applicable'].includes(x.status));
 const complete=missing.length===0&&out.length===8&&
  !['running','uncertain'].includes(job?.state);
 add('final',complete,complete?'Todas as etapas aplicáveis conferidas no anúncio e na promoção':
  'Conferência final bloqueada: '+missing.map(x=>x.label).join(', ').slice(0,165));
 return {sku,itemId,checkedAt,complete,stages:out,
  pending:out.filter(x=>!['confirmed','not_applicable'].includes(x.status)).map(x=>x.id),
  jobState:job?.state||null,latestJobPartial:Boolean(job?.plan?.selectedStage&&job.plan.selectedStage!=='all'),
  lastJobError:job?.last_error?String(job.last_error).slice(0,250):null};
}
