import test from 'node:test';
import assert from 'node:assert/strict';
import {requestKitResearch} from '../public/kit-research-handoff.js';
import {parseKitChatResult} from '../public/kit-chat-result-parser.js';

const prompt=('Analise todos os códigos SKU WeDrop de acordo com complementaridade. ').repeat(12);
function createBridge(){
 const listeners=new Set(),messages=[];
 const target={
  location:{origin:'https://redeachados-shopee.onrender.com'},
  addEventListener:(type,fn)=>{if(type==='message')listeners.add(fn);},
  removeEventListener:(type,fn)=>{if(type==='message')listeners.delete(fn);},
  postMessage:(data,origin)=>messages.push({data,origin})
 };
 const emit=(data,extra={})=>{for(const fn of [...listeners])
  fn({source:target,origin:target.location.origin,data,...extra});};
 const ready=()=>{
  emit({kind:'RA_EXTENSION_READY',version:'1.0.61',healthy:true});
  return messages.find(x=>x.data.kind==='RA_SITE_DESC_START')?.data.payload;
 };
 return {target,messages,listeners,emit,ready};
}
test('botão de pesquisa envia orientação íntegra à Ponte existente e aceita JSON do ChatGPT',async t=>{
 t.mock.timers.enable({apis:['setTimeout']});
 const b=createBridge(),progress=[];
 const work=requestKitResearch({prompt},{target:b.target,onProgress:s=>progress.push(s)});
 assert.equal(b.messages[0].data.kind,'RA_EXTENSION_PROBE');
 const identity=b.ready();b.ready();
 assert.equal(b.messages.filter(x=>x.data.kind==='RA_SITE_DESC_START').length,1);
 assert.equal(identity.prompt,prompt);
 assert.match(identity.sku,/^KIT-RESEARCH-/);
 assert.equal(identity.itemId,'0');
 assert.equal(identity.modelId,'0');
 b.emit({kind:'RA_EXTENSION_DESC_START_RESULT',nonce:identity.nonce,ok:true});
 t.mock.timers.tick(90000);
 b.emit({kind:'RA_EXTENSION_DESC_PROGRESS',...identity,status:'Pesquisando combinações'});
 const json=JSON.stringify({kits:[{skus:['050','ABC'],motivo:'Complementaridade'}]});
 b.emit({kind:'RA_EXTENSION_DESC_RESULT',...identity,ok:true,rawText:JSON.stringify({description:json})});
 const result=await work;
 assert.equal(result.rawText,json);
 assert.deepEqual(parseKitChatResult(result.rawText,{allowedCodes:['050','ABC'],size:2,limit:20}).kits,[['050','ABC']]);
 assert.ok(progress.some(x=>x.includes('Pesquisando')));
 assert.equal(b.listeners.size,0);
 assert.equal(b.messages.at(-1).data.kind,'RA_SITE_DESC_ACK');
});
test('rejeita resposta de outra origem e encerra com erro informado, sem importar',async t=>{
 t.mock.timers.enable({apis:['setTimeout']});
 const b=createBridge(),work=requestKitResearch({prompt},{target:b.target});
 const id=b.ready();
 b.emit({kind:'RA_EXTENSION_DESC_RESULT',...id,ok:true,rawText:'{"kits":[]}'},{origin:'https://outro-site.com'});
 assert.equal(b.listeners.size,1);
 b.emit({kind:'RA_EXTENSION_DESC_START_RESULT',nonce:id.nonce,ok:false,error:'ChatGPT não conectado'});
 await assert.rejects(work,/ChatGPT não conectado/);
 assert.equal(b.listeners.size,0);
});
test('sem Ponte ou com catálogo além do limite, não informa sucesso falso',async t=>{
 t.mock.timers.enable({apis:['setTimeout']});
 const b=createBridge(),pending=requestKitResearch({prompt},{target:b.target});
 t.mock.timers.tick(8000);
 await assert.rejects(pending,/Ponte ChatGPT não detectada/);
 assert.equal(b.listeners.size,0);
 await assert.rejects(requestKitResearch({prompt:'x'.repeat(16001)},{target:b.target}),/16 mil caracteres/);
});
