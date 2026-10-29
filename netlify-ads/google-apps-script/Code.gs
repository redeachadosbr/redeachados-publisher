/**
 * Rede Achados BR · Histórico compartilhado no Google Drive
 * Implante como Google Apps Script Web App executado "Como eu", acesso "Qualquer pessoa".
 * Segurança: segredo obrigatório, conhecido somente por este script e pela Netlify Function.
 * Propriedades do script (Configurações do projeto → Propriedades do script):
 * DRIVE_FOLDER_ID   = ID da pasta particular onde ficará o JSON
 * HISTORY_API_SECRET = segredo aleatório com 32+ caracteres
 * NÃO coloque segredos na interface HTML nem no GitHub.
 */
const HISTORY_FILENAME = "Rede_Achados_BR_Ads_Historico.json";
const EMPTY_STATE = () => ({schemaVersion:1,products:[],changes:[],adsSnapshots:[],history:[],
  deleted:{products:{},changes:{},adsSnapshots:{},history:{}},savedAt:null});
function json_(value) {
 return ContentService.createTextOutput(JSON.stringify(value)).setMimeType(ContentService.MimeType.JSON);
}
function getFile_(create) {
 const id=PropertiesService.getScriptProperties().getProperty("DRIVE_FOLDER_ID");
 if(!id) throw new Error("DRIVE_FOLDER_ID não configurado no Apps Script.");
 const folder=DriveApp.getFolderById(id);
 const files=folder.getFilesByName(HISTORY_FILENAME);
 if(files.hasNext())return files.next();
 if(!create)return null;
 return folder.createFile(HISTORY_FILENAME,JSON.stringify(EMPTY_STATE(),null,2),MimeType.PLAIN_TEXT);
}
function load_(file) {
 if(!file)return EMPTY_STATE();
 const raw=file.getBlob().getDataAsString("UTF-8");
 const parsed=JSON.parse(raw);
 const d=EMPTY_STATE();
 for(const key of ["products","changes","adsSnapshots","history"])if(Array.isArray(parsed[key]))d[key]=parsed[key];
 if(parsed.deleted&&typeof parsed.deleted==="object")
  for(const key of Object.keys(d.deleted))if(parsed.deleted[key]&&typeof parsed.deleted[key]==="object")d.deleted[key]=parsed.deleted[key];
 d.savedAt=parsed.savedAt||null;
 return d;
}
function mergeArray_(current,incoming,key,tsKey,deleted,max) {
 const data=new Map();
 for(const raw of current.concat(Array.isArray(incoming)?incoming:[])) {
  if(!raw||typeof raw!=="object")continue;
  const id=String(raw[key]||"").trim();
  if(!id||id.length>180||Object.hasOwn(deleted,id))continue;
  const prev=data.get(id);
  if(!prev || Date.parse(raw[tsKey]||0)>=Date.parse(prev[tsKey]||0))data.set(id,raw);
 }
 return [...data.values()].slice(-max);
}
function applyMerge_(current,payload) {
 const names=["products","changes","adsSnapshots","history"];
 const newData=payload.state||{};
 const incomingDeleted=payload.deleted||{};
 for(const name of names){
  const deleted=current.deleted[name]||{};
  const ids=Array.isArray(incomingDeleted[name])?incomingDeleted[name].slice(0,500):[];
  for(const id of ids)if(typeof id==="string"&&id.length<180)deleted[id]=new Date().toISOString();
  current.deleted[name]=deleted;
 }
 const schema=[
  ["products","sku","updatedAt",20000],
  ["changes","id","timestamp",50000],
  ["adsSnapshots","id","syncedAt",15000],
  ["history","id","savedAt",30000]
 ];
 for(const [name,id,time,max] of schema){
  const incoming=Array.isArray(newData[name])?newData[name]:[];
  current[name]=mergeArray_(current[name],incoming,id,time,current.deleted[name],max);
 }
 current.savedAt=new Date().toISOString();
 return current;
}
function doPost(e) {
 try{
  const raw=e&&e.postData?String(e.postData.contents||""):"";
  if(raw.length>2000000)throw new Error("Pacote muito grande para o histórico.");
  const input=JSON.parse(raw);
  const secret=PropertiesService.getScriptProperties().getProperty("HISTORY_API_SECRET");
  if(!secret||secret.length<32||String(input.secret||"")!==secret)
   throw new Error("Acesso ao histórico não autorizado.");
  if(!["read","merge"].includes(input.action))throw new Error("Operação inválida.");
  const lock=LockService.getScriptLock();
  lock.waitLock(20000);
  try{
   const file=getFile_(input.action==="merge");
   let state=load_(file);
   if(input.action==="merge"){
    state=applyMerge_(state,input);
    file.setContent(JSON.stringify(state));
   }
   return json_({ok:true,state});
  }finally{lock.releaseLock();}
 }catch(err){return json_({ok:false,error:String(err&&err.message||err).slice(0,260)})}
}
