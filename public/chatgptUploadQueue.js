// Durable per-image delivery. A saved image is acknowledged before any UI refresh.
export function sameImageJob(a,b){
 return Boolean(a&&b&&a.nonce&&a.nonce===b.nonce&&String(a.sku)===String(b.sku)&&
  String(a.itemId)===String(b.itemId)&&String(a.modelId)===String(b.modelId));
}
export async function imageBlobSha256(blob){
 const bytes=await blob.arrayBuffer();
 const digest=await globalThis.crypto.subtle.digest('SHA-256',bytes);
 return Array.from(new Uint8Array(digest),v=>v.toString(16).padStart(2,'0')).join('');
}
export function createIndexedImageStore(idb=globalThis.indexedDB){
 let opened;
 const open=()=>opened||(opened=new Promise((resolve,reject)=>{
  if(!idb){reject(Error('O navegador não disponibilizou a recuperação das imagens.'));return;}
  const request=idb.open('rede-achados-image-delivery',1);
  request.onupgradeneeded=()=>request.result.createObjectStore('images',{keyPath:'key'});
  request.onerror=()=>{opened=null;reject(request.error||Error('Falha ao guardar a imagem no navegador.'));};
  request.onblocked=()=>{opened=null;reject(Error('Feche abas antigas do sistema para liberar a recuperação de imagens.'));};
  request.onsuccess=()=>{const db=request.result;db.onversionchange=()=>{db.close();opened=null;};resolve(db);};
 }));
 const run=async(mode,action)=>{
  const db=await open();
  return new Promise((resolve,reject)=>{
   const tx=db.transaction('images',mode);
   let result;
   const request=action(tx.objectStore('images'));
   request.onsuccess=()=>{result=request.result;};
   tx.oncomplete=()=>resolve(result);
   tx.onerror=()=>reject(tx.error||request.error||Error('Falha ao guardar o progresso.'));
   tx.onabort=()=>reject(tx.error||Error('Gravação local interrompida.'));
  });
 };
 return {get:key=>run('readonly',s=>s.get(key)),put:row=>run('readwrite',s=>s.put(row)),
  all:()=>run('readonly',s=>s.getAll())};
}
export function createImageUploadQueue({storage,send,onAck=()=>{},onSaved=()=>{},onWaiting=()=>{},
 onFailure=()=>{},setTimer=setTimeout,clearTimer=clearTimeout}){
 const inflight=new Map(),timers=new Map(),submitting=new Map(),controllers=new Map(),stopped=new Set();
 // Observer failures must never change a confirmed upload into a failed ACK.
 const notify=(fn,...args)=>{try{Promise.resolve(fn(...args)).catch(()=>{});}catch{}};
 const keyOf=row=>row.nonce+':'+row.slot;
 const valid=row=>{
  if(!row?.nonce||!row.sku||!/^\d+$/.test(String(row.itemId))||!/^\d+$/.test(String(row.modelId))||
   !Number.isInteger(row.slot)||row.slot<1||row.slot>9||!/^[a-f0-9]{64}$/.test(row.sha256))
   throw Error('Identificação da imagem inválida.');
 };
 function deliver(row){
  if(stopped.has(row.nonce))return Promise.resolve({stopped:true});
  if(inflight.has(row.key))return inflight.get(row.key);
  if(timers.has(row.key)){clearTimer(timers.get(row.key));timers.delete(row.key);}
  const work=(async()=>{
   try{
    const controller=new AbortController();controllers.set(row.key,controller);
   const result=await send(row,{signal:controller.signal});
   if(stopped.has(row.nonce))return {stopped:true};
    const asset=result?.image;
    if(!asset||asset.sha256!==row.sha256||Number(asset.slot)!==row.slot||
     String(asset.sku)!==String(row.sku)||String(asset.item_id)!==String(row.itemId)||
     String(asset.model_id)!==String(row.modelId)){
     const error=Error('O sistema não confirmou o arquivo desta posição.');error.retryable=false;throw error;
    }
    const saved={...row,status:'saved',blob:null,savedAt:Date.now(),attempts:0};
    // The server is authoritative; a local quota failure after success must not
    // prevent the extension from advancing. The endpoint is idempotent on retry.
    try{await storage.put(saved);}catch{}
    notify(onAck,row,true,'');
    notify(onSaved,saved,result);
    return {saved:true,image:asset};
   }catch(error){
    if(stopped.has(row.nonce))return {stopped:true};
    const retryable=error.retryable!==false;
    const next={...row,status:retryable?'pending':'blocked',attempts:(row.attempts||0)+1,
     error:String(error.message||error).slice(0,300)};
    try{await storage.put(next);}catch{}
    if(retryable){
     const delay=Math.min(30000,1500*2**Math.min(next.attempts-1,5));
     notify(onWaiting,next,delay);
     timers.set(row.key,setTimer(()=>{timers.delete(row.key);void deliver(next);},delay));
     return {pending:true};
    }
    notify(onAck,row,false,next.error);
    notify(onFailure,next);
    return {blocked:true,error:next.error};
   }finally{inflight.delete(row.key);controllers.delete(row.key);}
  })();
  inflight.set(row.key,work);
  return work;
 }
 function enqueue(input){
  valid(input);
  if(stopped.has(input.nonce))throw Error('Este envio foi encerrado. Solicite nova imagem.');
  const key=keyOf(input);
  if(submitting.has(key)){
   const active=submitting.get(key);
   if(active.sha256!==input.sha256)throw Error('A posição já recebeu outro arquivo nesta execução.');
   return active.promise;
  }
  const work=(async()=>{
   const previous=await storage.get(key);
   if(previous&&previous.sha256!==input.sha256)
    throw Error('A posição já recebeu outro arquivo nesta execução. Preserve a imagem pendente antes de refazer.');
   if(previous?.status==='saved'){
    notify(onAck,previous,true,'');
    return {saved:true,duplicate:true};
   }
   if(inflight.has(key))return inflight.get(key);
   const row={...input,key,status:'pending',attempts:previous?.attempts||0,createdAt:previous?.createdAt||Date.now()};
   await storage.put(row); // Commit the file before attempting a network upload.
   return deliver(row);
  })().finally(()=>submitting.delete(key));
  submitting.set(key,{sha256:input.sha256,promise:work});
  return work;
 }
 async function resume(job,{includeBlocked=false,onlySlots=null}={}){
  if(stopped.has(job?.nonce))return 0;
  // O servidor já confirmou os demais slots. Nunca reimportar um arquivo
  // de uma posição que deixou de estar pendente, mesmo se o ACK se perdeu.
  const permitted=Array.isArray(onlySlots)?
   new Set(onlySlots.filter(x=>Number.isInteger(x)&&x>=1&&x<=9)):null;
  const rows=(await storage.all()).filter(row=>sameImageJob(job,row)&&
   (!permitted||permitted.has(row.slot))&&
   (row.status==='pending'||(includeBlocked&&row.status==='blocked')));
  for(const row of rows)void deliver(row);
  return rows.length;
 }
 async function pending(job){
  return (await storage.all()).filter(row=>sameImageJob(job,row)&&row.status!=='saved').length;
 }
 async function cancel(job){
  const nonce=String(job?.nonce||'');
  if(!nonce)return 0;
  stopped.add(nonce);
  for(const [key,timer] of timers){
   if(key.startsWith(nonce+':')){clearTimer(timer);timers.delete(key);}
  }
  for(const [key,controller] of controllers){
   if(key.startsWith(nonce+':'))controller.abort();
  }
  const rows=(await storage.all()).filter(row=>row.nonce===nonce&&row.status!=='saved');
  for(const row of rows)await storage.put({...row,status:'paused',error:'Envio interrompido para corrigir imagem.'});
  return rows.length;
 }
 return {enqueue,resume,pending,cancel};
}
