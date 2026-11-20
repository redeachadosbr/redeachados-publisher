'use strict';
/* Navegador autorizado pelo usuário. Interface ChatGPT visível; sem endpoints privados da OpenAI. */
const KEY='redeAchadosChatGptBridgeJobV1', ORIGIN='https://redeachados-shopee.onrender.com';
const output=document.getElementById('status'),progress=document.getElementById('progress');
const repair=document.getElementById('repair'),chatChoice=document.getElementById('chatChoice'),chatLink=document.getElementById('chatLink');
document.getElementById('bridgeVersion').textContent=chrome.runtime.getManifest().version;
const choices=document.getElementById('choices'),candidateGrid=document.getElementById('candidateGrid'),choiceStatus=document.getElementById('choiceStatus');
let running=false,ackResolver=null,retryTimer=null,pendingWake=null,executionContext=null;
let myTabId=null;
const waits=new Set();
const getJob=()=>BridgeState.get();
const save=job=>BridgeState.save(job);
const sleep=ms=>new Promise((resolve,reject)=>{
 const cancel=()=>{clearTimeout(timer);waits.delete(cancel);reject(Error('Pausa solicitada. A operação foi interrompida.'));};
 const timer=setTimeout(()=>{waits.delete(cancel);resolve();},ms);waits.add(cancel);
});
function cancelWaits(){for(const cancel of [...waits])cancel();if(ackResolver){const resolve=ackResolver;ackResolver=null;resolve({ok:false,error:'Pausa solicitada.'});}}
async function assertActive(job=executionContext){
 if(!job)return;
 const latest=await getJob();
 if(!latest||latest.nonce!==job.nonce)throw Error('BRIDGE_JOB_REPLACED: a SKU anterior foi encerrada.');
 if(BridgeState.halted(latest)||latest.controlEpoch!==job.controlEpoch)throw Error('Pausado pelo usuário. A execução foi interrompida.');
}
let lastReport='',lastReportAt=0;
function allowedChat(url){try{const u=new URL(url);return u.origin==='https://chatgpt.com'&&(/^\/$/.test(u.pathname)||/^\/c\/[a-z0-9-]+\/?$/i.test(u.pathname));}catch{return false;}}
function existingChat(url){try{const u=new URL(url);return u.origin==='https://chatgpt.com'&&/^\/c\/[a-z0-9-]+\/?$/i.test(u.pathname)&&!u.username&&!u.password&&!u.search&&!u.hash;}catch{return false;}}
async function report(job,status,error=''){
 if((await getJob())?.nonce!==job?.nonce)return;
 const signature=job.nonce+'|'+job.slot+'|'+status+'|'+error;
 if(signature===lastReport&&Date.now()-lastReportAt<30000)return;
 lastReport=signature;lastReportAt=Date.now();
 output.textContent=`SKU ${job.sku} · imagem ${Math.min(9,job.slot)}/9\n${status}${error?'\n'+error:''}`;
 progress.textContent=`Imagens salvas: ${job.completed.length}/9${job.deferredSlots?.length?' · Imagem 03 pendente de medidas':''}`;job.lastMessage=status;
 updatePendingButton(job);
 await chrome.tabs.sendMessage(job.appTabId,{kind:'RA_EXTENSION_PROGRESS',nonce:job.nonce,
  sku:job.sku,itemId:job.itemId,modelId:job.modelId,slot:job.slot,status,error}).catch(()=>{});
}
async function op(tabId,operation,payload={}){
 if(executionContext)await assertActive();
 const tab=await chrome.tabs.get(tabId).catch(()=>null);
 if(!tab||!allowedChat(tab.url))throw Error('O ChatGPT foi fechado ou mudou de página. Abra uma conversa comum do ChatGPT e clique em Retomar.');
 const [r]=await chrome.scripting.executeScript({target:{tabId},func:ImageSafety.dom,args:[operation,payload]});
 return r?.result||{};
}
async function waitChatTab(tabId){
 for(let i=0;i<45;i++){
  await assertActive();
  const tab=await chrome.tabs.get(tabId).catch(()=>null);
  if(!tab)throw Error('A aba ChatGPT foi fechada. Selecione a conversa já gerada abaixo.');
  if(tab.status==='complete' && allowedChat(tab.url)){
   try {if((await op(tabId,'guard')).ready)return tabId;}catch{}
  }
  await sleep(1000);
 }
 throw Error('O ChatGPT não concluiu o carregamento da conversa. Abra a aba, confirme o login e clique em Retomar.');
}
function evidenceFor(job){const request=job.current||{};return {
 token:request.token,sent:Boolean(request.sent||request.attempted),baselineImages:request.baselineImages||null,
 baselineUserCount:request.baselineUserCount,prompt:request.prompt,
 chatUrl:request.chatUrl||'',userMessageId:request.userMessageId||'',userTurnId:request.userTurnId||'',
 dedicatedChat:request.dedicatedChat===true||(job.chatOwned===true&&request.baselineUserCount===0),
 firstSlot:job.slot===1&&job.completed.length===0,
 selectedImageSrc:request.selectedImageSrc||'',
 explicitImageApproved:request.userConfirmedImage===true,
 selectedImageChatUrl:request.selectedImageChatUrl||'',
 // Evidência salva antes do envio: esta é a aba dedicada que a Ponte criou.
 // Vale após recarregar extensão, quando o recibo volátil da página desaparece.
  kitMode:job.kitMode===true,
  excludedImageSources:job.kitMode===true?(request.excludedImageSources||[]):[],
 runnerOwnedChat:Boolean(job.chatOwned===true&&job.chatTabId&&request.attempted&&
  request.dedicatedChat===true&&Number(request.baselineUserCount)===0&&
  Array.isArray(request.baselineImages)&&request.baselineImages.length<=8&&
  existingChat(request.chatUrl))
};}
function ownResponse(request,state){
 return state?.submitted===true&&!state.wrongConversation&&
  (!request.chatUrl||state.url===request.chatUrl)&&
  (state.requestMatched===true||Number(state.userCount)===Number(request.baselineUserCount)+1||
   request.userConfirmedImage===true&&state.recovered===true);
}
async function rememberResponse(job,state){
 const request=job.current;
 if(!request||!ownResponse(request,state))return false;
 let changed=false;
 for(const field of ['userMessageId','userTurnId'])if(state[field]&&request[field]!==state[field]){
  request[field]=state[field];changed=true;
 }
 if(!request.chatUrl&&existingChat(state.url)){request.chatUrl=state.url;changed=true;}
 if(!request.sent){request.sent=true;changed=true;}
 if(changed)await save(job);
 return true;
}
async function captureConversationUrl(job,tab){
 if(!existingChat(tab?.url)||!job.current)return false;
 if(existingChat(job.current.chatUrl))return job.current.chatUrl===tab.url;
 // O próprio runner criou/selecionou essa aba e mantém a identidade por nonce.
 if(job.chatTabId!==tab.id)return false;
 const request=job.current;
 const evidence=await op(tab.id,'identify',{token:request.token}).catch(()=>({}));
 let justified=evidence.hasToken===true;
 if(!justified&&request.attempted){
  const inspected=await op(tab.id,'response',evidenceFor(job)).catch(()=>({}));
  const baseline=Number(request.baselineUserCount);
  justified=Boolean(inspected.recovered||inspected.submitted&&inspected.imageCount>0||
   inspected.generating&&Number.isInteger(baseline)&&Number(inspected.userCount)===baseline+1);
 }
 if(!justified)return false;
 request.chatUrl=tab.url;
 await save(job);
 return true;
}
async function findChatWithToken(job){
 const token=job.current?.token;
 if(!token)return null;
 const tabs=await chrome.tabs.query({url:['https://chatgpt.com/c/*']});
 const matches=[];
 for(const t of tabs){
  if(!existingChat(t.url)||t.status!=='complete')continue;
  try{const found=await op(t.id,'identify',{token});if(found.hasToken)matches.push(t);}catch{}
 }
 return matches.length===1?matches[0]:null;
}
async function waitBlankNewChat(tabId){
 // A UI pode restaurar uma conversa antiga por um instante após o reload.
 // Só enviar outro prompt quando a página está DE FATO sem mensagens/imagens.
 await waitChatTab(tabId);
 for(let attempt=0;attempt<18;attempt++){
  await assertActive();
  const guard=await op(tabId,'guard');
  const snapshot=await op(tabId,'snapshot');
  const draft=await op(tabId,'draft');
  if(guard.ready&&!guard.generating&&!draft.generating&&
     Number(snapshot.userCount)===0&&
     Array.isArray(snapshot.imageSources)&&snapshot.imageSources.length===0&&
     !String(draft.text||'').trim())return tabId;
  await sleep(750);
 }
 throw Error('NOVO_CHAT_NAO_LIMPO: o ChatGPT manteve conteúdo da conversa anterior. A próxima imagem NÃO foi iniciada. Abra um novo chat vazio e pressione Retomar.');
}
async function chat(job){
 const pending=Boolean(job.current?.attempted||job.current?.sent);
 let tab=job.chatTabId?await chrome.tabs.get(job.chatTabId).catch(()=>null):null;
 if(pending){
  // Caso especial SEGURO: prompt antigo continua no editor, SEM novo turno
  // de usuário e SEM geração em andamento. A imagem 05 nunca foi solicitada;
  // preservar evidências e abrir um chat novo para tentar essa posição.
  if(tab&&job.chatOwned&&allowedChat(tab.url)&&job.current?.attempted){
   try{
    const snap=await op(tab.id,'snapshot');
    const draft=await op(tab.id,'draft');
    const probe=await op(tab.id,'response',evidenceFor(job));
    const norm=x=>String(x||'').normalize('NFKC').replace(/\s+/g,' ').trim();
    if(Number.isInteger(job.current.baselineUserCount)&&
       Number(snap.userCount)===job.current.baselineUserCount&&
       !draft.generating&&!probe.generating&&probe.draftPending===true&&
       probe.imageCount===0&&norm(draft.text)===norm(job.current.prompt)){
     job.unsentDrafts=[...(job.unsentDrafts||[]),{
      slot:job.slot,chatUrl:tab.url,at:Date.now(),reason:'prompt_presente_sem_turno'
     }].slice(-12);
     job.current=null;await save(job);
     await report(job,'Prompt anterior não enviado confirmado. Abrindo chat NOVO para gerar somente a imagem '+job.slot+'/9…');
     return chat(job);
    }
   }catch(e){
    // Consulta inconclusiva: preservar a conversa original, jamais duplicar.
   }
  }
  // Nunca migrar um pedido que pode ter sido enviado para outro chat:
  // recuperar o resultado original antes de qualquer tentativa nova.
  if(existingChat(job.current?.chatUrl)){
   const original=job.current.chatUrl;
   const found=(await chrome.tabs.query({url:['https://chatgpt.com/c/*']})).find(x=>x.url===original);
   if(!found)throw Error('RECUPERAR_CONVERSA: a conversa foi fechada. Abra a conversa original e clique em Retomar; nenhuma aba será reaberta automaticamente.');
   tab=found;job.chatTabId=tab.id;await save(job);return waitChatTab(tab.id);
  }
  if(tab&&await captureConversationUrl(job,tab))return waitChatTab(tab.id);
  if(tab&&allowedChat(tab.url)&&Number(job.current?.attemptedAt)&&Date.now()-Number(job.current.attemptedAt)<120000){
   for(let n=0;n<12;n++){
    await sleep(1000);
    tab=await chrome.tabs.get(job.chatTabId).catch(()=>null);
    if(!tab)break;
    if(await captureConversationUrl(job,tab))return waitChatTab(tab.id);
   }
  }
  const matched=await findChatWithToken(job);
  if(matched){job.chatTabId=matched.id;job.current.chatUrl=matched.url;await save(job);return waitChatTab(matched.id);}
  throw Error('RECUPERAR_CONVERSA: não foi possível comprovar a conversa original. Nenhuma imagem nova será gerada até reconciliar a posição.');
 }
 // O job já foi preparado, mas ainda não clicou Enviar: não perder o rascunho.
 if(job.current?.token){
  if(!tab||!allowedChat(tab.url))throw Error('RECUPERAR_CONVERSA: reabra o chat com o rascunho original antes de continuar.');
  return waitChatTab(tab.id);
 }
 // CADA posição começa num chat novo. Navegamos uma única aba que a Ponte
 // criou, sem abrir 9 abas simultâneas nem navegar chats pessoais do usuário.
 if(tab&&job.chatOwned&&allowedChat(tab.url)){
  const last=job.completed?.[job.completed.length-1];
  if(last&&existingChat(tab.url)){
   job.completedChats={...(job.completedChats||{}),[last]:tab.url};
   await save(job); // guardar link para auditoria ANTES de navegar
  }
  const guard=await op(tab.id,'guard');
  if(guard.generating)throw Error('GERACAO_ANTERIOR_EM_ANDAMENTO: não é seguro abrir novo chat antes de concluir a imagem anterior.');
  tab=await chrome.tabs.update(tab.id,{url:'https://chatgpt.com/',active:true});
 }else{
  // Jamais reutilizar uma aba pessoal ou uma conversa de outra SKU.
  if(!tab&&job.previousOwnedChat){
   const previous=job.previousOwnedChat;
   const old=await chrome.tabs.get(previous.id).catch(()=>null);
   if(old&&allowedChat(old.url)&&(old.url===previous.url||previous.token)){
    const can=await op(old.id,'canReuse',{token:previous.token}).catch(()=>({}));
    if(can.reusable&&!((await op(old.id,'guard')).generating))
     tab=await chrome.tabs.update(old.id,{url:'https://chatgpt.com/',active:true});
   }
   job.previousOwnedChat=null;
  }
  if(!tab||!allowedChat(tab.url))tab=await chrome.tabs.create({url:'https://chatgpt.com/',active:true});
  else if(tab.url!=='https://chatgpt.com/')tab=await chrome.tabs.create({url:'https://chatgpt.com/',active:true});
  job.chatOwned=true;
 }
 job.chatTabId=tab.id;job.chatOwned=true;await save(job);
 try{
  await waitBlankNewChat(tab.id);
  return tab.id;
 }catch(error){
  if(!/^NOVO_CHAT_NAO_LIMPO:/.test(String(error?.message||error))||
     job.current?.attempted||job.current?.sent||job.pending)throw error;
  // A primeira aba restaurou o prompt da posição anterior. Não apagar o
  // rascunho nem reutilizar a conversa; abrir UMA aba nova e conferir novamente.
  job.dirtyChatFallbacks=Number(job.dirtyChatFallbacks||0)+1;
  if(job.dirtyChatFallbacks>1)throw error;
  const fresh=await chrome.tabs.create({url:'https://chatgpt.com/',active:true});
  job.chatTabId=fresh.id;job.chatOwned=true;job.previousOwnedChat=null;
  await save(job);
  await report(job,'O ChatGPT restaurou o prompt anterior. Conferindo uma nova aba vazia sem reenviar nenhuma imagem…');
  await waitBlankNewChat(fresh.id);
  return fresh.id;
 }
}
async function sourcePhoto(url){
 const u=new URL(url);if(u.protocol!=='https:'||!['susercontent.com','shopeeusercontent.com','shopeemobile.com','shopee.com.br'].some(d=>u.hostname===d||u.hostname.endsWith('.'+d)))throw Error('Origem da referência inválida.');
 const r=await fetch(u.toString(),{credentials:'omit',signal:AbortSignal.timeout(30000)});
 if(!r.ok)throw Error('A fotografia original da Shopee não pôde ser carregada (HTTP '+r.status+').');
 const b=await r.blob();
 if(b.size<200||b.size>10*1024*1024||!/^image\/(png|jpeg|webp)/i.test(b.type))throw Error('Foto de referência fora do limite ou formato não suportado.');
 const dataUrl=await new Promise((resolve,reject)=>{const reader=new FileReader();reader.onload=()=>resolve(reader.result);reader.onerror=reject;reader.readAsDataURL(b);});
 return {name:'FOTO_REAL_ORIGINAL_SHOPEE.'+(b.type.includes('png')?'png':b.type.includes('webp')?'webp':'jpg'),type:b.type,dataUrl};
}
async function ensureSubmitted(job,tab,request){
 const data={token:request.token,prompt:request.prompt,files:job.referenceFile?[job.referenceFile]:[]};
 const evidence=()=>evidenceFor(job);
 async function confirmed(){
  const state=await op(tab,'response',evidence());
  if(state.wrongConversation)throw Error('RECUPERAR_CONVERSA: esta aba não corresponde à solicitação desta SKU.');
  if(!ownResponse(request,state))return false;
  const draft=await op(tab,'draft');
  if(String(draft.text||'').trim())return false;
  return rememberResponse(job,state);
 }
 // A imagem JÁ pronta tem prioridade sobre revalidar o botão Enviar.
 // A versão anterior bloqueava neste ponto por até 30s e falhava antes
 // de chegar em awaitImage/capture/upload, embora a foto estivesse no chat.
 async function readyPreviouslyGenerated(){
  if(!request.attempted&&!request.sent)return false;
  const state=await op(tab,'response',evidence());
  if(state.wrongConversation)throw Error('RECUPERAR_CONVERSA: a imagem pronta pertence a outra conversa.');
  const draft=await op(tab,'draft');
  if(state.imageCount===1&&state.key&&!state.generating&&
     !String(draft.text||'').trim()&&ownResponse(request,state)){
   await rememberResponse(job,state);
   await report(job,'Imagem já existente detectada no chat original. Capturando sem enviar outro comando…');
   return true;
  }
  return false;
 }
 async function sendExistingDraft(){
  // Não reescreve nem anexa novamente: apenas a mensagem original e seu anexo.
  for(let attempt=0;attempt<2;attempt++){
   await assertActive(job);
   if(await confirmed())return;
   const current=await op(tab,'draft');
   const original=String(request.prompt||'').normalize('NFKC').replace(/\s+/g,' ').trim();
   const found=String(current.text||'').normalize('NFKC').replace(/\s+/g,' ').trim();
   const state=await op(tab,'response',evidence());
   if(current.generating||state.generating){await sleep(2000);continue;}
   if(found!==original){
    // Editor vazio + tentativa registrada: jamais recriar ou reenviar o prompt.
    // A captura deve investigar a resposta pronta diretamente em awaitImage.
    // Não interromper o fluxo só porque o DOM ocultou o turno do usuário.
    if(await readyPreviouslyGenerated())return;
    await report(job,'Pedido anterior preservado. Buscando a imagem gerada, sem repetir o prompt…');
    return;
   }
   if(Number(state.userCount)!==Number(request.baselineUserCount)){
    throw Error('ENVIO_INCERTO: a conversa mudou; conferir a última mensagem antes de retomar para evitar duplicidade.');
   }
   const attached=await op(tab,'attachments',data);
   if(!attached.ready)throw Error('ANEXO_PENDENTE: a imagem de referência ainda não está pronta no ChatGPT.');
   request.sendRecoveredCount=(request.sendRecoveredCount||0)+1;
   await save(job); // checkpoint ANTES do clique
   const result=await op(tab,'send',{...data,forceSubmit:attempt>0});
   await report(job,result.clicked?'Confirmando envio da mesma imagem '+job.slot+'/9…':'Botão Enviar não encontrado; verificando a interface do ChatGPT…');
   for(let check=0;check<5;check++){
    if(await confirmed())return;
    await sleep(1100);
   }
  }
  if(await confirmed())return;
  throw Error('RASCUNHO_NAO_ENVIADO: a foto e o prompt estão no campo do ChatGPT, mas a mensagem não foi enviada. Abra o ChatGPT, clique na seta azul Enviar UMA vez e pressione Retomar na Ponte. A imagem anterior foi preservada.');
 }
 // Caso já exista uma tentativa anterior, recupere a conversa e NÃO gere
 // outro pedido. Só pode clicar novamente após provar que o mesmo rascunho
 // continua presente e não houve qualquer mensagem nova.
 if(request.attempted||request.sent){
  if(await readyPreviouslyGenerated())return;
  if(await confirmed())return;
  await sendExistingDraft();return;
 }
 await assertActive(job);
 const guard=await op(tab,'guard');if(guard.generating)throw Error('O ChatGPT está terminando outra resposta; aguarde para evitar mistura de imagens.');
 const reference=await BridgeState.getMedia(job,'reference');
 if(!reference?.dataUrl)throw Error('Foto original não encontrada. Retome pelo Shopee Manager.');
 await op(tab,'attach',{...data,files:[reference]});
 let attached=false;
 for(let i=0;i<28;i++){
  const a=await op(tab,'attachments',data);
  if(a.ready){attached=true;break;}
  await sleep(1500);
 }
 if(!attached)throw Error('O ChatGPT não confirmou o anexo da foto original. Abra a aba e confira antes de retomar.');
 await assertActive(job);
 const fill=await op(tab,'fill',data);
 if(!fill.filled)throw Error('O ChatGPT não confirmou o preenchimento do prompt.');
 const baseline=await op(tab,'snapshot');
 request.baselineImages=baseline?.imageSources||[];
 request.baselineUserCount=Number(baseline?.userCount||0);
 request.dedicatedChat=job.chatOwned===true&&request.baselineUserCount===0;
 request.attempted=true;
 request.attemptedAt=Date.now();
 request.chatUrl=existingChat(baseline?.url)?baseline.url:'';
 await save(job);
 await assertActive(job);
 const clicked=await op(tab,'send',data);
 await report(job,clicked.clicked?'Enviando imagem '+job.slot+'/9. Confirmando que a mensagem saiu do campo…':'Procurando o botão azul Enviar da imagem '+job.slot+'/9…');
 for(let check=0;check<8;check++){
  if(await confirmed())return;
  await sleep(1100);
 }
 // A extensão não pode declarar "enviado" baseada apenas em .click().
 await sendExistingDraft();
}

