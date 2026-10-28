// Vídeos do kit no armazenamento local do navegador; separados por SKU.
// Nenhum upload ou publicação acontece ao escolher o arquivo.
export function createKitVideoStore(indexedDB=globalThis.indexedDB){
 let opening=null;
 const db=()=>opening||(opening=new Promise((resolve,reject)=>{
  if(!indexedDB){reject(Error('O navegador não permite salvar vídeos locais.'));return;}
  const req=indexedDB.open('rede-achados-kit-videos',1);
  req.onupgradeneeded=()=>req.result.createObjectStore('videos',{keyPath:'kitSku'});
  req.onsuccess=()=>resolve(req.result);
  req.onerror=()=>{opening=null;reject(req.error||Error('Armazenamento de vídeos indisponível.'));};
 }));
 const run=(mode,fn)=>db().then(database=>new Promise((resolve,reject)=>{
  const tx=database.transaction('videos',mode);
  const req=fn(tx.objectStore('videos'));let output;
  req.onsuccess=()=>output=req.result;
  tx.oncomplete=()=>resolve(output);
  tx.onerror=()=>reject(tx.error||req.error||Error('Não foi possível salvar o vídeo do kit.'));
  tx.onabort=()=>reject(Error('Gravação do vídeo interrompida.'));
 }));
 const key=sku=>{const s=String(sku||'');if(!/^KIT-[A-Z0-9-]{4,115}$/.test(s))throw Error('Identificador do kit inválido.');return s;};
 return {
  get:sku=>run('readonly',store=>store.get(key(sku))),
  put:(sku,file,meta)=>run('readwrite',store=>store.put({
   kitSku:key(sku),blob:file,name:String(file.name||'video.mp4').slice(0,130),
   mime:file.type,size:file.size,duration:meta.duration,width:meta.width,height:meta.height,updatedAt:Date.now()
  })),
  remove:sku=>run('readwrite',store=>store.delete(key(sku)))
 };
}
export const KIT_VIDEO_LIMIT=30*1024*1024;
export function kitVideoFileCheck(file){
 if(!file||!['video/mp4','video/quicktime','video/webm'].includes(file.type))
  throw Error('Selecione MP4, MOV ou WebM.');
 if(file.size<1000||file.size>KIT_VIDEO_LIMIT)
  throw Error('O vídeo do kit deve ter até 30 MB.');
 return true;
}
export function kitVideoMetaCheck({duration,width,height}){
 if(!Number.isFinite(duration)||duration<10||duration>60)
  throw Error('O vídeo precisa ter entre 10 e 60 segundos.');
 if(!Number.isInteger(width)||!Number.isInteger(height)||width<1||height<1||width>4096||height>4096)
  throw Error('A resolução do vídeo não é válida.');
 return {duration,width,height};
}
