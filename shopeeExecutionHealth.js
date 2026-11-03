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
 const imageReady=imgs.length===9&&expectedImages.every(x=>x.length>5);
 add('images',imageReady&&sameData(expectedImages,actualImages),
  !imageReady?'Nove imagens aprovadas não estão prontas ou vinculadas à SKU':
  'Conferir IDs e ordem das imagens publicadas no anúncio');
 const publishedVideo=video?.publication?.sha256&&video.publication.sha256===video.sha256?
  video.publication.video:null;
 const videoEvidence=publishedVideo?{...publishedVideo,phase:'ready'}:(
  job?.state==='verified'&&job.plan?.video?.sha256===video?.sha256?job.result?.video:null);
 const officialVideo=Boolean(video&&(
  (videoEvidence&&videoMatches(live,videoEvidence))||
  (job?.plan?.video?.sha256===video?.sha256&&
   videoPublishedAfterPlan(job.plan,live,job.result?.video))));
 add('video',officialVideo,reviewed('video')?'Vídeo aprovado ainda não corresponde ao vídeo publicado':'Vídeo ainda não aprovado para publicação');
 const title=String(review.draftTitle||'').normalize('NFC').replace(/\s+/g,' ').trim();
 add('seo',Boolean(title)&&
  title===String(live.item_name||'').normalize('NFC').replace(/\s+/g,' ').trim(),
  reviewed('seo')?'Título publicado não corresponde ao título aprovado':'Título SEO ainda não aprovado');
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
  try{fiscalOK=fieldsVerified({tax_info:compileTax(review.tax,live)},live);}
  catch(error){fiscalReason='Dados fiscais: '+String(error.message||error).slice(0,155);}
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
