'use strict';
importScripts('state.js','flow-policy.js','seo-automation.js','description-automation.js','kit-text-automation.js');
const APP_ORIGIN='https://redeachados-shopee.onrender.com';
const RUNNER_OWNER='redeAchadosRunnerOwnerV14';
const trustedSite=u=>{try{const p=new URL(u);return p.origin===APP_ORIGIN&&p.pathname.startsWith('/app/');}catch{return false;}};
const internal=sender=>sender.id===chrome.runtime.id&&String(sender.url||sender.tab?.url||'').startsWith(chrome.runtime.getURL(''));
function validateRequest(payload){
 if(!payload||typeof payload!=='object'||!Array.isArray(payload.prompts)||payload.prompts.length!==9)throw Error('Solicitação de imagens inválida.');
 const sku=String(payload.sku||'').trim(),id=String(payload.itemId||'').trim(),model=String(payload.modelId||'0').trim();
 if(!sku||sku.length>120||!/^[0-9]{1,18}$/.test(id)||!/^[0-9]{1,18}$/.test(model))throw Error('SKU / Item ID / variação inválidos.');
 const nonce=String(payload.nonce||'');if(!/^[a-z0-9_-]{12,90}$/i.test(nonce))throw Error('Identificador de sessão inválido.');
 const prompts=payload.prompts.map(p=>String(p||''));
 if(prompts.some(p=>p.length<40||p.length>20000))throw Error('Prompt não preenchido ou muito extenso.');
 const kitMode=payload.kitMode===true;
 const imageUrl=String(payload.imageUrl||'');if(imageUrl&&!kitMode){const u=new URL(imageUrl);if(u.protocol!=='https:'||!['susercontent.com','shopeeusercontent.com','shopeemobile.com','shopee.com.br'].some(d=>u.hostname===d||u.hostname.endsWith('.'+d)))throw Error('Fotografia original fora da Shopee.');}
 const completed=[...new Set((Array.isArray(payload.completed)?payload.completed:[]).map(Number))].filter(x=>Number.isInteger(x)&&x>=1&&x<=9);
 const deferredSlots=Array.isArray(payload.deferredSlots)?[...new Set(payload.deferredSlots)]:[];
 if(deferredSlots.some(slot=>slot!==3||completed.includes(slot)))throw Error('Posição pendente inválida. Somente a imagem 03 pode aguardar medidas.');
 const imageMode=String(payload.imageMode||'');
 if(imageMode&&!['improve','white-bg','custom'].includes(imageMode))throw Error('Tipo de edição de imagem inválido.');
 const referenceDataUrl=String(payload.referenceDataUrl||'');
 const kitSku=kitMode?String(payload.kitSku||'').trim():'';
 const imageUrls=kitMode?(Array.isArray(payload.imageUrls)?payload.imageUrls:[]):[];
 // Somente o botão EXPLÍCITO Recomeçar 9 imagens pode zerar um job ativo.
 const restart=payload.restart===true;
 // Autorização restrita a substituir uma sessão pausada ANTES do envio.
 // Nunca transforma uma retomada comum em "Recomeçar tudo".
 const replaceDirtyChat=payload.replaceDirtyChat===true;
 if(replaceDirtyChat&&(restart||imageMode||referenceDataUrl||kitMode||completed.length===9))
  throw Error('Recuperação do chat inconsistente; imagens existentes preservadas.');
 if(restart&&(completed.length!==0||imageMode||referenceDataUrl||kitMode))
  throw Error('Reinício total exige 0/9 posições anteriores e geração normal da imagem 01.');
 if(kitMode){
  // Um kit usa uma PRANCHA COM TODAS as fotos originais, não URL Shopee individual.
  // Autorização válida apenas se o botão do editor de kits enviou payload isolado.
  if(kitSku!==sku||!/^KIT[-_]/i.test(kitSku)||id!=='0'||model!=='0'||imageMode||restart)
   throw Error('Identificador ou modo do kit inconsistente.');
  if(!/^data:image\/jpeg;base64,[A-Za-z0-9+/=]+$/.test(referenceDataUrl)||referenceDataUrl.length>5*1024*1024)
   throw Error('Prancha com fotos originais das SKUs não recebida.');
  if(imageUrl&&imageUrl!==referenceDataUrl)throw Error('Referência visual do kit divergente.');
  if(![2,3,4].includes(imageUrls.length)||imageUrls.some(src=>{
   try{const u=new URL(src);return u.protocol!=='https:'||u.username||u.password||src.length>1500;}catch{return true;}
  }))throw Error('Kit deve trazer fotos HTTPS individuais de 2, 3 ou 4 SKUs.');
  if(prompts.some(p=>!p.includes('SKU ')||!/GERAR IMAGEM\s+0?[1-9]\/09/.test(p)))
   throw Error('Faltam as instruções do Prompt Mestre nas imagens do kit.');
 }else if(imageMode){
  if(!/^data:image\/jpeg;base64,[A-Za-z0-9+/=]+$/.test(referenceDataUrl)||referenceDataUrl.length>5*1024*1024)
   throw Error('A foto comercial selecionada não foi anexada corretamente pelo Shopee Manager.');
  if(completed.length!==8)throw Error('A edição precisa selecionar somente uma posição.');
 }else if(referenceDataUrl&&(!/^data:image\/jpeg;base64,[A-Za-z0-9+/=]+$/.test(referenceDataUrl)||referenceDataUrl.length>5*1024*1024))
  throw Error('Foto de referência inválida.');
 return {sku,itemId:id,modelId:model,nonce,prompts,imageUrl:kitMode?'':imageUrl,completed,deferredSlots,imageMode,referenceDataUrl,restart,replaceDirtyChat,
  kitMode,kitSku,imageUrls};
}
async function runnerTab(create=false){
 return BridgeState.lock('runner-tab',async()=>{
  const url=chrome.runtime.getURL('runner.html');
  const owner=(await chrome.storage.session.get(RUNNER_OWNER))[RUNNER_OWNER];
  let tab=owner?await chrome.tabs.get(owner).catch(()=>null):null;
  if(!tab||tab.url!==url)tab=(await chrome.tabs.query({})).find(t=>t.url===url);
  if(!tab&&create)tab=await chrome.tabs.create({url,active:true});
  if(tab)await chrome.storage.session.set({[RUNNER_OWNER]:tab.id});
  return tab||null;
 });
}
async function notifyRunner(kind,extra={}){
 const tab=await runnerTab(false);if(!tab)return null;
 return chrome.runtime.sendMessage({kind,targetTabId:tab.id,...extra}).catch(()=>null);
}
async function showRunner(nonce,{requireAck=false}={}){
 const tab=await runnerTab(true);
 await chrome.tabs.update(tab.id,{active:true}).catch(()=>{});
 // Não afirmar "Ponte reativada" sem ACK do runner executável.
 // Abas de extensão recém-criadas podem levar instantes para carregar.
 let error='Runner ainda não respondeu à retomada.';
 for(let attempt=0;attempt<14;attempt++){
  const reply=await chrome.runtime.sendMessage({kind:'RA_RUNNER_WAKE',nonce,targetTabId:tab.id}).catch(e=>({ok:false,error:String(e?.message||e)}));
  if(reply?.ok===true&&reply.nonce===nonce)return tab;
  // No primeiro RA_START o runner pode ainda estar carregando.
  // A confirmação rigorosa é exigida somente na retomada RA_WAKE_SITE.
  if(!requireAck)return tab;
  if(reply?.error)error=String(reply.error).slice(0,250);
  await new Promise(resolve=>setTimeout(resolve,650));
 }
 throw Error('RUNNER_SEM_ACK: '+error+' Abra a aba da Ponte e confira a mensagem da captura.');
}
let starting=null;
async function start(request,sender){
 const result=await BridgeState.transact(async current=>{
  const sameIdentity=current&&current.sku===request.sku&&current.itemId===request.itemId&&current.modelId===request.modelId;
  if(current?.nonce===request.nonce){
   if(!sameIdentity)throw Error('Identificador já usado por outra SKU.');
   // A replay is an acknowledgement, never a resume or reset.
   current.appTabId=sender.tab.id;
   return {job:current,value:{job:current,deduplicated:true}};
  }
  // A posição pendente nunca teve prompt enviado: portanto é seguro trocar
  // APENAS a sessão bloqueada pelo rascunho antigo, preservando todas as fotos.
  // Em qualquer outra situação, recusar para impedir gerações duplicadas.
  const safeDirtyReplacement=Boolean(sameIdentity&&request.replaceDirtyChat&&
   current.status==='paused'&&/^NOVO_CHAT_NAO_LIMPO:/.test(String(current.error||''))&&
   !current.pending&&!(current.current?.attempted||current.current?.sent)&&
   (current.completed||[]).every(slot=>request.completed.includes(slot)));
  if(request.replaceDirtyChat&&!safeDirtyReplacement&&current&&
     !['done','cancelled','replaced'].includes(current.status))
   throw Error('A Ponte não comprovou que a imagem pendente nunca foi enviada. Nenhuma imagem será recriada; recupere a conversa original.');
  if(sameIdentity&&!request.restart&&!safeDirtyReplacement&&
     !['done','cancelled','replaced'].includes(current.status))
   throw Error('Esta SKU já possui uma execução. Use Retomar ou Parar na Ponte; cliques repetidos não iniciam outra geração.');
  if(current?.seenNonces?.includes(request.nonce))throw Error('Comando antigo ignorado: esta sessão já foi substituída.');
  if(current)
   await chrome.storage.local.set({['redeAchadosChatGptBridgeReplaced_'+current.nonce]:{...current,status:'replaced',replacedAt:Date.now(),replacedBy:request.nonce}});
  // Um reinício total NUNCA reutiliza a conversa nem imagens pendentes da execução anterior.
  const previousOwnedChat=sameIdentity&&!request.restart&&!request.replaceDirtyChat&&current?.chatOwned&&current.chatTabId?
   {id:current.chatTabId,url:current.current?.chatUrl||current.chatUrl||'https://chatgpt.com/',token:current.current?.token||current.lastChatToken||''}:null;
  const job={...request,schema:14,controlEpoch:0,appTabId:sender.tab.id,chatTabId:null,chatOwned:false,previousOwnedChat,
   slot:BridgeFlowPolicy.next(request)||1,
   status:'active',createdAt:Date.now(),error:'',pending:null,current:null,autoRetry:null,
   seenNonces:[...(current?.seenNonces||[]),...(current?[current.nonce]:[])].slice(-32)};
  return {job,value:{job,deduplicated:false,previousNonce:current?.nonce}};
 });
 if(!result.deduplicated){
  if(result.previousNonce){
   await notifyRunner('RA_RUNNER_PAUSE',{nonce:result.previousNonce,replaced:true});
   // Preservar mídia e recibos da sessão arquivada, inclusive de outra SKU.
   // O novo nonce nunca pode reutilizar os arquivos antigos.

  }
  await showRunner(result.job.nonce);
 }
 return {ok:true,session:request.nonce.slice(0,6),deduplicated:result.deduplicated,status:result.job.status};
}
chrome.runtime.onMessage.addListener((message,sender,sendResponse)=>{
 const reply=promise=>{Promise.resolve(promise).then(sendResponse,e=>sendResponse({ok:false,error:String(e?.message||e).slice(0,300)}));return true;};
 if(message?.kind==='RA_KIT_TEXT_FETCH'){
  if(!sender.tab?.id||!trustedSite(sender.tab.url)||!sender.tab.url.includes('/app/kits'))
   return reply(Promise.reject(Error('Recuperação disponível apenas em Kits Inteligentes no Manager.')));
  return reply(RAKitTextAutomation.recover(message.payload));
 }
 if(message?.kind==='RA_DESC_START'){
  if(!sender.tab?.id||!trustedSite(sender.tab.url))return reply(Promise.reject(Error('A descrição deve começar no Shopee Manager.')));
  try{return reply(Promise.resolve(RADescriptionAutomation.start(message.payload,sender.tab.id)));}
  catch(e){return reply(Promise.reject(e));}
 }
 if(message?.kind==='RA_DESC_RECOVER'){
  if(!sender.tab?.id||!trustedSite(sender.tab.url))return reply(Promise.reject(Error('Recuperação fora do Manager.')));
  return reply(RADescriptionAutomation.recover(message.payload,sender.tab.id));
 }
 if(message?.kind==='RA_DESC_RECOVER_ACK'){
  if(!sender.tab?.id||!trustedSite(sender.tab.url))return reply(Promise.reject(Error('ACK fora do Manager.')));
  return reply(RADescriptionAutomation.acknowledgeRecovery(message,sender.tab.id));
 }
 if(message?.kind==='RA_DESC_DELIVERY_ACK'){
  if(!sender.tab?.id||!trustedSite(sender.tab.url))return reply(Promise.reject(Error('ACK da descrição fora do Manager.')));
  return reply(Promise.resolve(RADescriptionAutomation.acknowledge(message,sender.tab.id)));
 }
 if(message?.kind==='RA_SEO_RESUME'){
  if(!sender.tab?.id||!trustedSite(sender.tab.url))return reply(Promise.reject(Error('Retomada SEO fora do Manager.')));
  return reply(RASeoAutomation.resume(message.payload,sender.tab.id));
 }
 if(message?.kind==='RA_SEO_RECOVER'){
  if(!sender.tab?.id||!trustedSite(sender.tab.url))return reply(Promise.reject(Error('Recuperação SEO fora do Manager.')));
  return reply(RASeoAutomation.recover(message.payload,sender.tab.id));
 }
 if(message?.kind==='RA_SEO_RECOVER_ACK'){
  if(!sender.tab?.id||!trustedSite(sender.tab.url))return reply(Promise.reject(Error('Confirmação de recuperação fora do Manager.')));
  return reply(RASeoAutomation.acknowledgeRecovery(message,sender.tab.id));
 }
 if(message?.kind==='RA_SEO_DELIVERY_ACK'){
  if(!sender.tab?.id||!trustedSite(sender.tab.url))return reply(Promise.reject(Error('Confirmação SEO fora do Manager.')));
  return reply(Promise.resolve(RASeoAutomation.acknowledge(message,sender.tab.id)));
 }
 if(message?.kind==='RA_SEO_START'){
  if(!sender.tab?.id||!trustedSite(sender.tab.url))return reply(Promise.reject(Error('A pesquisa SEO deve começar no Shopee Manager.')));
  try{return reply(Promise.resolve(RASeoAutomation.start(message.payload,sender.tab.id)));}
  catch(e){return reply(Promise.reject(e));}
 }
 if(message?.kind==='RA_START'){
  if(!sender.tab?.id||!trustedSite(sender.tab.url))return reply(Promise.reject(Error('A solicitação deve partir do Shopee Manager.')));
  let request;try{request=validateRequest(message.payload);}catch(e){sendResponse({ok:false,error:e.message});return;}
  if(starting){
   if(starting.nonce===request.nonce)return reply(starting.promise);
   sendResponse({ok:false,error:'A Ponte está abrindo uma execução. Aguarde a confirmação antes de iniciar outra SKU.'});return;
  }
  const promise=start(request,sender).finally(()=>{starting=null;});
  starting={nonce:request.nonce,promise};return reply(promise);
 }
 if(message?.kind==='RA_RUNNER_REGISTER'&&internal(sender)){
  return reply((async()=>{
   const id=message.tabId;
   const caller=Number.isInteger(id)?await chrome.tabs.get(id).catch(()=>null):null;
   if(!caller||caller.url!==chrome.runtime.getURL('runner.html')||(sender.tab&&sender.tab.id!==id))return {ok:false};
   const tab=await runnerTab(false);return {ok:tab?.id===id,ownerId:tab?.id};
  })());
 }
 if(message?.kind==='RA_UPLOADED'&&trustedSite(sender.tab?.url)){
  return reply((async()=>{
   const j=await BridgeState.get();
   if(!j||j.nonce!==message.nonce||j.appTabId!==sender.tab.id||j.slot!==message.slot)return {ok:false};
   await notifyRunner('RA_RUNNER_UPLOAD_ACK',{nonce:j.nonce,slot:j.slot,ok:message.ok===true,error:String(message.error||'').slice(0,300)});
   return {ok:true};
  })());
 }
 if((message?.kind==='RA_ABORT'&&trustedSite(sender.tab?.url))||(message?.kind==='RA_PAUSE_ALL'&&internal(sender))){
  return reply((async()=>{
   const current=await BridgeState.get();
   const nonce=message.kind==='RA_PAUSE_ALL'?current?.nonce:message.nonce;
   const job=await BridgeState.control(nonce,'paused','Interrompido pelo usuário');
   if(!job)return {ok:false};
   await notifyRunner('RA_RUNNER_PAUSE',{nonce:job.nonce});return {ok:true};
  })());
 }
 // Clique do usuário no Runner: ler diretamente o estado salvo do editor
 // (obtido na aba autorizada) e sincronizar sem callback circular do site.
 if(message?.kind==='RA_RUNNER_SYNC_KIT'&&internal(sender)){
  return reply((async()=>{
   if(String(sender.url||sender.tab?.url||'')!==chrome.runtime.getURL('runner.html'))throw Error('Ação exclusiva da aba da Ponte.');
   const data=message.payload||{}, nonce=String(data.nonce||''), sku=String(data.sku||'');
   const appTabId=Number(data.appTabId);
   const tab=Number.isInteger(appTabId)?await chrome.tabs.get(appTabId).catch(()=>null):null;
   if(!tab||!trustedSite(tab.url)||!tab.url.includes('/app/kits'))throw Error('Abra o editor Kits Inteligentes do Manager.');
   if(!/^KIT[-_]/i.test(sku)||!nonce||!Array.isArray(data.completed)||
      data.completed.some(n=>!Number.isInteger(n)||n<1||n>9)||
      !Array.isArray(data.prompts)||data.prompts.length!==9||
      data.prompts.some(t=>typeof t!=='string'||t.length<40||t.length>20000))
    throw Error('Dados da recuperação do kit inválidos.');
   const completed=[...new Set(data.completed)].sort((a,b)=>a-b);
   const result=await BridgeState.transact(job=>{
    if(!job||job.nonce!==nonce||job.kitMode!==true||job.sku!==sku||
       job.itemId!=='0'||job.modelId!=='0'||
       ['done','cancelled','replaced'].includes(job.status))
     return {value:{ok:false,error:'Nenhuma sessão preservada deste kit foi encontrada.'}};
    const next=Array.from({length:9},(_,i)=>i+1).find(slot=>!completed.includes(slot));
    if(!next)return {value:{ok:false,error:'As nove imagens já estão importadas.'}};
    // Só descartar uma posição se o Manager comprovar outro primeiro vazio.
    if(job.slot!==next){job.current=null;job.pending=null;}
    job.completed=completed;job.slot=next;job.prompts=data.prompts;
    job.appTabId=appTabId;job.status='active';job.error='';
    job.controlEpoch=Number(job.controlEpoch||0)+1;job.autoRetry=null;
    return {job,value:{ok:true,nonce,sku,slot:next,completed}};
   });
   return result;
  })());
 }
 if(message?.kind==='RA_CONTINUE_SITE'&&trustedSite(sender.tab?.url)){
  return reply((async()=>{
   const data=message.payload||{};
   const sku=String(data.sku||'').trim(),itemId=String(data.itemId||''),modelId=String(data.modelId||'');
   const supplied=Array.isArray(data.completed)?data.completed:[];
   if(!sku||!/^[0-9]{1,18}$/.test(itemId)||!/^[0-9]{1,18}$/.test(modelId)||
      supplied.some(x=>!Number.isInteger(x)||x<1||x>9))throw Error('Dados de recuperação inválidos.');
   const confirmed=[...new Set(supplied)].sort((a,b)=>a-b);
   const deferredSlots=Array.isArray(data.deferredSlots)?[...new Set(data.deferredSlots)]:[];
   if(deferredSlots.some(slot=>slot!==3||confirmed.includes(slot)))throw Error('Posição pendente inválida.');
   const updatedPrompts=Array.isArray(data.prompts)&&data.prompts.length===9&&
      data.prompts.every(v=>typeof v==='string'&&v.length>=40&&v.length<=20000)?data.prompts:null;
   let updatedImageUrl=null;
   if(data.imageUrl){
    const u=new URL(String(data.imageUrl));
    if(u.protocol!=='https:'||!['susercontent.com','shopeeusercontent.com','shopeemobile.com','shopee.com.br']
      .some(d=>u.hostname===d||u.hostname.endsWith('.'+d)))throw Error('Referência visual inválida.');
    updatedImageUrl=u.toString();
   }

   const recovered=await BridgeState.transact(job=>{
    if(!job||job.sku!==sku||job.itemId!==itemId||job.modelId!==modelId||
       ['done','cancelled','replaced'].includes(job.status))
      return {value:{ok:false,reason:'NO_RECOVERABLE_JOB'}};
    const next=BridgeFlowPolicy.next({completed:confirmed,deferredSlots});
    if(!next)return {value:{ok:false,reason:confirmed.length===9?'ALREADY_COMPLETE':'DIMENSIONS_PENDING'}};
    // O servidor é a fonte de verdade: somente posições realmente salvas serão puladas.
    // Uma imagem gerada e ainda não importada continua pendente, para reenvio.
    if(job.slot!==next||confirmed.includes(job.slot)){
      job.current=null;job.pending=null;
    }
    if(updatedPrompts)job.prompts=updatedPrompts;
    if(updatedImageUrl)job.imageUrl=updatedImageUrl;
    job.completed=confirmed;job.deferredSlots=deferredSlots;job.slot=next;job.status='active';job.error='';
    job.appTabId=sender.tab.id;job.controlEpoch=Number(job.controlEpoch||0)+1;
    job.autoRetry=null;
    return {job,value:{ok:true,nonce:job.nonce,slot:next,completed:confirmed}};
   });
   // O Manager deve registrar o nonce recuperado antes de receber eventos do runner.
   // A ativacao do runner acontece somente apos RA_WAKE_SITE.
   return recovered;
  })());
 }
 if(message?.kind==='RA_WAKE_SITE'&&trustedSite(sender.tab?.url)){
  return reply((async()=>{
   const job=await BridgeState.get();
   if(!job||job.nonce!==message.nonce||job.appTabId!==sender.tab.id||BridgeState.halted(job))
    return {ok:false,error:'Sessão não está ativa para esta aba do Manager.'};
   await showRunner(job.nonce,{requireAck:true});
   return {ok:true};
  })());
 }
 if(message?.kind==='RA_RESUME'&&internal(sender)){
  return reply((async()=>{
   const job=await BridgeState.control(message.nonce,'active');
   if(!job)return {ok:false};await showRunner(job.nonce);return {ok:true};
  })());
 }
 if(message?.kind==='RA_SHOW_RUNNER'&&internal(sender)){
  return reply((async()=>{const job=await BridgeState.get();await showRunner(job?.nonce);return {ok:true};})());
 }
 if(message?.kind==='RA_STATUS_REQUEST'&&(internal(sender)||trustedSite(sender.tab?.url))){
  return reply((async()=>{const j=await BridgeState.get();return {ok:true,version:chrome.runtime.getManifest().version,job:j?{nonce:j.nonce,sku:j.sku,slot:j.slot,status:j.status,error:j.error,completed:j.completed.length}:null};})());
 }
});
const isConversation=url=>{try{const u=new URL(url);return u.origin==='https://chatgpt.com'&&/^\/c\/[a-z0-9-]+\/?$/i.test(u.pathname)&&!u.search&&!u.hash;}catch{return false;}};
async function checkpointChatUrl(tabId,url){
 if(!isConversation(url))return;
 await BridgeState.transact(state=>{
  if(!state||state.chatTabId!==tabId||BridgeState.halted(state)||!state.current?.attempted||isConversation(state.current.chatUrl))return {};
  const age=Date.now()-Number(state.current.attemptedAt||0);if(age<0||age>120000)return {};
  state.current.chatUrl=url;state.chatUrl=url;return {job:state};
 });
}
chrome.tabs.onUpdated.addListener((tabId,changeInfo)=>{if(isConversation(changeInfo?.url))void checkpointChatUrl(tabId,changeInfo.url).catch(()=>{});});
chrome.webNavigation.onHistoryStateUpdated.addListener(details=>{
 if(details.frameId===0&&isConversation(details.url))void checkpointChatUrl(details.tabId,details.url).catch(()=>{});
},{url:[{hostEquals:'chatgpt.com',pathPrefix:'/c/'}]});
