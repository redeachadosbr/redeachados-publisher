// Ponte Shopee Chrome: pesquisas SKU-first em lotes, sem alterar anúncios.
(()=>{'use strict';
 const ORIGIN='https://redeachados-shopee.onrender.com';
 if(location.origin!==ORIGIN)return;
 const el=id=>document.getElementById(id);
 const button=el('curveChromeStart'),label=el('curveChromeStatus');
 const progress=el('curveChromeProgress'),stepLabel=el('curveChromeStage');
 const counters=el('curveChromeCounters'),feed=el('curveChromeActivity');
 const bar=el('curveChromeProgressBar'),cancel=el('curveChromeCancel');
 const percent=el('curveChromeProgressPercent');
 const summary=el('curveChromeFinalReport');
 const summaryEl=id=>document.getElementById(id);
 const countFmt=new Intl.NumberFormat('pt-BR');
 function finishReport(s,headline,statusText,note){
  if(!s||!summary)return;
  // Também registrar SKUs de consultas interrompidas antes da importação.
  const searched=s.attemptedSkuIds.size;
  const matched=[...s.matchedSkuIds].filter(sku=>s.searchedSkuIds.has(sku)).length;
  const viable=[...s.viableSkuIds].filter(sku=>s.searchedSkuIds.has(sku)).length;
  summary.hidden=false;
  summaryEl('curveChromeSummaryTitle').textContent=headline;
  summaryEl('curveChromeSummaryCategory').textContent='Categoria WeDrop: '+
   (s.selected.category==='Todos'?'Todas as categorias':s.selected.category)+
   (s.selected.keyword?' • Produto: '+s.selected.keyword:'')+
   ' • '+countFmt.format(Number(s.plan?.catalogCount)||0)+' SKUs no catálogo filtrado';
  summaryEl('curveChromeSummaryStatus').textContent=statusText;
  summaryEl('curveChromeSummaryScanned').textContent=countFmt.format(searched);
  summaryEl('curveChromeSummaryMatched').textContent=countFmt.format(matched);
  summaryEl('curveChromeSummaryViable').textContent=countFmt.format(viable);
  summaryEl('curveChromeSummaryExcluded').textContent=countFmt.format(Math.max(0,searched-viable));
  summaryEl('curveChromeSummaryDetail').textContent=
   countFmt.format(Number(s.plan?.catalogCount)||0)+' SKUs no catálogo filtrado • '+
   countFmt.format(s.scanned)+' de '+
   countFmt.format(Number(s.plan?.totalQueries)||0)+' buscas planejadas percorridas • '+
   countFmt.format(s.received)+' consulta(s) importadas com sucesso. '+
   countFmt.format(s.searchedSkuIds.size)+' SKU(s) com resultados importados; '+
   countFmt.format(Math.max(0,searched-s.searchedSkuIds.size))+
   ' SKU(s) com consulta incompleta. '+countFmt.format(s.errors)+
   ' consulta(s) com falha de leitura ou dados parciais. '+countFmt.format(viable)+
   ' de '+countFmt.format(searched)+' SKU(s) consultadas comprovaram Curva A/B '+
   'em 30 dias, 3 concorrentes e preço viável com média de 3 a 5 lojas. '+
   (note||'')+' Consulta incompleta não representa produto definitivamente reprovado. '+
   'Sem três concorrentes com vendas dos últimos 30 dias verificáveis, '+
   'nenhuma Curva pode ser confirmada, mesmo que existam anúncios na Shopee.';
 }
 const stages={iniciando:'Preparando pesquisa',navegando:'Pesquisando SKU',
  carregando:'Carregando Shopee',lendo:'Lendo anúncios',
  recuperando:'Restaurando janela para carregar Shopee',
  comparando:'Conferindo concorrência',continuando:'Avançando na categoria',
  importando:'Cruzando catálogo WeDrop',
  validando:'Validando Curva e preço',concluido:'Pesquisa finalizada',
  erro:'Leitura Shopee indisponível',cancelado:'Pesquisa interrompida'};
 function updateStage(name,detail='',s=null){
  if(progress)progress.hidden=false;
  if(stepLabel)stepLabel.textContent=stages[name]||name;
  if(counters&&s)counters.textContent=s.scanned+'/'+
   (Number(s.plan?.totalQueries)||'?')+' buscas planejadas • '+
   s.found+'/'+s.selected.limit+' SKUs aptas para Ads • '+
   s.monthly+' anúncio(s) com dados mensais • '+
   s.errors+' consulta(s) com dados incompletos';
  if(s){
   const planned=Math.max(1,Number(s.plan?.totalQueries)||Number(s.selected.limit)||1);
   const done=Math.min(planned,Math.max(0,Number(s.scanned)||0));
   if(bar){bar.max=planned;bar.value=done;}
   if(percent)percent.textContent=Math.floor(done/planned*100)+'% ('+done+'/'+planned+')';
  }
  if(feed&&detail){
   const item=document.createElement('li');item.textContent=String(detail).slice(0,260);
   feed.prepend(item);while(feed.children.length>7)feed.lastChild.remove();
  }
 }
 if(!button||!label)return;
 let active=null,offset=0,lastFilter='',queue=Promise.resolve();
 const MAX_SEARCHES_PER_RUN=60;
 const say=text=>{label.textContent=String(text||'').slice(0,550);};
 const config=()=>({category:el('curveCategory')?.value||'Todos',
  keyword:el('curveKeyword')?.value?.trim()||'',
  curve:'ALL',
  limit:Number(el('curveLimit')?.value||10),
  verifiedOnly:true});
 async function json(url,opts={}){
  const response=await fetch(url,{credentials:'same-origin',cache:'no-store',
   signal:AbortSignal.timeout(45000),...opts});
  const data=await response.json().catch(()=>({}));
  if(!response.ok||data.ok!==true)throw Error(data.error||'HTTP '+response.status);
  return data;
 }
 function pingOnce(nonce){
  return new Promise(resolve=>{
   let done=false;
   const finish=value=>{
    if(done)return;done=true;clearTimeout(timer);
    window.removeEventListener('message',listener);resolve(value);
   };
   const listener=event=>{
    if(event.source!==window||event.origin!==ORIGIN||event.data?.nonce!==nonce)return;
    if(event.data?.kind==='RA_CURVE_CHROME_DIAGNOSTIC'){
     finish({ok:false,reason:String(event.data.error||'Contexto da extensão expirado.')});
     return;
    }
    if(event.data?.kind!=='RA_CURVE_CHROME_READY')return;
    const version=String(event.data.version||'0.0.0');
    const parts=version.split('.').map(Number);
    const ok=parts[0]>1||(parts[0]===1&&
     (parts[1]>2||parts[1]===2&&Number(parts[2]||0)>=2));
    finish({ok,version,reason:ok?'':'Extensão '+version+' é antiga. Requer 1.2.2.'});
   };
   window.addEventListener('message',listener);
   const timer=setTimeout(()=>finish({ok:false,reason:'A extensão não respondeu na aba do Manager.'}),2600);
   window.postMessage({kind:'RA_CURVE_CHROME_PROBE',nonce},ORIGIN);
  });
 }
 async function ping(nonce){
  let result={ok:false,reason:'Ponte não detectada.'};
  for(let attempt=0;attempt<3;attempt++){
   result=await pingOnce(nonce);
   if(result.ok||result.version)return result;
   if(attempt<2)await new Promise(resolve=>setTimeout(resolve,450));
  }
  return result;
 }
 async function begin(){
  if(active)return;
  const selected=config(),filter=selected.category+'|'+selected.keyword;
  if(filter!==lastFilter){lastFilter=filter;offset=0;}
  const nonce=crypto.randomUUID();
  button.disabled=true;
  if(cancel){cancel.hidden=false;cancel.disabled=false;}
  if(feed)feed.replaceChildren();
  if(summary)summary.hidden=true;
  updateStage('iniciando','Verificando Ponte Chrome 1.2.2 e carregamento da Shopee.');
  say('Verificando instalação da Ponte Chrome…');
  try{
   const bridge=await ping(nonce);
   if(!bridge.ok)throw Error(bridge.reason+' Baixe a versão 1.2.2, ative o acesso ao site, atualize a extensão em chrome://extensions e recarregue o Manager.');
   const params=new URLSearchParams({category:selected.category,keyword:selected.keyword,
    offset:String(offset),limit:'6'});
   let plan=await json('/api/shopee/curvas-ab/chrome-plan?'+params);
   if(!plan.jobs.length&&offset>0){
    offset=0;params.set('offset','0');
    plan=await json('/api/shopee/curvas-ab/chrome-plan?'+params);
   }
   if(!plan.jobs.length)throw Error('Não há SKUs WeDrop disponíveis nesta categoria.');
   active={nonce,selected,plan,received:0,errors:0,scanned:0,monthly:0,found:0,blocked:false,
    searchedSkuIds:new Set(),attemptedSkuIds:new Set(),
    matchedSkuIds:new Set(),viableSkuIds:new Set()};
   offset=plan.nextOffset;
   updateStage('iniciando','Janela auxiliar minimizada • primeiro lote com '+plan.jobs.length+' consultas.',active);
   say('Pesquisa em janela minimizada; nenhuma aba é adicionada à sua janela principal.');
   window.postMessage({kind:'RA_CURVE_CHROME_START',nonce,jobs:plan.jobs},ORIGIN);
  }catch(error){
   active=null;button.disabled=false;
   if(cancel)cancel.hidden=true;
   updateStage('erro',String(error.message||error));
   say('Ponte Chrome: '+String(error.message||error));
  }
 }
 async function accept(s,m){
  s.scanned++;
  const job=s.plan.jobs.find(x=>x.query===m.query);
  for(const sku of job?.skus||[])s.attemptedSkuIds.add(String(sku));
  if(m.error){
   s.errors++;
   if(m.recoverable){
    updateStage('continuando','Busca '+s.scanned+' incompleta: '+
     String(m.error).slice(0,145)+'. Avançando para outra SKU.',s);
    say('Busca '+m.position+'/'+m.total+' incompleta. Seguindo com a categoria.');
   }else{
    s.blocked=true;
    updateStage('erro','Shopee exige verificação: '+String(m.error).slice(0,180),s);
    say('Pesquisa pausada: '+m.error);
   }
   return;
  }
  try{
   const data=await json('/api/shopee/curvas-ab/chrome-import',{
    method:'POST',headers:{'Content-Type':'application/json'},
    body:JSON.stringify({...s.selected,query:m.query,
     offers:Array.isArray(m.offers)?m.offers.slice(0,100):[]})
   });
   if(active!==s)return;
   s.received++;
   if(m.warning){
    s.errors++;
    updateStage('continuando','Consulta com dados parciais: '+
     String(m.warning).slice(0,145),s);
   }
   s.found=Number(data.found)||0;
   s.monthly+=Number(data.chromeImport?.monthlyOffers)||0;
   for(const sku of data.chromeImport?.searchedSkus||[])s.searchedSkuIds.add(String(sku));
   s.matchedSkuIds=new Set((data.matchedSkuIds||[]).map(String));
   s.viableSkuIds=new Set((data.viableSkuIds||[]).map(String));
   globalThis.RACurvesAB?.showChromeResults?.(data);
   updateStage('validando',data.found+' SKUs Curva A/B viáveis para Ads; '+
    data.pendingCount+' sem comprovação mensal.',s);
   say('Ponte: '+s.received+' consultas importadas; '+data.found+' SKUs classificadas e '+
    data.pendingCount+' pendentes. Busca '+m.position+'/'+m.total+'.');
  }catch(error){
   if(active!==s)return;
   s.errors++;
   updateStage('continuando','Não foi possível importar '+m.query+
    '. Marcada para conferência e avançando na categoria.',s);
   say('Importação desta SKU incompleta: '+String(error.message||error));
  }
 }
 window.addEventListener('message',event=>{
  if(event.source!==window||event.origin!==ORIGIN)return;
  const m=event.data||{},s=active;
  if(!s||m.nonce!==s.nonce)return;
  if(m.kind==='RA_CURVE_CHROME_STEP'){
   updateStage(m.stage||'lendo',m.detail||'',s);
  }else if(m.kind==='RA_CURVE_CHROME_PROGRESS'){
   const job=s.plan.jobs.find(x=>x.query===m.query);
   for(const sku of job?.skus||[])s.attemptedSkuIds.add(String(sku));
   say('Em Destaque '+m.position+'/'+m.total+': '+String(m.query||'').slice(0,90));
  }else if(m.kind==='RA_CURVE_CHROME_RESULT'){
   queue=queue.then(()=>accept(s,m));
  }else if(m.kind==='RA_CURVE_CHROME_ERROR'){
   s.errors++;s.blocked=true;
   updateStage('erro',m.error||'Falha na captura.',s);
   say('Ponte Chrome: '+String(m.error||'Falha na captura.'));
  }else if(m.kind==='RA_CURVE_CHROME_DONE'){
   void queue.then(async()=>{
    if(active!==s)return;
    let finished='';
    if(s.cancelRequested||m.cancelled)
     finished='Pesquisa interrompida. '+s.found+'/'+s.selected.limit+' SKUs qualificadas até aqui.';
    else if(s.found>=s.selected.limit)
     finished='Meta atingida: '+s.found+'/'+s.selected.limit+' SKUs A/B com três concorrentes mensais.';
    else if(s.blocked)
     finished='Leitura Shopee insuficiente ou verificação: '+s.found+'/'+s.selected.limit+' SKUs comprovadas. Pesquisa interrompida.';
    else if(s.scanned>=MAX_SEARCHES_PER_RUN)
     finished='Foram realizadas '+s.scanned+' consultas; '+s.found+'/'+s.selected.limit+
       ' SKUs tiveram dados suficientes para Ads. Ainda há produtos por verificar: '+
       'clique em Pesquisar no Chrome para continuar a categoria.';
    else if(s.plan.hasMore){
     const params=new URLSearchParams({category:s.selected.category,keyword:s.selected.keyword,
      offset:String(offset),limit:'6'});
     const plan=await json('/api/shopee/curvas-ab/chrome-plan?'+params);
     if(plan.jobs.length){
      s.plan=plan;offset=plan.nextOffset;
      updateStage('navegando','Próximo lote: '+plan.jobs.length+
       ' pesquisas, '+s.scanned+' consultas já concluídas.',s);
      say('Continuando automaticamente: '+s.found+'/'+s.selected.limit+
       ' SKUs classificadas, '+s.scanned+' pesquisas. Novo lote: '+plan.jobs.length+'.');
      window.postMessage({kind:'RA_CURVE_CHROME_START',nonce:s.nonce,jobs:plan.jobs},ORIGIN);
      return;
     }
     finished='Catálogo percorrido: '+s.found+'/'+s.selected.limit+' SKUs comprovadas.';
    }else finished='Categoria percorrida: '+s.found+'/'+s.selected.limit+' SKUs comprovadas.';
    window.postMessage({kind:'RA_CURVE_CHROME_CLOSE',nonce:s.nonce},ORIGIN);
    if(s.blocked)offset=0; // repetir a pesquisa interrompida no próximo clique
    active=null;button.disabled=false;
    if(cancel)cancel.hidden=true;
    updateStage(s.cancelRequested?'cancelado':s.blocked?'erro':'concluido',finished,s);
    finishReport(s,s.cancelRequested||m.cancelled?'Pesquisa interrompida':s.blocked?
     'Pesquisa interrompida pela Shopee':'Resultado da pesquisa',
     s.cancelRequested||m.cancelled?'Interrompida':s.blocked?'Acesso limitado':
     s.found>=s.selected.limit?'Meta alcançada':'Pesquisa encerrada',
     finished);
    say(finished);
   }).catch(error=>{
    if(active!==s)return;
    window.postMessage({kind:'RA_CURVE_CHROME_CLOSE',nonce:s.nonce},ORIGIN);
    active=null;button.disabled=false;
    if(cancel)cancel.hidden=true;
    updateStage('erro','Falha ao continuar a pesquisa: '+String(error.message||error),s);
    finishReport(s,'Pesquisa interrompida','Erro na continuidade',
     'Não foi possível concluir o restante: '+String(error.message||error));
    say('Falha ao continuar a pesquisa: '+String(error.message||error));
   });
  }
 });
 if(cancel)cancel.addEventListener('click',()=>{
  const s=active;if(!s||s.cancelRequested)return;
  s.cancelRequested=true;cancel.disabled=true;
  updateStage('cancelado','Solicitando interrupção e fechamento da janela auxiliar…',s);
  window.postMessage({kind:'RA_CURVE_CHROME_CANCEL',nonce:s.nonce},ORIGIN);
 });
 const form=el('curveSearchForm');
 if(form)form.addEventListener('submit',event=>{
  event.preventDefault();void begin();
 });
})();