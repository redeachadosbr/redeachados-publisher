// Ranking TOP 10 Orgânico: abre ao autenticar ou atualizar, usa exclusivamente
// relatório orgânico salvo (nunca /ads/). Sem dados, mostra a importação.
(()=>{
 'use strict';
 function start(){
  const modal=document.getElementById('organicTop10Overlay');
  if(!modal)return;
  const $=id=>document.getElementById(id);
  const group=$('organicTop10Sorts'),list=$('organicTop10List');
  const importBox=$('organicTop10Import'),status=$('organicTop10Status');
  const sorts=[...group.querySelectorAll('button[data-sort]')];
  let visible=false,autoShown=false,loading=false,sort='combined',last=null,
   focusBefore=null,loadSequence=0,source='api',apiPeriod='7',apiAutoAttempted=false;
  const fmt=new Intl.NumberFormat('pt-BR');
  const dec=new Intl.NumberFormat('pt-BR',{minimumFractionDigits:2,maximumFractionDigits:2});
  const number=v=>v===null||v===undefined?'—':fmt.format(Number(v));
  const percent=v=>v===null||v===undefined?'—':dec.format(Number(v))+'%';
  const period=d=>/^\d{4}-\d{2}-\d{2}$/.test(String(d||''))?
   d.slice(8,10)+'/'+d.slice(5,7)+'/'+d.slice(0,4):'—';
  const date=v=>{
   const parsed=Date.parse(String(v||''));
   return Number.isFinite(parsed)?new Date(parsed).toLocaleString('pt-BR',{
    day:'2-digit',month:'2-digit',year:'numeric',hour:'2-digit',minute:'2-digit'
   }):'não informada';
  };
  function notice(text,kind='info'){
   status.hidden=false;
   status.textContent=String(text);
   status.dataset.status=kind;
  }
  function el(parent,tag,text='',className=''){
   const node=document.createElement(tag);
   node.textContent=String(text??'');
   if(className)node.className=className;
   parent.append(node);
   return node;
  }
  function render(rows){
   list.replaceChildren();
   const input=Array.isArray(rows)?rows:[];
   input.forEach((row,index)=>{
    const card=el(list,'article','','organic-top10-item');
    card.style.animationDelay=Math.min(index*35,300)+'ms';
    const product=el(card,'div','','organic-top10-product');
    el(product,'span',String(index+1).padStart(2,'0'),'organic-top10-rank');
    if(/^https:\/\//i.test(String(row.imageUrl||''))){
     const photo=el(product,'img','','organic-top10-thumb');
     photo.src=row.imageUrl;photo.alt='Miniatura do produto '+String(row.sku||'');
     photo.loading=index>3?'lazy':'eager';
     photo.referrerPolicy='no-referrer';
     photo.onerror=()=>{
      const replacement=document.createElement('span');
      replacement.className='organic-top10-thumb organic-top10-thumb-placeholder';
      replacement.textContent='▧';photo.replaceWith(replacement);
     };
    }else el(product,'span','▧','organic-top10-thumb organic-top10-thumb-placeholder');
    const title=el(product,'div');
    const name=el(title,'strong',row.title||'Produto Shopee','organic-top10-product-name');
    name.title=row.title||'Produto Shopee';
    el(title,'small','SKU '+(row.sku||'anúncio de variações')+
     (row.itemId?' · Item '+row.itemId:'')+
     (source==='api'&&row.latestTotalViews!==null&&row.latestTotalViews!==undefined?
      ' · Contador atual '+number(row.latestTotalViews):''),'organic-top10-product-code');
    const add=(value,label,cls='')=>{
     const col=el(card,'div','','organic-top10-value '+cls);
     el(col,'span',value);
     el(col,'small',label);
    };
    if(source==='api')add(number(row.viewsObserved!==null&&row.viewsObserved!==undefined?
     row.viewsObserved:row.latestTotalViews),
     row.viewsObserved!==null&&row.viewsObserved!==undefined?
      'Variação observada (parcial)':'Contador Shopee (sem período)');
    else add(number(row.impressions),'Impressões');
    add(number(row.visits),'Visitas');
    add(number(row.clicks),'Cliques');
    add(percent(row.ctr),'CTR','organic-top10-ctr');
    // "Adicionado ao carrinho" não significa que o comprador desistiu.
    // Sem coluna explícita de abandono, mostrar adições com rótulo distinto.
    const hasAbandonment=row.cartPending!==null&&row.cartPending!==undefined;
    const hasAdditions=row.cartAdded!==null&&row.cartAdded!==undefined;
    const countLabel=hasAbandonment?
     row.cartCountKind==='carts'?'Carrinhos abandonados':'Parados no carrinho':
     hasAdditions?'Adicionados (não abandonos)':'Carrinho sem dados';
    add(number(hasAbandonment?row.cartPending:row.cartAdded),countLabel,
     hasAbandonment?'organic-top10-pending':'organic-top10-added');
    add(percent(row.cartAbandonmentRate),
     row.cartRateSource==='calculated'?'Abandono calculado (mesma base)':
     row.cartRateSource==='reported'?'Abandono informado':'Abandono não verificado',
     'organic-top10-abandonment');
    const action=el(card,'button','Ver SKU','organic-top10-open-item');
    action.type='button';
    action.disabled=!row.sku||typeof globalThis.RAOpenPendingImageSku!=='function';
    action.title=action.disabled?'SKU sem vínculo no catálogo':'Abrir otimização da SKU';
    action.addEventListener('click',()=>{
     if(!row.sku)return;
     close();
     globalThis.RAOpenPendingImageSku?.(row.sku);
    });
   });
  }
  const apiQuery=()=>new URLSearchParams({
   period:apiPeriod,...(['custom','day'].includes(apiPeriod)?{
    start:$('organicTop10ApiStart').value,end:apiPeriod==='day'?
     $('organicTop10ApiStart').value:$('organicTop10ApiEnd').value
   }:{})
  });
  async function getApiSummary(){
   const response=await fetch('/api/shopee/product-views/top10?'+apiQuery(),{
    credentials:'same-origin',cache:'no-store',
    headers:{Accept:'application/json'}
   });
   const data=await response.json().catch(()=>({}));
   if(!response.ok||data.ok!==true)
    throw Error(data.error||'Não foi possível consultar as medições da Shopee.');
   return data;
  }
  async function collectApiViews(force=false){
   const response=await fetch('/api/shopee/product-views/collect',{
    method:'POST',credentials:'same-origin',cache:'no-store',
    headers:{'Content-Type':'application/json'},body:JSON.stringify({force})
   });
   const data=await response.json().catch(()=>({}));
   if(!response.ok||data.ok!==true)
    throw Error(data.error||'Shopee não confirmou a coleta de visualizações.');
   return data;
  }
  async function refreshApi({forceCollect=false}={}){
   if(loading)return;
   loading=true;
   const serial=++loadSequence;
   $('organicTop10ViewsHeader').textContent='Visualizações';
   notice('Lendo as visualizações oficiais já registradas. Os números não separam Ads…');
   try{
    let data=await getApiSummary();
    if(forceCollect||data.needsCollection&&!apiAutoAttempted){
     apiAutoAttempted=true;
     notice('Consultando visualizações dos anúncios na Shopee. Isto é somente leitura e pode levar algum tempo…');
     try{
      await collectApiViews(forceCollect);
      data=await getApiSummary();
     }catch(error){
      notice('A nova consulta não pôde ser concluída: '+String(error.message||error)+
       '. Exibindo apenas medições salvas, quando disponíveis.','error');
     }
    }
    if(serial!==loadSequence)return;
    last=data;
    const samples=data.list||[];
    $('organicTop10Period').textContent='Janela solicitada: '+
     period(data.window?.start)+' a '+period(data.window?.end);
    $('organicTop10Count').textContent=
     number(data.totalProducts)+' anúncios medidos · '+
     number(data.withPeriodDelta)+' com diferença observada';
    $('organicTop10Footnote').textContent=
     'API Shopee get_item_extra_info. Visualizações gerais por Item ID: podem incluir Ads. '+
     'As diferenças são parciais, apenas entre medições efetivas ('+
     (data.lastSample?'última: '+date(data.lastSample):'nenhuma leitura salva')+
     '). Impressões orgânicas, visitantes únicos, CTR e abandono não são retornados por esta API.';
    importBox.hidden=true;importBox.dataset.open='';
    render(samples);
    if(!samples.length)
     notice('Não há medições suficientes no período solicitado. A API não permite buscar dias anteriores à primeira coleta. '+
      'Clique em “Atualizar Shopee” para registrar uma nova amostra.');
    else if(data.withPeriodDelta===0)
     notice('A primeira coleta registrou o contador de visualizações da Shopee, não números do período. '+
      'Após novas medições, o painel poderá comparar apenas o intervalo realmente observado.');
    else
     notice('Exibindo diferenças OBSERVADAS nas datas escolhidas, não todo o período oficial. '+
      number(data.withPeriodDelta)+' anúncios têm pelo menos duas medições.','success');
   }catch(error){
    render([]);
    notice('Consulta da API indisponível: '+String(error.message||error)+
     '. Não será exibida nenhuma estatística inventada.','error');
    $('organicTop10Count').textContent='API indisponível';
   }finally{loading=false;}
  }
  function setSource(next){
   source=next==='organic'?'organic':'api';
   $('organicTop10ModeApi').setAttribute('aria-pressed',String(source==='api'));
   $('organicTop10ModeOrganic').setAttribute('aria-pressed',String(source==='organic'));
   $('organicTop10ApiPeriods').hidden=source!=='api';
   $('organicTop10Tools').hidden=source!=='organic';
   $('organicTop10ShowImport').hidden=source!=='organic';
   $('organicTop10Update').textContent=source==='api'?
    '↻ Atualizar Shopee':'↻ Recarregar relatório';
   $('organicTop10SourceBadge').textContent=source==='api'?
    '● VISUALIZAÇÕES GERAIS · PODEM INCLUIR ADS':
    '● ORGÂNICO · RELATÓRIO EXCLUSIVO SEM ADS';
   $('organicTop10Title').textContent=source==='api'?
    'TOP 10 · Visualizações Shopee':'TOP 10 · Desempenho Orgânico';
   $('organicTop10Subtitle').textContent=source==='api'?
    'Acompanhe visualizações dos anúncios pelas medições oficiais Shopee. Por período, somente diferenças observadas após a primeira coleta.':
    'Métricas exclusivamente orgânicas por SKU, conforme relatório filtrado da Central do Vendedor.';
   $('organicTop10ViewsHeader').textContent=source==='api'?'Visualizações':'Impressões';
   if(!loading)void refresh();
  }
  async function refresh(){
   if(source==='api')return refreshApi();
   if(loading)return;
   loading=true;const serial=++loadSequence;
   notice('Carregando o ranking orgânico salvo, sem consultar métricas de Ads…');
   try{
    const response=await fetch('/api/shopee/organic/top10?'+
     new URLSearchParams({sort}),{credentials:'same-origin',cache:'no-store',
      headers:{Accept:'application/json'}});
    const data=await response.json().catch(()=>({}));
    if(serial!==loadSequence)return;
    if(!response.ok||data.ok!==true)throw Error(data.error||'Não foi possível ler os dados orgânicos.');
    last=data;
    if(!data.available){
     render([]);
     $('organicTop10Period').textContent='Período: sem relatório salvo';
     $('organicTop10Count').textContent='Dados orgânicos indisponíveis';
     $('organicTop10Footnote').textContent=
      'Nenhuma métrica orgânica foi importada. O sistema não usa indicadores de Shopee Ads ou adicionados ao carrinho como abandono.';
     notice('Nenhum relatório orgânico foi salvo nesta loja. Para mostrar produtos reais, importe o relatório de Informações Gerenciais, filtrado para tráfego sem Ads.');
     importBox.hidden=false;
     sorts.forEach(b=>b.disabled=b.dataset.sort!=='combined');
     return;
    }
    const items=data.list||[];
    const available=data.metadata?.metrics||{};
    $('organicTop10Period').textContent='Período: '+
     period(data.period?.start)+' a '+period(data.period?.end);
    $('organicTop10Count').textContent=
     items.length+' de '+number(data.rowCount)+' SKUs · atualizado em '+date(data.importedAt);
    $('organicTop10Footnote').textContent=
     'Fonte: relatório orgânico importado em '+date(data.importedAt)+
     '. Sem Shopee Ads. Adições ao carrinho não comprovam abandono; a porcentagem só aparece se a fonte informar ou permitir um cálculo com bases compatíveis. Campos ausentes = “—”.'+
     (data.catalogWarning?' '+data.catalogWarning:'');
    sorts.forEach(button=>{
     button.disabled=button.dataset.sort!=='combined'&&available[button.dataset.sort]!==true;
     button.setAttribute('aria-pressed',String(button.dataset.sort===sort));
    });
    status.hidden=true;
    render(items);
    // Importação opcional enquanto já há dados; não toma a tela inteira.
    if(importBox.dataset.open!=='manual')importBox.hidden=true;
   }catch(error){
    render([]);
    notice('Não foi possível carregar o ranking orgânico salvo: '+String(error.message||error)+
     '. As métricas de Ads não serão usadas.', 'error');
    $('organicTop10Count').textContent='Consulta indisponível';
    importBox.hidden=true;
   }finally{
    loading=false;
   }
  }
  function open({auto=false}={}){
   if(auto&&autoShown)return;
   if(auto)autoShown=true;
   if(visible)return;
   visible=true;focusBefore=document.activeElement;
   modal.hidden=false;document.body.classList.add('organic-top10-open');
   $('organicTop10Close').focus({preventScroll:true});
   void refresh();
  }
  function close(){
   if(!visible)return;
   visible=false;modal.hidden=true;
   document.body.classList.remove('organic-top10-open');
   if(focusBefore&&typeof focusBefore.focus==='function')
    focusBefore.focus({preventScroll:true});
  }
  $('organicTop10Close').addEventListener('click',close);
  modal.addEventListener('click',event=>{if(event.target===modal)close()});
  document.addEventListener('keydown',event=>{
   if(!visible)return;
   if(event.key==='Escape'){event.preventDefault();close();}
   if(event.key==='Tab'){
    const focusable=[...modal.querySelectorAll('button:not([disabled]):not([hidden]),input:not([disabled]):not([hidden])')]
     .filter(x=>x.getClientRects().length);
    if(!focusable.length)return;
    const first=focusable[0],last=focusable[focusable.length-1];
    if(event.shiftKey&&document.activeElement===first){event.preventDefault();last.focus();}
    else if(!event.shiftKey&&document.activeElement===last){event.preventDefault();first.focus();}
   }
  });
  $('organicTop10Open')?.addEventListener('click',()=>open());
  $('organicTop10Update').addEventListener('click',()=>{
   if(source==='api')void refreshApi({forceCollect:true});
   else void refresh();
  });
  $('organicTop10ModeApi').addEventListener('click',()=>setSource('api'));
  $('organicTop10ModeOrganic').addEventListener('click',()=>setSource('organic'));
  $('organicTop10ApiPeriods').addEventListener('click',event=>{
   const choice=event.target.closest('button[data-period]');
   if(!choice)return;
   apiPeriod=choice.dataset.period;
   for(const b of $('organicTop10ApiPeriods').querySelectorAll('button[data-period]'))
    b.setAttribute('aria-pressed',String(b===choice));
   $('organicTop10CustomRange').hidden=!['custom','day'].includes(apiPeriod);
   $('organicTop10ApiEnd').closest('label').hidden=apiPeriod==='day';
   if(apiPeriod!=='custom')void refreshApi();
  });
  $('organicTop10ApplyCustom').addEventListener('click',()=>void refreshApi());
  const dayInput=new Date();
  const localIso=d=>new Date(d.getTime()-d.getTimezoneOffset()*60000).toISOString().slice(0,10);
  $('organicTop10ApiEnd').value=localIso(dayInput);
  $('organicTop10ApiStart').value=localIso(new Date(dayInput.getTime()-6*86400000));
  $('organicTop10ApiEnd').max=localIso(dayInput);
  $('organicTop10ApiStart').max=localIso(dayInput);
  $('organicTop10ShowImport').addEventListener('click',()=>{
   importBox.hidden=false;importBox.dataset.open='manual';
   $('organicTop10File').focus();
  });
  $('organicTop10CancelImport').addEventListener('click',()=>{
   importBox.hidden=true;importBox.dataset.open='';
  });
  group.addEventListener('click',event=>{
   const button=event.target.closest('button[data-sort]');
   if(!button||button.disabled)return;
   sort=button.dataset.sort;
   sorts.forEach(x=>x.setAttribute('aria-pressed',String(x===button)));
   void refresh();
  });
  const localDate=d=>new Date(d.getTime()-d.getTimezoneOffset()*60000)
   .toISOString().slice(0,10);
  const end=new Date(),startDay=new Date();
  startDay.setDate(startDay.getDate()-29);
  $('organicTop10Start').value=localDate(startDay);
  $('organicTop10End').value=localDate(end);
  $('organicTop10Import').addEventListener('submit',async event=>{
   event.preventDefault();
   const button=$('organicTop10Upload');
   const note=$('organicTop10ImportNotice');
   const file=$('organicTop10File').files?.[0];
   if(!file){note.textContent='Selecione um relatório CSV/Excel.';return;}
   if(file.size>4_000_000){
    note.textContent='Arquivo maior que 4 MB. Exporte um período menor.';return;
   }
   if(!$('organicTop10OrganicConfirmed').checked){
    note.textContent='Confirme que as métricas são exclusivamente orgânicas.';return;
   }
   button.disabled=true;note.dataset.kind='info';
   note.textContent='Validando o período e os dados orgânicos…';
   try{
    const base64=await new Promise((resolve,reject)=>{
     const reader=new FileReader();
     reader.onerror=()=>reject(Error('Não foi possível ler o arquivo.'));
     reader.onload=()=>resolve(String(reader.result||'').split(',')[1]||'');
     reader.readAsDataURL(file);
    });
    const res=await fetch('/api/shopee/organic/top10/import',{
     method:'POST',credentials:'same-origin',
     headers:{'Content-Type':'application/json'},
     body:JSON.stringify({fileName:file.name,base64,
      periodStart:$('organicTop10Start').value,
      periodEnd:$('organicTop10End').value,
      organicConfirmed:true})
    });
    const data=await res.json().catch(()=>({}));
    if(!res.ok||data.ok!==true)throw Error(data.error||'Importação não confirmada.');
    note.textContent=number(data.rowCount)+' SKUs orgânicas salvas na loja.';
    note.dataset.kind='success';
    importBox.hidden=true;importBox.dataset.open='';
    sort='combined';
    void refresh();
   }catch(error){
    note.textContent=String(error.message||error);
    note.dataset.kind='error';
   }finally{button.disabled=false;}
  });
  // O evento vem APENAS depois de autenticação real da tela, tanto no
  // primeiro carregamento quanto após o login manual.
  window.addEventListener('ra:app-authorized',()=>open({auto:true}));
  if(!document.getElementById('app')?.classList.contains('hidden')&&
     document.getElementById('login')?.classList.contains('hidden'))
   open({auto:true});
  globalThis.RAOrganicTop10={open,refresh,close};
  $('organicTop10Update').textContent='↻ Atualizar Shopee';
 }
 if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',start,{once:true});
 else start();
})();
