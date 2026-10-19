import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';

const html=readFileSync(new URL('../public/index.html',import.meta.url),'utf8');
const source=readFileSync(new URL('../public/app.js',import.meta.url),'utf8');

test('prévia exibe comando direto e confirmações antes de diferenças longas',()=>{
 const h=html.slice(html.indexOf('id="optimizerExecutionPanel"'),html.indexOf('id="optimizerWorkflowEditor"'));
 assert.ok(h.indexOf('id="optimizerExecutionLaunch"')>0);
 assert.ok(h.indexOf('id="optimizerExecutionShopeeLink"')>0);
 assert.ok(h.indexOf('id="optimizerExecutionConfirmation"')<h.indexOf('id="optimizerExecutionChanges"'));
 assert.ok(h.indexOf('id="optimizerExecutionAccept"')<h.indexOf('id="optimizerExecutionRun"'));
 assert.match(source,/optimizerExecutionConfirmation'\)\.open=Boolean\(data\.ready\)/);
});

function simulatedPage(){
 const nodes=new Map(),calls=[];
 const node=id=>{
  if(!nodes.has(id))nodes.set(id,{
   hidden:false,disabled:false,checked:false,value:'',dataset:{},open:false,
   textContent:'',scrolled:false,focused:false,
   addEventListener(event,fn){this[event]=fn;},
   replaceChildren(){},appendChild(){},
   scrollIntoView(){this.scrolled=true;},
   focus(){this.focused=true;}
  });
  return nodes.get(id);
 };
 const scope={
  $:node,AbortSignal,URLSearchParams,setTimeout,clearTimeout,
  optimizerWorkflowPlan:{sku:'SKU-123',itemId:'123456789',modelId:'0'},
  optimizerMake:(tag,css,text)=>({tag,css,text}),
  json:async(url)=>{
   calls.push(url);
   if(url.endsWith('/execute'))return {ok:true,status:'running',marketplaceUpdated:false};
   if(url.includes('/status?'))return {job:{state:'running',result:{phase:'queued'}}};
   throw Error('Unexpected request '+url);
  }
 };
 const piece=source.slice(source.indexOf('let optimizerExecPlan='),source.indexOf('function optimizerCell('));
 runInNewContext(piece+`
 optimizerExecContext={...optimizerWorkflowPlan};
 this.render=optimizerExecRender;
 this.view=optimizerExecutionJobView;
 `,scope);
 return {node,calls,scope};
}
test('botão no topo abre autorização sem disparar nenhuma chamada para Shopee',()=>{
 const p=simulatedPage();
 p.scope.render({ready:true,updatedAt:'2026-10-19T15:00:00Z',
   plan:{canExecute:true,sku:'SKU-123',itemId:'123456789',modelId:'0',
    actions:['video'],proposed:{},blocked:[],warnings:[],video:{filename:'manual.mp4'},planId:'P123'}});
 assert.equal(p.node('#optimizerExecutionLaunch').hidden,false);
 assert.equal(p.node('#optimizerExecutionConfirmation').open,true);
 p.node('#optimizerExecutionLaunch').click();
 assert.equal(p.node('#optimizerExecutionConfirmation').scrolled,true);
 assert.equal(p.node('#optimizerExecutionAccept').focused,true);
 assert.equal(p.calls.length,0);
 assert.equal(p.node('#optimizerExecutionRun').disabled,true);
});
test('envio só acontece depois da autorização e mostra progresso e link após confirmação',async()=>{
 const p=simulatedPage();
 p.scope.render({ready:true,updatedAt:'2026-10-19T15:00:00Z',
   plan:{canExecute:true,sku:'SKU-123',itemId:'123456789',modelId:'0',
    actions:['video'],proposed:{},blocked:[],warnings:[],video:{filename:'manual.mp4'},planId:'P123'}});
 p.node('#optimizerExecutionAccept').checked=true;
 p.node('#optimizerExecutionInput').value='EXECUTAR SKU-123';
 p.node('#optimizerExecutionRun').click();
 await new Promise(resolve=>setImmediate(resolve));
 assert.equal(p.calls.filter(x=>x.endsWith('/execute')).length,1);
 assert.equal(p.node('#optimizerExecutionLaunch').hidden,true);
 assert.match(p.node('#optimizerExecutionStatus').textContent,/Na fila|Execução iniciada/);
 p.scope.view({state:'verified',result:{phase:'verified'}});
 assert.equal(p.node('#optimizerExecutionShopeeLink').hidden,false);
 assert.match(p.node('#optimizerExecutionShopeeLink').href,/portal\/product\/123456789/);
});
