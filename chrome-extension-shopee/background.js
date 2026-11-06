// Um lote por vez. Navega na vitrine normal sem APIs internas.
let busy=false,stopRequested=false;
// Somente a janela criada pela Ponte é gerenciada: nunca fechar abas do usuário.
const SESSION_KEY='raCurveResearchWindow';
async function currentSession(){
 const value=await chrome.storage.session.get(SESSION_KEY);
 return value?.[SESSION_KEY]||null;
}
async function closeSession(nonce,managerTabId){
 const session=await currentSession();
 if(!session||session.nonce!==nonce||session.managerTab!==managerTabId)return false;
 await chrome.storage.session.remove(SESSION_KEY);
 try{await chrome.windows.remove(session.windowId);}catch{}
 return true;
}
async function researchTab(managerTabId,nonce,url){
 const session=await currentSession();
 if(session){
  if(session.nonce!==nonce||session.managerTab!==managerTabId)
   throw Error('Já existe uma pesquisa em janela auxiliar. Interrompa a anterior antes de iniciar outra.');
  try{
   const tab=await chrome.tabs.get(session.tabId);
   const win=await chrome.windows.get(session.windowId);
   if(tab?.windowId===win?.id){
    // Recuperação visual mantém a mesma aba em modo normal até encerrar.
    return {id:tab.id,newWindow:false};
   }
  }catch{}
  await chrome.storage.session.remove(SESSION_KEY);
 }
 // É uma janela real minimizada: não promete processamento 100% invisível.
 const win=await chrome.windows.create({url,focused:false,state:'minimized',type:'normal'});
 if(!Number.isInteger(win?.id))throw Error('Chrome não autorizou a janela minimizada.');
 let tabId=win.tabs?.[0]?.id;
 if(!Number.isInteger(tabId)){
  const tabs=await chrome.tabs.query({windowId:win.id});
  tabId=tabs?.[0]?.id;
 }
 if(!Number.isInteger(tabId)){
  await chrome.windows.remove(win.id).catch(()=>{});
  throw Error('Janela auxiliar não apresentou uma aba válida.');
 }
 try{
  if(win.state!=='minimized')await chrome.windows.update(win.id,{state:'minimized'});
  await chrome.storage.session.set({[SESSION_KEY]:{
   nonce,managerTab:managerTabId,windowId:win.id,tabId
  }});
 }catch(error){
  await chrome.windows.remove(win.id).catch(()=>{});
  throw error;
 }
 return {id:tabId,newWindow:true};
}

