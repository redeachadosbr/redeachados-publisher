// Ponte Shopee Chrome: pesquisas SKU-first em lotes, sem alterar anúncios.
(()=>{'use strict';
 const ORIGIN='https://redeachados-shopee.onrender.com';
 if(location.origin!==ORIGIN)return;
 const el=id=>document.getElementById(id);
 const button=el('curveChromeStart'),label=el('curveChromeStatus');
 if(!button||!label)return;
 let active=null,offset=0,lastFilter='',queue=Promise.resolve();
 const MAX_SEARCHES_PER_RUN=60, NO_MONTHLY_LIMIT=18;
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
     e.data?.nonce===nonce){
      const parts=String(e.data.version||'0.0.0').split('.').map(Number);
      finish(parts[0]>1||(parts[0]===1&&parts[1]>=1));
     }
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
   if(!await ping(nonce))throw Error('Ponte não detectada ou desatualizada. Baixe a versão 1.1.0, atualize a extensão em chrome://extensions e recarregue o Manager.');
   const params=new URLSearchParams({category:selected.category,keyword:selected.keyword,
    offset:String(offset),limit:'6'});
   let plan=await json('/api/shopee/curvas-ab/chrome-plan?'+params);
   if(!plan.jobs.length&&offset>0){
    offset=0;params.set('offset','0');
    plan=await json('/api/shopee/curvas-ab/chrome-plan?'+params);
   }
   if(!plan.jobs.length)throw Error('Não há SKUs WeDrop disponíveis nesta categoria.');
   active={nonce,selected,plan,received:0,errors:0,scanned:0,monthly:0,found:0,blocked:false};
   offset=plan.nextOffset;
   say('Abrindo a busca Shopee para '+plan.jobs.length+' consultas. A extensão importará os anúncios visíveis.');
   window.postMessage({kind:'RA_CURVE_CHROME_START',nonce,jobs:plan.jobs},ORIGIN);
  }catch(error){
   active=null;button.disabled=false;say('Ponte Chrome: '+String(error.message||error));
  }
 }
 async function accept(s,m){
  s.scanned++;
  if(m.error){s.errors++;if(/captcha|bloque|verifica[cç][aã]o/i.test(m.error))s.blocked=true;
   say('Busca '+m.position+'/'+m.total+': '+m.error);return;}
  try{
   const data=await json('/api/shopee/curvas-ab/chrome-import',{
    method:'POST',headers:{'Content-Type':'application/json'},
    body:JSON.stringify({...s.selected,query:m.query,
     offers:Array.isArray(m.offers)?m.offers.slice(0,100):[]})
   });
   if(active!==s)return;
   s.received++;
   s.found=Number(data.found)||0;
   s.monthly+=Number(data.chromeImport?.monthlyOffers)||0;
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
   s.errors++;s.blocked=true;say('Ponte Chrome: '+String(m.error||'Falha na captura.'));
  }else if(m.kind==='RA_CURVE_CHROME_DONE'){
   void queue.then(async()=>{
    if(active!==s)return;
    let finished='';
    if(s.found>=s.selected.limit)
     finished='Meta atingida: '+s.found+'/'+s.selected.limit+' SKUs A/B com três concorrentes mensais.';
    else if(s.blocked)
     finished='Bloqueio/verificação Shopee: '+s.found+'/'+s.selected.limit+' SKUs comprovadas. Pesquisa interrompida.';
    else if(s.monthly===0&&s.scanned>=NO_MONTHLY_LIMIT)
     finished='Sem vendas mensais: '+s.scanned+' pesquisas realizadas. “Vendidos” não comprova 30 dias. Precisa de fonte mensal autorizada.';
    else if(s.scanned>=MAX_SEARCHES_PER_RUN)
     finished='Limite desta execução: '+s.scanned+' buscas, '+s.found+'/'+s.selected.limit+
      ' SKUs comprovadas. Clique novamente para continuar sem repetir.';
    else if(s.plan.hasMore){
     const params=new URLSearchParams({category:s.selected.category,keyword:s.selected.keyword,
      offset:String(offset),limit:'6'});
     const plan=await json('/api/shopee/curvas-ab/chrome-plan?'+params);
     if(plan.jobs.length){
      s.plan=plan;offset=plan.nextOffset;
      say('Continuando automaticamente: '+s.found+'/'+s.selected.limit+
       ' SKUs classificadas, '+s.scanned+' pesquisas. Novo lote: '+plan.jobs.length+'.');
      window.postMessage({kind:'RA_CURVE_CHROME_START',nonce:s.nonce,jobs:plan.jobs},ORIGIN);
      return;
     }
     finished='Catálogo percorrido: '+s.found+'/'+s.selected.limit+' SKUs comprovadas.';
    }else finished='Categoria percorrida: '+s.found+'/'+s.selected.limit+' SKUs comprovadas.';
    active=null;button.disabled=false;say(finished);
   }).catch(error=>{
    if(active!==s)return;
    active=null;button.disabled=false;
    say('Falha ao continuar a pesquisa: '+String(error.message||error));
   });
  }
 });
 button.addEventListener('click',()=>{void begin();});
})();