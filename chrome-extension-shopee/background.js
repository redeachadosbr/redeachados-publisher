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
// A leitura é acumulativa: não substituir uma varredura de 40 preços
// por uma releitura com dois selos Vendido/Mês.
const mergeEvidence=(old,next)=>!old?next:{
 ...old,...next,
 priceMin:next.priceMin??old.priceMin,
 historicalSold:next.historicalSold??old.historicalSold,
 monthlySold:next.monthlySold??old.monthlySold,
 monthlyPeriod:next.monthlySold!=null?next.monthlyPeriod:old.monthlyPeriod,
 monthlyEvidence:next.monthlySold!=null?next.monthlyEvidence:old.monthlyEvidence,
 monthlyLabelVisible:next.monthlyLabelVisible||old.monthlyLabelVisible
};
const normalizeTerms=text=>String(text||'').normalize('NFD')
 .replace(/[\u0300-\u036f]/g,'').toLowerCase()
 .replace(/\b(\d+)\s+(kg|ml|g)\b/g,'$1$2')
 .replace(/[^a-z0-9 ]+/g,' ').split(/\s+/)
 .filter(x=>x.length>=3&&!/^(?:com|para|uma|uns|dos|das|por|alta|tipo)$/.test(x));
const relatedToQuery=(query,offer)=>{
 const target=[...new Set(normalizeTerms(query))];
 const candidate=new Set(normalizeTerms(offer.productName));
 if(!target.length)return false;
 const matched=target.filter(term=>candidate.has(term)).length;
 return matched>=Math.max(2,Math.ceil(target.length*0.6));
};
const offerPriority=(query,offer)=>{
 const target=[...new Set(normalizeTerms(query))];
 const candidate=new Set(normalizeTerms(offer.productName));
 return target.filter(term=>candidate.has(term)).length*10+
  Number(offer.priceMin!==null)*2+Number(offer.monthlySold!==null);
};
async function readPage(tabId){
 const merged=new Map();let last=null,blocked=null,labelsSeen=0,labelsInCards=0;
 for(let i=0;i<4;i++){
  if(stopRequested)return {ok:false,error:'Pesquisa interrompida.',offers:[]};
  await delay(i===0?2400:1400);
  try{
   const result=await chrome.tabs.sendMessage(tabId,{kind:'RA_CURVE_READ_VISIBLE',
    deep:i===0||(i===3&&![...merged.values()].some(x=>x.monthlySold!=null))});
   if(result?.blocked){blocked=result;break;}
   if(!result?.ok||!Array.isArray(result.offers))continue;
   last=result;
   labelsSeen=Math.max(labelsSeen,Number(result.monthlyLabelsVisible||0));
   labelsInCards=Math.max(labelsInCards,Number(result.monthlyLabelsInCards||0));
   for(const offer of result.offers){
    const id=String(offer.shopId)+':'+String(offer.itemId);
    merged.set(id,mergeEvidence(merged.get(id),offer));
   }
   const monthly=[...merged.values()].filter(x=>x.monthlySold!==null).length;
   // 2 vendas mensais são um MÍNIMO, não justificam descartar os demais preços.
   if(i>=2&&merged.size>=45&&monthly>=5&&labelsSeen<=labelsInCards)break;
  }catch{}
 }
 if(blocked&&!merged.size)return {ok:false,blocked:true,
  error:blocked.error||'A Shopee exigiu verificação humana.',offers:[]};
 if(merged.size)return {...last,ok:true,offers:[...merged.values()],
  monthlyLabelsVisible:labelsSeen,monthlyLabelsInCards:labelsInCards,
  monthlyCards:[...merged.values()].filter(x=>x.monthlySold!==null).length,
  visibleCards:Math.max(Number(last?.visibleCards||0),merged.size)};
 return {ok:false,error:'Shopee não apresentou cartões verificáveis nesta pesquisa. '+
  'Não foi possível comprovar vendas mensais; nenhuma venda foi estimada.',offers:[]};
}
// Uma pesquisa do mesmo produto já aberta pode fornecer preços visíveis
// sem navegar, rolar ou mudar a guia do usuário.
const normalizedQuery=text=>String(text||'').normalize('NFD')
 .replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^a-z0-9]+/g,' ')
 .split(/\s+/).filter(x=>x&&!['de','do','da','dos','das','e','para','com'].includes(x)).join(' ');
