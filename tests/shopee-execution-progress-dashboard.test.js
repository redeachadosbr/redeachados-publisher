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
test('status mostra 2 de 9 na mídia, nunca como imagens já publicadas',()=>{
 const progress=shopeeExecutionProgress(job('running','images_upload',{imageIds:['a','b']}));
 assert.equal(progress.imagesUploaded,2);
 assert.equal(progress.imagesTotal,9);
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
 assert.match(js,/optimizerExecutionJobView\(data\.job,data\.progress\)/);
 assert.doesNotMatch(area,/12 abr\. 2025|fone de ouvido/i);
});
