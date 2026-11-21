/* Shared policies and DOM operations. DOM entry point is self-contained for executeScript. */
(function(root) {
  'use strict';
  const VERSION = '0.12.15';
  const skuKey = value => String(value ?? '').trim().toUpperCase();
  function allowedChatUrl(value) {
    try {
      const u = new URL(value);
      return u.origin === 'https://chatgpt.com' && (/^\/$/.test(u.pathname) || /^\/c\/[a-zA-Z0-9-]+\/?$/.test(u.pathname)) &&
        ![...u.searchParams.values()].some(v => /^(work|codex|agent)$/i.test(v));
    } catch (_) { return false; }
  }
  function dimensions(product) {
    const d = product?.productDimensions;
    if (!d || d.verified !== true || d.kind !== 'product' || !String(d.source || '').trim()) return null;
    const value = raw => {
      if (raw === null || raw === undefined || String(raw).trim() === '') return null;
      const result = Number(String(raw).replace(',','.'));
      return Number.isFinite(result) && result > 0 ? result : null;
    };
    const axes = ['widthCm','heightCm','lengthCm','diameterCm'];
    if (axes.some(axis => Object.prototype.hasOwnProperty.call(d,axis)
        && d[axis] !== undefined && d[axis] !== null && String(d[axis]).trim() !== '' && value(d[axis]) === null)) return null;
    const [width,height,length,diameter] = axes.map(axis => value(d[axis]));
    // Diâmetro e altura são dois eixos verdadeiros de objetos cilíndricos.
    // Nunca rebatizar diâmetro como largura ou inventar comprimento para completar três eixos.
    if ([width,height,length,diameter].filter(v=>v !== null).length < 2) return null;
    const source = String(d.source).trim();
    // Preserve o contexto legado de SKUs anteriores com comprimento, largura e altura.
    if (width !== null && height !== null && length !== null && diameter === null)
      return {width,height,length,source,text:`largura ${width} cm × altura ${height} cm × comprimento ${length} cm`};
    const fmt = n => String(n).replace('.',',');
    const text = [
      length !== null ? `comprimento ${fmt(length)} cm` : '',
      height !== null ? `altura ${fmt(height)} cm` : '',
      width !== null ? `largura ${fmt(width)} cm` : '',
      diameter !== null ? `diâmetro ${fmt(diameter)} cm` : ''
    ].filter(Boolean).join(' × ');
    return {width,height,length,diameter,source,text,partial:true,missingAxes:[
      ...(width === null ? ['largura'] : []),...(height === null ? ['altura'] : []),...(length === null ? ['comprimento'] : [])
    ]};
  }
  function decision(raw, nonce) {
    const s=String(raw||'').trim(), marker=`RA_VALIDACAO_${nonce}=`;
    if (s===marker+'APROVADA') return {approved:true,reason:'Aprovação visual automática.'};
    const reason=s.startsWith(marker+'REFAZER|')?s.slice((marker+'REFAZER|').length).trim():'';
    if(reason && !/[\r\n]/.test(s) && !reason.includes(marker)) return {approved:false,rejected:true,reason};
    return {approved:false,rejected:false,reason:'Resposta inconclusiva, incompleta ou contraditória.'};
  }
  async function hash(blob) {
    return Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',await blob.arrayBuffer())),b=>b.toString(16).padStart(2,'0')).join('');
  }
  function context(product, position) {
    return JSON.stringify({sku:skuKey(product?.sku),reference:String(product?.source?.imageUrl||''),title:product?.title||'',brand:product?.brand||'',dimensions:Number(position)===2?dimensions(product):null,visualStyle:Number(position)===7?'flatlay_topdown_real_v01301':Number(position)===8?'mockup_premium_sem_embalagem_ficticia_v01301':null});
  }
  function sameVisualContext(saved, current) {
    // Ajustar SEO não altera a identidade física. Toda outra evidência continua
    // obrigatória, inclusive referência, marca, medidas e estilo da posição.
    try {
      const a = JSON.parse(saved), b = JSON.parse(current);
      if (!a || !b || !a.sku || a.sku !== b.sku) return false;
      const canonical = value => Array.isArray(value) ? value.map(canonical) :
        value && typeof value === 'object' ? Object.fromEntries(Object.keys(value).sort().map(key => [key,canonical(value[key])])) : value;
      delete a.title; delete b.title;
      return JSON.stringify(canonical(a)) === JSON.stringify(canonical(b));
    } catch (_) { return false; }
  }
  function approved(record) {
    return Boolean(record?.blob && record.validated===true && record.autoValidated===true && record.autoValidationVersion===VERSION &&
      record.autoValidationHash && record.autoValidationContext && record.autoValidationReferenceHash && record.autoValidationChat && record.validationNonce);
  }
  function analyzeSkus(value) {
    const unique=[],duplicates=[],seen=new Set();
    for (const raw of String(value||'').split(/[\s,;|]+/).filter(Boolean)) {
      const key=skuKey(raw);
      if(seen.has(key)) {if(!duplicates.includes(key))duplicates.push(key);} else {seen.add(key);unique.push(key);}
    }
    return {unique,duplicates};
  }
  // No private APIs. Only controls and rendered conversation messages are inspected.
  async function dom(operation, payload={}) {
    const visible = el => Boolean(el?.isConnected && el.getBoundingClientRect().width>1 && el.getBoundingClientRect().height>1 && getComputedStyle(el).display!=='none' && getComputedStyle(el).visibility!=='hidden');
    const url=new URL(location.href);
    const normal=url.origin==='https://chatgpt.com' && (/^\/$/.test(url.pathname)||/^\/c\/[a-zA-Z0-9-]+\/?$/.test(url.pathname)) && ![...url.searchParams.values()].some(v=>/^(work|codex|agent)$/i.test(v));
    const work=document.querySelector('[data-testid="work-composer"],[data-testid="codex-composer"],[data-workspace-type="work"],[data-surface="work"],[data-mode="work"][aria-pressed="true"]');
    if(!normal || visible(work)) throw new Error('WORK_BLOCKED: somente o chat normal do ChatGPT é permitido. Abra sua conta Plus na aba dedicada.');
    const turn=n=>n?.closest('[data-testid^="conversation-turn-"],article')||n;
    const role=n=>n?.getAttribute?.('data-message-author-role')||n?.getAttribute?.('data-turn')||'';
    const messageId=n=>n?.getAttribute?.('data-message-id')||n?.querySelector?.('[data-message-id]')?.getAttribute('data-message-id')||'';
    const turnId=n=>turn(n)?.getAttribute?.('data-testid')||turn(n)?.id||'';
    let messageCache;
    const messages=()=>{
      if(messageCache)return messageCache;
      const found=[...document.querySelectorAll('[data-message-author-role]')];
      for(const n of document.querySelectorAll('[data-testid^="conversation-turn-"],article'))
        if(['user','assistant'].includes(role(n))&&!found.some(x=>turn(x)===n))found.push(n);
      // Papel repetido no article e no corpo não é uma mensagem nova.
      const unique=[];
      for(const n of found){
        const i=unique.findIndex(x=>role(x)===role(n)&&
          (turn(x)===turn(n)||(messageId(x)&&messageId(x)===messageId(n))));
        if(i<0)unique.push(n);else if(messageId(n))unique[i]=n;
      }
      unique.sort((a,b)=>a.compareDocumentPosition?.(b)&4?-1:a.compareDocumentPosition?.(b)&2?1:0);
      return messageCache=unique;
    };
    const userFor=token=>messages().find(n=>token && role(n)==='user' && (n.textContent||'').includes(token));
    const composer=()=>[...document.querySelectorAll('#prompt-textarea,textarea[data-testid*="prompt"],form [contenteditable="true"]')].find(visible);
    const stop=()=>[...document.querySelectorAll('[data-testid="stop-button"],button[aria-label*="Stop generating" i],button[aria-label*="Parar de gerar" i],[data-is-streaming="true"]')].some(visible);
    const area=()=>{const c=composer();return c?.closest('form,[data-testid="composer"],[data-testid="composer-root"],[data-testid="composer-wrapper"]')||c?.parentElement;};
    const textOf=c=>typeof HTMLTextAreaElement!=='undefined'&&c instanceof HTMLTextAreaElement?c.value:(c?.innerText||c?.textContent||'');
    const normalizeDraft=value=>String(value||'')
      .normalize('NFKC')
      .replace(/[​-‍⁠﻿]/g,'')
      .replace(/ /g,' ')
      .replace(/\s+/g,' ')
      .trim();
    const draftMatches=(actual,wanted,token='')=>{
      const a=normalizeDraft(actual), w=normalizeDraft(wanted), tk=String(token||'').trim();
      if(!a||!w)return false;
      if(a===w)return true;
      // O ChatGPT pode recriar o contenteditable, linkificar URLs e mudar quebras de linha.
      // O token é único por solicitação; se ele continua no composer e o início do prompt
      // coincide, tratamos como o MESMO rascunho em vez de bloquear o botão Enviar.
      if(tk && a.includes(tk) && w.includes(tk)){
        const prefix=w.slice(0,Math.min(120,w.length));
        const shortPrefix=w.slice(0,Math.min(60,w.length));
        const lengthRatio=Math.min(a.length,w.length)/Math.max(a.length,w.length);
        return a.includes(prefix) || a.includes(shortPrefix) || lengthRatio>=0.72;
      }
      return false;
    };
    const send=()=>{
      const c=composer();if(!c)return null;
      const cr=c.getBoundingClientRect();
      const isCandidate=b=>{
        if(!visible(b)||b.disabled||b.getAttribute('aria-disabled')==='true')return false;
        if(b.closest('[role="dialog"],[data-state="closed"],header,nav,aside'))return false;
        const name=`${b.getAttribute('aria-label')||''} ${b.getAttribute('data-testid')||''} ${b.textContent||''}`.toLowerCase();
        return !/(stop|parar|cancel|voice|audio|microfone|microphone|attach|anex|plus|adicionar|share|compartilh|configur)/i.test(name);
      };
      const nearComposer=b=>{
        const br=b.getBoundingClientRect();
        // Não clicar em "Compartilhar" ou qualquer controle fora da barra de envio.
        return br.left>=cr.left-160 && br.right<=cr.right+360 &&
          br.top>=cr.top-170 && br.bottom<=cr.bottom+225;
      };
      const selectors=[
        'button[data-testid="send-button"]',
        'button[data-testid="composer-submit-button"]',
        'button[data-testid="composer-send-button"]',
        'button[data-testid="composer-submit-button"]',
        'button[data-testid="composer-submit"]',
        'button[aria-label="Enviar"]',
        'button[aria-label="Send"]',
        'button[id="composer-submit-button"]',
        'button[aria-label="Send prompt"]',
        'button[aria-label="Enviar mensagem"]',
        'button[aria-label="Enviar prompt"]',
        'button[aria-label="Send message"]',
        'button[aria-label^="Enviar" i]',
        'button[aria-label^="Send" i]',
        'form button[type="submit"]'
      ];
      const explicit=[...document.querySelectorAll(selectors.join(','))].filter(b=>isCandidate(b)&&nearComposer(b));
      if(explicit.length)return explicit.sort((a,b)=>b.getBoundingClientRect().right-a.getBoundingClientRect().right)[0];
      const scopes=[];let node=c;
      for(let depth=0;depth<9&&node;depth++,node=node.parentElement){
        const rect=node.getBoundingClientRect();
        if(rect.height>550)break;
        scopes.push(node);
      }
      for(const scope of scopes){
        const buttons=[...scope.querySelectorAll('button')].filter(b=>isCandidate(b)&&nearComposer(b)&&b.querySelector('svg'));
        // Sem um botão compatível, NÃO selecionar outro aleatório pelo alinhamento.
        const right=buttons.filter(b=>b.getBoundingClientRect().left>=cr.right-130);
        if(right.length===1)return right[0];
      }
      return null;
    };
    const blockOtherDraft=()=>{const text=textOf(composer()).trim();if(text && !draftMatches(text,payload.prompt,payload.token))throw new Error('DRAFT_PRESENT: há outro texto no campo do ChatGPT. Revise esse rascunho antes de continuar.');};
    const attachmentEvidence=()=>{
      const scope=area(); if(!scope)return {ready:false,count:0};
      const names=(payload.files||[]).map(f=>f.name);
      const text=[scope.innerText||'',...[...scope.querySelectorAll('[title],[aria-label],img')].map(n=>`${n.getAttribute('title')||''} ${n.getAttribute('aria-label')||''} ${n.getAttribute('alt')||''}`)].join(' ');
      const attachmentNodes=[...scope.querySelectorAll('img,[data-testid*="attachment" i],[data-testid*="file-thumbnail" i],[data-testid*="file-preview" i]')].filter(visible);
      const count=attachmentNodes.filter(n=>{
        if(n.tagName!=='IMG')return true;
        return n.complete && (n.naturalWidth>=24 || n.naturalHeight>=24);
      }).length;
      const named=names.length>0 && names.every(n=>text.includes(n));
      const pending=[...scope.querySelectorAll('[role="progressbar"],[data-state="uploading"],[aria-busy="true"]')].some(visible);
      const active=globalThis.__redeAchadosStudioAttachments;
      // O composer pode ser recriado pelo React após anexar a imagem. Não vincular
      // a evidência ao objeto DOM antigo, senão o upload fica eternamente "pendente".
      const tracked=Boolean(payload.token && active?.token===payload.token && active.names===JSON.stringify(names));
      // Após atualização da extensão o estado da página pode continuar com o
      // NOSSO rascunho e anexo, mas o objeto JS isolado ter sido recriado.
      // Só retomar se o token desta solicitação estiver no rascunho, o texto
      // corresponder ao prompt inteiro e houver EXATAMENTE os anexos esperados.
      const ownDraft=Boolean(payload.token && payload.prompt &&
        textOf(composer()).includes(String(payload.token)) &&
        draftMatches(textOf(composer()),payload.prompt,payload.token) &&
        count===names.length && names.length>0);
      const owned=tracked || ownDraft;
      if(ownDraft&&!tracked)globalThis.__redeAchadosStudioAttachments={token:payload.token,names:JSON.stringify(names),composer:composer()};
      return {ready:owned&&(named || count>=names.length)&&names.length>0&&!pending,count,named,pending,tracked:owned};
    };
    // Consulta leve: identifica a conversa pela marca exclusiva, sem capturar conteúdo do chat.
    if(operation==='identify') return {url:location.href,hasToken:Boolean(payload.token&&userFor(payload.token)),
      userCount:messages().filter(el=>role(el)==='user').length};
    if(operation==='guard') return {url:location.href,ready:Boolean(composer()),generating:stop()};
    if(operation==='canReuse'){
      const users=messages().filter(n=>role(n)==='user');
      const last=users[users.length-1];
      return {reusable:Boolean(!textOf(composer()).trim()&&((payload.token&&last&&(last.textContent||'').includes(payload.token))||(!payload.token&&!users.length&&url.pathname==='/')))};
    }
    // Identificar o turno também durante a geração. Streaming sozinho nunca
    // comprova o envio nem autoriza capturar uma prévia.
    if(operation==='attachments') return attachmentEvidence();
    if(operation==='draft') {const c=composer();return {ready:Boolean(c),text:textOf(c).trim(),generating:stop(),url:location.href};}
    if(operation==='attach') {
      if(stop())throw new Error('CHAT_BUSY: o ChatGPT ainda está respondendo.');
      blockOtherDraft();
      const evidence=attachmentEvidence();
      if(evidence.ready || evidence.tracked)return {attached:true};
      const scope=area(),c=composer();if(!c)throw new Error('COMPOSER_MISSING: campo de mensagem não encontrado.');
      if(scope && [...scope.querySelectorAll('img,[data-testid^="attachment-"],[data-testid^="file-thumbnail"]')].some(visible))throw new Error('ATTACHMENT_PRESENT: há anexos de outra operação no campo do chat. Remova esses anexos para retomar.');
      const dt=new DataTransfer();
      for(const f of payload.files||[]) {
        const response=await fetch(f.dataUrl);const blob=await response.blob();
        dt.items.add(new File([blob],f.name,{type:f.type||blob.type}));
      }
      const inputs=[...document.querySelectorAll('input[type="file"]')].filter(i=>!i.disabled && (!i.accept || /image|png|jpg|jpeg/i.test(i.accept)));
      globalThis.__redeAchadosStudioAttachments={token:payload.token,names:JSON.stringify((payload.files||[]).map(f=>f.name)),composer:c};
      if(inputs.length) {const input=inputs[0];input.files=dt.files;input.dispatchEvent(new Event('change',{bubbles:true}));}
      else {c.focus();c.dispatchEvent(new ClipboardEvent('paste',{clipboardData:dt,bubbles:true,cancelable:true}));}
      return {attached:true};
    }
    if(operation==='fill') {
      if(userFor(payload.token))return {submitted:true};
      if(stop())throw new Error('CHAT_BUSY: o ChatGPT ainda está respondendo.');
      blockOtherDraft();
      const c=composer();if(!c)throw new Error('COMPOSER_MISSING: campo não encontrado.');
      c.focus();
      if(c instanceof HTMLTextAreaElement){const set=Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype,'value').set;set.call(c,payload.prompt);}
      else {
        const range=document.createRange();range.selectNodeContents(c);const selection=getSelection();selection.removeAllRanges();selection.addRange(range);
        document.execCommand('insertText',false,payload.prompt);
        if(textOf(c).trim()!==payload.prompt.trim()) {c.textContent=payload.prompt;}
      }
      c.dispatchEvent(new InputEvent('input',{bubbles:true,inputType:'insertText',data:payload.prompt}));
      return {filled:draftMatches(textOf(c),payload.prompt,payload.token)};
    }
    if(operation==='nativeSend') {
      if(userFor(payload.token))return {submitted:true};
      if(stop())throw new Error('CHAT_BUSY: o ChatGPT ainda está respondendo.');
      const c=composer();
      if(!c)throw new Error('COMPOSER_MISSING: campo de mensagem não encontrado.');
      if(!draftMatches(textOf(c),payload.prompt,payload.token))throw new Error('DRAFT_CHANGED: o composer não corresponde à solicitação atual.');
      if(payload.files?.length && !attachmentEvidence().ready)throw new Error('ATTACHMENTS_CHANGED: os anexos ainda não estão prontos para o envio.');
      const b=send();
      if(!b)return {clicked:false,reason:'send_button_not_found'};
      const r=b.getBoundingClientRect();
      const x=r.left+r.width/2, y=r.top+r.height/2;
      const response=await chrome.runtime.sendMessage({type:'RA_NATIVE_CLICK',x,y,focus:false}).catch(error=>({ok:false,reason:String(error?.message||error||'native_click_failed')}));
      await new Promise(resolve=>setTimeout(resolve,350));
      return {clicked:Boolean(response?.ok),submitted:Boolean(userFor(payload.token)),method:'background_native_blue_button',x,y,reason:response?.reason||''};
    }

    if(operation==='send') {
      if(userFor(payload.token))return {submitted:true};
      if(stop())throw new Error('CHAT_BUSY: o ChatGPT ainda está respondendo.');
      if(!draftMatches(textOf(composer()),payload.prompt,payload.token))throw new Error('DRAFT_CHANGED: o composer não corresponde à solicitação atual.');
      if(payload.files?.length && !attachmentEvidence().ready)throw new Error('ATTACHMENTS_CHANGED: os anexos mudaram ou ainda não terminaram de carregar. O prompt não foi enviado.');
      const b=send(),c=composer(),form=c?.closest('form');
      // Recibo privado do documento: não acrescenta token ao prompt do usuário.
      // O ID do pedido continua no mundo isolado da extensão durante a navegação SPA.
      const previous=globalThis.__redeAchadosImageSubmission;
      if(previous?.token!==payload.token)globalThis.__redeAchadosImageSubmission={
        token:payload.token,prompt:payload.prompt,chatUrl:url.pathname==='/'?'':location.href,
        baselineUserIds:messages().filter(n=>role(n)==='user').map(messageId).filter(Boolean)
      };
      // Caso o React ignore um clique sintético no botão, a retomada usa
      // o submit do formulário da MESMA conversa e do MESMO rascunho.
      // Nunca reenviar se já apareceu um turno de usuário: o runner confere
      // isso ANTES de chamar este método novamente.
      if(payload.forceSubmit && form && typeof form.requestSubmit==='function'){
       try{form.requestSubmit(b?.type==='submit'?b:undefined);
        return {clicked:true,method:'requestSubmit_recovery'};}catch(error){
        // Algumas versões do ChatGPT não expõem um form de envio nativo.
       }
      }
      if(b){
       b.focus();b.click();
       return {clicked:true,method:'dom_button',buttonTestId:b.getAttribute('data-testid')||''};
      }
      if(form && typeof form.requestSubmit==='function'){
       form.requestSubmit();
       return {clicked:true,method:'requestSubmit'};
      }
      return {ready:false,reason:'send_button_not_found'};
    }
    // Diagnóstico antes do envio: IDs/fonte das imagens anteriores à solicitação atual.
    // Os dados não saem da aba do navegador, servem somente para evitar reutilização.
    const assetKey=src=>{
      try{
        const u=new URL(src,location.href);
        if(u.protocol==='blob:'||u.protocol==='data:')return src;
        // Apenas parâmetros de transporte conhecidos. id/file_id e outros
        // identificadores do conteúdo permanecem intactos.
        for(const k of [...u.searchParams.keys()])
          if(/^(sig|se|sp|sv|sr|st|ske|skt|sks|skv|skoid|sktid|rsct|rscd|rscc|expires|w|h|width|height|quality)$/i.test(k)||/^x-amz-/i.test(k))u.searchParams.delete(k);
        if(u.searchParams.has('id')||u.searchParams.has('file_id'))u.searchParams.delete('ts');
        u.hash='';u.searchParams.sort();return u.toString();
      }catch{return String(src||'');}
    };
    const excluded=img=>img.closest('nav,aside,header,form,[data-testid="composer"],[data-testid="composer-root"],[data-message-author-role="user"],[data-turn="user"],[class*="avatar" i]');
    const conversationImages=()=>{
      // O ChatGPT pode renderizar mídias em um portal FORA de <main>.
      // Buscar no documento, mantendo a exclusão estrita de avatares, anexo do
      // usuário, editor e menus. Nunca buscar imagens de outras abas.
      const main=document.querySelector('main')||document;
      return [...new Set([...main.querySelectorAll('img'),...document.querySelectorAll('img')])].filter(img=>{
        if(!img.complete||excluded(img))return false;
        const rect=img.getBoundingClientRect();
        return Math.max(Number(img.naturalWidth||0),rect.width)>=320&&
          Math.max(Number(img.naturalHeight||0),rect.height)>=320;
      });
    };
    if(operation==='snapshot')return {
      url:location.href,
      imageSources:[...new Set([...(document.querySelector('main')||document).querySelectorAll('img')]
        .filter(img=>!img.closest('nav,aside,header,form,[data-testid="composer"],[data-testid="composer-root"]'))
        .map(img=>img.currentSrc||img.src).filter(Boolean))],
      userCount:messages().filter(el=>role(el)==='user').length,
      generating:stop()
    };
    if(operation==='response'||operation==='capture'||operation==='candidates'||operation==='highlight'||operation==='screenshotPrepare'||operation==='screenshotRestore'){
      const nodes=messages(),users=nodes.filter(n=>role(n)==='user');
      const previousCount=Number(payload.baselineUserCount);
      const pageReceipt=globalThis.__redeAchadosImageSubmission;
      const manualApproved=payload.explicitImageApproved===true&&Boolean(payload.selectedImageSrc)&&payload.selectedImageChatUrl===location.href;
      const conversationBound=Boolean(payload.chatUrl&&payload.chatUrl===location.href);
      if(payload.chatUrl&&payload.chatUrl!==location.href||!manualApproved&&pageReceipt&&payload.sent&&
         (pageReceipt.token!==payload.token||pageReceipt.chatUrl&&pageReceipt.chatUrl!==location.href))return {
        submitted:false,generating:stop(),imageCount:0,key:'',url:location.href,wrongConversation:true
      };
      const exactText=value=>normalizeDraft(value).replace(/[\p{P}\p{S}\s]/gu,'').toLocaleLowerCase('pt-BR');
      const wanted=exactText(payload.prompt);
      const promptMatches=n=>wanted.length>25&&exactText(n.innerText||n.textContent||'').includes(wanted);
      const pinned=conversationBound&&payload.userMessageId?users.filter(n=>messageId(n)===payload.userMessageId):
        conversationBound&&payload.userTurnId?users.filter(n=>turnId(n)===payload.userTurnId):[];
      const matches=users.filter(n=>promptMatches(n)&&
        !(pageReceipt&&pageReceipt.token===payload.token&&pageReceipt.baselineUserIds?.includes(messageId(n))));
      const newCount=Number.isInteger(previousCount)&&users.length===previousCount+1;
      const boundMatch=conversationBound&&payload.sent===true&&payload.dedicatedChat===true&&users.length===1;
      const matched=matches.length===1&&(newCount||boundMatch)?matches[0]:null;
      const hasPin=conversationBound&&Boolean(payload.userMessageId||payload.userTurnId);
      const user=hasPin?(pinned.length===1?pinned[0]:null):userFor(payload.token)||matched,userTurn=user?turn(user):null;
      if(user&&pageReceipt&&pageReceipt.token===payload.token){
        pageReceipt.userMessageId=messageId(user);
        if(!pageReceipt.chatUrl&&/^\/c\//.test(url.pathname))pageReceipt.chatUrl=location.href;
      }
      if((operation==='response'||operation==='capture')&&stop()){
        const draftPending=draftMatches(textOf(composer()),payload.prompt,payload.token);
        return {submitted:Boolean(user)&&!draftPending,requestMatched:Boolean(user),generating:true,
          userCount:users.length,userMessageId:messageId(user),userTurnId:user?turnId(user):'',
          draftPending,imageCount:0,key:'',url:location.href};
      }
      const allTurns=[...document.querySelectorAll('[data-testid^="conversation-turn-"],article')];
      const candidateRoots=[];
      if(user){
        const i=nodes.indexOf(user);
        for(let j=i+1;j<nodes.length;j++){
          if(role(nodes[j])==='user')break;
          const root=turn(nodes[j]);
          if(root&&!candidateRoots.includes(root))candidateRoots.push(root);
        }
        if(userTurn){
          const start=allTurns.indexOf(userTurn);
          for(let j=start+1;start>=0&&j<allTurns.length;j++){
            const root=allTurns[j];
            if(root===userTurn||userTurn.contains?.(root))continue;
            if(role(root)==='user'||root.querySelector?.('[data-message-author-role="user"],[data-turn="user"]'))break;
            // A geração pode estar diretamente no article, sem corpo assistant.
            if(!candidateRoots.includes(root))candidateRoots.push(root);
          }
        }
      }
      // Fallback seguro: após clique persistido, a UI pode ocultar/truncar o token.
      // Para evitar atribuir foto de outra SKU, exigir imagem realmente nova em
      // relação à fotografia do chat registrada ANTES do envio, ou única resposta
      // em uma conversa dedicada sem imagens prévias (recuperação legado slot 01).
      const baseline=Array.isArray(payload.baselineImages)?new Set(payload.baselineImages.map(assetKey)):null;
      const sent=payload.sent===true;
      const userCount=nodes.filter(n=>role(n)==='user').length;
      const noOtherMessage=Number.isInteger(payload.baselineUserCount)?
        userCount<=payload.baselineUserCount+1 : userCount<=1;
      const firstClean=Boolean(payload.firstSlot&&!baseline&&userCount<=1);
      // O ChatGPT pode ocultar/virtualizar a mensagem do usuário depois da geração.
      // O recibo da PONTE fica somente na aba onde o próprio botão Enviar foi usado.
      // Aceitar imagem sem o turno visível APENAS no chat dedicado vazio, com
      // recibo local do MESMO pedido, nenhuma foto de base e até um usuário visível.
      const receiptSameRequest=Boolean(pageReceipt?.token===payload.token &&
        pageReceipt?.prompt===payload.prompt &&
        (!pageReceipt?.chatUrl || pageReceipt.chatUrl===location.href) &&
        Array.isArray(pageReceipt?.baselineUserIds) && pageReceipt.baselineUserIds.length===0);
      const pinnedSameChat=Boolean(conversationBound && payload.dedicatedChat===true &&
        (payload.userMessageId||payload.userTurnId));
      // A UI do ChatGPT às vezes virtualiza, resume ou move o artigo da resposta
      // para fora do turno assistant. Neste cenário há prova MAIS FORTE que o DOM:
      // a Ponte criou um chat vazio, registrou baseline sem imagens, enviou
      // exatamente um pedido nesta conversa, persiste o ID da aba e o nonce/SKU.
      // Não aceitar o fallback em chats pessoais nem se há outro turno do usuário.
      const pinConflict=Boolean(conversationBound && (payload.userMessageId||payload.userTurnId) &&
        pinned.length===0 && users.length>0 && matches.length!==1);
      const ownedCleanChat=Boolean(sent && conversationBound && !pinConflict &&
        payload.dedicatedChat===true && payload.runnerOwnedChat===true &&
        Number(payload.baselineUserCount)===0 && Array.isArray(payload.baselineImages) &&
        payload.baselineImages.length<=8 && userCount<=1 &&
        /^\/c\//.test(url.pathname));
      const hiddenUserRecovery=Boolean(sent && payload.dedicatedChat===true &&
        Number(payload.baselineUserCount)===0 && Array.isArray(payload.baselineImages) &&
        payload.baselineImages.length===0 && userCount<=1 && !user && !pinConflict &&
        (receiptSameRequest||pinnedSameChat||payload.runnerOwnedChat===true) && /^\/c\//.test(url.pathname));
      const inReply=user?candidateRoots.flatMap(root=>[...(root.querySelectorAll?.('img')||[])]):[];
      // Fallback só é permitido se o turno EXATO desta solicitação aparece na
      // conversa. Foto "nova" no DOM sem mensagem enviada pode ser mídia
      // renderizada da etapa anterior e jamais comprova nova geração.
      const ownNewTurn=Boolean(user&&(newCount||boundMatch||pinned.length===1));
      const useFallback=inReply.length===0 && sent &&
        (ownNewTurn||hiddenUserRecovery||ownedCleanChat) &&
        noOtherMessage && baseline!==null;
      const explicit=manualApproved;
      // Lista visual de recuperação é uma ação solicitada pelo vendedor. Exibir as
      // imagens não autoriza upload: somente a escolha explícita do usuário permite.
      const listAll=(operation==='candidates'||operation==='highlight') && payload.manualRecovery===true;
      const kitExcluded=payload.kitMode===true&&Array.isArray(payload.excludedImageSources)?
        new Set(payload.excludedImageSources.map(assetKey)):null;
      const sources=explicit ? conversationImages() : listAll ? (inReply.length ? inReply : conversationImages()) : inReply.length ? inReply : useFallback ? conversationImages() : [];
      const strictFallback=!explicit&&!listAll&&useFallback;
      const pool=[];
      for(let index=0;index<sources.length;index++){
        const img=sources[index];
        if(!img?.complete||excluded(img))continue;
        const rect=img.getBoundingClientRect();
        const width=Math.max(Number(img.naturalWidth||0),rect.width);
        const height=Math.max(Number(img.naturalHeight||0),rect.height);
        const ratio=width/Math.max(1,height);
        if(width<300||height<300||ratio<0.45||ratio>2.2)continue;
        // Recuperação da foto comercial: não oferecer miniaturas antigas de catálogo
        // (500x500) ao lado de imagens geradas pelo ChatGPT, incluindo versões redimensionadas a 620 px.
        // O envio automático continua preso à solicitação e ao nonce atuais.
        // As miniaturas de catálogo de 500px NUNCA são arquivos finais.
        // Um arquivo do gerador pode ser exibido reduzido, mas o img nativo
        // permanece com resolução suficiente para a publicação comercial.
        if(Number(img.naturalWidth||0)<512||Number(img.naturalHeight||0)<512)continue;
        const src=img.currentSrc||img.src||img.getAttribute('src')||'';
        if(!src)continue;
        const identity=assetKey(src);
        if(kitExcluded?.has(identity))continue;
        if(!explicit&&!listAll&&baseline?.has(identity))continue;
        // Quando o ChatGPT desenha a imagem num portal, ela não é descendente
        // do artigo assistant, mas a prova de chat dedicado permanece válida.
        if(userTurn&&!(userTurn.compareDocumentPosition(img)&4)&&!ownedCleanChat)continue;
        if(strictFallback){
          if(!baseline&&!firstClean)continue;
        }
        const label=`${img.alt||''} ${img.getAttribute('aria-label')||''}`.toLowerCase();
        let score=(Math.max(0,rect.width)*Math.max(0,rect.height))+(width*height)+(index*10000);
        if(img.closest('figure,picture,[data-testid*="image" i],[data-testid*="media" i]'))score+=1e7;
        if(/generated|gerad|image|imagem/.test(label))score+=1e7;
        if(rect.width>=300&&rect.height>=300)score+=1e7;
        pool.push({img,src,identity,width,height,score});
      }
      const unique=new Map();
      for(const p of pool){const old=unique.get(p.identity);if(!old||p.score>old.score)unique.set(p.identity,p);}
      const images=[...unique.values()].sort((a,b)=>b.score-a.score);
      // Quando existem duas ou mais fotos reais, a seleção precisa ser explícita.
      // Nunca confiar somente na pontuação visual para escolher um arquivo da SKU.
      const selectedSrc=String(payload.selectedImageSrc||'');
      const selectionMatches=selectedSrc?images.filter(x=>x.identity===assetKey(selectedSrc)):[];
      const selected=selectedSrc&&selectionMatches.length===1?selectionMatches[0]:null;
      const chosen=selected||(!selectedSrc&&images.length===1?images[0]:null);
      const count=selected?1:images.length;
      // No fallback de recuperação automática, a única foto precisa ser nova,
      // estar no DOM final e corresponder ao recibo da extensão nesta conversa.
      const recovered=(strictFallback&&sent&&(ownNewTurn||hiddenUserRecovery||ownedCleanChat)&&Boolean(chosen)&&count===1) ||
        (explicit&&Boolean(selected)&&count===1);
      if(operation==='highlight'){
        const target=images.find(x=>x.identity===assetKey(payload.highlightSrc||''));
        if(!target)return {highlighted:false,reason:'A foto mudou ou não está mais visível no ChatGPT.'};
        try{
          target.img.scrollIntoView?.({behavior:'smooth',block:'center'});
          const old=target.img.style?.outline||'';
          const oldOffset=target.img.style?.outlineOffset||'';
          if(target.img.style){target.img.style.outline='5px solid #19a974';target.img.style.outlineOffset='4px';}
          setTimeout(()=>{
            if(target.img.style){target.img.style.outline=old;target.img.style.outlineOffset=oldOffset;}
          },8000);
        }catch{}
        return {highlighted:true,url:location.href};
      }
      if(operation==='candidates'){
        const results=[];
        for(const candidate of images.slice(0,12)){
          let preview='';
          try{
            const canvas=document.createElement('canvas');
            const context=canvas.getContext('2d');
            if(context){
              canvas.width=220;canvas.height=220;
              context.fillStyle='#fff';context.fillRect(0,0,220,220);
              context.drawImage(candidate.img,0,0,220,220);
              preview=canvas.toDataURL('image/jpeg',0.64);
              if(preview.length>180000)preview='';
            }
          }catch(_){ /* A foto pode estar protegida por CORS; identificação manual na aba original continua possível. */ }
          results.push({key:candidate.src,width:Math.round(candidate.width),height:Math.round(candidate.height),
           label:String(candidate.img.alt||candidate.img.getAttribute('aria-label')||'Imagem candidata').slice(0,100),preview});
        }
        return {candidates:results,url:location.href,generating:stop(),selectedImageSrc:selectedSrc};
      }
      // Captura de segurança: o Chrome pode impedir fetch do arquivo original.
      // Somente a imagem ÚNICA do chat comprovado poderá ser recortada do
      // viewport; ocultamos temporariamente os botões sobre a fotografia.
      if(operation==='screenshotRestore'){
        for(const row of globalThis.__redeAchadosHiddenCaptureControls||[]){
          row.element.style.visibility=row.visibility;
          row.element.style.opacity=row.opacity;
        }
        globalThis.__redeAchadosHiddenCaptureControls=[];
        return {restored:true};
      }
      if(operation==='screenshotPrepare'){
        if(!chosen||count!==1||!(recovered||Boolean(user))||stop()||
           draftMatches(textOf(composer()),payload.prompt,payload.token))
         return {ready:false,reason:'A imagem não está exclusivamente vinculada a este pedido.'};
        const img=chosen.img;
        img.scrollIntoView?.({block:'center',inline:'center',behavior:'instant'});
        const rect=img.getBoundingClientRect();
        if(rect.width<400||rect.height<400||rect.top<0||rect.left<0||
           rect.right>window.innerWidth||rect.bottom>window.innerHeight)
         return {ready:false,reason:'A imagem não está completamente visível.'};
        const blocked=[...((img.parentElement?.parentElement||img.parentElement)?.querySelectorAll?.('button,[role="button"]')||[])];
        globalThis.__redeAchadosHiddenCaptureControls=[];
        for(const element of blocked){
          if(element.contains?.(img))continue;
          globalThis.__redeAchadosHiddenCaptureControls.push({element,visibility:element.style.visibility||'',opacity:element.style.opacity||''});
          element.style.visibility='hidden';element.style.opacity='0';
        }
        return {ready:true,key:chosen.identity,url:location.href,
          viewportWidth:window.innerWidth,viewportHeight:window.innerHeight,
          box:{x:rect.left,y:rect.top,width:rect.width,height:rect.height}};
      }
      if(operation==='capture'&&chosen){
        const bounds=chosen.img.getBoundingClientRect();
        if(bounds.width<50||bounds.height<50||bounds.top<0||bounds.bottom>window.innerHeight||bounds.left<0||bounds.right>window.innerWidth)
          chosen.img.scrollIntoView?.({block:'center',inline:'center',behavior:'instant'});
      }
      const bounds=chosen?.img.getBoundingClientRect();
      const captureBox=bounds&&[bounds.left,bounds.top,bounds.width,bounds.height].every(Number.isFinite)&&bounds.width>=50&&bounds.height>=50&&bounds.left>=0&&bounds.top>=0&&bounds.right<=window.innerWidth+1&&bounds.bottom<=window.innerHeight+1?
        {x:bounds.left,y:bounds.top,width:bounds.width,height:bounds.height}:null;
      const waitingDraft=Boolean(payload.prompt&&
        draftMatches(textOf(composer()),payload.prompt,payload.token));
      const pendingResponse=candidateRoots.some(root=>[...(root.querySelectorAll?.('[aria-busy="true"],[data-is-streaming="true"],[role="progressbar"]')||[])].some(visible));
      const info={submitted:!waitingDraft&&(Boolean(user)||recovered),
        recovered:!waitingDraft&&recovered,generating:stop()||pendingResponse,draftPending:waitingDraft,userCount,
        userMessageId:messageId(user),userTurnId:user?turnId(user):'',
        requestMatched:Boolean(user)||Boolean((hiddenUserRecovery||ownedCleanChat)&&recovered),
        matchedBy:pinned.length===1?'message_id':recovered&&ownedCleanChat?'owned_clean_chat':
          user?'prompt':hiddenUserRecovery&&recovered?'runner_receipt':'',
        imageCount:count,availableImageCount:images.length,key:chosen?.identity||'',source:chosen?.src||'',url:location.href,captureBox,
        needsSelection:images.length>1&&!selected,invalidSelection:Boolean(selectedSrc&&!selected)};
      if(operation==='response')return info;
      if(!chosen||info.generating||!info.submitted)return info;
      if(count!==1)return {...info,captureError:'Selecione e confirme a imagem correta na aba da extensão.'};
      const {img,src}=chosen;
      let dataUrl='',captureError='',captureTimer,reader;
      const controller=new AbortController();
      try{
        // Abrange cabeçalhos, corpo E FileReader. Abort sozinho não libera
        // necessariamente um fetch/reader suspenso, por isso há também um race.
        dataUrl=await Promise.race([
          (async()=>{
            const r=await fetch(src,{credentials:'include',signal:controller.signal});
            if(!r.ok)throw Error('HTTP '+r.status);
            const blob=await r.blob();
            if(controller.signal.aborted)throw Error('Leitura interrompida.');
            if(!/^image\/(?:png|jpeg|webp)/i.test(blob.type)||blob.size<1024||blob.size>12*1024*1024)throw Error('A resposta da imagem possui tipo ou tamanho inválido.');
            return await new Promise((resolve,reject)=>{reader=new FileReader();reader.onload=()=>resolve(reader.result);reader.onerror=reject;reader.onabort=()=>reject(Error('Leitura interrompida.'));reader.readAsDataURL(blob);});
          })(),
          new Promise((_,reject)=>{captureTimer=setTimeout(()=>{
            controller.abort();if(reader?.readyState===1)reader.abort();
            reject(Error('Tempo de leitura da imagem excedido (12 s).'));
          },12000);})
        ]);
      }catch(error){
        try{
          const canvas=document.createElement('canvas');
          canvas.width=img.naturalWidth||chosen.width;canvas.height=img.naturalHeight||chosen.height;
          canvas.getContext('2d').drawImage(img,0,0);
          dataUrl=canvas.toDataURL('image/png');
        }catch(e){captureError=`fetch: ${String(error.message||error)} | canvas: ${String(e.message||e)}`;}
      }finally{clearTimeout(captureTimer);}
      if(dataUrl){
        // A foto ou a resposta podem mudar durante o download. Nunca devolver
        // bytes antigos com um recibo novo nem importar durante geração.
        const latest=await dom('response',payload);
        if(!latest.submitted||latest.generating||latest.imageCount!==1||latest.key!==info.key||latest.url!==info.url)
          return {...latest,dataUrl:'',captureError:'A imagem mudou durante a leitura; verificando novamente.'};
      }
      return {...info,dataUrl,captureError,width:img.naturalWidth||chosen.width,
        height:img.naturalHeight||chosen.height,source:src};
    }
    throw new Error('Operação de imagem desconhecida.');
  }
  const api={VERSION,skuKey,allowedChatUrl,dimensions,decision,hash,context,sameVisualContext,approved,analyzeSkus,dom};
  root.ImageSafety=api;
  if(typeof module!=='undefined'&&module.exports)module.exports=api;
})(globalThis);