// Quando a Shopee não renderiza minimizada, restaurar somente a nossa janela.
async function restoreResearchWindow(managerTabId,nonce){
 const session=await currentSession();
 if(!session||session.nonce!==nonce||session.managerTab!==managerTabId)
  throw Error('Sessão de pesquisa não encontrada para recuperação.');
 const win=await chrome.windows.get(session.windowId);
 if(win.state!=='normal')await chrome.windows.update(session.windowId,{state:'normal',focused:false});
 return session.tabId;
}
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
async function stage(tabId,nonce,name,detail,position=0,total=0,stats={}){
 await deliver(tabId,{kind:'RA_CURVE_CHROME_STEP',nonce,stage:name,
  detail:String(detail||'').slice(0,230),position,total,stats});
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
 let best=null,bestMonthly=-1;
 for(let i=0;i<4;i++){
  if(stopRequested)return {ok:false,error:'Pesquisa interrompida.',offers:[]};
  await delay(i===0?1800:1300);
  try{
   const result=await chrome.tabs.sendMessage(tabId,{kind:'RA_CURVE_READ_VISIBLE'});
   if(result?.blocked)return {ok:false,blocked:true,
    error:result.error||'Verificação humana exigida pela Shopee.',offers:[]};
   if(!result?.ok||!Array.isArray(result.offers))continue;
   const monthly=result.offers.filter(offer=>Number.isSafeInteger(offer.monthlySold)).length;
   if(result.offers.length||Number(result.visibleCards)>0){
    if(monthly>bestMonthly||(monthly===bestMonthly&&
       result.offers.length>(best?.offers?.length||0))){
     best=result;bestMonthly=monthly;
    }
    // O rótulo Vendido/Mês é renderizado DEPOIS do preço em várias vitrines.
    // Não encerrar a primeira leitura com 0 ou 1 anúncios mensais.
    if(monthly>=2)return result;
   }
  }catch{}
 }
 // Retornar a amostra parcial, deixando vendas mensais ausentes como pendentes.
 if(best)return best;
 return {ok:false,error:'Shopee não apresentou cartões verificáveis nesta pesquisa. '+
  'Não foi possível comprovar vendas mensais; nenhuma venda foi estimada.',offers:[]};
}
async function batch(managerTab,nonce,jobs){
 try{
  for(let i=0;i<jobs.length;i++){
   if(stopRequested)break;
   const query=jobs[i].query;
   await deliver(managerTab,{kind:'RA_CURVE_CHROME_PROGRESS',nonce,query,
    position:i+1,total:jobs.length});
   await stage(managerTab,nonce,'navegando',
    'Consultando SKU '+(i+1)+'/'+jobs.length+': '+query,i+1,jobs.length);
   // Conferir a primeira página e ampliar à segunda se a coleta mensal/preço
   // ainda estiver incompleta. O critério usa anúncios reais, nunca estimativas.
   const collected=new Map();
   let failure='',hardStop=false,pages=0,visibleCards=0,labelsSeen=0,labelsInCards=0;
   for(let page=0;page<2;page++){
    if(stopRequested)break;
    const url=buildUrl(query,page);
    const tab=await researchTab(managerTab,nonce,url);
    await stage(managerTab,nonce,'carregando',
     'Carregando página '+(page+1)+' na janela auxiliar minimizada.',
     i+1,jobs.length,{page:page+1});
    if(!tab.newWindow)await chrome.tabs.update(tab.id,{url});
    await waitLoaded(tab.id);
    if(stopRequested)break;
    await stage(managerTab,nonce,'lendo','Lendo cartões e vendas mensais da Shopee…',
     i+1,jobs.length,{page:page+1});
    let data=await readPage(tab.id);
    if(!data.ok&&!data.blocked&&!stopRequested){
     await stage(managerTab,nonce,'recuperando',
      'Shopee não carregou minimizada. Restaurando a mesma janela auxiliar sem foco.',
      i+1,jobs.length,{page:page+1});
     try{
      await restoreResearchWindow(managerTab,nonce);
      await chrome.tabs.reload(tab.id);
      await waitLoaded(tab.id);
      data=await readPage(tab.id);
     }catch(error){
      data={ok:false,error:'Falha ao recuperar a janela auxiliar: '+
       String(error?.message||error).slice(0,150),offers:[]};
     }
    }
    pages++;
    if(!data.ok){
     failure=data.error||'Não foi possível ler esta página.';
     hardStop=Boolean(data.blocked);
     break; // Preserva as evidências das páginas anteriores.
    }
    visibleCards+=Number(data.visibleCards||data.offers?.length||0);
    labelsSeen+=Number(data.monthlyLabelsVisible||0);
    labelsInCards+=Number(data.monthlyLabelsInCards||0);
    if(Number(data.monthlyLabelsVisible)>0&&Number(data.monthlyCards||0)===0)
     await stage(managerTab,nonce,'recuperando',
      'Vendido/Mês visível na Shopee, mas não vinculado aos cartões. Tentando recuperar.',
      i+1,jobs.length,{visible:visibleCards,monthlyLabels:data.monthlyLabelsVisible});
    for(const offer of data.offers||[]){
     const id=String(offer.shopId)+':'+String(offer.itemId);
     const previous=collected.get(id);
      if(!previous||(previous.monthlySold===null&&offer.monthlySold!==null))
       collected.set(id,offer);
    }
    const monthly=[...collected.values()].filter(x=>x.monthlySold!==null).length;
    await stage(managerTab,nonce,'comparando',
     collected.size+' concorrentes com vendas; '+monthly+
     ' com rótulo mensal explícito • '+visibleCards+' cartões inspecionados.',
     i+1,jobs.length,{visible:collected.size,monthly,pages});
    if((monthly>=5&&collected.size>=10)||collected.size>=100)break;
    await delay(900);
   }
   // Recuperação isolada, sem criar outras abas nem contornar CAPTCHA.
   if(!stopRequested&&!hardStop&&collected.size>0&&
      ![...collected.values()].some(x=>x.monthlySold!==null)){
    await stage(managerTab,nonce,'recuperando',
     'Ofertas sem dados mensais: recarregando uma vez a vitrine Em Destaque.',
     i+1,jobs.length,{visible:collected.size,monthlyLabels:labelsSeen});
    try{
     const session=await currentSession();
     if(session?.tabId){
      await chrome.tabs.update(session.tabId,{url:buildUrl(query,0)});
      await waitLoaded(session.tabId);
      const recovered=await readPage(session.tabId);
      if(recovered?.ok){
       labelsSeen+=Number(recovered.monthlyLabelsVisible||0);
       labelsInCards+=Number(recovered.monthlyLabelsInCards||0);
       for(const offer of recovered.offers||[]){
        const key=String(offer.shopId)+':'+String(offer.itemId);
        const old=collected.get(key);
        if(!old||(old.monthlySold===null&&offer.monthlySold!==null))
         collected.set(key,offer);
       }
      }
     }
    }catch(error){
     await stage(managerTab,nonce,'recuperando',
      'Releitura incompleta: '+String(error?.message||error).slice(0,110),
      i+1,jobs.length);
    }
   }
   if(stopRequested)break;
   const offers=[...collected.values()].slice(0,100);
   if(!failure&&offers.length===0)await stage(managerTab,nonce,'comparando',
    'Página carregada, mas sem vendas verificáveis. Nenhuma Curva será atribuída.',
    i+1,jobs.length,{visibleCards,pages});
   if(!hardStop&&offers.length)await stage(managerTab,nonce,'importando',
    'Cruzando os anúncios da SKU com catálogo e viabilidade de Ads.',
    i+1,jobs.length,{visible:offers.length,pages});
   const incomplete=Boolean(failure);
   const monthlyCount=offers.filter(x=>x.monthlySold!==null).length;
   const sourceStatus=monthlyCount?'monthly_captured':
    labelsSeen>0?'monthly_labels_unbound':
    offers.length?'monthly_not_rendered':'no_visible_offers';
   await stage(managerTab,nonce,'comparando',
    monthlyCount?monthlyCount+' anúncios com Vendido/Mês capturados.':
     sourceStatus==='monthly_labels_unbound'?
      'Rótulos mensais visíveis, mas sem vínculo confiável ao anúncio.':
      offers.length?'A Shopee não exibiu Vendido/Mês nos anúncios lidos.':
       'Nenhuma oferta legível nesta consulta.',
    i+1,jobs.length,{visible:offers.length,monthly:monthlyCount,labels:labelsSeen});
   await deliver(managerTab,{kind:'RA_CURVE_CHROME_RESULT',nonce,query,
    position:i+1,total:jobs.length,offers,
    error:hardStop?failure:incomplete&&!offers.length?failure:'',
    warning:incomplete?'Leitura parcial: '+failure:'',
    recoverable:incomplete&&!hardStop,
    stats:{visible:offers.length,visibleCards,pages,
     monthly:monthlyCount,monthlyLabelsVisible:labelsSeen,
     monthlyLabelsInCards:labelsInCards,sourceStatus}});
   if(hardStop)break; // CAPTCHA/verificação explícita deve parar.
   if(incomplete)await stage(managerTab,nonce,'continuando',
    'Esta consulta ficou incompleta; avançando para outra SKU da categoria.',
    i+1,jobs.length,{visible:offers.length,pages});
   if(i+1<jobs.length)await delay(1600);
  }
 }catch(error){
  await deliver(managerTab,{kind:'RA_CURVE_CHROME_ERROR',nonce,
   error:String(error.message||error).slice(0,220)});
 }finally{
  busy=false;
  await deliver(managerTab,{kind:'RA_CURVE_CHROME_DONE',nonce,total:jobs.length,
   cancelled:stopRequested});
  stopRequested=false;
  // Reusar uma janela auxiliar até o final; o Manager fecha somente a própria janela.
 }
}
chrome.tabs.onRemoved.addListener(tabId=>{
 void (async()=>{
  const session=await currentSession();
  if(session?.managerTab===tabId)await closeSession(session.nonce,session.managerTab);
  else if(session?.tabId===tabId)await chrome.storage.session.remove(SESSION_KEY);
 })().catch(()=>{});
});
chrome.windows.onRemoved.addListener(windowId=>{
 void (async()=>{
  const session=await currentSession();
  if(session?.windowId===windowId)await chrome.storage.session.remove(SESSION_KEY);
 })().catch(()=>{});
});
chrome.runtime.onMessage.addListener((message,sender,respond)=>{
 const kind=message?.kind;
 if(!['RA_CURVE_BROWSER_BATCH','RA_CURVE_BROWSER_CLOSE','RA_CURVE_BROWSER_CANCEL'].includes(kind))return;
 if(!managerOk(sender)||!nonceOk(message.nonce)){
  respond({ok:false,error:'Solicitação fora do Shopee Manager.'});return;
 }
 if(kind==='RA_CURVE_BROWSER_CLOSE'||kind==='RA_CURVE_BROWSER_CANCEL'){
  if(kind==='RA_CURVE_BROWSER_CANCEL')stopRequested=true;
  void closeSession(message.nonce,sender.tab.id).then(closed=>
   respond({ok:true,closed})).catch(error=>
   respond({ok:false,error:String(error?.message||error)}));
  return true;
 }
 const jobs=Array.isArray(message.jobs)?message.jobs:[];
 if(!jobs.length||jobs.length>10||jobs.some(x=>!x||String(x.query||'').length<3||
  String(x.query||'').length>70)){
  respond({ok:false,error:'Lote inválido.'});return;
 }
 if(busy){respond({ok:false,error:'A Ponte já pesquisa outro lote.'});return;}
 busy=true;stopRequested=false;
 void batch(sender.tab.id,message.nonce,jobs);
 respond({ok:true});
});