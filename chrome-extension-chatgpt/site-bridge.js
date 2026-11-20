'use strict';
// Ponte instalada apenas na origem do Shopee Manager. Não lê nem envia tokens Shopee.
if(!globalThis.__RA_SHOPEE_SITE_BRIDGE_1_0_56){
 globalThis.__RA_SHOPEE_SITE_BRIDGE_1_0_56=true;
const ORIGIN='https://redeachados-shopee.onrender.com';
const startsInProgress=new Map();
const recentStarts=new Map();
// A extensão só declara que está conectada quando o service worker responde.
// Evita o falso READY de content scripts com o contexto da extensão invalidado.
function announceReady(){
 try{
  chrome.runtime.sendMessage({kind:'RA_STATUS_REQUEST'},response=>{
   if(chrome.runtime.lastError||response?.ok!==true)return;
   window.postMessage({kind:'RA_EXTENSION_READY',version:chrome.runtime.getManifest().version,healthy:true,kitCapable:true},ORIGIN);
  });
 }catch{}
}
if(location.origin===ORIGIN){
 window.addEventListener('message',event=>{
  if(event.source!==window||event.origin!==ORIGIN||!event.data||typeof event.data!=='object')return;
  if(event.data.kind==='RA_EXTENSION_PROBE'){announceReady();return;}
  if(event.data.kind==='RA_SITE_KIT_TEXT_FETCH'&&event.data.payload){
   const payload=event.data.payload,nonce=String(payload.nonce||'');
   if(!/^[a-f0-9-]{30,50}$/i.test(nonce))return;
   chrome.runtime.sendMessage({kind:'RA_KIT_TEXT_FETCH',payload},response=>{
    const error=chrome.runtime.lastError?.message;
    window.postMessage({kind:'RA_EXTENSION_KIT_TEXT_RESULT',nonce,
     kitSku:payload.kitSku,
     ...(response||{ok:false,error:error||'A Ponte não conseguiu ler a resposta do ChatGPT.'})},ORIGIN);
   });
   return;
  }
  if(event.data.kind==='RA_SITE_DESC_START'&&event.data.payload){
   const nonce=String(event.data.payload.nonce||'');
   chrome.runtime.sendMessage({kind:'RA_DESC_START',payload:event.data.payload},response=>{
    const error=chrome.runtime.lastError?.message;
    window.postMessage({kind:'RA_EXTENSION_DESC_START_RESULT',nonce,
     ...(response||{ok:false,error:error||'Não foi possível iniciar a descrição ChatGPT.'})},ORIGIN);
   });
   return;
  }
  if(event.data.kind==='RA_SITE_DESC_RECOVER'&&event.data.payload){
   const payload=event.data.payload,nonce=String(payload.nonce||'');
   chrome.runtime.sendMessage({kind:'RA_DESC_RECOVER',payload},response=>{
    const error=chrome.runtime.lastError?.message;
    window.postMessage({kind:'RA_EXTENSION_DESC_RECOVER_RESULT',nonce,
     sku:payload.sku,itemId:payload.itemId,modelId:payload.modelId,
     ...(response||{ok:false,error:error||'Não foi possível recuperar a descrição.'})},ORIGIN);
   });return;
  }
  if(event.data.kind==='RA_SITE_DESC_RECOVER_ACK'){
   const ack=event.data;
   chrome.runtime.sendMessage({kind:'RA_DESC_RECOVER_ACK',nonce:ack.nonce,
    sku:ack.sku,itemId:ack.itemId,modelId:ack.modelId,ok:ack.ok===true},()=>{});
   return;
  }
  if(event.data.kind==='RA_SITE_DESC_ACK'){
   const ack=event.data;
   chrome.runtime.sendMessage({kind:'RA_DESC_DELIVERY_ACK',nonce:ack.nonce,
    sku:ack.sku,itemId:ack.itemId,modelId:ack.modelId,ok:ack.ok===true},()=>{});
   return;
  }
  if(event.data.kind==='RA_SITE_SEO_RESUME'&&event.data.payload){
   const payload=event.data.payload;
   try{chrome.runtime.sendMessage({kind:'RA_SEO_RESUME',payload},response=>{
    const error=chrome.runtime.lastError?.message;
    window.postMessage({kind:'RA_EXTENSION_SEO_RESUME_RESULT',nonce:payload.nonce,
     ...(response||{ok:false,error:error||'Não foi possível retomar os títulos.'})},ORIGIN);
   });}catch(error){window.postMessage({kind:'RA_EXTENSION_SEO_RESUME_RESULT',nonce:payload.nonce,ok:false,error:String(error.message||error)},ORIGIN);}
   return;
  }
  if(event.data.kind==='RA_SITE_SEO_RECOVER'&&event.data.payload){
   const payload=event.data.payload,nonce=String(payload.nonce||'');
   chrome.runtime.sendMessage({kind:'RA_SEO_RECOVER',payload},response=>{
    const error=chrome.runtime.lastError?.message;
    window.postMessage({kind:'RA_EXTENSION_SEO_RECOVER_RESULT',nonce,
     ...(response||{ok:false,error:error||'Não foi possível recuperar a aba SEO.'})},ORIGIN);
   });
   return;
  }
  if(event.data.kind==='RA_SITE_SEO_RECOVER_ACK'){
   const ack=event.data;
   chrome.runtime.sendMessage({kind:'RA_SEO_RECOVER_ACK',nonce:ack.nonce,
    sku:ack.sku,itemId:ack.itemId,modelId:ack.modelId,ok:ack.ok===true},()=>{});
   return;
  }
  if(event.data.kind==='RA_SITE_SEO_ACK'){
   const ack=event.data;
   chrome.runtime.sendMessage({kind:'RA_SEO_DELIVERY_ACK',nonce:ack.nonce,
    sku:ack.sku,itemId:ack.itemId,modelId:ack.modelId,ok:ack.ok===true,error:ack.error||''},()=>{});
   return;
  }
  // Pesquisa SEO separada do pipeline de imagens; sem abrir várias abas ou colar fotos.
  if(event.data.kind==='RA_SITE_SEO_START'&&event.data.payload){
   const nonce=String(event.data.payload.nonce||'');
   try{
    chrome.runtime.sendMessage({kind:'RA_SEO_START',payload:event.data.payload},response=>{
     const error=chrome.runtime.lastError?.message;
     window.postMessage({kind:'RA_EXTENSION_SEO_START_RESULT',nonce,
      ...(response||{ok:false,error:error||'Ponte ChatGPT não respondeu à pesquisa SEO.'})},ORIGIN);
    });
   }catch(error){
    window.postMessage({kind:'RA_EXTENSION_SEO_START_RESULT',nonce,ok:false,
     error:'Extensão SEO indisponível: '+String(error?.message||error).slice(0,180)},ORIGIN);
   }
  }
  if(event.data.kind==='RA_SITE_START'&&event.data.payload){
   // Resposta sempre entregue ao painel; sem espera indefinida de 3,5 segundos.
   const nonce=event.data.payload.nonce;
   if(startsInProgress.has(nonce))return;
   const recent=recentStarts.get(nonce);
   if(recent&&Date.now()-recent.at<60000){window.postMessage({kind:'RA_EXTENSION_START_RESULT',nonce,...recent.result},ORIGIN);return;}
   if(startsInProgress.size){window.postMessage({kind:'RA_EXTENSION_START_RESULT',nonce,ok:false,error:'Aguarde a confirmação da execução em andamento.'},ORIGIN);return;}
   startsInProgress.set(nonce,true);
   let answered=false;
   const reply=result=>{
    if(answered)return;
    answered=true;clearTimeout(timeout);startsInProgress.delete(nonce);
    recentStarts.set(nonce,{at:Date.now(),result});
    if(recentStarts.size>32)recentStarts.delete(recentStarts.keys().next().value);
    window.postMessage({kind:'RA_EXTENSION_START_RESULT',nonce,...result},ORIGIN);
   };
   const timeout=setTimeout(()=>reply({ok:false,error:'A extensão não confirmou a abertura em 15 segundos. Atualize o Shopee Manager e confira chrome://extensions.'}),15000);
   try{
    chrome.runtime.sendMessage({kind:'RA_START',payload:event.data.payload},response=>{
     const error=chrome.runtime.lastError?.message;
     reply(response||{ok:false,error:error||'A Ponte ChatGPT não respondeu ao comando.'});
    });
   }catch(error){reply({ok:false,error:String(error.message||error)});}
  }
  if(event.data.kind==='RA_SITE_CONTINUE'&&event.data.payload){
   const requestId=String(event.data.requestId||'');
   chrome.runtime.sendMessage({kind:'RA_CONTINUE_SITE',payload:event.data.payload},response=>{
    const error=chrome.runtime.lastError?.message;
    window.postMessage({kind:'RA_EXTENSION_CONTINUE_RESULT',requestId,
     ...(response||{ok:false,error:error||'Extensão não respondeu à recuperação.'})},ORIGIN);
   });
  }
  if(event.data.kind==='RA_SITE_WAKE'&&typeof event.data.nonce==='string'){
   chrome.runtime.sendMessage({kind:'RA_WAKE_SITE',nonce:event.data.nonce},response=>{
    window.postMessage({kind:'RA_EXTENSION_WAKE_RESULT',nonce:event.data.nonce,
     ...(response||{ok:false,error:chrome.runtime.lastError?.message||'Não foi possível reativar a Ponte.'})},ORIGIN);
   });
  }
  if(event.data.kind==='RA_SITE_UPLOAD_RESULT'&&typeof event.data.nonce==='string'){
   chrome.runtime.sendMessage({kind:'RA_UPLOADED',nonce:event.data.nonce,slot:event.data.slot,ok:event.data.ok===true,error:event.data.error||''},()=>{});
  }
  if(event.data.kind==='RA_SITE_ABORT'&&typeof event.data.nonce==='string'){
   chrome.runtime.sendMessage({kind:'RA_ABORT',nonce:event.data.nonce},()=>{});
  }
 });
 chrome.runtime.onMessage.addListener((message,_sender,sendResponse)=>{
  if(!message||!['RA_EXTENSION_IMAGE','RA_EXTENSION_PROGRESS','RA_EXTENSION_SEO_RESULT','RA_EXTENSION_SEO_PROGRESS','RA_EXTENSION_DESC_RESULT','RA_EXTENSION_DESC_PROGRESS'].includes(message.kind))return;
  const out={kind:message.kind,nonce:message.nonce,sku:message.sku,itemId:message.itemId,modelId:message.modelId,slot:message.slot,
   ...(message.kind==='RA_EXTENSION_IMAGE'?{dataUrl:message.dataUrl,mime:message.mime}:(message.kind==='RA_EXTENSION_SEO_RESULT'||message.kind==='RA_EXTENSION_DESC_RESULT')?{ok:message.ok===true,rawText:message.rawText||'',error:message.error||''}:(message.kind==='RA_EXTENSION_SEO_PROGRESS'||message.kind==='RA_EXTENSION_DESC_PROGRESS')?{status:String(message.status||'').slice(0,240)}:{status:message.status,error:message.error||''})};
  window.postMessage(out,ORIGIN);sendResponse({ok:true});
 });
 // Só aparece após instalação real. Nenhum comando pode ser executado remotamente sem a sessão no Chrome.
 announceReady();
}

}
