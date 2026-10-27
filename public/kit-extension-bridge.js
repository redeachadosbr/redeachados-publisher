// Ponte ChatGPT existente: trabalho isolado por kit, sem API paga nem publicação.
export const KIT_BRIDGE_SESSION_KEY='raKitExtensionActiveV1';
export function isKitBridgeEvent(m,job){
 return Boolean(m&&job&&m.nonce&&m.nonce===job.nonce&&
  (!m.sku||String(m.sku)===String(job.kitSku))&&
  (m.itemId===undefined||String(m.itemId)===String(job.itemId))&&
  (m.modelId===undefined||String(m.modelId)===String(job.modelId)));
}
export function kitBridgePayload({kit,nonce,referenceDataUrl,prompts,completed=[]}){
 if(![2,3].includes(kit?.components?.length))throw Error('Kit com 2 ou 3 SKUs necessário.');
 if(!/^data:image\/jpeg;base64,[A-Za-z0-9+/=]+$/.test(referenceDataUrl||''))
  throw Error('Folha de referências dos produtos indisponível.');
 if(!Array.isArray(prompts)||prompts.length!==9||prompts.some(p=>!String(p).includes('SKU ')))
  throw Error('Os nove prompts do kit estão incompletos.');
 if(!nonce)throw Error('Identificador da geração ausente.');
 return {nonce,sku:kit.kitSku,itemId:'0',modelId:'0',
  imageUrl:referenceDataUrl,referenceDataUrl,
  imageUrls:kit.components.map(p=>p.imageUrl).filter(Boolean),
  prompts,completed:completed.filter(x=>Number.isInteger(x)&&x>=1&&x<=9),
  kitSku:kit.kitSku,kitMode:true,source:'rede-achados-kit'};
}
export function createKitPhotoStore(indexedDB=globalThis.indexedDB){
 let opening=null;
 const db=()=>opening||(opening=new Promise((resolve,reject)=>{
  if(!indexedDB){reject(Error('IndexedDB indisponível para confirmar as imagens.'));return;}
  const req=indexedDB.open('rede-achados-kit-photos',1);
  req.onupgradeneeded=()=>req.result.createObjectStore('photos',{keyPath:'key'});
  req.onsuccess=()=>resolve(req.result);
  req.onerror=()=>{opening=null;reject(req.error||Error('Armazenamento de fotos indisponível.'));};
 }));
 const run=async(mode,fn)=>{
  const database=await db();
  return new Promise((resolve,reject)=>{
   const tx=database.transaction('photos',mode),req=fn(tx.objectStore('photos'));
   let result;
   req.onsuccess=()=>result=req.result;
   tx.oncomplete=()=>resolve(result);
   tx.onerror=()=>reject(tx.error||req.error||Error('Falha ao armazenar foto.'));
   tx.onabort=()=>reject(Error('Gravação interrompida.'));
  });
 };
 const key=(kit,slot)=>String(kit)+'|'+Number(slot);
 return {
  put:(kit,slot,dataUrl)=>run('readwrite',s=>s.put({key:key(kit,slot),kitSku:kit,slot,
   dataUrl,updatedAt:Date.now()})),
  remove:(kit,slot)=>run('readwrite',s=>s.delete(key(kit,slot))),
  list:async kit=>(await run('readonly',s=>s.getAll())).filter(r=>r.kitSku===kit&&Number.isInteger(r.slot)&&r.slot>=1&&r.slot<=9)
 };
}
