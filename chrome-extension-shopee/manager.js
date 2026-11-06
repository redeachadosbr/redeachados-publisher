// Recebe comandos exclusivamente do Manager e comunica com a extensão.
(()=>{'use strict';
 const ORIGIN='https://redeachados-shopee.onrender.com';
 if(location.origin!==ORIGIN)return;
 if(globalThis.__RA_CURVE_BRIDGE_111__)return;
 globalThis.__RA_CURVE_BRIDGE_111__=true;
 const nonceOk=s=>/^[a-f0-9-]{30,50}$/i.test(String(s||''));
 const publish=payload=>window.postMessage(payload,ORIGIN);
 window.addEventListener('message',event=>{
  if(event.source!==window||event.origin!==ORIGIN)return;
  const m=event.data||{};
  if(!nonceOk(m.nonce))return;
  if(m.kind==='RA_CURVE_CHROME_PROBE'){
   try{
    publish({kind:'RA_CURVE_CHROME_READY',nonce:m.nonce,
     version:chrome.runtime.getManifest().version});
   }catch{
    publish({kind:'RA_CURVE_CHROME_DIAGNOSTIC',nonce:m.nonce,
     error:'A extensão perdeu o contexto. Atualize a extensão e recarregue a guia.'});
   }
  }else if(m.kind==='RA_CURVE_CHROME_CLOSE'||m.kind==='RA_CURVE_CHROME_CANCEL'){
   chrome.runtime.sendMessage({
    kind:m.kind==='RA_CURVE_CHROME_CANCEL'?'RA_CURVE_BROWSER_CANCEL':'RA_CURVE_BROWSER_CLOSE',
    nonce:m.nonce
   },()=>{void chrome.runtime.lastError;});
  }else if(m.kind==='RA_CURVE_CHROME_START'){
   const jobs=Array.isArray(m.jobs)?m.jobs:[];
   if(!jobs.length||jobs.length>10||jobs.some(x=>!x||String(x.query||'').length<3||
    String(x.query||'').length>70))return;
   chrome.runtime.sendMessage({kind:'RA_CURVE_BROWSER_BATCH',nonce:m.nonce,
    jobs:jobs.map(x=>({query:String(x.query)}))},response=>{
    const error=chrome.runtime.lastError?.message;
    if(error||!response?.ok)publish({kind:'RA_CURVE_CHROME_ERROR',nonce:m.nonce,
     error:error||response?.error||'Extensão indisponível.'});
   });
  }
 });
 chrome.runtime.onMessage.addListener((msg,_sender,respond)=>{
  if(!msg||!nonceOk(msg.nonce)||!/^RA_CURVE_CHROME_(RESULT|PROGRESS|DONE|ERROR|STEP)$/.test(msg.kind||''))return;
  publish({kind:msg.kind,nonce:msg.nonce,query:msg.query||'',
   position:msg.position||0,total:msg.total||0,offers:msg.offers||[],
   error:msg.error||'',stats:msg.stats||{},
   stage:String(msg.stage||'').slice(0,40),
   detail:String(msg.detail||'').slice(0,240),
   cancelled:Boolean(msg.cancelled)});
  respond({ok:true});
 });
})();