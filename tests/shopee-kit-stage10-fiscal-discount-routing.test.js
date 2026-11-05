import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';

const source=readFileSync(new URL('../public/app.js',import.meta.url),'utf8');
const between=(a,b)=>{
 const start=source.indexOf(a),end=source.indexOf(b,start+a.length);
 assert.ok(start>=0&&end>start,'Treasured execution anchors are present');
 return source.slice(start,end);
};

test('etapa 10 tenta fiscal isolado se plano geral nao tiver acao',async()=>{
 const body=between('async function kitAutoSweepChoosePlan(', 'function kitAutoSweepResume(');
 const scope={value:'all',options:['all','fiscal','discount'].map(value=>({value}))};
 const calls=[],notifications=[];
 const context={
  $:()=>scope,kitAutoSweepMatches:()=>true,optimizerExecPrepareError:'',
  kitAutoSweepPreparePlan:async target=>{
   calls.push(scope.value);
   return {selectedStage:scope.value,sku:target.sku,itemId:target.itemId,
    canExecute:scope.value==='fiscal',actions:scope.value==='fiscal'?['tax_info']:[]};
  },
  optimizerExecNotice:(...args)=>notifications.push(args)
 };
 const fn=runInNewContext(body+';kitAutoSweepChoosePlan',context);
 const target={kitSku:'KIT-TESTE',sku:'TESTE',itemId:'123',modelId:'0'};
 const audit={stages:[{id:'video',status:'pending'},{id:'fiscal',status:'pending'},
  {id:'discount',status:'pending'},{id:'final',status:'pending'}]};
 const result=await fn(target,audit,'all');
 assert.equal(result.plan.selectedStage,'fiscal');
 assert.deepEqual(calls,['all','fiscal']);
 assert.equal(scope.value,'fiscal');
 assert.equal(notifications.length,1);
});

test('etapa 10 tenta desconto sem exigir video concluido',async()=>{
 const body=between('async function kitAutoSweepChoosePlan(', 'function kitAutoSweepResume(');
 const scope={value:'all',options:['all','fiscal','discount'].map(value=>({value}))};
 const calls=[];
 const context={
  $:()=>scope,kitAutoSweepMatches:()=>true,optimizerExecPrepareError:'',
  kitAutoSweepPreparePlan:async target=>{
   calls.push(scope.value);
   return {selectedStage:scope.value,sku:target.sku,itemId:target.itemId,
    canExecute:scope.value==='discount',
    actions:scope.value==='discount'?['kit_discount']:[],
    blocked:scope.value==='fiscal'?['NCM nao conferido']:[]};
  },
  optimizerExecNotice:()=>{}
 };
 const fn=runInNewContext(body+';kitAutoSweepChoosePlan',context);
 const result=await fn({kitSku:'KIT-TESTE',sku:'TESTE',itemId:'123',modelId:'0'},
  {stages:[{id:'video',status:'pending'},{id:'fiscal',status:'pending'},
   {id:'discount',status:'pending'}]},'all');
 assert.deepEqual(calls,['all','fiscal','discount']);
 assert.equal(result.plan.selectedStage,'discount');
});

test('pendencias sem autorizacao nao produzem tentativa de envio',async()=>{
 const body=between('async function kitAutoSweepChoosePlan(', 'function kitAutoSweepResume(');
 const scope={value:'all',options:['all','fiscal','discount'].map(value=>({value}))};
 const context={
  $:()=>scope,kitAutoSweepMatches:()=>true,optimizerExecPrepareError:'',
  kitAutoSweepPreparePlan:async target=>({
   selectedStage:scope.value,sku:target.sku,itemId:target.itemId,
   canExecute:false,actions:[],blocked:['Falta conferencia aprovada']}),
  optimizerExecNotice:()=>{}
 };
 const fn=runInNewContext(body+';kitAutoSweepChoosePlan',context);
 const result=await fn({kitSku:'KIT-TESTE',sku:'TESTE',itemId:'123',modelId:'0'},
  {stages:[{id:'fiscal',status:'pending'},{id:'discount',status:'pending'}]},'all');
 assert.equal(result.plan,null);
 assert.equal(result.diagnostics.length,3);
 assert.equal(scope.value,'all');
});

test('fiscal usa NCM da SKU exata e salva revisao antes da execucao',async()=>{
 const body=between('globalThis.RAKitSyncApprovedFiscal=async(', '// Pré-execução parcial Shopee.');
 const w={sku:'PRINCIPAL',itemId:'123',modelId:'0',
  kitOptimization:{kitSku:'KIT-PRINCIPAL-COMPONENTE'},
  stages:[{key:'fiscal',reviewed:false}],tax:{origin:'2',ncm:'00000000'}};
 const posts=[];
 const context={optimizerWorkflowPlan:w,optimizerKitWorkflowActive:()=>true,
  RAKitWizardExecutionReviews:()=>({kitSku:w.kitOptimization.kitSku,stages:['fiscal']}),
  URLSearchParams,AbortSignal,
  json:async endpoint=>{
   assert.match(endpoint,/sku=PRINCIPAL/);
   return {sku:'PRINCIPAL',kitSku:w.kitOptimization.kitSku,
    taxSuggestion:{ncm:'12345678',cest:'00'},taxDraft:{origin:'2'}};
  },
  optimizerSaveChecklistReview:async payload=>{
   posts.push(payload);
   return {saved:true,stages:[{key:'fiscal',reviewed:true}],tax:payload.tax};
  }};
 runInNewContext(body,context);
 const done=await context.RAKitSyncApprovedFiscal({sku:'PRINCIPAL',itemId:'123',modelId:'0'});
 assert.equal(done.ok,true);
 assert.equal(posts[0].tax.ncm,'12345678');
 assert.equal(posts[0].tax.origin,'2');
 assert.equal(posts[0].stage,'fiscal');
 assert.equal(context.optimizerWorkflowPlan.tax.ncm,'12345678');
});
