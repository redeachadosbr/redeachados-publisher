'use strict';
/* Descrições Shopee: leitor próprio de resposta, mantendo a entrada DOM testada e isolando o fluxo de imagens/SEO. */
(function(root){
 const CHAT='https://chatgpt.com/';
 let active=null;
 const delay=ms=>new Promise(r=>setTimeout(r,ms));
 const allowed=url=>{try{const u=new URL(url);return u.origin===CHAT.slice(0,-1)&&
  (u.pathname==='/'||/^\/c\/[a-z0-9-]+\/?$/i.test(u.pathname)||
   /^\/g\/g-[^/]+(?:\/c\/[a-z0-9-]+)?\/?$/i.test(u.pathname));}catch{return false;}};
 function validate(p){
  const nonce=String(p?.nonce||''),sku=String(p?.sku||''),itemId=String(p?.itemId||''),modelId=String(p?.modelId||''),prompt=String(p?.prompt||'');
  if(!/^[a-f0-9-]{30,50}$/i.test(nonce)||!sku||sku.length>120||!/^[0-9]{1,18}$/.test(itemId)||
    !/^[0-9]{1,18}$/.test(modelId)||prompt.length<450||prompt.length>16000)
   throw Error('Descrição: solicitação incompleta ou SKU inválida.');
  return {nonce,sku,itemId,modelId,prompt};
 }
 // Leitor exclusivo de descrição. Executado dentro da aba ChatGPT, NÃO usa o
 // ranqueamento de quatro títulos SEO nem retorna texto do prompt do usuário.
 function descriptionDom(action){
  if(action!=='result')return {};
  const assistantSelector='[data-message-author-role="assistant"], [data-testid="conversation-turn-assistant"], article[data-role="assistant"]';
  const userSelector='[data-message-author-role="user"], [data-testid="conversation-turn-user"]';
  const getText=node=>String(node?.innerText||node?.textContent||'').trim();
  const insideUser=node=>!!node?.closest?.(userSelector);
  const leaf=nodes=>nodes.filter(node=>!node.parentElement?.closest?.(assistantSelector+', '+userSelector));
  const isAssistant=node=>node?.matches?.(assistantSelector)===true||node?.getAttribute?.('data-message-author-role')==='assistant';
  const isUser=node=>node?.matches?.(userSelector)===true||node?.getAttribute?.('data-message-author-role')==='user';
  const asText=node=>{
   if(!node)return '';
   const candidates=[];
   const offer=n=>{
    for(const v of [getText(n),String(n?.textContent||'').trim()])
     if(v.length>=30&&!candidates.includes(v))candidates.push(v);
   };
   offer(node);
   // Code/markdown pode estar espalhado em vários componentes da mesma resposta.
   const blocks=[...node.querySelectorAll?.('pre, pre code, .markdown, .prose, [data-testid="code-block"]')||[]];
   for(const b of blocks)offer(b);
   const roots=blocks.filter(b=>!blocks.some(parent=>parent!==b&&parent.contains?.(b)));
   if(roots.length>1)offer({innerText:roots.map(getText).join('\n')});
   const score=raw=>/['"“]description['"”]\s*:/iu.test(raw)?100:
    /benef[ií]cios/iu.test(raw)&&/por que comprar/iu.test(raw)&&/embalagem/iu.test(raw)?50:0;
   candidates.sort((a,b)=>score(b)-score(a)||b.length-a.length);
   return (candidates[0]||'').slice(-115000);
  };
  const assistants=leaf([...document.querySelectorAll(assistantSelector)]).filter(x=>!insideUser(x));
  const users=leaf([...document.querySelectorAll(userSelector)]);
  const combined=leaf([...document.querySelectorAll(userSelector+', '+assistantSelector)]);
  const pairs=[];
  let lastPrompt='';
  for(const node of combined){
   if(isUser(node)){lastPrompt=getText(node);continue;}
   if(!isAssistant(node)||insideUser(node))continue;
   const raw=asText(node);
   if(raw)pairs.push({raw,userRaw:lastPrompt});
  }
  // Compatibilidade com DOM parcial/mock: alguns layouts só expõem as duas listas.
  if(!pairs.length){
   for(let i=0;i<assistants.length;i++){
    const raw=asText(assistants[i]);
    if(raw)pairs.push({raw,userRaw:getText(users[Math.min(i,users.length-1)])});
   }
  }
  // Fallback estrito: não ler o body ou conteúdo do formulário do usuário.
  if(!pairs.length){
   const blocks=[...document.querySelectorAll('main .markdown, main .prose, main pre, main [data-testid="code-block"]')]
    .filter(node=>!insideUser(node)&&!node.closest?.('form, [contenteditable="true"]'));
   const tail=blocks.at(-1),raw=asText(tail);
   if(raw)pairs.push({raw,userRaw:getText(users.at(-1))});
  }
  const latest=pairs.at(-1)||{raw:'',userRaw:getText(users.at(-1))};
  return {raw:latest.raw,userRaw:latest.userRaw,
   // Recuperação revisa múltiplos pares dentro da mesma conversa. Não enviar
   // dados de outras abas ou prompts do formulário ao Manager.
   turns:pairs.slice(-40),
   generating:Boolean(document.querySelector('[data-testid="stop-button"], button[aria-label="Parar de gerar"], button[aria-label="Stop generating"]')),
   users:users.length,assistantCount:assistants.length||(pairs.length?1:0),
   diagnostics:{descriptionBlocks:pairs.length}};
 }
 const CACHE='ra_description_last_verified_v35';
 const OWNED='ra_description_owned_tab_v35';
 const PENDING='ra_description_pending_identity_v49';
 const CACHE_PREFIX='ra_description_verified_identity_v49_';
 const durable=()=>chrome.storage?.local||chrome.storage?.session;
 const identityKey=obj=>CACHE_PREFIX+encodeURIComponent(JSON.stringify(
  [obj.sku,obj.itemId,obj.modelId].map(String)));
 const same=(a,b)=>!!a&&!!b&&['sku','itemId','modelId'].every(k=>String(a[k])===String(b[k]));
 function promptMatches(raw,sku){
  const text=String(raw||'');
  if(!text||!sku)return false;
  const escaped=String(sku).replace(/[.*+?^${}()|[\]\\]/g,'\\$&');
  return new RegExp('(^|[^a-zA-Z0-9])'+escaped+'(?=$|[^a-zA-Z0-9])','i').test(text);
 }
 function pickFromTab(snapshot,identity,allowOwned=false){
  const turns=Array.isArray(snapshot?.turns)&&snapshot.turns.length?snapshot.turns:
   [{raw:snapshot?.raw||'',userRaw:snapshot?.userRaw||''}];
  // Pares em ordem cronológica: somente um resultado que veio DEPOIS de
  // pedido com SKU correta pode ser atribuído ao produto atual.
  for(let i=turns.length-1;i>=0;i--){
   const t=turns[i];
   const result=extractDescription(t.raw);
   if(!result)continue;
   if(promptMatches(t.userRaw,identity.sku))return result;
   // Se o trabalho foi aberto pela extensão para ESTA identidade, o marcador
   // é confiável somente antes de qualquer nova solicitação com outra SKU.
   if(allowOwned&&i===turns.length-1&&!String(t.userRaw||'').trim())
    return result;
  }
  return null;
 }
 let recovery=null;
 function extractDescription(input){
  const text=String(input||'').slice(-120000);let latest=null;
  // A resposta pode aparecer depois de um texto introdutório ou estar dividida
  // em blocos: localizar o último JSON contendo a descrição comercial REAL.
  for(let start=text.indexOf('{');start>=0;start=text.indexOf('{',start+1)){
   let depth=0,quoted=false,escaped=false;
   for(let i=start;i<text.length;i++){
    const c=text[i];if(escaped){escaped=false;continue;}
    if(quoted&&c.charCodeAt(0)===92){escaped=true;continue;}
    if(c==='"'){quoted=!quoted;continue;}
    if(quoted)continue;if(c==='{')depth++;
    if(c==='}'&&--depth===0){
     try{const obj=JSON.parse(text.slice(start,i+1));
      if(typeof obj?.description==='string'&&obj.description.length>=250&&
       obj.description.includes('📦')&&obj.description.includes('🛒'))
       latest={raw:JSON.stringify(obj),length:obj.description.length,mode:'json'};
     }catch{}
     break;
    }
   }
  }
  if(latest)return latest;
  // ChatGPT às vezes renderiza newlines literais no JSON, com aspas ou
  // quebras já convertidas: aproveitar o campo description seguido de factsUsed.
  const keys=[...text.matchAll(/["“]description["”]\s*:\s*"/gu)];
  for(const match of keys){
   const trailing=text.slice(match.index+match[0].length);
   const boundary=/["”]\s*,\s*["“](?:factsUsed|unverified)["”]\s*:/u.exec(trailing);
   if(!boundary||boundary.index<250)continue;
   const description=trailing.slice(0,boundary.index).replace(/\\"/g,'"');
   if(description.includes('📦')&&description.includes('🛒'))
    latest={raw:JSON.stringify({description,factsUsed:[],unverified:[]}),length:description.length,mode:'field'};
  }
  // Respostas antigas podem vir como texto completo, sem objeto JSON.
  // Não aceitar exemplos do prompt: o DOM acima devolve apenas o assistente.
  const plain=text.replace(/^`{3}(?:json)?\s*/i,'').replace(/\s*`{3}$/,'').trim();
  if(!latest&&!/["“]description["”]\s*:/iu.test(plain)&&plain.length>=250&&plain.length<=5000&&
     /(?:✅\s*)?benef[ií]cios/iu.test(plain)&&
     /(?:💡\s*)?por que comprar/iu.test(plain)&&
     /(?:⚙️?\s*)?caracter[ií]sticas/iu.test(plain)&&
     /(?:📦\s*)?(?:o que (?:vai|vem|acompanha)|conte[uú]do da embalagem)/iu.test(plain)&&
     /🛒/u.test(plain))return {raw:JSON.stringify({description:plain,factsUsed:[],unverified:[]}),length:plain.length,mode:'plain'};
  return latest;
 }
 async function sessionSave(key,value){
  try{await chrome.storage?.session?.set?.({[key]:value});}catch{}
 }
 async function sessionRead(key){
  try{return (await chrome.storage?.session?.get?.(key))?.[key]||null;}catch{return null;}
 }
 async function durableSave(key,value){try{await durable()?.set?.({[key]:value});}catch{}}
 async function durableRead(key){try{return (await durable()?.get?.(key))?.[key]||null;}catch{return null;}}
 async function operate(tabId,action,payload={}){
  for(let attempt=0;attempt<10;attempt++){
   const tab=await chrome.tabs.get(tabId).catch(()=>null);
   if(!tab)throw Error('A aba ChatGPT da descrição foi fechada.');
   if(!allowed(tab.url)){
    if(tab.status==='loading'||allowed(tab.pendingUrl)){await delay(550);continue;}
    throw Error('A aba mudou para fora do ChatGPT. Não é seguro continuar.');
   }
   try{
    const run=await chrome.scripting.executeScript({target:{tabId},func:action==='result'?descriptionDom:RASeoAutomation.dom,args:[action,payload]});
    return run?.[0]?.result||{};
   }catch(e){if(attempt===9)throw Error('Falha ao acessar o ChatGPT: '+String(e?.message||e));await delay(550);}
  }
  throw Error('A aba ChatGPT não respondeu.');
 }
 async function progress(siteTabId,request,status){
  await chrome.tabs.sendMessage(siteTabId,{kind:'RA_EXTENSION_DESC_PROGRESS',nonce:request.nonce,
   sku:request.sku,itemId:request.itemId,modelId:request.modelId,status}).catch(()=>{});
 }
 async function execute(request,siteTabId){
  let tabId=null,outcome=null;
  try{
   const tab=await chrome.tabs.create({url:CHAT,active:true});tabId=tab.id;
   if(active)active.chatTabId=tabId;
   await sessionSave(OWNED,{tabId,...request,siteTabId,createdAt:Date.now()});
   await durableSave(PENDING,{tabId,sku:request.sku,itemId:request.itemId,
    modelId:request.modelId,siteTabId,createdAt:Date.now()});
   let ready=false;
   for(let i=0;i<48;i++){
    if((await operate(tabId,'ready').catch(()=>({}))).ready){ready=true;break;}
    await delay(650);
   }
   if(!ready)throw Error('ChatGPT não abriu o campo de edição. Verifique seu login.');
   await progress(siteTabId,request,'ChatGPT aberto. Inserindo descrição com dados da WeDrop...');
   const before=await operate(tabId,'result');
   const filled=await operate(tabId,'fill',{prompt:request.prompt});
   if(!filled.filled)throw Error(filled.error||'Não foi possível preencher o pedido.');
   let enabled=false;
   for(let i=0;i<25;i++){
    const r=await operate(tabId,'sendReady');if(r.ready&&r.hasText){enabled=true;break;}
    await delay(350);
   }
   if(!enabled)throw Error('ChatGPT não habilitou Enviar após preencher o pedido.');
   const sent=await operate(tabId,'submit');
   if(!sent.sent)throw Error(sent.error||'Não foi possível enviar o pedido.');
   let confirmed=false;
   for(let i=0;i<22;i++){
    await delay(350);
    if((await operate(tabId,'confirmSent',{clicked:true,usersBefore:sent.usersBefore})).confirmed){confirmed=true;break;}
   }
   if(!confirmed)throw Error('ChatGPT não confirmou que recebeu o pedido.');
   await progress(siteTabId,request,'Descrição enviada. Aguardando parágrafos, benefícios, características, itens inclusos e CTA...');
   let stable=0,previous='',raw='';
   for(let i=0;i<280;i++){
    await delay(950);
    const r=await operate(tabId,'result');
    if(r.generating||r.raw===before.raw)continue;
    const found=extractDescription(r.raw);
    if(found){stable=found.raw===previous?stable+1:0;previous=found.raw;
     if(stable>=2){raw=found.raw;break;}}
   }
   if(!raw)throw Error('O ChatGPT não entregou um texto completo verificável. A aba ficará aberta para recuperação manual.');
   outcome={ok:true,rawText:raw};
   const record={tabId,sku:request.sku,itemId:request.itemId,
    modelId:request.modelId,rawText:raw,createdAt:Date.now()};
   await sessionSave(CACHE,record);
   await durableSave(identityKey(request),record);
  }catch(e){outcome={ok:false,error:String(e?.message||e).slice(0,380)};}
  finally{
   const receipt=await chrome.tabs.sendMessage(siteTabId,{kind:'RA_EXTENSION_DESC_RESULT',nonce:request.nonce,
    sku:request.sku,itemId:request.itemId,modelId:request.modelId,...outcome}).catch(()=>null);
   // ACK do site somente DEPOIS de salvar o rascunho no banco do Manager.
   if(outcome.ok&&receipt?.ok&&Number.isInteger(tabId)){
    for(let i=0;i<110&&!active?.delivered;i++)await delay(200);
    if(active?.delivered?.ok===true){
     await chrome.tabs.remove(tabId).catch(()=>{});
     await sessionSave(OWNED,null);
     await durableSave(PENDING,null);
    }
   }
   active=null;
  }
 }
 function start(payload,tabId){
  const req=validate(payload);
  if(active)throw Error('Já existe uma descrição sendo gerada. Aguarde a conclusão.');
  active={...req,siteTabId:tabId,delivered:null};
  void execute(req,tabId);
  return {ok:true,nonce:req.nonce};
 }
 function acknowledge(message,tabId){
  if(!active||active.siteTabId!==tabId||active.nonce!==String(message?.nonce||'')||
    active.sku!==String(message?.sku||'')||active.itemId!==String(message?.itemId||'')||
    active.modelId!==String(message?.modelId||''))return {ok:false};
  active.delivered={ok:message.ok===true};return {ok:true};
 }
 async function recover(payload,siteTabId){
  const sku=String(payload?.sku||''),itemId=String(payload?.itemId||''),modelId=String(payload?.modelId||''),nonce=String(payload?.nonce||'');
  if(!/^[a-f0-9-]{30,50}$/i.test(nonce)||!sku||!/^[0-9]{1,18}$/.test(itemId)||!/^[0-9]{1,18}$/.test(modelId))
   throw Error('Identidade da SKU não confirmada para recuperação.');
  const identity={sku,itemId,modelId};
  const cached=await sessionRead(CACHE),owned=await sessionRead(OWNED);
  const persistent=await durableRead(identityKey(identity));
  const pending=await durableRead(PENDING);
  let found=null,tabId=null,checked=0,matched=0;
  // A aba aberta tem prioridade para evitar recuperar uma versão antiga da
  // descrição depois de o vendedor solicitar um novo texto para a mesma SKU.
  const all=await chrome.tabs.query({});
  const tabs=all.filter(t=>allowed(t.url)||allowed(t.pendingUrl)).sort((a,b)=>
   (Number(b.id===pending?.tabId||b.id===owned?.tabId)-
    Number(a.id===pending?.tabId||a.id===owned?.tabId))||
   (Number(b.lastAccessed||0)-Number(a.lastAccessed||0)));
  for(const tab of tabs){
   checked++;
   const snapshot=await operate(tab.id,'result').catch(()=>null);
   if(!snapshot)continue;
   const bound=same(pending,identity)&&pending?.tabId===tab.id||
    same(owned,identity)&&owned?.tabId===tab.id;
   const candidate=pickFromTab(snapshot,identity,bound);
   if(!candidate)continue;
   matched++;found=candidate;tabId=tab.id;break;
  }
  // Quando a resposta deixa de estar visível (fechamento/navegação/reload),
  // manter um backup validado por SKU e variação por até sete dias.
  if(!found){
   for(const record of [persistent,cached]){
    if(same(record,identity)&&record?.rawText&&
      Date.now()-Number(record.createdAt||Date.now())<7*24*60*60*1000){
     const candidate=extractDescription(record.rawText);
     if(candidate){found=candidate;tabId=record.tabId;break;}
    }
   }
  }
  if(found){
   await durableSave(identityKey(identity),{...identity,tabId,rawText:found.raw,createdAt:Date.now()});
  }
  if(!found)throw Error('Não encontrei descrição identificada para SKU '+sku+' nas '+checked+' abas ChatGPT verificadas. Mantenha a conversa com a resposta completa aberta. Nenhum texto de outra SKU será importado.');
  recovery={nonce,sku,itemId,modelId,siteTabId,tabId};
  return {ok:true,nonce,sku,itemId,modelId,rawText:found.raw};
 }
 async function acknowledgeRecovery(message,siteTabId){
  if(!recovery||recovery.siteTabId!==siteTabId||recovery.nonce!==String(message?.nonce||'')||
     recovery.sku!==String(message?.sku||'')||recovery.itemId!==String(message?.itemId||'')||
     recovery.modelId!==String(message?.modelId||''))return {ok:false};
  const done=recovery;recovery=null;
  if(message?.ok===true&&Number.isInteger(done.tabId)){
   // Nunca fechar uma aba que a Ponte não criou: a conversa só é encerrada
   // automaticamente quando sua propriedade e identidade foram confirmadas.
   const owned=await sessionRead(OWNED);
   const pending=await durableRead(PENDING);
   if((same(owned,done)&&owned?.tabId===done.tabId)||
      (same(pending,done)&&pending?.tabId===done.tabId))
    await chrome.tabs.remove(done.tabId).catch(()=>{});
  }
  return {ok:true};
 }
 root.RADescriptionAutomation={start,acknowledge,recover,acknowledgeRecovery,validate,extractDescription,descriptionDom,pickFromTab,promptMatches};
})(globalThis);
