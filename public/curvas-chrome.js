// Ponte Shopee Chrome: pesquisas SKU-first em lotes, sem alterar anúncios.
(()=>{'use strict';
 const ORIGIN='https://redeachados-shopee.onrender.com';
 if(location.origin!==ORIGIN)return;
 const el=id=>document.getElementById(id);
 const button=el('curveChromeStart'),label=el('curveChromeStatus');
 if(!button||!label)return;
 let active=null,offset=0,lastFilter='',queue=Promise.resolve();
 const say=text=>{label.textContent=String(text||'').slice(0,550);};
 const config=()=>({category:el('curveCategory')?.value||'Todos',
  keyword:el('curveKeyword')?.value?.trim()||'',
  curve:el('curveType')?.value||'ALL',
  limit:Number(el('curveLimit')?.value||10),
  verifiedOnly:el('curveConfirmedOnly')?.checked!==false});
 async function json(url,opts={}){
  const response=await fetch(url,{credentials:'same-origin',cache:'no-store',
   signal:AbortSignal.timeout(45000),...opts});
  const data=await response.json().catch(()=>({}));
  if(!response.ok||data.ok!==true)throw Error(data.error||'HTTP '+response.status);
  return data;
 }
 function ping(nonce){
  return new Promise(resolve=>{
   let done=false;
   function finish(ok){if(done)return;done=true;clearTimeout(timer);
    window.removeEventListener('message',listener);resolve(ok);}
   const listener=e=>{
    if(e.source===window&&e.origin===ORIGIN&&e.data?.kind==='RA_CURVE_CHROME_READY'&&
     e.data?.nonce===nonce)finish(true);
   };
   window.addEventListener('message',listener);
   const timer=setTimeout(()=>finish(false),1900);
   window.postMessage({kind:'RA_CURVE_CHROME_PROBE',nonce},ORIGIN);
  });
 }
 async function begin(){
  if(active)return;
  const selected=config(),filter=selected.category+'|'+selected.keyword;
  if(filter!==lastFilter){lastFilter=filter;offset=0;}
  const nonce=crypto.randomUUID();
  button.disabled=true;
  say('Verificando instalação da Ponte Chrome…');
  try{
   if(!await ping(nonce))throw Error('Ponte não detectada. Baixe o ZIP, extraia, instale em chrome://extensions e atualize esta página.');
   const params=new URLSearchParams({category:selected.category,keyword:selected.keyword,
    offset:String(offset),limit:'6'});
   let plan=await json('/api/shopee/curvas-ab/chrome-plan?'+params);
   if(!plan.jobs.length&&offset>0){
    offset=0;params.set('offset','0');
    plan=await json('/api/shopee/curvas-ab/chrome-plan?'+params);
   }
   if(!plan.jobs.length)throw Error('Não há SKUs WeDrop disponíveis nesta categoria.');
   active={nonce,selected,plan,received:0,errors:0};
   offset=plan.nextOffset;
   say('Abrindo a busca Shopee para '+plan.jobs.length+' consultas. A extensão importará os anúncios visíveis.');
   window.postMessage({kind:'RA_CURVE_CHROME_START',nonce,jobs:plan.jobs},ORIGIN);
  }catch(error){
   active=null;button.disabled=false;say('Ponte Chrome: '+String(error.message||error));
  }
 }
 async function accept(s,m){
  if(m.error){s.errors++;say('Busca '+m.position+'/'+m.total+': '+m.error);return;}
  try{
   const data=await json('/api/shopee/curvas-ab/chrome-import',{
    method:'POST',headers:{'Content-Type':'application/json'},
    body:JSON.stringify({...s.selected,query:m.query,
     offers:Array.isArray(m.offers)?m.offers.slice(0,60):[]})
   });
   if(active!==s)return;
   s.received++;
   globalThis.RACurvesAB?.showChromeResults?.(data);
   say('Ponte: '+s.received+' consultas importadas; '+data.found+' SKUs classificadas e '+
    data.pendingCount+' pendentes. Busca '+m.position+'/'+m.total+'.');
  }catch(error){
   if(active!==s)return;
   s.errors++;say('Falha ao importar '+m.query+': '+String(error.message||error));
  }
 }
 window.addEventListener('message',event=>{
  if(event.source!==window||event.origin!==ORIGIN)return;
  const m=event.data||{},s=active;
  if(!s||m.nonce!==s.nonce)return;
  if(m.kind==='RA_CURVE_CHROME_PROGRESS'){
   say('Em Destaque '+m.position+'/'+m.total+': '+String(m.query||'').slice(0,90));
  }else if(m.kind==='RA_CURVE_CHROME_RESULT'){
   queue=queue.then(()=>accept(s,m));
  }else if(m.kind==='RA_CURVE_CHROME_ERROR'){
   s.errors++;say('Ponte Chrome: '+String(m.error||'Falha na captura.'));
  }else if(m.kind==='RA_CURVE_CHROME_DONE'){
   void queue.finally(()=>{
    if(active!==s)return;
    active=null;button.disabled=false;
    say('Lote concluído: '+s.received+' buscas importadas'+
     (s.errors?', '+s.errors+' falharam':'')+'. '+
     (s.plan.hasMore?'Clique novamente para pesquisar mais SKUs WeDrop.':
      'Todas as consultas planejadas foram percorridas.')+
     ' A ausência de dado mensal não significa vendas zero.');
   });
  }
 });
 button.addEventListener('click',()=>{void begin();});
})();