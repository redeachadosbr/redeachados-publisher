// Um lote por vez. Navega na vitrine normal sem APIs internas.
let busy=false;
const delay=ms=>new Promise(resolve=>setTimeout(resolve,ms));
const nonceOk=s=>/^[a-f0-9-]{30,50}$/i.test(String(s||''));
const managerOk=sender=>/^https:\/\/redeachados-shopee\.onrender\.com\//.test(sender?.tab?.url||'');
const MANAGER_MATCH='https://redeachados-shopee.onrender.com/*';
async function injectManagerBridge(tabId){
 try{
  if(!Number.isInteger(tabId))return;
  const tab=await chrome.tabs.get(tabId);
  if(!managerOk({tab}))return;
  await chrome.scripting.executeScript({
   target:{tabId},files:['manager.js'],world:'ISOLATED'
  });
 }catch(error){
  console.warn('Ponte: não foi possível reativar a guia do Manager.',
   String(error?.message||error).slice(0,160));
 }
}
async function repairOpenManagerTabs(){
 try{
  const tabs=await chrome.tabs.query({url:MANAGER_MATCH});
  for(const tab of tabs)await injectManagerBridge(tab.id);
 }catch(error){
  console.warn('Ponte: não foi possível conferir as guias abertas.',
   String(error?.message||error).slice(0,160));
 }
}
chrome.runtime.onInstalled.addListener(()=>{void repairOpenManagerTabs();});
chrome.runtime.onStartup.addListener(()=>{void repairOpenManagerTabs();});
chrome.tabs.onActivated.addListener(info=>{void injectManagerBridge(info.tabId);});
chrome.tabs.onUpdated.addListener((tabId,info,tab)=>{
 if(info.status==='complete'&&managerOk({tab}))void injectManagerBridge(tabId);
});
function buildUrl(query,page=0){
 const u=new URL('https://shopee.com.br/search');
 u.searchParams.set('keyword',String(query).trim().slice(0,70));
 u.searchParams.set('page',String(page));u.searchParams.set('sortBy','sales');
 return u.href;
}
async function deliver(tabId,data){
 try{await chrome.tabs.sendMessage(tabId,data);}catch{}
}
async function waitLoaded(tabId){
 return await new Promise(resolve=>{
  let settled=false;
  const end=()=>{if(settled)return;settled=true;clearTimeout(timer);
   chrome.tabs.onUpdated.removeListener(listener);resolve();};
  const listener=(id,change)=>{if(id===tabId&&change.status==='complete')end();};
  const timer=setTimeout(end,22000);
  chrome.tabs.onUpdated.addListener(listener);
  chrome.tabs.get(tabId).then(tab=>{if(tab.status==='complete')end();}).catch(end);
 });
}
async function readPage(tabId){
 for(let i=0;i<4;i++){
  await delay(i===0?1800:1300);
  try{
   const result=await chrome.tabs.sendMessage(tabId,{kind:'RA_CURVE_READ_VISIBLE'});
   if(result?.ok&&Array.isArray(result.offers)&&(result.offers.length||i===3))return result;
   if(result?.blocked)return {ok:false,error:result.error||'Página indisponível.',offers:[]};
  }catch{}
 }
 return {ok:false,error:'Página sem cartões legíveis. Confira a busca no Chrome.',offers:[]};
}
async function batch(managerTab,nonce,jobs){
 let tabId=null;
 try{
  for(let i=0;i<jobs.length;i++){
   const query=jobs[i].query;
   await deliver(managerTab,{kind:'RA_CURVE_CHROME_PROGRESS',nonce,query,
    position:i+1,total:jobs.length});
   // Conferir a primeira página; ampliar à segunda somente se ainda não
   // houver três anúncios com vendas mensais explícitas visíveis.
   const collected=new Map();
   let failure='',pages=0,visibleCards=0;
   for(let page=0;page<2;page++){
    const url=buildUrl(query,page);
    if(tabId===null){
     const tab=await chrome.tabs.create({url,active:true});
     tabId=tab.id;
    }else await chrome.tabs.update(tabId,{url});
    await waitLoaded(tabId);
    const data=await readPage(tabId);
    pages++;
    if(!data.ok){failure=data.error||'Busca não confirmada.';break;}
    visibleCards+=Number(data.visibleCards||data.offers?.length||0);
    for(const offer of data.offers||[]){
     const id=String(offer.shopId)+':'+String(offer.itemId);
     if(!collected.has(id))collected.set(id,offer);
    }
    const monthly=[...collected.values()].filter(x=>x.monthlySold!==null).length;
    if(monthly>=3||collected.size>=100)break;
    await delay(900);
   }
   const offers=[...collected.values()].slice(0,100);
   await deliver(managerTab,{kind:'RA_CURVE_CHROME_RESULT',nonce,query,
    position:i+1,total:jobs.length,offers,
    error:failure, // não continuar automaticamente após bloqueio mesmo com itens parciais
    stats:{visible:offers.length,visibleCards,pages,
     monthly:offers.filter(x=>x.monthlySold!==null).length}});
   if(failure)break; // Nunca insistir em bloqueio/verificação da Shopee.
   if(i+1<jobs.length)await delay(1600);
  }
 }catch(error){
  await deliver(managerTab,{kind:'RA_CURVE_CHROME_ERROR',nonce,
   error:String(error.message||error).slice(0,220)});
 }finally{
  busy=false;
  await deliver(managerTab,{kind:'RA_CURVE_CHROME_DONE',nonce,total:jobs.length});
 }
}
chrome.runtime.onMessage.addListener((message,sender,respond)=>{
 if(message?.kind!=='RA_CURVE_BROWSER_BATCH')return;
 if(!managerOk(sender)||!nonceOk(message.nonce)){
  respond({ok:false,error:'Solicitação fora do Shopee Manager.'});return;
 }
 const jobs=Array.isArray(message.jobs)?message.jobs:[];
 if(!jobs.length||jobs.length>10||jobs.some(x=>!x||String(x.query||'').length<3||
  String(x.query||'').length>70)){
  respond({ok:false,error:'Lote inválido.'});return;
 }
 if(busy){respond({ok:false,error:'A Ponte já pesquisa outro lote.'});return;}
 busy=true;
 void batch(sender.tab.id,message.nonce,jobs);
 respond({ok:true});
});