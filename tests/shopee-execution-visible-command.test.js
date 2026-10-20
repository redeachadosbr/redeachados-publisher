import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';

const html=readFileSync(new URL('../public/index.html',import.meta.url),'utf8');
const source=readFileSync(new URL('../public/app.js',import.meta.url),'utf8');

test('prévia mostra execução direta e oculta comandos manuais repetitivos',()=>{
 const h=html.slice(html.indexOf('id="optimizerExecutionPanel"'),html.indexOf('id="optimizerWorkflowEditor"'));
 assert.match(h,/id="optimizerExecutionLaunch"[^>]*>▶ Executar na Shopee/);
 assert.match(h,/id="optimizerExecutionRefresh"[^>]*hidden/);
 assert.match(h,/Diagnóstico de conexão \(somente se houver falha\)/);
 assert.match(source,/optimizerExecutionConfirmation'\)\.hidden=true/);
 assert.match(source,/optimizerExecutionLaunch'\)\.disabled=unavailable/);
});

function page(){
 const nodes=new Map(),calls=[];
 const node=id=>{
  if(!nodes.has(id))nodes.set(id,{
   hidden:false,disabled:false,checked:false,value:'',dataset:{},open:false,
   textContent:'',addEventListener(event,fn){this[event]=fn;},
   replaceChildren(){},appendChild(){},scrollIntoView(){},focus(){}
  });
  return nodes.get(id);
 };
 const scope={
  $:node,AbortSignal,URLSearchParams,setTimeout,clearTimeout,
  optimizerWorkflowPlan:{sku:'SKU-123',itemId:'123456789',modelId:'0'},
  optimizerMake:(tag,cls,text)=>({tag,cls,text}),
  json:async(url,options)=>{
   calls.push({url,options});
   if(url.endsWith('/execute'))return {ok:true,status:'running',marketplaceUpdated:false};
   if(url.includes('/status?'))return {job:{state:'verified',result:{phase:'verified'}}};
   throw Error('Unexpected request '+url);
  }
 };
 const code=source.slice(source.indexOf('let optimizerExecPlan='),source.indexOf('function optimizerCell('));
 runInNewContext(code+`
 optimizerExecContext={...optimizerWorkflowPlan};
 this.render=optimizerExecRender;
 this.view=optimizerExecutionJobView;
 `,scope);
 return {node,calls,scope};
}
const plan=(ready=true)=>({ready,updatedAt:'2026-10-19T15:00:00Z',
 plan:{canExecute:ready,sku:'SKU-123',itemId:'123456789',modelId:'0',
 actions:ready?['video']:[],proposed:{},blocked:ready?[]:['Anatel pendente'],
 warnings:[],video:ready?{filename:'manual.mp4'}:null,planId:'P123'}});

test('um clique dispara somente as alterações já aprovadas e consulta a Shopee',async()=>{
 const p=page();
 p.scope.render(plan());
 assert.equal(p.node('#optimizerExecutionLaunch').hidden,false);
 assert.equal(p.node('#optimizerExecutionLaunch').disabled,false);
 assert.equal(p.node('#optimizerExecutionConfirmation').hidden,true);
 // O painel fiscal consulta a situação CPF/CNPJ ao carregar, sem qualquer publicação.
 assert.equal(p.calls.filter(x=>x.url.endsWith('/execute')).length,0);
 p.node('#optimizerExecutionLaunch').click();
 await new Promise(resolve=>setImmediate(resolve));
 assert.equal(p.calls.filter(x=>x.url.endsWith('/execute')).length,1);
 const request=p.calls.find(x=>x.url.endsWith('/execute'));
 const body=JSON.parse(request.options.body);
 assert.equal(body.sku,'SKU-123');
 assert.equal(body.confirmation,'EXECUTAR SKU-123');
 assert.equal(body.acceptPartialExecution,true);
 assert.equal(p.node('#optimizerExecutionLaunch').hidden,true);
 assert.equal(p.node('#optimizerExecutionShopeeLink').hidden,false);
 assert.match(p.node('#optimizerExecutionShopeeLink').href,/portal\/product\/123456789/);
});

test('prévia bloqueada não executa, mesmo se houver clique',async()=>{
 const p=page();
 p.scope.render(plan(false));
 assert.equal(p.node('#optimizerExecutionLaunch').hidden,true);
 assert.equal(p.node('#optimizerExecutionLaunch').disabled,true);
 p.node('#optimizerExecutionLaunch').click();
 await new Promise(resolve=>setImmediate(resolve));
 assert.equal(p.calls.filter(x=>x.url.endsWith('/execute')).length,0);
});

test('cliques repetidos não duplicam a requisição',async()=>{
 const p=page();p.scope.render(plan());
 p.node('#optimizerExecutionLaunch').click();
 p.node('#optimizerExecutionLaunch').click();
 await new Promise(resolve=>setImmediate(resolve));
 assert.equal(p.calls.filter(x=>x.url.endsWith('/execute')).length,1);
});
