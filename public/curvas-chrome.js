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
  const imported=s.searchedSkuIds.size;
  const matched=[...s.matchedSkuIds].filter(sku=>s.searchedSkuIds.has(sku)).length;
  const viable=[...s.viableSkuIds].filter(sku=>s.searchedSkuIds.has(sku)).length;
  const pending=[...s.pendingSkuIds].filter(sku=>s.searchedSkuIds.has(sku)).length;
  const discarded=[...s.discardedSkuIds].filter(sku=>s.searchedSkuIds.has(sku)).length;
  const missingSearch=Math.max(0,searched-imported);
  const noMatch=Math.max(0,imported-matched);
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
  summaryEl('curveChromeSummaryExcluded').textContent=countFmt.format(pending);
  const diagnostics=s.sourceStats||{};
  const causes=[
   pending+' candidato(s) aguardando demanda ou preço para Ads',
   discarded+' SKU(s) descartadas por custo, margem ou estoque',
   noMatch+' SKU(s) sem produto equivalente encontrado',
   missingSearch+' SKU(s) com consulta incompleta ou sem importação',
   (diagnostics.monthly_labels_unbound||0)+' pesquisa(s) com Vendido/Mês visível, mas sem vínculo ao anúncio',
   ((diagnostics.monthly_capture_failed||0)+(diagnostics.monthly_not_rendered||0))+
    ' pesquisa(s) com falha na captura de Vendido/Mês; não comprova ausência do indicador na Shopee',
   (diagnostics.no_visible_offers||0)+' pesquisa(s) sem anúncios legíveis',
   (diagnostics.featured_public_recovered||0)+' consulta(s) recuperadas na fonte pública Shopee'
  ];
  summaryEl('curveChromeSummaryDetail').textContent=
   countFmt.format(Number(s.plan?.catalogCount)||0)+' SKUs no catálogo • '+
   countFmt.format(s.scanned)+' consultas realizadas de '+
   countFmt.format(Number(s.plan?.totalQueries)||0)+' planejadas • '+
   countFmt.format(s.received)+' consultas importadas • '+causes.join(' • ')+'. '+
   (note||'')+' A extensão tenta recuperar as vendas mensais na mesma janela. '+
   'A falta de prova mensal não significa produto definitivamente reprovado.';
 }
 const stages={iniciando:'Preparando pesquisa',navegando:'Pesquisando SKU',
  carregando:'Carregando Shopee',lendo:'Lendo anúncios',
  recuperando:'Recuperando anúncios Shopee',
  comparando:'Conferindo concorrência',continuando:'Avançando na categoria',
  importando:'Cruzando catálogo WeDrop',
  validando:'Validando Curva e preço',concluido:'Pesquisa concluída',
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
 // Versão do manifesto é a fonte de verdade do botão de download, sem caches antigos.
 const download=el('curveChromeDownload');
 if(download){
  fetch('/api/shopee/curvas-ab/chrome-extension-version',{
   credentials:'same-origin',cache:'no-store',signal:AbortSignal.timeout(8000)
  }).then(response=>response.ok?response.json():null).then(info=>{
   const version=String(info?.version||'');
   if(info?.ok!==true||!/^[0-9]+\.[0-9]+\.[0-9]+$/.test(version))return;
   download.textContent='Baixar extensão '+version;
   download.href='/api/shopee/curvas-ab/chrome-extension.zip?v='+encodeURIComponent(version);
   download.download='redeachados-shopee-chrome-'+version+'.zip';
  }).catch(()=>{ /* O link HTML permanece funcional sem consulta de versão. */ });
 }
 let active=null,offset=0,lastFilter='',queue=Promise.resolve();
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
     (parts[1]>2||parts[1]===2&&Number(parts[2]||0)>=13));
    finish({ok,version,reason:ok?'':'Extensão '+version+' é antiga. Requer 1.2.13 para corrigir a leitura de Vendido/Mês.'});
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
  updateStage('iniciando','Verificando Ponte Chrome 1.2.13 e carregamento da Shopee.');
  say('Verificando instalação da Ponte Chrome…');
  try{
   const bridge=await ping(nonce);
   if(!bridge.ok)throw Error(bridge.reason+' Baixe a versão 1.2.13, substitua os arquivos da pasta instalada, clique em Recarregar em chrome://extensions e recarregue o Manager.');
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
    matchedSkuIds:new Set(),viableSkuIds:new Set(),
     pendingSkuIds:new Set(),discardedSkuIds:new Set(),targetReached:false,
     batchStartScanned:0,noVisibleStreak:0,monthlyFailureStreak:0,
     sourceStats:{monthly_captured:0,
      monthly_labels_unbound:0,monthly_not_rendered:0,monthly_capture_failed:0,
      no_visible_offers:0,featured_public_recovered:0}};
   offset=plan.nextOffset;
   updateStage('iniciando','Janela auxiliar sem foco • primeiro lote com '+plan.jobs.length+' consultas.',active);
   say('Pesquisa em janela auxiliar independente, sem alterar suas guias abertas.');
   window.postMessage({kind:'RA_CURVE_CHROME_START',nonce,jobs:plan.jobs},ORIGIN);
  }catch(error){
   active=null;button.disabled=false;
   if(cancel)cancel.hidden=true;
   updateStage('erro',String(error.message||error));
   say('Ponte Chrome: '+String(error.message||error));
  }
 }
 async function accept(s,m){
  if(s.targetReached)return;
   s.scanned++;
   const reason=String(m.stats?.sourceStatus||'');
   if(Object.hasOwn(s.sourceStats,reason))s.sourceStats[reason]++;
   s.noVisibleStreak=reason==='no_visible_offers'?s.noVisibleStreak+1:0;
   s.monthlyFailureStreak=['monthly_capture_failed','monthly_labels_unbound']
    .includes(reason)?s.monthlyFailureStreak+1:0;
   // Falhas persistentes da fonte: pausar, não consumir todo o catálogo.
   // Ausência de rótulo mensal não comprova que um produto vende pouco.
   if(s.noVisibleStreak>=3||s.monthlyFailureStreak>=8){
    s.blocked=true;
    const detail=s.noVisibleStreak>=3?
     'Shopee não apresentou cartões legíveis em 3 consultas consecutivas.':
     'Shopee não forneceu vendas mensais vinculadas em 8 consultas consecutivas.';
    window.postMessage({kind:'RA_CURVE_CHROME_CANCEL',nonce:s.nonce},ORIGIN);
    updateStage('erro',detail+
     ' Pesquisa pausada para corrigir a fonte; nenhuma Curva foi inventada.',s);
    say(detail+' Confira a janela Shopee, atualize a Ponte Chrome e reinicie a pesquisa.');
    return;
   }
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
    const diagnostics=data.chromeImport||{};
    const linked=(diagnostics.skuPriceDiagnostics||[])
     .map(x=>x.sku+': '+x.candidates+' relacionados, '+x.validated+' validados')
     .slice(0,3).join(' • ');
    updateStage('comparando',
     'Leitura: '+Number(diagnostics.inspectedRawOffers||0)+' anúncios capturados; '+
     Number(diagnostics.importedWithPrice||0)+' preços importados. '+linked+
     (Number(m.stats?.openTabRecovered)>0?
      ' • '+m.stats.openTabRecovered+' recuperados da pesquisa já aberta.':''),s);
   if(m.warning){
    s.errors++;
    updateStage('continuando','Consulta com dados parciais: '+
     String(m.warning).slice(0,145),s);
   }
   s.found=Number(data.found)||0;
   s.monthly+=Number(data.chromeImport?.monthlyOffers)||0;
   if(Number(data.chromeImport?.recoveredMonthly)>0){
    s.sourceStats.featured_public_recovered++;
    updateStage('recuperando',
     'Fonte alternativa da vitrine Shopee confirmou '+
     data.chromeImport.recoveredMonthly+' anúncios com Vendido/Mês.',s);
   }else if(data.chromeImport?.recoveryReason&&
      data.chromeImport.recoverySource!=='not_needed'){
    updateStage('recuperando',
     'Fonte alternativa: '+String(data.chromeImport.recoveryReason).slice(0,135),s);
   }
   for(const sku of data.chromeImport?.searchedSkus||[])s.searchedSkuIds.add(String(sku));
   s.matchedSkuIds=new Set((data.matchedSkuIds||[]).map(String));
   s.pendingSkuIds=new Set((data.pendingSkuIds||[]).map(String));
   s.discardedSkuIds=new Set((data.discardedSkuIds||[]).map(String));
    s.viableSkuIds=new Set((data.viableSkuIds||[]).map(String));
   globalThis.RACurvesAB?.showChromeResults?.(data);
   if(s.found>=s.selected.limit&&!s.targetReached){
    s.targetReached=true;
    updateStage('validando','Meta de '+s.selected.limit+
     ' SKUs aptas atingida; encerrando pesquisas restantes.',s);
    window.postMessage({kind:'RA_CURVE_CHROME_CANCEL',nonce:s.nonce},ORIGIN);
   }
   updateStage('validando',data.found+' SKUs aprovadas para Ads; '+
    data.pendingCount+' aguardam dados e '+
    Number(data.discardedCount||0)+' estão descartadas por custo, margem ou estoque.',s);
   say('Ponte: '+s.received+' consultas importadas; '+data.found+' SKUs classificadas e '+
    data.pendingCount+' candidatos pendentes. Busca '+m.position+'/'+m.total+'.');
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
    if(s.targetReached||s.found>=s.selected.limit)
     finished='Meta atingida: '+s.found+'/'+s.selected.limit+
      ' SKUs Curva A/B aprovadas; buscas restantes encerradas.';
    else if(s.cancelRequested||m.cancelled)
     finished='Pesquisa interrompida. '+s.found+'/'+s.selected.limit+' SKUs qualificadas até aqui.';
    else if(s.blocked)
     finished='Leitura Shopee insuficiente ou verificação: '+s.found+'/'+s.selected.limit+' SKUs comprovadas. Pesquisa interrompida.';
    else if(s.plan.hasMore){
     const params=new URLSearchParams({category:s.selected.category,keyword:s.selected.keyword,
      offset:String(offset),limit:'6'});
     const plan=await json('/api/shopee/curvas-ab/chrome-plan?'+params);
     if(plan.jobs.length){
      s.plan=plan;s.batchStartScanned=s.scanned;offset=plan.nextOffset;
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
    if(s.blocked||s.cancelRequested||m.cancelled&&!s.targetReached){
      // Reservas de lote não são pesquisas efetuadas. Retomar a partir da
      // primeira consulta que não produziu resultado na extensão.
      offset=s.plan.offset+Math.max(0,Math.min(s.plan.jobs.length,
       s.scanned-s.batchStartScanned));
     }
    active=null;button.disabled=false;
    if(cancel)cancel.hidden=true;
    const stoppedByUser=s.cancelRequested||(m.cancelled&&!s.targetReached);
    updateStage(stoppedByUser?'cancelado':s.blocked?'erro':'concluido',finished,s);
    finishReport(s,stoppedByUser?'Pesquisa interrompida':s.blocked?
     'Pesquisa interrompida pela Shopee':'Resultado da pesquisa',
     stoppedByUser?'Interrompida':s.blocked?'Acesso limitado':
     s.found>=s.selected.limit?'Meta alcançada':'Categoria percorrida',
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
