import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const code=readFileSync(new URL('../public/app.js',import.meta.url),'utf8');
const html=readFileSync(new URL('../public/index.html',import.meta.url),'utf8');

test('trocar SKU aborta só pré-consulta pendente e não herda lock',()=>{
 const reset=code.slice(code.indexOf('function optimizerExecReset(){'),code.indexOf('let optimizerFinalSnapshot='));
 assert.match(reset,/optimizerExecPrepareController\.abort\(\)/);
 assert.match(reset,/optimizerExecPreparation=null/);
 const prepare=code.slice(code.indexOf('async function optimizerExecutionPrepare('),code.indexOf("$('#optimizerExecutionPrepare')?.addEventListener"));
 assert.match(prepare,/optimizerExecPrepareController\?\.abort\(\)/);
 assert.match(prepare,/optimizerExecPreparation=null/);
 assert.match(prepare,/AbortSignal\.any\(\[controller\.signal,AbortSignal\.timeout\(75000\)\]\)/);
 assert.match(prepare,/if\(optimizerExecPreparation===preparation\)/);
 assert.doesNotMatch(prepare,/preparation\.again\|\|serial!==optimizerExecSerial/);
});

test('resposta atrasada da SKU antiga não redefine busy da nova execução',()=>{
 const run=code.slice(code.indexOf('async function optimizerExecuteApproved('),code.indexOf("$('#optimizerExecutionPrepare')?.addEventListener",code.indexOf('async function optimizerExecuteApproved('))>0?code.indexOf("$('#optimizerExecutionPrepare')?.addEventListener",code.indexOf('async function optimizerExecuteApproved(')):code.indexOf('async function optimizerExecuteApproved(')+8000);
 assert.match(run,/const executionSerial=optimizerExecSerial/);
 assert.match(run,/if\(executionSerial===optimizerExecSerial\)/);
});

test('troca de SKU mantém motor matriz independente da Ponte ChatGPT',()=>{
 const onInput=code.slice(code.indexOf("$('#optimizerSku')?.addEventListener?.('input'"),code.indexOf('function adsFillOptimizerSku'));
 assert.match(onInput,/optimizerWorkflowPlan=null;optimizerWorkflowStage=null;optimizerWorkflowSerial\+\+/);
 assert.match(onInput,/optimizerExecReset\(\)/);
 assert.match(onInput,/void optimizerChatBridgeSwitchSku\(value\)/);
 assert.match(html,/app\.js\?v=1\.21\.79-execution-repair/);
});

test('polling de uma SKU antiga não bloqueia a verificação de nova SKU',()=>{
 const refresh=code.slice(code.indexOf('async function optimizerExecutionRefresh('),code.indexOf("$('#optimizerExecutionRefresh')"));
 assert.match(refresh,/optimizerExecPollingIdentity===identity/);
 assert.match(refresh,/optimizerExecPollingIdentity=identity/);
 assert.match(refresh,/if\(current&&current\.sku\+':'\+current\.itemId\+':'\+current\.modelId===identity\)/);
 assert.match(refresh,/if\(optimizerExecPollingIdentity===identity\)\{optimizerExecPolling=false;/);
});

