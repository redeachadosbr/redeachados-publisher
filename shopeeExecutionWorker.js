import {assertLiveShopeeUnchanged,verifyShopeeExecution} from './shopeeExecutionPlan.js';
import {advanceVideoUpload} from './shopeeMediaApi.js';
// One durable step per lease. No tokens or secret configuration are persisted.
export async function advanceShopeeExecution(job,io){
 const plan=job.plan,result={...(job.result||{})};
 if(!plan?.requiresExplicitConfirmation||!plan.canExecute)throw Error('Plano sem aprovação válida.');
 if(['updating','verifying'].includes(result.phase)){
  const live=await io.read();
  if(verifyShopeeExecution(plan,live,result))return {state:'verified',result:{...result,phase:'verified',verified:true},lastError:null};
  if(Date.now()-Number(result.updateStartedAt||0)>90000)
    return {state:'uncertain',result,lastError:'A Shopee ainda não confirmou todos os campos. Use Conferir resultado.'};
  return {state:'running',result:{...result,phase:'verifying'},delay:5000};
 }
 await io.validateIdentity();
 assertLiveShopeeUnchanged(plan,await io.read());
 if(plan.images?.length&&(result.imageIds||[]).length<plan.images.length){
  const index=(result.imageIds||[]).length,asset=plan.images[index];
  const file=await io.downloadImage(asset);
  const id=await io.media.image(file,asset.mime_type);
  return {state:'running',result:{...result,phase:'images_upload',imageIds:[...(result.imageIds||[]),id]},delay:500};
 }
 if(plan.video&&result.video?.phase!=='ready'){
  const file=await io.download(plan.video);
  result.video=await advanceVideoUpload({state:result.video,file,api:io.media});
  return {state:'running',result:{...result,phase:result.video.phase==='processing'?'video_processing':'video_upload'},
   delay:result.video.phase==='processing'?10000:500};
 }
 // Persist intent before the external write. A crash resumes readback only.
 result.phase='updating';result.updateStartedAt=Date.now();
 await io.beforeWrite(result);
 try{
  const response=await io.update({item_id:Number(plan.itemId),...plan.proposed,
    ...(plan.images?.length?{image:{image_id_list:result.imageIds}}:{}),
    ...(plan.video?{video_upload_id:[result.video.id]}:{})});
  result.requestId=String(response?.request_id||'').slice(0,100);
  result.phase='verifying';
 }catch(e){
  // HTTP/network errors do not prove the write failed.
  return {state:'uncertain',result,lastError:'Atualização sem confirmação: '+String(e.message||e).slice(0,200)};
 }
 return {state:'running',result,delay:1000};
}
