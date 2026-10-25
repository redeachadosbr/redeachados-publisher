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
