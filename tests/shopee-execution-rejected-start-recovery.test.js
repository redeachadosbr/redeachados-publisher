import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';

const source=readFileSync(new URL('../public/app.js',import.meta.url),'utf8');
const reason='A prévia tem alterações novas ou divergentes. Atualize a prévia antes de executar.';
const tracker=source.slice(source.indexOf('function optimizerExecutionTrackerRender('),
 source.indexOf('function optimizerExecutionIssueRender('));

test('a barra e o dashboard mantêm o motivo real após status de prévia preparada',()=>{
 let displayed;
 const scope={optimizerExecStartError:reason,$:()=>null,
  OptimizerSkuDashboard:{execution:p=>{displayed=p;}}};
 runInNewContext(tracker,scope);
 const progress={state:'prepared',hasStarted:false,percent:0,
  title:'Prévia pronta - aguardando autorização',message:'Nenhuma publicação foi iniciada.'};
 for(let i=0;i<2;i++){
  scope.optimizerExecutionTrackerRender(progress,{state:'prepared'});
  assert.equal(displayed.title,'Execução não iniciada');
  assert.equal(displayed.attention,true);
  assert.equal(displayed.percent,0);
  assert.equal(displayed.state,'prepared');
  assert.match(displayed.message,/alterações novas ou divergentes/);
 }
 assert.equal(progress.title,'Prévia pronta - aguardando autorização');
 const active={state:'running',hasStarted:true,title:'Enviando imagens',message:'1 de 9',percent:10};
 scope.optimizerExecutionTrackerRender(active,{state:'running'});
 assert.equal(displayed,active);
});

test('revalidação automática preserva o erro e nunca inicia publicação',async()=>{
 const nodes=new Map(),calls=[];
 const $=key=>{
  if(!nodes.has(key))nodes.set(key,{value:key==='#optimizerExecutionScope'?'all':'',hidden:false,disabled:false});
  return nodes.get(key);
 };
 const scope={$,AbortSignal,AbortController,setTimeout,
  optimizerWorkflowPlan:{sku:'CAR-6V',itemId:'123456',modelId:'0'},
  optimizerExecBusy:false,optimizerExecPreparation:null,optimizerExecPrepareController:null,
  optimizerExecSerial:0,optimizerExecStartError:reason,optimizerExecContext:null,
  optimizerExecPlan:null,optimizerExecAutoModelToken:null,optimizerExecAutoModelPreview:null,
  optimizerDiscountFinalPreviewData:null,
  optimizerExecutionRefresh:async()=>({state:'prepared'}),
  optimizerDiscountApprovalReady:()=>false,
  optimizerExecNotice:()=>{},optimizerExecRender:()=>{},
  json:async(url)=>{calls.push(url);return {ready:true};}
 };
 const prepare=source.slice(source.indexOf('async function optimizerExecutionPrepare('),
  source.indexOf("$('#optimizerExecutionPrepare')?.addEventListener"));
 runInNewContext(prepare,scope);
 await scope.optimizerExecutionPrepare({preserveStartError:true});
 assert.equal(scope.optimizerExecStartError,reason);
 assert.deepEqual(calls,['/api/shopee/optimizer/execution/prepare']);
 assert.equal($('#optimizerExecutionPrepare').disabled,false);
 await scope.optimizerExecutionPrepare();
 assert.equal(scope.optimizerExecStartError,'');
 assert.equal(calls.some(url=>url.endsWith('/execute')),false);
});

test('a mensagem de divergência real aciona atualização da prévia',()=>{
 const code=source.slice(source.indexOf('function optimizerExecutionNeedsFreshPreview('),
  source.indexOf('async function optimizerExecuteApproved('));
 const scope={};runInNewContext(code,scope);
 assert.equal(scope.optimizerExecutionNeedsFreshPreview(reason),true);
 assert.equal(scope.optimizerExecutionNeedsFreshPreview('Falha de rede'),false);
});

test('reconstrução técnica aprovada é idêntica na preparação e na execução',async()=>{
 const server=readFileSync(new URL('../server.js',import.meta.url),'utf8');
 const start=server.indexOf('async function restoreApprovedTechnicalDraftForExecution(');
 const end=server.indexOf("app.post('/api/shopee/optimizer/execution/prepare'",start);
 assert.ok(start>0&&end>start);
 const prepare=server.slice(end,server.indexOf("app.post('/api/shopee/optimizer/execution/execute'",end));
 const execute=server.slice(server.indexOf("app.post('/api/shopee/optimizer/execution/execute'",end));
 assert.match(prepare,/await restoreApprovedTechnicalDraftForExecution\(/);
 assert.match(execute,/await restoreApprovedTechnicalDraftForExecution\(/);
 assert.ok(execute.indexOf('await restoreApprovedTechnicalDraftForExecution(')<
  execute.indexOf('assertShopeeSupplierBrand('));
 const calls=[];
 const scope={
  approvedTechnicalDraftChanges:(draft,{reviewedAt})=>{
   calls.push('approved:'+reviewedAt);
   return draft.fields;
  },
  applySellerDeclarations:changes=>changes,
  scopeTechnicalReviewChanges:changes=>({changes}),
  hydrateCategoryChoices:async()=>{calls.push('category');},
  attributeAuditForChanges:()=>({}),
  selectValidTechnicalChanges:changes=>({valid:changes,skipped:[]})
 };
 runInNewContext(server.slice(start,end),scope);
 const saved={stages:{technical:{reviewed:true,reviewedAt:'2026-11-19T00:13:20Z'}},
  attributes:[],technicalDraft:{updatedAt:'2026-11-19T00:13:06Z',
   fields:[{attributeId:78,value:'confirmado'}]}};
 await scope.restoreApprovedTechnicalDraftForExecution({
  reviewState:saved,selectedStage:'all',record:{attributeAudit:{attributes:[]}},
  live:{},cfg:{},auth:{}
 });
 assert.equal(saved.attributes.length,1);
 assert.equal(saved.attributes[0].attributeId,78);
 assert.equal(saved._technicalRecoveredFromApprovedDraft,true);
 assert.deepEqual(calls,['approved:2026-11-19T00:13:20Z','category']);
 const unapproved={stages:{technical:{reviewed:false}},technicalDraft:saved.technicalDraft};
 await scope.restoreApprovedTechnicalDraftForExecution({
  reviewState:unapproved,selectedStage:'all',record:{},live:{},cfg:{},auth:{}
 });
 assert.equal(unapproved.attributes,undefined);
 assert.equal(calls.length,2);
});