const validImageSource=src=>{try{const u=new URL(src);return u.protocol==='https:'&&['chatgpt.com','oaiusercontent.com','openai.com'].some(d=>u.hostname===d||u.hostname.endsWith('.'+d));}catch{return false;}};
async function captureFromSource(src){
 if(!validImageSource(src))return '';
 for(const mode of ['include','omit'])try{
   const r=await fetch(src,{credentials:mode,signal:AbortSignal.timeout(30000)});if(!r.ok)continue;
  const b=await r.blob();if(!/^image\/(png|jpeg|webp)/.test(b.type)||b.size<2048||b.size>12*1024*1024)continue;
  return await new Promise((resolve,reject)=>{const reader=new FileReader();reader.onload=()=>resolve(reader.result);reader.onerror=reject;reader.readAsDataURL(b);});
 }catch{}
 return '';
}
// Último recurso automático quando a imagem está pronta, mas os bytes da
// URL são protegidos contra leitura. Captura somente o RETÂNGULO do arquivo
// visualizado no chat original; nunca envia uma captura da página inteira.
async function captureVisibleReadyImage(job,tab,key){
 await assertActive(job);
 const current=await chrome.tabs.get(tab);
 if(!current||!existingChat(current.url)||job.chatTabId!==tab||
    (job.current?.chatUrl&&job.current.chatUrl!==current.url))return '';
 const pre=await op(tab,'screenshotPrepare',evidenceFor(job));
 if(!pre.ready||pre.key!==key||pre.url!==current.url)return '';
 try{
  await chrome.tabs.update(tab,{active:true});
  await sleep(500);
  await assertActive(job);
  // Revalidar sem trocar o arquivo depois de ativar a aba.
  const checked=await op(tab,'response',evidenceFor(job));
  if(!ownResponse(job.current,checked)||checked.key!==key||checked.imageCount!==1||checked.generating)return '';
  const screenshot=await chrome.tabs.captureVisibleTab(current.windowId,{format:'png'});
  if(!/^data:image\/png;base64,/i.test(screenshot))return '';
  const bitmap=new Image();bitmap.src=screenshot;await bitmap.decode();
  const bounds=pre.box;
  const px=bitmap.naturalWidth/pre.viewportWidth,py=bitmap.naturalHeight/pre.viewportHeight;
  if(!px||!py||Math.abs(px-py)>Math.max(px,py)*0.06)return '';
  const x=Math.floor(bounds.x*px),y=Math.floor(bounds.y*py);
  const width=Math.floor(bounds.width*px),height=Math.floor(bounds.height*py);
  if(width<350||height<350||x<0||y<0||x+width>bitmap.naturalWidth||y+height>bitmap.naturalHeight||
     width/height<0.82||width/height>1.22)return '';
  const canvas=document.createElement('canvas');canvas.width=1200;canvas.height=1200;
  const context=canvas.getContext('2d');if(!context)return '';
  context.fillStyle='#fff';context.fillRect(0,0,1200,1200);
  const side=Math.min(width,height),srcX=x+Math.floor((width-side)/2),srcY=y+Math.floor((height-side)/2);
  context.imageSmoothingEnabled=true;context.imageSmoothingQuality='high';
  context.drawImage(bitmap,srcX,srcY,side,side,0,0,1200,1200);
  const out=canvas.toDataURL('image/png');
  return out.length>=20000&&out.length<=20*1024*1024?out:'';
 }catch{return '';}finally{
  await op(tab,'screenshotRestore',evidenceFor(job)).catch(()=>{});
 }
}
async function awaitImage(job,tab,request){
 // O ChatGPT pode levar vários minutos. Nunca repetir o prompt por demora.
 const deadline=Date.now()+8*60*1000;
 let poll=0,settledKey='',captureAttempts=0;
 while(Date.now()<deadline){
  const active=await getJob();
  if(!active||active.nonce!==job.nonce)throw Error('BRIDGE_JOB_REPLACED: a SKU anterior foi encerrada.');
  if(active.status==='paused')throw Error('Pausado pelo usuário. A imagem pendente permanece vinculada ao SKU.');
  // O prompt enxuto da loja não inclui mais o token de controle.
  // A associação da imagem deve usar o texto REAL que foi enviado nesta posição.
  const evidence=evidenceFor(job);
  const r=await op(tab,'response',evidence);
  if(r.generating)settledKey=''; // não contar estabilidade através de streaming
  if(r.wrongConversation)throw Error('RECUPERAR_CONVERSA: a aba mudou de conversa. O pedido original foi preservado.');
  await rememberResponse(job,r);
  if(r.invalidSelection)throw Error('ESCOLHER_IMAGEM: A imagem escolhida não está mais presente. Selecione novamente para evitar enviar outra foto.');
  // Somente a imagem de uma resposta vinculada ao novo turno realmente
  // enviado pode ser entregue. Imagem anterior + rascunho NÃO é geração.
  const draft=await op(tab,'draft');
  if(ownResponse(request,r)&&!r.generating&&
     !String(draft.text||'').trim()&&r.imageCount===1&&r.key){
   // Uma imagem recém exibida não é necessariamente uma geração finalizada.
   // Exigir duas leituras estáveis, separadas no tempo, antes de capturar.
   if(settledKey!==r.key){
    settledKey=r.key;
    await report(job,'Imagem '+job.slot+'/9 encontrada; aguardando finalizar e estabilizar no ChatGPT…');
    await sleep(5200);continue;
   }
   const after=await op(tab,'response',evidence),lastDraft=await op(tab,'draft');
   if(after.generating||after.key!==r.key||after.imageCount!==1||
       !ownResponse(request,after)||String(lastDraft.text||'').trim()){
    settledKey='';await sleep(2000);continue;
   }
   // Uma resposta pronta pode liberar os bytes segundos após exibir a prévia.
   let cap;
   try{cap=await op(tab,'capture',evidence);}
   catch(error){
    captureAttempts++;
    await report(job,'ChatGPT ainda preparando o arquivo original. Tentativa '+captureAttempts+'; mantendo a mesma imagem sem reenviar o pedido…');
    await sleep(5000);continue;
   }
   if(!ownResponse(request,cap)||cap.generating||cap.key!==r.key||cap.imageCount!==1){
    settledKey='';await sleep(2000);continue;
   }
   if(!cap?.dataUrl&&cap?.source)cap={...cap,dataUrl:await captureFromSource(cap.source)};
   if(!cap?.dataUrl){
    await report(job,'A imagem já existe, mas a URL de mídia não liberou o arquivo. Tentando importar apenas a imagem visível da conversa original…');
    const cropped=await captureVisibleReadyImage(job,tab,cap.key);
    if(cropped)cap={...cap,dataUrl:cropped,captureMethod:'cropped-visible-image'};
   }
   if(cap?.dataUrl&&/^data:image\/(png|jpeg|webp);base64,/i.test(cap.dataUrl)){
    request.capturedImageKey=cap.key;
    request.captureReceipt={nonce:job.nonce,sku:job.sku,itemId:job.itemId,modelId:job.modelId,
     slot:job.slot,chatUrl:request.chatUrl,userMessageId:request.userMessageId||'',imageKey:cap.key,capturedAt:Date.now()};
    await save(job);return cap.dataUrl;
   }
   // Sem bytes válidos, conservar a mesma conversa, nonce e posição.
   // A geração visual pode estar concluída antes do download ficar disponível.
   captureAttempts++;
   await report(job,'Imagem '+job.slot+'/9 pronta visualmente, aguardando liberação do arquivo para captura ('+captureAttempts+'). Nenhum novo prompt será enviado…');
   await sleep(5000);
   continue;
  }
  // Em kits, várias imagens candidatas exigem escolha visual. Não deixar o
  // monitoramento rodar por minutos só porque um recibo da UI não foi reconhecido.
  // A escolha NÃO importa nada automaticamente; a pessoa confirma qual foto usar.
  if((r.needsSelection||r.imageCount>1)&&!r.generating&&
     (ownResponse(request,r)||(job.kitMode===true&&Boolean(request.attempted||request.sent))))
   throw Error('ESCOLHER_IMAGEM: Há várias imagens candidatas para a posição '+job.slot+'. Selecione a correta no Runner.');
  if(r.availableImageCount||r.imageCount){
   const diagnostic= r.needsSelection?'Mais de uma imagem candidata; nenhuma será importada sem identificação.':
    !r.submitted?'O ChatGPT não mostrou um recibo de envio compatível com este pedido.':
    r.generating?'A resposta ainda está em geração.':
    'A imagem foi encontrada; verificando estabilidade e identidade do pedido.';
   await report(job,`Imagem visível no ChatGPT. ${diagnostic} SKU ${job.sku}, posição ${job.slot}/9.`);
  }else if(poll>=3){
   await report(job,`Ainda não foi possível identificar a imagem pronta no chat vinculado. Verificando novamente, sem repetir o prompt (${job.slot}/9)…`);
  }else await report(job,`Aguardando a imagem ${job.slot}/9 no ChatGPT…`);
  await sleep(poll++<4?2500:5000);
 }
 throw Error('IMAGEM_NAO_RECONHECIDA: após aguardar até 8 minutos, a Ponte ainda não conseguiu confirmar/capturar a imagem da posição atual. O pedido NÃO será repetido. Abra a conversa e use Recuperar e enviar automaticamente.');
}
async function upload(job,dataUrl){
 if(!dataUrl)throw Error('Imagem capturada ausente. Confira a conversa original.');
 await assertActive(job);
 if(!job.pending)await BridgeState.putMedia(job,'pending_'+job.slot,dataUrl);
 job.pending=true;job.status='awaiting_upload';await save(job);
 await report(job,'Imagem capturada; enviando automaticamente ao Shopee Manager…');
 // O mesmo arquivo fica guardado antes de qualquer entrega. Quando o ACK se
 // perde, pode ser reenviado UMA vez sem nova geração ou mudança de slot.
 for(let attempt=0;attempt<2;attempt++){
  await assertActive(job);
  if(attempt)await report(job,'Confirmação do Manager não recebida. Reenviando a MESMA imagem capturada da posição '+job.slot+'/9 (2/2), sem gerar outra foto…');
  let ackTimer;
  const p=new Promise(resolve=>{
   ackResolver=resolve;
   ackTimer=setTimeout(()=>{if(ackResolver===resolve){ackResolver=null;resolve(null);}},60000);
  });
  try{
   const sent=await chrome.tabs.sendMessage(job.appTabId,{kind:'RA_EXTENSION_IMAGE',nonce:job.nonce,sku:job.sku,
    itemId:job.itemId,modelId:job.modelId,slot:job.slot,dataUrl,
    mime:dataUrl.startsWith('data:image/jpeg')?'image/jpeg':dataUrl.startsWith('data:image/webp')?'image/webp':'image/png'}).catch(()=>null);
   if(!sent?.ok)throw Error('A aba do Shopee Manager não respondeu ao envio. Abra a mesma SKU e clique em Retomar para reenviar a foto JÁ capturada.');
   const ack=await p;
   await assertActive(job);
   if(ack?.ok===true)return;
   if(ack?.ok===false)throw Error('Shopee Manager recusou o arquivo: '+(ack.error||'erro não identificado'));
   if(attempt===1)throw Error('CAPTURA_SALVA_UPLOAD_PENDENTE: a imagem '+job.slot+' foi capturada e preservada, mas o Manager não confirmou o salvamento após dois envios. Reabra a mesma SKU e clique em Retomar na Ponte para reenviar a foto sem gerá-la novamente.');
  }finally{
   clearTimeout(ackTimer);
   ackResolver=null;
  }
 }
}
chrome.runtime.onMessage.addListener((message,_sender,sendResponse)=>{
 if(!Number.isInteger(myTabId)||message?.targetTabId!==myTabId)return;
 if(message.kind==='RA_RUNNER_WAKE'){
  void getJob().then(job=>{
   if(!job||job.nonce!==message.nonce||BridgeState.halted(job))
    return sendResponse({ok:false,error:'Tarefa não ativa ou identificador de SKU diferente.'});
   if(running){
    if(executionContext?.nonce!==job.nonce||executionContext?.controlEpoch!==job.controlEpoch)
     pendingWake=job.nonce;
    sendResponse({ok:true,nonce:job.nonce,running:true});return;
   }
   if(retryTimer){clearTimeout(retryTimer);retryTimer=null;}
   sendResponse({ok:true,nonce:job.nonce,running:false});
   queueMicrotask(()=>void run());
  }).catch(error=>sendResponse({ok:false,error:String(error.message||error)}));return true;
 }
 if(message.kind==='RA_RUNNER_UPLOAD_ACK'){
  void getJob().then(job=>{
   if(job?.nonce!==message.nonce||job.slot!==message.slot)return sendResponse({ok:false});
   const accept=ackResolver;if(accept){ackResolver=null;accept(message);}
   sendResponse({ok:true});
  }).catch(()=>sendResponse({ok:false}));return true;
 }
 if(message.kind==='RA_RUNNER_PAUSE'){
  if(message.replaced&&executionContext?.nonce!==message.nonce){sendResponse({ok:true});return;}
  if(retryTimer){clearTimeout(retryTimer);retryTimer=null;}
  pendingWake=null;cancelWaits();sendResponse({ok:true});return;
 }
});
async function activate(job){
 const latest=await BridgeState.control(job.nonce,'active');
 if(!latest)throw Error('BRIDGE_JOB_REPLACED: a SKU foi alterada.');
 return latest;
}
// Comparação conservadora de miniaturas: apenas identifica a PRANCHA EXATA
// que a Ponte anexou, não imagens geradas com os mesmos brinquedos.
async function imagePixelSample(dataUrl){
 if(typeof dataUrl!=='string'||!dataUrl.startsWith('data:image/'))return null;
 try{
  const img=new Image();img.src=dataUrl;await img.decode();
  const canvas=document.createElement('canvas');canvas.width=20;canvas.height=20;
  const ctx=canvas.getContext('2d',{willReadFrequently:true});if(!ctx)return null;
  ctx.drawImage(img,0,0,20,20);
  return ctx.getImageData(0,0,20,20).data;
 }catch{return null;}
}
function sameReferenceSample(a,b){
 if(!a||!b||a.length!==b.length)return false;
 let diff=0;
 for(let i=0;i<a.length;i+=4)diff+=Math.abs(a[i]-b[i])+Math.abs(a[i+1]-b[i+1])+Math.abs(a[i+2]-b[i+2]);
 return diff/(a.length/4*3)<15; // apenas a prancha virtualmente idêntica
}
async function showImageChoices(job){
 if(!job?.current?.attempted&&!job?.current?.sent)throw Error('Não existe solicitação enviada para selecionar uma imagem.');
 let candidateTab=job.chatTabId?await chrome.tabs.get(job.chatTabId).catch(()=>null):null;
 if(existingChat(job.current?.chatUrl) && candidateTab?.url!==job.current.chatUrl){
  candidateTab=(await chrome.tabs.query({url:['https://chatgpt.com/c/*']}))
    .find(t=>t.url===job.current.chatUrl)||null;
 }
 if(!candidateTab||!existingChat(candidateTab.url)){
  await showConversations();
  throw Error('RECUPERAR_CONVERSA: selecione a conversa já aberta com a imagem pronta e clique em Vincular. Nenhuma imagem será recriada.');
 }
 const tab=candidateTab.id;
 const request=job.current;
 const evidence={token:request.token,prompt:request.prompt,sent:true,baselineImages:request.baselineImages||null,
  baselineUserCount:request.baselineUserCount,firstSlot:job.slot===1&&job.completed.length===0,
  manualRecovery:true,kitMode:job.kitMode===true,excludedImageSources:job.kitMode===true?(request.excludedImageSources||[]):[]};
 const list=await op(tab,'candidates',evidence);
 candidateGrid.replaceChildren();
 choices.hidden=false;
 document.getElementById('discardAllCandidates').hidden=job.kitMode!==true;
 document.getElementById('restoreCandidates').hidden=job.kitMode!==true;
 repair.hidden=true;
 document.getElementById('choiceSubtitle').textContent=
  'SKU '+job.sku+' · posição '+job.slot+'/9. Escolha APENAS a imagem gerada para esta posição, nunca a foto antiga do catálogo. '+
  (job.slot===3?'Especificações: confira somente medidas e materiais realmente confirmados para as SKUs DESTE kit. Não reutilize informações de outra SKU. ': '')+
  'A imagem selecionada será salva para revisão, sem publicar na Shopee.';
 choiceStatus.textContent='';
 const images=(list.candidates||[]);
 const storedReference=job.kitMode===true?await BridgeState.getMedia(job,'reference').catch(()=>null):null;
 const referenceSample=storedReference?.dataUrl?await imagePixelSample(storedReference.dataUrl):null;
 const referenceKeys=new Set();
 if(job.kitMode===true&&referenceSample){
  for(const candidate of images){
   const sample=await imagePixelSample(candidate.preview);
   if(sameReferenceSample(referenceSample,sample))referenceKeys.add(candidate.key);
  }
 }
 if(!images.length){
  choiceStatus.textContent='Nenhuma imagem visível encontrada nessa resposta. Abra a conversa original com a imagem pronta e clique em Atualizar imagens encontradas.';
  return;
 }
 images.forEach((candidate,index)=>{
  const item=document.createElement('label');item.className='candidate';
  const input=document.createElement('input');input.type='radio';input.name='candidateImage';input.value=String(index);if(input.dataset)input.dataset.key=candidate.key;else input.candidateKey=candidate.key;
  const reference=referenceKeys.has(candidate.key);
  if(request.selectedImageSrc===candidate.key&&!reference)input.checked=true;
  if(reference){input.disabled=true;if(item.dataset)item.dataset.reference='true';}
  item.append(input);
  if(candidate.preview?.startsWith('data:image/')){
   const preview=document.createElement('img');preview.src=candidate.preview;preview.alt='Prévia da imagem candidata '+(index+1);
   item.append(preview);
  }else{
   const missing=document.createElement('div');missing.className='placeholder';
   missing.textContent='Prévia protegida. Abra a conversa do ChatGPT para conferir visualmente esta opção.';
   item.append(missing);
  }
  const name=document.createElement('small');name.textContent='Opção '+(index+1)+' · '+candidate.width+' × '+candidate.height;
  item.append(name);
  if(reference){
   item.append(Object.assign(document.createElement('small'),{
    textContent:'Prancha original dos produtos — NÃO É imagem gerada. Não pode ser importada.'
   }));
  }
  if(job.kitMode===true){
   const exclude=document.createElement('button');exclude.type='button';
   exclude.className='candidate-remove';exclude.textContent='Excluir da lista';
   exclude.title='Descartar esta opção de recuperação sem apagar a conversa ChatGPT';
   exclude.onclick=async event=>{
    event.preventDefault();event.stopPropagation();
    const latest=await getJob();
    if(!latest||latest.nonce!==job.nonce||latest.slot!==job.slot||!latest.current)return;
    const rejected=new Set(latest.current.excludedImageSources||[]);rejected.add(candidate.key);
    latest.current.excludedImageSources=[...rejected].slice(-36);
    if(latest.current.selectedImageSrc===candidate.key){
     latest.current.selectedImageSrc='';latest.current.selectedImageChatUrl='';
     latest.current.userConfirmedImage=false;
    }
    await save(latest);
    item.remove();
    choiceStatus.textContent='Opção '+(index+1)+' excluída DESTA LISTA (a conversa ChatGPT não foi apagada). '+
      'Clique em Recomeçar somente imagem pendente se quiser uma cena diferente. As fotos 01..N salvas continuam intactas.';
   };
   item.append(exclude);
  }
  const locate=document.createElement('button');locate.type='button';locate.textContent='Destacar no ChatGPT';
  locate.onclick=async event=>{
   event.preventDefault();
   try{
    const result=await op(tab,'highlight',{...evidence,highlightSrc:candidate.key});
    if(!result.highlighted){
     choiceStatus.textContent='A foto pode ter mudado de endereço ao atualizar a conversa. Use Atualizar imagens encontradas ou escolha a prévia visualmente; destacar é opcional.';
     return;
    }
    await chrome.tabs.update(tab,{active:true});
    choiceStatus.textContent='A imagem '+(index+1)+' foi destacada em verde na conversa do ChatGPT. Confira e volte a esta aba para marcá-la.';
   }catch(e){choiceStatus.textContent='Não foi possível destacar: '+String(e.message||e);}
  };
  item.append(locate);candidateGrid.append(item);
 });
 choiceStatus.textContent=images.length+' imagem(ns) encontrada(s). Você precisa escolher a foto correta antes do upload.';
 document.getElementById('confirmCandidate').onclick=async()=>{
  const selected=candidateGrid.querySelector('input[name="candidateImage"]:checked');
  if(!selected){choiceStatus.textContent='Selecione uma imagem antes de confirmar.';return;}
  const image=images[Number(selected.value)];
  if(!image?.key){choiceStatus.textContent='Não foi possível identificar o arquivo selecionado. Atualize a lista.';return;}
  if(referenceKeys.has(image.key)){
   choiceStatus.textContent='A prancha original da WeDrop não é uma geração. Exclua-a da lista e escolha a foto final.';return;
  }
  if((request.excludedImageSources||[]).includes(image.key)){
   choiceStatus.textContent='Esta imagem foi excluída da recuperação. Atualize a lista.';return;
  }
  let latest=await getJob();
  if(!latest||latest.nonce!==job.nonce||latest.slot!==job.slot||latest.sku!==job.sku){
   choiceStatus.textContent='A SKU ou a posição foi alterada. Volte ao anúncio correto antes de enviar.';return;
  }
  const button=document.getElementById('confirmCandidate');button.disabled=true;
  try{
   // Guardar a escolha explícita. Nenhuma nova geração até ACK do Shopee Manager.
   latest=await activate(latest);
   latest.current.selectedImageSrc=image.key;
   latest.current.selectedImageChatUrl=String(list.url||'');
   latest.current.chatUrl=String(list.url||''); // vincula a conversa aprovada, sem criar outra
   latest.current.userConfirmedImage=true;
   latest.current.sent=true; // confirmação visual explícita: somente capturar/upload, não enviar texto
   latest.chatTabId=tab;
   latest.status='active';latest.error='';
   await save(latest);
   choices.hidden=true;
   await report(latest,'Imagem '+latest.slot+' escolhida. Capturando e enviando para a SKU '+latest.sku+'…');
   void run();
  }catch(e){choices.hidden=false;choiceStatus.textContent='Não foi possível continuar: '+String(e.message||e);}
  finally{button.disabled=false;}
 };
}
document.getElementById('restoreCandidates').onclick=async()=>{
 const job=await getJob();if(!job?.kitMode||!job.current||running)return;
 job.current.excludedImageSources=[];await save(job);
 try{await showImageChoices(job);}catch(e){choiceStatus.textContent='Erro ao restaurar a lista: '+String(e.message||e);}
};
document.getElementById('discardAllCandidates').onclick=async()=>{
 const job=await getJob();if(!job?.kitMode||!job.current||running)return;
 if(!window.confirm('Descartar TODAS as opções desta recuperação? As imagens existentes na conversa ChatGPT NÃO serão excluídas e nenhuma posição já salva será apagada.'))return;
 const candidates=[...candidateGrid.querySelectorAll('input[name="candidateImage"]')]
  .map(input=>input.dataset?.key||input.candidateKey).filter(Boolean);
 const rejected=new Set(job.current.excludedImageSources||[]);
 for(const key of candidates)rejected.add(key);
 job.current.excludedImageSources=[...rejected].slice(-36);
 job.current.selectedImageSrc='';job.current.selectedImageChatUrl='';job.current.userConfirmedImage=false;
 await save(job);
 await showImageChoices(job);
 choiceStatus.textContent='Opções descartadas para esta posição. Clique em Recomeçar somente imagem pendente para solicitar uma cena diferente — a importação NÃO foi feita.';
};
document.getElementById('reloadCandidates').onclick=async()=>{
 const job=await getJob();if(!job)return;
 try{await showImageChoices(job);}catch(e){choiceStatus.textContent='Falha ao atualizar: '+String(e.message||e);}
};
document.getElementById('openCandidateChat').onclick=async()=>{
 const job=await getJob();if(job?.chatTabId)await chrome.tabs.update(job.chatTabId,{active:true}).catch(()=>{});
};
async function showConversations(){
 const tabs=await chrome.tabs.query({url:['https://chatgpt.com/c/*']});
 chatChoice.replaceChildren();
 const empty=document.createElement('option');empty.value='';empty.textContent='Selecione a conversa com a imagem já gerada';chatChoice.append(empty);
 for(const t of tabs.filter(t=>existingChat(t.url))){
  const o=document.createElement('option');o.value=String(t.id);
  o.textContent=(t.title||'Conversa ChatGPT').slice(0,75)+' · '+t.url.slice(-22);
  chatChoice.append(o);
 }
 repair.hidden=false;
 document.getElementById('repairSku').textContent=(await getJob())?.sku||'esta SKU';
}
document.getElementById('refreshChats').onclick=()=>void showConversations();
document.getElementById('associateChat').onclick=async()=>{
 let job=await getJob();if(!job?.current?.attempted&&!job?.current?.sent){
  output.textContent='Ainda não há solicitação enviada para recuperar.';return;
 }
 let tab=null;
 const manual=chatLink.value.trim();
 try{
  if(manual){
   if(!existingChat(manual))throw Error('Use o link de uma conversa ChatGPT, começando com https://chatgpt.com/c/.');
   const tabs=await chrome.tabs.query({url:['https://chatgpt.com/c/*']});
   tab=tabs.find(t=>t.url===manual)||await chrome.tabs.create({url:manual,active:true});
  }else{
   const tabId=Number(chatChoice.value);
   if(!Number.isInteger(tabId)||tabId<=0)throw Error('Selecione uma conversa da lista ou cole o link.');
   tab=await chrome.tabs.get(tabId);
  }
  if(!tab||!existingChat(tab.url))throw Error('Conversa inválida. Abra a conversa com a imagem criada e tente novamente.');
  job=await activate(job);
  job.chatTabId=tab.id;job.chatOwned=false;
  job.current.chatUrl=tab.url;
  job.current.userSelectedChat=true;
  job.status='paused';job.error='';
  await save(job);
  repair.hidden=true;
  await report(job,'Conversa associada. Escolha a imagem já pronta para importar sem gerar novamente…');
  await showImageChoices(job);
 }catch(e){output.textContent='Não foi possível vincular: '+String(e?.message||e);repair.hidden=false;}
};
async function run(){
 if(running)return;
 running=true;
 let startedNonce=null,startedEpoch=null;
 try{
  const owner=await chrome.runtime.sendMessage({kind:'RA_RUNNER_REGISTER',tabId:myTabId});
  if(!owner?.ok){output.textContent='Outra aba da Ponte controla a execução. Esta aba não executará comandos.';return;}
  await BridgeState.lock('execution',async lock=>{
   if(!lock){output.textContent='Já existe uma execução ativa. Esta aba está em espera, sem executar comandos.';return;}
   let job=await getJob();
   if(!job){output.textContent='Abra uma SKU no Shopee Manager para iniciar.';return;}
   startedNonce=job.nonce;startedEpoch=job.controlEpoch;
   if(BridgeState.halted(job)){
    await report(job,job.status==='done'?'9/9 imagens concluídas.':'Execução pausada. Clique em Retomar para continuar.',job.error||'');return;
   }
   executionContext={nonce:job.nonce,controlEpoch:job.controlEpoch};
   try{
    for(let slot=1;slot<=9;slot++){
     await assertActive();job=await getJob();
     if(job.completed.includes(slot)||(job.deferredSlots||[]).includes(slot))continue;
     if(job.slot!==slot){job.slot=slot;job.current=null;job.pending=null;await save(job);}
     if(job.pending){await upload(job,await BridgeState.getMedia(job,'pending_'+slot));}
     else{
      job.status='active';await save(job);
      await report(job,job.current?.attempted||job.current?.sent
       ?'Execução retomada: verificando primeiro a imagem já gerada, sem reenviar o prompt…'
       :'Iniciando imagem '+slot+'/9 '+(job.kitMode?'do kit ':'da SKU ')+job.sku+'…');
      const tab=await chat(job);
      // A foto de referência já foi anexada no ChatGPT se há um pedido tentado.
      // Não depender novamente de URL temporária da Shopee para recuperar o
      // resultado gerado: essa URL pode ter expirado entre a geração e a volta.
      if(!job.referenceFile&&(job.current?.attempted||job.current?.sent)){
       job.referenceFile={name:'REFERENCIA_JA_ENVIADA_NO_CHAT.jpg',type:'image/jpeg'};
       await save(job);
      }
      if(!job.referenceFile){
       const reference=job.referenceDataUrl
        ?{name:job.kitMode?'REFERENCIAS_ORIGINAIS_DO_KIT.jpg':'IMAGEM_COMERCIAL_SELECIONADA_'+String(slot).padStart(2,'0')+'.jpg',
          type:'image/jpeg',dataUrl:job.referenceDataUrl}
        :await sourcePhoto(job.imageUrl);
       await BridgeState.putMedia(job,'reference',reference);
       job.referenceFile={name:reference.name,type:reference.type};
       // Imagem já guardada na área de mídia; não duplicar dados grandes no registro de job.
       job.referenceDataUrl='';await save(job);
      }
      if(!job.current){
       const token='RA_SKU_'+crypto.randomUUID().replaceAll('-','');
       const opened=await chrome.tabs.get(tab);
       job.current={token,prompt:'',sent:false,chatUrl:existingChat(opened.url)?opened.url:''};
      }
      if(!job.current.attempted&&!job.current.sent){
       job.current.prompt=BridgeSceneRules.enhance({sku:job.sku,slot,prompt:job.prompts[slot-1],imageMode:job.imageMode||'',kitMode:job.kitMode===true});
       await save(job);
      }
      await report(job,job.imageMode?'Preparando comando e imagem comercial selecionada para edição no ChatGPT…':'Preparando comando e fotografia original no ChatGPT…');
      await ensureSubmitted(job,tab,job.current);
      await report(job,'Comando enviado; aguardando uma imagem no ChatGPT…');
      const image=await awaitImage(job,tab,job.current);
      if(job.kitMode&&job.current?.excludedImageSources?.includes(job.current.capturedImageKey))
       throw Error('ESCOLHER_IMAGEM: esta imagem foi excluída desta recuperação. Não será importada.');
      // Última barreira antes de escrever no Manager. Não marcar como salva
      // enquanto o prompt permanece no campo ou não houve turno novo.
      if(job.current.userConfirmedImage!==true){
       const response=await op(tab,'response',evidenceFor(job));
       const draft=await op(tab,'draft');
       if(!job.current.sent||!ownResponse(job.current,response)||response.generating||
          response.key!==job.current.capturedImageKey||response.imageCount!==1||
          String(draft.text||'').trim())
        throw Error('ENVIO_NAO_CONFIRMADO: imagem não será importada porque o ChatGPT não comprovou a mensagem enviada da posição '+slot+'.');
      }
      await assertActive();
      const sha=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',await (await fetch(image)).arrayBuffer())),b=>b.toString(16).padStart(2,'0')).join('');
      if(Object.entries(job.imageHashes||{}).some(([other,hash])=>Number(other)!==slot&&hash===sha))
       throw Error('ESCOLHER_IMAGEM: arquivo idêntico ao de outra posição. A geração foi pausada, sem criar tentativas extras.');
      job.imageHashes={...(job.imageHashes||{}),[slot]:sha};
      if(job.current.captureReceipt)job.current.captureReceipt.sha256=sha;
      await upload(job,image);
     }
     job.completed=[...new Set([...job.completed,slot])].sort((a,b)=>a-b);
     if(job.current?.captureReceipt)job.receipts={...(job.receipts||{}),[slot]:{...job.current.captureReceipt,acknowledgedAt:Date.now()}};
     job.chatUrl=job.current?.chatUrl||job.chatUrl||'';
     job.lastChatToken=job.current?.token||job.lastChatToken||'';
     job.pending=null;job.current=null;job.status='active';job.slot=slot+1;job.autoRetry=null;job.dirtyChatFallbacks=0;
     // O marcador de anexo já enviado vale SÓ para esta posição recuperada.
     // A próxima imagem precisa da referência verdadeira do produto.
     if(job.referenceFile?.name==='REFERENCIA_JA_ENVIADA_NO_CHAT.jpg')job.referenceFile=null;
     await save(job);
     await BridgeState.removeMedia(job,'pending_'+slot);
     await report(job,'Imagem '+slot+'/9 salva na galeria.');
     if(slot<9)await sleep(2500);
    }
    await assertActive();job=await getJob();
    if(!BridgeFlowPolicy.availableDone(job))throw Error('Finalização recusada: faltam posições confirmadas.');
    const complete=BridgeFlowPolicy.done(job);
    job.status=complete?'done':'paused';job.slot=complete?9:3;job.current=null;job.pending=null;job.autoRetry=null;await save(job);
    await report(job,complete?'9/9 imagens armazenadas. Confira e aprove no Shopee Manager.':
     'Sequência disponível concluída. '+job.completed.length+'/9 imagens salvas. Imagem 03 pendente de medidas; você pode iniciar outra SKU.');
    // Keep the lightweight coordinator for the next SKU; do not close/reopen tabs.
   }catch(e){
    executionContext=null;
    job=await getJob();
    if(!job||job.nonce!==startedNonce){pendingWake=job?.nonce;return;}
    if(job.controlEpoch!==startedEpoch){if(!BridgeState.halted(job))pendingWake=job.nonce;return;}
    if(BridgeState.halted(job)){await report(job,'Execução pausada. Nenhum novo comando será enviado.',job.error||'');return;}
    job.error=String(e?.message||e);
    const attempt=job.autoRetry?.slot===job.slot?Number(job.autoRetry.attempts||0):0;
    const plan=BridgeFlowPolicy.retryPlan(job.error,attempt);
    if(plan.retry){
     job.autoRetry={slot:job.slot,attempts:attempt+1};job.status='active';await save(job);
     await report(job,'Reconexão em '+Math.ceil(plan.delay/1000)+' s ('+(attempt+1)+'/2).',job.error);
     retryTimer=setTimeout(()=>{retryTimer=null;void run();},plan.delay);
    }else{
     job.status='paused';await save(job);
     await report(job,'Pausado; imagens e posição preservadas.',job.error);
     if(job.error.startsWith('RECUPERAR_CONVERSA:')){await showConversations();repair.open=false;showLegacyRestart(job);}
     if(job.error.startsWith('ESCOLHER_IMAGEM:'))
      try{
       await showImageChoices(job);
       const next=BridgeFlowPolicy.next(job);
       if(job.kitMode===true&&next)choiceStatus.textContent+=' Selecione e CONFIRME a imagem '+
        String(next).padStart(2,'0')+'/09: depois do salvamento a posição '+
        String(Math.min(9,next+1)).padStart(2,'0')+'/09 começará automaticamente.';
      }catch(pickerError){output.textContent+='\n'+String(pickerError.message||pickerError);}
    }
   }
  },{ifAvailable:true});
 }catch(e){output.textContent=String(e?.message||e);}
 finally{
  running=false;executionContext=null;
  const latest=await getJob().catch(()=>null);
  const next=pendingWake;pendingWake=null;
  if(next&&latest?.nonce===next&&!BridgeState.halted(latest)&&(latest.nonce!==startedNonce||latest.controlEpoch!==startedEpoch))queueMicrotask(()=>void run());
 }
}
function updatePendingButton(job){
 const btn=document.getElementById('restartPending'),hint=document.getElementById('restartHint');
 const recover=document.getElementById('recoverReadyImage');
 if(!btn||!hint)return;
 const missing=job?BridgeFlowPolicy.next(job):null;
 const show=Boolean(job&&missing&&!['done','cancelled','replaced'].includes(job.status));
 btn.hidden=!show;hint.hidden=!show;
 if(recover)recover.hidden=!(show&&Boolean(job?.current?.attempted||job?.current?.sent)&&!job?.pending);
 if(show)btn.textContent=job.pending?'↻ Reenviar imagem '+missing+' já capturada':
  '↻ Recomeçar somente imagem '+String(missing).padStart(2,'0')+' pendente';
}
// Posição pendente do KIT: se o ChatGPT mostrou mais de uma imagem, abrir
// a seleção do próprio arquivo, em vez de repetir RA_RESUME e parecer travado.
// O clique do usuário é necessário para impedir escolher uma foto de outro turno.
function needsKitPhotoChoice(job){
 return job?.kitMode===true&&!job.pending&&
  Boolean(job?.current?.attempted||job?.current?.sent)&&
  (String(job.error||'').startsWith('ESCOLHER_IMAGEM:')||
   /mais de uma imagem candidata/i.test(String(job.lastMessage||''))||
   job.status==='paused');
}
// O botão azul é uma ESCOLHA EXPLÍCITA, não depende de job.error, porque o
// monitor de imagem pode estar ativo e a mensagem de ambiguidade só existe na UI.
async function showPendingKitChoice(job,{userRequested=false}={}){
 const slot=BridgeFlowPolicy.next(job);
 if(!slot||!job?.kitMode||job.pending||
    !Boolean(job.current?.attempted||job.current?.sent))return false;
 if(!userRequested&&!needsKitPhotoChoice(job))return false;
 // BUG v1.0.57: o handler tinha `if(running)return`, ignorando totalmente
 // o clique enquanto awaitImage ainda monitorava imagens no ChatGPT.
 // Pausar o loop ANTES de abrir a seleção impede importações concorrentes.
 if(running){
  output.textContent='Interrompendo somente a espera da imagem '+String(slot).padStart(2,'0')+
   '/09 para abrir a seleção. As imagens anteriores permanecerão salvas.';
  const paused=await BridgeState.control(job.nonce,'paused',
   'ESCOLHER_IMAGEM: seleção solicitada pelo usuário para a posição '+slot);
  if(!paused){output.textContent='A sessão mudou. Verifique o kit no Manager.';return true;}
  cancelWaits();
  for(let i=0;i<80&&running;i++)await new Promise(resolve=>setTimeout(resolve,125));
  if(running){
   output.textContent='A Ponte ainda está terminando a consulta anterior. Não foi enviado outro prompt. Clique em Retomar novamente quando esta mensagem desaparecer.';
   return true;
  }
 }
 const latest=await getJob();
 if(!latest||latest.nonce!==job.nonce||latest.slot!==slot){
  output.textContent='A posição foi alterada. Confira a galeria antes de escolher outra imagem.';
  return true;
 }
 // Pausado = sem novos prompts, mas a lista de candidatas pode ser consultada.
 if(latest.status==='active')await BridgeState.control(latest.nonce,'paused',
  'ESCOLHER_IMAGEM: seleção pendente de confirmação na posição '+slot);
 output.textContent='Kit '+latest.sku+' · '+latest.completed.length+'/9 salvas. Escolha a foto da posição '+
  String(slot).padStart(2,'0')+'/09 para avançar. Nenhum novo pedido foi enviado.';
 try{
  await showImageChoices(await getJob());
  // Garantir que a seção de seleção fique visível mesmo após a rolagem no Runner.
  choices.hidden=false;
  choices.scrollIntoView?.({behavior:'smooth',block:'start'});
  return true;
 }catch(error){
  output.textContent='Imagem '+slot+'/09: '+String(error.message||error)+
   '. Se a conversa original foi fechada, abra Recuperação manual excepcional, selecione e vincule a conversa.';
  return true;
 }
}
document.getElementById('recoverReadyImage').onclick=async()=>{
 const job=await getJob();
 if(!job?.current?.attempted&&!job?.current?.sent){
  output.textContent='Não existe pedido da imagem atual para recuperar.';return;
 }
 try{
  if(await managerAlreadySavedPendingKitImage(job))return;
  if(await showPendingKitChoice(job,{userRequested:true}))return;
  if(running){output.textContent='A imagem atual ainda está sendo verificada; nenhum novo pedido foi enviado.';return;}
  choices.hidden=true;
  if(await resumeWithManager(job))return;
  output.textContent='Retomada não confirmada: '+(managerResumeError||'Abra '+(job.kitMode?'o kit ':'a SKU ')+job.sku+' no Shopee Manager e confira a galeria de imagens.')+' Nenhuma imagem foi recriada.';
 }catch(e){
  output.textContent='Recuperação da imagem: '+String(e.message||e);
 }
};
document.getElementById('manualRecovery').onclick=async()=>{
 const job=await getJob();if(!job||running)return;
 try{await showImageChoices(job);}catch(e){output.textContent=String(e.message||e);}
};
document.getElementById('restartPending').onclick=async()=>{
 let job=await getJob();if(!job)return;
 const missing=Array.from({length:9},(_,i)=>i+1).find(slot=>!job.completed.includes(slot));
 if(!missing){output.textContent='Todas as 9 posições já estão salvas.';return;}
 if(job.pending){
  await chrome.runtime.sendMessage({kind:'RA_RESUME',nonce:job.nonce});
  output.textContent='Reenviando a imagem '+missing+' já capturada, sem criar outra foto.';
  return;
 }
 const sent=Boolean(job.current?.attempted||job.current?.sent);
 const warning=sent
  ?'O ChatGPT pode ter gerado a imagem '+missing+' mesmo que o envio tenha falhado. Recomeçar pode criar outra imagem no ChatGPT.\n\nAs imagens das outras posições NÃO serão apagadas. Confirma o reinício APENAS da imagem '+missing+'?'
  :'Recomeçar apenas a imagem '+missing+' da SKU '+job.sku+'? As posições já salvas serão mantidas.';
 if(!window.confirm(warning))return;
 if(sent){await chrome.storage.local.set({['redeAchadosChatGptBridgeRecoveryBackup_'+job.nonce+'_'+missing]:
  {sku:job.sku,itemId:job.itemId,modelId:job.modelId,slot:missing,
   attemptedAt:job.current?.attemptedAt||null,chatUrl:job.current?.chatUrl||'',
   token:job.current?.token||'',createdAt:Date.now(),reason:'restart-missing-image'}});}
 const changed=await BridgeState.transact(state=>{
  if(!state||state.nonce!==job.nonce)return {value:null};
  const firstMissing=BridgeFlowPolicy.next(state);
  if(!firstMissing||state.pending)return {value:null};
  state.status='active';state.error='';state.controlEpoch=Number(state.controlEpoch||0)+1;
  state.slot=firstMissing;state.current=null;state.autoRetry=null;
  // Somente a tentativa não confirmada é descartada; as fotos aceitas permanecem.
  if(state.imageHashes)delete state.imageHashes[firstMissing];
  if(sent){state.chatTabId=null;state.chatOwned=false;state.previousOwnedChat=null;}
  return {job:state,value:state};
 });
 if(!changed){output.textContent='A posição mudou durante a recuperação. Confira a galeria e tente novamente.';return;}
 await report(changed,'Recomeçando somente a imagem '+missing+'. '+changed.completed.length+'/9 imagens preservadas.');
 await chrome.runtime.sendMessage({kind:'RA_RESUME',nonce:changed.nonce});
};
function showLegacyRestart(job){ updatePendingButton(job); }
// Kits: o botão verde consulta a galeria do Manager, recebe a lista de slots,
// atualiza o estado da extensão e vincula o nonce. Não faz duas chamadas
// RA_SITE_CONTINUE encadeadas; isso provocava timeout na v1.0.55.
async function resumeKitDirect(job){
 managerResumeError='';
 const allowed=u=>{try{const p=new URL(u);return p.origin===ORIGIN&&p.pathname.startsWith('/app/kits');}catch{return false;}};
 const preferred=await chrome.tabs.get(job.appTabId).catch(()=>null);
 const tabs=(preferred&&allowed(preferred.url)?[preferred]:[]).concat(
  (await chrome.tabs.query({url:ORIGIN+'/app/*'})).filter(t=>allowed(t.url)&&t.id!==preferred?.id));
 if(!tabs.length){managerResumeError='Abra o rascunho em Kits Inteligentes WeDrop e atualize o Manager.';return false;}
 for(const tab of tabs){
  try{
   const read=await chrome.scripting.executeScript({target:{tabId:tab.id},world:'MAIN',
    func:async identity=>{
     if(location.origin!=='https://redeachados-shopee.onrender.com'||
        typeof globalThis.__RA_KIT_RECOVER_CONTEXT!=='function')
      return {ok:false,error:'Atualize a página de Kits (Ctrl + Shift + R).'};
     return globalThis.__RA_KIT_RECOVER_CONTEXT(identity);
    },args:[{sku:job.sku,itemId:'0',modelId:'0',nonce:job.nonce}]});
   const context=read?.[0]?.result||{};
   if(context.ok!==true){managerResumeError=String(context.error||'Editor não confirmou o kit.').slice(0,300);continue;}
   if(context.sku!==job.sku||context.kitMode!==true)throw Error('Kit divergente da sessão preservada.');
   const synced=await chrome.runtime.sendMessage({kind:'RA_RUNNER_SYNC_KIT',payload:{
    nonce:job.nonce,sku:job.sku,appTabId:tab.id,
    completed:context.completed,prompts:context.prompts}});
   if(!synced?.ok){managerResumeError=String(synced?.error||'Não foi possível sincronizar a sessão.');continue;}
   const bound=await chrome.scripting.executeScript({target:{tabId:tab.id},world:'MAIN',
    func:identity=>{
     if(location.origin!=='https://redeachados-shopee.onrender.com'||
        typeof globalThis.__RA_KIT_BIND_RECOVERED!=='function')
      return {ok:false,error:'Manager precisa ser atualizado antes da importação.'};
     return globalThis.__RA_KIT_BIND_RECOVERED(identity);
    },args:[{nonce:job.nonce,sku:job.sku,itemId:'0',modelId:'0'}]});
   const ack=bound?.[0]?.result||{};
   if(ack.ok!==true){managerResumeError=String(ack.error||'Manager não confirmou a recepção.');continue;}
   const wake=await chrome.runtime.sendMessage({kind:'RA_RESUME',nonce:job.nonce});
   if(!wake?.ok){managerResumeError=String(wake?.error||'Runner não pôde reiniciar.');continue;}
   output.textContent='Kit '+job.sku+' sincronizado diretamente: '+synced.completed.length+
    '/9 salvas, retomando posição '+String(synced.slot).padStart(2,'0')+
    '/09 na conversa original, sem repetir o prompt.';
   return true;
  }catch(error){managerResumeError=String(error.message||error).slice(0,330);}
 }
 return false;
}
// O Runner não pode acreditar no contador local depois de perder um ACK.
// O botão Retomar solicita ao Manager a reconciliação autenticada de todas
// as nove posições; a própria página emite RA_SITE_CONTINUE e RA_SITE_WAKE.
// NENHUMA nova aba, geração ou upload ocorre antes dessa confirmação.
let managerResumeError='';
// Esta rotina recebe o ACK real da função de continuação do Manager.
// Não confundir button.click() com sincronização confirmada.
async function resumeWithManager(job){
 if(job.kitMode===true)return resumeKitDirect(job);
 managerResumeError='';
 const allowedManager=u=>{
  try{const p=new URL(u);return p.origin===ORIGIN&&p.pathname.startsWith('/app/');}catch{return false;}
 };
 const preferred=await chrome.tabs.get(job.appTabId).catch(()=>null);
 const candidates=(preferred&&allowedManager(preferred.url)?[preferred]:[]).concat(
  (await chrome.tabs.query({url:ORIGIN+'/app/*'})).filter(t=>allowedManager(t.url)&&t.id!==preferred?.id));
 if(!candidates.length){managerResumeError='Abra a aba Shopee Manager na mesma SKU; nenhuma imagem foi apagada.';return false;}
 for(const tab of candidates){
  try{
   const result=await chrome.scripting.executeScript({
    target:{tabId:tab.id},world:'MAIN',
    func:async ({sku,itemId,modelId,kitMode,nonce})=>{
     if(location.origin!=='https://redeachados-shopee.onrender.com')
      return {ok:false,error:'Origem não autorizada.'};
     // Kits NÃO têm o Item ID/modelo da otimização de anúncios individuais.
     // A retomada precisa chamar exclusivamente o editor de kits; a função
     // antiga dos anúncios individuais continua literalmente intacta.
     const bridge=kitMode===true ? globalThis.__RA_KIT_RESUME_BRIDGE:
      globalThis.__RA_SHOPEE_RESUME_BRIDGE;
     if(typeof bridge!=='function')return {ok:false,error:kitMode===true?
      'Abra o editor do mesmo kit em Kits Inteligentes WeDrop. Atualize o Manager com Ctrl + Shift + R.':
      'O Shopee Manager ainda está na versão antiga. Atualize com Ctrl + Shift + R.'};
     return await Promise.race([
      bridge({sku,itemId,modelId,nonce}),
      new Promise(resolve=>setTimeout(()=>resolve({ok:false,error:'A consulta do Manager ainda não terminou. Verifique a tela antes de retomar novamente.'}),45000))
     ]);
    },args:[{sku:job.sku,itemId:String(job.itemId),modelId:String(job.modelId),kitMode:job.kitMode===true,nonce:job.nonce}]
   });
   const reply=result?.[0]?.result||{};
   if(reply.ok===true && reply.nonce===(await getJob())?.nonce &&
      String(reply.sku)===job.sku && String(reply.itemId)===String(job.itemId) &&
      String(reply.modelId)===String(job.modelId)){
    output.textContent='SKU '+job.sku+' · Manager confirmou a retomada da imagem '+String(reply.slot||job.slot).padStart(2,'0')+'/09. ' +
     'A Ponte foi reativada; procurando a resposta já gerada, sem repetir o prompt.';
    return true;
   }
   managerResumeError=String(reply.error||(
    reply.ok?'A sessão recuperada pertence a outra execução; nenhum prompt foi repetido.':
    'O Manager não confirmou a retomada.')).slice(0,450);
  }catch(e){managerResumeError='Falha ao consultar o Manager: '+String(e.message||e).slice(0,250);}
 }
 return false;
}
// Uma imagem já salva no Manager pode não estar no contador local da Ponte
// quando o ACK se perde ou o runner é recarregado. Consultar o Manager ANTES
// da escolha de imagem evita ficar pedindo a posição 03, já confirmada 3/9.
async function managerAlreadySavedPendingKitImage(job){
 if(!job?.kitMode||!Array.isArray(job.completed))return false;
 const pendingSlot=Array.from({length:9},(_,i)=>i+1)
  .find(slot=>!job.completed.includes(slot));
 if(!pendingSlot)return false;
 const allow=url=>{
  try{const u=new URL(url);return u.origin===ORIGIN&&u.pathname.startsWith('/app/kits');}
  catch{return false;}
 };
 let tabs=[];
 const preferred=await chrome.tabs.get(job.appTabId).catch(()=>null);
 if(preferred&&allow(preferred.url))tabs.push(preferred);
 const other=await chrome.tabs.query({url:ORIGIN+'/app/*'}).catch(()=>[]);
 tabs.push(...other.filter(t=>allow(t.url)&&!tabs.some(x=>x.id===t.id)));
 for(const tab of tabs){
  try{
   const rows=await chrome.scripting.executeScript({target:{tabId:tab.id},world:'MAIN',
    func:identity=>{
     if(location.origin!=='https://redeachados-shopee.onrender.com'||
        typeof globalThis.__RA_KIT_RECOVER_CONTEXT!=='function')
      return {ok:false};
     return globalThis.__RA_KIT_RECOVER_CONTEXT(identity);
    },args:[{sku:job.sku,itemId:'0',modelId:'0',nonce:job.nonce}]});
   const saved=rows?.[0]?.result;
   if(saved?.ok!==true||saved.sku!==job.sku||saved.kitMode!==true||
      !Array.isArray(saved.completed))continue;
   // Só sincronizar o Manager quando ele já comprovou uma imagem A MAIS.
   // Se a 03 ainda não está salva, o botão continua abrindo a escolha 03.
   if(!saved.completed.includes(pendingSlot))continue;
   output.textContent='O Shopee Manager já confirmou a imagem '+String(pendingSlot).padStart(2,'0')+
    '/09. Sincronizando a Ponte antes de continuar, sem refazer esta foto…';
   if(await resumeKitDirect(job))return true;
   output.textContent='A imagem '+String(pendingSlot).padStart(2,'0')+
    ' já aparece salva no Manager, mas a Ponte não conseguiu reconciliar: '+managerResumeError;
   return true; // não tentar importar de novo uma imagem já salva
  }catch(error){
   // Falha na consulta não é permissão para avançar; fluxo anterior permanece.
  }
 }
 return false;
}
document.getElementById('resume').onclick=async()=>{
 if(retryTimer){clearTimeout(retryTimer);retryTimer=null;}
 const job=await getJob();if(!job)return;
 if(await managerAlreadySavedPendingKitImage(job))return;
 if(await showPendingKitChoice(job,{userRequested:true}))return;
 if(running){output.textContent='A Ponte ainda está verificando a imagem, sem enviar outro prompt.';return;}
 output.textContent='Consultando confirmação real do Shopee Manager para '+(job.kitMode?'kit ':'SKU ')+job.sku+'...';
 if(await resumeWithManager(job))return;
 output.textContent='Retomada não confirmada: '+(managerResumeError||
  'Abra a SKU '+job.sku+' na etapa Imagens do Shopee Manager e confira a sessão.')+
  ' As imagens capturadas continuam preservadas; nenhuma nova geração foi iniciada.';
};
document.getElementById('startOver').onclick=async()=>{
 const button=document.getElementById('startOver');if(button.disabled)return;
 button.disabled=true;
 try{
  const tabs=(await chrome.tabs.query({url:ORIGIN+'/app/*'})).sort((a,b)=>(b.lastAccessed||0)-(a.lastAccessed||0));
  for(const tab of tabs){
   const [state]=await chrome.scripting.executeScript({target:{tabId:tab.id},world:'MAIN',func:()=>{
    const button=document.getElementById('optimizerChatgptStartOver');
    const plan=globalThis.RACommercialStudioBridge?.getPlan?.();
    return {ready:Boolean(button&&button.getClientRects().length&&plan?.sku),sku:String(plan?.sku||'')};
   }});
   if(!state?.result?.ready)continue;
   await chrome.tabs.update(tab.id,{active:true});
   await chrome.scripting.executeScript({target:{tabId:tab.id},world:'MAIN',func:()=>{
    const button=document.getElementById('optimizerChatgptStartOver');
    button?.scrollIntoView({block:'center'});button?.click();
   }});
   output.textContent='Reinício solicitado no Manager para a SKU '+state.result.sku+'. Confira e confirme nessa aba. Outras SKUs permanecem preservadas.';
   return;
  }
  await chrome.tabs.create({url:ORIGIN+'/app/otimizacao',active:true});
  output.textContent='Selecione o produto na etapa Imagens do Manager e clique em Começar do zero.';
 }catch(error){output.textContent='Abra o Manager e clique em Começar do zero: '+String(error.message||error);}
 finally{button.disabled=false;}
};
document.getElementById('pause').onclick=async()=>{
 if(retryTimer){clearTimeout(retryTimer);retryTimer=null;}
 await chrome.runtime.sendMessage({kind:'RA_PAUSE_ALL'});
 const job=await getJob();if(job)await report(job,'Automação pausada. O pedido já enviado pode continuar no ChatGPT.');
};
void chrome.tabs.getCurrent().then(tab=>{myTabId=tab?.id;return run();}).catch(e=>{output.textContent=String(e?.message||e);});
