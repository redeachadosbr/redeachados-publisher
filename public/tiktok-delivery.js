/* Acompanhamento de rascunho TikTok: envio != notificação na caixa de entrada.
   Este módulo APENAS consulta a API existente. Nunca reenviará o vídeo. */
(function(root){
 'use strict';
 const KEY='redeachados_publisher_tiktok_delivery_v1';
 const PENDING=new Set(['processing','unverified','delayed']);
 const ACCEPTED=new Set(['PROCESSING_UPLOAD','PROCESSING_DOWNLOAD','SEND_TO_USER_INBOX','PUBLISH_COMPLETE','FAILED']);
 function translate(raw){
  switch(String(raw||'').toUpperCase()){
   case 'PROCESSING_UPLOAD': return {state:'processing',message:'TikTok recebeu a transferência e está processando o vídeo. A notificação ainda não foi confirmada.'};
   case 'PROCESSING_DOWNLOAD': return {state:'processing',message:'TikTok está baixando e processando o vídeo. A notificação ainda não foi confirmada.'};
   case 'SEND_TO_USER_INBOX': return {state:'delivered',message:'Entrega confirmada pela API do TikTok! Abra a caixa de entrada do aplicativo para finalizar a publicação.'};
   case 'PUBLISH_COMPLETE': return {state:'complete',message:'O TikTok confirmou que a publicação foi concluída no aplicativo.'};
   case 'FAILED': return {state:'failed',message:'TikTok informou falha no processamento. Confira o motivo antes de tentar novamente.'};
   default: return {state:'unverified',message:'Aguardando atualização do TikTok. Ainda não é possível confirmar a entrega.'};
  }
 }
 function create({request,onChange=()=>{},storage=root.localStorage,dom=root.document,now=()=>Date.now(),
  schedule=(fn,delay)=>setTimeout(fn,delay),cancel=id=>clearTimeout(id)}={}){
  if(typeof request!=='function')throw Error('A consulta de status TikTok é obrigatória.');
  let current=null,timer=null,busy=false;
  const element=id=>dom?.getElementById?.(id);
  const persist=()=>{
   try{if(current)storage?.setItem(KEY,JSON.stringify(current));else storage?.removeItem(KEY);}catch{}
  };
  const elapsed=()=>Math.max(0,Math.floor((now()-Number(current?.startedAt||now()))/1000));
  const elapsedText=()=>{const sec=elapsed();return sec<60?sec+' s':Math.floor(sec/60)+' min'+(sec%60?' '+sec%60+' s':'');};
  const paint=()=>{
   const panel=element('tiktokDeliveryPanel'),title=element('tiktokDeliveryTitle'),
    message=element('tiktokDeliveryMessage'),duration=element('tiktokDeliveryElapsed'),
    button=element('tiktokCheckDeliveryBtn');
   if(!panel)return;
   panel.hidden=!current;
   if(!current)return;
   panel.dataset.state=current.state;
   const titles={processing:'Vídeo transferido • aguardando TikTok',unverified:'Conferindo o recebimento no TikTok',
    delayed:'Entrega ainda não confirmada',delivered:'Notificação entregue no TikTok',
    complete:'Publicação concluída',failed:'Falha confirmada pelo TikTok'};
   title.textContent=titles[current.state]||'Acompanhando envio';
   message.textContent=current.message||'Aguardando confirmação.';
   duration.textContent='Tempo desde o início do envio: '+elapsedText()+
    (current.publishId?' · ID de acompanhamento: '+current.publishId:'');
   if(button){button.disabled=busy;button.hidden=current.state==='complete';button.textContent=busy?'Conferindo...':'Verificar agora';}
  };
  function notify(){paint();onChange(current?{...current}:null);}
  function queue(delay=20000){
   if(timer!==null){cancel(timer);timer=null;}
   if(!current||!PENDING.has(current.state)||current.state==='delayed')return;
   if(elapsed()>30*60){current.state='delayed';current.message='Passaram mais de 30 minutos sem confirmação. Verifique novamente antes de reenviar para não duplicar o vídeo.';persist();notify();return;}
   timer=schedule(()=>{timer=null;check();},delay);
  }
  async function check(){
   if(!current||busy)return;
   busy=true;paint();
   const id=current.publishId;
   try{
    const data=await request('/api/status/'+encodeURIComponent(id),{method:'POST',body:'{}'});
    // Se outro envio foi iniciado durante a consulta, não sobrescreva o novo.
    if(!current||current.publishId!==id)return;
    const raw=String(data?.status||'').toUpperCase();
    const info=translate(raw);
    current.state=info.state;
    current.message=info.message;
    current.lastStatus=ACCEPTED.has(raw)?raw:'UNKNOWN';
    current.checkedAt=now();
    if(info.state==='failed'&&data?.fail_reason)
     current.message+=' Motivo: '+String(data.fail_reason).slice(0,140)+'.';
    if(info.state==='unverified'&&data?.status)
     current.message+=' Status recebido: '+String(data.status).slice(0,60);
   }catch(e){
    if(!current||current.publishId!==id)return;
    current.state='unverified';
    current.message='Não foi possível consultar o TikTok agora ('+String(e.message||'rede indisponível').slice(0,125)+'). O vídeo não será reenviado automaticamente.';
   }finally{
    busy=false;persist();notify();queue();
   }
  }
  function track({publishId,fingerprint='',startedAt=now()}={}){
   const id=String(publishId||'').trim();
   if(!id||id.length>100)throw Error('ID de acompanhamento TikTok inválido.');
   if(timer!==null){cancel(timer);timer=null;}
   current={publishId:id,fingerprint:String(fingerprint||'').slice(0,260),
    startedAt:Number(startedAt)||now(),state:'processing',lastStatus:'PROCESSING_UPLOAD',
    checkedAt:null,message:'Arquivo transferido ao TikTok. A entrega na caixa de entrada ainda não foi confirmada.'};
   persist();notify();queue(5000);
  }
  function restore(){
   try{
    const record=JSON.parse(storage?.getItem(KEY)||'null');
    if(record&&typeof record.publishId==='string'&&record.publishId.length<=100&&
       Number.isFinite(Number(record.startedAt))&&Number(record.startedAt)>0&&
       ['processing','unverified','delayed','delivered','complete','failed'].includes(record.state))
       current={...record};
   }catch{}
   notify();if(current&&PENDING.has(current.state))queue(3000);
  }
  function isUndelivered(fingerprint){
   return Boolean(current&&PENDING.has(current.state)&&String(current.fingerprint||'')===String(fingerprint||''));
  }
  const refreshButton=element('tiktokCheckDeliveryBtn');
  refreshButton?.addEventListener('click',()=>check());
  return {track,restore,check,isUndelivered,translate,
   state:()=>current?{...current}:null};
 }
 root.PublisherTikTokDelivery={create,translate};
})(typeof window!=='undefined'?window:globalThis);
