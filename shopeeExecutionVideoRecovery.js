import {sameData} from './shopeeStructuredFields.js';
import {videoPublishedAfterPlan,verifyShopeeExecution} from './shopeeExecutionPlan.js';
import {withExecutionEvent} from './shopeeExecutionProgress.js';

export const isMissingVideoTask=value=>/video task not found|video_upload_id.*(?:not found|invalid|illegal)/i.test(String(value||''));
export function hasRejectedShopeeVideo(job){
 return Boolean(job?.plan?.video)&&job.result?.videoReadbackConfirmed!==true&&
  (job.result?.videoRejected===true||isMissingVideoTask(job.last_error)||isMissingVideoTask(job.result?.videoError));
}

// Only a definitive task rejection permits a fresh upload. Never retry a
// timeout/unknown listing write or replace a video changed by another session.
export function prepareRejectedVideoRetry(job,live,{explicit=false}={}){
 const plan=job?.plan,result=job?.result||{};
 if(!plan?.requiresExplicitConfirmation||!plan.canExecute||!hasRejectedShopeeVideo(job))
  throw Error('Não existe falha de vídeo autorizada para retomar.');
 if(!isMissingVideoTask(result.videoError||job.last_error))
  throw Error('O motivo da falha do vídeo requer conferência antes de reenviar.');
 if(!verifyShopeeExecution({...plan,video:null},live,result))
  throw Error('Conteúdo diverge do plano; o vídeo não será reenviado.');
 if(videoPublishedAfterPlan(plan,live,result.video))
  throw Error('O vídeo já está publicado; não iniciar outro upload.');
 if(!sameData(live.video_info||[],plan.original?.video_info||[])||
   (live.item_status&&!['NORMAL','UNLIST'].includes(live.item_status)))
  throw Error('Vídeo ou situação do anúncio mudou; confira antes de retomar.');
 const attempts=Number(result.videoRetryCount||0);
 if(attempts>=(explicit?2:1))throw Error('A nova tarefa de vídeo também foi recusada. Confira o erro antes de tentar novamente.');
 return withExecutionEvent({...result,phase:'video_retry_upload',video:null,
  videoRetryCount:attempts+1,videoRejected:true,videoReadbackConfirmed:false,
  videoExactReadbackConfirmed:false,verified:false,
  rejectedVideoIds:[...new Set([...(result.rejectedVideoIds||[]),result.video?.id].filter(Boolean))],
  videoAttachStartedAt:null,videoAttachRequestId:null},
  'video-retry-'+(attempts+1),'Recuperando o arquivo aprovado e iniciando uma nova tarefa de vídeo.','info');
}


/** Reconnect an already transcoded upload after product.update_item rejection.
 * Exactly one explicit relink per upload ID, without re-uploading its bytes.
 * A stored SUCCEEDED state is rechecked with Shopee before the next write.
 */
export function prepareRejectedVideoRelink(job,live){
 const plan=job?.plan,result=job?.result||{};
 if(!plan?.requiresExplicitConfirmation||!plan.canExecute||!hasRejectedShopeeVideo(job)||
    !isMissingVideoTask(result.videoError||job.last_error))
  throw Error('A falha do vídeo não autoriza reconexão automática.');
 if(!result.video?.id||result.video.phase!=='ready')
  throw Error('Não existe vídeo processado salvo para reconectar.');
 if(Number(result.videoRelinkCount||0)>=1)
  throw Error('A Shopee recusou também a reconexão do vídeo processado. Não faça outro upload. Abra chamado com o request_id apresentado no histórico.');
 if(!verifyShopeeExecution({...plan,video:null},live,result))
  throw Error('Conteúdo mudou na Shopee; nenhuma atualização de vídeo foi enviada.');
 if(videoPublishedAfterPlan(plan,live,result.video))
  throw Error('O vídeo já consta no anúncio; nenhuma atualização necessária.');
 if(!sameData(live.video_info||[],plan.original?.video_info||[])||
   (live.item_status&&!['NORMAL','UNLIST'].includes(live.item_status)))
  throw Error('O anúncio foi alterado. Confira antes de vincular qualquer mídia.');
 return withExecutionEvent({...result,phase:'video_attach_wait_propagation',
  videoRelinkCount:Number(result.videoRelinkCount||0)+1,videoRelinkAt:Date.now(),
  videoAttachStartedAt:null,videoAttachRequestId:null,verified:false},
  'video-relink-'+(Number(result.videoRelinkCount||0)+1),
  'Reconectando o vídeo já processado. Aguardando sincronização Shopee sem fazer outro upload.','info');
}

// A later fiscal/discount success cannot erase an unresolved video rejection.
export function guardRejectedVideoCompletion(out,plan){
 if(out?.state!=='verified'||!hasRejectedShopeeVideo({plan,result:out.result,last_error:out.lastError}))return out;
 const reason=String(out.result?.videoError||out.lastError||'Vídeo não confirmado no anúncio.');
 return {...out,state:'failed',result:withExecutionEvent({...out.result,
  phase:'video_attach_rejected',verified:false,videoRejected:true},
  'video-final-pending','Vídeo pendente. As demais etapas confirmadas foram preservadas.','warning'),
  lastError:'Vídeo pendente: '+reason};
}
