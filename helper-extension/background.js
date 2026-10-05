'use strict';

// Keep the V1.3 key so its stale execution is reconciled instead of forgotten.
const KEY = 'ra_ml_verify_product_auto_v4';
const QUEUE_KEY = 'ra_ml_verify_queue_v14';
const HISTORY_KEY = 'ra_ml_verify_history_v14';
const MAX_MS = 6 * 60 * 1000, GAP_MS = 1000, CHECK_MS = 6000, STALE_MS = 90000;
const PUBLISHER = 'https://redeachados-ml-publisher.onrender.com/*';
const ACTION_STAGES = {search:'locate',edit:'opening-item',verify:'verify-clicked',different:'different-clicked',decline:'not-found-clicked',continue:'confirmed',fill:'filled',send:'sending',return:'returning'};
const get = async (key, fallback = null) => (await chrome.storage.local.get(key))[key] ?? fallback;
const putState = async state => { await chrome.storage.local.set({[KEY]: state}); return state; };
const record = (state, event, detail = '') => ({...state,events:[...(state.events||[]),{at:Date.now(),event,detail}].slice(-40)});
let serial = Promise.resolve(), checking = null, checkTimer;
function transact(fn) { const result = serial.then(fn); serial = result.catch(() => {}); return result; }
function isSellerUrl(value) {
  try { const u = new URL(value); return u.protocol === 'https:' && ['vendedores.mercadolivre.com.br','www.mercadolivre.com.br','mercadolivre.com.br'].includes(u.hostname); }
  catch (_) { return false; }
}
function exactCatalogUrl(value, state) {
  try { return isSellerUrl(value) && new URL(value).pathname.split('/').filter(Boolean).some((part,i,parts) => part.toUpperCase()===state.itemId && parts[i-1]==='catalogo' && parts[i-2]==='publicar'); }
  catch (_) { return false; }
}
function catalogFlowUrl(value) {
  try { return isSellerUrl(value) && /\/publicar\/catalogo(?:\/|$)/i.test(new URL(value).pathname); }
  catch (_) { return false; }
}
async function tabExists(id) { try { const tab = await chrome.tabs.get(id); return isSellerUrl(tab.url || tab.pendingUrl); } catch (_) { return false; } }
async function openedFromPublisher(tab) {
  if (tab?.openerTabId == null) return false;
  try {
    const opener = await chrome.tabs.get(tab.openerTabId);
    const u = new URL(opener.url || opener.pendingUrl || '');
    return u.origin === 'https://redeachados-ml-publisher.onrender.com';
  } catch (_) { return false; }
}
async function archive(state, outcome) {
  const history = await get(HISTORY_KEY, []);
  const entry = {runId:state.runId,itemId:state.itemId,sku:state.sku,outcome,at:Date.now(),remoteConfirmed:state.remoteConfirmed===true,actions:state.actions,detail:state.checkMessage||state.error||''};
  await chrome.storage.local.set({[HISTORY_KEY]:[entry,...history.filter(row=>row.runId!==state.runId)].slice(0,40)});
}
function newState(marker, tabId, notice = '') {
  return {runId:marker.runId,itemId:marker.itemId,sku:marker.sku,userProductId:marker.userProductId,title:marker.title,closeOnFinish:marker.closeOnFinish===true,
    ownerTabId:tabId,startedAt:Date.now(),expiresAt:Date.now()+MAX_MS,status:'checking',stage:'locate',
    actions:{},lastActionAt:0,lastHeartbeatAt:Date.now(),targetConfirmed:false,responseConfirmed:false,
    remoteConfirmed:false,events:[],previousNotice:notice,checkMessage:'Conferindo se esta pendência ainda existe no Mercado Livre.'};
}
async function activate(marker, tabId, notice = '') {
  await chrome.storage.local.remove(['ra_ml_verify_product_auto_v2','ra_ml_verify_product_auto_v3','ra_ml_helper_single_tab_lock_v12']);
  return putState(newState(marker,tabId,notice));
}
async function promote(previous, notice) {
  const queue = await get(QUEUE_KEY, []);
  while (queue.length) {
    const request = queue.shift();
    if (!await tabExists(request.tabId)) continue;
    await chrome.storage.local.set({[QUEUE_KEY]:queue});
    const next=await activate(request.marker,request.tabId,notice);
    if (request.marker.itemId===previous.itemId && !previous.remoteConfirmed) {
      // A queued retry of the same SKU must not resend a previously reserved action.
      return putState({...next,actions:{...(previous.actions||{})},stage:previous.stage,
        lastActionAt:previous.lastActionAt,targetConfirmed:previous.targetConfirmed,
        responseConfirmed:previous.responseConfirmed});
    }
    return next;
  }
  await chrome.storage.local.set({[QUEUE_KEY]:[]});
  return previous;
}
function pendingReply(state, request) {
  return {ok:true,granted:false,queued:true,requestRunId:request.marker.runId,previousItemId:state.itemId,
    message:state.checkMessage||`Conferindo a execução anterior de ${state.itemId}. A próxima SKU será liberada automaticamente.`};
}
async function queueRequest(state, marker, tabId) {
  const queue = await get(QUEUE_KEY, []);
  // A repeated button click in the same tab updates its request; it never adds a second run.
  const request = {marker,tabId,queuedAt:Date.now()};
  const sameTab = queue.findIndex(row=>row.tabId===tabId);
  if (sameTab>=0) queue[sameTab]=request;
  else if (!queue.some(row=>row.marker.runId===marker.runId)) queue.push(request);
  await chrome.storage.local.set({[QUEUE_KEY]:queue.slice(0,20)});
  return pendingReply(state,request);
}
async function claim(state,sender) {
  if (state.ownerTabId===sender.tab.id) return state;
  if (state.status==='running' && state.stage==='verify-clicked' && Date.now()<Number(state.handoffUntil||0)) {
    const url=sender.url||sender.tab.url;
    const exact=exactCatalogUrl(url,state);
    const openedByOwner=sender.tab.openerTabId===state.ownerTabId;
    // A no-opener tab may claim only the exact MLB route. A rewritten/generic catalog route
    // is accepted only when Chrome confirms that it was opened by this run's owner tab.
    if ((exact && (sender.tab.openerTabId==null||openedByOwner)) || (openedByOwner && catalogFlowUrl(url)))
      return putState(record({...state,ownerTabId:sender.tab.id,handoffUntil:0},'tab-handoff'));
  }
  return null;
}
function scheduleCheck() {
  if (checkTimer) return;
  checkTimer = setTimeout(() => { checkTimer=null; reconcile().catch(()=>{}); },100);
}
async function publisherConfirm(itemId) {
  let tabs;
  try { tabs=await chrome.tabs.query({url:PUBLISHER}); } catch (_) { tabs=[]; }
  if (!tabs.length) return {ok:false,error:'Mantenha o Publisher aberto e conectado. A conferência continuará automaticamente.'};
  tabs.sort((a,b)=>Number(b.active)-Number(a.active));
  let error='Atualize a aba do Publisher uma vez para ativar a conferência automática do Helper V1.6.1.';
  for (const tab of tabs.slice(0,3)) {
    let timer;
    try {
      const result=await Promise.race([
        chrome.tabs.sendMessage(tab.id,{type:'RA_CONFIRM_PRODUCT',itemId},{frameId:0}),
        new Promise(resolve=>{timer=setTimeout(()=>resolve({ok:false,error:'A consulta demorou. Vou conferir novamente automaticamente.'}),12000);})
      ]);
      if (result?.itemId===itemId && typeof result.ok==='boolean') return result;
    } catch (_) { /* The tab may predate extension reload; try another Publisher tab. */ }
    finally { clearTimeout(timer); }
  }
  return {ok:false,error};
}
function confirmedResult(result,itemId) {
  return result?.ok===true && result.itemId===itemId && result.confirmed===true &&
    (result.ignored===true || (result.status==='active' && result.catalogListing===false && result.verifyProductPending===false));
}
async function reconcile() {
  if (checking) return checking;
  const job=(async()=>{
    const state=await transact(async()=>{
      const current=await get(KEY);
      if (!current || !['checking','running','awaiting-confirmation','finished'].includes(current.status)) return null;
      const queue=await get(QUEUE_KEY,[]);
      if (current.status==='finished' && (!queue.length||current.remoteConfirmed)) return null;
      if (Date.now()-Number(current.lastRemoteAttemptAt||0)<CHECK_MS) return null;
      return putState({...current,lastRemoteAttemptAt:Date.now()});
    });
    if (!state) return;
    // Network I/O stays outside the serialized mutations, so STOP/actions remain responsive.
    const result=await publisherConfirm(state.itemId);
    const ownerExists=await tabExists(state.ownerTabId);
    await transact(async()=>{
      let live=await get(KEY);
      if (!live||live.runId!==state.runId||!['checking','running','awaiting-confirmation','finished'].includes(live.status)) return;
      const queue=await get(QUEUE_KEY,[]);
      live={...live,lastRemoteCheckAt:Date.now(),checkMessage:result.ok?String(result.message||'Conferência realizada.'):String(result.error||'Não foi possível conferir agora.')};
      if (confirmedResult(result,live.itemId)) {
        live=await putState(record({...live,status:'finished',stage:'finished',finishedAt:Date.now(),remoteConfirmed:true,completionSource:'publisher',checkMessage:result.ignored?'Anúncio sem estoque/inativo retirado da fila.':'Mercado Livre confirmou: objetivo removido e anúncio tradicional preservado.'},'remote-confirmed'));
        await archive(live,'confirmed');
        await promote(live,`${live.itemId}: conclusão conferida. Seguindo para a próxima SKU.`);
        return;
      }
      if (!result.ok || result.itemId!==live.itemId) { await putState(live); return; }
      const actionable=result.status==='active'&&result.catalogListing===false&&result.verifyProductPending===true;
      if (live.status==='checking') {
        if (actionable) await putState({...live,status:live.actions.send&&!live.responseConfirmed?'awaiting-confirmation':'running',expiresAt:Date.now()+MAX_MS,checkMessage:live.actions.send&&!live.responseConfirmed?'Envio anterior preservado. Aguardando confirmação sem reenviar.':'Pendência confirmada. Executando a verificação desta SKU.'});
        else {
          live=await putState({...live,status:'needs-review',error:'O anúncio não está no estado esperado para este fluxo. Permanece pendente no Publisher.'});
          await archive(live,'needs-review');await promote(live,`${live.itemId} permanece pendente para revisão. Seguindo para a próxima solicitação.`);
        }
        return;
      }
      const stalled=!ownerExists||Date.now()>=Number(live.expiresAt||0)||Date.now()-Number(live.lastActionAt||live.startedAt||0)>STALE_MS;
      if (queue.length && stalled) {
        // Release an orphaned/stale execution without falsely completing its marketplace task.
        live=await putState({...live,status:'needs-review',error:'Execução anterior sem progresso; pendência preservada no Publisher.'});
        await archive(live,'pending');
        await promote(live,`${live.itemId} ainda está pendente e ficou guardado para revisão. Seguindo a próxima solicitação.`);
      } else {
        if (Date.now()>=Number(live.expiresAt||0) && !queue.length) live={...live,status:'needs-review',error:'A pendência ainda existe. O Helper encerrou esta tentativa sem repetir o envio.'};
        await putState(live);
      }
    });
  })();
  checking=job;
  try { await job; } finally { checking=null; }
}
async function handle(msg,sender) {
  if (sender.frameId!==0||sender.tab?.id==null||!isSellerUrl(sender.url||sender.tab.url)) return {ok:false,reason:'invalid-sender'};
  let state=await get(KEY);
  if (msg.type==='RA_BEGIN') {
    const m=msg.marker||{};
    if (!m.runId||!/^MLB\d+$/i.test(m.itemId||'')) return {ok:false,reason:'invalid-target'};
    const marker={runId:String(m.runId).slice(0,180),itemId:String(m.itemId).toUpperCase(),sku:String(m.sku||'').slice(0,100),userProductId:String(m.userProductId||'').toUpperCase(),title:String(m.title||'').slice(0,180),closeOnFinish:await openedFromPublisher(sender.tab)};
    if (state?.runId===marker.runId) {const owner=await claim(state,sender);return {ok:true,granted:!!owner,state:owner};}
    if (state && ['checking','running','awaiting-confirmation'].includes(state.status)) return queueRequest(state,marker,sender.tab.id);
    if (state?.status==='finished'&&!state.remoteConfirmed) return queueRequest(state,marker,sender.tab.id);
    if (state) await archive(state,state.remoteConfirmed?'confirmed':state.status);
    state=await activate(marker,sender.tab.id);
    return {ok:true,granted:true,state};
  }
  if (!state) return {ok:false,reason:'no-run'};
  if (msg.runId && msg.runId!==state.runId) {
    const queue=await get(QUEUE_KEY,[]),request=queue.find(row=>row.marker.runId===msg.runId&&row.tabId===sender.tab.id);
    if (request) {
      if (msg.type==='RA_STOP') {await chrome.storage.local.set({[QUEUE_KEY]:queue.filter(row=>row!==request)});return {ok:true,cancelled:true};}
      return pendingReply(state,request);
    }
    const past=(await get(HISTORY_KEY,[])).find(row=>row.runId===msg.runId);
    if (past) return {ok:true,retired:true,remoteConfirmed:past.remoteConfirmed,itemId:past.itemId,message:past.detail};
    return {ok:false,reason:'no-run'};
  }
  state=await claim(state,sender);
  if (!state) return {ok:true,granted:false,reason:'single-tab-protection'};
  if (msg.type==='RA_GET') {
    state=await putState({...state,lastHeartbeatAt:Date.now()});
    return {ok:true,granted:true,state};
  }
  if (msg.type==='RA_STOP') {
    await chrome.storage.local.set({[QUEUE_KEY]:[]});
    state=await putState(record({...state,status:'stopped',stage:'stopped',error:String(msg.reason||'Automação parada pelo usuário.')},'stopped'));
    return {ok:true,state};
  }
  if (state.status!=='running') return {ok:false,reason:'not-running',state};
  if (msg.type==='RA_FINISH') {
    if (!state.responseConfirmed||!state.actions.return) return {ok:false,reason:'unconfirmed-response'};
    state=await putState(record({...state,status:'awaiting-confirmation',stage:'awaiting-confirmation',checkMessage:'Retorno concluído. Conferindo a remoção da pendência no Publisher.'},'returned'));
    const closeScheduled=state.closeOnFinish===true;
    if (closeScheduled) setTimeout(()=>chrome.tabs.remove(sender.tab.id).catch(()=>{}),250);
    return {ok:true,state,closeScheduled};
  }
  if (msg.type==='RA_ACTION') {
    const action=msg.action;
    if (!Object.hasOwn(ACTION_STAGES,action)) return {ok:false,reason:'invalid-action'};
    if (state.actions[action]) return {ok:false,reason:'already-done',state};
    if (Date.now()-state.lastActionAt<GAP_MS) return {ok:false,reason:'wait'};
    if (Object.keys(state.actions).length>=10) return {ok:false,reason:'action-limit'};
    if (action==='return'&&!state.actions.send) return {ok:false,reason:'not-sent'};
    const now=Date.now();
    state=await putState(record({...state,actions:{...state.actions,[action]:now},lastActionAt:now,stage:ACTION_STAGES[action],targetConfirmed:state.targetConfirmed||['verify','decline'].includes(action),responseConfirmed:state.responseConfirmed||action==='return',handoffUntil:action==='verify'?now+45000:0},action));
    return {ok:true,granted:true,state};
  }
  return {ok:false,reason:'unknown-message'};
}
chrome.runtime.onMessage.addListener((msg,sender,respond)=>{
  transact(()=>handle(msg,sender)).then(result=>{respond(result);scheduleCheck();},error=>respond({ok:false,reason:String(error?.message||error)}));
  return true;
});
