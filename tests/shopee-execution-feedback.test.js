import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';

function page(start){
 const nodes=new Map(),calls=[];
 const node=id=>{
  if(!nodes.has(id))nodes.set(id,{hidden:false,disabled:false,checked:false,value:'',dataset:{},
   addEventListener(event,fn){this[event]=fn;}});
  return nodes.get(id);
 };
 const scope={$:node,AbortSignal,URLSearchParams,clearTimeout,setTimeout,
  optimizerWorkflowPlan:{sku:'TRC1525',itemId:'22095398152',modelId:'0'},
  json:async(url)=>{
   calls.push(url);
   if(url.endsWith('/execute'))return start();
   if(url.includes('/status?'))return {job:{state:'prepared',result:null}};
   throw Error('Unexpected request '+url);
  }};
 const app=readFileSync(new URL('../public/app.js',import.meta.url),'utf8');
 const code=app.slice(app.indexOf('let optimizerExecPlan='),app.indexOf('function optimizerCell('));
 runInNewContext(code+`
  optimizerExecPlan={canExecute:true,sku:'TRC1525',itemId:'22095398152',modelId:'0',planId:'p',updatedAt:'t'};
  optimizerExecContext={...optimizerWorkflowPlan};
  this.jobView=optimizerExecutionJobView;
  this.reset=optimizerExecReset;
 `,scope);
 node('#optimizerExecutionAccept').checked=true;
 node('#optimizerExecutionInput').value='EXECUTAR TRC1525';
 return {node,calls,scope};
}

test('a rejected start remains visible after automatic and manual prepared-status refreshes',async()=>{
 const p=page(()=>{throw Error('Plano alterado em outra sessão. Prepare novamente.');});
 await p.node('#optimizerExecutionRun').click();
 await new Promise(resolve=>setImmediate(resolve));
 const status=p.node('#optimizerExecutionStatus');
 assert.match(status.textContent,/Execução não iniciada: Plano alterado em outra sessão/);
 assert.equal(status.dataset.state,'error');
 p.scope.jobView({state:'prepared',result:null});
 assert.match(status.textContent,/Plano alterado em outra sessão/);
 assert.equal(p.calls.filter(x=>x.endsWith('/execute')).length,1);
 assert.equal(p.node('#optimizerExecutionConfirmation').hidden,true);
 p.scope.reset();
 p.scope.jobView({state:'prepared',result:null});
 assert.equal(status.textContent,'Prévia preparada');
});

test('an authoritative active job supersedes a request error and preserves reconciliation',async()=>{
 const p=page(()=>{throw Error('Timeout');});
 await p.node('#optimizerExecutionRun').click();
 await new Promise(resolve=>setImmediate(resolve));
 p.scope.jobView({state:'uncertain',result:{phase:'verifying'},last_error:'Confirmação pendente'});
 const status=p.node('#optimizerExecutionStatus');
 assert.match(status.textContent,/Conferindo o anúncio na Shopee.*Confirmação pendente/);
 assert.doesNotMatch(status.textContent,/Timeout|não iniciada/);
 assert.equal(p.node('#optimizerExecutionReconcile').hidden,false);
 assert.equal(p.node('#optimizerExecutionRun').disabled,true);
 p.scope.jobView({state:'verified',result:{phase:'verified'}});
 assert.match(status.textContent,/Alterações confirmadas/);
 assert.equal(status.dataset.state,'success');
});
