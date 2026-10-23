import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {shopeeExecutionProgress,withExecutionEvent} from '../shopeeExecutionProgress.js';
import {advanceShopeeExecution} from '../shopeeExecutionWorker.js';

const plan={shopId:1,sku:'TRC1525',itemId:'555555',modelId:'0',requiresExplicitConfirmation:true,
 canExecute:true,images:Array.from({length:9},(_,i)=>({slot:i+1})),video:{filename:'video.mp4'},proposed:{
  item_name:'Piscina azul'},
 original:{item_name:'Piscina antiga',description:'Atual',description_type:'normal',
  category_id:1001,video_info:[],attribute_list:[],tax_info:{},image:{image_id_list:[]}}
};
const job=(state,phase,result={})=>({state,sku:'TRC1525',item_id:'555555',
 updated_at:'2026-10-19T19:20:00.000Z',plan,
 result:{phase,startedAt:'2026-10-19T19:10:00.000Z',...result},last_error:null});

test('nenhum dado ilustrativo vira horário, imagem ou histórico inventado',()=>{
 const pending=shopeeExecutionProgress({state:'prepared',plan,result:null,updated_at:'2026-10-19T18:59:00.000Z'});
 assert.equal(pending.hasStarted,false);
 assert.equal(pending.startedAt,null);
 assert.deepEqual(pending.events,[]);
 assert.equal(pending.percent,0);
});
test('nova prévia recupera mídia e vídeo enviados sem afirmar que já publicou',()=>{
 const resumed={...plan,reusedMedia:{imageIds:Array.from({length:9},(_,i)=>'media-'+i),
  video:{phase:'ready',id:'uploaded-video'}}};
 const before=shopeeExecutionProgress({state:'prepared',plan:resumed,result:null});
 assert.equal(before.hasStarted,false);
 assert.equal(before.hasSavedProgress,true);
 assert.equal(before.resumable,true);
 assert.equal(before.imagesUploaded,9);
 assert.equal(before.videoReady,true);
 assert.equal(before.imagesPublished,0);
 assert.equal(before.videoPublished,false);
 assert.equal(before.startedAt,null);
 assert.equal(before.steps[1].status,'done');
 assert.equal(before.steps[2].status,'done');
 assert.equal(before.steps[3].status,'waiting');
 assert.ok(before.percent>0&&before.percent<100);
 const after=shopeeExecutionProgress({state:'running',plan:resumed,
  result:{phase:'queued',...resumed.reusedMedia}});
 assert.equal(after.percent,before.percent);
 assert.equal(after.imagesUploaded,before.imagesUploaded);
});
test('worker retoma após mídia salva sem novo upload de imagem ou vídeo',async()=>{
 let updates=0;
 const saved={...job('running','queued'),result:{phase:'queued',
  imageIds:Array.from({length:9},(_,i)=>'media-'+i),video:{phase:'ready',id:'uploaded-video'}}};
 const denied=()=>{throw Error('Mídia já enviada não deve ser reenviada');};
 const next=await advanceShopeeExecution(saved,{
  validateIdentity:async()=>{},read:async()=>({item_id:555555,item_status:'NORMAL',...plan.original}),
  downloadImage:denied,download:denied,media:{image:denied},beforeWrite:async()=>{},
  update:async payload=>{updates++;assert.deepEqual(payload.image.image_id_list,saved.result.imageIds);
   assert.deepEqual(payload.video_upload_id,['uploaded-video']);return {request_id:'fixture'};}
 });
 assert.equal(updates,1);
 assert.equal(next.result.phase,'verifying');
});
test('status mostra 2 de 9 na mídia, nunca como imagens já publicadas',()=>{
 const progress=shopeeExecutionProgress(job('running','images_upload',{imageIds:['a','b']}));
 assert.equal(progress.imagesUploaded,2);
 assert.equal(progress.imagesTotal,9);
 assert.equal(progress.imagesPublished,0);
 assert.equal(progress.imagePercent,22);
 assert.match(progress.message,/biblioteca|mídia Shopee|mídia/i);
 assert.match(progress.message,/anúncio ainda não atualizado/i);
 assert.equal(progress.steps[0].status,'done');
 assert.equal(progress.steps[1].status,'active');
 assert.equal(progress.steps[2].status,'waiting');
 assert.equal(progress.verified,false);
 assert.ok(progress.percent<100);
});
test('9 mídias enviadas passam a concluído mas anúncio só finaliza com readback da Shopee',()=>{
 const done=shopeeExecutionProgress(job('running','images_upload',{imageIds:Array(9).fill('id')}));
 assert.equal(done.steps[1].status,'done');
 assert.equal(done.verified,false);
 assert.ok(done.percent<100);
 const checking=shopeeExecutionProgress(job('running','verifying',{
  imageIds:Array(9).fill('id'),video:{phase:'ready',id:'upload-id'}}));
 assert.equal(checking.steps[3].status,'done');
 assert.equal(checking.steps[4].status,'active');
 assert.equal(checking.steps[5].status,'waiting');
 assert.equal(checking.percent<100,true);
});
test('somente leitura verificada chega a 100%, erros preservam atenção sem conclusão',()=>{
 const verified=shopeeExecutionProgress(job('verified','verified',{
  imageIds:Array(9).fill('id'),video:{phase:'ready'},verified:true}));
 assert.equal(verified.percent,100);
 assert.equal(verified.imagesPublished,9);
 assert.equal(verified.videoPublished,true);
 assert.equal(verified.steps[5].status,'done');
 assert.equal(verified.verified,true);
 const failed=shopeeExecutionProgress({...job('uncertain','verifying',{imageIds:Array(9).fill('id')}),
  last_error:'Resposta da Shopee ainda não confirmada'});
 assert.equal(failed.verified,false);
 assert.equal(failed.attention,true);
 assert.equal(failed.steps[4].status,'attention');
 assert.ok(failed.percent<100);
});
test('etapas não incluídas no plano não são mostradas como pendentes',()=>{
 const lean={...plan,images:[],video:null};
 const progress=shopeeExecutionProgress({...job('running','updating'),plan:lean});
 assert.equal(progress.steps[1].status,'skipped');
 assert.equal(progress.steps[2].status,'skipped');
 assert.equal(progress.steps[3].status,'active');
});
test('eventos persistidos têm carimbo de hora, evitam duplicidade e guardam histórico limitado',()=>{
 let result={phase:'queued'};
 result=withExecutionEvent(result,'queued','Processo iniciado');
 const first=result.events[0];
 result=withExecutionEvent(result,'queued','Processo iniciado');
 assert.equal(result.events.length,1);
 assert.equal(first.label,'Processo iniciado');
 assert.ok(!Number.isNaN(Date.parse(first.at)));
 for(let i=0;i<35;i++)result=withExecutionEvent(result,'step-'+i,'Etapa '+i,'success');
 assert.equal(result.events.length,30);
 const progress=shopeeExecutionProgress(job('running','images_upload',result));
 assert.equal(progress.events[0].label,'Etapa 34');
});
test('worker registra mídia aprovada sem afirmar publicação',async()=>{
 const mediaJob={...job('running','queued',{phase:'queued'}),plan:{...plan,video:null}};
 const next=await advanceShopeeExecution(mediaJob,{
  validateIdentity:async()=>{},read:async()=>({item_id:555555,item_name:'Piscina antiga',
   description:'Atual',description_type:'normal',category_id:1001,item_status:'NORMAL',
   attribute_list:[],tax_info:{},image:{image_id_list:[]}}),
  downloadImage:async()=>new Uint8Array([1]),media:{image:async()=>123}
 });
 assert.equal(next.result.imageIds.length,1);
 assert.equal(next.result.events.at(-1).label,'Imagem 1 de 9 enviada à biblioteca de mídia da Shopee.');
 assert.equal(next.state,'running');
});
test('campos do monitor existem e usam somente dados do serviço',()=>{
 const html=readFileSync(new URL('../public/index.html',import.meta.url),'utf8');
 const js=readFileSync(new URL('../public/app.js',import.meta.url),'utf8');
 const area=html.slice(html.indexOf('id="optimizerExecutionPanel"'),html.indexOf('id="optimizerWorkflowEditor"'));
 for(const id of ['optimizerExecutionTracker','optimizerExecutionProductImage','optimizerExecutionSku',
  'optimizerExecutionProductTitle','optimizerExecutionPhaseTitle','optimizerExecutionPercent',
  'optimizerExecutionBar','optimizerExecutionSteps','optimizerExecutionEvents','optimizerExecutionActivity']){
  assert.match(area,new RegExp('id="'+id+'"'));
 }
 assert.match(js,/optimizerExecutionTrackerRender\(data\.progress/);
 assert.match(js,/optimizerExecutionJobView\(data\.job,data\.progress,data\.issue\)/);
 assert.doesNotMatch(area,/12 abr\. 2025|fone de ouvido/i);
});

test('aceite da atualização muda imediatamente o monitor para conferência sem simular publicação',async()=>{
 const leanPlan={...plan,images:[],video:null};
 const saved={...job('running','queued',{phase:'queued'}),plan:leanPlan};
 let beforeWrite=null;
 const next=await advanceShopeeExecution(saved,{
  validateIdentity:async()=>{},
  read:async()=>({item_id:555555,item_name:'Piscina antiga',description:'Atual',
   description_type:'normal',category_id:1001,item_status:'NORMAL',
   attribute_list:[],tax_info:{},image:{image_id_list:[]}}),
  beforeWrite:async result=>{beforeWrite=result;},
  update:async()=>({request_id:'confirmed-request'})
 });
 assert.equal(beforeWrite.phase,'updating');
 assert.equal(next.state,'running');
 assert.equal(next.result.phase,'verifying');
 assert.equal(next.result.requestId,'confirmed-request');
 assert.ok(next.result.events.some(x=>x.key==='update-request'));
 assert.ok(next.result.events.some(x=>x.key==='update-accepted'));
 assert.ok(shopeeExecutionProgress({...saved,result:next.result}).percent<100);
});

test('fluxo completo antigo exibe etapa 08 após a fiscal, sem fingir autorização',()=>{
 const old={...plan,selectedStage:'all',finalFiscal:{ncm:'95030010'}};
 const progress=shopeeExecutionProgress({...job('uncertain','verifying',{
  imageIds:Array(9).fill('id'),video:{phase:'ready'}}),plan:old});
 assert.deepEqual(progress.steps.slice(-2).map(x=>x.id),['fiscal','discount']);
 assert.equal(progress.steps.at(-1).status,'review');
 assert.equal(progress.discountStatus,'not_approved_for_this_run');
 assert.equal(progress.imagesPublished,0);
 assert.equal(progress.verified,false);
 assert.ok(progress.percent<100);
});
test('desconto aparece como ultima etapa e só conclui quando Shopee confirma',()=>{
 const flow={...plan,selectedStage:'all',finalFiscal:{ncm:'95030010'},
  commercialDiscount:{snapshot:{sku:'TRC1525'}}};
 const running=shopeeExecutionProgress({...job('running','discount_ready',{
  imageIds:Array(9).fill('id'),video:{phase:'ready'},primaryVerified:true,
  fiscal:{status:'verified'}}),plan:flow});
 assert.equal(running.steps.at(-1).id,'discount');
 assert.equal(running.steps.at(-1).status,'active');
 assert.ok(running.percent<100);
 const success=shopeeExecutionProgress({...job('verified','verified',{
  imageIds:Array(9).fill('id'),video:{phase:'ready'},primaryVerified:true,
  fiscal:{status:'verified'},discount:{status:'verified'}}),plan:flow});
 assert.equal(success.steps.at(-1).status,'done');
 assert.equal(success.percent,100);
});
