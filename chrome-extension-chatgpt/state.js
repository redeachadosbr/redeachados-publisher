/* Estado pequeno e atômico. Imagens não participam das consultas de progresso. */
(function(root){
 'use strict';
 const KEY='redeAchadosChatGptBridgeJobV1', MEDIA='redeAchadosBridgeMediaV14_';
 const lock=(name,fn,options={})=>{
  if(!root.navigator?.locks?.request)throw Error('LOCK_UNAVAILABLE: atualize o Chrome para executar com proteção contra duplicidade.');
  return navigator.locks.request('rede-achados-'+name,options,fn);
 };
 const mediaKey=(job,kind)=>MEDIA+job.nonce+'_'+kind;
 async function normalize(job){
  if(!job)return null;
  const writes={};
  const reference=job.imageReference||job.current?.files?.find(f=>f.dataUrl);
  if(reference?.dataUrl){
   writes[mediaKey(job,'reference')]=reference;
   job.referenceFile={name:reference.name,type:reference.type};
  }
  if(typeof job.pending==='string'&&job.pending.startsWith('data:image/')){
   writes[mediaKey(job,'pending_'+job.slot)]=job.pending;job.pending=true;
  }
  delete job.imageReference;
  if(job.current)delete job.current.files;
  job.schema=14;job.controlEpoch=Number(job.controlEpoch||0);
  if(Object.keys(writes).length)await chrome.storage.local.set(writes);
  return job;
 }
 async function raw(){return (await chrome.storage.local.get(KEY))[KEY]||null;}
 async function get(){
  const job=await raw();
  if(!job||job.schema===14)return job;
  return lock('state',async()=>{
   const latest=await raw();if(!latest||latest.schema===14)return latest;
   await normalize(latest);await chrome.storage.local.set({[KEY]:latest});return latest;
  });
 }
 async function transact(fn){
  return lock('state',async()=>{
   const latest=await normalize(await raw());
   const result=await fn(latest);
   // Callback returns the state to write and an optional separate reply.
   if(result?.job){await normalize(result.job);await chrome.storage.local.set({[KEY]:result.job});}
   return result?.value;
  });
 }
 const halted=j=>!j||['paused','error','cancelled','replaced','done'].includes(j.status);
 async function save(job){
  return transact(saved=>{
   if(!saved||saved.nonce!==job?.nonce)throw Error('BRIDGE_JOB_REPLACED: a SKU anterior foi encerrada.');
   if(saved.controlEpoch!==job.controlEpoch || (halted(saved)&&!halted(job)))
    throw Error('Pausado pelo usuário. O comando anterior foi interrompido.');
   if(saved.current?.token===job.current?.token&&saved.current?.chatUrl&&!job.current?.chatUrl)
    job.current.chatUrl=saved.current.chatUrl;
   job.appTabId=saved.appTabId;
   return {job,value:job};
  });
 }
 async function putMedia(job,kind,value){
  return transact(saved=>{
   if(!saved||saved.nonce!==job.nonce||saved.controlEpoch!==job.controlEpoch||halted(saved))
    throw Error('Pausado pelo usuário. A imagem não será enviada.');
   // No metadata change: the caller checkpoints the pointer after storing bytes.
   return {value:chrome.storage.local.set({[mediaKey(job,kind)]:value})};
  });
 }
 async function getMedia(job,kind){return (await chrome.storage.local.get(mediaKey(job,kind)))[mediaKey(job,kind)];}
 async function removeMedia(job,kind){await chrome.storage.local.remove(mediaKey(job,kind));}
 async function control(nonce,status,error=''){
  return transact(job=>{
   if(!job||job.nonce!==nonce)return {value:null};
   if(job.status==='done'||job.status===status)return {value:job};
   job.status=status;job.error=error;job.controlEpoch++;job.autoRetry=null;
   return {job,value:job};
  });
 }
 root.BridgeState={KEY,lock,get,save,transact,putMedia,getMedia,removeMedia,control,halted};
})(globalThis);
