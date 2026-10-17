import crypto from 'node:crypto';
import {callShopeeShopApi,callShopeePublicMediaApi} from './shopee.js';
export const VIDEO_PART_SIZE=4*1024*1024;
export const md5=buffer=>crypto.createHash('md5').update(buffer).digest('hex');
export function createShopeeMediaApi(cfg,auth){
 const common={accessToken:auth.accessToken,shopId:auth.shopId};
 return {
  image:async(file,mime)=>{
   const form=new FormData();form.set('image',new Blob([file],{type:mime}),'image.'+(mime==='image/png'?'png':'jpg'));
   form.set('scene','normal');
   const result=await callShopeePublicMediaApi(cfg,{path:'/api/v2/media_space/upload_image',form});
   const first=result.response?.image_info_list?.[0];
   if(first?.error)throw Error('Imagem recusada pela Shopee: '+String(first.message||first.error).slice(0,160));
   const id=first?.image_info?.image_id||result.response?.image_info?.image_id;
   if(!id)throw Error('A Shopee não retornou o ID da imagem.');
   return String(id);
  },
  init:async file=>(await callShopeeShopApi(cfg,{...common,
   path:'/api/v2/media_space/init_video_upload',method:'POST',
   body:{file_md5:md5(file),file_size:file.length}})).response,
  part:async(id,seq,file)=>{
   const form=new FormData();
   form.set('video_upload_id',id);form.set('part_seq',String(seq));form.set('content_md5',md5(file));
   form.set('part_content',new Blob([file],{type:'application/octet-stream'}),'part.bin');
   return callShopeePublicMediaApi(cfg,{path:'/api/v2/media_space/upload_video_part',form});
  },
  complete:(id,sequences,cost)=>callShopeePublicMediaApi(cfg,{
   path:'/api/v2/media_space/complete_video_upload',body:{video_upload_id:id,
    part_seq_list:sequences,report_data:{upload_cost:Math.max(0,Math.floor(cost))}}}),
  result:async id=>(await callShopeeShopApi(cfg,{...common,
   path:'/api/v2/media_space/get_video_upload_result',query:{video_upload_id:id}})).response
 };
}
// Bounded work: each pass performs at most one upload part or one poll.
// The caller persists the returned state before the next step.
export async function advanceVideoUpload({state={},file,api,now=Date.now()}){
 if(!state.id){
  const started=await api.init(file);
  if(!started?.video_upload_id)throw Error('A Shopee não retornou o identificador do upload.');
  return {id:String(started.video_upload_id),nextPart:0,phase:'uploading',startedAt:now};
 }
 if(state.phase==='ready')return state;
 const count=Math.ceil(file.length/VIDEO_PART_SIZE);
 if(state.nextPart<count){
  const seq=state.nextPart||0;
  await api.part(state.id,seq,file.subarray(seq*VIDEO_PART_SIZE,Math.min(file.length,(seq+1)*VIDEO_PART_SIZE)));
  return {...state,nextPart:seq+1,phase:'uploading',totalParts:count};
 }
 if(state.phase==='uploading'){
  // The completion may have reached Shopee even if its response was lost.
  const current=await api.result(state.id);
  if(current?.status==='INITIATED'){
   await api.complete(state.id,Array.from({length:count},(_,i)=>i),now-state.startedAt);
   return {...state,phase:'processing',processingAt:now};
  }
  return videoResult(state,current,now);
 }
 return videoResult(state,await api.result(state.id),now);
}
function videoResult(state,data,now){
 if(data?.status==='SUCCEEDED')return {...state,phase:'ready',videoInfo:data.video_info||{},readyAt:now};
 if(['FAILED','CANCELLED'].includes(data?.status))throw Error('Vídeo recusado pela Shopee: '+String(data.message||data.status).slice(0,180));
 if(!['INITIATED','TRANSCODING','PROCESSING','UPLOADED'].includes(data?.status))
  throw Error('A Shopee retornou um status de processamento desconhecido.');
 if(now-(state.processingAt||state.startedAt)>30*60*1000)throw Error('Processamento excedeu 30 minutos. Consulte a Shopee e prepare novamente.');
 return {...state,phase:'processing',processingAt:state.processingAt||now};
}
