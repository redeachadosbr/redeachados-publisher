import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';

const source=readFileSync(new URL('../chrome-extension-chatgpt/seo-automation.js',import.meta.url),'utf8');
const title=n=>'Caderno Argolado Rebecca Bonbon com 160 Folhas Estampadas para Escola e Faculdade, Capa Sortida e Argolas '+n;
const block=ns=>ns.map(n=>'"title":"'+title(n)+'"').join(',\n');

function harness({userText='',oldAssistant='',answers=[],hiddenStop=false}={}){
 const make=(text,order,shown=true)=>({
  innerText:text,textContent:text,order,tagName:'DIV',disabled:false,
  getClientRects:()=>shown?[{}]:[],getAttribute:()=>null,
  contains:()=>false,closest:()=>null,querySelectorAll:()=>[],
  compareDocumentPosition(other){return order<other.order?4:2;}
 });
 const older=oldAssistant?make(oldAssistant,1):null;
 const user=make(userText,2);
 const assistants=[...(older?[older]:[]),...answers.map((x,i)=>make(x,3+i))];
 const stop=hiddenStop?make('',100,false):null;
 const document={
  querySelectorAll(q){
   if(q.includes('data-message-author-role="user"'))return [user];
   if(q.includes('data-message-author-role="assistant"')&&q.includes('article[data-role'))return assistants;
   if(q.includes('main .markdown'))return [];
   if(q.includes('stop-button'))return stop?[stop]:[];
   return [];
  },
  querySelector:()=>null
 };
 const ctx={document,getComputedStyle:()=>({visibility:'visible',display:'block'}),URL};
 ctx.globalThis=ctx;
 vm.runInNewContext(source,ctx);
 return ctx.RASeoAutomation;
}

test('junta quatro títulos fragmentados em dois turnos visuais, sem misturar o prompt',()=>{
 const api=harness({userText:'DADOS COMPROVADOS DA SKU: {"sku":"11001","itemId":"123","modelId":"0"}',
  answers:[block([1,2]),block([3,4])]});
 const result=api.dom('result',{});
 assert.equal(result.generating,false);
 assert.equal(result.users,1);
 assert.equal(api.extractFour(result.raw).titles.length,4);
 assert.equal(api.extractFour(result.raw).mode,'title-fields');
});

test('ignora quatro títulos antigos anteriores ao último prompt do usuário',()=>{
 const api=harness({oldAssistant:block([1,2,3,4]),answers:[block([1])]});
 const result=api.dom('result',{});
 assert.equal(api.extractFour(result.raw),null);
});

test('não confunde botão oculto de parar geração com resposta em andamento',()=>{
 const api=harness({answers:[block([1,2,3,4])],hiddenStop:true});
 const result=api.dom('result',{});
 assert.equal(result.generating,false);
 assert.equal(api.extractFour(result.raw).titles.length,4);
});

test('aceita quatro títulos numerados renderizados sem JSON e valida quantidade',()=>{
 const api=harness();
 const raw=[1,2,3,4].map(i=>i+'. '+title(i)).join('\n');
 const result=api.extractFour(raw);
 assert.equal(result?.titles.length,4);
 assert.equal(result?.mode,'numbered');
 assert.equal(api.extractFour([1,2,3].map(i=>i+'. '+title(i)).join('\n')),null);
});

test('recuperação SEO exige identidade exata do último pedido, não apenas o nome da aba',()=>{
 assert.match(source,/const promptMatches=result=>/);
 assert.match(source,/\['sku',sku\],\['itemId',itemId\],\['modelId',modelId\]/);
 assert.match(source,/if\(promptMatches\(result\)\)extracted=extractFour\(result\.raw\)/);
});
