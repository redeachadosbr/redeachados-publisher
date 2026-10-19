import {assertLiveShopeeUnchanged,verifyShopeeExecution} from './shopeeExecutionPlan.js';
import {advanceVideoUpload} from './shopeeMediaApi.js';
import {withExecutionEvent} from './shopeeExecutionProgress.js';
// One durable step per lease. No tokens or secret configuration are persisted.
export async function advanceShopeeExecution(job,io){
 const plan=job.plan,result={...(job.result||{})};
 if(!plan?.requiresExplicitConfirmation||!plan.canExecute)throw Error('Plano sem aprovação válida.');
 if(['updating','verifying'].includes(result.phase)){
  const live=await io.read();
  if(verifyShopeeExecution(plan,live,result))return {state:'verified',result:withExecutionEvent({...result,phase:'verified',verified:true},'verified','A Shopee confirmou as alterações no anúncio.','success'),lastError:null};
  if(Date.now()-Number(result.updateStartedAt||0)>90000)
    return {state:'uncertain',result:withExecutionEvent(result,'verify-timeout','A conferência da Shopee excedeu o tempo esperado.','warning'),lastError:'A Shopee ainda não confirmou todos os campos. Use Conferir resultado.'};
  return {state:'running',result:{...result,phase:'verifying'},delay:5000};
 }
 await io.validateIdentity();
 assertLiveShopeeUnchanged(plan,await io.read());
 if(plan.images?.length&&(result.imageIds||[]).length<plan.images.length){
  const index=(result.imageIds||[]).length,asset=plan.images[index];
  const file=await io.downloadImage(asset);
  const id=await io.media.image(file,asset.mime_type);
  const current=[...(result.imageIds||[]),id];
  return {state:'running',result:withExecutionEvent({...result,phase:'images_upload',imageIds:current},
   'image-'+current.length,'Imagem '+current.length+' de '+plan.images.length+' enviada à biblioteca de mídia da Shopee.','success'),delay:500};
 }
 if(plan.video&&result.video?.phase!=='ready'){
  const file=await io.download(plan.video);
  result.video=await advanceVideoUpload({state:result.video,file,api:io.media});
  const status=result.video.phase==='processing'?'video_processing':'video_upload';
  const labeled=status==='video_processing'?'Vídeo enviado; aguardando processamento pela Shopee.':'Enviando vídeo para a Shopee.';
  return {state:'running',result:withExecutionEvent({...result,phase:status},status,labeled),
   delay:status==='video_processing'?10000:500};
 }
 // Persist intent before the external write. A crash resumes readback only.
 result.phase='updating';result.updateStartedAt=Date.now();
 const checkpoint=withExecutionEvent(result,'update-request','Enviando alteração aprovada para o anúncio.');
 await io.beforeWrite(checkpoint);
 try{
  const response=await io.update({item_id:Number(plan.itemId),...plan.proposed,
    ...(plan.images?.length?{image:{image_id_list:result.imageIds}}:{}),
    ...(plan.video?{video_upload_id:[result.video.id]}:{})});
  result.requestId=String(response?.request_id||'').slice(0,100);
  result.phase='verifying';
  Object.assign(result,withExecutionEvent({...checkpoint,phase:'verifying',requestId:result.requestId},
   'update-accepted','A API recebeu a solicitação. Conferindo dados do anúncio.'));
 }catch(e){
  // HTTP/network errors do not prove the write failed.
  return {state:'uncertain',result:withExecutionEvent(checkpoint,'update-uncertain','A atualização não teve confirmação conclusiva.','warning'),lastError:'Atualização sem confirmação: '+String(e.message||e).slice(0,200)};
 }
 return {state:'running',result,delay:1000};
}
