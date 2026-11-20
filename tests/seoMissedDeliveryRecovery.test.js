import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {randomUUID} from 'node:crypto';
import vm from 'node:vm';

const source=readFileSync(new URL('../public/seo-chatgpt-bridge.js',import.meta.url),'utf8');
const ORIGIN='https://redeachados-shopee.onrender.com';
const sku={sku:'TRC1423',itemId:'23995392577',modelId:'0',productTitle:'Capa de Chuva Motoqueiro Preto'};
const raw=JSON.stringify({titles:[1,2,3,4].map(i=>({
 title:'Capa de Chuva Motoqueiro 🌧️ Jaqueta e Calça Impermeáveis com Capuz e Faixa Refletiva para Deslocamentos '+i,
 reason:'Informações WeDrop confirmadas'
})),keywords:['capa de chuva motoqueiro'],researchStatus:'unverified',sources:[]});
function harness(){
 let time=0,next=0;
 const listeners=new Set(),sent=[],scheduled=new Map();
 const later=(fn,ms)=>{const id=++next;scheduled.set(id,{fn,at:time+ms});return id;};
 const cancel=id=>scheduled.delete(id);
 const win={setTimeout:later,clearTimeout:cancel,addEventListener:(_type,fn)=>listeners.add(fn),
  removeEventListener:(_type,fn)=>listeners.delete(fn),postMessage:m=>sent.push(m),open:()=>({})};
 const ctx={window:win,crypto:{randomUUID},location:{origin:ORIGIN},URL,setTimeout:later,clearTimeout:cancel};
 vm.runInNewContext(source,ctx);
 return {api:ctx.RASeoChatGPT,sent,last:kind=>sent.filter(m=>m.kind===kind).at(-1),
  receive:m=>{for(const fn of [...listeners])fn({source:win,origin:ORIGIN,data:m});},
  tick:ms=>{time+=ms;for(const [id,t] of [...scheduled])if(t.at<=time){scheduled.delete(id);t.fn();}},
  ready(version='1.0.47'){this.receive({kind:'RA_EXTENSION_READY',version});}
 };
}
test('recupera automaticamente JSON retido após perda do evento de entrega SEO, sem recriar pesquisa',async()=>{
 const h=harness();const resultPromise=h.api.request(sku);h.ready();
 const start=h.last('RA_SITE_SEO_START').payload;
 h.receive({kind:'RA_EXTENSION_SEO_START_RESULT',nonce:start.nonce,ok:true});
 h.tick(8001);
 const recovery=h.last('RA_SITE_SEO_RECOVER')?.payload;
 assert.ok(recovery?.nonce);
 assert.equal(h.sent.filter(x=>x.kind==='RA_SITE_SEO_START').length,1);
 h.receive({kind:'RA_EXTENSION_SEO_RECOVER_RESULT',...recovery,ok:true,rawText:raw});
 const result=await resultPromise;
 assert.equal(result.titles.length,4);
 assert.equal(result.recovered,true);
 assert.equal(result.requestIdentity.nonce,recovery.nonce);
 assert.equal(h.last('RA_SITE_SEO_RECOVER_ACK'),undefined,'sem ACK antes da persistência');
 assert.equal(h.api.hasPending(sku),true);
 h.api.acknowledgeRecovery(result);
 assert.equal(h.api.hasPending(sku),false);
 assert.equal(h.last('RA_SITE_SEO_RECOVER_ACK').nonce,recovery.nonce);
});
test('nunca mistura títulos de outra SKU na recuperação automática',async()=>{
 const h=harness();const resultPromise=h.api.resume(sku);h.ready();
 const begin=h.last('RA_SITE_SEO_RESUME').payload;
 h.receive({kind:'RA_EXTENSION_SEO_RESUME_RESULT',nonce:begin.nonce,ok:true,pending:true});
 h.tick(8001);
 const recovery=h.last('RA_SITE_SEO_RECOVER').payload;
 h.receive({kind:'RA_EXTENSION_SEO_RECOVER_RESULT',...recovery,sku:'SKU-ERRADA',ok:true,rawText:raw});
 assert.equal(h.api.hasPending(sku),true);
 h.tick(8001);
 const retry=h.last('RA_SITE_SEO_RECOVER').payload;
 assert.notEqual(retry.nonce,recovery.nonce);
 h.receive({kind:'RA_EXTENSION_SEO_RECOVER_RESULT',...retry,ok:true,rawText:raw});
 const result=await resultPromise;
 assert.equal(result.recovered,true);
 assert.equal(result.requestIdentity.sku,sku.sku);
 h.api.acknowledgeRecovery(result);
 assert.equal(h.last('RA_SITE_SEO_RECOVER_ACK').sku,sku.sku);
});

test('importa automaticamente resultado pronto mesmo sem job pendente na Ponte 1.0.66',async()=>{
 const h=harness();const pending=h.api.resume(sku);
 h.ready('1.0.66');
 const resume=h.last('RA_SITE_SEO_RESUME').payload;
 h.receive({kind:'RA_EXTENSION_SEO_RESUME_RESULT',nonce:resume.nonce,ok:true,pending:false});
 const recovery=h.last('RA_SITE_SEO_RECOVER')?.payload;
 assert.ok(recovery?.nonce);
 assert.equal(recovery.automatic,true);
 assert.equal(recovery.sku,sku.sku);
 assert.equal(recovery.itemId,sku.itemId);
 assert.equal(recovery.modelId,sku.modelId);
 assert.equal(h.sent.filter(x=>x.kind==='RA_SITE_SEO_START').length,0);
 h.receive({kind:'RA_EXTENSION_SEO_RECOVER_RESULT',...recovery,ok:true,rawText:raw});
 const result=await pending;
 assert.equal(result.recovered,true);
 assert.equal(result.titles.length,4);
 h.api.acknowledgeRecovery(result);
 assert.equal(h.last('RA_SITE_SEO_RECOVER_ACK').nonce,recovery.nonce);
});

test('resposta ausente termina a tentativa silenciosa sem gerar novo título',async()=>{
 const h=harness();const pending=h.api.resume(sku);h.ready('1.0.66');
 const begin=h.last('RA_SITE_SEO_RESUME').payload;
 h.receive({kind:'RA_EXTENSION_SEO_RESUME_RESULT',nonce:begin.nonce,ok:true,pending:false});
 const recovery=h.last('RA_SITE_SEO_RECOVER').payload;
 h.receive({kind:'RA_EXTENSION_SEO_RECOVER_RESULT',nonce:recovery.nonce,ok:false,error:'Nenhum resultado da SKU'});
 assert.equal(await pending,null);
 assert.equal(h.sent.filter(x=>x.kind==='RA_SITE_SEO_START').length,0);
});

test('Ponte anterior não inicia varredura silenciosa sem proteção por SKU',async()=>{
 const h=harness();const pending=h.api.resume(sku);h.ready('1.0.65');
 const begin=h.last('RA_SITE_SEO_RESUME').payload;
 h.receive({kind:'RA_EXTENSION_SEO_RESUME_RESULT',nonce:begin.nonce,ok:true,pending:false});
 assert.equal(await pending,null);
 assert.equal(h.sent.filter(x=>x.kind==='RA_SITE_SEO_RECOVER').length,0);
});
