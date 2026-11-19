import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';

const app=readFileSync(new URL('../public/app.js',import.meta.url),'utf8');
const start=app.indexOf('let optimizerChatBridgePickupTimer=');
const end=app.indexOf('// NOVO_CHAT_NAO_LIMPO',start);
assert.ok(start>0&&end>start,'recuperação da foto detectada ausente');
const recovery=app.slice(start,end);

function harness({sameSku=true,images=[],queuePending=0}={}){
 const scheduled=new Map(),messages=[],notices=[],acks=[],slots=new Set();
 let nextTimer=1;
 const job={nonce:'job-image-04',sku:'SKU-04',itemId:'12345',modelId:'0',
  slots:[4],expectedHashes:{}};
 const workflow={sku:sameSku?'SKU-04':'OUTRA',itemId:'12345',modelId:'0'};
 const context={
  optimizerChatBridgeJob:job,optimizerWorkflowPlan:workflow,
  optimizerChatBridgeIdentity:(a,b)=>a?.sku===b?.sku&&a?.itemId===b?.itemId&&a?.modelId===b?.modelId,
  $:selector=>selector==='#optimizerSku'?{value:'SKU-04'}:null,
  json:async()=>({images}),
  optimizerChatBridgeRecover:async()=>queuePending,
  optimizerWaitBridgeReply:async()=>({ok:true}),
  optimizerChatBridgeAck:(row,ok)=>acks.push([row.slot,ok]),
  optimizerChatBridgeNotice:message=>notices.push(message),
  optimizerImagesSavedSlots:{add:slot=>slots.add(slot)},
  optimizerWorkflowStage:'images',optimizerImagesLoad:async()=>{},
  window:{postMessage:m=>messages.push(m)},
  location:{origin:'https://redeachados-shopee.onrender.com'},
  setTimeout:(fn,delay)=>{const id=nextTimer++;scheduled.set(id,{fn,delay});return id;},
  clearTimeout:id=>scheduled.delete(id),
  URLSearchParams
 };
 vm.runInNewContext(recovery+'\nglobalThis.testPickup={watch:optimizerChatBridgeWatchDetectedImage,stop:optimizerChatBridgeStopPickupRecovery};',context);
 return {job,context,scheduled,messages,notices,acks,slots,
  watch:context.testPickup.watch,
  run:async()=>{
   const [id,timer]=scheduled.entries().next().value||[];
   if(!id)return false;
   scheduled.delete(id);
   await timer.fn();
   return timer.delay;
  },
  setImages:rows=>{images=rows;context.json=async()=>({images});}
 };
}

test('imagem 04 encontrada é retomada sem novo prompt e atualização repetida não adia timer',async()=>{
 const h=harness();
 h.watch({slot:4,status:'Imagem 04 encontrada no ChatGPT'});
 h.watch({slot:4,status:'Imagem 04 detectada, aguardando envio'});
 assert.equal(h.scheduled.size,1);
 assert.equal([...h.scheduled.values()][0].delay,12000);
 await h.run();
 assert.equal(h.messages.filter(x=>x.kind==='RA_SITE_WAKE').length,1);
 assert.equal(h.messages.filter(x=>x.kind==='RA_SITE_START').length,0);
 assert.equal(h.scheduled.size,1);
});

test('ACK perdido é recuperado do banco sem nova geração nem duplicação',async()=>{
 const h=harness({images:[{slot:4,sha256:'new-image-sha'}]});
 h.watch({slot:4,status:'Imagem pronta e detectada'});
 await h.run();
 assert.deepEqual(h.acks,[[4,true]]);
 assert.equal(h.messages.length,0);
 assert.equal(h.slots.has(4),true);
 assert.equal(h.scheduled.size,0);
});

test('não retoma outra SKU, outra posição nem status de geração pendente',()=>{
 const h=harness({sameSku:false});
 h.watch({slot:4,status:'Imagem 04 detectada'});
 assert.equal(h.scheduled.size,0);
 const own=harness();
 own.watch({slot:5,status:'Imagem 05 detectada'});
 own.watch({slot:4,status:'Ainda gerando imagem 04'});
 assert.equal(own.scheduled.size,0);
});

test('três tentativas limitam os WAKE e preservam a galeria',async()=>{
 const h=harness();
 h.watch({slot:4,status:'Imagem 04 localizada'});
 for(let i=0;i<3;i++)await h.run();
 assert.equal(h.messages.filter(x=>x.kind==='RA_SITE_WAKE').length,3);
 assert.equal(h.scheduled.size,0);
 assert.equal(h.slots.size,0);
 assert.ok(h.notices.at(-1).includes('três tentativas'));
});

test('arquivo já preservado na fila não pede captura paralela',async()=>{
 const h=harness({queuePending:1});
 h.watch({slot:4,status:'Foto encontrada'});
 await h.run();
 assert.equal(h.messages.length,0);
 assert.equal(h.scheduled.size,1);
});
