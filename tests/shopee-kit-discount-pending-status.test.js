import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {auditRootShopeeExecution} from '../shopeeExecutionHealth.js';
import {shopeeExecutionProgress} from '../shopeeExecutionProgress.js';

const f=path=>readFileSync(new URL('../'+path,import.meta.url),'utf8');
const itemId='58222014306';
const record={sku:'1.26088.80.0001',itemId,selectedModelId:'0',status:'NORMAL',attributeAudit:{missingMandatory:0,attributes:[]}};
const live={item_id:Number(itemId),has_model:false,item_name:'Anúncio existente',description:'Descrição antiga',
 image:{image_id_list:[]},video_info:[],tax_info:{}};
test('etapa 08 sem prévia nem publicação é detectada como não executada',()=>{
 const result=auditRootShopeeExecution({
  sku:record.sku,itemId,record,live,
  review:{stages:{seo:{reviewed:true}},draftTitle:'Anúncio existente'},
  images:[],video:null,discountReadback:null,job:{state:'blocked',plan:{selectedStage:'all'}}
 });
 const discount=result.stages.find(x=>x.id==='discount');
 assert.equal(discount.status,'pending');
 assert.match(discount.reason,/DESCONTO NÃO EXECUTADO/);
 assert.ok(result.pending.includes('discount'));
 assert.equal(result.complete,false);
 assert.equal(result.stages.find(x=>x.id==='final').status,'pending');
});
test('prévia conferida sem publicação continua pendente',()=>{
 const audit=auditRootShopeeExecution({
  sku:record.sku,itemId,record,live,images:[],video:null,
  review:{stages:{},kitDiscountPreview:{status:'prepared',discountId:'123'}},
  discountReadback:null
 });
 assert.match(audit.stages.find(x=>x.id==='discount').reason,/prévia.*NÃO EXECUTADO|NÃO EXECUTADO.*prévia/i);
});
test('job bloqueado sem submissão não pode exibir 99% nem 100%',()=>{
 const result=shopeeExecutionProgress({
  state:'blocked',sku:record.sku,
  plan:{selectedStage:'all',itemId,modelId:'0',sku:record.sku,canExecute:false,
   confirmedStages:{seo:true,description:true,technical:true},
   proposed:{},images:[],video:null,finalFiscal:null,kitDiscount:null,
   original:{image:{image_id_list:[]}}},
  result:{},updated_at:'2026-11-01T07:52:52Z'
 });
 assert.equal(result.hasStarted,false);
 assert.equal(result.percent,0);
 assert.equal(result.discountStatus,'not_approved_for_this_run');
 assert.ok(result.steps.some(x=>x.id==='discount'&&x.status==='review'));
});
test('painel inclui desconto na lista de pendências, abrindo Minha Promoção',()=>{
 const app=f('public/app.js');
 const i=app.indexOf('function optimizerExecutionTrackerRender(');
 const j=app.indexOf('function optimizerExecutionIssueRender(',i);
 const tracker=app.slice(i,j);
 assert.ok(tracker.includes("x.id==='discount'&&discountPending"));
 assert.ok(tracker.includes('pendingActions.append(instructions)'));
 assert.ok(tracker.includes('kitDiscountAction.hidden=!discountPending'));
 assert.ok(app.includes('async function optimizerOneClickExecute()'));
 assert.ok(tracker.includes("step.id==='discount'"));
 assert.ok(tracker.includes("kitDiscountAction.addEventListener('click',()=>optimizerDiscountOpenReview())"));
 assert.ok(tracker.includes('DESCONTO NÃO EXECUTADO'));
 assert.ok(tracker.includes('!progress.hasStarted&&!progress.hasSavedProgress?0'));
 assert.ok(app.includes("liveDiscount?.status!=='confirmed'"));
});
