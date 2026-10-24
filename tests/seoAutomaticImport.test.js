import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {randomUUID} from 'node:crypto';
import vm from 'node:vm';
const source=readFileSync(new URL('../public/seo-chatgpt-bridge.js',import.meta.url),'utf8');
const ORIGIN='https://redeachados-shopee.onrender.com';
const data={sku:'BLOCOS128',itemId:'120012',modelId:'0',productTitle:'Bloco de Montar Magnético Infantil 128 Peças Coloridas'};
const raw=JSON.stringify({titles:[1,2,3,4].map(i=>({title:'🧲 Blocos Magnéticos de Montar 128 Peças Coloridas XDX Brinquedo Infantil para Criar Construções na Brincadeira '+i+' 🎁',reason:'Dados confirmados'})),keywords:['blocos magnéticos'],sources:[]});
function setup(){
 const listeners=new Set(),messages=[],timeouts=new Map();let now=0,serial=0,opened=0;
 const clock={setTimeout(fn,ms){const id=++serial;timeouts.set(id,{fn,at:now+ms});return id;},clearTimeout(id){timeouts.delete(id);},tick(ms){now+=ms;for(const [id,t] of [...timeouts])if(t.at<=now){timeouts.delete(id);t.fn();}}};
 const window={setTimeout:clock.setTimeout,clearTimeout:clock.clearTimeout,
  addEventListener:(type,fn)=>listeners.add(fn),removeEventListener:(type,fn)=>listeners.delete(fn),
  postMessage:m=>messages.push(m),open:()=>{opened++;return {};}};
 const context={window,location:{origin:ORIGIN},crypto:{randomUUID},URL,setTimeout:clock.setTimeout,clearTimeout:clock.clearTimeout};
 vm.runInNewContext(source,context);
 return {api:context.RASeoChatGPT,clock,messages,get opened(){return opened;},
  receive(m){for(const fn of [...listeners])fn({source:window,origin:ORIGIN,data:m});},
  ready(version='1.0.47'){this.receive({kind:'RA_EXTENSION_READY',version});},
  last(kind){return messages.filter(m=>m.kind===kind).at(-1);}};
}
test('importa resposta que chega após seis minutos, sem expirar antes da captura',async()=>{
 const h=setup();let done=false;
 const promise=h.api.request(data).finally(()=>{done=true;});
 h.ready();const p=h.last('RA_SITE_SEO_START').payload;
 h.receive({kind:'RA_EXTENSION_SEO_START_RESULT',nonce:p.nonce,ok:true});
 h.clock.tick(6*60*1000);await Promise.resolve();
 assert.equal(done,false,'Pesquisa web longa deve continuar aguardando');
 h.receive({kind:'RA_EXTENSION_SEO_RESULT',...p,sku:'OUTRA-SKU',ok:true,rawText:raw});
 await Promise.resolve();assert.equal(done,false,'Não pode importar outro anúncio');
 h.receive({kind:'RA_EXTENSION_SEO_RESULT',...p,ok:true,rawText:raw});
 const result=await promise;assert.equal(result.titles.length,4);
 assert.equal(h.api.hasPending(data),true);
 h.api.acknowledge(result);assert.equal(h.api.hasPending(data),false);
 assert.equal(h.last('RA_SITE_SEO_ACK').nonce,p.nonce);
});
test('tela recarregada retoma resposta da extensão sem abrir chat ou enviar prompt',async()=>{
 const h=setup();const promise=h.api.resume(data);
 h.ready();const p=h.last('RA_SITE_SEO_RESUME').payload;
 h.receive({kind:'RA_EXTENSION_SEO_RESUME_RESULT',nonce:p.nonce,ok:true,pending:true});
 h.receive({kind:'RA_EXTENSION_SEO_RESULT',...p,ok:true,rawText:raw});
 const result=await promise;assert.equal(result.titles.length,4);
 assert.equal(h.opened,0);assert.equal(h.last('RA_SITE_SEO_START'),undefined);
});
test('sem entrega pendente, entrar na etapa SEO não inicia geração',async()=>{
 const h=setup();const promise=h.api.resume(data);
 h.ready();const p=h.last('RA_SITE_SEO_RESUME').payload;
 h.receive({kind:'RA_EXTENSION_SEO_RESUME_RESULT',nonce:p.nonce,ok:true,pending:false});
 assert.equal(await promise,null);assert.equal(h.api.hasPending(data),false);
 assert.equal(h.opened,0);assert.equal(h.last('RA_SITE_SEO_START'),undefined);
});
test('recuperação confirma os quatro títulos e libera a solicitação anterior',async()=>{
 const h=setup();const original=h.api.request(data).catch(e=>e.message);
 h.ready();const p=h.last('RA_SITE_SEO_START').payload;
 h.receive({kind:'RA_EXTENSION_SEO_START_RESULT',nonce:p.nonce,ok:true});
 const recovery=h.api.recover(data);const r=h.last('RA_SITE_SEO_RECOVER').payload;
 h.receive({kind:'RA_EXTENSION_SEO_RECOVER_RESULT',...r,ok:true,rawText:raw});
 const result=await recovery;h.api.acknowledgeRecovery(result);await original;
 assert.equal(h.api.hasPending(data),false);
 assert.equal(h.last('RA_SITE_SEO_RECOVER_ACK').nonce,r.nonce);
});
test('Ponte anterior continua gerando, mas não recebe protocolo de retomada novo',async()=>{
 const h=setup();const resume=h.api.resume(data);h.ready('1.0.46');
 assert.equal(await resume,null);assert.equal(h.last('RA_SITE_SEO_RESUME'),undefined);
 const request=h.api.request(data);h.ready('1.0.46');
 const p=h.last('RA_SITE_SEO_START').payload;
 h.receive({kind:'RA_EXTENSION_SEO_RESULT',...p,ok:true,rawText:raw});
 assert.equal((await request).titles.length,4);
});