async function recoverVisibleSearchAlreadyOpen(query,excludeTabId){
 let tabs=[];
 try{tabs=await chrome.tabs.query({url:[
  'https://shopee.com.br/search*','https://www.shopee.com.br/search*']});}
 catch{return null;}
 const merged=new Map();let labels=0,checked=0;
 for(const tab of tabs.slice(0,10)){
  if(!Number.isInteger(tab.id)||tab.id===excludeTabId||!tab.url)continue;
  let url;
  try{url=new URL(tab.url);}catch{continue;}
  if(!/^https:\/\/(?:www\.)?shopee\.com\.br$/.test(url.origin)||
     url.pathname!=='/search'||
     normalizedQuery(url.searchParams.get('keyword'))!==normalizedQuery(query))continue;
  let read;
  try{read=await chrome.tabs.sendMessage(tab.id,{kind:'RA_CURVE_READ_VISIBLE',deep:false});}
  catch{continue;}
  if(!read?.ok||!Array.isArray(read.offers))continue;
  checked++;
  labels+=Number(read.monthlyLabelsVisible||0);
  for(const offer of read.offers){
   const key=String(offer.shopId)+':'+String(offer.itemId);
   merged.set(key,mergeEvidence(merged.get(key),offer));
  }
 }
 return merged.size?{offers:[...merged.values()],labels,checked}:null;
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
   const openTab=await recoverVisibleSearchAlreadyOpen(query,(await currentSession())?.tabId);
   if(openTab){
    for(const offer of openTab.offers){
     const key=String(offer.shopId)+':'+String(offer.itemId);
     collected.set(key,mergeEvidence(collected.get(key),offer));
    }
    labelsSeen+=openTab.labels;
    visibleCards+=openTab.offers.length;
    await stage(managerTab,nonce,'lendo',
     'Pesquisa já aberta: '+openTab.offers.length+' anúncios recuperados sem alterar sua guia.',
     i+1,jobs.length,{visible:openTab.offers.length,
      monthly:openTab.offers.filter(x=>x.monthlySold!==null).length});
   }
   // A Shopee pode ter diversas páginas. 10 preços comparáveis são o alvo
   // da amostra; 2 não encerram a investigação, e anúncios de outra versão
   // não contam para a meta.
   for(let page=0;page<9;page++){
    if(stopRequested)break;
    const existing=[...collected.values()].filter(item=>
     relatedToQuery(query,item)&&item.priceMin!==null);
    if(existing.length>=10&&existing.filter(item=>item.monthlySold!==null).length>=2)break;
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
    // A janela minimizada pode suspender renderização/lazy loading e retornar
    // apenas 1 preço apesar de dezenas de anúncios. Revalidar sem focar janela.
    if(data.ok&&!stopRequested&&page===0&&
      (Number(data.offers?.length||0)<8||Number(data.monthlyCards||0)<2)){
     await stage(managerTab,nonce,'recuperando',
      'Vitrine parcial: '+Number(data.offers?.length||0)+
      ' anúncios. Restaurando sem foco para carregar mais preços e Vendido/Mês.',
      i+1,jobs.length,{visible:data.offers?.length||0,monthly:data.monthlyCards||0});
     try{
      await restoreResearchWindow(managerTab,nonce);
      await chrome.tabs.reload(tab.id);
      await waitLoaded(tab.id);
      const refreshed=await readPage(tab.id);
      if(refreshed?.ok){
       const merged=new Map();
       for(const item of [...data.offers,...refreshed.offers]){
        const key=item.shopId+':'+item.itemId;
        merged.set(key,mergeEvidence(merged.get(key),item));
       }
       data={...refreshed,offers:[...merged.values()],
        monthlyCards:[...merged.values()].filter(x=>x.monthlySold!==null).length,
        visibleCards:Math.max(Number(data.visibleCards||0),
         Number(refreshed.visibleCards||0),merged.size),
        monthlyLabelsVisible:Math.max(Number(data.monthlyLabelsVisible||0),
         Number(refreshed.monthlyLabelsVisible||0))};
      }
     }catch(error){
      await stage(managerTab,nonce,'recuperando',
       'Recuperação da vitrine parcial não concluída: '+
       String(error?.message||error).slice(0,100),i+1,jobs.length);
     }
    }
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
     collected.set(id,mergeEvidence(collected.get(id),offer));
    }
    const monthly=[...collected.values()].filter(x=>x.monthlySold!==null).length;
    await stage(managerTab,nonce,'comparando',
     collected.size+' concorrentes com vendas; '+monthly+
     ' com rótulo mensal explícito • '+visibleCards+' cartões inspecionados.',
     i+1,jobs.length,{visible:collected.size,monthly,pages});
    const related=[...collected.values()].filter(item=>
     relatedToQuery(query,item)&&item.priceMin!==null);
    const relatedMonthly=related.filter(item=>item.monthlySold!==null).length;
    await stage(managerTab,nonce,'comparando',
     'Amostra: '+related.length+'/10 anúncios de preço relacionados • '+
     relatedMonthly+' com vendas mensais • '+collected.size+' ofertas inspecionadas.',
     i+1,jobs.length,{related:related.length,relatedMonthly,pages});
    // Parar após encontrar até 10 candidatos com preços E 2 selos mensais.
    // Se não atingir, percorrer mais páginas existentes, até o limite.
    if(related.length>=10&&relatedMonthly>=2)break;
    if(collected.size>=300)break;
    await delay(1500);
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
        collected.set(key,mergeEvidence(collected.get(key),offer));
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
   // Priorizar a relevância com a consulta para que uma vitrine com 100+
   // anúncios gerais não expulse os 10 modelos realmente procurados.
   const allOffers=[...collected.values()];
   const offers=allOffers.sort((a,b)=>
    offerPriority(query,b)-offerPriority(query,a)).slice(0,100);
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
    offers.length?'monthly_capture_failed':'no_visible_offers';
   await stage(managerTab,nonce,'comparando',
    monthlyCount?monthlyCount+' anúncios com Vendido/Mês capturados.':
     sourceStatus==='monthly_labels_unbound'?
      'Rótulos mensais visíveis, mas sem vínculo confiável ao anúncio.':
      offers.length?'Falha de leitura de Vendido/Mês nesta consulta. Isso não confirma ausência do indicador na Shopee.':
       'Nenhuma oferta legível nesta consulta.',
    i+1,jobs.length,{visible:offers.length,monthly:monthlyCount,labels:labelsSeen});
   await deliver(managerTab,{kind:'RA_CURVE_CHROME_RESULT',nonce,query,
    position:i+1,total:jobs.length,offers,
    error:hardStop?failure:incomplete&&!offers.length?failure:'',
    warning:incomplete?'Leitura parcial: '+failure:offers.length&&!monthlyCount?
     'Vendido/Mês não capturado após releitura. Dados mensais pendentes; não significa zero vendas.':'',
    recoverable:incomplete&&!hardStop,
    stats:{visible:offers.length,visibleCards,pages,
     monthly:monthlyCount,monthlyLabelsVisible:labelsSeen,
     monthlyLabelsInCards:labelsInCards,sourceStatus,
     rawInspected:collected.size,openTabRecovered:openTab?.offers.length||0,
     relevantWithPrice:offers.filter(o=>relatedToQuery(query,o)&&o.priceMin!==null).length}});
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
