/* Rede Achados BR: sincronização do catálogo e histórico com Google Drive.
 * Executa no navegador; nenhuma senha ou token do Google fica neste arquivo.
 */
(()=>{
"use strict";
const ROOT="/api",ID="rede-ads-cloud";
const css=document.createElement("style");
css.textContent=`
#cloudBar{position:sticky;top:0;z-index:9000;display:flex;flex-wrap:wrap;justify-content:space-between;gap:9px;align-items:center;background:#241b0f;border-bottom:1px solid #bd8e35;color:#f6e8c4;padding:9px 17px;font:13px Arial,sans-serif}
#cloudBar button{padding:7px 12px;color:#101010;background:#edc56c;border:0;border-radius:7px;cursor:pointer}
#cloudBar .cloudSub{font-size:11px;color:#eed19c}
#cloudGate{position:fixed;inset:0;z-index:100000;display:flex;align-items:center;justify-content:center;background:#080b11f5;padding:22px}
#cloudGate[hidden]{display:none}
#cloudGate .panelGate{width:min(440px,96vw);padding:25px;border-radius:13px;border:1px solid #75592b;background:#171b24;color:#fff;font:15px Arial,sans-serif}
#cloudGate input{display:block;box-sizing:border-box;width:100%;padding:12px;margin:13px 0;background:#0f141b;border:1px solid #666;color:#fff;border-radius:7px}
#cloudGate button{background:#efc873;border:0;border-radius:7px;padding:11px 18px;font-weight:bold;cursor:pointer}
#cloudGate .error{color:#ffb8b8;font-size:13px}
`;
document.head.append(css);
const bar=document.createElement("div");bar.id="cloudBar";
bar.innerHTML='<div><strong>Rede Achados BR · Dados compartilhados</strong><div class="cloudSub" id="cloudState">Verificando acesso...</div></div><div><button id="cloudSyncNow" type="button">Sincronizar agora</button> <button id="cloudLogout" type="button">Sair</button></div>';
const gate=document.createElement("div");gate.id="cloudGate";
gate.innerHTML='<div class="panelGate"><h2>Rede Achados BR</h2><p>Entre com a senha de acesso para visualizar o histórico compartilhado.</p><form id="cloudLoginForm"><input type="password" id="cloudPassword" required autocomplete="current-password" placeholder="Senha do aplicativo"><button type="submit">Entrar</button></form><p class="error" id="cloudLoginError" role="alert"></p><small>O histórico é guardado no Google Drive da loja; não compartilhe a senha publicamente.</small></div>';
document.body.prepend(bar,gate);
const status=msg=>document.getElementById("cloudState").textContent=msg;
let logged=false,dirty=false,busy=false,repeat=false,deleted={products:new Set(),changes:new Set(),adsSnapshots:new Set(),history:new Set()};
const original={persistProducts,setChanges,setAdsSnapshots,setHistory};let syncTimer=null;let hooksInstalled=false;
async function api(path,data){
 const r=await fetch(ROOT+path,{method:data?"POST":"GET",credentials:"same-origin",
  headers:data?{"Content-Type":"application/json"}:{},
  body:data?JSON.stringify(data):undefined,cache:"no-store"});
 let j;try{j=await r.json()}catch{throw Error("Resposta não JSON do servidor.")}
 if(!r.ok||j.ok===false)throw Error(j.error||"Erro HTTP "+r.status);
 return j;
}
function snapshot(){return {products:readProducts(),changes:getChanges(),adsSnapshots:getAdsSnapshots(),history:getHistory()}}
function mergeRows(remote,local,key,stamp,dead){
 const map=new Map();
 for(const rec of [...remote,...local]){
  if(!rec||!rec[key]||dead[rec[key]])continue;
  const id=String(rec[key]),prev=map.get(id);
  const a=Date.parse(rec[stamp]||"")||0,b=Date.parse(prev?.[stamp]||"")||0;
  if(!prev||a>=b)map.set(id,rec);
 }
 return [...map.values()];
}
function applyRemote(payload){
 const s=payload.state||{},local=snapshot(),dead=s.deleted||{};
 const merged={
  products:mergeRows(s.products||[],local.products,"sku","updatedAt",dead.products||{}),
  changes:mergeRows(s.changes||[],local.changes,"id","timestamp",dead.changes||{}),
  adsSnapshots:mergeRows(s.adsSnapshots||[],local.adsSnapshots,"id","syncedAt",dead.adsSnapshots||{}),
  history:mergeRows(s.history||[],local.history,"id","savedAt",dead.history||{})
 };
 original.persistProducts(merged.products);original.setChanges(merged.changes);
 original.setAdsSnapshots(merged.adsSnapshots);original.setHistory(merged.history);
 if(typeof renderProductList==="function")renderProductList();
 if(typeof refreshProductSelect==="function")refreshProductSelect();
 if(typeof renderChangeHistory==="function")renderChangeHistory();
 return merged;
}
function installHooks(){
 if(hooksInstalled)return;hooksInstalled=true;
 const mapping={persistProducts:"products",setChanges:"changes",setAdsSnapshots:"adsSnapshots",setHistory:"history"};
 for(const [name,type] of Object.entries(mapping)){
  const base=original[name];
  const wrapper=(rows)=>{
   const previous=snapshot()[type],next=Array.isArray(rows)?rows:[];
   const key=type==="products"?"sku":"id";
   const have=new Set(next.map(x=>String(x[key]||"")));
   for(const old of previous)if(old&&old[key]&&!have.has(String(old[key])))deleted[type].add(String(old[key]));
   const ok=base(rows);
   if(logged){dirty=true;queueSave();}
   return ok;
  };
  if(name==="persistProducts")persistProducts=wrapper;
  if(name==="setChanges")setChanges=wrapper;
  if(name==="setAdsSnapshots")setAdsSnapshots=wrapper;
  if(name==="setHistory")setHistory=wrapper;
 }
}
function queueSave(){clearTimeout(syncTimer);status("Alterações locais pendentes de sincronização...");syncTimer=setTimeout(save,650);}
async function save(){
 if(!logged)return;
 if(busy){repeat=true;return;}
 busy=true;status("Salvando alterações no Google Drive...");
 try{
  const changes={};for(const [k,v] of Object.entries(deleted))changes[k]=[...v];
  const result=await api("/history",{action:"merge",state:snapshot(),deleted:changes});
  for(const k of Object.keys(deleted))deleted[k].clear();
  dirty=false;status("Sincronizado com Google Drive · "+new Date().toLocaleString("pt-BR"));
 }catch(e){status("Falha ao salvar no Drive: "+e.message+" · dados locais preservados");dirty=true;}
 finally{busy=false;if(repeat){repeat=false;queueSave();}}
}
async function pull(){
 if(busy||dirty)return;
 busy=true;
 try{
  const data=await api("/history",{action:"read"});
  applyRemote(data);status("Histórico atualizado do Google Drive · "+new Date().toLocaleTimeString("pt-BR"));
 }catch(e){status("Histórico compartilhado indisponível: "+e.message);}
 finally{busy=false;}
}
async function startAuthenticated(){
 logged=true;status("Conectando ao histórico...");
 // Antes de iniciar os hooks, reúna sem efeitos colaterais os dados do navegador e do Drive.
 try{
  const data=await api("/history",{action:"read"});
  applyRemote(data);
  status("Histórico carregado do Google Drive.");
  installHooks();
  dirty=true;queueSave(); // envia cadastros ou registros antigos que existiam somente no navegador
 }catch(e){
  status("Google Drive indisponível: "+e.message+" · seus dados ficam somente locais");
  installHooks();
 }
 gate.hidden=true;
}
async function init(){
 document.getElementById("cloudSyncNow").addEventListener("click",async()=>{if(dirty)await save();else await pull();});
 document.getElementById("cloudLogout").addEventListener("click",async()=>{
  try{await fetch("/api/access",{method:"DELETE",credentials:"same-origin"})}catch{}
  location.reload();
 });
 document.getElementById("cloudLoginForm").addEventListener("submit",async e=>{
  e.preventDefault();const input=document.getElementById("cloudPassword"),error=document.getElementById("cloudLoginError");
  error.textContent="";
  try{await api("/access",{password:input.value});input.value="";await startAuthenticated();}
  catch(ex){error.textContent=ex.message;}
 });
 try{
  const a=await api("/access");
  if(a.authenticated)await startAuthenticated();
  else{status("Acesso protegido: entre para sincronizar.");gate.hidden=false;}
 }catch(e){status("Acesso não configurado: "+e.message);document.getElementById("cloudLoginError").textContent=e.message;gate.hidden=false;}
 setInterval(()=>{if(logged&&!dirty&&!busy&&document.visibilityState==="visible")pull();},60000);
}
init();
})();
