'use strict';
/* Extensão 1.0.48: entrega SEO persistente e retomada automática por anúncio. */
(function(root){
 const SITE='https://redeachados-shopee.onrender.com';
 const CHAT='https://chatgpt.com/';
 const TAB_KEY='ra_seo_chat_tab_v1';
 const CACHE_KEY='ra_seo_last_verified_titles_v1';
 const JOB_KEY='ra_seo_pending_delivery_v2';
 const jobKey=j=>JOB_KEY+'_'+encodeURIComponent(JSON.stringify([j.sku,j.itemId,j.modelId].map(String)));
 const durable=()=>chrome.storage.local||chrome.storage.session;
 const same=(a,b)=>!!a&&!!b&&['sku','itemId','modelId'].every(k=>String(a[k])===String(b[k]));
 const seoTab=t=>/t[ií]tulos?.*seo|seo.*(?:shopee|t[ií]tulos?)|gerar t[ií]tulos?/i.test(t?.title||'');
 const saveJob=job=>{
  const saved={nonce:job.nonce,sku:job.sku,itemId:job.itemId,
   modelId:job.modelId,siteTabId:job.siteTabId,tabId:job.tabId,stage:job.stage,
   rawText:job.rawText||'',chatUrl:job.chatUrl||'',at:Date.now()};
  return durable().set({[JOB_KEY]:saved,[jobKey(job)]:saved});
 };
 const readJob=async identity=>{const key=identity?jobKey(identity):JOB_KEY;
  const j=(await durable().get(key))[key];
  return j&&Date.now()-Number(j.at||0)<24*60*60*1000?j:null;};
 let active=null, pendingRecovery=null;
 const delay=ms=>new Promise(resolve=>setTimeout(resolve,ms));
 function validate(payload){
  if(!payload||typeof payload!=='object')throw Error('Pesquisa SEO vazia.');
  const nonce=String(payload.nonce||''),sku=String(payload.sku||'').trim();
  const itemId=String(payload.itemId||''),modelId=String(payload.modelId||'');
  const prompt=String(payload.prompt||'');
  if(!/^[a-f0-9-]{30,50}$/i.test(nonce)||!sku||sku.length>120||
    !/^\d{1,18}$/.test(itemId)||!/^\d{1,18}$/.test(modelId))throw Error('Identidade SEO da SKU inválida.');
  if(prompt.length<500||prompt.length>16000)throw Error('Pesquisa SEO incompleta ou muito extensa.');
  return {nonce,sku,itemId,modelId,prompt};
 }
 function allowed(url){
  try {const u=new URL(url);return u.origin==='https://chatgpt.com'&&
   (u.pathname==='/'||/^\/c\/[a-z0-9-]+\/?$/i.test(u.pathname));}catch{return false;}
 }
 // A UI navega de / para /c/ID depois do primeiro envio. Na transição,
 // tab.url pode ficar ausente até o próximo evento de navegação.
 function trustedTab(tab){
  return Boolean(tab&&(allowed(tab.url)||allowed(tab.pendingUrl)||
   ((!tab.url||tab.url==='')&&tab.status==='loading')));
 }
 function extractFour(raw){
  const s=String(raw||'').trim();
  if(s.length<20)return null;
  // Coletar o ÚLTIMO objeto válido: a resposta também pode conter modelos
  // de JSON com "title":"..." incluídos no próprio prompt do usuário.
  let last=null;
  const meaningful=arr=>Array.isArray(arr)&&arr.length===4&&
   arr.filter(v=>String(typeof v==='string'?v:v?.title||'').trim().length>=65).length>=3;
  for(let start=s.indexOf('{');start>=0;start=s.indexOf('{',start+1)){
   let depth=0,inside=false,escaped=false;
   for(let i=start;i<s.length;i++){
    const ch=s[i];
    if(escaped){escaped=false;continue;}
    if(inside&&ch.charCodeAt(0)===92){escaped=true;continue;}
    if(ch==='"'){inside=!inside;continue;}
    if(inside)continue;
    if(ch==='{')depth++;
    if(ch==='}'&&--depth===0){
     try{
      const obj=JSON.parse(s.slice(start,i+1));
      if(meaningful(obj?.titles))last={raw:s.slice(start,i+1),titles:obj.titles,mode:'json'};
     }catch{}
     break;
    }
   }
  }
  if(last)return last;
  // ChatGPT pode dividir o objeto por múltiplos componentes visuais.
  // Buscar TODOS os campos e preferir o último grupo de 4 títulos reais,
  // descartando os títulos de exemplo existentes no próprio pedido.
  const titleRe=/["“]title["”]\s*:\s*["“]((?:\\.|[^"”\\])*)["”]/g;
  const found=[];let match;
  while((match=titleRe.exec(s))!==null&&found.length<160){
   let title=match[1];
   try{title=JSON.parse('"'+title+'"');}catch{title=title.replace(/\\"/g,'"');}
   found.push({title:String(title).trim()});
  }
  for(let i=found.length-4;i>=0;i--){
   const group=found.slice(i,i+4);
   if(meaningful(group)){
    const obj={titles:group,keywords:[],sources:[],researchStatus:'unverified'};
    return {raw:JSON.stringify(obj),titles:group,mode:'title-fields'};
   }
  }
  return null;
 }
 function responseComplete(raw){return !!extractFour(raw);}

 // Este código roda SOMENTE na aba chatgpt.com por chrome.scripting.executeScript.
 // Não chama APIs internas, não lê cookies, não modifica outros chats.
 function dom(action,payload){
  // A interface do ChatGPT muda: desde 2026 há versões sem #prompt-textarea,
  // mas com div.ProseMirror[role=textbox]. Procurar SOMENTE editor visível.
  function visible(el){return !!el&&(!el.getClientRects||el.getClientRects().length>0)&&
   getComputedStyle(el).visibility!=='hidden'&&getComputedStyle(el).display!=='none';}
  function editor(){
   const selectors=[
    '[data-testid="composer-input"][contenteditable="true"]',
    '#prompt-textarea[contenteditable="true"]',
    'div.ProseMirror[contenteditable="true"][role="textbox"]',
    'div.ProseMirror[contenteditable="true"]',
    'div.ProseMirror[role="textbox"]',
    'div.ProseMirror',
    '[data-composer-markdown][contenteditable="true"]',
    '[role="textbox"][contenteditable="true"]',
    'div[contenteditable="true"][data-placeholder]',
    'textarea#prompt-textarea','textarea[name="prompt-textarea"]',
    'textarea#mobile-composer-prompt'
   ];
   for(const selector of selectors){
    for(const el of document.querySelectorAll(selector))if(visible(el)&&
     (el.tagName==='TEXTAREA'||el.isContentEditable||el.getAttribute('contenteditable')==='true'))return el;
   }
   return null;
  }
  function userTurns(){return document.querySelectorAll('[data-message-author-role="user"], [data-testid="conversation-turn-user"]').length;}
  function actualText(box){return String(box?.tagName==='TEXTAREA'?box.value:box?.innerText||box?.textContent||'').trim();}
  function sendButton(box){
   const form=box?.closest('form');
   const selectors=[
    'button[data-testid="send-button"]',
    'button[data-testid="composer-send-button"]',
    'button#composer-submit-button',
    'button[aria-label="Send message"]',
    'button[aria-label="Send prompt"]',
    'button[aria-label="Enviar mensagem"]',
    'button[aria-label="Enviar"]',
    'button[aria-label="Send"]',
    'button[aria-label="Enviar prompt"]',
    'button[type="submit"]'
   ];
   for(const selector of selectors){
    const nodes=[...(form?.querySelectorAll(selector)||[]),...document.querySelectorAll(selector)];
    for(const button of nodes){
     if(!visible(button)||button.disabled||button.getAttribute('aria-disabled')==='true')continue;
     if(selector==='button[type="submit"]'&&!form?.contains(button))continue;
     return button;
    }
   }
   return null;
  }
  if(action==='ready'){
   const box=editor();return {ready:!!box,users:userTurns(),
    diagnosis:box?box.tagName+' '+(box.id||box.className||''):'Editor visível não encontrado'};
  }
  if(action==='fill'){
   const box=editor();if(!box)return {filled:false,error:'Campo ChatGPT não encontrado no layout atual. Faça login e atualize a aba.'};
   if(document.querySelector('[data-testid="stop-button"]'))return {filled:false,error:'ChatGPT ainda está gerando uma resposta.'};
   const value=String(payload?.prompt||'');if(value.length<500)return {filled:false,error:'Pesquisa SEO vazia.'};
   box.focus();
   if(box.tagName==='TEXTAREA'){
    const setter=Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype,'value')?.set;
    if(setter)setter.call(box,value);else box.value=value;
    box.dispatchEvent(new Event('input',{bubbles:true}));
   }else{
    // ProseMirror só atualiza seu estado interno quando a inserção é um evento
    // de edição real. Não usar replaceChildren/innerHTML/textContent: o editor
    // poderia exibir texto que o botão Enviar não reconhece.
    const selection=window.getSelection();
    if(selection&&actualText(box)){
     const range=document.createRange();range.selectNodeContents(box);
     selection.removeAllRanges();selection.addRange(range);
    }
    const ok=document.execCommand('insertText',false,value);
    if(!ok||!actualText(box).includes(value.slice(0,65))){
     // Uma segunda tentativa com foco/seleção já estabilizados; nunca pintar
     // texto visualmente sem que o estado real do ProseMirror seja atualizado.
     box.focus();document.execCommand('insertText',false,value);
    }
    box.dispatchEvent(new Event('input',{bubbles:true}));
   }
   const text=actualText(box);
   if(!text.includes(value.slice(0,65)))return {filled:false,error:'O ChatGPT abriu, mas seu campo ProseMirror recusou a inserção automática. Cole o pedido manualmente ou atualize o Chrome.'};
   return {filled:true,users:userTurns(),textLength:text.length};
  }
  if(action==='sendReady'){
   const box=editor();return {ready:Boolean(sendButton(box)),hasText:actualText(box).length>100,
    textLength:actualText(box).length,users:userTurns()};
  }
  if(action==='submit'){
   const box=editor();if(!box)return {sent:false,error:'Campo ChatGPT não encontrado.'};
   const send=sendButton(box);
   if(!send)return {sent:false,error:'Botão Enviar ainda não habilitado pelo ChatGPT.'};
   if(actualText(box).length<100)return {sent:false,error:'O ChatGPT não recebeu o texto da pesquisa.'};
   const before=userTurns();
   send.click();return {sent:true,usersBefore:before};
  }
  if(action==='confirmSent'){
   const box=editor();const users=userTurns();const textLength=actualText(box).length;
   const generating=Boolean(document.querySelector('[data-testid="stop-button"]'));
   return {confirmed:users>Number(payload?.usersBefore||0)||generating||
    (textLength<80&&Boolean(payload?.clicked)),users,textLength,generating};
  }
  if(action==='result'){
   const selectors='[data-message-author-role="assistant"], [data-testid="conversation-turn-assistant"], article[data-role="assistant"]';
   const assistants=[...document.querySelectorAll(selectors)].filter(el=>visible(el)||Boolean(String(el?.innerText||el?.textContent||'').trim()));
   const fallback=[...document.querySelectorAll('main .markdown, main .prose, main pre, main pre code, main [data-testid="conversation-turn-assistant"]')]
    .filter(el=>visible(el)&&!el.closest?.('[contenteditable="true"], form'));
   const last=assistants[assistants.length-1];
   // Uma resposta longa pode ser dividida em vários blocos markdown e code.
   // Capturar o container do ÚLTIMO turno do assistente inteiro, em vez de
   // pegar apenas o maior dos últimos cinco elementos individuais.
   const texts=[];
   const offer=node=>{
    const t=String(node?.innerText||node?.textContent||'').trim();
    if(t&&t.length>=15&&!texts.includes(t))texts.push(t);
    const literal=String(node?.textContent||'').trim();
    if(literal.length>=15&&!texts.includes(literal))texts.push(literal);
   };
   if(last){
    offer(last);
    const markdown=[...last.querySelectorAll?.('.markdown, .prose, pre, pre code, [data-testid="code-block"]')||[]].filter(visible);
    for(const part of markdown)offer(part);
    if(markdown.length>1){
     // Somente blocos do mesmo turno do assistente (não misturar outra SKU).
     const roots=markdown.filter(part=>!markdown.some(ancestor=>ancestor!==part&&ancestor.contains?.(part)));
     offer({innerText:roots.map(part=>part.innerText||part.textContent||'').join('\n')});
    }
   }else{
    const lastBlock=fallback[fallback.length-1];
    const parent=lastBlock?.closest?.('[data-testid="conversation-turn"], [data-testid="conversation-turn-assistant"], article');
    if(parent&&!parent.matches?.('[data-message-author-role="user"], [data-testid="conversation-turn-user"]'))offer(parent);
    // Últimos blocos, unicamente como recuperação de layout sem turnos.
    for(const part of fallback.slice(-20))offer(part);
    if(fallback.length>1)offer({innerText:fallback.slice(-20).map(x=>x.innerText||x.textContent||'').join('\n')});
   }
   // Em versões recentes do ChatGPT, respostas longas podem ficar fora dos
   // seletores de turno. Tentar o conteúdo do MAIN inteiro (somente a aba SEO)
   // e então document.body, nunca colher outras abas ou outros sites.
   const main=document.querySelector('main')||document.querySelector('[role=main]');
   if(!last&&main)offer(main);
   if(!last&&!texts.some(t=>(t.match(/["“]title["”]\s*:/gi)||[]).length>=4)&&document.body)
    offer(document.body);
   // Em vez do texto mais extenso, preferir a ÚLTIMA representação contendo
   // as quatro chaves, normalmente o texto final do assistente.
   const candidates=texts.map(raw=>({raw,titles:(raw.match(/["“]title["”]\s*:/gi)||[]).length}));
   const complete=candidates.filter(v=>v.titles>=4);
   complete.sort((a,b)=>Number(a.titles===4)-Number(b.titles===4)||a.raw.length-b.raw.length);
   const choice=complete.length?complete[complete.length-1]:candidates.sort((a,b)=>b.titles-a.titles||b.raw.length-a.raw.length)[0];
   const raw=(choice?.raw||'').slice(-115000);
   const generating=Boolean(document.querySelector('[data-testid="stop-button"]')||
    document.querySelector('button[aria-label="Parar de gerar"],button[aria-label="Stop generating"]'));
   const userNodes=[...document.querySelectorAll('[data-message-author-role="user"], [data-testid="conversation-turn-user"]')];
   const userRaw=String(userNodes.at(-1)?.innerText||userNodes.at(-1)?.textContent||'');
   return {raw,userRaw,generating,users:userTurns(),assistantCount:assistants.length||(fallback.length?1:0),
    diagnostics:{blocks:texts.length,titleFields:candidates[0]?.titles||0,chars:raw.length}};
  }
  return {};
 }
 async function operate(tabId,action,payload={}){
  let lastError=null;
  for(let attempt=0;attempt<12;attempt++){
   const tab=await chrome.tabs.get(tabId).catch(()=>null);
   if(!tab)throw Error('A aba da pesquisa SEO foi fechada. Reabra a pesquisa em Gerar novos títulos.');
   if(!trustedTab(tab)){
    // Aguardamos mudanças momentâneas de URL, mas nunca injetamos scripts
    // se a aba não estiver em uma página autorizada do ChatGPT.
    lastError=Error('A aba ChatGPT mudou de endereço durante a pesquisa.');
    if(attempt===11)throw lastError;
    await delay(400);continue;
   }
   if(!allowed(tab.url)){
    await delay(400);continue;
   }
   try{
    const result=await chrome.scripting.executeScript({target:{tabId},func:dom,args:[action,payload]});
    return result?.[0]?.result||{};
   }catch(err){
    lastError=err;
    // Web Navigation / ProseMirror podem reconstruir o documento durante
    // a resposta. Tentar de novo em vez de descartar quatro títulos prontos.
    if(attempt===11)throw Error('Não foi possível ler a conversa ChatGPT após a troca de página: '+String(err.message||err).slice(0,140));
    await delay(400);
   }
  }
  throw lastError||Error('Não foi possível acessar a conversa ChatGPT.');
 }
 async function chatTab(siteTabId,nonce){
  // O Manager já abriu uma aba no clique do usuário para evitar bloqueio de popup.
  // Só adotar a aba com a marca exata desta solicitação ou criada pelo Manager,
  // nunca uma conversa pessoal do ChatGPT nem a aba do gerador das nove imagens.
  const candidates=typeof chrome.tabs.query==='function'?await chrome.tabs.query({}).catch(()=>[]):[];
  const fromManager=candidates.filter(tab=>{
   const url=String(tab.url||tab.pendingUrl||'');
   if(!trustedTab(tab))return false;
   try{
    const parsed=new URL(url);
    return parsed.origin==='https://chatgpt.com'&&
     (parsed.searchParams.get('ra_seo_nonce')===nonce||
      (tab.openerTabId===siteTabId&&parsed.pathname==='/'&&
       (!parsed.search||parsed.searchParams.has('ra_seo_nonce'))));
   }catch{return false;}
  });
  let tab=fromManager.at(-1)||null;
  if(!tab){
   // Se a abertura da aba pelo navegador foi bloqueada, a extensão abre diretamente.
   const saved=(await chrome.storage.session.get(TAB_KEY))[TAB_KEY];
   tab=Number.isInteger(saved)?await chrome.tabs.get(saved).catch(()=>null):null;
   if(!tab||!trustedTab(tab))tab=await chrome.tabs.create({url:CHAT,active:true});
  }
  if(tab.url!==CHAT)tab=await chrome.tabs.update(tab.id,{url:CHAT,active:true});
  else await chrome.tabs.update(tab.id,{active:true});
  await chrome.storage.session.set({[TAB_KEY]:tab.id});
  return tab.id;
 }
 async function closeDelivered(job){
  if(Number.isInteger(job.tabId))await chrome.tabs.remove(job.tabId).catch(()=>{});
  const saved=await readJob();
  if(saved&&saved.nonce===job.nonce&&same(saved,job))await durable().remove(JOB_KEY);
  const own=await readJob(job);
  if(own?.nonce===job.nonce)await durable().remove(jobKey(job));
  const owned=(await chrome.storage.session.get(TAB_KEY))[TAB_KEY];
  if(owned===job.tabId)await chrome.storage.session.remove(TAB_KEY);
  const cache=(await chrome.storage.session.get(CACHE_KEY))[CACHE_KEY];
  if(cache&&same(cache,job))await chrome.storage.session.remove(CACHE_KEY);
 }
 async function waitForResult(job,beforeRaw=''){
  let previous='',stable=0;
  // Pesquisa web + raciocínio pode levar mais de cinco minutos. A retomada
  // continua lendo a mesma conversa, sem enviar um segundo prompt.
  for(let i=0;i<1800;i++){
   if(job.suppressOutcome)return null;
   await delay(950);
   const state=await operate(job.tabId,'result');
   if(state.users<1&&state.assistantCount<1)continue;
   if(!state.generating&&state.raw!==beforeRaw&&responseComplete(state.raw)){
    stable=state.raw===previous?stable+1:0;previous=state.raw;
    if(stable>=2)return extractFour(state.raw);
   }else{stable=0;previous='';}
  }
  throw Error('A pesquisa continua na aba ChatGPT. Ao voltar à etapa SEO, a captura será retomada automaticamente.');
 }
 async function deliver(job,outcome){
  if(job.suppressOutcome)return;
  if(outcome.ok){
   job.rawText=outcome.rawText;job.stage='result';
   const tab=await chrome.tabs.get(job.tabId).catch(()=>null);
   job.chatUrl=tab?.url||job.chatUrl||'';
   await saveJob(job);
   await chrome.storage.session.set({[CACHE_KEY]:{...job,at:Date.now()}});
  }
  const send=()=>chrome.tabs.sendMessage(job.siteTabId,{kind:'RA_EXTENSION_SEO_RESULT',
   nonce:job.nonce,sku:job.sku,itemId:job.itemId,modelId:job.modelId,...outcome}).catch(()=>null);
  await send();
  if(!outcome.ok)return;
  // ACK da ponte não significa importação. Guardar até o Manager salvar os
  // quatro cartões e confirmar, inclusive se a página for recarregada.
  for(let i=0;i<100&&!job.delivered&&!job.suppressOutcome;i++){
   await delay(200);
   if(i%10===9&&!job.delivered)await send();
  }
  if(job.delivered?.ok===true)await closeDelivered(job);
 }
 async function execute(input,siteTabId){
  const job=active;
  let outcome={ok:false,error:'Pesquisa não concluída.'};
  let tabId=null;
  try{
   // SEO and images have separate tabs, storage keys and result channels.
   // An active/paused image job must NEVER block title generation or reset it.
   // Do not even read BridgeState here: the image runner may be reconciling.
   tabId=await chatTab(siteTabId,input.nonce);
   job.tabId=tabId;job.stage='preparing';await saveJob(job);
   await chrome.tabs.sendMessage(siteTabId,{kind:'RA_EXTENSION_SEO_PROGRESS',nonce:active?.nonce||input.nonce,
    sku:input.sku,itemId:input.itemId,modelId:input.modelId,status:'Aba ChatGPT aberta. Preparando a pesquisa de títulos SEO…'}).catch(()=>{});
   if(active)active.tabId=tabId;
   let ready=false;
   for(let i=0;i<45;i++){
    const tab=await chrome.tabs.get(tabId).catch(()=>null);
    if(!tab)throw Error('A aba ChatGPT foi fechada.');
    if(tab.status==='complete'&&allowed(tab.url)){
     const state=await operate(tabId,'ready').catch(()=>({}));
     if(state.ready){ready=true;break;}
    }
    await delay(700);
   }
   if(!ready)throw Error('Campo do ChatGPT indisponível. Faça login no ChatGPT e tente novamente.');
   const report=async(status)=>{
    await chrome.tabs.sendMessage(siteTabId,{kind:'RA_EXTENSION_SEO_PROGRESS',nonce:active?.nonce||input.nonce,
     sku:input.sku,itemId:input.itemId,modelId:input.modelId,status}).catch(()=>{});
   };
   await report('ChatGPT carregado. Inserindo pesquisa de mercado da WeDrop…');
   const before=await operate(tabId,'result');
   const filled=await operate(tabId,'fill',{prompt:input.prompt});
   if(!filled.filled)throw Error(filled.error||'Não foi possível preencher a pesquisa no ChatGPT.');
   await report('Prompt preenchido. Confirmando o botão Enviar…');
   let enabled=false;
   for(let i=0;i<20;i++){
    const state=await operate(tabId,'sendReady');
    if(state.ready&&state.hasText){enabled=true;break;}
    await delay(350);
   }
   if(!enabled)throw Error('O texto apareceu, mas o ChatGPT não habilitou Enviar. Verifique a aba aberta e use a importação manual se necessário.');
   const send=await operate(tabId,'submit');
   if(!send.sent)throw Error(send.error||'Não foi possível enviar pesquisa ao ChatGPT.');
   let confirmed=false;
   for(let i=0;i<18;i++){
    await delay(350);
    const state=await operate(tabId,'confirmSent',{clicked:true,usersBefore:send.usersBefore});
    if(state.confirmed){confirmed=true;break;}
   }
   if(!confirmed)throw Error('O botão foi acionado, mas o ChatGPT não confirmou o envio. Verifique a aba aberta.');
   await report('Pesquisa enviada. Aguardando quatro títulos com as palavras-chave…');
   job.stage='sent';await saveJob(job);
   const complete=await waitForResult(job,before.raw);
   if(!complete)return;
   outcome={ok:true,rawText:complete.raw};
  }catch(err){outcome={ok:false,error:String(err?.message||err).slice(0,350)};}
  finally{
   try{await deliver(job,outcome);}finally{if(active===job)active=null;}
  }
 }
 async function resume(payload,siteTabId){
  const request=recoveryIdentity(payload,siteTabId);
  if(active&&same(active,request)){
   active.nonce=request.nonce;active.siteTabId=siteTabId;active.delivered=null;await saveJob(active);
   if(active.rawText)await chrome.tabs.sendMessage(siteTabId,{kind:'RA_EXTENSION_SEO_RESULT',
    ...request,ok:true,rawText:active.rawText}).catch(()=>{});
   return {ok:true,pending:true,nonce:request.nonce};
  }
  if(active)return {ok:true,pending:false};
  const saved=await readJob(request);
  if(!same(saved,request))return {ok:true,pending:false};
  const extracted=extractFour(saved.rawText);
  if(!extracted&&saved.stage!=='sent')return {ok:true,pending:false};
  if(!extracted){
   const tab=await chrome.tabs.get(saved.tabId).catch(()=>null);
   if(!tab||!allowed(tab.url))return {ok:true,pending:false};
  }
  const job=active={...saved,...request,siteTabId,delivered:null};
  await saveJob(job);
  void (async()=>{
   try{
    const result=extracted||await waitForResult(job);
    if(result)await deliver(job,{ok:true,rawText:result.raw});
   }catch(err){await deliver(job,{ok:false,error:String(err?.message||err).slice(0,350)});}
   finally{if(active===job)active=null;}
  })();
  return {ok:true,pending:true,nonce:request.nonce};
 }
 function recoveryIdentity(payload,siteTabId){
  if(!siteTabId||!payload||typeof payload!=='object')throw Error('Solicitação de recuperação inválida.');
  const nonce=String(payload.nonce||''),sku=String(payload.sku||''),itemId=String(payload.itemId||''),modelId=String(payload.modelId||'');
  if(!/^[a-f0-9-]{30,50}$/i.test(nonce)||!sku||!/^\d{1,18}$/.test(itemId)||!/^\d{1,18}$/.test(modelId))
   throw Error('Identificação da SKU inválida na recuperação.');
  return {nonce,sku,itemId,modelId};
 }
 async function recover(payload,siteTabId){
  const identity=recoveryIdentity(payload,siteTabId);
  const {nonce,sku,itemId,modelId}=identity;
  const saved=await readJob(identity)||await readJob();
  const savedResult=same(saved,identity)?extractFour(saved.rawText):null;
  if(savedResult){
   pendingRecovery={...identity,siteTabId,tabId:saved.tabId,owned:true};
   if(active&&same(active,identity))active.suppressOutcome=true;
   return {ok:true,rawText:savedResult.raw,...identity};
  }
  // Prioridade absoluta à aba que esta extensão abriu; nunca consultar todas
  // as conversas pessoais sem uma solicitação explícita do usuário.
  const owned=(await chrome.storage.session.get(TAB_KEY))[TAB_KEY];
  let tab=Number.isInteger(owned)?await chrome.tabs.get(owned).catch(()=>null):null;
  let isOwned=!!(tab&&allowed(tab.url)&&(!saved||same(saved,identity)));
  if(!isOwned)tab=null;
  if(!isOwned){
   const tabs=await chrome.tabs.query({url:['https://chatgpt.com/*']});
   const matches=tabs.filter(t=>allowed(t.url)&&seoTab(t)&&(!saved||t.id!==saved.tabId||same(saved,identity)));
   if(matches.length!==1)throw Error(matches.length?'Há várias conversas SEO abertas. Feche as duplicadas ou tente novamente.':'Nenhuma aba "Títulos SEO" aberta foi encontrada. Deixe o resultado do ChatGPT aberto e tente novamente.');
   tab=matches[0];isOwned=true; // Recuperação explícita de uma única conversa SEO
  }
  // Recuperar primeiro o retorno que esta Ponte já capturou, se pertence
  // EXATAMENTE à SKU e à aba atual; assim independe de mudanças no HTML do chat.
  const cached=(await chrome.storage.session.get(CACHE_KEY))[CACHE_KEY];
  const cacheValid=cached&&cached.sku===sku&&cached.itemId===itemId&&cached.modelId===modelId&&
   cached.tabId===tab.id&&(!cached.chatUrl||cached.chatUrl===tab.url)&&
   Date.now()-Number(cached.at||0)<4*60*60*1000;
  let extracted=cacheValid?extractFour(cached.rawText):null;
  let diagnostics=null;
  if(!extracted){
   for(let i=0;i<7;i++){
    const result=await operate(tab.id,'result');
    diagnostics=result.diagnostics||null;
    if(result.generating)throw Error('O ChatGPT ainda está concluindo a pesquisa. A importação automática continuará aguardando.');
    extracted=extractFour(result.raw);
    if(extracted)break;
    if(i<6)await delay(700);
   }
  }
  if(!extracted){
   // Uma sessão antiga pode apontar para uma aba SEO anterior vazia.
   // Verificar somente outras abas claramente intituladas SEO do usuário.
   const others=(await chrome.tabs.query({url:['https://chatgpt.com/*']}))
    .filter(t=>t.id!==tab.id&&allowed(t.url)&&seoTab(t)&&(!saved||t.id!==saved.tabId||same(saved,identity)));
   for(const candidate of others.slice(0,6)){
    const result=await operate(candidate.id,'result').catch(()=>null);
    const found=!result?.generating&&extractFour(result?.raw);
    if(found){tab=candidate;isOwned=true;extracted=found;diagnostics=result.diagnostics;break;}
   }
  }
  if(!extracted)throw Error('A Ponte não identificou 4 títulos completos na resposta. '+
   'Capturados: '+(diagnostics?.chars||0)+' caracteres; '+(diagnostics?.titleFields||0)+
   ' campos title. Use Importar resposta copiada na tela SEO para resgatar a conversa sem refazer a pesquisa.');
  await chrome.storage.session.set({[CACHE_KEY]:{sku,itemId,modelId,tabId:tab.id,
   chatUrl:tab.url||'',rawText:extracted.raw,at:Date.now()}});
  pendingRecovery={nonce,sku,itemId,modelId,siteTabId,tabId:tab.id,owned:isOwned};
  if(active&&same(active,identity))active.suppressOutcome=true;
  return {ok:true,rawText:extracted.raw,nonce,sku,itemId,modelId};
 }
 async function acknowledgeRecovery(payload,tabId){
  const r=pendingRecovery;
  if(!r||r.siteTabId!==tabId||r.nonce!==String(payload?.nonce||'')||
    r.sku!==String(payload?.sku||'')||r.itemId!==String(payload?.itemId||'')||
    r.modelId!==String(payload?.modelId||''))return {ok:false};
  pendingRecovery=null;
  if(payload.ok===true&&r.owned){
   const saved=await readJob();
   if(saved&&same(saved,r))await durable().remove(JOB_KEY);
   await durable().remove(jobKey(r));
   await chrome.tabs.remove(r.tabId).catch(()=>{});
   await chrome.storage.session.remove(TAB_KEY).catch(()=>{});
   await chrome.storage.session.remove(CACHE_KEY).catch(()=>{});
  }
  return {ok:true};
 }
 function start(payload,tabId){
  const request=validate(payload);
  if(active){
   const same=active.sku===request.sku&&active.itemId===request.itemId&&
    active.modelId===request.modelId&&active.siteTabId===tabId;
   if(!same)throw Error('Há outra pesquisa de títulos em andamento. A pesquisa atual foi preservada.');
   // A second click or a re-opened SEO step attaches to the original request.
   // Only the reply nonce changes; the existing prompt is not resent.
   active.nonce=request.nonce;
   if(Number.isInteger(active.tabId))void chrome.tabs.update(active.tabId,{active:true}).catch(()=>{});
   return {ok:true,nonce:request.nonce,reused:true};
  }
  active={...request,delivered:null,siteTabId:tabId};
  // Nenhuma segunda geração automática para o mesmo nonce: site recebe ACK imediato.
  void execute(request,tabId);
  return {ok:true,nonce:request.nonce};
 }
 async function acknowledge(payload,tabId){
  if(!active){
   const job=payload?await readJob(payload):null;
   if(job&&job.siteTabId===tabId&&job.nonce===String(payload?.nonce||'')&&same(job,payload)&&payload.ok===true){
    await closeDelivered(job);return {ok:true};
   }
  }
  if(!active||active.siteTabId!==tabId||active.nonce!==String(payload?.nonce||'')||
     active.sku!==String(payload?.sku||'')||active.itemId!==String(payload?.itemId||'')||
     active.modelId!==String(payload?.modelId||''))return {ok:false,error:'Pesquisa SEO não corresponde ao anúncio ativo.'};
  active.delivered={ok:payload.ok===true,error:String(payload.error||'').slice(0,250)};
  return {ok:true};
 }
 root.RASeoAutomation={start,validate,acknowledge,recover,acknowledgeRecovery,resume,extractFour,dom};
})(globalThis);
