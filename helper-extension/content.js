(() => {
  'use strict';
  const KEY='ra_ml_verify_product_auto_v3';
  const OLD_KEYS=['ra_ml_verify_product_auto_v2'];
  const MAX_MS=6*60*1000;
  const MAX_ACTIONS=7;
  const MIN_ACTION_GAP=1200;
  const JUSTIFICATION='Produto diferente do catálogo sugerido.';

  const norm=v=>String(v??'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/\s+/g,' ').trim();
  const visible=el=>{if(!el||!el.isConnected)return false;const s=getComputedStyle(el);if(s.display==='none'||s.visibility==='hidden'||Number(s.opacity)===0)return false;const r=el.getBoundingClientRect();return r.width>0&&r.height>0;};
  const wait=ms=>new Promise(r=>setTimeout(r,ms));
  const byText=(tests,{exact=false,root=document}={})=>{const arr=Array.isArray(tests)?tests:[tests];for(const el of [...root.querySelectorAll('button,[role="button"],a,label,div[tabindex],span[tabindex]')].filter(visible)){const t=norm(el.innerText||el.textContent||'');if(!t)continue;if(arr.some(q=>exact?t===norm(q):t.includes(norm(q))))return el;}return null;};
  const click=el=>{if(!el||!visible(el))return false;el.scrollIntoView({block:'center',inline:'center'});el.dispatchEvent(new MouseEvent('mousedown',{bubbles:true,cancelable:true,view:window}));el.dispatchEvent(new MouseEvent('mouseup',{bubbles:true,cancelable:true,view:window}));el.click();return true;};
  const nativeSet=(el,value)=>{const proto=el instanceof HTMLTextAreaElement?HTMLTextAreaElement.prototype:HTMLInputElement.prototype;const d=Object.getOwnPropertyDescriptor(proto,'value');if(d?.set)d.set.call(el,value);else el.value=value;el.dispatchEvent(new Event('input',{bubbles:true}));el.dispatchEvent(new Event('change',{bubbles:true}));};
  const storage={
    get:()=>new Promise(resolve=>chrome.storage.local.get([KEY],o=>resolve(o?.[KEY]||null))),
    set:st=>new Promise(resolve=>chrome.storage.local.set({[KEY]:st},resolve)),
    clear:()=>new Promise(resolve=>chrome.storage.local.remove([KEY],resolve)),
    clearOld:()=>new Promise(resolve=>chrome.storage.local.remove(OLD_KEYS,resolve))
  };
  const message=payload=>new Promise(resolve=>{try{chrome.runtime.sendMessage(payload,r=>resolve(r||{ok:false,granted:false}));}catch(_){resolve({ok:false,granted:false});}});

  let banner=null;
  function show(title,detail='',tone='run'){
    if(!banner){banner=document.createElement('div');banner.id='ra-ml-helper-banner';banner.style.cssText='position:fixed;right:18px;top:18px;z-index:2147483647;width:min(420px,calc(100vw - 36px));background:#102a56;color:#fff;border:2px solid #ffe600;border-radius:16px;box-shadow:0 12px 38px rgba(0,0,0,.28);padding:14px 16px;font:14px/1.35 Arial,sans-serif;';document.documentElement.appendChild(banner);}
    banner.style.background=tone==='ok'?'#0f6b45':tone==='error'?'#8e2f2f':'#102a56';
    banner.innerHTML=`<div style="font-weight:800;font-size:15px;margin-bottom:5px">Rede Achados BR · Helper V1.2</div><div style="font-weight:800;margin-bottom:4px">${String(title).replace(/[<>]/g,'')}</div><div style="opacity:.92">${String(detail).replace(/[<>]/g,'')}</div><button id="ra-helper-cancel" style="margin-top:10px;border:1px solid rgba(255,255,255,.55);background:transparent;color:#fff;border-radius:8px;padding:5px 9px;cursor:pointer">PARAR automação</button>`;
    banner.querySelector('#ra-helper-cancel').onclick=async()=>{const st=await storage.get();await storage.clear();if(st?.runId)await message({type:'RA_RELEASE',runId:st.runId});show('Automação parada','Nenhum outro clique automático será feito.','error');};
  }
  const markerFromLocation=()=>{if(!location.hash.includes('ra-auto-verify-product=1'))return null;const h=new URLSearchParams(location.hash.slice(1));return {runId:h.get('ra-run')||'',itemId:h.get('ra-item')||'',sku:h.get('ra-sku')||'',userProductId:h.get('ra-up')||'',title:h.get('ra-title')||''};};
  async function startFromHash(){
    await storage.clearOld();
    const m=markerFromLocation();if(!m)return;
    const runId=m.runId||`${m.itemId||m.sku||'run'}-${Date.now()}`;
    const prev=await storage.get();
    if(!prev||prev.runId!==runId||Date.now()>Number(prev.expiresAt||0)){
      const st={...m,runId,stage:'locate',startedAt:Date.now(),expiresAt:Date.now()+MAX_MS,lastActionAt:0,searchAttempts:0,actionCount:0,lastUrl:location.href};
      await storage.set(st);await message({type:'RA_BEGIN',runId,itemId:m.itemId||''});
    }
    show('Automação iniciada',`Proteção de aba única ativa. Vou trabalhar somente com ${m.sku||m.itemId||'esta SKU'}.`);
  }
  function bodyHas(...terms){const t=norm(document.body?.innerText||'');return terms.some(x=>t.includes(norm(x)));}
  function pageMatchesTarget(st){
    const href=String(location.href||'');
    if(st.itemId&&href.includes(st.itemId))return true;
    if(st.userProductId&&href.includes(st.userProductId))return true;
    const body=norm(document.body?.innerText||'');
    if(st.sku&&body.includes(norm(st.sku)))return true;
    const title=norm(st.title||'');if(title&&title.length>18&&body.includes(title.slice(0,Math.min(45,title.length))))return true;
    return false;
  }
  async function owned(st){const r=await message({type:'RA_CLAIM',runId:st.runId,itemId:st.itemId||''});return Boolean(r?.granted);}
  async function stop(st,title,detail){await storage.set({...st,stage:'stopped',stoppedAt:Date.now()});await message({type:'RA_RELEASE',runId:st.runId});show(title,detail,'error');}
  async function advance(st,stage,msg,extra={},countAction=false){
    const actionCount=Number(st.actionCount||0)+(countAction?1:0);
    const next={...st,...extra,stage,lastActionAt:Date.now(),actionCount,lastUrl:location.href};
    await storage.set(next);show('Executando',msg);
    return next;
  }
  const addMarker=(href,st)=>{try{const u=new URL(href,location.href);u.hash=new URLSearchParams({'ra-auto-verify-product':'1','ra-run':st.runId||'','ra-item':st.itemId||'','ra-sku':st.sku||'','ra-up':st.userProductId||'','ra-title':st.title||''}).toString();return u.toString();}catch(_){return href;}};
  function exactRow(st){
    const needles=[st.itemId,st.userProductId,st.sku].filter(Boolean).map(norm);
    const blocks=[...document.querySelectorAll('tr,li,article,[data-testid],[class*="item"],[class*="card"],[class*="row"]')].filter(visible);
    for(const b of blocks){const t=norm(b.innerText||b.textContent||'');if(needles.some(n=>n&&t.includes(n)))return b;}
    for(const a of [...document.querySelectorAll('a[href]')].filter(visible)){const href=String(a.href||'');if([st.itemId,st.userProductId].filter(Boolean).some(id=>href.includes(id)))return a.closest('tr,li,article,[data-testid],[class*="item"],[class*="card"],[class*="row"]')||a;}
    return null;
  }
  async function locateAndOpen(st){
    if(st.stage!=='locate')return false;
    if(byText(['Verificar produto'],{exact:true})||bodyHas('verifique o produto de catalogo que sugerimos')){await advance(st,'item-page','Anúncio correto localizado. Preparando “Verificar produto”.');return false;}
    const row=exactRow(st);
    if(row){
      const links=[...row.querySelectorAll('a[href]')].filter(visible);
      const target=links.find(a=>/\/modificar(?:\/|$|\?)/i.test(a.href))||links.find(a=>[st.itemId,st.userProductId].filter(Boolean).some(id=>String(a.href).includes(id)));
      if(target){
        const next=await advance(st,'opening-item',`Encontrei ${st.sku||st.itemId}. Abrindo UMA vez, na mesma aba.`,{},true);
        location.assign(addMarker(target.href,next));return true;
      }
      const edit=byText(['Alterar','Editar','Modificar'],{exact:false,root:row});
      if(edit){const next=await advance(st,'opening-item',`Encontrei ${st.sku||st.itemId}. Abrindo UMA vez pela Central.`,{},true);click(edit);return true;}
    }
    const inputs=[...document.querySelectorAll('input')].filter(visible);
    const search=inputs.find(i=>/buscar|pesquis|sku|produto|anuncio|anúncio/i.test(`${i.placeholder||''} ${i.getAttribute('aria-label')||''}`));
    const query=st.itemId||st.sku||st.title;
    if(search&&query&&Number(st.searchAttempts||0)<1){
      nativeSet(search,query);search.focus();
      const next=await advance(st,'locate',`Pesquisando ${query} uma única vez na Central.`,{searchAttempts:1},true);
      search.dispatchEvent(new KeyboardEvent('keydown',{key:'Enter',code:'Enter',keyCode:13,which:13,bubbles:true}));
      search.dispatchEvent(new KeyboardEvent('keyup',{key:'Enter',code:'Enter',keyCode:13,which:13,bubbles:true}));
      return true;
    }
    return false;
  }

  let busy=false;
  async function tick(){
    if(busy)return;let st=await storage.get();if(!st||st.stage==='stopped'||st.stage==='sent')return;
    if(Date.now()>Number(st.expiresAt||0)){await stop(st,'Tempo esgotado','Parei a automação. Nenhum outro clique será feito.');return;}
    if(Number(st.actionCount||0)>=MAX_ACTIONS){await stop(st,'Limite de segurança atingido',`Foram executadas ${st.actionCount} ações. Parei antes de qualquer repetição.`);return;}
    if(!(await owned(st)))return;
    if(Date.now()-Number(st.lastActionAt||0)<MIN_ACTION_GAP)return;
    busy=true;
    try{
      if(bodyHas('nao foi possivel encontrar esta pagina','não foi possível encontrar esta página')){await stop(st,'Página inválida','O Mercado Livre recusou esta rota. Parei sem abrir outra aba.');return;}

      if(st.stage==='locate'){
        const navigated=await locateAndOpen(st);if(navigated)return;st=await storage.get();
      }

      if(st.stage==='opening-item'){
        if(!pageMatchesTarget(st))return;
        if(byText(['Verificar produto'],{exact:true})||bodyHas('verifique o produto de catalogo que sugerimos'))st=await advance(st,'item-page','SKU correta confirmada.');
        else return;
      }

      if(st.stage==='item-page'){
        if(!pageMatchesTarget(st))return;
        const verify=byText(['Verificar produto'],{exact:true})||byText(['Verificar produto']);
        if(verify){st=await advance(st,'verify-clicked','Abrindo “Verificar produto” uma única vez.',{},true);click(verify);return;}
      }

      if(st.stage==='verify-clicked'){
        const no=byText(['Não encontro meu produto','Nao encontro meu produto','Não encontrei meu produto','Nao encontrei meu produto'],{exact:false});
        if(no){st=await advance(st,'not-found-clicked','Selecionando “Não encontro meu produto” uma única vez.',{},true);click(no);return;}
      }

      if(st.stage==='not-found-clicked'&&bodyHas('nao encontro meu produto','não encontro meu produto','produto nao esta','produto não esta','produto diferente')){
        const confirm=byText(['Confirmar'],{exact:true})||byText(['Continuar'],{exact:true});
        if(confirm){st=await advance(st,'confirmed','Confirmando produto diferente uma única vez.',{},true);click(confirm);return;}
      }

      if(['confirmed','filled'].includes(st.stage)){
        const ta=[...document.querySelectorAll('textarea')].find(visible);
        if(ta&&bodyHas('digite as principais diferencas','principais diferencas')){
          if(norm(ta.value)!==norm(JUSTIFICATION)){nativeSet(ta,JUSTIFICATION);st=await advance(st,'filled','Diferença preenchida.',{},true);await wait(350);}
          const send=byText(['Enviar'],{exact:true});
          if(send&&!send.disabled){st=await advance(st,'sending','Enviando uma única vez.',{},true);click(send);await wait(700);await storage.set({...st,stage:'sent',sentAt:Date.now()});await message({type:'RA_RELEASE',runId:st.runId});show('Enviado','Automação encerrada. O Publisher fará apenas a validação do resultado.','ok');return;}
        }
      }

      if(Date.now()-Number(st.lastActionAt||0)>30000)show('Aguardando tela esperada',`Não encontrei o próximo passo com segurança para ${st.sku||st.itemId}. Nenhum clique será repetido.`,'error');
    }catch(e){await stop(st,'Automação interrompida',String(e?.message||e));}
    finally{busy=false;}
  }

  startFromHash().then(()=>tick());
  const obs=new MutationObserver(()=>tick());obs.observe(document.documentElement,{childList:true,subtree:true,attributes:true,attributeFilter:['disabled','aria-disabled','class','href']});
  setInterval(tick,1500);tick();
})();
