import test from 'node:test';
import assert from 'node:assert/strict';
import {advanceShopeeExecution} from '../shopeeExecutionWorker.js';
import {shopeeExecutionProgress} from '../shopeeExecutionProgress.js';

const itemId='58272083884';
const oldImageIds=Array.from({length:6},(_,i)=>'antiga-'+i);
const newImageIds=Array.from({length:9},(_,i)=>'nova-'+i);
const video={phase:'ready',id:'br-video-task-rejected',videoInfo:{video_url_list:[]}};
const plan={
 itemId,sku:'TRC0413',modelId:'0',requiresExplicitConfirmation:true,canExecute:true,
 selectedStage:'all',images:newImageIds.map((id,i)=>({slot:i+1,sha256:'a'.repeat(64),shopee_image_id:id})),
 video:{filename:'escova.mp4',sha256:'b'.repeat(64)},
 proposed:{item_name:'Kit Escova Giratória com 3 Cabeçotes'},
 original:{item_name:'Nome antigo',description:'Texto antigo',description_type:'normal',
  video_info:[],image:{image_id_list:oldImageIds},category_id:33,tax_info:{},attribute_list:[]}
};
const live=(published=false)=>({
 item_id:Number(itemId),item_status:'NORMAL',item_name:published?plan.proposed.item_name:'Nome antigo',
 description:'Texto antigo',description_type:'normal',video_info:[],category_id:33,
 image:{image_id_list:published?newImageIds:oldImageIds},tax_info:{},attribute_list:[]
});
const baseResult=(phase='queued')=>({phase,imageIds:newImageIds,video,startedAt:new Date().toISOString()});
const job=(phase='queued',result=baseResult(phase))=>({sku:'TRC0413',item_id:Number(itemId),state:'running',plan,result});

test('atualiza fotos e conteúdo SEM enviar video_upload_id que rejeitava todo o lote',async()=>{
 const writes=[],checkpoints=[];
 const io={
  read:async()=>live(),validateIdentity:async()=>{},
  beforeWrite:async x=>{checkpoints.push(x.phase);},
  update:async body=>{writes.push(body);return {request_id:'x'};}
 };
 const out=await advanceShopeeExecution(job(),io);
 assert.equal(out.state,'running');
 assert.equal(out.result.phase,'verifying');
 assert.equal(writes.length,1);
 assert.equal(writes[0].item_id,Number(itemId));
 assert.equal(writes[0].item_name,plan.proposed.item_name);
 assert.deepEqual(writes[0].image.image_id_list,newImageIds);
 assert.ok(!Object.hasOwn(writes[0],'video_upload_id'));
 assert.deepEqual(checkpoints,['updating']);
});
test('readback oficial confirma fotos e texto ANTES de anexar vídeo, sem reenvios',async()=>{
 const io={read:async()=>live(true),update:async()=>{throw Error('Não enviar novamente');}};
 const out=await advanceShopeeExecution(job('verifying',baseResult('verifying')),io);
 assert.equal(out.state,'running');
 assert.equal(out.result.phase,'video_attach_ready');
 assert.equal(out.result.contentVerified,true);
 const view=shopeeExecutionProgress({...job('video_attach_ready',out.result),state:'running'});
 assert.equal(view.imagesPublished,9);
 assert.equal(view.videoPublished,false);
 assert.equal(view.steps.find(x=>x.id==='images').status,'done');
 assert.notEqual(view.steps.find(x=>x.id==='video').status,'done');
});
test('tarefa de vídeo rejeitada afeta só vídeo e não tenta atualizar fotos/textos outra vez',async()=>{
 const writes=[],checkpoints=[];
 const result={...baseResult('video_attach_ready'),contentVerified:true};
 const io={read:async()=>live(true),validateIdentity:async()=>{},
  beforeWrite:async x=>checkpoints.push(x.phase),
  update:async body=>{writes.push(body);throw Error('product.error_busi: external system business error : video task not found');}};
 const out=await advanceShopeeExecution(job('video_attach_ready',result),io);
 assert.equal(out.state,'failed');
 assert.equal(out.result.videoRejected,true);
 assert.match(out.lastError,/video task not found/);
 assert.equal(writes.length,1);
 assert.deepEqual(Object.keys(writes[0]).sort(),['item_id','video_upload_id']);
 assert.deepEqual(checkpoints,['video_attach_updating']);
 const progress=shopeeExecutionProgress({...job('video_attach_updating',out.result),state:'failed',last_error:out.lastError});
 assert.equal(progress.imagesPublished,9);
 assert.equal(progress.videoPublished,false);
 assert.equal(progress.steps.find(x=>x.id==='video').status,'attention');
 assert.notEqual(progress.steps.find(x=>x.id==='seo').status,'attention');
 assert.match(progress.message,/Vídeo rejeitado/);
});
test('a etapa de confirmação incerta não repete uma escrita do vídeo',async()=>{
 const res={...baseResult('video_attach_verifying'),contentVerified:true,videoAttachStartedAt:Date.now()};
 let writes=0;
 const out=await advanceShopeeExecution(job('video_attach_verifying',res),{
  read:async()=>live(true),update:async()=>{writes++;throw Error('Unexpected write');}
 });
 assert.equal(writes,0);
 assert.equal(out.state,'running');
 assert.equal(out.result.phase,'video_attach_verifying');
});

test('etapa SOMENTE VÍDEO sem mídia pronta inicia upload, não vínculo com ID inexistente',async()=>{
 const videoPlan={...plan,selectedStage:'video',images:[],proposed:{}};
 const videoJob={state:'running',plan:videoPlan,result:{phase:'queued',startedAt:new Date().toISOString()}};
 let uploadStarts=0,attachWrites=0;
 const out=await advanceShopeeExecution(videoJob,{
  read:async()=>live(),validateIdentity:async()=>{},
  download:async()=>Buffer.from('arquivo.mp4'),
  media:{init:async()=>{uploadStarts++;return {video_upload_id:'new-video-task'};}},
  update:async()=>{attachWrites++;throw Error('Vídeo não pronto');}
 });
 assert.equal(uploadStarts,1);
 assert.equal(attachWrites,0);
 assert.equal(out.state,'running');
 assert.equal(out.result.video.id,'new-video-task');
 assert.equal(out.result.phase,'video_upload');
});
