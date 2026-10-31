const $=s=>document.querySelector(s);
async function json(url,opt={}){const r=await fetch(url,opt);const d=await r.json().catch(()=>({}));if(!r.ok)throw new Error(d.error||('HTTP '+r.status));return d;}
function fmtDate(v){if(!v)return '—';const n=Number(v);const d=Number.isFinite(n)&&n>1000000000?new Date(n*1000):new Date(v);return Number.isNaN(d.getTime())?String(v):d.toLocaleString('pt-BR');}
function debug(v){$('#output').textContent=typeof v==='string'?v:JSON.stringify(v,null,2);}
// Roteador do aplicativo SaaS. Cada setor tem URL própria sem desmontar os formulários,
 // preservando cálculos em andamento e os controles já conectados à API Shopee.
const APP_PAGES={
  overview:{slug:'inicio',title:'Painel inicial',group:'Visão geral',
    description:'Acompanhe as informações essenciais e tenha acesso rápido aos principais setores da sua loja na Shopee.'},
  products:{slug:'produtos',title:'Produtos e anúncios',group:'Operação',
    description:'Catálogo, variações, estoque e situação dos anúncios Shopee.'},
  kits:{slug:'kits',title:'Kits Inteligentes WeDrop',group:'Operação',
    description:'Pesquisa de oportunidades de kits por categoria, SKUs e custo WeDrop, lucro líquido e criação comercial com ChatGPT.'},
  optimizer:{slug:'otimizacao',title:'Otimização de anúncios',group:'Operação',
    description:'Localize o SKU, calcule preços, prepare descontos e faça a revisão completa do anúncio.'},
  pricing:{slug:'precificacao',title:'Precificação',group:'Otimização',
    description:'Margens, valores de anúncio e configurações de taxas editáveis da Shopee.'},
  discounts:{slug:'descontos',title:'Descontos preparados',group:'Operação',
    description:'Preço bruto e desconto recuperados da SKU já informada na Otimização.'},
  fiscal:{slug:'informacoes-fiscais',title:'Informações Fiscais',group:'Operação',
    description:'Conferência fiscal de cada SKU e atualização fiscal em lote na Shopee.'},
  orders:{slug:'pedidos',title:'Pedidos e vendas',group:'Operação',
    description:'Acompanhe pedidos, status, quantidades e desempenho do período.'},
  alerts:{slug:'envios',title:'Monitor de envios',group:'Operação',
    description:'Acompanhe prazos, prioridades e notificações de postagem.'},
  ads:{slug:'ads',title:'Shopee Ads',group:'Gestão',
    description:'Campanhas, impressões, cliques, CTR e eficiência dos anúncios.'},
  wedrop:{slug:'wedrop',title:'Fornecedor WeDrop',group:'Gestão',
    description:'Catálogo armazenado, custos de aquisição e correspondência por SKU.'},
  finance:{slug:'financeiro',title:'Financeiro Shopee',group:'Gestão',
    description:'Repasses, despesas informadas pela Shopee e saldo antes de Ads.'},
  settings:{slug:'configuracoes',title:'Integrações e ajustes',group:'Sistema',
    description:'Conexão oficial, testes e diagnóstico da API Shopee.'}
};
let activeAppPage='overview';
// Handoff Ads -> Otimização: pré-preenchimento não dispara consulta automática.
let optimizerAdsHandoffSku=null;
let adsReserveRequest=null;
let adsReserveAwaitDiscountSku=null;
function currentPageFromUrl(){
  const slug=decodeURIComponent(String(location.pathname||'').match(/^\/app\/([^/]+)\/?$/)?.[1]||'inicio');
  return Object.keys(APP_PAGES).find(k=>APP_PAGES[k].slug===slug)||'overview';
}
function setSidebarOpen(open){
  document.body?.classList?.toggle('sidebar-open',Boolean(open));
  $('#sidebarToggle').setAttribute('aria-expanded',String(Boolean(open)));
  $('#sidebarToggle').setAttribute('aria-label',open?'Fechar menu':'Abrir menu');
  $('#sidebarScrim').hidden=!open;
}
function setTab(name,{updateHistory=true,scroll=true}={}){
  if(!APP_PAGES[name])name='overview';
  if(name==='optimizer')kitOptimizerUnmount();
  const pendingAdsHandoff=name==='optimizer'&&Boolean(optimizerAdsHandoffSku);
  const pendingKitHandoff=name==='optimizer'&&Boolean(globalThis.__RA_KIT_OPTIMIZATION_HANDOFF);
  if(pendingAdsHandoff)optimizerAdsHandoffSku=null;
  const page=APP_PAGES[name];
  const pane=$('#tab-'+name);
  if(!pane)return;
  activeAppPage=name;
  document.body?.classList?.toggle?.('view-optimizer',name==='optimizer');
  document.body?.classList?.toggle?.('view-overview',name==='overview');
  document.body?.classList?.toggle?.('view-products',name==='products');
  document.body?.classList?.toggle?.('view-pricing',name==='pricing');
  document.body?.classList?.toggle?.('view-discounts',name==='discounts');
  document.body?.classList?.toggle?.('view-fiscal',name==='fiscal');
  document.body?.classList?.toggle?.('view-orders',name==='orders');
  document.body?.classList?.toggle?.('view-ads',name==='ads');
  if(name==='ads')queueMicrotask(()=>globalThis.RedeAdsSeoRefresh?.());
  document.body?.classList?.toggle?.('view-wedrop',name==='wedrop');
  document.body?.classList?.toggle?.('view-finance',name==='finance');
  document.body?.classList?.toggle?.('view-alerts',name==='alerts');
  const reportTabs=new Set(['ads','wedrop']);
  const reportMenu=$('#sidebarReports');
  if(reportMenu&&reportTabs.has(name))reportMenu.open=true;
  document.querySelectorAll('.nav-link[data-tab]').forEach(link=>{
    const selected=link.dataset.tab===name;
    link.classList.toggle('active',selected);
    if(selected)link.setAttribute('aria-current','page');
    else link.removeAttribute('aria-current');
  });
  document.querySelectorAll('.tabpane').forEach(paneItem=>{
    const selected=paneItem===pane;
    paneItem.classList.toggle('active',selected);
    paneItem.setAttribute('aria-hidden',String(!selected));
  });
  $('#pageGroup').textContent=page.group;
  $('#pageTitle').textContent=page.title;
  $('#pageDescription').textContent=page.description;
  $('#topbarSectionName').textContent=page.title;
  document.title=page.title+' · Rede Achados BR Shopee';
  const nextUrl='/app/'+page.slug;
  if(updateHistory&&location.pathname!==nextUrl&&typeof history!=='undefined')
    history.pushState({page:name},'',nextUrl);
  setSidebarOpen(false);
  if(name==='overview')void window.dashboardNewListingsLoad?.();
  if(name==='kits')void window.RAKitBuilderLoad?.();
  if(name==='wedrop'){refreshWeDropCoverage();loadWeDropSourceState();void loadWeDropSkuReview();}
  else if(name==='finance'){refreshWeDropCoverage();}
  else if(name==='orders')ordersEnsureLoaded();
  else if(name==='ads'){
    void adsPricingLoad();
    if(!adsLoadedOnce){adsLoadedOnce=true;void $('#loadAdsAutoBtn').click();}
  }
  else if(name==='optimizer'||name==='pricing'){
    if(name==='optimizer')void optimizerLoadSettings();
    void shPriceLoadDefaults().then(()=>{
      // Não restaurar SKU/preço da sessão anterior ao receber uma SKU da campanha Ads.
      if(pendingAdsHandoff||pendingKitHandoff)return;
      if(!shPriceSelection){
        shPriceSelection=shPriceRestoredSelection();
        if(shPriceSelection)$('#optimizerSku').value=shPriceSelection.sku;
      }
      if(shPriceSelection){
        pricingShowSelection(shPriceSelection);
        if(!shPriceCurrentQuote)void shPricePrepare({silent:true});
      }
    });
  }
  else if(name==='discounts'){void shDiscountLoadLatest();}
  if(scroll&&typeof window!=='undefined')window.scrollTo({top:0,behavior:'instant'});
}
document.querySelectorAll('.nav-link[data-tab]').forEach(link=>{
  link.addEventListener('click',event=>{
    if(event.metaKey||event.ctrlKey||event.shiftKey||event.altKey||event.button!==0)return;
    event.preventDefault();setTab(link.dataset.tab);
  });
});
document.querySelectorAll('[data-go]').forEach(link=>{
  link.addEventListener('click',event=>{
    event.preventDefault();setTab(link.dataset.go);
  });
});
// Profundidade responsiva discreta, restrita aos 8 cards interativos.
 // Não manipula dados, não executa chamadas à API e respeita movimento reduzido.
function enableCardMicroInteractions(){
  const allowed=typeof window!=='undefined'&&typeof window.matchMedia==='function'&&
    window.matchMedia('(hover:hover) and (pointer:fine)').matches&&
    !window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  if(!allowed)return;
  document.querySelectorAll('.interactive-tilt').forEach(card=>{
    if(typeof card.addEventListener!=='function')return;
    card.addEventListener('pointermove',event=>{
      const box=card.getBoundingClientRect();
      if(!box.width||!box.height)return;
      const px=Math.max(-1,Math.min(1,((event.clientX-box.left)/box.width-.5)*2));
      const py=Math.max(-1,Math.min(1,((event.clientY-box.top)/box.height-.5)*2));
      card.style.setProperty('--rx',(-py*1.9).toFixed(2)+'deg');
      card.style.setProperty('--ry',(px*2.1).toFixed(2)+'deg');
    },{passive:true});
    const reset=()=>{
      card.style.removeProperty('--rx');
      card.style.removeProperty('--ry');
    };
    card.addEventListener('pointerleave',reset);
    card.addEventListener('pointercancel',reset);
    card.addEventListener('blur',reset);
  });
}
enableCardMicroInteractions();
if(typeof window!=='undefined')window.addEventListener('popstate',()=>setTab(currentPageFromUrl(),{updateHistory:false}));
$('#sidebarToggle').onclick=()=>setSidebarOpen(!document.body?.classList?.contains('sidebar-open'));
$('#sidebarScrim').onclick=()=>setSidebarOpen(false);
if(typeof document.addEventListener==='function')document.addEventListener('keydown',event=>{
  if(event.key==='Escape'&&document.body?.classList?.contains('sidebar-open'))setSidebarOpen(false);
});
$('#logoutBtn').onclick=async()=>{
  const button=$('#logoutBtn');button.disabled=true;
  try{await json('/api/logout',{method:'POST'});location.replace('/app/inicio');}
  catch(e){button.disabled=false;alert('Não foi possível sair: '+e.message);}
};

async function boot(){
  const a=await json('/api/auth-state');
  if(a.locked&&!a.loggedIn){$('#login').classList.remove('hidden');return;}
  $('#app').classList.remove('hidden');await loadStatus();loadCatalogCache();setTab(currentPageFromUrl(),{updateHistory:false,scroll:false});
}
async function loadStatus(){
  try{
    const s=await json('/api/shopee/status');
    $('#connTitle').textContent=s.connected?'Shopee conectada':'Shopee ainda não conectada';
    $('#connMeta').textContent=`Partner ID: ${s.partnerId||'-'} · Shop ID: ${s.connected?s.shopId:'aguardando autorização Live'} · API: ${s.apiHost||'-'}`;
    $('#mConnection').textContent=s.connected?'Conectada':'Pendente';
    $('#mShop').textContent=s.connected?s.shopId:'—';
    $('#mMode').textContent=(s.mode||'—').toUpperCase();
    $('#mStorage').textContent=s.storage?.supabaseConfigured?'Supabase':'Local';
    const connected=Boolean(s.connected),mode=String(s.mode||'').toUpperCase();
    $('#heroConnectedLabel').textContent=connected?'Loja conectada':'Loja não conectada';
    $('#heroConnectedHint').textContent=connected?'Autorização Shopee ativa':'Verifique a integração';
    $('#heroEnvironmentLabel').textContent=mode?'Ambiente '+mode:'Ambiente não informado';
    $('#heroEnvironmentHint').textContent=mode==='LIVE'?'Configuração de produção':'Consulte a configuração';
    $('#heroApiLabel').textContent=connected?'API conectada':'API pendente';
    $('#heroApiHint').textContent=connected?'Status confirmado nesta consulta':'Conexão não confirmada';
    $('#heroConnectedLabel')?.closest?.('.dashboard-hero-status-card')?.classList?.toggle?.('is-unavailable',!connected);
    $('#heroApiLabel')?.closest?.('.dashboard-hero-status-card')?.classList?.toggle?.('is-unavailable',!connected);
    $('#dashboardLastChecked').textContent='Atualizado às '+new Date().toLocaleTimeString('pt-BR',{hour:'2-digit',minute:'2-digit'});
    $('#statusPill').textContent=s.connected?'API conectada':'API pendente';
    $('#statusPill').classList.toggle('ok',Boolean(s.connected));
    $('#testBtn').disabled=!s.connected;
    $('#retryTestBtn').disabled=!s.connected;
    $('#refreshBtn').disabled=!s.connected;
    $('#signatureBtn').disabled=!s.configured||s.mode!=='live';
  }catch(e){
    $('#connTitle').textContent='Erro de configuração';$('#connMeta').textContent=e.message;
    $('#statusPill').textContent='Erro';$('#statusPill').classList.remove('ok');
    $('#mConnection').textContent='Indisponível';$('#mShop').textContent='—';
    $('#mMode').textContent='—';$('#mStorage').textContent='—';
    $('#heroConnectedLabel').textContent='Conexão indisponível';
    $('#heroConnectedHint').textContent='Não foi possível consultar a Shopee';
    $('#heroEnvironmentLabel').textContent='Ambiente indisponível';
    $('#heroEnvironmentHint').textContent='Consulta não concluída';
    $('#heroApiLabel').textContent='API não verificada';
    $('#heroApiHint').textContent='Tente atualizar a consulta';
    $('#heroConnectedLabel')?.closest?.('.dashboard-hero-status-card')?.classList?.add?.('is-unavailable');
    $('#heroApiLabel')?.closest?.('.dashboard-hero-status-card')?.classList?.add?.('is-unavailable');
    $('#dashboardLastChecked').textContent='Consulta indisponível';
  }
}
$('#dashboardRefreshStatus')?.addEventListener?.('click',async()=>{
  const button=$('#dashboardRefreshStatus');button.disabled=true;
  try{await loadStatus();if(activeAppPage==='overview')await window.dashboardNewListingsLoad?.(true);}
  finally{button.disabled=false}
});
$('#loginBtn').onclick=async()=>{try{await json('/api/login',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({password:$('#password').value})});$('#login').classList.add('hidden');$('#app').classList.remove('hidden');await loadStatus();loadCatalogCache();setTab(currentPageFromUrl(),{updateHistory:false,scroll:false});}catch(e){$('#loginMsg').textContent=e.message;}};
$('#connectBtn').onclick=()=>location.href='/auth/shopee/start';
$('#signatureBtn').onclick=async()=>{
  const btn=$('#signatureBtn'),notice=$('#signatureNotice');
  const oldLabel=btn.textContent;
  btn.disabled=true;btn.textContent='Verificando...';
  notice.hidden=false;notice.textContent='Consultando a autenticação oficial Shopee com segurança...';
  try{
    const result=await json('/api/shopee/signature-diagnostic',{method:'POST'});
    const summary=(result.results||[]).map(x=>{
      const option=x.format==='as_configured'?'Chave configurada':'Teste sem prefixo shpk';
      const status=x.classification==='wrong_sign'?'Rejeitada: Wrong sign'
        :x.classification==='authorization_redirect'?'Redirecionamento de autorização'
        :x.classification==='authorization_page'?'Página de autorização recebida'
        :x.classification==='network_error'?'Falha de rede'
        :x.classification==='different_api_error'?'Outro erro da Shopee'
        :'Resultado inconclusivo';
      return option+': '+status+(x.requestId?' (ID '+x.requestId+')':'');
    }).join(' · ');
    notice.textContent=summary+'. '+(result.recommendation||'');
    debug({mode:result.mode,partnerId:result.partnerId,keyHasShpkPrefix:result.keyHasShpkPrefix,results:result.results,recommendation:result.recommendation});
  }catch(e){notice.textContent='Diagnóstico indisponível: '+e.message;debug(e.message);}
  finally{btn.disabled=false;btn.textContent=oldLabel;}
};
// Um clique em "Testar loja" deve mostrar resposta mesmo com diagnóstico técnico fechado.
function showShopTestNotice(state,title,details){
  const box=$('#shopTestNotice');
  box.hidden=false;
  box.dataset.state=state;
  box.replaceChildren();
  const heading=document.createElement('strong');
  heading.textContent=title;
  const explanation=document.createElement('p');
  explanation.textContent=details;
  box.append(heading,explanation);
}
function shopTestAdvice(message){
  if(/(?:timed? ?out|timeout|AbortError|TimeoutError)/i.test(message))
    return 'A Shopee demorou para responder. Confira o proxy/conexão e clique em Repetir teste.';
  if(/(?:proxy|fetch failed|network|ECONN|ENOTFOUND|UND_ERR)/i.test(message))
    return 'Verifique a comunicação do serviço Shopee com a API e o proxy Oracle, depois repita.';
  if(/(?:error_sign|Wrong sign|sign inválid)/i.test(message))
    return 'A Shopee recusou a assinatura desta chamada. Confira a Live Partner Key e o Partner ID.';
  if(/(?:token|401|unauthorized|expired|invalid_auth|auth_failed)/i.test(message))
    return 'A autorização pode estar inválida ou vencida. Confira a conexão antes de renovar ou reconectar.';
  if(/(?:403|permission|denied|forbidden)/i.test(message))
    return 'Confira as permissões de leitura da loja no aplicativo da Shopee Open Platform.';
  return 'Confira a mensagem de erro. Você pode repetir o teste sem perder a autorização da loja.';
}
async function runShopTest(){
  const button=$('#testBtn'), retry=$('#retryTestBtn');
  if(button.disabled)return;
  button.disabled=true;
  retry.hidden=true;
  button.textContent='Testando...';
  showShopTestNotice('loading','Verificando comunicação com a Shopee...',
    'Consultando as informações oficiais da loja. Aguarde até 30 segundos.');
  try{
    const result=await json('/api/shopee/test-shop',{signal:AbortSignal.timeout(30000)});
    if(result.ok!==true)throw new Error(result.error||'A Shopee não confirmou o teste.');
    const shop=result.response&&typeof result.response==='object'?result.response:result;
    const shopId=Number(result.shopId||shop.shop_id||0);
    const name=String(shop.shop_name||shop.shopName||'').trim();
    const region=String(shop.region||shop.country||'').trim();
    const label=name?'Loja: '+name+' · ':'';
    const regionLabel=region?' · Região: '+region:'';
    showShopTestNotice('success','Loja consultada com sucesso!',
      label+'Shop ID: '+(shopId||'não informado')+regionLabel+
      '. A chamada oficial get_shop_info respondeu com sucesso.');
    debug({ok:true,shopId,shopName:name||null,region:region||null,testedAt:new Date().toISOString()});
  }catch(error){
    const message=error?.name==='TimeoutError'
      ?'Tempo limite de 30 segundos atingido.'
      :String(error?.message||'Falha desconhecida ao consultar a loja.');
    showShopTestNotice('error','Falha ao testar a loja',message+' '+shopTestAdvice(message));
    debug({ok:false,error:message,testedAt:new Date().toISOString()});
  }finally{
    button.disabled=false;
    button.textContent='Testar loja';
    retry.hidden=false;
    retry.disabled=false;
  }
}
$('#testBtn').onclick=runShopTest;
$('#retryTestBtn').onclick=runShopTest;
$('#refreshBtn').onclick=async()=>{try{const d=await json('/api/shopee/refresh',{method:'POST'});debug(d);await loadStatus();}catch(e){debug(e.message);}};

// Inventário Shopee: carregamento incremental, retomada e dados verificáveis.
const CATALOG_API_STATUSES=['NORMAL','UNLIST','BANNED','REVIEWING'];
const catalogMap=new Map();
let catalogCacheLoaded=false;
async function loadCatalogCache(){
  if(catalogCacheLoaded||catalogBusy)return;
  try{
    const data=await json('/api/shopee/catalog/cache',{signal:AbortSignal.timeout(15000)});
    if(catalogBusy)return;
    catalogCacheLoaded=true;
    if(data.configured&&Array.isArray(data.items)){
      catalogCachedAt=data.lastSavedAt||null;
      for(const x of data.items){
        if(x.itemId&&!catalogMap.has(x.itemId))catalogMap.set(x.itemId,x);
      }
      catalogRender();
      if(data.items.length){
        $('#productsSummary').dataset.state='warning';
        $('#productsSummary').textContent='Histórico carregado do Supabase: '+data.items.length+
          ' anúncios. A sincronização atual ainda não foi concluída.';
        setCatalogHeadline('Histórico recuperado (não sincronizado)');
        catalogHistoryUpdate();
      }
    }
  }catch(error){
    catalogCacheLoaded=false;
    // A falha de cache não impede a consulta direta à Shopee.
    debug({catalogCache:'indisponível',error:String(error.message||error)});
  }
}
let catalogProgress={statusIndex:0,offset:0,page:0};
let catalogBusy=false,catalogStop=false,catalogDone=false,catalogRowsLimit=10;
let catalogCurrentPage=1,catalogPageSize=10,catalogQuickFilter='all';
let catalogCachedAt=null,catalogLastSyncAt=null,catalogScannedIds=new Set();
let catalogDiscountAudit=null,catalogDiscountAuditBusy=false;
let catalogPriceBusy=false,catalogPriceAllBusy=false,catalogPriceStop=false;
const catalogPriceAttempted=new Set();
let catalogProblems=[];
const catalogMoney=n=>n===null||n===undefined?'—':new Intl.NumberFormat('pt-BR',{style:'currency',currency:'BRL'}).format(n);
const catalogNumber=n=>n===null||n===undefined?'—':new Intl.NumberFormat('pt-BR').format(n);
const catalogCsvProtect=v=>{
  const value=String(v??'');
  const safe=/^\s*[=+\-@]/.test(value)?"'"+value:value;
  return '"'+safe.replaceAll('"','""')+'"';
};
function catalogAll(){
  return [...catalogMap.values()];
}
function catalogFiltered(){
  const q=$('#productsSearch').value.trim().toLocaleLowerCase('pt-BR');
  const status=$('#productsStatusFilter').value;
  const sort=$('#productsSort').value;
  const result=catalogAll().filter(x=>{
    const advanced=$('#catalogDetailFilter').value;
    const minimum=$('#catalogPriceMin').value.trim(),maximum=$('#catalogPriceMax').value.trim();
    const price=Number(x.price);
    return (status==='ALL'||x.status===status)&&
      (!q||[x.itemId,x.sku,x.title].some(v=>String(v||'').toLocaleLowerCase('pt-BR').includes(q)))&&
      (catalogQuickFilter==='all'
       ||catalogQuickFilter==='active'&&x.status==='NORMAL'
       ||catalogQuickFilter==='inactive'&&x.status==='UNLIST'
       ||catalogQuickFilter==='noSku'&&x.baseLoaded&&!String(x.sku||'').trim()
       ||catalogQuickFilter==='stockZero'&&x.baseLoaded&&x.stock===0
       ||catalogQuickFilter==='promotion'&&catalogPromotionView(x).kind==='active'
       ||catalogQuickFilter==='discountMissing'&&catalogPromotionView(x).kind==='missing')&&
      (advanced==='any'
       ||advanced==='complete'&&x.baseLoaded
       ||advanced==='incomplete'&&!x.baseLoaded
       ||advanced==='variations'&&x.baseLoaded&&x.hasModel
       ||advanced==='stockUnknown'&&x.stock==null)&&
      (!minimum||(x.baseLoaded&&x.price!=null&&Number.isFinite(price)&&price>=Number(minimum)))&&
      (!maximum||(x.baseLoaded&&x.price!=null&&Number.isFinite(price)&&price<=Number(maximum)));
  });
  if(sort==='name')result.sort((a,b)=>String(a.title||'').localeCompare(String(b.title||''),'pt-BR'));
  else if(sort==='title_desc')result.sort((a,b)=>String(b.title||'').localeCompare(String(a.title||''),'pt-BR'));
  else if(sort==='stock')result.sort((a,b)=>(a.stock??Infinity)-(b.stock??Infinity));
  else if(sort==='price')result.sort((a,b)=>(a.price??Infinity)-(b.price??Infinity));
  else result.sort((a,b)=>(b.updateTime||0)-(a.updateTime||0));
  return result;
}
function setCatalogHeadline(value){
  const node=$('#catalogSyncHeadline');if(node)node.textContent=value;
}
function catalogHistoryUpdate(){
  const total=catalogAll().length;
  const local=catalogLastSyncAt;
  const cached=catalogCachedAt;
  const savedText=cached?'Última gravação no Supabase: '+
    new Date(cached).toLocaleString('pt-BR',{timeZone:'America/Sao_Paulo'}):'';
  $('#catalogSyncLastSaved').textContent=catalogDone&&local?
    'Sincronização desta sessão concluída em '+new Date(local).toLocaleString('pt-BR',{timeZone:'America/Sao_Paulo'}):
    savedText;
  $('#catalogHistorySummary').textContent=total+' anúncios carregados. '+
    (catalogDone?'Todas as situações foram percorridas nesta sessão.':
      catalogBusy?'Sincronização em andamento.':
      'Consulta parcial ou dados em cache; não interpretar como catálogo completo.');
  $('#catalogHistorySource').textContent=cached?
    savedText+' (registro de cache não comprova a conclusão do catálogo).':
    'Sem data de cache disponível. Sincronize para consultar a Shopee.';
  $('#catalogHistoryIssues').textContent=catalogProblems.length?
    'Ocorrências recentes: '+catalogProblems.slice(-5).join(' | '):'Nenhuma ocorrência relatada nesta sessão.';
}
function catalogResetPage(){catalogCurrentPage=1;catalogRender();}
function catalogSyncFilterChips(){
  document.querySelectorAll('[data-catalog-filter]').forEach(btn=>{
    const selected=btn.dataset.catalogFilter===catalogQuickFilter;
    btn.classList.toggle('selected',selected);
    btn.setAttribute('aria-pressed',String(selected));
  });
}
function catalogPageButtons(totalPages){
  const container=$('#catalogPages');container.replaceChildren();
  const page=catalogCurrentPage;
  const create=(label,number,isCurrent=false)=>{
    const btn=document.createElement('button');btn.type='button';
    btn.className='catalog-page-button'+(isCurrent?' selected':'');
    btn.textContent=String(label);btn.disabled=isCurrent;
    btn.setAttribute('aria-label','Página '+number);
    if(isCurrent)btn.setAttribute('aria-current','page');
    btn.onclick=()=>{catalogCurrentPage=number;catalogRender();};
    container.append(btn);
  };
  const nums=new Set([1,totalPages]);
  for(let i=Math.max(1,page-1);i<=Math.min(totalPages,page+1);i++)nums.add(i);
  let last=0;
  for(const number of [...nums].filter(n=>n>0).sort((a,b)=>a-b)){
    if(last&&number-last>1){
      const span=document.createElement('span');span.className='catalog-pages-ellipsis';
      span.textContent='…';container.append(span);
    }
    create(number,number,number===page);last=number;
  }
}
function catalogStatusBadge(item){
  const status=String(item.status||'').toUpperCase();
  const labels={NORMAL:'NORMAL',UNLIST:'INATIVO',BANNED:'BLOQUEADO',REVIEWING:'EM ANÁLISE'};
  const kind={NORMAL:'normal',UNLIST:'inactive',BANNED:'blocked',REVIEWING:'reviewing'};
  const badge=document.createElement('span');
  badge.className='catalog-status-badge catalog-status-'+(kind[status]||'unknown');
  badge.textContent=labels[status]||'NÃO CONFIRMADO';
  return badge;
}
function catalogOpenSeller(item){
  const itemId=String(item.itemId||'').trim();
  if(!/^[1-9][0-9]{0,17}$/.test(itemId))return;
  window.open('https://seller.shopee.com.br/portal/product/'+encodeURIComponent(itemId)+'?pageEntry=product_list',
    '_blank','noopener,noreferrer');
}
function catalogCell(tr,value){
  const td=document.createElement('td');td.textContent=String(value??'—');tr.appendChild(td);return td;
}
function catalogPriceIsMissing(item){
 return item.price==null||!Number.isFinite(Number(item.price))||Number(item.price)<=0;
}
function catalogPriceText(item){
 if(catalogPriceIsMissing(item))return catalogPriceBusy&&catalogPriceAttempted.has(String(item.itemId))
  ?'Consultando preço...':'Preço a consultar';
 // Divide o rótulo e o valor em duas linhas, sem perder centavos ou o preço completo.
 if(item.hasModel)return 'A partir de\n'+catalogMoney(item.price);
 return catalogMoney(item.price);
}
function catalogPriceStatus(message,state='info'){
 const status=$('#catalogPriceRecoveryStatus');if(!status)return;
 status.textContent=message;status.dataset.state=state;
}
async function catalogRecoverPriceBatch(ids){
 catalogPriceBusy=true;
 for(const id of ids)catalogPriceAttempted.add(String(id));
 try{
  const response=await json('/api/shopee/catalog/prices/recover',{
   method:'POST',headers:{'Content-Type':'application/json'},
   body:JSON.stringify({itemIds:ids}),signal:AbortSignal.timeout(90000)
  });
  let updated=0;
  for(const entry of response.verified||[]){
   const old=catalogMap.get(String(entry.itemId));
   if(!old||catalogPriceIsMissing(entry))continue;
   catalogMap.set(String(entry.itemId),{...old,price:entry.price,
    priceMax:entry.priceMax??entry.price,priceSource:entry.priceSource||'item_current_price',
    hasModel:entry.hasModel,baseLoaded:true});
   updated++;
  }
  if(response.persistence?.warning)
   catalogPriceStatus('Preços consultados, mas houve problema ao salvar no histórico: '+response.persistence.warning,'warning');
  return {updated,warnings:response.warnings||[]};
 }finally{catalogPriceBusy=false;catalogRender();}
}
async function catalogRecoverVisiblePrices(){
 if(catalogBusy||catalogPriceBusy||catalogPriceAllBusy)return;
 const filtered=catalogFiltered();
 const visible=filtered.slice((catalogCurrentPage-1)*catalogPageSize,catalogCurrentPage*catalogPageSize);
 const ids=visible.filter(x=>catalogPriceIsMissing(x)&&!catalogPriceAttempted.has(String(x.itemId)))
  .map(x=>String(x.itemId)).slice(0,10);
 if(!ids.length)return;
 try{
  const outcome=await catalogRecoverPriceBatch(ids);
  const remaining=catalogAll().filter(catalogPriceIsMissing).length;
  catalogPriceStatus('Recuperação automática: '+outcome.updated+' preço(s) confirmado(s) pela Shopee nesta página. '+
   remaining+' anúncio(s) ainda precisam de conferência.'+
   (outcome.warnings.length?' Alguns modelos não retornaram valores.':''),outcome.warnings.length?'warning':'info');
 }catch(error){
  catalogPriceStatus('A consulta de preços da página falhou: '+error.message+
   '. Você pode tentar novamente em Recuperar preços faltantes.','warning');
 }
}
async function catalogRecoverAllPrices(){
 if(catalogPriceAllBusy)return;
 catalogPriceAllBusy=true;catalogPriceStop=false;
 const button=$('#catalogRecoverPrices');button.textContent='Interromper recuperação';
 button.disabled=false;
 const missing=catalogAll().filter(catalogPriceIsMissing).map(x=>String(x.itemId));
 for(const id of missing)catalogPriceAttempted.delete(id);
 let checked=0,found=0,unresolved=0;
 try{
  for(let i=0;i<missing.length&&!catalogPriceStop;i+=10){
   const ids=missing.slice(i,i+10);
   try{
    const result=await catalogRecoverPriceBatch(ids);
    checked+=ids.length;found+=result.updated;unresolved+=Math.max(0,ids.length-result.updated);
    catalogPriceStatus('Recuperação em andamento: '+checked+' de '+missing.length+
     ' anúncios conferidos; '+found+' preço(s) recuperado(s) e '+unresolved+
     ' ainda não confirmados.',result.warnings.length?'warning':'info');
   }catch(error){
    catalogPriceStatus('Recuperação interrompida por falha na consulta: '+error.message+
     '. '+found+' preços foram recuperados; tente novamente depois.','error');
    break;
   }
  }
  if(!catalogPriceStop&&checked===missing.length)
   catalogPriceStatus('Recuperação concluída: '+found+' preço(s) recuperado(s). '+
    unresolved+' anúncio(s) ainda não tiveram preço confirmado pela Shopee. '+
    'Nenhum valor foi alterado na loja.',unresolved?'warning':'success');
  else if(catalogPriceStop)
   catalogPriceStatus('Recuperação interrompida a pedido. '+found+' preço(s) já recuperado(s) foram preservados.','warning');
 }finally{
  catalogPriceAllBusy=false;button.textContent='Recuperar preços faltantes';
  catalogRender();
 }
}
$('#catalogRecoverPrices')?.addEventListener('click',()=>{
 if(catalogPriceAllBusy){catalogPriceStop=true;return;}
 void catalogRecoverAllPrices();
});
function catalogPromotionView(item){
 const read=catalogDiscountAudit?.items?.[String(item.itemId)];
 if(read?.kind==='active')return {kind:'active',text:read.text||'Desconto ativo',note:read.note||'Minha Promoção confirmada'};
 if(read?.kind==='scheduled')return {kind:'scheduled',text:'Programado',note:read.note||'Desconto programado'};
 if(read?.kind==='missing'&&catalogDiscountAudit?.complete===true&&item.baseLoaded)
  return {kind:'missing',text:'Fora da campanha',note:'Não consta em Minha Promoção ativa ou programada na auditoria completa.'};
 if(item.baseLoaded&&item.promotion===true)
  return {kind:'generic',text:'Promoção sinalizada',note:'A Shopee sinaliza promoção genérica, mas isso não comprova desconto em Minha Promoção.'};
 return {kind:'unknown',text:'A verificar',note:item.promotionCached?'Registro antigo em cache, requer nova conferência.':'Aguardando conferência em Minha Promoção.'};
}
function catalogRender(){
  const rows=catalogFiltered(),all=catalogAll();
  const size=catalogPageSize,totalPages=Math.max(1,Math.ceil(rows.length/size));
  catalogCurrentPage=Math.max(1,Math.min(catalogCurrentPage,totalPages));
  const pageRows=rows.slice((catalogCurrentPage-1)*size,catalogCurrentPage*size);
  const body=$('#productsBody');body.replaceChildren();
  for(const x of pageRows){
    const tr=document.createElement('tr');
    const product=document.createElement('td');
    const top=document.createElement('div');top.className='catalog-product-title';
    if(x.imageUrl&&/^https:\/\//i.test(x.imageUrl)){
      const img=document.createElement('img');img.src=x.imageUrl;img.alt='';
      img.loading='lazy';img.width=54;img.height=54;top.append(img);
    }else{
      const placeholder=document.createElement('span');
      placeholder.className='catalog-image-placeholder';placeholder.textContent='▣';
      placeholder.setAttribute('aria-label','Imagem não disponível');
      top.append(placeholder);
    }
    const title=document.createElement('span');title.className='catalog-product-info';
    const name=document.createElement('strong');name.textContent=x.title||'Nome não retornado pela Shopee';
    title.append(name);top.append(title);product.append(top);tr.append(product);
    const sku=catalogCell(tr,'');
    const skuId=document.createElement('span');skuId.className='catalog-item-id';
    skuId.textContent=String(x.itemId||'—')+' / '+(x.baseLoaded?(x.sku||'Sem SKU'):'SKU não confirmado');
    sku.replaceChildren(skuId);
    const copy=document.createElement('button');copy.type='button';copy.className='catalog-copy';
    copy.textContent='▢';copy.title='Copiar Item ID / SKU';copy.setAttribute('aria-label','Copiar identificador e SKU');
    copy.onclick=()=>{
      const value=String(x.itemId||'')+' / '+(x.sku||'Sem SKU');
      if(navigator?.clipboard?.writeText)navigator.clipboard.writeText(value).then(()=>{
        copy.textContent='✓';setTimeout(()=>copy.textContent='▢',1400);
      }).catch(()=>{copy.textContent='Copiar indisponível';});
    };
    sku.append(copy);
    const price=catalogCell(tr,catalogPriceText(x));price.className='catalog-value-price';
    if(x.hasModel&&!catalogPriceIsMissing(x)){
      const range=x.priceMax!=null&&Number(x.priceMax)>Number(x.price)
       ?catalogMoney(x.price)+' a '+catalogMoney(x.priceMax):'Variações disponíveis';
      price.title='Menor preço corrente confirmado na Shopee. '+range;
    }else if(catalogPriceIsMissing(x)){
      price.classList.add('is-pending');
      price.title='Preço não recuperado. Será consultado diretamente na API de produtos e variações.';
    }else price.title='Preço vigente informado pela Shopee';
    const promotion=catalogCell(tr,'');
    const promoBadge=document.createElement('span');
    const info=catalogPromotionView(x);
    promoBadge.className='catalog-promo-badge is-'+info.kind;
    promoBadge.textContent=info.text;
    promoBadge.title=info.note;
    promoBadge.setAttribute('aria-label',info.text+'. '+info.note);
    promotion.append(promoBadge);
    const stock=catalogCell(tr,x.stock===null||x.stock===undefined?'Não informado':catalogNumber(x.stock));
    stock.className='catalog-value-stock';
    const status=catalogCell(tr,'');status.append(catalogStatusBadge(x));
    const updated=catalogCell(tr,fmtDate(x.updateTime));updated.className='catalog-value-updated';
    const action=document.createElement('td');action.className='catalog-actions-cell';
    const b=document.createElement('button');b.type='button';b.className='mini catalog-details-button';
    b.textContent='Detalhes';b.onclick=()=>catalogShowModels(x);
    const menu=document.createElement('details');menu.className='catalog-row-menu';
    const summary=document.createElement('summary');
    summary.textContent='⋮';summary.title='Outras ações';
    summary.setAttribute('aria-label','Outras ações do anúncio');menu.append(summary);
    const options=document.createElement('div');options.className='catalog-row-options';
    const seller=document.createElement('button');seller.type='button';seller.textContent='Abrir na Shopee';
    seller.onclick=()=>catalogOpenSeller(x);options.append(seller);
    const optimize=document.createElement('button');optimize.type='button';
    optimize.textContent='Abrir otimização';
    optimize.onclick=()=>{
      menu.open=false;setTab('optimizer');
      void shPriceLoadDefaults().catch(()=>{}).then(()=>{
        if(x.sku)$('#optimizerSku').value=x.sku;
        $('#optimizerSku')?.focus?.();
      });
    };
    options.append(optimize);
    if(catalogPromotionView(x).kind==='missing'&&String(x.sku||'').trim()){
      const review=document.createElement('button');review.type='button';
      review.textContent='Conferir e preparar desconto';
      review.onclick=()=>catalogReviewMissingDiscount(x);
      options.append(review);
    }
    menu.append(options);
    action.append(b,menu);tr.append(action);body.append(tr);
  }
  if(!rows.length){
    const tr=document.createElement('tr'),td=document.createElement('td');td.colSpan=8;
    td.textContent=catalogBusy?'Carregando anúncios da Shopee...':
      all.length?'Nenhum anúncio corresponde aos filtros.':'Nenhum anúncio carregado. Sincronize o catálogo.';
    tr.append(td);body.append(tr);
  }
  const active=all.filter(x=>x.status==='NORMAL').length;
  const inactive=all.filter(x=>x.status==='UNLIST').length;
  const noSku=all.filter(x=>x.baseLoaded&&!String(x.sku||'').trim()).length;
  const zero=all.filter(x=>x.baseLoaded&&x.stock===0).length;
  const knownSku=all.filter(x=>x.baseLoaded).length;
  const knownStock=all.filter(x=>x.stock!==null&&x.stock!==undefined).length;
  const kpi=(key,val,percent)=>{
    $('#catalog'+key).textContent=catalogNumber(val);
    const el=$('#catalog'+key+'Meta');
    if(el)el.textContent=percent;
  };
  kpi('Total',all.length,catalogDone?'Catálogo percorrido':'Dados carregados');
  kpi('Active',active,all.length?(active/all.length*100).toLocaleString('pt-BR',{maximumFractionDigits:1})+'%':'—');
  kpi('Unlisted',inactive,all.length?(inactive/all.length*100).toLocaleString('pt-BR',{maximumFractionDigits:1})+'%':'—');
  kpi('NoSku',noSku,knownSku?(noSku/knownSku*100).toLocaleString('pt-BR',{maximumFractionDigits:1})+'% dos verificados':'Não verificado');
  kpi('StockZero',zero,knownStock?(zero/knownStock*100).toLocaleString('pt-BR',{maximumFractionDigits:1})+'% dos verificados':'Não verificado');
  $('#catalogResultCount').textContent=catalogNumber(rows.length)+' anúncio(s)';
  const first=rows.length?(catalogCurrentPage-1)*size+1:0;
  const last=Math.min(rows.length,catalogCurrentPage*size);
  $('#productsRowsShown').textContent='Exibindo '+first+'–'+last+' de '+rows.length+
    ' filtrados · '+all.length+' carregados'+(catalogDone?' (sincronização concluída)':' (catálogo possivelmente parcial)');
  $('#catalogPrevPage').disabled=catalogCurrentPage<=1;
  $('#catalogNextPage').disabled=catalogCurrentPage>=totalPages;
  catalogPageButtons(totalPages);
  $('#productsMoreBtn').hidden=true;
  $('#exportProductsBtn').disabled=!all.length;
  catalogSyncFilterChips();
  catalogHistoryUpdate();
  const pending=all.filter(catalogPriceIsMissing).length;
  const caption=$('#catalogPriceRecoveryCount');
  if(caption)caption.textContent=pending+' anúncio(s) sem preço confirmado de '+all.length+' carregados.';
  const button=$('#catalogRecoverPrices');
  if(button&&!catalogPriceAllBusy)button.disabled=!pending||catalogBusy;
  if(pending&&!catalogBusy&&!catalogPriceBusy&&!catalogPriceAllBusy)
    queueMicrotask(()=>void catalogRecoverVisiblePrices());
}
function catalogReviewMissingDiscount(item){
 if(!String(item.sku||'').trim())return;
 setTab('optimizer');
 const field=$('#optimizerSku');if(field){field.value=String(item.sku);field.focus();}
 const info=$('#optimizerStatus');
 if(info)info.textContent='SKU '+item.sku+': confira custo WeDrop, preço bruto, desconto e campanha antes de executar. Nenhuma alteração foi aplicada.';
}
async function catalogAuditDiscounts(){
 if(catalogDiscountAuditBusy)return;
 const button=$('#catalogAuditPromotions'),status=$('#catalogAuditStatus');
 const ids=catalogAll().filter(x=>x.baseLoaded).map(x=>String(x.itemId)).filter(x=>/^[1-9][0-9]{0,17}$/.test(x));
 if(!ids.length){status.textContent='Sincronize os anúncios antes de auditar descontos.';return;}
 catalogDiscountAuditBusy=true;button.disabled=true;button.textContent='Conferindo...';
 status.textContent='Lendo campanhas ativas e programadas da Shopee. Consulta sem qualquer alteração.';
 try{
  const response=await json('/api/shopee/catalog/discount-audit',{
   method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({itemIds:ids}),
   signal:AbortSignal.timeout(175000)
  });
  catalogDiscountAudit={complete:response.complete===true,items:response.items||{},verifiedAt:response.verifiedAt};
  catalogRender();
  const results=Object.values(catalogDiscountAudit.items);
  const active=results.filter(x=>x.kind==='active').length;
  const scheduled=results.filter(x=>x.kind==='scheduled').length;
  const missing=results.filter(x=>x.kind==='missing').length;
  const checkedCampaigns=Number(response.scannedCampaigns||0);
  const foundCampaigns=Number(response.campaignsFound||0);
  if(response.complete!==true&&checkedCampaigns===0){
   status.textContent='Auditoria inconclusiva: nenhuma campanha pôde ser detalhada.'+
    (response.warning?' Motivo: '+response.warning:'')+
    ' Não é possível afirmar que anúncios estejam sem desconto.';
  }else{
   status.textContent='Auditoria '+(response.complete?'concluída':'parcial')+
    ': '+active+' com desconto ativo confirmado, '+scheduled+' programados. '+
    (response.complete?missing+' não localizados nas campanhas Minha Promoção.':
     'Demais anúncios não verificados; não significa ausência de desconto.')+
    ' Campanhas detalhadas: '+checkedCampaigns+' de '+foundCampaigns+'.'+
    (response.warning?' Aviso: '+response.warning:'')+
    ' Nenhuma promoção foi alterada.';
  }
  status.dataset.state=response.complete?'success':'warning';
 }catch(error){
  status.textContent='Falha de comunicação com a Shopee. Descontos NÃO verificados: '+
   error.message+'. Não conclua que qualquer anúncio esteja sem desconto. Nenhuma alteração feita.';
  status.dataset.state='error';
 }finally{catalogDiscountAuditBusy=false;button.disabled=false;button.textContent='Conferir descontos na Shopee';}
}
$('#catalogAuditPromotions')?.addEventListener('click',()=>void catalogAuditDiscounts());
function catalogSummaryText(prefix=''){
  const all=catalogAll();
  const unknown=all.filter(x=>!x.baseLoaded).length;
  const state=catalogDone?(catalogProblems.length?'Listagem concluída com ressalvas':'Listagem concluída'):catalogBusy?'Em andamento':'Parcial';
  const notice=$('#productsSummary');
  notice.dataset.state=catalogProblems.length?'warning':catalogDone?'success':catalogBusy?'loading':'warning';
  notice.textContent=(prefix?prefix+' · ':'')+all.length+' anúncios carregados; '+
    unknown+' sem detalhes.'+(catalogProblems.length?' '+catalogProblems.length+' aviso(s) para conferir.':'');
  setCatalogHeadline(catalogBusy?'Sincronização em andamento':
    catalogDone?(catalogProblems.length?'Sincronização com ressalvas':'Catálogo sincronizado nesta sessão'):
    'Sincronização incompleta — pode continuar');
  catalogHistoryUpdate();
}
async function catalogShowModels(item){
  const panel=$('#productDetailsPanel');panel.hidden=false;
  // O painel de variações fica antes da lista. Levar o usuário até o resultado
  // para que o clique em Detalhes não pareça inoperante após dezenas de cards.
  panel.scrollIntoView?.({behavior:'smooth',block:'start'});
  panel.focus?.({preventScroll:true});
  $('#productDetailsTitle').textContent=item.title||'Anúncio '+item.itemId;
  const body=$('#productModelsBody');body.replaceChildren();
  const status=$('#productDetailsStatus');
  status.textContent='Item '+item.itemId+' · SKU: '+(item.sku||'não informado')+
    ' · Preço: '+catalogMoney(item.price)+' · Estoque: '+catalogNumber(item.stock);
  if(!item.baseLoaded){
    status.textContent+=' · Dados básicos ainda não confirmados. Sincronize o catálogo antes de concluir que não há variações.';
    return;
  }
  if(!item.hasModel){
    status.textContent+=' · Anúncio sem variações, conforme a Shopee.';
    return;
  }
  status.textContent='Carregando variações e estoques do item '+item.itemId+'...';
  try{
    const d=await json('/api/shopee/catalog/models?item_id='+encodeURIComponent(item.itemId),
      {signal:AbortSignal.timeout(30000)});
    const models=Array.isArray(d.models)?d.models:[];
    status.textContent='Variações retornadas: '+models.length+'. Valores obtidos da Shopee.';
    for(const m of models){
      const row=document.createElement('tr');
      [m.modelId,m.sku||'Sem SKU',m.status||'—',catalogMoney(m.price),catalogNumber(m.stock)]
        .forEach(v=>catalogCell(row,v));
      body.appendChild(row);
    }
  }catch(e){status.textContent='Falha ao buscar variações: '+e.message+'. Feche e tente novamente.';}
}
$('#closeProductDetails').onclick=()=>{$('#productDetailsPanel').hidden=true;};
async function catalogScan(){
  if(catalogBusy)return;
  if(catalogDone){
    catalogMap.clear();catalogDiscountAudit=null;
    catalogProgress={statusIndex:0,offset:0,page:0};
    catalogProblems=[];catalogDone=false;catalogScannedIds=new Set();catalogLastSyncAt=null;
  }
  if(catalogProgress.statusIndex===0&&catalogProgress.offset===0&&catalogProgress.page===0)
    catalogScannedIds=new Set();
  catalogBusy=true;catalogStop=false;
  const btn=$('#loadProductsBtn');btn.disabled=true;
  $('#catalogSyncButtonLabel').textContent='Sincronizando...';
  $('#stopProductsBtn').hidden=false;
  $('#stopProductsBtn').disabled=false;
  $('#stopProductsBtn').textContent='Interromper';
  try{
    while(catalogProgress.statusIndex<CATALOG_API_STATUSES.length&&!catalogStop){
      const st=CATALOG_API_STATUSES[catalogProgress.statusIndex];
      const offset=catalogProgress.offset;
      if(catalogProgress.page>=250){
        catalogProblems.push(st+': limite de 25.000 anúncios atingido. Confira o total antes de considerar completo.');
        break;
      }
      catalogSummaryText('Consultando '+st+', página '+(catalogProgress.page+1)+', offset '+offset+'.');
      let result;
      try{
        const query=new URLSearchParams({status:st,offset:String(offset),page_size:'50'});
        result=await json('/api/shopee/catalog/page?'+query,{signal:AbortSignal.timeout(65000)});
      }catch(error){
        catalogProblems.push(st+': '+String(error.message||error));
        // Estado de página é preservado para Retomar. Não marcar como completo.
        break;
      }
      for(const item of result.items||[]){
        if(item.itemId){catalogMap.set(item.itemId,item);catalogScannedIds.add(item.itemId);}
      }
      if(Array.isArray(result.warnings)&&result.warnings.length)
        catalogProblems.push(...result.warnings.map(x=>st+': '+x));
      if(result.persistence?.warning)
        catalogProblems.push('Persistência: '+result.persistence.warning);
      catalogProgress.page++;
      if(result.hasNext){
        if(!Number.isSafeInteger(Number(result.nextOffset))||Number(result.nextOffset)<=offset){
          catalogProblems.push(st+': paginação não avançou; tente novamente.');
          break;
        }
        catalogProgress.offset=Number(result.nextOffset);
      }else{
        catalogProgress={statusIndex:catalogProgress.statusIndex+1,offset:0,page:0};
      }
      catalogRender();
      catalogSummaryText('Consultando '+st+'.');
      await new Promise(resolve=>setTimeout(resolve,180));
    }
    catalogDone=catalogProgress.statusIndex>=CATALOG_API_STATUSES.length&&!catalogStop;
    if(catalogDone){
      for(const id of catalogMap.keys())if(!catalogScannedIds.has(id))catalogMap.delete(id);
      catalogLastSyncAt=new Date().toISOString();
    }
    catalogSummaryText(catalogStop?'Sincronização interrompida a pedido.':catalogDone?'Sincronização finalizada.':'Sincronização incompleta.');
  }finally{
    catalogBusy=false;btn.disabled=false;
    $('#catalogSyncButtonLabel').textContent=catalogDone?'Sincronizar novamente':'Continuar sincronização';
    $('#stopProductsBtn').hidden=true;
    catalogRender();
  }
}
$('#loadProductsBtn').onclick=catalogScan;
$('#stopProductsBtn').onclick=()=>{
  catalogStop=true;$('#stopProductsBtn').disabled=true;
  $('#stopProductsBtn').textContent='Interrompendo...';
};
$('#productsSearch').oninput=catalogResetPage;
$('#productsStatusFilter').onchange=()=>{catalogQuickFilter='all';catalogResetPage();};
$('#productsSort').onchange=catalogResetPage;
$('#catalogPageSize').onchange=()=>{
  catalogPageSize=Number($('#catalogPageSize').value)||10;
  catalogRowsLimit=catalogPageSize;catalogCurrentPage=1;catalogRender();
};
$('#catalogPrevPage').onclick=()=>{
  if(catalogCurrentPage>1){catalogCurrentPage--;catalogRender();}
};
$('#catalogNextPage').onclick=()=>{
  const count=Math.ceil(catalogFiltered().length/catalogPageSize);
  if(catalogCurrentPage<count){catalogCurrentPage++;catalogRender();}
};
for(const chip of document.querySelectorAll('[data-catalog-filter]')){
  chip.addEventListener('click',()=>{
    catalogQuickFilter=chip.dataset.catalogFilter;
    $('#productsStatusFilter').value='ALL';catalogResetPage();
  });
}
$('#catalogAdvancedToggle').onclick=()=>{
  const panel=$('#catalogAdvancedFilters');panel.hidden=!panel.hidden;
  $('#catalogAdvancedToggle').setAttribute('aria-expanded',String(!panel.hidden));
};
$('#catalogDetailFilter').onchange=catalogResetPage;
$('#catalogPriceMin').oninput=catalogResetPage;
$('#catalogPriceMax').oninput=catalogResetPage;
$('#catalogResetFilters').onclick=()=>{
  catalogQuickFilter='all';
  $('#productsSearch').value='';$('#productsStatusFilter').value='ALL';
  $('#productsSort').value='updated';$('#catalogDetailFilter').value='any';
  $('#catalogPriceMin').value='';$('#catalogPriceMax').value='';
  catalogResetPage();
};
$('#catalogHistoryToggle').onclick=()=>{
  const details=$('#catalogSyncHistory');
  details.open=!details.open;
  $('#catalogHistoryToggle').setAttribute('aria-expanded',String(details.open));
};
$('#productsMoreBtn').onclick=()=>{
  catalogCurrentPage=Math.min(catalogCurrentPage+1,Math.max(1,Math.ceil(catalogFiltered().length/catalogPageSize)));
  catalogRender();
};
$('#exportProductsBtn').onclick=()=>{
  const headers=['Item ID','SKU','Título','Status','Preço BRL','Estoque','Tem variações','Promoção','Atualização','Detalhes confirmados'];
  const data=catalogFiltered().map(x=>[x.itemId,x.sku,x.title,x.status,
    x.price??'',x.stock??'',x.hasModel?'Sim':'Não',catalogPromotionView(x).text,fmtDate(x.updateTime),x.baseLoaded?'Sim':'Não']);
  const csv='\uFEFF'+[headers,...data].map(row=>row.map(catalogCsvProtect).join(';')).join('\r\n');
  const url=URL.createObjectURL(new Blob([csv],{type:'text/csv;charset=utf-8'}));
  const anchor=document.createElement('a');anchor.href=url;anchor.download='shopee-catalogo-'+new Date().toISOString().slice(0,10)+'.csv';
  document.body.appendChild(anchor);anchor.click();anchor.remove();URL.revokeObjectURL(url);
};
catalogRender();


/* Pedidos v1.19.7: paginação real por cursor, janelas de até 14 dias, dados operacionais sem PII. */
let ordersLoaded=[],ordersCurrentPeriod=15,ordersCurrentStatus='ALL',
 ordersPage=1,ordersPageSize=10,ordersLoadedAt=null,ordersLoadedComplete=false,
 ordersBusy=false,ordersRequestId=0,ordersAbortController=null,ordersAutoLoaded=false;
const ORDERS_SHOPEE_COLORS={
 SHIPPED:'#3488ff',COMPLETED:'#18aa69',READY_TO_SHIP:'#ed9c28',
 PROCESSED:'#885dee',TO_CONFIRM_RECEIVE:'#21a8c8',UNPAID:'#a1adc1',
 IN_CANCEL:'#e87943',CANCELLED:'#e75564',CANCELED:'#e75564'
};
const ordersCurrency=value=>value===null||value===undefined||value===''||!Number.isFinite(Number(value))?
 'Não informado':new Intl.NumberFormat('pt-BR',{style:'currency',currency:'BRL'}).format(Number(value));
const ordersNum=value=>new Intl.NumberFormat('pt-BR').format(value);
const ordersStr=(value)=>String(value??'');
function ordersStatusMeta(s){
 const code=ordersStr(s||'UNKNOWN').toUpperCase();
 const labels={SHIPPED:'SHIPPED',COMPLETED:'COMPLETED',READY_TO_SHIP:'A preparar',
  PROCESSED:'Em processamento',TO_CONFIRM_RECEIVE:'A confirmar',
  UNPAID:'Não pago',CANCELLED:'Cancelado',CANCELED:'Cancelado'};
 return {code,label:labels[code]||code,color:ORDERS_SHOPEE_COLORS[code]||'#8193ac'};
}
function ordersKpi(id,value,footId,foot){
 const n=$('#'+id);if(n)n.textContent=String(value);
 const f=$('#'+footId);if(f)f.textContent=foot;
}
function ordersSetStatus(message,state='info'){
 const node=$('#ordersSummary');node.textContent=message;node.dataset.state=state;
}
function ordersLocalTime(time){
 return time?fmtDate(time):'Data não informada';
}
function ordersGetFiltered(){
 const search=$('#ordersSearch').value.trim().toLocaleLowerCase('pt-BR');
 const selected=$('#ordersStatusFilter').value;
 const sorted=ordersLoaded.filter(order=>{
  const text=[order.order_sn,order.primary_sku,...(order.items||[]).flatMap(x=>[x.sku,x.name])]
    .join(' ').toLocaleLowerCase('pt-BR');
  return (selected==='ALL'||order.order_status===selected)&&(!search||text.includes(search));
 });
 const sort=$('#ordersSort').value;
 const amount=order=>order.total_amount==null?null:Number(order.total_amount);
 if(sort==='oldest')sorted.sort((a,b)=>(a.create_time??Infinity)-(b.create_time??Infinity));
 else if(sort==='value_desc')sorted.sort((a,b)=>(amount(b)??-Infinity)-(amount(a)??-Infinity));
 else if(sort==='value_asc')sorted.sort((a,b)=>(amount(a)??Infinity)-(amount(b)??Infinity));
 else if(sort==='quantity')sorted.sort((a,b)=>(b.items_count??-Infinity)-(a.items_count??-Infinity));
 else sorted.sort((a,b)=>(b.create_time??0)-(a.create_time??0));
 return sorted;
}
function ordersRefreshQuickFilters(){
 const counts=new Map();
 for(const order of ordersLoaded){
  const status=order.order_status||'UNKNOWN';
  counts.set(status,(counts.get(status)||0)+1);
 }
 const selector=$('#ordersStatusFilter'),quick=$('#ordersQuickFilters');
 const current=selector.value;
 selector.replaceChildren();
 const o=document.createElement('option');o.value='ALL';o.textContent='Todos os status';selector.append(o);
 const statuses=[...counts.keys()].sort((a,b)=>(counts.get(b)||0)-(counts.get(a)||0));
 for(const status of statuses){
  const option=document.createElement('option');option.value=status;
  option.textContent=ordersStatusMeta(status).label;selector.append(option);
 }
 selector.value=statuses.includes(current)?current:'ALL';
 ordersCurrentStatus=selector.value;
 quick.replaceChildren();
 const chips=[['ALL','Todos',ordersLoaded.length],
   ...statuses.map(status=>[status,ordersStatusMeta(status).label,counts.get(status)])];
 for(const [value,label,count] of chips){
  const btn=document.createElement('button');btn.type='button';btn.className='orders-v2-chip';
  btn.dataset.ordersStatus=value;btn.textContent=label+' ('+count+')';
  const active=value===ordersCurrentStatus;btn.classList.toggle('selected',active);
  btn.setAttribute('aria-pressed',String(active));
  btn.onclick=()=>{selector.value=value;ordersCurrentStatus=value;ordersPage=1;ordersRender();};
  quick.append(btn);
 }
}
function ordersMakeStatusChip(order){
 const tag=document.createElement('span');tag.className='orders-v2-status-chip';
 const meta=ordersStatusMeta(order.order_status);
 tag.style.setProperty('--order-color',meta.color);
 tag.textContent=meta.label;
 return tag;
}
function ordersShowDetail(order){
 const root=$('#ordersDetailPanel'),content=$('#ordersDetailBody');
 content.replaceChildren();
 $('#ordersDetailTitle').textContent='Pedido '+order.order_sn;
 $('#ordersDetailMeta').textContent='Status: '+ordersStatusMeta(order.order_status).label+
  ' · Criado: '+ordersLocalTime(order.create_time);
 const summary=document.createElement('div');summary.className='orders-v2-detail-counters';
 for(const [label,value] of [['Valor total',ordersCurrency(order.total_amount)],
  ['Quantidade de itens',order.items_count==null?'Não informada':ordersNum(order.items_count)],
  ['SKU principal',order.primary_sku||'Não informado']]){
  const el=document.createElement('div'),key=document.createElement('small'),data=document.createElement('strong');
  key.textContent=label;data.textContent=value;el.append(key,data);summary.append(el);
 }
 content.append(summary);
 const title=document.createElement('h4');title.textContent='Itens do pedido';content.append(title);
 if(!order.items?.length){
  const message=document.createElement('p');message.className='orders-v2-details-hint';
  message.textContent='A consulta de detalhes não retornou itens para este pedido.';
  content.append(message);
 }else{
  const wrap=document.createElement('div');wrap.className='orders-v2-details-table-wrap';
  const table=document.createElement('table');
  const th=document.createElement('thead'),tr=document.createElement('tr');
  for(const title of ['Produto','Variação / SKU','Quantidade','Preço unitário informado']){
   const h=document.createElement('th');h.textContent=title;tr.append(h);
  }
  th.append(tr);table.append(th);
  const body=document.createElement('tbody');
  for(const item of order.items){
   const row=document.createElement('tr');
   for(const value of [item.name||'Produto não informado',
    [item.variation,item.sku].filter(Boolean).join(' / ')||'Não informado',
    item.quantity??'Não informado',ordersCurrency(item.unit_price)]){
    const cell=document.createElement('td');cell.textContent=String(value);row.append(cell);
   }
   body.append(row);
  }
  table.append(body);wrap.append(table);content.append(wrap);
  if(!order.items_complete){
   const note=document.createElement('p');note.className='orders-v2-details-hint';
   note.textContent='Quantidade total pode estar incompleta: faltam detalhes de algum item.';
   content.append(note);
  }
 }
 root.hidden=false;root.focus?.();root.scrollIntoView?.({behavior:'smooth',block:'nearest'});
}
function ordersCreateCell(tr,value){
 const td=document.createElement('td');td.textContent=String(value);
 tr.append(td);return td;
}
function ordersRenderRows(filtered){
 const body=$('#ordersBody');body.replaceChildren();
 const totalPages=Math.max(1,Math.ceil(filtered.length/ordersPageSize));
 ordersPage=Math.min(Math.max(1,ordersPage),totalPages);
 const page=filtered.slice((ordersPage-1)*ordersPageSize,ordersPage*ordersPageSize);
 if(!page.length){
  const tr=document.createElement('tr'),td=document.createElement('td');td.colSpan=7;
  td.className='orders-v2-empty-row';
  td.textContent=!ordersLoaded.length?'Nenhum pedido carregado no período.':
    'Nenhum pedido corresponde à busca e aos filtros.';
  tr.append(td);body.append(tr);
 }
 for(const order of page){
  const tr=document.createElement('tr');
  ordersCreateCell(tr,order.order_sn||'—');
  const status=document.createElement('td');status.append(ordersMakeStatusChip(order));tr.append(status);
  ordersCreateCell(tr,ordersLocalTime(order.create_time));
  ordersCreateCell(tr,order.items_count==null?'—':ordersNum(order.items_count));
  ordersCreateCell(tr,order.primary_sku||'—');
  const value=document.createElement('td');value.className='orders-v2-total-value';
  const strong=document.createElement('strong');strong.textContent=ordersCurrency(order.total_amount);
  const hint=document.createElement('small');hint.textContent=order.items_count==null?
    'Itens não confirmados':ordersNum(order.items_count)+' itens';
  value.append(strong,hint);tr.append(value);
  const actions=document.createElement('td'),controls=document.createElement('div');
  controls.className='orders-v2-row-actions';
  const detail=document.createElement('button');detail.type='button';
  detail.textContent='Detalhes';detail.className='secondary orders-v2-detail-button';
  detail.onclick=()=>ordersShowDetail(order);controls.append(detail);
  const menu=document.createElement('details');menu.className='orders-v2-row-menu';
  const summary=document.createElement('summary');summary.textContent='⋮';summary.title='Ações do pedido';
  summary.setAttribute('aria-label','Ações do pedido '+order.order_sn);
  const pop=document.createElement('div');pop.className='orders-v2-pop-menu';
  const copy=document.createElement('button');copy.type='button';copy.textContent='Copiar número';
  copy.onclick=async()=>{
   try{await navigator.clipboard.writeText(order.order_sn);ordersSetStatus('Número do pedido copiado.','success');}
   catch{ordersSetStatus('Não foi possível copiar automaticamente o número do pedido.','warning');}
   menu.open=false;
  };
  const show=document.createElement('button');show.type='button';show.textContent='Ver itens e detalhes';
  show.onclick=()=>{menu.open=false;ordersShowDetail(order);};
  pop.append(copy,show);menu.append(summary,pop);controls.append(menu);actions.append(controls);tr.append(actions);
  body.append(tr);
 }
 $('#ordersFoundBadge').textContent=ordersNum(filtered.length)+' pedido(s)';
 $('#ordersPagingInfo').textContent=filtered.length?
  (ordersPage-1)*ordersPageSize+1+'–'+Math.min(ordersPage*ordersPageSize,filtered.length)+' de '+filtered.length:'0 registros';
 $('#ordersCurrentPage').textContent=ordersPage+' / '+totalPages;
 $('#ordersPrevPage').disabled=ordersPage===1;
 $('#ordersNextPage').disabled=ordersPage===totalPages;
}
function ordersRenderCharts(){
 const counts=new Map();
 for(const order of ordersLoaded){
  const key=ordersStr(order.order_status||'UNKNOWN').toUpperCase();
  counts.set(key,(counts.get(key)||0)+1);
 }
 const donut=$('#ordersStatusDonut'),legend=$('#ordersStatusLegend');
 const total=ordersLoaded.length;$('#ordersDonutTotal').textContent=ordersNum(total);
 legend.replaceChildren();
 if(!total){
  donut.style.background='conic-gradient(#e3edf8 0 100%)';
  donut.setAttribute('aria-label','Nenhum pedido disponível para distribuir por status');
  legend.textContent='Sem pedidos carregados para o gráfico.';
 }else{
  const sorted=[...counts.entries()].sort((a,b)=>b[1]-a[1]);
  let accumulated=0;
  const stops=[];
  for(const [status,count] of sorted){
   const meta=ordersStatusMeta(status),percent=count/total*100;
   const start=accumulated;accumulated+=percent;
   stops.push(meta.color+' '+start.toFixed(3)+'% '+accumulated.toFixed(3)+'%');
   const row=document.createElement('div');row.className='orders-v2-legend-row';
   const name=document.createElement('span');name.className='orders-v2-legend-label';
   const dot=document.createElement('i');dot.style.background=meta.color;name.append(dot);
   const title=document.createElement('span');title.textContent=meta.label;name.append(title);
   const amount=document.createElement('strong');amount.textContent=ordersNum(count);
   const pct=document.createElement('span');pct.textContent=percent.toLocaleString('pt-BR',{maximumFractionDigits:1})+'%';
   const bar=document.createElement('span');bar.className='orders-v2-bar';
   const fill=document.createElement('span');fill.style.width=percent.toFixed(2)+'%';
   fill.style.background=meta.color;bar.append(fill);
   row.append(name,amount,pct,bar);legend.append(row);
  }
  donut.style.background='conic-gradient('+stops.join(',')+')';
  donut.setAttribute('aria-label',sorted.map(([status,n])=>ordersStatusMeta(status).label+': '+n).join('; '));
 }
 const incomplete=ordersLoaded.filter(o=>o.items_count==null).length;
 const known=ordersLoaded.reduce((n,o)=>n+(o.items_count??0),0);
 const sent=ordersLoaded.filter(o=>o.order_status==='SHIPPED').length,
  completed=ordersLoaded.filter(o=>o.order_status==='COMPLETED').length;
 const summary=$('#ordersPeriodSummary');summary.replaceChildren();
 const rows=[
  [String(total)+' pedidos retornados nos últimos '+ordersCurrentPeriod+' dias.','🛒'],
  [String(sent)+' enviados e '+completed+' concluídos, segundo os status da Shopee.','🚚'],
  [incomplete?known+' itens conhecidos; '+incomplete+' pedido(s) sem quantidades confirmadas.':
   known+' itens somados no período.','📦']
 ];
 for(const [text,mark] of rows){
  const row=document.createElement('p');const ic=document.createElement('span');
  ic.className='orders-v2-summary-emoji';ic.textContent=mark;
  const content=document.createElement('span');content.textContent=text;
  row.append(ic,content);summary.append(row);
 }
}
function ordersRender(){
 ordersRefreshQuickFilters();
 const filtered=ordersGetFiltered();
 ordersRenderRows(filtered);
 ordersRenderCharts();
 const total=ordersLoaded.length;
 const sent=ordersLoaded.filter(o=>o.order_status==='SHIPPED').length;
 const completed=ordersLoaded.filter(o=>o.order_status==='COMPLETED').length;
 const pct=count=>total?(count/total*100).toLocaleString('pt-BR',{maximumFractionDigits:1})+'% do total':'—';
 const missing=ordersLoaded.filter(o=>o.items_count==null).length;
 const known=ordersLoaded.reduce((n,o)=>n+(o.items_count??0),0);
 const label=ordersLoadedComplete?'no período selecionado':'de registros carregados (consulta parcial)';
 ordersKpi('ordersKpiCount',ordersNum(total),'ordersKpiCountFoot',label);
 ordersKpi('ordersKpiShipped',ordersNum(sent),'ordersKpiShippedFoot',pct(sent));
 ordersKpi('ordersKpiCompleted',ordersNum(completed),'ordersKpiCompletedFoot',pct(completed));
 ordersKpi('ordersKpiRecords',ordersNum(total),'ordersKpiRecordsFoot',ordersLoadedComplete?'Consulta completa':'Consulta parcial');
 ordersKpi('ordersKpiItems',missing?'—':ordersNum(known),'ordersKpiItemsFoot',
   missing?known+' itens conhecidos · '+missing+' pedido(s) sem dados':'Itens somados no período');
 ordersKpi('ordersKpiUpdated',ordersLoadedAt?ordersLoadedAt.toLocaleDateString('pt-BR'):'—',
   'ordersKpiUpdatedFoot',ordersLoadedAt?
   ordersLoadedAt.toLocaleTimeString('pt-BR',{hour:'2-digit',minute:'2-digit'})+
    (ordersLoadedComplete?' · consulta concluída':' · consulta parcial'):'Aguardando consulta');
 $('#ordersExportBtn').disabled=!ordersLoaded.length;
}
async function ordersLoad({force=false}={}){
 if(ordersBusy&&!force)return;
 ordersAutoLoaded=true;
 const requestId=++ordersRequestId;
 if(ordersAbortController)ordersAbortController.abort();
 const controller=new AbortController();ordersAbortController=controller;ordersBusy=true;
 const button=$('#loadOrdersBtn');button.disabled=true;
 $('#ordersLoadLabel').textContent='Carregando...';
 ordersCurrentPeriod=Number($('#ordersPeriod').value)||15;
 ordersLoaded=[];ordersLoadedAt=null;ordersLoadedComplete=false;ordersPage=1;
 ordersRender();
 $('#ordersDetailPanel').hidden=true;
 ordersSetStatus('Consultando pedidos da Shopee. A janela será percorrida em blocos de até 14 dias.','loading');
 const seen=new Map(),warnings=[];
 const now=Math.floor(Date.now()/1000);
 const oldest=now-ordersCurrentPeriod*86400;const blockSeconds=14*86400;
 let complete=true,windows=0,pages=0;
 try{
   // Shopee limita o intervalo de get_order_list; segmentar mantendo todos os cursores.
   for(let to=now;to>oldest;){
     const from=Math.max(oldest,to-blockSeconds);
     let cursor='',pageNumber=0;windows++;
     for(;;){
       if(requestId!==ordersRequestId)return;
       const qs=new URLSearchParams({time_from:String(from),time_to:String(to),
         time_range_field:'create_time',page_size:'100'});
       if(cursor)qs.set('cursor',cursor);
       const response=await json('/api/shopee/orders?'+qs.toString(),{signal:controller.signal});
       pages++;pageNumber++;
       const rows=Array.isArray(response.response?.order_list)?response.response.order_list:[];
       for(const x of rows)if(x?.order_sn)seen.set(String(x.order_sn),x);
       if(response.detailStatus?.warning)warnings.push(response.detailStatus.warning);
       if(pages%3===0||!response.response?.more){
         ordersLoaded=[...seen.values()];
         ordersSetStatus(ordersNum(seen.size)+' pedidos carregados em '+pages+
           ' página(s). Aguarde a conclusão para conferir os totais.','loading');
       }
       if(!response.response?.more)break;
       const next=String(response.response?.next_cursor||'');
       if(!next||next===cursor){complete=false;warnings.push('A Shopee não retornou o próximo cursor de paginação.');break;}
       if(pageNumber>=100){complete=false;warnings.push('Limite seguro de 100 páginas atingido em uma janela.');break;}
       cursor=next;
     }
     to=from-1;
     if(!complete)break;
   }
 }catch(error){
   if(requestId!==ordersRequestId)return;
   if(error?.name==='AbortError')return;
   complete=false;warnings.push('Falha na consulta: '+String(error.message||error));
 }finally{
   if(requestId!==ordersRequestId)return;
   ordersBusy=false;button.disabled=false;$('#ordersLoadLabel').textContent='Carregar pedidos';
   ordersLoaded=[...seen.values()];ordersLoadedComplete=complete;
   ordersLoadedAt=new Date();
   ordersRender();
   ordersSetStatus(complete?'Consulta concluída: '+ordersNum(ordersLoaded.length)+
      ' pedidos únicos em '+windows+' janela(s) e '+pages+' página(s).'+
      (warnings.length?' Alguns detalhes indisponíveis: '+warnings.slice(0,2).join(' | '):''):
      'Consulta incompleta: '+ordersNum(ordersLoaded.length)+' registros carregados. '+
      warnings.slice(0,3).join(' | '),complete?(warnings.length?'warning':'success'):'warning');
 }
}
function ordersEnsureLoaded(){
 if(!ordersAutoLoaded&&!ordersBusy)void ordersLoad();
}
$('#loadOrdersBtn').onclick=()=>void ordersLoad({force:true});
$('#ordersPeriod').onchange=()=>void ordersLoad({force:true});
$('#ordersSearch').oninput=()=>{ordersPage=1;ordersRender();};
$('#ordersStatusFilter').onchange=()=>{ordersPage=1;ordersRender();};
$('#ordersSort').onchange=()=>{ordersPage=1;ordersRender();};
$('#ordersPrevPage').onclick=()=>{if(ordersPage>1){ordersPage--;ordersRenderRows(ordersGetFiltered());}};
$('#ordersNextPage').onclick=()=>{
 if(ordersPage<Math.ceil(ordersGetFiltered().length/ordersPageSize)){
  ordersPage++;ordersRenderRows(ordersGetFiltered());
 }
};
$('#ordersDetailClose').onclick=()=>{$('#ordersDetailPanel').hidden=true;};
function ordersCsvProtect(value){
 let s=String(value??'').replaceAll('"','""');
 if(/^[\s]*[=+\-@\t\r]/.test(s))s="'"+s;
 return '"'+s+'"';
}
$('#ordersExportBtn').onclick=()=>{
 const headings=['Pedido','Status','Criação','Quantidade de itens','SKU principal',
   'Valor BRL','Consulta completa'];
 const rows=ordersGetFiltered().map(o=>[o.order_sn,o.order_status,ordersLocalTime(o.create_time),
   o.items_count??'',o.primary_sku||'',o.total_amount??'',ordersLoadedComplete?'Sim':'Não']);
 const csv='\uFEFF'+[headings,...rows].map(row=>row.map(ordersCsvProtect).join(';')).join('\r\n');
 const url=URL.createObjectURL(new Blob([csv],{type:'text/csv;charset=utf-8'}));
 const a=document.createElement('a');a.href=url;a.download='shopee-pedidos-'+ordersCurrentPeriod+'dias-'+
    new Date().toISOString().slice(0,10)+'.csv';
 document.body.append(a);a.click();a.remove();URL.revokeObjectURL(url);
};

function ddmmyyyy(v){if(!v)return'';const [y,m,d]=v.split('-');return `${d}-${m}-${y}`;}
function adsBrazilDayOffset(offset=0){
 const parts=new Intl.DateTimeFormat('en-US',{timeZone:'America/Sao_Paulo',
  year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(new Date());
 const fields=Object.fromEntries(parts.filter(p=>p.type!=='literal').map(p=>[p.type,p.value]));
 const utc=Date.UTC(Number(fields.year),Number(fields.month)-1,Number(fields.day));
 return new Date(utc+offset*86400000).toISOString().slice(0,10);
}
function adsShiftIsoDay(value,days){
 return new Date(Date.parse(value+'T00:00:00Z')+days*86400000).toISOString().slice(0,10);
}
// Por padrão, consultar sete dias completos, sem data futura na Shopee Brasil.
$('#adsEnd').value=adsBrazilDayOffset(-1);
$('#adsStart').value=adsBrazilDayOffset(-8);
const adsMoney=value=>value===null||value===undefined||!Number.isFinite(Number(value))?
 '—':new Intl.NumberFormat('pt-BR',{style:'currency',currency:'BRL'}).format(Number(value));
const adsNum=value=>new Intl.NumberFormat('pt-BR',{maximumFractionDigits:2}).format(Number(value));
const adsMetric=value=>value===null||value===undefined?'—':adsNum(value);
let adsCampaignRows=[],adsCurrentGroup='all',adsPage=1,adsPageSize=12,
 adsSuggestions=[],adsSuggestionsExpanded=false,adsLastReport=null,adsBusy=false,
 adsLoadedOnce=false,adsSelected=new Set();
function adsStatusLabel(code){
 const map={ongoing:'Ativa / Rodando',paused:'Pausada',ended:'Encerrada',
  deleted:'Excluída',closed:'Desativada / Fechada',scheduled:'Agendada',unknown:'Não confirmado'};
 const key=String(code||'unknown').toLowerCase();
 return map[key]||('Outro: '+key);
}
function adsDiagnose(c){
 if(!c||!c.daysWithData)return {kind:'unknown',label:'Sem dados',reason:'Sem métricas verificadas no período.'};
 if(c.statusGroup==='active'&&c.impressions===0)
  return {kind:'attention',label:'Sem impressões',reason:'Campanha ativa sem impressões; investigar saldo Ads, entrega e moderação.'};
 if(c.impressions>=300&&c.clicks===0)
  return {kind:'attention',label:'Sem cliques',reason:'Muitas impressões sem cliques; revisar foto principal, título e preço.'};
 if(c.impressions>=100&&c.ctr!==null&&c.ctr<1)
  return {kind:'attention',label:'CTR baixo',reason:'CTR inferior a 1% com ao menos 100 impressões.'};
 if(c.broadGmv>0&&c.acos!==null&&c.acos>30)
  return {kind:'attention',label:'ACOS alto',reason:'ACOS maior que 30%: confira sua margem líquida.'};
 if(c.expense>=10&&c.directOrdersObserved&&c.directOrders===0)
  return {kind:'attention',label:'Sem venda direta',reason:'Gasto de R$ 10 ou mais sem pedidos diretos atribuídos no período.'};
 if(c.expense>0&&!c.directOrdersObserved)
  return {kind:'unknown',label:'Conversão não informada',reason:'A Shopee não confirmou a métrica de pedidos diretos.'};
 return {kind:'ok',label:'Sem alerta',reason:'Nenhum limite de alerta indicativo foi atingido.'};
}
function adsCreateElement(tag,cls,value){
 const el=document.createElement(tag);if(cls)el.className=cls;
 if(value!==undefined)el.textContent=String(value);return el;
}
function adsRecommendationsFor(campaigns){
 const relevant=campaigns.filter(c=>c.daysWithData>0&&c.statusGroup==='active');
 const noReach=relevant.filter(c=>c.impressions===0);
 const noClicks=relevant.filter(c=>c.impressions>=300&&c.clicks===0);
 const low=relevant.filter(c=>c.impressions>=100&&c.ctr!==null&&c.ctr<1);
 const costly=relevant.filter(c=>c.broadGmv>0&&c.acos!==null&&c.acos>30);
 const noSales=relevant.filter(c=>c.expense>=10&&c.directOrdersObserved&&c.directOrders===0);
 const out=[];
 if(noReach.length)out.push({id:'no-impressions',title:'Campanhas ativas sem impressões',level:'Alta',
  text:noReach.length+' campanha(s) devem ser verificadas quanto a saldo Ads, orçamento, aprovação e entrega.',
  action:'Revisar entrega',ids:noReach.map(c=>c.campaignId)});
 if(noClicks.length)out.push({id:'impressions-no-clicks',title:'Impressões sem cliques',level:'Alta',
  text:noClicks.length+' campanha(s) tiveram exposição, mas nenhum clique. Conferir foto de capa, título SEO e preço.',
  action:'Corrigir oferta',ids:noClicks.map(c=>c.campaignId)});
 if(low.length)out.push({id:'low-ctr',title:'CTR baixo em campanhas',level:'Alta',
  text:low.length+' campanha(s) ativa(s) com CTR abaixo de 1% e mais de 100 impressões.',
  action:'Revisar anúncios',ids:low.map(c=>c.campaignId)});
 if(costly.length)out.push({id:'high-acos',title:'ACOS acima de 30%',level:'Alta',
  text:costly.length+' campanha(s) exigem revisão das taxas, margem e rentabilidade antes de aumentar lances.',
  action:'Revisar ACOS',ids:costly.map(c=>c.campaignId)});
 if(noSales.length)out.push({id:'no-sales',title:'Gasto sem pedido direto',level:'Média',
  text:noSales.length+' campanha(s) com gasto de R$ 10 ou mais sem pedido direto atribuído.',
  action:'Revisar gastos',ids:noSales.map(c=>c.campaignId)});
 if(!out.length&&relevant.length)out.push({id:'stable',title:'Nenhum alerta automático identificado',level:'Informativo',
  text:'Os limites de CTR, ACOS e gasto sem conversão não foram atingidos pelas campanhas ativas com dados.',
  action:'Ver campanhas',ids:relevant.map(c=>c.campaignId)});
 if(!relevant.length)out.push({id:'none',title:'Sem campanhas ativas com dados suficientes',level:'Informativo',
  text:'As métricas e os status atuais não permitem sugerir ajustes automáticos seguros.',
  action:'Ver campanhas',ids:[]});
 return out;
}
function adsSetKpi(id,value){const el=$('#'+id);if(el)el.textContent=String(value);}
function adsStatusState(message,state='info'){
 const node=$('#adsSummary');node.textContent=message;node.dataset.state=state;
}
function adsRenderSuggestions(){
 const list=$('#adsRecommendations');
 if(globalThis.RedeAdsImprovements?.render){
  const ok=globalThis.RedeAdsImprovements.render({
   campaigns:adsCampaignRows,expanded:adsSuggestionsExpanded,container:list,
   onReview:c=>{
    adsSelected=new Set([c.campaignId]);
    adsShowReview([c.campaignId]);
    adsDisplayCampaigns();
    const review=$('#adsReviewPanel');
    if(review&&!review.hidden)review.scrollIntoView({behavior:'smooth',block:'nearest'});
   },
   onProduct:c=>{
    adsFillOptimizerSku(c.productSku);
   }
  });
  if(ok)return;
 }
 list.replaceChildren();
 const visible=adsSuggestionsExpanded?adsSuggestions:adsSuggestions.slice(0,3);
 $('#adsShowAllSuggestions').textContent=adsSuggestionsExpanded?'Ver menos':'Ver todas';
 for(const item of visible){
  const row=adsCreateElement('div','ads-v2-recommendation');
  const ico=adsCreateElement('span','ads-v2-recommendation-icon',item.level==='Alta'?'!':item.level==='Média'?'↗':'✓');
  const copy=adsCreateElement('div','ads-v2-recommendation-copy');
  copy.append(adsCreateElement('strong','',item.title),adsCreateElement('small','',item.text));
  const level=adsCreateElement('span','ads-v2-recommendation-level',item.level);
  const btn=adsCreateElement('button','secondary ads-v2-recommendation-btn',item.action);
  btn.type='button';btn.onclick=()=>{
   adsSelected=new Set(item.ids);adsShowReview(item.ids);
   adsDisplayCampaigns();
  };
  row.append(ico,copy,level,btn);list.append(row);
 }
}
function adsRenderExecution(){
 const root=$('#adsExecutionSteps');root.replaceChildren();
 const known=Boolean(adsLastReport),recommendations=adsSuggestions.some(x=>x.level!=='Informativo');
 const states=[
  ['Analisar métricas das campanhas',known?'Concluído':'Pendente'],
  ['Identificar baixo desempenho',known?'Concluído':'Pendente'],
  ['Gerar recomendações',known?'Concluído':'Pendente'],
  ['Revisar ajustes sugeridos',known&&recommendations?'Disponível':'Sem ações'],
  ['Executar ajustes via API','Após aprovação']
 ];
 for(let i=0;i<states.length;i++){
  const [label,status]=states[i],p=adsCreateElement('p','ads-v2-step');
  const name=adsCreateElement('span','',String(i+1)+'. '+label);
  const state=adsCreateElement('span','ads-v2-step-badge',status);
  state.dataset.state=status==='Concluído'?'complete':'pending';
  p.append(name,state);root.append(p);
 }
 $('#adsExecutionNote').textContent='Consultas não modificam campanhas. Mudanças via API exigem prévia assinada, confirmação individual e permissão Ads da Shopee.';
}
function adsRenderHealth(data){
 const campaigns=adsCampaignRows,analyzed=campaigns.filter(c=>c.daysWithData>0);
 const validStatus=campaigns.filter(c=>c.statusGroup!=='other');
 const gauge=$('#adsHealthGauge'),total=analyzed.length;
 if(!total||data.statusWarning){
  $('#adsHealthScore').textContent='—';$('#adsHealthState').textContent='Dados insuficientes';
  $('#adsHealthComment').textContent=data.statusWarning||'Campanhas sem métricas para calcular um indicador interno.';
  gauge.style.setProperty('--health-angle','0deg');
  gauge.setAttribute('aria-label','Indicador interno indisponível: informações insuficientes.');
 }else{
  const attention=analyzed.filter(c=>adsDiagnose(c).kind==='attention').length;
  const unknown=analyzed.filter(c=>adsDiagnose(c).kind==='unknown').length;
  const score=Math.max(0,Math.min(100,Math.round(100-65*attention/total-20*unknown/total)));
  const label=score>=85?'Estável':score>=60?'Atenção':'Revisão prioritária';
  $('#adsHealthScore').textContent=String(score);$('#adsHealthState').textContent=label;
  $('#adsHealthComment').textContent='Índice interno indicativo: '+attention+' com alertas entre '+
   total+' campanhas com métricas. Não é uma nota oficial da Shopee.';
  gauge.style.setProperty('--health-angle',(score/100*360).toFixed(2)+'deg');
  gauge.setAttribute('aria-label','Índice interno indicativo de '+score+' em 100.');
 }
 const counts=data.statusCounts||{},active=Number(counts.active||0),
 inactive=Number(counts.inactive||0),other=Number(counts.other||0),den=active+inactive+other;
 $('#adsActiveCount').textContent=active+' ('+(den?adsNum(active/den*100):0)+'%)';
 $('#adsInactiveCount').textContent=inactive+' ('+(den?adsNum(inactive/den*100):0)+'%)';
 $('#adsOtherCount').textContent=other+' ('+(den?adsNum(other/den*100):0)+'%)';
 const track=$('#adsStatusTrack');
 const a=den?active/den*100:0,bi=den?inactive/den*100:0;
 track.style.background=den?'linear-gradient(to right,#16a464 0% '+a+'%,#ff5969 '+a+'% '+(a+bi)+'%,#a1b5d1 '+(a+bi)+'% 100%)':'#e4edf8';
}
function adsVisibleCampaigns(){
 const q=$('#adsCampaignSearch').value.trim().toLocaleLowerCase('pt-BR');
 const diag=$('#adsDiagnosisFilter').value,sort=$('#adsCampaignSort').value;
 const records=adsCampaignRows.filter(c=>{
  // Mostrar apenas campanhas realmente rodando, não métricas históricas de pausadas.
  if(c.statusGroup!=='active')return false;
  if(adsCurrentGroup!=='all'&&c.statusGroup!==adsCurrentGroup)return false;
  if(q&&![c.name,c.campaignId,c.adType,...(c.itemIdList||[])].join(' ').toLocaleLowerCase('pt-BR').includes(q))return false;
  const kind=adsDiagnose(c).kind;
  if(diag==='attention'&&kind!=='attention')return false;
  if(diag==='ok'&&kind!=='ok')return false;
  return true;
 });
 if(sort==='clicks')records.sort((a,b)=>b.clicks-a.clicks);
 else if(sort==='acos')records.sort((a,b)=>(b.acos??-Infinity)-(a.acos??-Infinity));
 else if(sort==='ctr')records.sort((a,b)=>(a.ctr??Infinity)-(b.ctr??Infinity));
 else records.sort((a,b)=>b.expense-a.expense);
 // Campanhas realmente ativas/rodando sempre no topo, independentemente da métrica escolhida.
 const priority=x=>x.statusGroup==='active'?0:x.statusGroup==='other'?1:2;
 records.sort((a,b)=>priority(a)-priority(b));
 return records;
}
function adsShowReview(ids){
 if(globalThis.RedeAdsPremium?.openReview){
  return globalThis.RedeAdsPremium.openReview(ids?.length?ids:[...adsSelected],adsCampaignRows);
 }
 const all=ids?.length?adsCampaignRows.filter(c=>ids.includes(c.campaignId)):
  adsCampaignRows.filter(c=>adsSelected.has(c.campaignId));
 const root=$('#adsReviewPanel'),list=$('#adsReviewRows');list.replaceChildren();
 $('#adsReviewNotice').textContent=all.length?
  all.length+' campanha(s) selecionada(s) para conferência. Os diagnósticos são indicativos e NÃO serão enviados à API.':
  'Nenhuma campanha selecionada. Marque campanhas na tabela ou escolha uma recomendação.';
 for(const c of all){
  const row=adsCreateElement('div','ads-v2-review-row');
  const d=adsDiagnose(c);
  row.append(adsCreateElement('strong','',c.name||'Campanha '+c.campaignId),
   adsCreateElement('span','',c.campaignId+' · '+adsStatusLabel(c.status)),
   adsCreateElement('span','',d.label+': '+d.reason));
  list.append(row);
 }
 root.hidden=false;root.focus?.();root.scrollIntoView?.({behavior:'smooth',block:'nearest'});
}
function adsDisplayCampaigns(){
 const filtered=adsVisibleCampaigns();
 const body=$('#adsResultsBody');body.replaceChildren();
 const pages=Math.max(1,Math.ceil(filtered.length/adsPageSize));
 adsPage=Math.min(Math.max(1,adsPage),pages);
 for(const c of filtered.slice((adsPage-1)*adsPageSize,adsPage*adsPageSize)){
  const tr=document.createElement('tr');
  const selection=adsCreateElement('td','ads-v2-select-cell'),cb=document.createElement('input');
  cb.type='checkbox';cb.checked=adsSelected.has(c.campaignId);
  cb.setAttribute('aria-label','Selecionar campanha '+c.campaignId);
  cb.onchange=()=>{if(cb.checked)adsSelected.add(c.campaignId);else adsSelected.delete(c.campaignId);adsUpdateSelection();};
  selection.append(cb);tr.append(selection);
  const item=adsCreateElement('td','ads-v2-campaign-name');
  const title=adsCreateElement('strong','',c.name||'Campanha '+c.campaignId);
  const sub=adsCreateElement('small','','ID: '+c.campaignId+(c.itemIdList?.length?' · Produto '+c.itemIdList.slice(0,2).join(', '):''));
  if(c.productImage&&/^https:\/\//i.test(String(c.productImage))){
   try{
    const imageUrl=new URL(c.productImage);
    if(['shopee.com.br','susercontent.com','shopeeusercontent.com','shopeemobile.com'].some(d=>imageUrl.hostname===d||imageUrl.hostname.endsWith('.'+d))){
      const im=document.createElement('img');im.src=imageUrl.href;im.loading='lazy';
      im.referrerPolicy='no-referrer';im.alt='Produto da campanha';im.className='ads-v3-product-thumb';
      item.append(im);
    }
   }catch{}
  }
  const info=document.createElement('span');info.className='ads-v3-product-copy';
  info.append(adsCreateElement('strong','',c.productTitle||c.name||'Campanha '+c.campaignId),
   adsCreateElement('small','',c.productSku?'SKU '+c.productSku+' · ID '+c.campaignId:'ID '+c.campaignId));
  item.append(info);tr.append(item);
  const status=adsCreateElement('td');
  const statusEl=adsCreateElement('span','ads-v2-status',adsStatusLabel(c.status));
  statusEl.dataset.group=c.statusGroup;status.append(statusEl);tr.append(status);
  for(const value of [c.adType||'—',adsNum(c.impressions),adsNum(c.clicks),
   c.ctr===null?'—':adsNum(c.ctr)+'%',adsMoney(c.expense),adsMoney(c.broadGmv),
   adsNum(c.broadOrders??0),c.roas===null?'—':adsNum(c.roas)+'x']){
   tr.append(adsCreateElement('td','',value));
  }
  const diagnosis=adsDiagnose(c),cell=adsCreateElement('td');
  const badge=adsCreateElement('span','ads-v2-diagnosis',diagnosis.label);
  badge.dataset.kind=diagnosis.kind;
  badge.title=diagnosis.reason;cell.append(badge);tr.append(cell);
  const actions=adsCreateElement('td','ads-v2-actions-cell');
  const review=adsCreateElement('button','secondary ads-v2-row-action','Revisar');
  review.onclick=()=>{adsSelected.add(c.campaignId);adsShowReview([c.campaignId]);adsDisplayCampaigns();};
  const more=document.createElement('details');more.className='ads-v2-row-menu';
  const summary=document.createElement('summary');summary.textContent='⋮';summary.setAttribute('aria-label','Ações da campanha '+c.campaignId);
  const list=adsCreateElement('div','ads-v2-row-menu-list');
  const inspect=adsCreateElement('button','','Ver diagnóstico');inspect.onclick=()=>{more.open=false;adsShowReview([c.campaignId]);};
  const manage=adsCreateElement('button','','Ajustar pela API');
  manage.onclick=()=>{more.open=false;adsShowReview([c.campaignId]);};
  list.append(inspect,manage);more.append(summary,list);actions.append(review,more);tr.append(actions);
  body.append(tr);
 }
 if(!filtered.length){
  const tr=document.createElement('tr'),td=adsCreateElement('td','ads-v2-empty','Nenhuma campanha corresponde aos filtros ou não existem campanhas no período.');
  td.colSpan=13;tr.append(td);body.append(tr);
 }
 $('#adsFilterSummary').textContent=filtered.length+' campanha(s) nos filtros · '+adsCampaignRows.length+' carregadas';
 $('#adsPaginationInfo').textContent=filtered.length?'Exibindo '+((adsPage-1)*adsPageSize+1)+'–'+Math.min(adsPage*adsPageSize,filtered.length)+' de '+filtered.length:'0 campanhas';
 $('#adsPageCurrent').textContent=adsPage+' / '+pages;
 $('#adsPrevious').disabled=adsPage<=1;$('#adsNext').disabled=adsPage>=pages;
 adsUpdateSelection(filtered);
}
function adsUpdateSelection(filtered=adsVisibleCampaigns()){
 $('#adsSelectionCount').textContent=adsSelected.size+' selecionada(s)';
 const checkbox=$('#adsSelectVisible');
 const ids=filtered.slice((adsPage-1)*adsPageSize,adsPage*adsPageSize).map(c=>c.campaignId);
 checkbox.checked=Boolean(ids.length)&&ids.every(id=>adsSelected.has(id));
 checkbox.indeterminate=!checkbox.checked&&ids.some(id=>adsSelected.has(id));
}
function displayAdsGroup(group){
 adsCurrentGroup=group;adsPage=1;
 document.querySelectorAll('.ads-status-tab').forEach(btn=>{
  const active=btn.dataset.adsGroup===group;
  btn.classList.toggle('selected',active);
  btn.setAttribute('aria-pressed',String(active));
 });
 adsDisplayCampaigns();
}
document.querySelectorAll('.ads-status-tab').forEach(button=>{
 button.onclick=()=>displayAdsGroup(button.dataset.adsGroup);
});
function renderShopeeAds(data){
 const campaigns=Array.isArray(data.campaigns)?data.campaigns:[];
 // Histórico de campanhas inativas permanece apenas no retorno original para auditoria.
 // A interface, a prévia e a exportação usam exclusivamente status atual confirmado como ativo.
 const activeCampaigns=campaigns.filter(c=>c.statusGroup==='active');
 const total=data.total||{};
 adsCampaignRows=activeCampaigns;adsLastReport=data;adsSelected.clear();
 adsSuggestions=adsRecommendationsFor(activeCampaigns);adsSuggestionsExpanded=false;
 $('#adsResults').hidden=false;$('#adsReviewPanel').hidden=true;
 adsSetKpi('adsCampaignCount',activeCampaigns.length);
 adsSetKpi('adsImpressions',adsNum(total.impressions));
 adsSetKpi('adsClicks',adsNum(total.clicks));
 adsSetKpi('adsCtr',adsMetric(total.ctr)+(total.ctr===null?'':'%'));
 adsSetKpi('adsExpense',adsMoney(total.expense));
 adsSetKpi('adsGmv',adsMoney(total.broadGmv));
 adsSetKpi('adsRoasAcos',adsMetric(total.roas)+(total.roas===null?'':'x')+' / '+
  (total.acos===null?'—':adsNum(total.acos)+'%'));
 adsSetKpi('adsAttributedOrders',adsNum(total.broadOrders??0));
 adsSetKpi('adsItemsSold','Não disponível');
 $('#adsStatusExplanation').textContent=data.statusWarning?
  'Status atual não confirmado: '+data.statusWarning:
  'A lista exibe somente campanhas ativas confirmadas. Indicadores financeiros do período incluem histórico de campanhas inativas; GMV atribuído não é lucro.';
 adsRenderHealth(data);adsRenderSuggestions();adsRenderExecution();
 globalThis.RedeAdsPremium?.onData?.(activeCampaigns);
 $('#adsExportBtn').disabled=!activeCampaigns.length;
 $('#adsExecuteSuggested').disabled=!activeCampaigns.length;
 displayAdsGroup('all');
}
$('#loadAdsAutoBtn').onclick=async()=>{
 const button=$('#loadAdsAutoBtn');if(adsBusy)return;
 adsBusy=true;button.disabled=true;$('#adsRefreshLabel').textContent='Consultando...';
 const hadPrevious=Boolean(adsLastReport);
 if(!hadPrevious)$('#adsResults').hidden=true;
 adsStatusState('Consultando campanhas e resultados oficiais da Shopee…','loading');
 try{
  let start=$('#adsStart').value,end=$('#adsEnd').value;
  if(!start||!end||start>=end)throw Error('Informe um período válido: início anterior ao fim.');
  let adjustedNote='';
  const todayBr=adsBrazilDayOffset(0);
  if(end>todayBr){
    const days=Math.round((Date.parse(end+'T00:00:00Z')-Date.parse(todayBr+'T00:00:00Z'))/86400000);
    if(days>2)throw Error('Data final no futuro. Escolha uma data até '+todayBr+'.');
    start=adsShiftIsoDay(start,-days);
    end=adsShiftIsoDay(end,-days);
    adjustedNote='A data final era futura no Brasil; o período foi corrigido. ';
    $('#adsStart').value=start;$('#adsEnd').value=end;
  }
  const q=new URLSearchParams({start_date:start,end_date:end});
  const data=await json('/api/shopee/ads/overview?'+q,{signal:AbortSignal.timeout(120000)});
  if(!data.ok)throw Error(data.error||'Resposta Ads não confirmada.');
  if(data.dateAdjustment?.shiftedDays){
    $('#adsStart').value=String(data.dates.start).split('-').reverse().join('-');
    $('#adsEnd').value=String(data.dates.end).split('-').reverse().join('-');
    adjustedNote+='A Shopee ainda não liberou o último dia; a consulta foi repetida em dias anteriores. ';
  }
  renderShopeeAds(data);
  adsStatusState(adjustedNote+'Período consultado: '+$('#adsStart').value+' a '+$('#adsEnd').value+
    '. '+data.campaignCount+' campanhas, '+(data.total?.withData||0)+' com métricas. '+
    (data.statusWarning?'Atenção: '+data.statusWarning+' ':'')+
    'Nenhuma alteração enviada à Shopee.',adjustedNote||data.statusWarning?'warning':'success');
  debug({shopId:data.shopId,campaignCount:data.campaignCount,dates:data.dates,total:data.total,dateAdjustment:data.dateAdjustment});
 }catch(error){
  const message=error?.name==='TimeoutError'?'Consulta demorou demais; use um período menor.':String(error.message||error);
  const isDate=/date_in_future|date must be today or earlier|data final.*futuro/i.test(message);
  const isPermission=/permission|denied|403|restricted|forbidden|unauthorized/i.test(message);
  adsStatusState((hadPrevious?'A análise anterior continua visível. ':'')+
    (isDate?'Data ainda indisponível na Shopee Brasil. Selecione um dia anterior e tente novamente.':
      'Não foi possível atualizar Ads: '+message+(isPermission?' Confira as permissões Ads.':' Tente novamente.')),'error');
  debug({adsError:message});
 }finally{adsBusy=false;button.disabled=false;$('#adsRefreshLabel').textContent='Atualizar análise';}
};
$('#adsShowAllSuggestions').onclick=()=>{adsSuggestionsExpanded=!adsSuggestionsExpanded;adsRenderSuggestions();};
$('#adsExecuteSuggested').onclick=()=>adsShowReview(adsSuggestions.filter(s=>s.level!=='Informativo').flatMap(s=>s.ids));
$('#adsExecutionReviewBtn').onclick=()=>adsShowReview([...adsSelected]);
$('#adsCloseReview').onclick=()=>{$('#adsReviewPanel').hidden=true;};
$('#adsOpenSeller').onclick=()=>adsShowReview([...adsSelected]);
$('#adsFilterToggle').onclick=()=>{
 const panel=$('#adsFiltersPanel');panel.hidden=!panel.hidden;
 $('#adsFilterToggle').setAttribute('aria-expanded',String(!panel.hidden));
};
$('#adsCampaignSearch').oninput=()=>{adsPage=1;adsDisplayCampaigns();};
$('#adsDiagnosisFilter').onchange=()=>{adsPage=1;adsDisplayCampaigns();};
$('#adsCampaignSort').onchange=()=>{adsPage=1;adsDisplayCampaigns();};
$('#adsSelectVisible').onchange=()=>{
 const rows=adsVisibleCampaigns().slice((adsPage-1)*adsPageSize,adsPage*adsPageSize);
 for(const c of rows)if($('#adsSelectVisible').checked)adsSelected.add(c.campaignId);else adsSelected.delete(c.campaignId);
 adsDisplayCampaigns();
};
$('#adsPrevious').onclick=()=>{if(adsPage>1){adsPage--;adsDisplayCampaigns();}};
$('#adsNext').onclick=()=>{
 const pages=Math.ceil(adsVisibleCampaigns().length/adsPageSize);
 if(adsPage<pages){adsPage++;adsDisplayCampaigns();}
};
function adsCsvProtect(value){
 const s=String(value??'').replaceAll('"','""');
 return '"'+(/^\s*[=+\-@\t\r]/.test(s)?"'"+s:s)+'"';
}
$('#adsExportBtn').onclick=()=>{
 if(!adsLastReport)return;
 const header=['ID campanha','Campanha','Status atual','Tipo','Impressões','Cliques','CTR %',
  'Gasto BRL','GMV amplo atribuído BRL','Pedidos atribuídos','ROAS','ACOS %','Diagnóstico'];
 const rows=adsVisibleCampaigns().map(c=>[c.campaignId,c.name,c.status,c.adType,c.impressions,c.clicks,
  c.ctr??'',c.expense,c.broadGmv,c.broadOrders,c.roas??'',c.acos??'',adsDiagnose(c).label]);
 const csv='\uFEFF'+[header,...rows].map(row=>row.map(adsCsvProtect).join(';')).join('\r\n');
 const url=URL.createObjectURL(new Blob([csv],{type:'text/csv;charset=utf-8'}));
 const link=document.createElement('a');link.href=url;link.download='shopee-ads-analise-'+$('#adsStart').value+'-'+$('#adsEnd').value+'.csv';
 document.body.append(link);link.click();link.remove();URL.revokeObjectURL(url);
};
$('#loadAdsBtn').onclick=async()=>{
 const btn=$('#loadAdsBtn');if(btn.disabled)return;btn.disabled=true;
 try{
  const ids=$('#campaignIds').value.trim();
  if(!ids)throw Error('Informe pelo menos um Campaign ID.');
  const q=new URLSearchParams({campaign_ids:ids,start_date:ddmmyyyy($('#adsStart').value),
   end_date:ddmmyyyy($('#adsEnd').value)});
  const d=await json('/api/shopee/ads/product-campaign-performance?'+q);
  debug(d);
  adsStatusState('Consulta avançada de IDs concluída. Dados de diagnóstico disponibilizados no painel técnico. Nenhuma campanha foi modificada.','success');
 }catch(e){adsStatusState('Erro na consulta avançada: '+String(e.message||e),'error');}
 finally{btn.disabled=false;}
};
// Custos WeDrop: importação exige prévia e mapeamento explícito do arquivo CSV.
let weDropCsvText=null;
let wedropWorkbookRef=null,wedropWorkbookReadPromise=null;
async function wdReadCatalogText(file){
 if(!file)throw Error('Selecione um catálogo WeDrop CSV, XLSX ou XLS.');
 if(file.size>4_000_000)throw Error('Arquivo acima de 4 MB. Divida o catálogo.');
 if(wedropWorkbookRef!==file){
  wedropWorkbookRef=file;wedropWorkbookReadPromise=null;
 }
 if(!wedropWorkbookReadPromise){
  wedropWorkbookReadPromise=(async()=>{
   if(/\.csv$/i.test(file.name))return file.text();
   if(!/\.xlsx?$/i.test(file.name))
    throw Error('Formato não aceito. Envie CSV, Excel .xlsx ou .xls.');
   const bytes=new Uint8Array(await file.arrayBuffer());
   let binary='';
   for(let i=0;i<bytes.length;i+=32768)
    binary+=String.fromCharCode(...bytes.subarray(i,i+32768));
   const converted=await json('/api/shopee/wedrop/convert-excel',{
    method:'POST',headers:{'Content-Type':'application/json'},
    body:JSON.stringify({base64:btoa(binary),fileName:file.name}),
    signal:AbortSignal.timeout(60000)
   });
   if(!converted?.csv)throw Error('Excel sem linhas reconhecidas.');
   wdSetNotice('#wedropImportStatus',
    'Aba Excel '+converted.sheetName+' convertida para conferência: '+
     converted.rows+' linhas. Aplicando validação de custos e SKUs.','info');
   return converted.csv;
  })().catch(error=>{wedropWorkbookReadPromise=null;throw error;});
 }
 return wedropWorkbookReadPromise;
}
let weDropPreview=null;
let weDropValidation=null;
let weDropImportBusy=false;
let weDropModelsRunning=false,wedropStopRequested=false;
const wdMoney=value=>value===null||value===undefined?'—':new Intl.NumberFormat('pt-BR',{
  style:'currency',currency:'BRL'
}).format(Number(value));
const wdNum=value=>new Intl.NumberFormat('pt-BR').format(Number(value)||0);
function wdSetNotice(selector,message,state){
  const elem=$(selector);
  if(!elem)return;
  elem.textContent=message;
  elem.dataset.state=state||'info';
}
function wdRenderPreview(data){
  const holder=$('#wedropSample');
  holder.replaceChildren();
  const table=document.createElement('table');
  const thead=document.createElement('thead'),headRow=document.createElement('tr');
  for(const head of data.headers.slice(0,20)){
    const th=document.createElement('th');th.textContent=head;headRow.appendChild(th);
  }
  thead.appendChild(headRow);table.appendChild(thead);
  const body=document.createElement('tbody');
  for(const sample of data.examples||[]){
    const tr=document.createElement('tr');
    for(const val of sample){
      const td=document.createElement('td');td.textContent=String(val??'');tr.appendChild(td);
    }
    body.appendChild(tr);
  }
  table.appendChild(body);holder.appendChild(table);
  for(const id of ['#wedropSkuColumn','#wedropCostColumn']){
    const select=$(id);select.replaceChildren();
    const empty=document.createElement('option');
    empty.value='';empty.textContent=id==='#wedropSkuColumn'?'Selecione o SKU':'Selecione o custo de aquisição';
    select.appendChild(empty);
    data.headers.forEach((header,index)=>{
      const opt=document.createElement('option');
      opt.value=String(index);
      opt.textContent=(index+1)+': '+header;
      select.appendChild(opt);
    });
    select.value='';
  }
}
$('#wedropPreviewBtn').onclick=async()=>{
  const button=$('#wedropPreviewBtn');
  if(button.disabled)return;
  button.disabled=true;button.textContent='Lendo arquivo...';
  $('#wedropPreviewArea').hidden=true;
  weDropCsvText=null;weDropPreview=null;
  try{
    const file=$('#wedropFile').files?.[0];
    if(!file)throw Error('Selecione um arquivo CSV ou Excel exportado da WeDrop.');
    if(file.size>4_000_000)throw Error('Arquivo acima de 4 MB. Divida o catálogo em partes menores.');
    const raw=await wdReadCatalogText(file);
    const data=await json('/api/shopee/wedrop/preview',{
      method:'POST',headers:{'Content-Type':'application/json'},
      body:JSON.stringify({csv:raw}),signal:AbortSignal.timeout(30000)
    });
    if(!data.ok)throw Error('Não foi possível reconhecer as colunas do CSV.');
    weDropCsvText=raw;weDropPreview=data;weDropValidation=null;
    wdRenderPreview(data);
    $('#wedropPreviewArea').hidden=false;
    $('#wedropOverwrite').checked=false;
    $('#wedropSkipInvalid').checked=false;
    $('#wedropImportBtn').disabled=true;
    $('#wedropZeroMatchLabel').hidden=true;
    $('#wedropAllowUnmatched').checked=false;
    wdSetNotice('#wedropValidationStatus',
      'Escolha as colunas corretas e clique em Validar SKUs e custos antes de importar.','info');
    wdSetNotice('#wedropPreviewSummary','Arquivo com '+wdNum(data.rowCount)+
      ' linhas. Selecione manualmente as colunas SKU e custo. Confira a prévia antes de confirmar.','info');
    wdSetNotice('#wedropImportStatus','Prévia concluída. Nenhum custo foi gravado no banco.','info');
  }catch(e){
    wdSetNotice('#wedropImportStatus','Falha na prévia: '+e.message,'error');
  }finally{
    button.disabled=false;button.textContent='Conferir colunas do arquivo';
  }
};
async function loadWeDropSourceState(){
  try{
    const status=await json('/api/shopee/wedrop/auto/status',{
      signal:AbortSignal.timeout(30000)
    });
    const saved=status.catalogStored===true&&Number(status.storedCosts)>0;
    const state=status.state||null;
    $('#wedropStoredCatalog').hidden=!saved;
    $('#wedropNoCatalogMessage').hidden=saved;
    $('#wedropSourceLoadError').hidden=true;
    if(saved){
      $('#wedropStoredName').textContent=status.savedCatalogName||
        'Catálogo de custos WeDrop';
      const savedAt=status.savedAt
        ?new Date(status.savedAt).toLocaleString('pt-BR'):'data não informada';
      $('#wedropStoredSummary').textContent='Os custos do fornecedor estão registrados no banco e podem ser usados nas conferências de anúncios.';
      $('#wedropStoredCountDetail').textContent=wdNum(status.storedCosts)+' SKUs com custo salvos';
      $('#wedropStoredLastSync').textContent='Última sincronização: '+savedAt;
      $('#wedropStoredLastCheck').textContent=state?
        'Última conferência: '+wdNum(state.changed_skus)+' custo(s) novos ou alterados':
        'Última conferência: ainda não registrada';
    }else{
      $('#wedropUploadDetails').open=true;
      $('#wedropNoCatalogMessage').textContent=
        'Ainda não há custos WeDrop cadastrados nesta loja. '+
        'Selecione um CSV ou Excel oficial uma única vez para começar.';
    }
    $('#wedropSourceStatus').textContent=
      status.feedConfigured
      ?'Conexão autorizada com a WeDrop configurada. '+status.feedStatus
      :'Catálogo já salvo continua disponível. Para detectar atualizações futuras sem enviar outro CSV, ainda falta conectar um feed/API autorizado da WeDrop.';
    $('#wedropCheckFeedBtn').hidden=!status.feedConfigured;
  }catch(error){
    // Jamais apresentar falha de leitura como se o catálogo tivesse desaparecido.
    $('#wedropSourceLoadError').hidden=false;
    $('#wedropSourceLoadError').textContent=
      'Não foi possível conferir agora o catálogo salvo: '+error.message+
      '. Seus custos não foram apagados. Tente atualizar o cruzamento.';
    $('#wedropSourceStatus').textContent='Falha temporária na verificação da origem.';
  }
}
$('#wedropMoveRefresh').onclick=async()=>{
  const visible=$('#wedropMoveRefresh');
  if(visible.disabled)return;
  visible.disabled=true;
  visible.setAttribute('aria-busy','true');
  try{
    await $('#wedropUseStoredBtn').onclick();
  }finally{
    visible.disabled=false;
    visible.removeAttribute('aria-busy');
  }
};
$('#wedropUseStoredBtn').onclick=async()=>{
  const button=$('#wedropUseStoredBtn');
  if(button.disabled)return;
  button.disabled=true;button.textContent='Atualizando vínculos...';
  try{
    await refreshWeDropCoverage();
    await loadWeDropSourceState();
  }finally{
    button.disabled=false;button.textContent='Atualizar vínculos com catálogo salvo';
  }
};
$('#wedropCheckFeedBtn').onclick=async()=>{
  const button=$('#wedropCheckFeedBtn');button.disabled=true;
  wdSetNotice('#wedropAutoStatus','Conferindo catálogo da origem autorizada...','info');
  try{
    const d=await json('/api/shopee/wedrop/auto/check',{
      method:'POST',signal:AbortSignal.timeout(180000)
    });
    wdSetNotice('#wedropAutoStatus',d.unchanged
      ?'Catálogo da origem não mudou desde a última sincronização.'
      :'Feed atualizado: '+wdNum(d.changedCosts)+' custos alterados.', 'success');
    await refreshWeDropCoverage();await loadWeDropSourceState();
    $('#wedropUploadDetails').open=false;
    // Não é possível preservar a seleção do arquivo no navegador;
    // o catálogo oficial já foi convertido em registros permanentes no Supabase.
  }catch(error){
    wdSetNotice('#wedropAutoStatus','Falha na consulta do feed: '+error.message,'error');
  }finally{button.disabled=false;}
};
$('#wedropFile').onchange=async()=>{
  wedropWorkbookRef=null;wedropWorkbookReadPromise=null;
  weDropCsvText=null;weDropPreview=null;weDropValidation=null;
  $('#wedropImportBtn').disabled=true;
  $('#wedropPreviewArea').hidden=true;
  $('#wedropZeroMatchLabel').hidden=true;
  const file=$('#wedropFile').files?.[0];
  if(!file)return;
  const control=$('#wedropFile');
  if(file.size>4_000_000){
    wdSetNotice('#wedropAutoStatus',
      'Arquivo acima de 4 MB. Divida o catálogo ou utilize uma origem de feed autorizada.','error');
    return;
  }
  control.disabled=true;
  wdSetNotice('#wedropAutoStatus',
    'Lendo catálogo oficial WeDrop e atualizando custos por SKU automaticamente...','info');
  try{
    const raw=await wdReadCatalogText(file);
    const result=await json('/api/shopee/wedrop/auto/import',{
      method:'POST',headers:{'Content-Type':'application/json'},
      body:JSON.stringify({csv:raw,fileName:file.name}),
      signal:AbortSignal.timeout(180000)
    });
    wdSetNotice('#wedropAutoStatus',
      'Atualização concluída! '+wdNum(result.uniqueCosts)+' SKUs identificados, '+
      wdNum(result.changedCosts)+' custos novos/alterados, '+
      wdNum(result.unchangedCosts)+' sem alteração, '+
      wdNum(result.matchingSupplierSkus)+' SKUs da WeDrop encontrados na Shopee. '+
      'Nenhum preço de anúncio foi alterado.','success');
    wdSetNotice('#wedropImportStatus',
      'Catálogo reconhecido e importado automaticamente. O formulário manual não foi utilizado.','success');
    await refreshWeDropCoverage();await loadWeDropSourceState();
  }catch(error){
    wdSetNotice('#wedropAutoStatus',
      'A atualização automática foi bloqueada: '+error.message+
      '. Se o arquivo não segue o layout oficial, abra a importação manual avançada.','error');
  }finally{control.disabled=false;}
};

function wdInvalidateValidation(){
  weDropValidation=null;
  $('#wedropImportBtn').disabled=true;
  $('#wedropZeroMatchLabel').hidden=true;
  $('#wedropAllowUnmatched').checked=false;
  wdSetNotice('#wedropValidationStatus',
    'As opções mudaram. Clique novamente em Validar SKUs e custos antes de importar.','info');
}
for(const id of ['#wedropSkuColumn','#wedropCostColumn','#wedropSkipInvalid']){
  $(id).onchange=wdInvalidateValidation;
}
$('#wedropOverwrite').onchange=wdInvalidateValidation;
$('#wedropAllowUnmatched').onchange=()=>{
  if(!weDropValidation)return;
  $('#wedropImportBtn').disabled=
    Boolean(weDropValidation.requiresZeroMatchApproval)&&!$('#wedropAllowUnmatched').checked;
};
$('#wedropValidateBtn').onclick=async()=>{
  const skuColumn=$('#wedropSkuColumn').value,costColumn=$('#wedropCostColumn').value;
  if(!weDropCsvText||!weDropPreview||skuColumn===''||costColumn===''||skuColumn===costColumn){
    wdSetNotice('#wedropValidationStatus',
      'Selecione duas colunas diferentes: SKU da WeDrop e custo real de aquisição.','error');return;
  }
  const btn=$('#wedropValidateBtn');
  btn.disabled=true;btn.textContent='Validando custos e SKUs...';
  $('#wedropImportBtn').disabled=true;
  weDropValidation=null;$('#wedropZeroMatchLabel').hidden=true;
  try{
    const result=await json('/api/shopee/wedrop/validate',{
      method:'POST',headers:{'Content-Type':'application/json'},
      body:JSON.stringify({
        csv:weDropCsvText,skuColumn:Number(skuColumn),costColumn:Number(costColumn),
        skipInvalid:$('#wedropSkipInvalid').checked===true
      }),signal:AbortSignal.timeout(90000)
    });
    const matched=result.comparison||{};
    weDropValidation=result;
    const zero=result.requiresZeroMatchApproval;
    wdSetNotice('#wedropValidationStatus',
      'Coluna SKU: '+result.skuHeader+' | Custo: '+result.costHeader+'. '+
      wdNum(result.uniqueCosts)+' custos únicos; '+
      wdNum(matched.matchedCount)+' correspondem exatamente a SKUs Shopee; '+
      wdNum(matched.unmatchedCount)+' ainda sem correspondência; '+
      wdNum(matched.variantsWaiting)+' anúncios com variações pendentes de leitura. '+
      wdNum(result.skippedInvalid)+' linhas inválidas ignoradas. '+
      matched.warning+(zero?' Se você escolher prosseguir sem vínculo, confirme a opção específica.':''),
      zero?'warning':'success');
    $('#wedropZeroMatchLabel').hidden=!zero;
    $('#wedropAllowUnmatched').checked=false;
    $('#wedropImportBtn').disabled=Boolean(zero);
  }catch(error){
    wdSetNotice('#wedropValidationStatus',
      'Validação rejeitada: '+error.message+
      ' Confira o SKU da WeDrop, e evite selecionar EAN/código de barras ou NCM como SKU.','error');
  }finally{
    btn.disabled=false;btn.textContent='Validar SKUs e custos antes de importar';
  }
};
let wdModelsLastUpdate=0;
$('#wedropStopModelsBtn').onclick=()=>{
  wedropStopRequested=true;
  $('#wedropStopModelsBtn').disabled=true;
  $('#wedropStopModelsBtn').textContent='Interrompendo após o lote...';
};
$('#wedropSyncModelsBtn').onclick=async()=>{
  if(weDropModelsRunning)return;
  weDropModelsRunning=true;wedropStopRequested=false;
  const run=$('#wedropSyncModelsBtn'),stop=$('#wedropStopModelsBtn');
  run.disabled=true;run.textContent='Sincronizando...';stop.hidden=false;stop.disabled=false;
  stop.textContent='Interromper';
  let done=0,issues=[],failedIds=new Set(),attempts=0;
  try{
    while(!wedropStopRequested&&attempts<160){
      attempts++;
      const params=new URLSearchParams();
      if(failedIds.size)params.set('exclude',[...failedIds].join(','));
      const pending=await json('/api/shopee/wedrop/models/pending?'+params,{
        signal:AbortSignal.timeout(25000)
      });
      if(!pending.items?.length){
        wdSetNotice('#wedropModelsStatus',
          (pending.totalPending===0?'Todas as variações foram consultadas.':
          'Ainda restam '+wdNum(pending.totalPending)+' anúncios pendentes; '+
          'alguns retornaram erros e foram ignorados nesta tentativa.')+
          ' Modelos sincronizados nesta execução: '+wdNum(done)+'.'+
          (issues.length?' Ocorrências: '+issues.slice(0,5).join(' | '):''),
          pending.totalPending===0?'success':'warning');
        break;
      }
      wdSetNotice('#wedropModelsStatus',
        'Consultando lote de '+wdNum(pending.items.length)+' itens. '+
        'Já sincronizados: '+wdNum(done)+'. Pendentes: '+wdNum(pending.totalPending)+
        '. Você pode interromper sem perder dados salvos.','info');
      const batch=await json('/api/shopee/wedrop/models/sync',{
        method:'POST',headers:{'Content-Type':'application/json'},
        body:JSON.stringify({itemIds:pending.items.map(x=>x.itemId)}),
        signal:AbortSignal.timeout(95000)
      });
      done+=(batch.successful||[]).length;
      for(const fail of batch.failed||[]){
        failedIds.add(fail.itemId);
        issues.push(fail.itemId+': '+fail.reason);
      }
      wdModelsLastUpdate=Date.now();
      if(!batch.processed){
        issues.push('Nenhum modelo retornado; consulte novamente mais tarde.');break;
      }
      await refreshWeDropCoverage();
      // Evita rajadas excessivas contra a API Shopee.
      await new Promise(resolve=>setTimeout(resolve,450));
    }
    if(wedropStopRequested)
      wdSetNotice('#wedropModelsStatus',
        'Sincronização interrompida após o lote atual. '+
        wdNum(done)+' anúncios sincronizados; clique novamente para continuar.','warning');
    else if(attempts>=160)
      wdSetNotice('#wedropModelsStatus',
        'Limite de lotes atingido. Consulte novamente para continuar. '+
        wdNum(done)+' anúncios sincronizados.','warning');
  }catch(error){
    wdSetNotice('#wedropModelsStatus',
      'Não foi possível continuar: '+error.message+
      '. Dados de lotes anteriores foram mantidos. Clique novamente para tentar.','error');
  }finally{
    weDropModelsRunning=false;run.disabled=false;run.textContent='Sincronizar variações pendentes';
    stop.hidden=true;await refreshWeDropCoverage();
  }
};

$('#wedropImportBtn').onclick=async()=>{
  if(weDropImportBusy)return;
  const skuColumn=$('#wedropSkuColumn').value,costColumn=$('#wedropCostColumn').value;
  if(!weDropPreview||!weDropCsvText||!weDropValidation||skuColumn===''||costColumn===''||skuColumn===costColumn||
     (weDropValidation.requiresZeroMatchApproval&&!$('#wedropAllowUnmatched').checked)){
    wdSetNotice('#wedropImportStatus','Selecione duas colunas diferentes: SKU e custo de aquisição.','error');return;
  }
  weDropImportBusy=true;
  const button=$('#wedropImportBtn');
  button.disabled=true;button.textContent='Importando...';
  wdSetNotice('#wedropImportStatus','Validando SKUs, custos e duplicidades antes de gravar no Supabase...','info');
  try{
    const data=await json('/api/shopee/wedrop/import',{
      method:'POST',headers:{'Content-Type':'application/json'},
      body:JSON.stringify({
        csv:weDropCsvText,skuColumn:Number(skuColumn),costColumn:Number(costColumn),
        overwrite:$('#wedropOverwrite').checked===true,
        skipInvalid:$('#wedropSkipInvalid').checked===true,
        allowUnmatched:weDropValidation?.requiresZeroMatchApproval===true&&
          $('#wedropAllowUnmatched').checked===true,
        fileName:$('#wedropFile').files?.[0]?.name||'wedrop.csv'
      }),
      signal:AbortSignal.timeout(120000)
    });
    wdSetNotice('#wedropImportStatus',
      'Importação concluída: '+wdNum(data.saved)+' custos gravados; '+
      wdNum(data.preservedExisting)+' valores existentes preservados; '+
      wdNum(data.updatedExisting)+' atualizados; '+
      wdNum(data.skippedInvalid)+' linhas ignoradas. Nenhum anúncio ou preço Shopee foi modificado.',
      'success');
    weDropCsvText=null;weDropValidation=null;
    $('#wedropPreviewArea').hidden=true;
    await refreshWeDropCoverage();
  }catch(e){
    wdSetNotice('#wedropImportStatus','Não foi possível concluir a importação: '+e.message+
      ' Verifique os dados antes de tentar novamente.','error');
  }finally{
    weDropImportBusy=false;button.disabled=false;button.textContent='Confirmar importação dos custos';
  }
};
let financeSkuBalances=new Map(); // Apenas vendas concluídas de SKU único com repasse confirmado.
// Central de pendências WeDrop — ações reais, confirmação explícita e possibilidade de desfazer.
let skuReviewBusy=false;
const reviewNode=(tag,className,textValue)=>{
  const el=document.createElement(tag);
  if(className)el.className=className;
  if(textValue!==undefined&&textValue!==null)el.textContent=String(textValue);
  return el;
};
function skuReviewAppendText(parent,tag,cls,txt){
  const el=reviewNode(tag,cls,txt);parent.appendChild(el);return el;
}
function skuReviewMoney(value){
  return value===null||value===undefined?'—':wdMoney(value);
}
function reviewCandidateControl(record,container){
  const edit=reviewNode('div','sku-review-control');
  const label=skuReviewAppendText(edit,'label','','SKU WeDrop para vincular');
  const input=reviewNode('input','sku-review-input');
  input.type='text';input.maxLength=120;input.autocomplete='off';
  input.placeholder='Digite SKU ou escolha uma sugestão';
  label.appendChild(input);
  const suggestions=skuReviewAppendText(edit,'div','sku-candidates','');
  if(!record.suggestions?.length){
    skuReviewAppendText(suggestions,'p','sku-candidate-empty',
      'Nenhum candidato evidente pelo código. Pesquise no catálogo e confira o fornecedor.');
  }else{
    for(const x of record.suggestions){
      const choose=reviewNode('button','sku-candidate');
      choose.type='button';
      choose.appendChild(skuReviewAppendText(choose,'strong','',x.supplierSku));
      choose.appendChild(skuReviewAppendText(choose,'span','',skuReviewMoney(x.unitCost)));
      choose.appendChild(skuReviewAppendText(choose,'small','',x.reason));
      choose.title='Selecionar SKU candidato para conferência';
      choose.onclick=()=>{input.value=x.supplierSku;input.focus();};
      suggestions.appendChild(choose);
    }
  }
  const status=skuReviewAppendText(edit,'p','sku-card-status','');
  status.setAttribute('role','status');
  const actions=reviewNode('div','sku-card-actions');
  const search=skuReviewAppendText(actions,'button','secondary','Buscar SKU');
  search.type='button';
  search.onclick=async()=>{
    const query=input.value.trim()||record.shopeeSku;
    if(query.length<2){status.textContent='Digite ao menos 2 caracteres para pesquisar.';return;}
    search.disabled=true;status.textContent='Pesquisando no catálogo salvo...';
    try{
      const data=await json('/api/shopee/wedrop/sku-search?q='+encodeURIComponent(query),{
        signal:AbortSignal.timeout(45000)
      });
      suggestions.replaceChildren();
      for(const match of data.results||[]){
        const b=reviewNode('button','sku-candidate');b.type='button';
        skuReviewAppendText(b,'strong','',match.supplierSku);
        skuReviewAppendText(b,'span','',skuReviewMoney(match.unitCost));
        b.onclick=()=>{input.value=match.supplierSku;input.focus();};
        suggestions.appendChild(b);
      }
      status.textContent=(data.results||[]).length
        ?'Selecione um dos resultados e confira o produto na WeDrop.'
        :'Nenhum SKU encontrado para esta pesquisa. Tente outro código.';
    }catch(e){status.textContent='Falha na pesquisa: '+e.message;}
    finally{search.disabled=false;}
  };
  const apply=skuReviewAppendText(actions,'button','','Confirmar vínculo');
  apply.type='button';
  apply.onclick=async()=>{
    const supplierSku=input.value.trim();
    if(!supplierSku){status.textContent='Escolha ou digite o SKU da WeDrop.';input.focus();return;}
    if(!window.confirm('Vincular o custo do SKU WeDrop '+supplierSku+
      ' ao anúncio Shopee '+record.shopeeSku+'?\n\n'+
      'Confirme que é o MESMO produto e variação. O código do anúncio na Shopee não será modificado.'))return;
    apply.disabled=true;search.disabled=true;status.textContent='Salvando vínculo confirmado...';
    try{
      const result=await json('/api/shopee/wedrop/sku-link',{
        method:'POST',headers:{'Content-Type':'application/json'},
        body:JSON.stringify({
          itemId:record.itemId,modelId:record.modelId||0,
          shopeeSku:record.shopeeSku,supplierSku
        })
      });
      status.textContent=result.message||'Vínculo salvo.';
      await refreshWeDropCoverage();
      await loadWeDropSkuReview();
    }catch(e){status.textContent='Não foi possível vincular: '+e.message;}
    finally{apply.disabled=false;search.disabled=false;}
  };
  edit.appendChild(actions);actions.append(search,apply);
  container.appendChild(edit);
}
function skuReviewRender(data){
  const total=Number(data.summary?.pending||0);
  $('#wedropReviewCount').textContent=wdNum(total);
  $('#wedropReviewSummary').textContent=total
    ?'anúncios ou variações sem custo correspondente — revise antes de vincular.'
    :'Nenhuma pendência de custo entre os SKUs já identificados.';
  const overall=$('#wedropReviewOverall');
  const extra=Number(data.summary?.waitingModels||0)+Number(data.summary?.missingSku||0);
  const clear=total===0&&extra===0&&Number(data.summary?.compared||0)>0;
  overall.dataset.state=clear?'success':total||extra?'warning':'loading';
  overall.textContent=clear?'Tudo vinculado':total||extra?
    wdNum(total)+' pendência(s) de custo · '+wdNum(extra)+' modelo(s)/SKU(s) não identificados':
    'Aguardando catálogo sincronizado';
  const list=$('#wedropReviewCards');list.replaceChildren();
  for(const x of data.pending||[]){
    const card=reviewNode('article','sku-review-card');
    const header=reviewNode('div','sku-review-item');
    const url=String(x.imageUrl||'');
    if(/^https:\/\/(cf\.shopee\.com\.br|down-br\.img\.susercontent\.com)\//i.test(url)){
      const image=document.createElement('img');image.src=url;image.alt='';
      image.loading='lazy';image.decoding='async';
      image.referrerPolicy='no-referrer';header.appendChild(image);
    }else header.appendChild(skuReviewAppendText(header,'span','sku-review-photo-fallback','📦'));
    const heading=reviewNode('div','sku-review-item-info');
    skuReviewAppendText(heading,'strong','',x.title||'Anúncio '+x.itemId);
    skuReviewAppendText(heading,'small','',
      'Item '+x.itemId+(x.modelId?' · Variação '+x.modelId:''));
    header.appendChild(heading);card.appendChild(header);
    const meta=reviewNode('div','sku-review-meta');
    skuReviewAppendText(meta,'span','sku-review-old','SKU Shopee: '+x.shopeeSku);
    skuReviewAppendText(meta,'span','sku-review-reason',x.reason);
    card.appendChild(meta);
    reviewCandidateControl(x,card);
    list.appendChild(card);
  }
  if(!total)list.appendChild(reviewNode('p','sku-review-all-clear',
    'Os SKUs identificados estão com custos vinculados. Acompanhe novas variações e anúncios por esta página.'));
  $('#wedropReviewedCount').textContent=wdNum((data.confirmedLinks||[]).length);
  const links=$('#wedropReviewedList');links.replaceChildren();
  for(const x of data.confirmedLinks||[]){
    const wrap=reviewNode('div','sku-reviewed-row');
    const detail=reviewNode('div','sku-reviewed-info');
    skuReviewAppendText(detail,'strong','',x.shopeeSku+' → '+x.supplierSku);
    skuReviewAppendText(detail,'small','',
      'Item '+x.itemId+(x.modelId!=='0'?' · Variação '+x.modelId:'')+
      ' · Custo '+skuReviewMoney(x.unitCost));
    wrap.appendChild(detail);
    const undo=skuReviewAppendText(wrap,'button','secondary','Desfazer vínculo');
    undo.type='button';
    undo.onclick=async()=>{
      if(!window.confirm('Desfazer o vínculo de custo '+x.shopeeSku+' → '+x.supplierSku+
        '?\nO produto voltará às pendências se não existir correspondência exata.'))return;
      undo.disabled=true;
      try{
        await json('/api/shopee/wedrop/sku-unlink',{
          method:'POST',headers:{'Content-Type':'application/json'},
          body:JSON.stringify({itemId:x.itemId,modelId:x.modelId})
        });
        await refreshWeDropCoverage();
        await loadWeDropSkuReview();
      }catch(e){
        $('#wedropReviewMessage').textContent='Não foi possível desfazer: '+e.message;
        undo.disabled=false;
      }
    };
    links.appendChild(wrap);
  }
  $('#wedropReviewedLinks').hidden=!(data.confirmedLinks||[]).length;
  $('#wedropReviewMessage').textContent=total?
    (data.warning||'Confira o SKU do fornecedor antes de vincular.'):
    'Nenhuma pendência de custo encontrada entre os SKUs identificados. '+
    (extra?'Ainda há variações ou SKUs a sincronizar.':'Novos produtos devem ser conferidos ao sincronizar.');
}
async function loadWeDropSkuReview(){
  if(skuReviewBusy)return;
  skuReviewBusy=true;
  const btn=$('#wedropReviewRefreshBtn');
  btn.disabled=true;btn.textContent='Conferindo...';
  $('#wedropReviewMessage').textContent='Consultando anúncios e sugestões do catálogo salvo...';
  try{
    const data=await json('/api/shopee/wedrop/sku-review',{
      signal:AbortSignal.timeout(55000)
    });
    skuReviewRender(data);
  }catch(error){
    $('#wedropReviewOverall').textContent='Conferência indisponível';
    $('#wedropReviewOverall').dataset.state='warning';
    $('#wedropReviewMessage').textContent=
      'Não foi possível consultar as pendências: '+error.message+
      '. Os vínculos existentes não foram alterados. Clique em Revisar pendências para tentar novamente.';
  }finally{
    skuReviewBusy=false;btn.disabled=false;btn.textContent='Revisar pendências';
  }
}
$('#wedropReviewRefreshBtn').onclick=()=>{void loadWeDropSkuReview();};
$('#wedropGotoPending').onclick=()=>{
  $('#wedropSkuReview').scrollIntoView?.({behavior:'smooth',block:'start'});
  void loadWeDropSkuReview();
};

let wedropSelectedFilter='matched',wedropNextOffset=null,wedropTableLoading=false;
function setWedropTab(filter){
  wedropSelectedFilter=filter;
  for(const [name,id] of Object.entries({
    matched:'#wedropTabMatched',unmatched:'#wedropTabUnmatched',all:'#wedropTabAll'
  })){
    const active=filter===name;
    $(id).classList.toggle('active',active);
    $(id).setAttribute('aria-pressed',String(active));
  }
  wedropNextOffset=null;
  refreshWeDropCoverage();
}
$('#wedropTabMatched').onclick=()=>setWedropTab('matched');
$('#wedropTabUnmatched').onclick=()=>setWedropTab('unmatched');
$('#wedropTabAll').onclick=()=>setWedropTab('all');
$('#wedropTableMoreBtn').onclick=()=>refreshWeDropCoverage({append:true});
async function refreshWeDropCoverage({append=false}={}){
  if(wedropTableLoading)return;
  if(append&&wedropNextOffset===null)return;
  const button=$('#wedropRefreshBtn'),more=$('#wedropTableMoreBtn');
  wedropTableLoading=true;
  button.disabled=true;
  more.disabled=true;
  button.textContent='Consultando...';
  const requestedFilter=wedropSelectedFilter;
  const offset=append?wedropNextOffset:0;
  if(!append)wdSetNotice('#wedropCoverageStatus','Conferindo os custos vinculados à Shopee...','info');
  try{
    const query=new URLSearchParams({filter:requestedFilter,offset:String(offset)});
    const data=await json('/api/shopee/wedrop/coverage?'+query,{
      signal:AbortSignal.timeout(45000)
    });
    const t=data.totals||{};
    const costsAvailable=data.hasImportedCosts===true&&(Number(t.importedCosts)||0)>0;
    $('#wedropCompared').textContent=wdNum(t.comparedSkus);
    $('#wedropPendingModels').textContent=wdNum(t.waitingModels);
    $('#wedropImported').textContent=wdNum(t.importedCosts);
    const expectedExtra=Number(t.waitingModels||0)+Number(t.withoutSku||0);
    const modelsNotice=$('#wedropVariantsNotice');
    modelsNotice.textContent=Number(t.waitingModels)>0?
      wdNum(t.waitingModels)+' anúncio(s) possuem variações ainda não sincronizadas. Clique em Sincronizar variações pendentes.':
      'Nenhuma variação pendente encontrada na última conferência.';
    modelsNotice.dataset.state=t.waitingModels?'warning':'success';
    const summaryState=$('#wedropCoverageStatus');
    summaryState.dataset.coverage=t.missingCost===0&&expectedExtra===0&&Number(t.comparedSkus)>0?'complete':'pending';
    $('#wedropNoCosts').hidden=costsAvailable;
    $('#wedropFinancialResults').hidden=!costsAvailable;
    document.querySelectorAll('.wedrop-financial-metric')
      .forEach(node=>{node.hidden=!costsAvailable;});
    const body=$('#wedropCoverageBody');
    if(!append)body.replaceChildren();
    if(!costsAvailable){
      $('#wedropNoCostsMessage').textContent=
        'Ainda não existem custos WeDrop cadastrados. Os dados da Shopee estão preservados. '+
        'Ao importar o catálogo WeDrop, os produtos vinculados aparecerão automaticamente.';
      wdSetNotice('#wedropCoverageStatus',
        'Shopee: '+wdNum(t.catalogItems)+' anúncios, '+wdNum(t.comparedSkus)+
        ' registros de SKU identificados; '+wdNum(t.waitingModels)+' anúncios aguardando variações.','info');
      $('#wedropTableStatus').textContent='';
      more.hidden=true;wedropNextOffset=null;
      return;
    }
    $('#wedropMatched').textContent=wdNum(t.matched);
    $('#wedropMissingCost').textContent=wdNum(t.missingCost);
    $('#wedropTabMatched').textContent='Com custo vinculado ('+wdNum(t.matched)+')';
    $('#wedropTabUnmatched').textContent='Pendentes ('+wdNum(t.missingCost)+')';
    $('#wedropTabAll').textContent='Todos ('+wdNum(t.comparedSkus)+')';
    for(const x of data.rows||[]){
      const tr=document.createElement('tr');
      for(const val of [
        x.name||'Anúncio '+x.itemId,x.sku,
        wdMoney(x.price),wdMoney(x.unitCost),
        financeSkuBalances.has(x.sku)?wdMoney(financeSkuBalances.get(x.sku).balanceBeforeAds):'—',
        x.costMatched?(financeSkuBalances.has(x.sku)?'Saldo verificado (antes de Ads)':'Custo vinculado; aguardando vendas verificadas'):'Código não encontrado na WeDrop'
      ]){
        const td=document.createElement('td');
        td.textContent=String(val);
        tr.appendChild(td);
      }
      if(!x.costMatched)tr.className='wedrop-missing';
      body.appendChild(tr);
    }
    if(!data.rows?.length&&!append){
      const tr=document.createElement('tr'),td=document.createElement('td');
      td.colSpan=6;
      td.textContent=requestedFilter==='unmatched'
        ?'Todos os SKUs estão vinculados. Não há pendências.'
        :'Nenhum registro nesta situação.';
      tr.appendChild(td);body.appendChild(tr);
    }
    wedropNextOffset=data.nextOffset===null||data.nextOffset===undefined
      ?null:Number(data.nextOffset);
    more.hidden=wedropNextOffset===null;
    const displayed=Math.min((data.offset||0)+(data.rows?.length||0),data.totalFiltered||0);
    $('#wedropTableStatus').textContent='Exibindo '+wdNum(displayed)+
      ' de '+wdNum(data.totalFiltered||0)+' registros nesta aba. '+
      (requestedFilter==='unmatched'
        ?'Somente códigos não encontrados. Confira o SKU na WeDrop antes de vincular; o sistema não supõe custos.'
        :'Os vínculos confirmados estão listados por SKU.');
    wdSetNotice('#wedropCoverageStatus',
      'Cruzamento validado: '+wdNum(t.matched)+' de '+wdNum(t.comparedSkus)+
      ' registros de SKU da Shopee estão com custo WeDrop vinculado. '+
      wdNum(t.missingCost)+' precisam de conferência. '+
      'Outros '+wdNum(t.supplierSkusNotMatched)+
      ' SKUs existem no catálogo WeDrop, mas não estão publicados na Shopee — isso não significa erro. '+
      'O saldo por SKU só aparece após conferir pedidos concluídos; não equivale a lucro líquido final.',
      t.missingCost?'warning':'success');
  }catch(error){
    if(!append){
      $('#wedropNoCosts').hidden=true;
      $('#wedropFinancialResults').hidden=true;
      document.querySelectorAll('.wedrop-financial-metric')
        .forEach(node=>{node.hidden=true;});
    }
    wdSetNotice('#wedropCoverageStatus',
      'Não foi possível atualizar o cruzamento: '+error.message+
      '. Os dados exibidos podem estar desatualizados. Tente novamente.','error');
  }finally{
    wedropTableLoading=false;
    button.disabled=false;button.textContent='Atualizar cruzamento';
    more.disabled=false;
  }
}
$('#wedropRefreshBtn').onclick=refreshWeDropCoverage;
// Tabela financeira compacta: somente dados de pedidos reais verificados.
// Mantém registros sem venda visíveis, mas não supõe que não venderam fora do recorte.

// Optimizer 1.14.0: auditoria em tempo real, somente leitura da Shopee.
let optimizerSettingsLoaded=false,optimizerSettingsPending=false,optimizerBusy=false;
const optimizerMake=(tag,cls,textValue)=>{
  const node=document.createElement(tag);
  if(cls)node.className=cls;
  if(textValue!==undefined&&textValue!==null)node.textContent=String(textValue);
  return node;
};
function optimizerNotice(message,state='info'){
  const el=$('#optimizerStatus');if(!el)return;
  el.textContent=String(message);el.dataset.state=state;
}
async function optimizerLoadSettings(){
  if(optimizerSettingsLoaded||optimizerSettingsPending)return;
  optimizerSettingsPending=true;
  $('#optimizerSavedAt').textContent='Consultando o Supabase...';
  try{
    const data=await json('/api/shopee/optimizer/settings',{signal:AbortSignal.timeout(22000)});
    $('#optimizerPrompt').value=String(data.settings?.image_prompt||'');
    $('#optimizerFiscalNotes').value=String(data.settings?.fiscal_notes||'');
    $('#optimizerSavedAt').textContent=data.settings?.updated_at
      ?'Salvo '+fmtDate(data.settings.updated_at):'Nenhuma regra salva ainda';
    optimizerSettingsLoaded=true;
  }catch(error){
    $('#optimizerSavedAt').textContent='Não foi possível carregar as regras: '+error.message;
  }finally{optimizerSettingsPending=false;}
}
$('#optimizerSave').onclick=async()=>{
  const btn=$('#optimizerSave');btn.disabled=true;
  $('#optimizerSavedAt').textContent='Salvando...';
  try{
    const result=await json('/api/shopee/optimizer/settings',{
      method:'POST',headers:{'Content-Type':'application/json'},
      body:JSON.stringify({
        imagePrompt:$('#optimizerPrompt').value,
        fiscalNotes:$('#optimizerFiscalNotes').value
      }),signal:AbortSignal.timeout(22000)
    });
    optimizerSettingsLoaded=true;
    $('#optimizerSavedAt').textContent='Regras salvas em '+fmtDate(result.settings.updated_at);
  }catch(e){$('#optimizerSavedAt').textContent='Falha ao salvar: '+e.message;}
  finally{btn.disabled=false;}
};
// A UI recebe só SKU; o Item ID técnico vem do catálogo Shopee, não do usuário.
let optimizerSkuInputTimer=null,optimizerSkuLookupSerial=0,optimizerNextAudit=null,optimizerSkuRequest=null;
function optimizerCancelSkuLookup(){
 if(optimizerSkuRequest){optimizerSkuRequest.abort();optimizerSkuRequest=null;}
 $('#optimizerFind').disabled=false;
}
async function optimizerFindSku({deep=false}={}){
 const btn=$('#optimizerFind'),target=$('#optimizerCandidates'),sku=$('#optimizerSku').value.trim();
 if(optimizerSkuInputTimer){clearTimeout(optimizerSkuInputTimer);optimizerSkuInputTimer=null;}
 optimizerCancelSkuLookup();
 const serial=++optimizerSkuLookupSerial;
 const controller=new AbortController();
 optimizerSkuRequest=controller;
 target.replaceChildren();
 $('#optimizerAuditPanel').hidden=true;
 btn.disabled=true;
 optimizerNotice((deep?'Conferindo catálogo completo':'Buscando SKU exata')+' '+sku+' na Shopee...');
 try{
  if(!sku)throw Error('Informe somente o SKU do produto.');
  // Supplier price lookup remains independent of the Shopee listing.
  void shPricePreviewSupplierSku(sku,serial);
  const d=await json('/api/shopee/optimizer/find?'+new URLSearchParams({sku,...(deep?{deep:'1'}:{})}),{
   signal:AbortSignal.any([controller.signal,AbortSignal.timeout(deep?120000:90000)])
  });
  if(serial!==optimizerSkuLookupSerial||$('#optimizerSku').value.trim()!==sku)return;
  const matches=d.matches||[];
  if(!matches.length){
   optimizerNotice(deep
    ?'SKU não confirmada na busca completa. Verifique a loja, o SKU exato ou sincronize o catálogo. '+(d.message||'')
    :'SKU não encontrada no cache ou na pesquisa direta. Use Busca aprofundada para conferir mais anúncios.','warning');
   if(!deep&&d.canDeepSearch!==false){
    const more=optimizerMake('button','secondary','Busca aprofundada');more.type='button';
    more.onclick=()=>void optimizerFindSku({deep:true});
    target.append(more);
   }
   return;
  }
  if(matches.length===1){
   const replaced=(d.retiredItemIds||[]).filter(id=>String(id)!==String(matches[0].itemId));
   optimizerNotice(replaced.length?
    'Vínculo antigo '+replaced.join(', ')+' descartado: SKU '+sku+
     ' localizada em anúncio NORMAL ID '+matches[0].itemId+
     '. Consultando a nova ficha. Preços e planos do anúncio excluído NÃO serão transferidos.':
    'Produto confirmado na Shopee: ID '+matches[0].itemId+
     ' · situação '+matches[0].status+'. Conferindo ficha técnica...','success');
   $('#optimizerItemId').value=matches[0].itemId;
   await optimizerRunAudit(matches[0].itemId,sku,matches[0].modelId);
   return;
  }
  // SKU repetida: só escolher automaticamente se TODAS as datas oficiais foram
  // confirmadas e uma delas for estritamente a mais recente.
  const preferred=d.preferredItemId&&matches.find(x=>String(x.itemId)===String(d.preferredItemId));
  if(preferred&&matches.every(x=>Number(x.createTime)>0)){
   const created=new Date(Number(preferred.createTime)*1000).toLocaleString('pt-BR');
   optimizerNotice('Anúncios repetidos: selecionado automaticamente o mais recente pela data de criação da Shopee ('+created+'), Item ID '+preferred.itemId+'. Conferindo a ficha oficial antes de qualquer execução.','success');
   $('#optimizerItemId').value=preferred.itemId;
   await optimizerRunAudit(preferred.itemId,sku,preferred.modelId);
   return;
  }
  optimizerNotice('A Shopee confirmou '+matches.length+' anúncios/variações para a SKU '+sku+
   '. Selecione o Item ID do produto que deseja atualizar. Anúncios excluídos foram filtrados.','warning');
  for(const match of matches){
   const el=optimizerMake('button','optimizer-candidate');el.type='button';
   if(match.imageUrl&&financeCatalogImage(match.imageUrl)){
    const img=optimizerMake('img');img.src=match.imageUrl;img.alt='';
    img.loading='lazy';el.appendChild(img);
   }
   const wrapper=optimizerMake('span');
   wrapper.appendChild(optimizerMake('span','',match.title||'Produto Shopee'));
   wrapper.appendChild(optimizerMake('small','',
    'SKU '+match.sku+(match.modelId!=='0'?' · Variação '+match.modelId:'')+
    ' · Anúncio '+match.itemId+(Number(match.createTime)>0?' · Criado em '+new Date(Number(match.createTime)*1000).toLocaleDateString('pt-BR'):' · Data de criação indisponível')));
   el.appendChild(wrapper);
   el.onclick=()=>{ $('#optimizerItemId').value=match.itemId;
    void optimizerRunAudit(match.itemId,sku,match.modelId); };
   target.appendChild(el);
  }
 }catch(e){
  if(serial===optimizerSkuLookupSerial&&$('#optimizerSku').value.trim()===sku){
   const aborted=controller.signal.aborted;
   optimizerNotice(aborted?'Consulta anterior substituída pelo SKU digitado.':
    'A busca rápida do anúncio falhou: '+e.message+
    '. O custo WeDrop continua independente; tente novamente ou utilize a busca aprofundada.','warning');
   if(!aborted&&!deep){
    const retry=optimizerMake('button','secondary','Busca aprofundada');retry.type='button';
    retry.onclick=()=>void optimizerFindSku({deep:true});
    target.replaceChildren(retry);
   }
  }
 }finally{
  if(optimizerSkuRequest===controller){
   optimizerSkuRequest=null;btn.disabled=false;
  }
 }
}
$('#optimizerFind').onclick=()=>void optimizerFindSku();
$('#optimizerSku')?.addEventListener?.('input',event=>{
 const value=$('#optimizerSku').value.trim();
 if(globalThis.__RA_KIT_OPTIMIZATION_HANDOFF?.sku!==value)
  globalThis.__RA_KIT_OPTIMIZATION_HANDOFF=null;
 if(optimizerSkuInputTimer)clearTimeout(optimizerSkuInputTimer);
 ++optimizerSkuLookupSerial;
 optimizerCancelSkuLookup();
 // A troca da SKU é um NOVO trabalho, não uma retomada da tarefa anterior.
 // Pausar a ponte sem apagar as imagens já confirmadas no servidor.
 void optimizerChatBridgeSwitchSku(value);
 optimizerImagesStopRequested=true;
 optimizerImagesSavedSlots=new Set();
 optimizerImagesAutoBusy=false;
 optimizerImageCorrectionPreviewMap=new Map();
 const prepared=$('#optimizerCommercialPreparedCount');if(prepared)prepared.textContent='0';
 const summary=$('#optimizerCommercialGallerySummary');if(summary)summary.textContent='0 / 9 imagens preparadas';
 const saved=$('#optimizerImagesFilterSavedCount');if(saved)saved.textContent='0';
 const pending=$('#optimizerImagesFilterPendingCount');if(pending)pending.textContent='9';
 const all=$('#optimizerCommercialGalleryProgress');if(all)all.value=0;
 const gallery=$('#optimizerImagesGallery');if(gallery)gallery.replaceChildren();
 const bridgeStatus=$('#optimizerChatgptBridgeStatus');
 if(bridgeStatus)bridgeStatus.textContent='Nova SKU '+(value||'a selecionar')+
  ': ponte anterior desativada. A geração começa somente para esta SKU.';
 // Clear stale results immediately when the user changes the SKU.
 $('#optimizerCandidates').replaceChildren();
 $('#optimizerQuickValues').hidden=true;
 $('#priceResults').hidden=true;
 $('#optimizerSupplierResult').hidden=true;
 $('#optimizerWorkflowPanel').hidden=true;
 optimizerWorkflowPlan=null;optimizerWorkflowStage=null;optimizerWorkflowSerial++;
 optimizerWorkflowActiveView=null;
 $('#optimizerDiscountReviewInline').hidden=true;
 $('#optimizerWorkflowEditor').hidden=true;
 $('#optimizerExecutionPanel').hidden=true;
 globalThis.OptimizerSkuDashboard?.reset?.();
 optimizerExecReset();
 shPriceCurrentQuote=null;
 shPriceSupplierQuote=null;
 shPriceSelection=null;
 optimizerDiscountFinalQuote=null;optimizerDiscountFinalIdentity='';
 optimizerDiscountFinalPreviewData=null;optimizerDiscountFinalPreviewKey='';
 optimizerDiscountFinalSent=false;
 ++optimizerDiscountFinalLoading;
 optimizerDiscountFinalPaint();
 try{sessionStorage.removeItem(shPriceSelectionKey);}catch{}
 if(!value){
  $('#optimizerQuickStatus').textContent='Informe uma SKU para calcular automaticamente.';
  optimizerNotice('Informe a SKU para localizar e analisar.');
  return;
 }
 if(value.length<4){
  $('#optimizerQuickStatus').textContent='Continue digitando o SKU ou clique em Buscar SKU.';
  optimizerNotice('Aguardando SKU completa para evitar buscas parciais.');
  return;
 }
 if(event?.detail?.onlyPrefill===true){
  $('#optimizerQuickStatus').textContent='SKU '+value+' preenchida a partir da Shopee Ads. Clique em Buscar SKU para consultar.';
  optimizerNotice('SKU '+value+' pronta no campo. Clique em Buscar SKU quando desejar iniciar a análise.','info');
  return;
 }
 $('#optimizerQuickStatus').textContent='Aguardando o término da digitação para localizar a SKU '+value+'...';
 // A consulta é cancelável por serial: não atrasar 1s após cada SKU completa.
 optimizerSkuInputTimer=setTimeout(()=>void optimizerFindSku(),350);
});
function adsFillOptimizerSku(value){
 const sku=String(value||'').trim();
 if(!sku)return false;
 const field=$('#optimizerSku');
 if(!field)return false;
 optimizerAdsHandoffSku=sku;
 setTab('optimizer');
 // O CustomEvent executa apenas a limpeza de dados antigos, sem agendar busca.
 field.value=sku;
 field.dispatchEvent(new CustomEvent('input',{bubbles:true,detail:{onlyPrefill:true}}));
 $('#optimizerItemId').value='';
 field.scrollIntoView({behavior:'smooth',block:'center'});
 field.focus({preventScroll:true});
 return true;
}
globalThis.redeAdsOpenOptimizerSku=adsFillOptimizerSku;
// Entrar na otimização do anúncio do Kit já existente, sem criar novo Item ID.
// A mesma instancia de etapas, validacoes e execucao, sem duplicar as rotas Shopee.
let kitOptimizerHome=null,kitOptimizerNext=null,kitOptimizerEmbedded=false;
let kitDiscountHome=null,kitDiscountNext=null,kitOptimizerDiscountConfirmedIdentity='',kitOptimizerDiscountPreparedIdentity='';
function optimizerKitDiscountReviewState(w){
 if(!w?.kitOptimization?.kitSku)return {prepared:false,confirmed:false};
 const kit=String(w.kitOptimization.kitSku),id=String(w.itemId),
  model=String(w.modelId||'0'),key=kit+'|'+id,
  preview=w.kitDiscountPreview,publication=w.kitDiscountPublication;
 const same=(entry)=>entry&&entry.kitSku===kit&&String(entry.itemId)===id&&
  String(entry.modelId||'0')===model;
 const currentCampaign=String($('#kitOptimizeDiscountId')?.value||'');
 const campaignMatches=(entry)=>!currentCampaign||
  String(entry.discountId)===currentCampaign;
 // Validade da revisão em si: o desconto só poderá ser aplicado após nova
 // leitura da Shopee e um token fresco de autorização.
 const time=Date.parse(preview?.preparedAt||'');
 const recent=Number.isFinite(time)&&Date.now()>=time&&Date.now()-time<24*3600000;
 const prepared=Boolean(same(preview)&&preview.status==='prepared'&&
  recent&&campaignMatches(preview))||kitOptimizerDiscountPreparedIdentity===key;
 const confirmed=Boolean(same(publication)&&publication.status==='confirmed')||
  kitOptimizerDiscountConfirmedIdentity===key;
 return {prepared:prepared||confirmed,confirmed};
}
function kitOptimizerDiscountMount(){
 const review=$('#optimizerDiscountReviewInline'),specific=$('#kitOptimizeExistingPanel .kit-existing-discount');
 const generic=$('#optimizerExecDiscountFinal');
 if(!review||!specific||!generic)return false;
 if(!kitDiscountHome){kitDiscountHome=specific.parentNode;kitDiscountNext=specific.nextSibling;}
 if(specific.parentNode!==review)review.append(specific);
 specific.hidden=false;generic.hidden=true;
 return true;
}
function kitOptimizerDiscountUnmount(){
 const specific=$('#kitOptimizeExistingPanel .kit-existing-discount'),generic=$('#optimizerExecDiscountFinal');
 if(specific){
  specific.hidden=true;
  if(kitDiscountHome&&specific.parentNode!==kitDiscountHome)
   kitDiscountHome.insertBefore(specific,kitDiscountNext?.parentNode===kitDiscountHome?kitDiscountNext:null);
 }
 if(generic)generic.hidden=false;
}
globalThis.RAKitDiscountPrepared=({kitSku,itemId,discountId,reviewSaved=false,
 preview=null,clear=false}={})=>{
 const w=optimizerWorkflowPlan;
 if(!w||!optimizerKitWorkflowActive()||
   String(w.kitOptimization?.kitSku)!==String(kitSku))return;
 if(clear){
  kitOptimizerDiscountPreparedIdentity='';
  w.kitDiscountPreview=null;
 }else if(reviewSaved===true&&String(w.itemId)===String(itemId)&&preview){
  kitOptimizerDiscountPreparedIdentity=String(kitSku)+'|'+String(itemId);
  w.kitDiscountPreview={kitSku:String(kitSku),itemId:String(itemId),
   modelId:String(w.modelId||'0'),discountId:String(discountId),
   status:'prepared',gross:preview.gross,promo:preview.promo,
   afterCoupon:preview.afterCoupon,preparedAt:new Date().toISOString()};
 }
 optimizerDiscountWorkflowRefresh();
 optimizerKitDiscountShortcutPaint(w);
 if(optimizerExecProgress&&optimizerExecJob)
  optimizerExecutionTrackerRender(optimizerExecProgress,optimizerExecJob);
};
globalThis.RAKitDiscountConfirmed=({kitSku,itemId}={})=>{
 const w=optimizerWorkflowPlan;
 if(!w||String(w.kitOptimization?.kitSku)!==String(kitSku)||
  String(w.itemId)!==String(itemId))return;
 kitOptimizerDiscountConfirmedIdentity=kitSku+'|'+itemId;
 kitOptimizerDiscountPreparedIdentity='';
 w.kitDiscountPublication={kitSku:String(kitSku),itemId:String(itemId),
  modelId:String(w.modelId||'0'),status:'confirmed',
  confirmedAt:new Date().toISOString()};
 optimizerDiscountWorkflowRefresh();
 if(optimizerExecProgress&&optimizerExecJob)
  optimizerExecutionTrackerRender(optimizerExecProgress,optimizerExecJob);
};
function optimizerKitDiscountShortcutPaint(w=optimizerWorkflowPlan){
 const button=$('#optimizerExecutionKitDiscountOnly');
 if(!button)return;
 const link=w?.kitOptimization,preview=w?.kitDiscountPreview;
 const matching=Boolean(link?.kitSku&&preview?.status==='prepared'&&
  String(preview.kitSku)===String(link.kitSku)&&
  String(preview.itemId)===String(w.itemId)&&
  String(preview.modelId||'0')===String(w.modelId||'0')&&
  Number(preview.gross)>Number(preview.promo)&&Number(preview.promo)>0);
 const confirmed=Boolean(w?.kitDiscountPublication?.status==='confirmed'&&
  String(w.kitDiscountPublication.itemId)===String(w.itemId));
 button.hidden=!matching||confirmed;
 if(!button.hidden){
  button.textContent='▶ Preparar somente preço + desconto · '+shPriceMoney(preview.promo);
  button.title='Etapa 08 da SKU '+w.sku+': preço bruto calculado '+
   shPriceMoney(preview.gross)+' e preço promocional planejado '+
   shPriceMoney(preview.promo)+'. As outras sete etapas serão preservadas.';
 }
}
function kitOptimizerMount(){
 const host=$('#kitOptimizerWorkspace'),panel=$('#optimizerWorkflowPanel');
 if(!host||!panel)return false;
 if(!kitOptimizerHome){kitOptimizerHome=panel.parentNode;kitOptimizerNext=panel.nextSibling;}
 if(panel.parentNode!==host)host.append(panel);
 host.hidden=false;kitOptimizerEmbedded=true;
 panel.classList.add('kit-embedded-real-workflow');
 const handoff=globalThis.__RA_KIT_OPTIMIZATION_HANDOFF;
 const identity=$('#kitOptimizerWorkspaceIdentity');
 if(identity&&handoff)identity.textContent=handoff.kitSku+' · Item ID '+handoff.itemId;
 return true;
}
function kitOptimizerUnmount(){
 kitOptimizerDiscountUnmount();
 const panel=$('#optimizerWorkflowPanel');
 $('#kitWorkflowCampaignChooser')?.remove();
 $('#optimizerExecDiscountCampaign')?.closest('label')?.classList.remove('kit-workflow-original-campaign');
 if(kitOptimizerHome&&panel&&panel.parentNode!==kitOptimizerHome)
  kitOptimizerHome.insertBefore(panel,kitOptimizerNext?.parentNode===kitOptimizerHome?kitOptimizerNext:null);
 panel?.classList.remove('kit-embedded-real-workflow');
 kitOptimizerEmbedded=false;
}
globalThis.redeKitCloseOptimizerWorkspace=()=>{
 kitOptimizerUnmount();
 const host=$('#kitOptimizerWorkspace');if(host)host.hidden=true;
 if(globalThis.__RA_KIT_OPTIMIZATION_HANDOFF?.embed)
  globalThis.__RA_KIT_OPTIMIZATION_HANDOFF=null;
};
globalThis.redeKitOpenOptimizerTarget=({sku,itemId,modelId='0',kitSku,targetMarginPct,shipping,packing,embed=true}={})=>{
 const code=String(sku||'').trim(),id=String(itemId||'').trim();
 if(!code||!/^[1-9]\d{0,17}$/.test(id))return false;
 globalThis.__RA_KIT_OPTIMIZATION_HANDOFF={sku:code,itemId:id,
  modelId:String(modelId||'0'),kitSku:String(kitSku||''),
  targetMarginPct:Number(targetMarginPct),shipping:Number(shipping),packing:Number(packing),embed:Boolean(embed)};
 if(embed&&$('#kitOptimizerWorkspace')){
  if(!kitOptimizerMount())return false;
  const status=$('#kitOptimizerWorkspaceStatus');if(status){
   status.hidden=false;status.textContent='Carregando as oito etapas reais de revisão e execução...';
  }
 }else setTab('optimizer');
 const field=$('#optimizerSku');if(!field)return false;
 field.value=code;
 field.dispatchEvent(new CustomEvent('input',{bubbles:true,detail:{onlyPrefill:true}}));
 $('#optimizerItemId').value=id;
 optimizerNotice('Kit '+String(kitSku||'')+' · Item ID '+id+' · Preço por todos os componentes WeDrop.','info');
 void optimizerRunAudit(id,code,String(modelId||'0'));
 return true;
};
globalThis.redeAdsPrepareReserve=(sku,percent)=>{
 const pct=Number(percent);
 if(!Number.isFinite(pct)||pct<=0||pct>40)return false;
 adsReserveRequest={sku:String(sku||'').trim(),pct};
 return adsFillOptimizerSku(sku);
};
$('#optimizerSku').onkeydown=event=>{
 if(event.key==='Enter'){
  event.preventDefault();
  if(optimizerSkuInputTimer)clearTimeout(optimizerSkuInputTimer);
  void optimizerFindSku();
 }
};
// Etapas persistentes para o mesmo Item ID/modelo/SKU. Nenhum write na Shopee.
let optimizerWorkflowPlan=null,optimizerWorkflowStage=null,optimizerWorkflowSerial=0;
let optimizerWorkflowActiveView=null,optimizerWorkflowSourceStage=null;
function optimizerKitWorkflowActive(){
 const w=optimizerWorkflowPlan,h=globalThis.__RA_KIT_OPTIMIZATION_HANDOFF;
 return Boolean(kitOptimizerEmbedded&&h?.embed&&w?.kitOptimization?.kitSku===h.kitSku&&
  String(w.itemId)===String(h.itemId)&&String(w.sku)===String(h.sku));
}
const workflowImageGuide=[
 'Imagem 1 — Capa: produto em destaque, ocupando aproximadamente 85% da imagem.',
 'Imagem 2 — Uso real: ambiente, personagem e câmera diferentes das outras oito imagens; sem reutilizar a fotografia anterior.',
 'Imagem 3 — Medidas: dimensões reais junto aos contornos do produto com setas finas; capacidade e peso laterais pequenos somente se confirmados na WeDrop. Fundo HD moderno visível, sem título ESPECIFICAÇÕES ou quadros brancos.',
 'Imagem 4 — Benefícios: vantagens visuais reais, com UMA frase de 2 a 5 palavras pequena, tipografia premium e outro ângulo e cenário.',
 'Imagem 5 — Dor e solução: mostrar como o produto resolve uma necessidade do comprador. Uma frase curta.',
 'Imagem 6 — Persuasão: destacar um diferencial real, com comunicação comercial.',
 'Imagem 7 — Transformação: mostrar o resultado ou a experiência proporcionada pelo produto. Frase curta.',
 'Imagem 8 — Quebra de objeções: responder às três principais dúvidas do comprador, com frases curtas e persuasivas, tirando dúvidas sem poluir a imagem.',
 'Imagem 9 — Mockup e confiança: apresentar o produto com três selos: Compra Segura, Entrega Rápida e Atendimento Online.',
 'VARIAÇÃO OBRIGATÓRIA: cada foto usa ambiente, ponto de vista, iluminação e (quando houver) pessoa diferentes. Preservar produto exato; não clonar pose, parque ou personagem de outras imagens.'
].join('\n');
// Prévia INTEGRAL da descrição: organizada visualmente, sem truncamento.
// A Shopee recebe somente texto simples com emojis e quebras de linha.
// Criar elementos com textContent (nunca interpretar HTML colado pelo vendedor).
function optimizerDescriptionCompactPreview(content){
 const section=$('#optimizerDescriptionCompact');
 if(!section||optimizerWorkflowStage!=='description')return;
 const raw=String(content||'').replace(/\r\n?/g,'\n').normalize('NFC').trim();
 const target=$('#optimizerDescriptionFullPreview');
 if(!target)return;
 target.replaceChildren();
 let currentGroup=null;
 const create=(tag,cls,value)=>{
  const node=document.createElement(tag);
  node.className=cls;
  node.textContent=value;
  return node;
 };
 const lines=raw.split('\n');
 const isHeading=line=>/^(?:🌟|⚙️|💛|📦|🔎|📏|✅)\s+(?:Por que|Benefícios|Características|Informações|Destaques|Detalhes|Material|Medidas|Especificações|Descrição do produto)/iu.test(line)
   ||/^(?:🌟|⚙️|📏|💎|🔎)\s+[A-ZÁÀÂÃÉÊÍÓÔÕÚÇ][A-ZÁÀÂÃÉÊÍÓÔÕÚÇ\s:]{5,}$/u.test(line);
 const emojiLine=line=>/^\p{Extended_Pictographic}\uFE0F?\s/u.test(line);
 for(const rawLine of lines){
  const line=rawLine.trim();
  if(!line){currentGroup=null;continue;}
  const first=target.childElementCount===0;
  let node;
  if(first&&line.startsWith('✨')){
   node=create('h4','ra-description-hero',line);
  }else if(isHeading(line)){
   node=create('h5','ra-description-section-title',line);
  }else if(line.startsWith('🛒')){
   node=create('div','ra-description-cta',line);
  }else if(emojiLine(line)&&!line.startsWith('💛')){
   node=create('div','ra-description-detail',line);
  }else{
   node=create('p','ra-description-paragraph',line);
  }
  target.append(node);
  currentGroup=node;
 }
 if(!target.childElementCount)target.append(create('p','ra-description-empty','Nenhuma descrição preenchida. Você pode editar o texto diretamente.'));
 $('#optimizerDescriptionCompactCount').textContent=[...raw].length+' caracteres · texto completo';
 globalThis.ShopeeDescriptionStudio?.sync?.();
}
$('#optimizerDescriptionToggle')?.addEventListener?.('click',()=>{
 if(optimizerWorkflowStage!=='description')return;
 const draft=$('#optimizerWorkflowDraftWrap'),btn=$('#optimizerDescriptionToggle');
 draft.hidden=!draft.hidden;
 btn.textContent=draft.hidden?'✏️ Editar descrição manualmente ⌄':'Recolher edição ⌃';
 if(!draft.hidden)$('#optimizerWorkflowDraft').focus({preventScroll:true});
});
function optimizerWorkflowNotice(message,state='info'){
 const n=$('#optimizerWorkflowStatus');if(!n)return;
 n.textContent=message;n.dataset.state=state;
}
function optimizerTechReviewFeedback(message,state='info'){
 const bar=$('#optimizerWorkflowEditor > .optimizer-workflow-actions');
 if(!bar)return;
 let status=$('#optimizerTechnicalReviewFeedback');
 if(!status){
  status=document.createElement('p');
  status.id='optimizerTechnicalReviewFeedback';
  status.className='optimizer-technical-review-feedback';
  status.setAttribute('role','status');
  status.setAttribute('aria-live','polite');
  bar.append(status);
 }
 status.hidden=optimizerWorkflowStage!=='technical'||!message;
 status.textContent=message||'';
 status.dataset.state=state;
}
function optimizerSourceNotice(message,state='info'){
 const el=$('#optimizerSourceStatus');if(el){el.textContent=message;el.dataset.state=state;}
}
function optimizerSourceRender(data){
 const pane=$('#optimizerSourcePanel');if(!pane)return;
 pane.hidden=!data?.sku; // Usa a SKU já validada na busca inicial e libera texto/prints sem nova consulta.
 if(!data?.sku)return;
 pane.dataset.sku=String(data.sku);
 const badge=pane.querySelector('.optimizer-source-tag');if(badge)badge.textContent='SKU '+data.sku;
 const evidence=data.sourceEvidence||{sourceText:'',screenshots:[]};
 const sourceText=$('#optimizerSourceText'),techText=$('#optimizerTechText');
 if(sourceText&&document.activeElement!==sourceText)sourceText.value=evidence.sourceText||'';
 if(techText&&document.activeElement!==techText)techText.value=evidence.sourceText||'';
 const shots=evidence.screenshots||[];
 // A seção recolhível e a ficha técnica mostram os mesmos prints privados.
 for(const images of [$('#optimizerSourceCompactImages'),$('#optimizerSourceImages')].filter(Boolean)){
  images.replaceChildren();
  for(const shot of shots){
   const card=optimizerMake('div','optimizer-source-image-card');
   if(shot.previewUrl&&/^https:\/\//.test(shot.previewUrl)){
    const image=optimizerMake('img');image.src=shot.previewUrl;
    image.alt='Print da WeDrop: '+shot.filename;image.loading='lazy';
    const link=optimizerMake('a');link.href=shot.previewUrl;link.target='_blank';link.rel='noopener noreferrer';
    link.append(image);card.append(link);
   }
   card.append(optimizerMake('small','',shot.filename));
   const remove=optimizerMake('button','secondary','Excluir');remove.type='button';
   remove.onclick=()=>void optimizerSourceAction('remove',{id:shot.id});
   card.append(remove);images.append(card);
  }
 }
 const count=$('#optimizerSourceSavedStatus');
 if(count)count.textContent='SKU '+data.sku+' · '+[...(evidence.sourceText||'')].length+
  ' caracteres registrados · '+shots.length+'/4 prints salvos'+
  (evidence.updatedAt?' · atualizado '+new Date(evidence.updatedAt).toLocaleString('pt-BR'):'');
 const extractButton=$('#optimizerSourceExtract');
 if(extractButton)extractButton.disabled=shots.length===0;
 const facts=$('#optimizerSourceFacts');facts.replaceChildren();
 const item=data.sourceFacts||{};
 for(const conflict of item.conflicts||[]){
  facts.append(optimizerMake('p','optimizer-source-conflict',
   'Atenção: '+conflict.name+' no anúncio: '+conflict.current+'; WeDrop recomenda '+conflict.recommended+
   '. Abra Ficha técnica e aplique a opção oficial da categoria.'));
 }
 for(const hint of item.unresolved||[])facts.append(optimizerMake('p','optimizer-source-hint',
  (hint.name||'Informação')+': '+hint.reason));
 for(const value of item.metrics||[])facts.append(optimizerMake('p','optimizer-source-metric',
  value.name+': '+value.value+'. '+value.note));
 if(data.sourceEvidenceWarning){
  optimizerSourceNotice(data.sourceEvidenceWarning,'warning');
 }else optimizerSourceNotice('Informações vinculadas apenas à SKU '+data.sku+
  '. Consulte texto e prints na Ficha técnica inteligente.');
}
async function optimizerSourceAction(action,extra={}){
 const w=optimizerWorkflowPlan;if(!w?.sku)return;
 const btn=$('#optimizerSourceSave'),extractButton=$('#optimizerSourceExtract');
 btn.disabled=true;if(extractButton)extractButton.disabled=true;
 optimizerSourceNotice(action==='image'?'Guardando print para esta SKU...':
  action==='extract'?'Lendo prints e incorporando os dados identificados...':'Salvando informações da SKU...');
 try{
  // Evita que uma gravação automática antiga sobrescreva o texto colado manualmente.
  if(techTextTimer){clearTimeout(techTextTimer);techTextTimer=0;}
  await techTextQueue.catch(()=>{});
  const editor=$('#optimizerSourceText'),content=String(editor?.value||'');
  if(action!=='text'&&content!==String(w.sourceEvidence?.sourceText||''))
   await techTextSend(w,content);
  const response=await json('/api/shopee/optimizer/workflow/source',{
   method:'POST',headers:{'Content-Type':'application/json'},
   body:JSON.stringify({sku:w.sku,itemId:w.itemId,modelId:w.modelId,action,...extra}),
   signal:AbortSignal.timeout(90000)
  });
  if(optimizerWorkflowPlan!==w)return;
  w.sourceEvidence=response.sourceEvidence;
  const refresh=await json('/api/shopee/optimizer/workflow?'+new URLSearchParams({
   sku:w.sku,item_id:w.itemId,model_id:w.modelId}),{signal:AbortSignal.timeout(60000)});
  if(optimizerWorkflowPlan!==w)return;
  const beforeDescription=String(w.draftDescription||'');
  const canUpdateDescription=w.descriptionAutoGenerated===true&&
    !optimizerContentPending&&
    (optimizerWorkflowStage!=='description'||String($('#optimizerWorkflowDraft').value||'')===beforeDescription);
  Object.assign(w,{sourceEvidence:refresh.sourceEvidence,sourceFacts:refresh.sourceFacts,
    attributeSuggestions:refresh.attributeSuggestions,attributes:refresh.attributes});
  if(canUpdateDescription&&refresh.descriptionAutoGenerated===true&&refresh.draftDescription){
    w.draftDescription=refresh.draftDescription;
    w.descriptionComposer=refresh.descriptionComposer;
    w.stages=refresh.stages||w.stages;
    if(optimizerWorkflowStage==='description'){
      $('#optimizerWorkflowDraft').value=refresh.draftDescription;
      optimizerDescriptionCompactPreview(refresh.draftDescription);
      optimizerCopyCount();
    }
  }
  optimizerSourceRender(w);
  if(optimizerWorkflowStage==='technical')optimizerTechnicalRender(w);
  optimizerChatgptBrief=null;optimizerChatgptBriefSku='';
  optimizerExecReset();
  const amount=Number(response.extractedCount||0);
  optimizerSourceNotice(action==='extract'?'✓ '+amount+' informações dos prints incorporadas. Confira dados e medidas na ficha técnica.':
   '✓ Informações da WeDrop guardadas na SKU '+w.sku+' e disponíveis às etapas de otimização.','success');
  if(optimizerWorkflowStage==='technical')optimizerTechNotice('✓ Fonte atualizada. Sugestões recalculadas, sem modificar informações manuais aprovadas.','success');
 }catch(error){optimizerSourceNotice('Não foi possível concluir: '+error.message,'error');}
 finally{btn.disabled=false;if(extractButton)extractButton.disabled=false;}
}
$('#optimizerSourceSave')?.addEventListener?.('click',()=>void optimizerSourceAction('text',{
 sourceText:$('#optimizerSourceText').value
}));
$('#optimizerSourceExtract')?.addEventListener?.('click',()=>void optimizerSourceAction('extract'));
$('#optimizerSourceImage')?.addEventListener?.('change',async()=>{
 const input=$('#optimizerSourceImage'),files=[...(input.files||[])];
 const saved=optimizerWorkflowPlan?.sourceEvidence?.screenshots?.length||0;
 if(files.length+saved>4){
  optimizerSourceNotice('Máximo de quatro prints por SKU. Exclua um print salvo ou selecione menos arquivos.','warning');
  input.value='';return;
 }
 for(const file of files){
  if(!['image/jpeg','image/png'].includes(file.type)||file.size>4*1024*1024){
   optimizerSourceNotice('Aceitos apenas JPG ou PNG com até 4 MB cada.','warning');continue;
  }
  try{
   const buffer=new Uint8Array(await file.arrayBuffer());
   let binary='';for(let i=0;i<buffer.length;i+=32768)binary+=String.fromCharCode(...buffer.subarray(i,i+32768));
   await optimizerSourceAction('image',{imageBase64:btoa(binary),mime:file.type,filename:file.name});
  }catch(e){optimizerSourceNotice('Falha ao ler o print: '+e.message,'error');}
 }
 input.value='';
});
function optimizerWorkflowRender(data){
 optimizerSourceRender(data);
 optimizerWorkflowPlan=data;
 optimizerKitDiscountShortcutPaint(data);
 // Sincronize os textos já montados no kit antes de calcular os cartões.
 optimizerKitSourceChanged();
 // A pesquisa e a precificação começam ao selecionar a SKU e continuam em paralelo.
 if(!optimizerKitWorkflowActive())void optimizerDiscountFinalLoad();
 globalThis.OptimizerSkuDashboard?.workflow?.(data);
 const cards=$('#optimizerWorkflowCards');cards.replaceChildren();
 if(data.anatel?.requiresAction){
   const alert=optimizerMake('div','optimizer-anatel-alert');
   const message=optimizerMake('span','','Anatel • '+data.anatel.message);
   const fix=optimizerMake('button','secondary','Corrigir Anatel');fix.type='button';
   fix.onclick=()=>optimizerWorkflowOpen('technical');
   alert.append(message,fix);cards.append(alert);
 }
 const stages=data.stages||[];
 const visible=stages.filter(x=>x.key!=='final');
 const kitMode=optimizerKitWorkflowActive();
 // Exibir as sete revisoes e a oitava etapa de desconto, sem refazer
 // automaticamente conteudos ja preparados na pagina de Kits.
 const resolved=visible.filter(x=>x.reviewed||x.skipped).length;
 const kitDiscountReviewed=kitMode&&optimizerKitDiscountReviewState(data).prepared;
 const total=visible.length+1;
 const completed=resolved+(kitMode?Number(kitDiscountReviewed):Number(optimizerDiscountFinalSent));
 const progress=$('#optimizerWorkflowCounter');
 progress.textContent=completed+' / '+total+' etapas conferidas';
 progress.style.setProperty('--stage-progress',String(total?Math.round(completed/total*100):0)+'%');
 $('#optimizerHasVariants').checked=Boolean(data.variationConfig?.enabled);
 for(const [i,stage] of visible.entries()){
  const btn=optimizerMake('button','optimizer-workflow-card optimizer-workflow-'+stage.status+(optimizerWorkflowStage===stage.key?' is-current':''));
   btn.type='button';btn.dataset.stage=stage.key;
   if(optimizerWorkflowActiveView==='source'&&optimizerWorkflowSourceStage===stage.key)
     btn.classList.add('is-current');
   btn.setAttribute('aria-label','Abrir etapa '+(i+1)+': '+stage.name);
   const number=optimizerMake('span','optimizer-workflow-number',String(i+1).padStart(2,'0'));
   const paths={
    images:'<rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><path d="m3 17 5-5 4 3 4-5 5 6"/>',
    video:'<rect x="3" y="5" width="13" height="14" rx="2"/><path d="m16 10 5-3v10l-5-3"/>',
    seo:'<path d="M3 19h8M4 15l7-7 4 4-7 7H4v-4ZM15 4l5 5M16 15h5M19 12v7"/>',
    technical:'<path d="M6 2h9l5 5v15H6zM15 2v5h5M9 12h8M9 16h7"/>',
    description:'<path d="M4 6h2M9 6h11M4 12h2M9 12h11M4 18h2M9 18h11"/>',
    variants:'<path d="m12 2 9 5-9 5-9-5 9-5ZM3 7v10l9 5 9-5V7M12 12v10"/>',
    fiscal:'<path d="M6 2h9l5 5v15H6zM15 2v5h5M9 12h8M9 16h6"/>'
   };
   const glyph=optimizerMake('span','optimizer-workflow-icon');
   glyph.setAttribute('aria-hidden','true');
   glyph.innerHTML='<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">'+(paths[stage.key]||'')+'</svg>';
   const body=optimizerMake('span','optimizer-workflow-label');
   const videoStaged=stage.key==='video'&&Boolean(data.manualVideo);
   body.append(optimizerMake('strong','',stage.name),
     optimizerMake('small','',videoStaged?(data.manualVideo.uploadedToShopee?'Vídeo confirmado na Shopee':'Vídeo importado · não publicado'):
       stage.skipped?'Não se aplica':stage.key==='fiscal'&&stage.reviewed?'Salvo · ainda não publicado':
       stage.reviewed?'Conferência registrada':stage.blocking?'Precisa de atenção':'Preparar e revisar'));
   const mark=optimizerMake('span','optimizer-workflow-symbol',stage.skipped?'—':stage.reviewed?'✓':'→');
   btn.append(number,glyph,body,mark);
   btn.onclick=()=>{
    // As fotos e os textos do kit estao na propria pagina; ao seleciona-los
    // mostrar a fonte para conferencia, sem iniciar um gerador duplicado.
    if(kitMode){
     globalThis.RAKitOpenStagePanel?.(stage.key);
     const selector={images:'#kitImagesCollapseToolbar',seo:'#kitTitle',description:'#kitDescription'}[stage.key];
     const source=selector&&document.querySelector(selector);
     if(source){
      optimizerContentRemember();
      globalThis.ShopeeFiscalStudio?.close?.();
      globalThis.ShopeeDescriptionStudio?.close?.();
      globalThis.ShopeeTitleStudio?.close?.();
      optimizerWorkflowActivateOnly('source',stage.key);
      source.scrollIntoView({behavior:'smooth',block:'start'});
      optimizerWorkflowNotice('Confira o conteúdo já preparado na seção do kit. O vínculo da SKU principal será preservado.','info');
      return;
     }
    }
    if(kitMode)globalThis.RAKitOpenStagePanel?.(stage.key);
    optimizerWorkflowOpen(stage.key);
    if(kitMode)$('#optimizerWorkflowEditor')?.scrollIntoView?.({behavior:'smooth',block:'start'});
   };
   cards.appendChild(btn);
 }
 // Desconto permanece como etapa 08 dentro do mesmo fluxo.
 const discountCard=optimizerMake('button','optimizer-workflow-card optimizer-workflow-pending');
 discountCard.type='button';discountCard.dataset.stage='discount';
 discountCard.setAttribute('aria-label',data.kitOptimization?'Abrir etapa 08: desconto do kit na Shopee':'Abrir etapa 08: desconto do produto na Shopee');
 const discountNumber=optimizerMake('span','optimizer-workflow-number','08');
 const discountIcon=optimizerMake('span','optimizer-workflow-icon');
 discountIcon.setAttribute('aria-hidden','true');
 discountIcon.innerHTML='<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M20 12 12 20 3 11V4h7z"/><circle cx="7.5" cy="8" r="1.25"/></svg>';
 const discountLabel=optimizerMake('span','optimizer-workflow-label');
 discountLabel.append(optimizerMake('strong','',data.kitOptimization?'Desconto do kit':'Desconto do produto'),optimizerMake('small','optimizer-discount-workflow-state','Preço e promoção · revisar'));
 const discountMark=optimizerMake('span','optimizer-workflow-symbol','→');
 discountCard.append(discountNumber,discountIcon,discountLabel,discountMark);
 discountCard.onclick=()=>{
  if(kitMode)globalThis.RAKitOpenStagePanel?.('discount');
  optimizerDiscountOpenReview();
 };
 cards.append(discountCard);
 if(data.kitOptimization?.kitSku)
  globalThis.RAKitWorkflowProgress?.({
   kitSku:data.kitOptimization.kitSku,itemId:String(data.itemId),stages:visible});
 optimizerDiscountWorkflowRefresh();
 optimizerKitSourcePaint();
 if(optimizerWorkflowStage&&visible.some(x=>x.key===optimizerWorkflowStage))
   optimizerWorkflowOpen(optimizerWorkflowStage);
 // Se uma etapa foi eliminada em uma atualização, fechar o editor antigo.
 else{
   globalThis.ShopeeDescriptionStudio?.close?.();
   optimizerWorkflowStage=null;
   $('#optimizerWorkflowEditor').hidden=true;
 }
}
globalThis.RAKitOpenDiscountReview=()=>{
 if(!optimizerKitWorkflowActive())return false;
 optimizerDiscountOpenReview();
 $('#optimizerDiscountReviewInline')?.scrollIntoView({behavior:'smooth',block:'nearest'});
 return true;
};
globalThis.RAKitWorkflowSyncReview=({kitSku,itemId,modelId,review}={})=>{
 const w=optimizerWorkflowPlan;
 if(!w||!optimizerKitWorkflowActive()||w.kitOptimization?.kitSku!==kitSku||
  String(w.itemId)!==String(itemId)||String(w.modelId||'0')!==String(modelId||'0')||
  !Array.isArray(review?.stages))return false;
 optimizerWorkflowRender({...w,stages:review.stages});
 void optimizerExecutionPrepare();
 return true;
};
// Importação manual (SKU isolada) em armazenamento privado. Nunca publica na Shopee.
const optimizerVideoMaxBytes=30*1024*1024;
let optimizerVideoObjectURL=null,optimizerVideoDurationReady=false,optimizerVideoUploading=false;
function optimizerVideoContext(){
 const p=optimizerWorkflowPlan;
 if(!p||$('#optimizerSku').value.trim()!==p.sku)throw Error('Localize novamente a SKU antes de importar o vídeo.');
 return {sku:p.sku,item_id:p.itemId,model_id:p.modelId};
}
function optimizerVideoNotice(message,state='info'){
 const el=$('#optimizerVideoStatus');if(!el)return;
 el.textContent=message;el.dataset.state=state;
}
function optimizerVideoClearPreview(){
 if(optimizerVideoObjectURL){URL.revokeObjectURL(optimizerVideoObjectURL);optimizerVideoObjectURL=null}
 const player=$('#optimizerVideoPreview');player.pause?.();player.removeAttribute?.('src');
 player.load?.();player.hidden=true;
}
function optimizerVideoReset(){
 optimizerVideoDurationReady=false;
 $('#optimizerVideoFile').value='';
 $('#optimizerVideoUpload').disabled=true;
 optimizerVideoClearPreview();
 optimizerVideoNotice('Selecione um vídeo sugerido pelo Markt Pro ou use o arquivo manual.');
}
function optimizerVideoParams(){
 return new URLSearchParams(optimizerVideoContext()).toString();
}

function optimizerVideoSearchIdentity(){
 const p=optimizerWorkflowPlan;
 const id=optimizerVideoContext();
 const title=String(p?.draftTitle||p?.title||p?.itemName||'').trim().slice(0,250);
 return {...id,title};
}
function optimizerVideoStillViewing(id){
 const p=optimizerWorkflowPlan;
 return p&&optimizerWorkflowStage==='video'&&String(p.sku)===String(id.sku)&&
  String(p.itemId)===String(id.item_id)&&String(p.modelId)===String(id.model_id);
}
async function optimizerVideoFindMarket(){
 const wrap=$('#optimizerVideoMarketResults'),notice=$('#optimizerVideoMarketStatus');
 if(!wrap||!notice)return;
 wrap.replaceChildren();
 let identity;
 try{identity=optimizerVideoSearchIdentity();}
 catch(e){notice.textContent=e.message;return;}
 notice.textContent='Pesquisando vídeos do Markt Pro para '+identity.sku+'...';
 try{
  const query=new URLSearchParams(identity);
  const data=await json('/api/shopee/optimizer/video/marktpro/search?'+query,{
   signal:AbortSignal.timeout(90000)});
  if(!optimizerVideoStillViewing(identity))return;
  if(!data?.candidates?.length){
   notice.textContent=data.inventoryCount
    ?'Nenhum vídeo compatível com o título desta SKU foi encontrado no acervo.'
    :'A galeria WeDrop respondeu, mas nenhum arquivo de vídeo verificável foi localizado. Não foi feita importação.';
   const link=document.createElement('a');link.href='https://packvideoswedrop.lovable.app/';
   link.target='_blank';link.rel='noopener noreferrer';link.textContent='Consultar catálogo original ↗';wrap.append(link);
   return;
  }
  notice.textContent=data.candidates.length+' vídeo(s) sugerido(s) para '+identity.sku+
    '. Confira o produto no vídeo antes de selecionar.';
  for(const video of data.candidates){
   const card=document.createElement('article');card.className='optimizer-market-video-card';
   const player=document.createElement('video');player.controls=true;player.playsInline=true;player.preload='none';
   player.setAttribute('aria-label','Prévia do vídeo '+video.title);
   player.src='/api/shopee/optimizer/video/marktpro/stream?'+new URLSearchParams({...identity,id:video.id});
   const info=document.createElement('div');info.className='optimizer-market-video-info';
   const name=document.createElement('strong');name.textContent=video.title;
   const meta=document.createElement('small');meta.textContent=
    'Compatibilidade textual '+Math.round(Number(video.score||0)*100)+'%'+
    (video.durationMs?' · '+Math.round(video.durationMs/1000)+' s':'')+
    (video.category?' · '+video.category:'');
   const choose=document.createElement('button');choose.type='button';choose.className='secondary';
   choose.textContent='Usar este vídeo';
   choose.onclick=async()=>{
    if(optimizerVideoUploading||!optimizerVideoStillViewing(identity))return;
    optimizerVideoUploading=true;
    for(const b of wrap.querySelectorAll('button'))b.disabled=true;
    optimizerVideoNotice('Importando do Markt Pro para a SKU '+identity.sku+'...','info');
    try{
     const response=await json('/api/shopee/optimizer/video/marktpro/select?'+query,{
      method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({id:video.id}),
      signal:AbortSignal.timeout(240000)});
     if(!optimizerVideoStillViewing(identity))return;
     if(optimizerWorkflowPlan){
      optimizerWorkflowPlan.manualVideo=response.asset;
      const videoStage=optimizerWorkflowPlan.stages?.find(stage=>stage.key==='video');
      if(videoStage){videoStage.reviewed=false;videoStage.status='pending';videoStage.reviewedAt=null;}
      optimizerWorkflowRender(optimizerWorkflowPlan);
     }
     optimizerExecReset();
     optimizerVideoNotice('Vídeo selecionado e salvo para revisão. Ainda não publicado na Shopee.','success');
     await optimizerVideoLoadSaved();
    }catch(e){optimizerVideoNotice('Não foi possível importar este vídeo: '+e.message,'error');}
    finally{optimizerVideoUploading=false;for(const b of wrap.querySelectorAll('button'))b.disabled=false;}
   };
   info.append(name,meta,choose);card.append(player,info);wrap.append(card);
  }
 }catch(e){
  if(!optimizerVideoStillViewing(identity))return;
  notice.textContent='Não foi possível consultar a galeria de vídeos WeDrop: '+e.message+
   '. Você pode usar a importação manual abaixo.';
  const link=document.createElement('a');link.href='https://packvideoswedrop.lovable.app/';
  link.target='_blank';link.rel='noopener noreferrer';link.textContent='Abrir catálogo Markt Pro ↗';wrap.append(link);
 }
}
async function optimizerVideoLoadSaved(){
 const target=optimizerWorkflowPlan;
 if(!target||optimizerWorkflowStage!=='video')return;
 const identity=target.sku+':'+target.itemId+':'+target.modelId;
 optimizerVideoNotice('Consultando vídeo importado para esta SKU...');
 try{
  const result=await json('/api/shopee/optimizer/video/manual?'+optimizerVideoParams()+'&preview=1',{
   signal:AbortSignal.timeout(25000)});
  const now=optimizerWorkflowPlan;
  if(optimizerWorkflowStage!=='video'||!now||
     now.sku+':'+now.itemId+':'+now.modelId!==identity)return;
  if(result.asset){
   optimizerVideoNotice('Vídeo salvo: '+result.asset.filename+' · '+
     (result.asset.sizeBytes/1024/1024).toFixed(1)+' MB. '+(result.asset.uploadedToShopee?'Publicação verificada em '+new Date(result.asset.publishedAt).toLocaleString('pt-BR')+'.':'Importado no aplicativo, ainda não publicado na Shopee.'),'success');
   if(result.previewUrl&&!$('#optimizerVideoFile').files?.length){
    optimizerVideoClearPreview();
    const player=$('#optimizerVideoPreview');player.src=result.previewUrl;player.hidden=false;
   }
  }else optimizerVideoNotice('Nenhum vídeo manual importado para esta SKU. Selecione seu arquivo.');
 }catch(e){optimizerVideoNotice('Vídeo salvo não pôde ser consultado: '+e.message,'warning')}
}
$('#optimizerVideoFile')?.addEventListener?.('change',()=>{
 optimizerVideoDurationReady=false;
 $('#optimizerVideoUpload').disabled=true;
 optimizerVideoClearPreview();
 const file=$('#optimizerVideoFile').files?.[0];
 if(!file)return optimizerVideoNotice('Nenhum vídeo selecionado.');
 const name=String(file.name||'').toLowerCase();
 if(!/\.(mp4|mov|webm)$/.test(name)||file.size<16||file.size>optimizerVideoMaxBytes)
   return optimizerVideoNotice('Use MP4, MOV ou WebM, com até 30 MB.','error');
 const player=$('#optimizerVideoPreview');
 optimizerVideoObjectURL=URL.createObjectURL(file);
 player.src=optimizerVideoObjectURL;player.hidden=false;
 optimizerVideoNotice('Verificando duração e prévia do vídeo...');
 player.onloadedmetadata=()=>{
   if(!$('#optimizerVideoFile').files?.length)return;
   const duration=Number(player.duration);
   if(!Number.isFinite(duration)){
     optimizerVideoDurationReady=true;$('#optimizerVideoUpload').disabled=false;
     optimizerVideoNotice('Duração desconhecida. O servidor validará o vídeo ao salvar automaticamente.','warning');
      queueMicrotask(()=>$('#optimizerVideoUpload')?.click());
   }else if(duration<10||duration>60){
     optimizerVideoDurationReady=false;
     $('#optimizerVideoUpload').disabled=true;
     optimizerVideoNotice('Duração '+(Number.isFinite(duration)?duration.toFixed(1)+'s':'desconhecida')+
       '. Para preparar publicação Shopee, use vídeo entre 10 e 60 segundos.','error');
   }else{
     optimizerVideoDurationReady=true;
     $('#optimizerVideoUpload').disabled=false;
     optimizerVideoNotice('Prévia validada: '+duration.toFixed(1)+' segundos · '+
       (file.size/1024/1024).toFixed(1)+' MB. Salvando automaticamente...','success');
       queueMicrotask(()=>$('#optimizerVideoUpload')?.click());
   }
 };
 player.onerror=()=>{
   optimizerVideoDurationReady=true;$('#optimizerVideoUpload').disabled=false;
   optimizerVideoNotice('Prévia indisponível; validando e salvando automaticamente no servidor...','warning');
    queueMicrotask(()=>$('#optimizerVideoUpload')?.click());
 };
});
$('#optimizerVideoUpload')?.addEventListener?.('click',async()=>{
 if(optimizerVideoUploading||!optimizerVideoDurationReady)return;
 const file=$('#optimizerVideoFile').files?.[0];if(!file)return;
 let identity;
 try{identity=optimizerVideoContext()}catch(e){return optimizerVideoNotice(e.message,'error')}
 const ext=file.name.toLowerCase().split('.').pop();
 const mime=ext==='mov'?'video/quicktime':ext==='webm'?'video/webm':'video/mp4';
 optimizerVideoUploading=true;
 $('#optimizerVideoUpload').disabled=true;
 optimizerVideoNotice('Importando vídeo e vinculando ao anúncio '+identity.sku+'...');
 try{
   const raw=await fetch('/api/shopee/optimizer/video/manual?'+new URLSearchParams(identity),{
     method:'POST',headers:{'Content-Type':mime,'X-Video-Filename':encodeURIComponent(file.name)},
     body:file,signal:AbortSignal.timeout(240000)
   });
   const response=await raw.json().catch(()=>({}));
   if(!raw.ok)throw Error(response.error||'Erro HTTP '+raw.status);
   const current=optimizerWorkflowPlan;
   if(!current||current.sku!==identity.sku||current.itemId!==identity.item_id||current.modelId!==identity.model_id)return;
   optimizerVideoNotice('Arquivo '+file.name+' importado e armazenado para SKU '+identity.sku+
     '. Ainda NÃO foi publicado na Shopee.','success');
   if(optimizerWorkflowPlan?.sku===identity.sku){
     optimizerWorkflowPlan.manualVideo=response.asset;
     optimizerExecReset();
     optimizerWorkflowRender(optimizerWorkflowPlan);
   }
   $('#optimizerVideoFile').value='';optimizerVideoDurationReady=false;
   await optimizerVideoLoadSaved();
 }catch(e){optimizerVideoNotice('Falha ao importar vídeo: '+e.message,'error')}
 finally{optimizerVideoUploading=false;$('#optimizerVideoUpload').disabled=!optimizerVideoDurationReady}
});



function optimizerVariationValues(){
 return {enabled:$('#optimizerHasVariants').checked,
  type:$('#optimizerVariationType').value,
  values:$('#optimizerVariationValues').value.split(/\r?\n/).map(x=>x.trim()).filter(Boolean)};
}
function optimizerVariationPreview(){
 if(globalThis.RedeVariants?.render)return globalThis.RedeVariants.render();
 const target=$('#optimizerVariationPreview');target.replaceChildren();
 if(!$('#optimizerHasVariants').checked)return;
 const type=$('#optimizerVariationType').value||'Variação';
 for(const value of optimizerVariationValues().values.slice(0,20)){
  const card=optimizerMake('div','optimizer-variation-card');
  card.append(optimizerMake('strong','',type+' · '+value),
   optimizerMake('small','', 'Foto por opção: aguardando conferência'));
  const copy=optimizerMake('button','secondary','Copiar pedido de imagem');copy.type='button';
  copy.onclick=async()=>{
   const sku=optimizerWorkflowPlan?.sku||'';
   const prompt='SKU '+sku+' | Gerar imagem 1200x1200 da variação '+type+': '+value+
    '. Manter rigorosamente o modelo original da capa, sem cores ou detalhes inventados. '+
    ($('#optimizerPrompt')?.value||'');
   try{await navigator.clipboard.writeText(prompt);optimizerWorkflowNotice('Pedido da opção '+value+' copiado. A foto ainda precisa ser criada e conferida.','success');}
   catch{optimizerWorkflowNotice('Não foi possível copiar o pedido.','warning')}
  };card.append(copy);target.append(card);
 }
}
function optimizerVariationRender(data){
 const cfg=data.variationConfig||{enabled:false,type:'',values:[]};
 $('#optimizerHasVariants').checked=Boolean(cfg.enabled);
 $('#optimizerVariationPanel').hidden=!cfg.enabled;
 $('#optimizerVariationType').value=cfg.type||'';
 $('#optimizerVariationValues').value=(cfg.values||[]).join('\n');
 optimizerVariationPreview();
 void globalThis.RedeVariants?.load?.(data);
}
$('#optimizerVariationType')?.addEventListener?.('change',()=>{optimizerVariationPreview();optimizerExecReset()});
$('#optimizerVariationValues')?.addEventListener?.('input',()=>{optimizerVariationPreview();optimizerExecReset()});
let optimizerImageCorrectionPreviewMap=new Map();
let optimizerImagePromptEditorIdentity='';
function optimizerImageCorrectionRefreshPreview(){
 const slot=Number($('#optimizerImageCorrectionSlot')?.value);
 const asset=optimizerImageCorrectionPreviewMap.get(slot);
 const preview=$('#optimizerImageCorrectionPreview');
 if(!preview)return;
 preview.hidden=!asset?.previewUrl;
 const photo=$('#optimizerImageCorrectionPreviewPhoto');
 if(photo){
  if(asset?.previewUrl&&photo.src!==asset.previewUrl)photo.src=asset.previewUrl;
  else if(!asset?.previewUrl)photo.removeAttribute('src');
 }
 const caption=$('#optimizerImageCorrectionPreviewCaption');
 if(caption)caption.textContent='Posição '+String(slot).padStart(2,'0')+' · imagem atualmente salva para revisão';
}
function optimizerImageCorrectionLoad(){
 const slot=$('#optimizerImageCorrectionSlot').value;
 const pane=$('#optimizerImagePromptEditorPanel');
 if(pane)pane.hidden=true;
 optimizerImagePromptEditorIdentity='';
 $('#optimizerImageCorrection').value=optimizerWorkflowPlan?.imageNotes?.[slot]||'';
 const counter=$('#optimizerImageCorrectionCount');if(counter)counter.textContent=[...$('#optimizerImageCorrection').value].length+'/500';
 optimizerImageCorrectionRefreshPreview();
}
$('#optimizerImageCorrectionSlot')?.addEventListener?.('change',optimizerImageCorrectionLoad);
function optimizerImageEditorActive(w,slot){
 return !$('#optimizerImagePromptEditorPanel').hidden&&optimizerImagePromptEditorIdentity===
  [w.sku,w.itemId,w.modelId,slot].join('|');
}
async function optimizerOpenImagePromptEditor(){
 const w=optimizerWorkflowPlan,slot=Number($('#optimizerImageCorrectionSlot')?.value);
 if(!w||!optimizerImagesSameSku(w)||!Number.isInteger(slot)||slot<1||slot>9)return;
 const status=$('#optimizerImageCorrectionStatus');
 try{
  const brief=await optimizerChatgptMakeBrief(w);
  if(!optimizerImagesSameSku(w))return;
  const editor=$('#optimizerImagePromptEditor');
  editor.value=w.imagePrompts?.[slot]||brief.prompts[slot-1]||'';
  optimizerImagePromptEditorIdentity=[w.sku,w.itemId,w.modelId,slot].join('|');
  $('#optimizerImagePromptEditorPanel').hidden=false;
  status.textContent='Prompt original da imagem '+String(slot).padStart(2,'0')+' aberto. Edite e clique em Salvar orientação. Nenhuma geração foi iniciada.';
  editor.focus();
 }catch(e){status.textContent='Falha ao abrir prompt: '+String(e.message||e);}
}
$('#optimizerImageEditOrientation')?.addEventListener?.('click',()=>void optimizerOpenImagePromptEditor());
$('#optimizerImageRestorePrompt')?.addEventListener?.('click',async()=>{
 const w=optimizerWorkflowPlan,slot=Number($('#optimizerImageCorrectionSlot')?.value);
 if(!w||!optimizerImageEditorActive(w,slot))return;
 try{
  const brief=await optimizerChatgptMakeBrief(w,{defaultOnly:true});
  $('#optimizerImagePromptEditor').value=brief.prompts[slot-1];
  $('#optimizerImageCorrectionStatus').textContent='Prompt padrão da imagem '+slot+' carregado no editor. Clique em Salvar orientação para confirmar a alteração.';
 }catch(e){$('#optimizerImageCorrectionStatus').textContent='Falha ao restaurar: '+e.message;}
});
async function optimizerImagePromptSave(w,slot){
 const text=$('#optimizerImagePromptEditor').value.trim();
 if(text.length<60||[...text].length>16000)throw Error('O prompt deve ter de 60 a 16.000 caracteres.');
 if(!optimizerImageEditorActive(w,slot))throw Error('O editor não corresponde à SKU e posição atuais.');
 const result=await json('/api/shopee/optimizer/workflow/review',{
  method:'POST',headers:{'Content-Type':'application/json'},
  body:JSON.stringify({itemId:w.itemId,modelId:w.modelId,sku:w.sku,
   stage:'images',reviewed:false,imagePrompts:{[slot]:text}}),
  signal:AbortSignal.timeout(60000)
 });
 if(!optimizerImagesSameSku(w))throw Error('SKU alterada enquanto o prompt era salvo.');
 w.imagePrompts={...(w.imagePrompts||{}),...(result.imagePrompts||{})};
 optimizerChatgptBrief=null;optimizerChatgptBriefSku='';
 optimizerExecReset();
 const stage=w.stages?.find(x=>x.key==='images');
 if(stage){stage.reviewed=false;stage.status='pending';stage.reviewedAt=null;}
 return result;
}
async function optimizerImageSelectedAction(mode){
 const w=optimizerWorkflowPlan,slot=Number($('#optimizerImageCorrectionSlot')?.value);
 const status=$('#optimizerImageCorrectionStatus');
 if(!w||!optimizerImagesSameSku(w)||!Number.isInteger(slot)||slot<1||slot>9)return;
 if(!optimizerImageCorrectionPreviewMap.get(slot)){
  status.textContent='A posição '+String(slot).padStart(2,'0')+' não tem imagem salva. Gere uma imagem antes de solicitar edição.';
  return;
 }
 if(optimizerImagesAutoBusy){status.textContent='Já há uma importação em andamento. Aguarde antes de editar.';return;}
 const action=mode==='white-bg'?'Removendo fundo e aplicando branco puro':'Melhorando o ângulo e a apresentação';
 try{
  status.textContent=action+' da imagem '+String(slot).padStart(2,'0')+' pelo ChatGPT (sem API paga)...';
  if(optimizerImageEditorActive(w,slot))await optimizerImagePromptSave(w,slot);
  await optimizerCommercialRequestChatgptSlot(w,slot,{editMode:mode});
 }catch(e){status.textContent='Não foi possível editar a imagem '+slot+': '+String(e.message||e);}
}
$('#optimizerImageImproveAI')?.addEventListener?.('click',()=>void optimizerImageSelectedAction('improve'));
$('#optimizerImageRemoveBackground')?.addEventListener?.('click',()=>void optimizerImageSelectedAction('white-bg'));

$('#optimizerImageCorrection')?.addEventListener?.('input',()=>{const count=$('#optimizerImageCorrectionCount');if(count)count.textContent=[...$('#optimizerImageCorrection').value].length+'/500';});
async function optimizerImageCorrectionSaveNote(w,slot,note){
 const result=await json('/api/shopee/optimizer/workflow/review',{
  method:'POST',headers:{'Content-Type':'application/json'},
  body:JSON.stringify({itemId:w.itemId,modelId:w.modelId,sku:w.sku,
   stage:'images',reviewed:false,imageNotes:{[slot]:note}}),signal:AbortSignal.timeout(60000)});
 if(!optimizerImagesSameSku(w))throw Error('SKU alterada durante o salvamento; retorne à SKU anterior.');
 w.imageNotes={...(w.imageNotes||{}),...(result.imageNotes||{})};
 optimizerChatgptBrief=null;optimizerChatgptBriefSku='';
 const stage=w.stages?.find(x=>x.key==='images');
 if(stage){stage.reviewed=false;stage.status='pending';stage.reviewedAt=null;}
 optimizerWorkflowRender(w);optimizerExecReset();
 return result;
}
$('#optimizerImageCorrectionSave')?.addEventListener?.('click',async()=>{
 const w=optimizerWorkflowPlan;if(!w||optimizerWorkflowStage!=='images')return;
 const slot=Number($('#optimizerImageCorrectionSlot').value),note=$('#optimizerImageCorrection').value.trim();
 const btn=$('#optimizerImageCorrectionSave');btn.disabled=true;
 const status=$('#optimizerImageCorrectionStatus');
 try{
  if(optimizerImageEditorActive(w,slot)){
   await optimizerImagePromptSave(w,slot);
   status.textContent='✓ Prompt completo da imagem '+String(slot).padStart(2,'0')+' salvo nesta SKU. Gerar ajuste e importar usará exatamente esta orientação.';
  }else{
   await optimizerImageCorrectionSaveNote(w,String(slot),note);
   status.textContent='✓ Ajuste da imagem '+String(slot).padStart(2,'0')+' salvo. Gerar ajuste e importar usará esta orientação.';
  }
 }catch(e){status.textContent='Não foi possível salvar a orientação: '+e.message;}
 finally{btn.disabled=false;}
});
$('#optimizerImageCorrectionGenerate')?.addEventListener?.('click',async()=>{
 const w=optimizerWorkflowPlan;if(!w||!optimizerImagesSameSku(w))return;
 const slot=Number($('#optimizerImageCorrectionSlot').value);
 const note=$('#optimizerImageCorrection').value.trim();
 const status=$('#optimizerImageCorrectionStatus');
 const btn=$('#optimizerImageCorrectionGenerate'),save=$('#optimizerImageCorrectionSave');
 const fullEditor=optimizerImageEditorActive(w,slot);
 if(!note&&!fullEditor){status.textContent='Escreva o ajuste ou clique em Editar orientação para abrir o prompt original da imagem '+slot+'.';return;}
 if(optimizerImagesAutoBusy){status.textContent='Existe uma importação em andamento. Aguarde a confirmação.';return;}
 btn.disabled=true;save.disabled=true;
 try{
  status.textContent='Salvando o pedido de ajuste da posição '+slot+'...';
  if(fullEditor)await optimizerImagePromptSave(w,slot);
  else await optimizerImageCorrectionSaveNote(w,String(slot),note);
  if(!optimizerImagesSameSku(w))return;
  if(!optimizerChatBridgeReady)throw Error('Ative a Ponte ChatGPT v1.0.26 no Chrome. A API paga não será utilizada automaticamente.');
  const editMode=optimizerImageCorrectionPreviewMap.has(slot)?'custom':'';
  status.textContent='Enviando o prompt exclusivamente da imagem '+slot+' ao ChatGPT. A foto anterior fica salva até confirmar o novo upload.';
  await optimizerCommercialRequestChatgptSlot(w,slot,{editMode});
 }catch(e){
  status.textContent='Não foi possível gerar o ajuste: '+e.message+'. A imagem anterior foi preservada.';
 }finally{
  optimizerImagesAutoBusy=false;optimizerImagesSetProgress();
  btn.disabled=false;save.disabled=false;
 }
});

async function optimizerImageCorrectionImportFile(file){
 const w=optimizerWorkflowPlan,slot=Number($('#optimizerImageCorrectionSlot')?.value);
 const status=$('#optimizerImageCorrectionStatus');
 if(!w||!optimizerImagesSameSku(w)||!Number.isInteger(slot)||slot<1||slot>9)
  throw Error('Abra a etapa de imagens e selecione uma posição.');
 if(optimizerImagesAutoBusy)throw Error('Uma importação ou edição pela API já está em andamento.');
 // Importar/corrigir uma foto manualmente nesta SKU NÃO encerra o lote
 // ChatGPT que prepara as outras posições. O servidor é a fonte de verdade.
 // A ponte se sincroniza pelas posições confirmadas antes da retomada.
 if(optimizerChatBridgeBusy&&optimizerChatBridgeIdentity(optimizerChatBridgeJob,w))
  optimizerChatBridgeNotice('Importação manual da posição '+slot+' sem interromper a geração das outras imagens.');
 if(!file?.size)throw Error('Imagem não encontrada.');
 const previous=optimizerImageCorrectionPreviewMap.get(slot);
 let importedSha='';
 optimizerImagesAutoBusy=true;optimizerImagesSetProgress();
 $('#optimizerImageCorrectionPaste').disabled=true;
 $('#optimizerImageCorrectionChoose').disabled=true;
 try{
  status.textContent='Preparando imagem '+String(slot).padStart(2,'0')+' para salvar...';
  const prepared=await optimizerChatgptScaleFile(file);
  const mime=prepared.blob.type==='image/jpeg'?'image/jpeg':'image/png';
  const extension=mime==='image/jpeg'?'jpg':'png';
  const response=await fetch('/api/shopee/optimizer/images/manual?'+new URLSearchParams({
   sku:w.sku,item_id:w.itemId,model_id:w.modelId,slot
  }),{method:'POST',headers:{'Content-Type':mime,
   'X-Image-Filename':encodeURIComponent('imagem-corrigida-'+String(slot).padStart(2,'0')+'.'+extension)},
   body:prepared.blob,signal:AbortSignal.timeout(90000)});
  const result=await response.json().catch(()=>({}));
  if(!response.ok)throw Error(result.error||'Não foi possível gravar a imagem no servidor.');
  if(!result.image?.sha256||Number(result.image.slot)!==slot||
   String(result.image.sku)!==String(w.sku)||result.image.sha256===previous?.sha256)
   throw Error('O arquivo recebido não substituiu a imagem anterior.');
  const stage=w.stages?.find(x=>x.key==='images');
  if(stage){stage.reviewed=false;stage.status='pending';stage.reviewedAt=null;}
  optimizerExecReset();optimizerWorkflowRender(w);
  importedSha=result.image.sha256;
  status.textContent='✓ Imagem '+String(slot).padStart(2,'0')+' substituída na SKU '+w.sku+'. Revise antes de enviar à Shopee.';
  $('#optimizerImageCorrectionFile').value='';
 }finally{
  optimizerImagesAutoBusy=false;optimizerImagesSetProgress();
  $('#optimizerImageCorrectionPaste').disabled=false;
  $('#optimizerImageCorrectionChoose').disabled=false;
  // Recarregar a galeria SOMENTE depois de liberar a operação; caso contrário
  // o select "Mover para" fica permanentemente disabled após colar uma foto.
  if(optimizerImagesSameSku(w)){
   await optimizerImagesLoad();
   if(importedSha&&optimizerImageCorrectionPreviewMap.get(slot)?.sha256!==importedSha)
    throw Error('Arquivo salvo, mas a galeria ainda não confirmou a nova foto. Atualize a página.');
  }
 }
}
$('#optimizerImageCorrectionChoose')?.addEventListener?.('click',()=>$('#optimizerImageCorrectionFile')?.click());
$('#optimizerImageCorrectionFile')?.addEventListener?.('change',async e=>{
 const file=e.target.files?.[0];if(!file)return;
 try{await optimizerImageCorrectionImportFile(file);}
 catch(error){$('#optimizerImageCorrectionStatus').textContent='Não foi possível importar: '+error.message;}
});
const correctionDrop=$('#optimizerImageCorrectionDropzone');
if(correctionDrop){
 correctionDrop.addEventListener('dragover',e=>{e.preventDefault();correctionDrop.classList.add('is-drop-target');});
 correctionDrop.addEventListener('dragleave',()=>correctionDrop.classList.remove('is-drop-target'));
 correctionDrop.addEventListener('drop',async e=>{
  e.preventDefault();correctionDrop.classList.remove('is-drop-target');
  try{
   const image=Array.from(e.dataTransfer?.files||[]).find(f=>/^image\/(?:png|jpeg|webp)$/.test(f.type));
   if(!image)throw Error('Arraste uma imagem PNG, JPG ou WebP.');
   await optimizerImageCorrectionImportFile(image);
  }catch(err){$('#optimizerImageCorrectionStatus').textContent='Falha ao importar: '+err.message;}
 });
 correctionDrop.addEventListener('paste',async e=>{
  const entry=Array.from(e.clipboardData?.items||[]).find(x=>x.kind==='file'&&/^image\/(?:png|jpeg|webp)$/.test(x.type));
  if(!entry)return;
  e.preventDefault();
  try{await optimizerImageCorrectionImportFile(entry.getAsFile());}
  catch(err){$('#optimizerImageCorrectionStatus').textContent='Falha ao colar: '+err.message;}
 });
}
$('#optimizerImageCorrectionPaste')?.addEventListener?.('click',async()=>{
 const status=$('#optimizerImageCorrectionStatus');
 try{
  if(!navigator.clipboard?.read)throw Error('Este navegador não permite ler imagens copiadas. Use Selecionar imagem.');
  const items=await navigator.clipboard.read();
  let file;
  for(const item of items){
   const mime=item.types.find(t=>/^image\/(?:png|jpeg|webp)$/.test(t));
   if(mime){const blob=await item.getType(mime);file=new File([blob],'imagem-copiada.png',{type:mime});break;}
  }
  if(!file)throw Error('Não encontrei uma imagem copiada. No ChatGPT, use Copiar imagem e tente novamente.');
  await optimizerImageCorrectionImportFile(file);
 }catch(error){
  const area=$('#optimizerImageCorrectionDropzone');if(area)area.focus();
  status.textContent='Colagem direta indisponível: '+error.message+
   ' Alternativa: clique na área de colagem, pressione Ctrl+V ou use Selecionar imagem.';
 }
});

$('#optimizerImageCorrectionCopy')?.addEventListener?.('click',async()=>{
 const w=optimizerWorkflowPlan;if(!w||!optimizerImagesSameSku(w))return;
 const slot=Number($('#optimizerImageCorrectionSlot').value);
 const status=$('#optimizerImageCorrectionStatus');
 try{
  const brief=await optimizerChatgptMakeBrief(w);
  if(!optimizerImagesSameSku(w))return;
  const prompt=optimizerImageEditorActive(w,slot)
   ?$('#optimizerImagePromptEditor').value.trim():brief.prompts[slot-1];
  if(!prompt)throw Error('Prompt da posição indisponível.');
  await navigator.clipboard.writeText(prompt);
  status.textContent='Prompt completo da imagem '+String(slot).padStart(2,'0')+' copiado. A foto original deve ser anexada ao ChatGPT.';
 }catch(e){status.textContent='Não foi possível copiar o prompt: '+e.message;}
});

// Exibir somente a etapa escolhida. Os rascunhos e o progresso
// permanecem persistidos mesmo com seus paineis temporariamente ocultos.
function optimizerWorkflowActivateOnly(view,sourceStage=null){
 optimizerWorkflowActiveView=view;
 optimizerWorkflowSourceStage=view==='source'?sourceStage:null;
 const editor=$('#optimizerWorkflowEditor');
 const discount=$('#optimizerDiscountReviewInline');
 const execution=$('#optimizerExecutionPanel');
 if(editor)editor.hidden=view!=='editor';
 if(discount)discount.hidden=view!=='discount';
 if(execution)execution.hidden=view!=='execution';
 if(view!=='editor')optimizerWorkflowStage=null;
 for(const card of $('#optimizerWorkflowCards')?.querySelectorAll('.optimizer-workflow-card')||[]){
  const selected=view==='editor'&&card.dataset.stage===optimizerWorkflowStage||
   view==='discount'&&card.dataset.stage==='discount'||
   view==='source'&&card.dataset.stage===sourceStage;
  card.classList.toggle('is-current',selected);
  card.setAttribute('aria-expanded',String(selected&&view!=='source'));
 }
}

// Kit existente: Título e Descrição reutilizam os textos já preparados acima.
// A conferência grava apenas o checklist da SKU principal; nunca publica na Shopee.
const optimizerKitSourceTimers={seo:0,description:0};
const optimizerKitSourcePending={seo:null,description:null};
const optimizerKitSourceBusy={seo:false,description:false};
const optimizerKitSourceErrors={seo:'',description:''};
function optimizerKitSourceValue(stage){
 const value=String($(stage==='seo'?'#kitTitle':'#kitDescription')?.value||'');
 return stage==='seo'?value.normalize('NFC').replace(/\s+/g,' ').trim():
  value.replace(/\r\n?/g,'\n').normalize('NFC').trim();
}
function optimizerKitSourcePaint(){
 const kit=optimizerKitWorkflowActive(),w=optimizerWorkflowPlan;
 for(const [stage,name] of [['seo','Seo'],['description','Description']]){
  const panel=$('#kitReview'+name),button=$('#kitReview'+name+'Button');
  const status=$('#kitReview'+name+'Status');
  if(!panel||!button||!status)continue;
  panel.hidden=!kit;
  if(!kit)continue;
  const row=w.stages?.find(x=>x.key===stage),field=stage==='seo'?'draftTitle':'draftDescription';
  const value=optimizerKitSourceValue(stage);
  const matched=value===String(w[field]||'');
  const reviewed=row?.reviewed===true&&matched&&!optimizerKitSourcePending[stage];
  const busy=optimizerKitSourceBusy[stage];
  button.disabled=busy;
  button.textContent=busy?'Salvando conferência…':reviewed?'✓ Etapa conferida · Reabrir':'✓ Registrar etapa concluída';
  const error=optimizerKitSourceErrors[stage];
  status.textContent=busy?'Validando e salvando no checklist da SKU principal…':
   error?'⚠ '+error:
   reviewed?'✓ Conferência salva. Conteúdo preparado para a prévia e execução.':
   !value?'Preencha o texto do kit antes de registrar a etapa.':
   stage==='seo'&&[...value].length<100?
    'Título com '+[...value].length+' caracteres. Pode conferir; 100–120 é recomendação SEO.':
   'Pendente de conferência. O rascunho não foi publicado na Shopee.';
  status.dataset.state=busy?'info':error?'error':reviewed?'success':'pending';
  const card=$('#optimizerWorkflowCards')?.querySelector('[data-stage="'+stage+'"]');
  if(card){
   card.classList.toggle('optimizer-workflow-reviewed',reviewed);
   card.classList.toggle('optimizer-workflow-pending',!reviewed);
   const summary=card.querySelector('.optimizer-workflow-label small');
   if(summary)summary.textContent=reviewed?'Conferência registrada':'Preparar e revisar';
   const mark=card.querySelector('.optimizer-workflow-symbol');
   if(mark)mark.textContent=reviewed?'✓':'→';
  }
 }
 if(kit&&w){
  const stages=(w.stages||[]).filter(x=>x.key!=='final');
  const completed=stages.filter(x=>x.reviewed||x.skipped).length+
   Number(optimizerKitDiscountReviewState(w).prepared);
  const count=$('#optimizerWorkflowCounter');
  if(count){
   count.textContent=completed+' / '+(stages.length+1)+' etapas conferidas';
   count.style.setProperty('--stage-progress',String(Math.round(completed/(stages.length+1)*100))+'%');
  }
 }
}
function optimizerKitSourceFlush(stage){
 if(optimizerKitSourceTimers[stage])clearTimeout(optimizerKitSourceTimers[stage]);
 optimizerKitSourceTimers[stage]=0;
 const pending=optimizerKitSourcePending[stage];
 if(!pending)return optimizerContentQueue;
 optimizerKitSourcePending[stage]=null;
 const body={sku:pending.sku,itemId:pending.itemId,modelId:pending.modelId,
  stage,reviewed:false,...(pending.value?{
   [stage==='seo'?'title':'description']:pending.value
  }:{})};
 // A fila é a mesma dos outros rascunhos: nunca aprovar antes de gravar.
 optimizerContentQueue=optimizerContentQueue.catch(()=>{}).then(()=>
  optimizerSaveChecklistReview(body));
 return optimizerContentQueue.catch(error=>{
  const w=optimizerWorkflowPlan;
  if(w&&String(w.sku)===String(pending.sku)&&
    String(w.itemId)===String(pending.itemId)&&
    optimizerKitSourceValue(stage)===pending.value){
   if(!optimizerKitSourcePending[stage])optimizerKitSourcePending[stage]=pending;
   optimizerWorkflowNotice('Rascunho do kit não confirmado no servidor: '+error.message,'warning');
  }
  throw error;
 });
}
function optimizerKitSourceChanged(){
 if(!optimizerKitWorkflowActive()){optimizerKitSourcePaint();return;}
 const w=optimizerWorkflowPlan;
 for(const stage of ['seo','description']){
  const field=stage==='seo'?'draftTitle':'draftDescription';
  const value=optimizerKitSourceValue(stage);
  if(String(w[field]||'')===value)continue;
  w[field]=value;
  optimizerKitSourceErrors[stage]='';
  const row=w.stages?.find(x=>x.key===stage);
  if(row){row.reviewed=false;row.reviewedAt=null;row.status='pending';}
  optimizerKitSourcePending[stage]={sku:w.sku,itemId:w.itemId,modelId:w.modelId,
   stage,value};
  if(optimizerKitSourceTimers[stage])clearTimeout(optimizerKitSourceTimers[stage]);
  optimizerKitSourceTimers[stage]=setTimeout(()=>{
   void optimizerKitSourceFlush(stage).catch(()=>{});
  },850);
 }
 optimizerKitSourcePaint();
}
globalThis.RAKitSourceChanged=optimizerKitSourceChanged;
async function optimizerKitSourceConfirm(stage){
 const w=optimizerWorkflowPlan;
 if(!optimizerKitWorkflowActive()||!['seo','description'].includes(stage)||!w)return;
 optimizerKitSourceChanged();
 const field=stage==='seo'?'draftTitle':'draftDescription';
 const value=optimizerKitSourceValue(stage);
 const row=w.stages?.find(x=>x.key===stage);
 const reviewed=row?.reviewed===true&&!optimizerKitSourcePending[stage];
 optimizerKitSourceErrors[stage]='';
 optimizerKitSourceBusy[stage]=true;optimizerKitSourcePaint();
 try{
  if(!reviewed){
   if(stage==='seo'){
    const length=[...value].length;
    if(length<10||length>120)
     throw Error('O título do kit deve ter entre 10 e 120 caracteres. Atual: '+length+'.');
   }else if(!value)throw Error('A descrição do kit está vazia.');
  }
  await optimizerKitSourceFlush(stage);
  if(optimizerWorkflowPlan!==w||optimizerKitSourceValue(stage)!==value)
   throw Error('O anúncio ou texto mudou durante a conferência. Confira novamente.');
  const body={sku:w.sku,itemId:w.itemId,modelId:w.modelId,stage,reviewed:!reviewed,
   ...(stage==='seo'?{kitPreparedTitle:true}:{}),
   [stage==='seo'?'title':'description']:value};
  const result=await optimizerSaveChecklistReview(body);
  if(optimizerWorkflowPlan!==w||optimizerKitSourceValue(stage)!==value)
   throw Error('O texto foi alterado. Refaça a conferência antes de executar.');
  if(result.saved!==true||result.stages?.find(x=>x.key===stage)?.reviewed!==!reviewed)
   throw Error('O servidor não confirmou o status da etapa.');
  optimizerWorkflowRender({...w,...result,stages:result.stages});
  optimizerWorkflowActivateOnly('source',stage);
  void optimizerExecutionPrepare();
  optimizerWorkflowNotice(reviewed?'Etapa reaberta para revisão.':
   '✓ '+(stage==='seo'?'Título SEO':'Descrição')+
   ' conferido e salvo para execução na SKU principal. Nenhuma publicação realizada.','success');
 }catch(error){
  optimizerKitSourceErrors[stage]=String(error.message||error);
  optimizerWorkflowNotice('Não foi possível registrar a etapa: '+error.message,'error');
 }finally{
  optimizerKitSourceBusy[stage]=false;
  optimizerKitSourcePaint();
 }
}
$('#kitReviewSeoButton')?.addEventListener?.('click',()=>void optimizerKitSourceConfirm('seo'));
$('#kitReviewDescriptionButton')?.addEventListener?.('click',()=>void optimizerKitSourceConfirm('description'));

function optimizerWorkflowOpen(key){
 optimizerContentRemember();
 globalThis.ShopeeFiscalStudio?.close?.();
 globalThis.ShopeeDescriptionStudio?.close?.();
 globalThis.ShopeeTitleStudio?.close?.();
 const data=optimizerWorkflowPlan;
 const stage=(data?.stages||[]).find(x=>x.key===key);
 if(!stage)return;
 optimizerWorkflowStage=key;
 optimizerWorkflowActivateOnly('editor');
 $('#optimizerWorkflowStageNumber').textContent='ETAPA '+String(data.stages.indexOf(stage)+1).padStart(2,'0');
 $('#optimizerWorkflowStageTitle').textContent=stage.name;
 $('#optimizerWorkflowStageDetail').textContent=stage.detail;
 const guide=$('#optimizerWorkflowStageGuidance');
 const isImages=key==='images';
 guide.textContent=stage.hint+(isImages?'\n\nROTEIRO PARA GERAR E REVISAR AS NOVE IMAGENS:\n'+workflowImageGuide+
    '\n\nUse o prompt mestre salvo em Regras da loja. Confira produto e medidas antes de substituir uma fotografia.':'');
 guide.hidden=isImages||key==='description';
 if(isImages){const toggle=$('#optimizerCommercialRules');if(toggle)toggle.setAttribute('aria-expanded','false');}
 const draftWrap=$('#optimizerWorkflowDraftWrap');
 const isSeo=key==='seo',isDescription=key==='description';
 const isVideo=key==='video';
 $('#optimizerImagesPanel').hidden=!isImages;
 $('#optimizerTechnicalPanel').hidden=key!=='technical';
 $('#optimizerFiscalPanel').hidden=key!=='fiscal';
 $('#optimizerVariationPanel').hidden=key!=='variants'||!$('#optimizerHasVariants').checked;
 if(key==='variants')optimizerVariationRender(data);
 if(isImages){optimizerImageCorrectionLoad();void optimizerImagesLoad();}
 if(key==='technical'){
   $('#optimizerTechnicalAdvanced').open=false;
   optimizerTechnicalRender(data);
   optimizerTechReviewFeedback('', 'info');
 }else{
   const message=$('#optimizerTechnicalReviewFeedback');
   if(message)message.hidden=true;
 }
 if(key==='fiscal')optimizerFiscalRender(data);
 optimizerSupplierRender(data,key);
 $('#optimizerVideoManualPanel').hidden=!isVideo;
 if(isVideo){optimizerVideoReset();void optimizerVideoLoadSaved();void optimizerVideoFindMarket();}
 draftWrap.hidden=!(isSeo||isDescription);
 $('#optimizerDescriptionCompact').hidden=!isDescription;
 if(isSeo||isDescription){
   $('#optimizerWorkflowDraftLabel').textContent=isSeo?'Título SEO proposto (edite antes de gravar na Shopee)':
     'Rascunho de descrição (edite antes de gravar na Shopee)';
   // HTML maxlength counts UTF-16 units; validation below counts Unicode points.
   if(isSeo)$('#optimizerWorkflowDraft').maxLength=500;
   else $('#optimizerWorkflowDraft').removeAttribute('maxlength');
   $('#optimizerWorkflowDraft').value=isSeo?data.draftTitle:data.draftDescription;
   if(isDescription){
     const generated=data.descriptionAutoGenerated===true;
     $('#optimizerWorkflowDraft').rows=7;
     draftWrap.hidden=true;
     $('#optimizerDescriptionToggle').textContent='✏️ Editar descrição manualmente ⌄';
     optimizerDescriptionCompactPreview(data.draftDescription);
     const d=$('#optimizerDescriptionReady');
     if(d){
       d.hidden=false;
       d.textContent=generated
         ?'✨ Descrição comercial elaborada automaticamente para esta SKU — revise os dados confirmados antes de salvar.'
         :'✓ Descrição já preparada e salva para esta SKU. Você pode editar antes de executar.';
       d.dataset.valid=data.descriptionComposer?.valid===false?'false':'true';
     }
   }else{
     const d=$('#optimizerDescriptionReady');if(d)d.hidden=true;
   }
   optimizerCopyCount();
 }
 const variants=$('#optimizerTitleVariants');variants.replaceChildren();variants.hidden=!isSeo||!data.contentVariants;
 if(isSeo&&data.contentVariants){for(const [name,title] of Object.entries(data.contentVariants)){
  const button=optimizerMake('button','secondary','Usar título '+name+' · '+[...title].length+' caracteres');button.type='button';
  button.onclick=()=>{$('#optimizerWorkflowDraft').value=title;$('#optimizerWorkflowDraft').dispatchEvent(new Event('input',{bubbles:true}));};variants.append(button);
 }}
 const research=$('#optimizerContentResearch');research.hidden=!(isSeo||isDescription);
 research.textContent=isDescription
  ?'Fonte do rascunho: '+(data.descriptionComposer?.source||'dados da SKU')+
   '. Informações não comprovadas, números de registro e certificados não são inventados. A revisão continua necessária.'
  :(data.contentResearch?.summary||'Pesquisa de concorrentes ainda não registrada para esta SKU. O título exige revisão.');
 if(isSeo){
   // As quatro opções são somente prévias: aplicação ocorre ao selecionar e confirmar a revisão.
   draftWrap.parentNode.insertBefore(variants,draftWrap);
   $('#optimizerWorkflowDraft').rows=3;
   globalThis.ShopeeTitleStudio?.open(data,title=>{
     $('#optimizerWorkflowDraft').value=title;
     $('#optimizerWorkflowDraft').dispatchEvent(new Event('input',{bubbles:true}));
   });
 }else{
   draftWrap.parentNode.insertBefore(draftWrap,variants);
   $('#optimizerWorkflowDraft').rows=7;
 }
 $('#optimizerWorkflowReview').hidden=key==='final'||stage.skipped;
 if(key!=='final'&&!stage.skipped){
   $('#optimizerWorkflowReview').textContent=key==='fiscal'?
     (stage.reviewed?'Atualizar dados fiscais salvos':'Salvar informações fiscais no Motor Matriz'):
     (stage.reviewed?'Reabrir conferência':'Registrar etapa como conferida');
 }
 $('#optimizerWorkflowShopee').href='https://seller.shopee.com.br/portal/product/'+encodeURIComponent(data.itemId)+'?pageEntry=product_list';
 if(isDescription)globalThis.ShopeeDescriptionStudio?.open?.(data);
 if(key==='fiscal')globalThis.ShopeeFiscalStudio?.open?.(data);
 // Not an execution button: opens the Seller Center for an actual confirmed edit.
 // Do not scroll unexpectedly while revising a sequence of SKU steps.
}
async function optimizerWorkflowLoad(record){
 const serial=++optimizerWorkflowSerial,sku=String(record?.sku||'');
 const id=String(record?.itemId||'');
 const modelId=String(record?.selectedModelId||'0');
 const p=$('#optimizerWorkflowPanel');
 // Toda NOVA SKU inicia no modo completo. Não herdar "Somente imagens" da anterior.
 // O operador pode escolher uma etapa isolada para a SKU atual, sem alteração automática.
 const scopeIdentity=[sku,id,modelId].join('|');
 if(optimizerExecScopeOwner!==scopeIdentity){
  optimizerExecScopeOwner=scopeIdentity;
  $('#optimizerExecutionScope').value='all';
 }
 // Mesmo quando a SKU chega por um atalho/deep link, desativar ponte
 // de outra SKU sem depender de um evento de digitação.
 void optimizerChatBridgeSwitchSku(sku);
 p.hidden=false;
 // Produto identificado pela auditoria: preparar 4 títulos imediatamente, antes
 // mesmo da abertura da etapa SEO. O estúdio reutiliza o resultado por SKU.
 if(sku&&id){
   const titleJob=globalThis.ShopeeTitleStudio?.prefetch?.({
     ...record,sku,itemId:id,modelId,productTitle:record?.title||''
   });
   titleJob?.catch(()=>{}); // Falhas da IA não bloqueiam a análise da SKU.
 }
 optimizerVideoReset();
 globalThis.ShopeeDescriptionStudio?.close?.();
 optimizerWorkflowActivateOnly(null);
 optimizerWorkflowNotice('Preparando etapas de revisão da SKU '+sku+' com a auditoria oficial...');
 if(globalThis.__RA_KIT_OPTIMIZATION_HANDOFF?.sku===sku)
  globalThis.RAKitAuditPhase?.('Auditoria concluida. Carregando as oito etapas reais do kit.');
 try{
   const qs=new URLSearchParams({sku,item_id:id,model_id:modelId});
   const data=await json('/api/shopee/optimizer/workflow?'+qs.toString(),
     {signal:AbortSignal.timeout(60000)});
   if(serial!==optimizerWorkflowSerial||$('#optimizerSku').value.trim()!==sku)return;
   optimizerContentRestore(data);
   optimizerWorkflowRender(data);
   const kitHandoff=globalThis.__RA_KIT_OPTIMIZATION_HANDOFF;
   if(kitHandoff?.embed&&data.kitOptimization?.kitSku===kitHandoff.kitSku&&
      String(data.itemId)===kitHandoff.itemId&&String(data.sku)===kitHandoff.sku){
    kitOptimizerMount();
    const status=$('#kitOptimizerWorkspaceStatus');if(status)status.hidden=true;
    const active=(data.stages||[]).filter(s=>['video','technical','fiscal'].includes(s.key)||s.key==='variants'&&!s.skipped);
    const firstPending=active.find(s=>!s.reviewed&&!s.skipped)?.key;
    if(firstPending)optimizerWorkflowOpen(firstPending);
    else if(active[0])optimizerWorkflowOpen(active[0].key);
    globalThis.RAKitOptimizerReady?.(data);
   }
   // A retomada automática pertence SOMENTE à SKU que foi carregada.
   if(optimizerChatBridgeJob&&!optimizerChatBridgeIdentity(optimizerChatBridgeJob,data))
    void optimizerChatBridgeSwitchSku(sku);
   else if(optimizerChatBridgeIdentity(optimizerChatBridgeJob,data))
    void optimizerChatBridgeRecover();
   void optimizerExecutionPrepare();
   optimizerWorkflowNotice('Plano da SKU '+sku+' carregado. As etapas são revisões, não alterações publicadas.','success');
 }catch(e){
   if(serial===optimizerWorkflowSerial&&$('#optimizerSku').value.trim()===sku){
     optimizerWorkflowNotice('Não foi possível carregar as etapas: '+e.message+'. Refaça a análise desta SKU.','error');
     const status=$('#kitOptimizerWorkspaceStatus');
     if(status&&kitOptimizerEmbedded){status.hidden=false;status.textContent='Falha ao carregar etapas: '+e.message;}
   }
 }
}
$('#optimizerWorkflowClose')?.addEventListener?.('click',()=>{
 optimizerContentRemember();
 globalThis.ShopeeFiscalStudio?.close?.();
 globalThis.ShopeeDescriptionStudio?.close?.();
 globalThis.ShopeeTitleStudio?.close?.();
 optimizerWorkflowActivateOnly('closed');
});
$('#optimizerShowExecution')?.addEventListener?.('click',()=>{
 const saved=optimizerExecJob&&String(optimizerExecJob.sku)===String(optimizerWorkflowPlan?.sku)&&
  String(optimizerExecJob.item_id)===String(optimizerWorkflowPlan?.itemId)&&
  String(optimizerExecJob.model_id||0)===String(optimizerWorkflowPlan?.modelId||0);
 if(!saved&&!optimizerKitWorkflowActive()&&optimizerWorkflowPlan?.variationConfig?.enabled!==true&&
  $('#optimizerExecutionScope')?.value==='all'&&!optimizerDiscountApprovalReady()){
  optimizerDiscountOpenReview();
  optimizerWorkflowNotice('Conclua a conferência do desconto na etapa 08 acima para liberar a execução completa.','warning');
  return;
 }
 globalThis.ShopeeFiscalStudio?.close?.();
 globalThis.ShopeeDescriptionStudio?.close?.();
 globalThis.ShopeeTitleStudio?.close?.();
 optimizerContentRemember();
 optimizerWorkflowActivateOnly('execution');
 // A prévia sempre reflete a versão fiscal revisada mais recente da SKU.
 void optimizerExecutionPrepare();
});
$('#optimizerWorkflowNext')?.addEventListener?.('click',()=>{
 const stages=(optimizerWorkflowPlan?.stages||[]).filter(x=>x.key!=='final'&&!x.skipped&&
  (!optimizerKitWorkflowActive()||['video','technical','fiscal','variants'].includes(x.key)));
 const index=stages.findIndex(x=>x.key===optimizerWorkflowStage);
 if(index>=0&&index<stages.length-1)optimizerWorkflowOpen(stages[index+1].key);
 else $('#optimizerShowExecution').click();
});
$('#optimizerHasVariants')?.addEventListener?.('change',()=>{
 const w=optimizerWorkflowPlan;if(!w)return;
 const enabled=$('#optimizerHasVariants').checked;
 w.variationConfig={...w.variationConfig,enabled};
 const stage=w.stages.find(x=>x.key==='variants');
 if(stage){stage.skipped=!enabled;stage.status=enabled?'pending':'skipped';stage.reviewed=false;}
 optimizerWorkflowOpen('variants');
 optimizerWorkflowNotice(enabled?'Informe o tipo e as opções reais; depois registre a conferência.':'Este anúncio foi marcado como sem variações.');
 const ctx={sku:w.sku,itemId:w.itemId,modelId:w.modelId};
 void (async()=>{
  try{
   const out=await json('/api/shopee/optimizer/workflow/review',{
    method:'POST',headers:{'Content-Type':'application/json'},
    body:JSON.stringify({...ctx,stage:'variants',reviewed:false,
     variationConfig:{enabled,type:enabled?(w.variationConfig?.type||''):'',values:enabled?(w.variationConfig?.values||[]):[]}}),
    signal:AbortSignal.timeout(60000)});
   if(optimizerWorkflowPlan?.sku!==ctx.sku||optimizerWorkflowPlan?.itemId!==ctx.itemId)return;
   w.variationConfig=out.variationConfig;
   w.stages=out.stages;
   optimizerWorkflowRender(w);
   optimizerWorkflowNotice(enabled?'Checklist habilitado e salvo. Informe as opções e registre a revisão.':'Sem variações confirmado e salvo nesta SKU.','success');
  }catch(e){optimizerWorkflowNotice('Não foi possível salvar o checklist: '+e.message,'error')}
 })();
});
$('#optimizerWorkflowCopy')?.addEventListener?.('click',async()=>{
 const key=optimizerWorkflowStage,stage=optimizerWorkflowPlan?.stages?.find(x=>x.key===key);
 if(!stage)return;
 const master=key==='images'?String($('#optimizerPrompt')?.value||'').trim():'';
 const value=(key==='seo'||key==='description')
  ?$('#optimizerWorkflowDraft').value
  :stage.name+'\n\n'+stage.detail+'\n'+$('#optimizerWorkflowStageGuidance').textContent+
    (master?'\n\nPROMPT MESTRE SALVO DA LOJA:\n'+master:'');
 try{await navigator.clipboard.writeText(value);optimizerWorkflowNotice('Orientação da etapa copiada para revisão.','success');}
 catch{optimizerWorkflowNotice('Não foi possível copiar automaticamente; selecione o texto manualmente.','warning');}
});
// O salvamento do checklist é idempotente por SKU. Repetir UMA vez somente
// quando o gateway Render devolver 502/503/504; nunca repetir publicações.
async function optimizerSaveChecklistReview(body){
 for(let attempt=0;attempt<2;attempt++){
  try{
   return await json('/api/shopee/optimizer/workflow/review',{
    method:'POST',headers:{'Content-Type':'application/json'},
    body:JSON.stringify(body),signal:AbortSignal.timeout(60000)
   });
  }catch(error){
   if(attempt||!/^HTTP (?:502|503|504)\b/.test(String(error.message||'')))throw error;
   await new Promise(resolve=>setTimeout(resolve,1100));
  }
 }
}
let optimizerFiscalReviewBusy=false;
async function optimizerWorkflowSaveReview({fiscalConfirm=false}={}){
 const data=optimizerWorkflowPlan,key=optimizerWorkflowStage;
 if(key==='fiscal'&&optimizerFiscalReviewBusy)return;
 const stage=data?.stages?.find(x=>x.key===key);
 if(!stage||key==='final')return;
 if(fiscalConfirm&&key!=='fiscal')return;
 const btn=$('#optimizerWorkflowReview'),check=$('#raFiscalChecklistConfirm');
 if(key==='fiscal')optimizerFiscalReviewBusy=true;
 btn.disabled=true;
 if(check)check.disabled=true;
 const originalButtonText=btn.textContent;
 if(key==='fiscal')btn.textContent=fiscalConfirm?'Confirmando etapa fiscal…':'Salvando rascunho fiscal…';
 if(key==='technical'){
   btn.textContent='Salvando conferência…';
   optimizerTechReviewFeedback('Verificando os campos e salvando a revisão da SKU '+data.sku+'…','info');
 }
 optimizerWorkflowNotice(key==='fiscal'?
  (fiscalConfirm?'Registrando a conferência da etapa 07…':'Salvando o rascunho fiscal no Motor Matriz…'):
  'Salvando a conferência da etapa '+stage.name+' na Shopee Manager...');
 try{
   if(key==='seo'&&!stage.reviewed){
     const title=$('#optimizerWorkflowDraft').value.normalize('NFC').replace(/\s+/g,' ').trim();
     const length=[...title].length;
     if(length<100||length>120)throw Error('Título SEO com '+length+' caracteres. Para aprovar, informe de 100 a 120 caracteres usando somente dados confirmados.');
   }
   if(key==='seo'||key==='description'){optimizerContentRemember();await optimizerContentFlush();}
   if(key==='technical')await techFlush();
   const fiscalChanged=check?.dataset.dirty==='true';
   const fiscalReviewed=fiscalConfirm?(!stage.reviewed||fiscalChanged):false;
   const body={itemId:data.itemId,modelId:data.modelId,sku:data.sku,
     stage:key,reviewed:key==='fiscal'?fiscalReviewed:
       key==='variants'?$('#optimizerHasVariants').checked:!stage.reviewed};
   if(key==='technical'){
     // A fonte é opcional para registrar a conferência local. Não exigir que
     // o vendedor declare WeDrop, fabricante ou nota quando não há tal prova.
     // Os valores continuam validados pela categoria oficial no servidor.
     body.attributes=optimizerTechnicalValues();
   }
   if(key==='fiscal')body.tax=optimizerFiscalValues();
   if(key==='variants'){
     body.variationConfig=optimizerVariationValues();
     if(body.reviewed){
       if(typeof globalThis.RedeVariants?.saveDraft!=='function')throw Error('Editor de variações indisponível. Atualize a página.');
       await globalThis.RedeVariants.saveDraft(); // Persiste cada opção antes da conferência.
     }
   }
   if(key==='seo')body.title=$('#optimizerWorkflowDraft').value;
   if(key==='description')body.description=$('#optimizerWorkflowDraft').value;
   const result=await optimizerSaveChecklistReview(body);
   if(optimizerWorkflowPlan?.sku!==data.sku||optimizerWorkflowPlan?.itemId!==data.itemId||optimizerWorkflowPlan?.modelId!==data.modelId)return;
   if(key==='technical'&&body.reviewed&&
      result.stages?.find(x=>x.key==='technical')?.reviewed!==true)
       throw Error('O servidor não confirmou a ficha técnica. Consulte os campos pendentes e tente novamente.');
   if(key==='fiscal'&&(result.saved!==true||
     result.stages?.find(x=>x.key==='fiscal')?.reviewed!==body.reviewed))
       throw Error('O servidor não confirmou o salvamento e o status da etapa fiscal.');
   if(key==='technical'){
    // O rascunho permanece salvo por SKU: atributos opcionais incompatíveis
    // ficam disponíveis para correção, mas não serão enviados à Shopee.
    // Não excluir o draft após apenas registrar a conferência.
   }
   optimizerWorkflowRender({...data,...result,stages:result.stages});
   if(key==='fiscal')globalThis.ShopeeFiscalStudio?.update?.({...data,...result,stages:result.stages});
   // A saved fiscal draft must never automatically re-attempt a rejected CEST
   // update in the background. Execution has its own explicit separate button.
   // Salvar fiscal atualiza a prévia, mas não faz qualquer chamada de publicação.
   void optimizerExecutionPrepare();
   optimizerWorkflowNotice(key==='fiscal'?
     (body.reviewed?
       '✓ Etapa 07 da SKU '+data.sku+' conferida e salva no Motor Matriz. Nenhuma informação publicada na Shopee.':
       fiscalConfirm?
         'Conferência fiscal reaberta para revisão nesta SKU. Rascunho preservado; nenhuma publicação realizada.':
         'Rascunho fiscal da SKU '+data.sku+' salvo no Motor Matriz. Use “✓ Registrar etapa concluída” para confirmar. Nenhuma publicação realizada.'):
     'Revisão da etapa '+stage.name+' salva. Nenhum dado do anúncio foi alterado na Shopee.','success');
   if(key==='technical'){
     const ignored=Array.isArray(result.technicalSkipped)?result.technicalSkipped:[];
     const ignoredNames=ignored.map(item=>optimizerTechLabel(item.name,item.attributeId)).join(', ');
     optimizerTechReviewFeedback(body.reviewed
       ?'✓ Ficha técnica da SKU '+data.sku+' registrada como conferida. '+
          (ignored.length?ignored.length+' atributo(s) opcionais incompatíveis ('+ignoredNames+
            ') preservados no rascunho e excluídos do envio. ':'')+
          'Nenhuma alteração publicada na Shopee.'
       :'Ficha técnica reaberta para revisão. Nenhuma alteração publicada.', 'success');
   }
 }catch(e){
   const message='Falha ao salvar conferência: '+e.message;
   optimizerWorkflowNotice(message,'error');
   if(key==='technical')optimizerTechReviewFeedback('⚠ '+message,'error');
 }
 finally{
   btn.disabled=false;
   if(check)check.disabled=false;
   if(key==='fiscal'){
     optimizerFiscalReviewBusy=false;
     // O botão é sincronizado com o estado confirmado pelo servidor.
     btn.textContent='Salvar dados fiscais (rascunho)';
   }else if(btn.textContent==='Salvando conferência…')btn.textContent=originalButtonText;
 }
}
$('#optimizerWorkflowReview')?.addEventListener?.('click',()=>void optimizerWorkflowSaveReview());
globalThis.RAFiscalChecklistConfirm=()=>optimizerWorkflowSaveReview({fiscalConfirm:true});
// Pré-execução parcial Shopee. Only explicit interaction authorizes update_item.
let optimizerExecPlan=null,optimizerExecContext=null,optimizerExecBusy=false,optimizerExecSerial=0;
let optimizerExecAutoModelToken=null,optimizerExecAutoModelPreview=null;
let optimizerExecPoll=null,optimizerExecJob=null,optimizerExecPolling=false,optimizerExecPollingIdentity='',optimizerExecStartError='';
let optimizerExecPreparation=null,optimizerExecPrepareController=null,optimizerExecProgress=null;
let optimizerExecScopeOwner='',optimizerExecPrepareError='';
let optimizerExecSafeRecoveryKey='',optimizerExecSafeRecovering=false;
function optimizerExecNotice(message,state='info'){
 const e=$('#optimizerExecutionStatus');e.textContent=message;e.dataset.state=state;
}
function optimizerExecReset(){
 // Um request de pré-execução antigo não pode ocupar a fila da próxima SKU.
 if(optimizerExecPrepareController){optimizerExecPrepareController.abort();optimizerExecPrepareController=null;}
 optimizerExecPreparation=null;
 optimizerExecStartError='';optimizerExecPrepareError='';
 const keepProgress=optimizerExecProgress&&optimizerWorkflowPlan&&
  String(optimizerExecProgress.sku)===String(optimizerWorkflowPlan.sku)&&
  String(optimizerExecProgress.itemId)===String(optimizerWorkflowPlan.itemId)&&
  String(optimizerExecProgress.modelId)===String(optimizerWorkflowPlan.modelId||0);
 if(!keepProgress){
  if(optimizerExecPoll)clearTimeout(optimizerExecPoll);optimizerExecPoll=null;optimizerExecJob=null;
 }
 $('#optimizerExecutionReconcile').hidden=true;$('#optimizerExecutionRetry').hidden=true;
 $('#optimizerExecutionLaunch').hidden=true;
 $('#optimizerExecutionRemaining').hidden=true;
 $('#optimizerExecutionShopeeLink').hidden=true;
 $('#optimizerExecutionIssue').hidden=true;
 optimizerExecSafeRecoveryKey='';optimizerExecSafeRecovering=false;
 if(!keepProgress){
  optimizerExecProgress=null;
  $('#optimizerExecutionTracker').hidden=true;
  $('#optimizerExecutionActivity').hidden=true;
 }
 ++optimizerExecSerial;optimizerExecPlan=null;optimizerExecContext=null;optimizerExecBusy=false;
 optimizerExecAutoModelToken=null;optimizerExecAutoModelPreview=null;
 optimizerModelMarketApprovalPaint(null);
 $('#optimizerExecutionSummary').hidden=true;
 $('#optimizerExecutionConfirmation').hidden=true;
 $('#optimizerExecutionConfirmation').open=false;
 $('#optimizerExecutionAccept').checked=false;
 $('#optimizerExecutionInput').value='';
 $('#optimizerExecutionRun').disabled=true;
 $('#optimizerExecutionLaunch').disabled=true;
 $('#optimizerExecutionRemaining').disabled=true;
}
// Acompanhamento em tempo real, sempre com informações da própria SKU e da API.
// Imagens em mídia não significam alteração publicada até status "verified".
// Fechamento orientado por DADOS REAIS da SKU (não pelo job comercial antigo).
// A consulta só lê a Shopee/rascunho; variação/desconto exigem revisão individual.
let optimizerFinalSnapshot=null,optimizerFinalSnapshotKey='',optimizerFinalLoading=false;
async function optimizerFinalPendingRefresh(force=false){
 const w=optimizerWorkflowPlan,wrap=$('#optimizerFinalPending');
 if(!wrap||!w?.sku||!w?.itemId)return;
 const key=[w.sku,w.itemId,w.modelId].join('|');
 const hasVariantDraft=w.variationConfig?.enabled===true;
 // Quando a prévia única inclui os modelos, não exibir execução manual paralela.
 if(optimizerExecPlan?.modelVariations||optimizerExecJob?.plan?.modelVariations){wrap.hidden=true;return;}
 if(!hasVariantDraft&&!optimizerExecJob?.state)return;
 wrap.hidden=false;
 const line=$('#optimizerFinalVariantsState'),last=$('#optimizerFinalDiscountState');
 if(!force&&optimizerFinalSnapshotKey===key&&optimizerFinalSnapshot&&
   Date.now()-optimizerFinalSnapshot.checkedAt<45000){
  optimizerFinalPendingPaint(optimizerFinalSnapshot);return;
 }
 if(optimizerFinalLoading)return;
 optimizerFinalLoading=true;
 line.textContent='Consultando as variações salvas e os modelos reais na Shopee...';
 try{
  const q=new URLSearchParams({sku:w.sku,item_id:w.itemId,model_id:w.modelId});
  const response=await fetch('/api/shopee/optimizer/variants/draft?'+q,{
   credentials:'same-origin',cache:'no-store',signal:AbortSignal.timeout(45000)});
  const data=await response.json().catch(()=>({}));
  if(!response.ok||data.ok!==true)throw Error(data.error||'Falha ao consultar variações.');
  if(optimizerWorkflowPlan?.sku!==w.sku||String(optimizerWorkflowPlan?.itemId)!==String(w.itemId))return;
  optimizerFinalSnapshotKey=key;
  optimizerFinalSnapshot={...data,checkedAt:Date.now()};
  optimizerFinalPendingPaint(optimizerFinalSnapshot);
 }catch(error){
  line.textContent='Não foi possível conferir as variações: '+error.message;
  last.textContent='O desconto será liberado somente após a conferência da variação e dos preços por modelo.';
 }finally{optimizerFinalLoading=false;}
}
function optimizerFinalPendingPaint(data){
 const options=data?.details?.options||[];
 const photos=options.filter(o=>o.asset?.sha256&&o.photoConfirmed).length;
 const full=options.length>=2&&photos===options.length;
 const campaign=$('#optimizerFinalCampaignId');
 if(campaign&&!campaign.value&&$('#optimizerExecDiscountCampaign')?.value)
  campaign.value=String($('#optimizerExecDiscountCampaign').value).trim();
 const published=data.allModelsConfirmed===true;
 const liveKnown=data.liveHasModel!==null&&data.liveHasModel!==undefined;
 const vars=$('#optimizerFinalVariantsState'),price=$('#optimizerFinalDiscountState');
 if(vars)vars.textContent=published?
  'Modelos confirmados na Shopee: '+options.map(o=>o.name).join(' / ')+'.':
  options.length?'Rascunho salvo: '+options.map(o=>o.name).join(' / ')+
   ' · '+photos+'/'+options.length+' fotos conferidas'+
   (liveKnown?' · modelos '+(data.liveHasModel?'identificados, aguardando conferência':'ainda não publicados'):' · situação na Shopee não confirmada')+'.':
  'Nenhum modelo preparado. Cadastre apenas opções reais do fornecedor.';
 if(price)price.textContent=published?
  'As variações estão na Shopee. O desconto exige prévia e margem de CADA modelo; não utilizar o valor do anúncio antigo sem variações.':
  full?'Depois de publicar e confirmar os modelos, conferir os descontos específicos das variações.':
  'Primeiro finalize as fotos, a disponibilidade e a publicação das variações.';
 const btn=$('#optimizerFinalVariantsOpen');
 if(btn)btn.textContent=published?'✓ Variações publicadas · conferir':
  data.liveHasModel===true?'Atualizar confirmação dos modelos ↻':'Conferir e publicar variações →';
 const pending=$('#optimizerFinalPendingNotice');
 if(pending)pending.textContent=published?
  'Conteúdo comercial preservado. Próximo passo: preço e promoção por modelo, sujeitos à confirmação pela API Shopee.':
  'As fotos e os dados salvos são reaproveitados. A publicação das variações exige autorização explícita, sem duplicação.';
}
function optimizerFinalPendingOpenVariants(){
 if(!optimizerWorkflowPlan)return;
 if(optimizerFinalSnapshot?.liveHasModel===true&&optimizerFinalSnapshot?.allModelsConfirmed!==true){
  void optimizerFinalPendingRefresh(true);
  optimizerExecNotice('Consultando novamente os modelos da Shopee, sem repetir a publicação.','info');
  return;
 }
 optimizerWorkflowOpen('variants');
 $('#optimizerWorkflowEditor')?.scrollIntoView?.({behavior:'smooth',block:'start'});
}
$('#optimizerFinalVariantsOpen')?.addEventListener('click',optimizerFinalPendingOpenVariants);
let optimizerModelDiscountApproval=null;
const finalDiscountNotice=(text,kind='info')=>{
 const box=$('#optimizerFinalModelDiscountResult');
 if(box){box.textContent=text;box.dataset.level=kind;}
};
function optimizerModelDiscountClear(){
 optimizerModelDiscountApproval=null;
 const button=$('#optimizerFinalModelDiscountApply');
 if(button){button.disabled=true;button.hidden=true;}
 const preview=$('#optimizerFinalModelDiscountPreview');
 if(preview){preview.hidden=true;preview.replaceChildren();}
}
$('#optimizerFinalCampaignId')?.addEventListener('input',optimizerModelDiscountClear);
$('#optimizerFinalDiscountOpen')?.addEventListener('click',async()=>{
 if(optimizerFinalLoading)return;
 const w=optimizerWorkflowPlan;if(!w)return;
 optimizerModelDiscountClear();
 const snap=optimizerFinalSnapshot;
 if(snap?.allModelsConfirmed!==true){
  optimizerFinalPendingOpenVariants();
  finalDiscountNotice('Primeiro confirme as variações na Shopee. Depois, volte para conferir o desconto por cor.','warning');
  return;
 }
 const input=$('#optimizerFinalCampaignId');
 const campaign=String(input?.value||$('#optimizerExecDiscountCampaign')?.value||'').trim();
 if(!/^\d{1,18}$/.test(campaign)){
  finalDiscountNotice('Informe acima o ID numérico da campanha Minha Promoção para conferir os dois modelos.','warning');
  input?.focus();return;
 }
 input.value=campaign;
 const btn=$('#optimizerFinalDiscountOpen');btn.disabled=true;
 finalDiscountNotice('Conferindo campanha, custo de cada cor e preços reais dos modelos na Shopee...');
 try{
  const response=await fetch('/api/shopee/optimizer/variants-discount/preview',{
   method:'POST',credentials:'same-origin',cache:'no-store',
   headers:{'Content-Type':'application/json'},
   body:JSON.stringify({sku:w.sku,itemId:w.itemId,modelId:w.modelId,discountId:campaign}),
   signal:AbortSignal.timeout(90000)
  });
  const data=await response.json().catch(()=>({}));
  if(!response.ok||data.ok!==true)throw Error(data.error||'Prévia da campanha não autorizada.');
  if(optimizerWorkflowPlan?.sku!==w.sku)return;
  const p=data.preview,block=$('#optimizerFinalModelDiscountPreview');
  const format=v=>Number(v).toLocaleString('pt-BR',{style:'currency',currency:'BRL'});
  block.replaceChildren();
  block.append(optimizerMake('strong','',
   'Prévia · '+p.models.length+' variações · Margem líquida estimada '+Number(p.netMarginPct).toFixed(2).replace('.',',')+'%'));
  for(const model of p.models){
   block.append(optimizerMake('p','',
    model.name+' · WeDrop '+model.supplierSku+' · custo '+format(model.cost)+
    ' · preço Shopee '+format(model.base)+' → promoção '+format(model.promo)));
  }
  block.append(optimizerMake('small','',
   'Nenhum preço bruto será alterado nesta operação. Os preços promocionais só serão aplicados após sua confirmação.'));
  block.hidden=false;
  optimizerModelDiscountApproval={token:data.approvalToken,key:w.sku+'|'+w.itemId+'|'+w.modelId,
   campaign,modelCount:p.models.length};
  const apply=$('#optimizerFinalModelDiscountApply');
  apply.hidden=p.action==='already';apply.disabled=p.action==='already';
  finalDiscountNotice(p.action==='already'?
   'Todos os modelos já constam na campanha com o preço correto. Nenhum reenvio necessário.':
   'Prévia validada. Confira as duas cores e clique em Confirmar e aplicar desconto nas variações.','success');
 }catch(error){finalDiscountNotice('Desconto ainda não liberado: '+error.message,'warning');}
 finally{btn.disabled=false;}
});
$('#optimizerFinalModelDiscountApply')?.addEventListener('click',async()=>{
 const p=optimizerModelDiscountApproval,w=optimizerWorkflowPlan;
 if(!p||!w||p.key!==w.sku+'|'+w.itemId+'|'+w.modelId||
   String($('#optimizerFinalCampaignId')?.value||'').trim()!==p.campaign)return;
 if(!confirm('PUBLICAÇÃO REAL: aplicar os preços promocionais aos '+p.modelCount+
  ' modelos conferidos na Minha Promoção da Shopee?'))return;
 const btn=$('#optimizerFinalModelDiscountApply');
 btn.disabled=true;
 // Nenhuma repetição automática quando a resposta for incerta.
 optimizerModelDiscountApproval=null;
 finalDiscountNotice('Enviando uma única solicitação de desconto à Shopee e conferindo resultado...');
 try{
  const response=await fetch('/api/shopee/optimizer/variants-discount/execute',{
   method:'POST',credentials:'same-origin',cache:'no-store',
   headers:{'Content-Type':'application/json'},
   body:JSON.stringify({sku:w.sku,itemId:w.itemId,modelId:w.modelId,
    discountId:p.campaign,approvalToken:p.token,confirm:true}),
   signal:AbortSignal.timeout(120000)
  });
  const data=await response.json().catch(()=>({}));
  if(!response.ok||data.ok!==true)throw Error(data.error||'Shopee não confirmou os descontos.');
  finalDiscountNotice(data.message,data.verified?'success':'warning');
  btn.hidden=data.verified===true;
 }catch(error){
  finalDiscountNotice('Resultado da promoção não confirmado: '+error.message+
   ' Confira a campanha antes de tentar novamente. Não houve reenvio automático.','warning');
 }
});
globalThis.OptimizerFinalization={
 onVariationsApplied:()=>{optimizerModelDiscountClear();optimizerFinalSnapshot=null;void optimizerFinalPendingRefresh(true);},
 refresh:()=>{optimizerFinalSnapshot=null;void optimizerFinalPendingRefresh(true);}
};
function optimizerExecutionVisibleCommands(progress,job){
 const recover=$('#optimizerExecutionRecoverStart'),full=$('#optimizerExecutionSwitchFull');
 const launch=$('#optimizerExecutionLaunch');
 if(!recover||!full||!launch)return;
 const allowed=Boolean(progress&&['prepared','blocked'].includes(progress.state)&&!progress.hasStarted);
 const current=optimizerWorkflowPlan;
 const matching=Boolean(current&&job?.plan&&String(job.sku)===String(current.sku)&&
  String(job.item_id)===String(current.itemId)&&
  String(job.model_id||0)===String(current.modelId||0));
 const stage=matching?String(job.plan.selectedStage||'all'):
  String(optimizerExecPlan?.selectedStage||'all');
 recover.hidden=!(allowed&&matching&&launch.hidden&&!optimizerExecBusy);
 recover.disabled=Boolean(optimizerExecBusy||optimizerExecPreparation);
 full.hidden=!(allowed&&matching&&stage!=='all'&&!optimizerExecBusy);
 full.disabled=Boolean(optimizerExecBusy||optimizerExecPreparation);
}
function optimizerExecutionTrackerRender(progress,job){
 // O GET de status e a preparação automática não podem encobrir uma
 // tentativa recusada com "aguardando autorização" na própria barra.
 if(progress&&optimizerExecStartError&&!progress.hasStarted&&
    ['prepared','blocked'].includes(progress.state)){
  progress={...progress,attention:true,title:'Execução não iniciada',
   message:'Última tentativa recusada: '+optimizerExecStartError+
    '. Confira a prévia atualizada antes de executar novamente.',lastError:optimizerExecStartError};
 }
 globalThis.OptimizerSkuDashboard?.execution?.(progress,job);
 if(!progress)return;
 const kitLink=typeof optimizerWorkflowPlan==='undefined'?null:optimizerWorkflowPlan?.kitOptimization;
 if(kitLink?.kitSku)globalThis.RAKitTechnicalProgress?.({
  kitSku:kitLink.kitSku,itemId:String(optimizerWorkflowPlan.itemId),progress});
 const tracker=$('#optimizerExecutionTracker'),activity=$('#optimizerExecutionActivity');
 if(!tracker||!activity)return;
 const visible=Boolean(progress.hasStarted||progress.hasSavedProgress||progress.state==='prepared'||progress.state==='blocked');
 tracker.hidden=!visible;activity.hidden=!visible;
 // A autorização fica JUNTO do indicador 0%, nunca acima da parte visível
 // da execução. Em running/verified o botão desaparece para evitar repetição.
 // Sempre oferecer recuperação VISÍVEL ao lado do progresso se a API
 // aceitou a escrita mas a confirmação do anúncio permanece incerta.
 let recoverAction=tracker.querySelector('.optimizer-exec-recover-stuck');
 if(!recoverAction){
  recoverAction=document.createElement('button');
  recoverAction.type='button';
  recoverAction.className='secondary optimizer-exec-recover-stuck';
  recoverAction.style.cssText='width:100%;margin:12px 0;padding:14px;font-weight:800;border:2px solid #f59e0b;border-radius:12px';
  recoverAction.textContent='↻ Conferir Shopee e retomar somente etapas pendentes';
  recoverAction.addEventListener('click',()=>void optimizerReconcileUncertainExecution());
  tracker.appendChild(recoverAction);
 }
 recoverAction.hidden=job?.state!=='uncertain';
 recoverAction.disabled=job?.state!=='uncertain';
 let resultLabel=tracker.querySelector('.optimizer-recovery-result');
 if(!resultLabel){
  resultLabel=document.createElement('p');
  resultLabel.className='optimizer-recovery-result';
  resultLabel.setAttribute('role','status');
  resultLabel.setAttribute('aria-live','polite');
  resultLabel.style.cssText='margin:8px 0 12px;padding:10px 12px;border-radius:8px;background:#fff7ed;color:#7c2d12;font-size:13px;line-height:1.5';
  recoverAction.insertAdjacentElement('afterend',resultLabel);
 }
 if(!resultLabel.textContent)resultLabel.textContent='Aguardando leitura da Shopee. Os envios anteriores serão preservados.';
 resultLabel.hidden=job?.state!=='uncertain';
 const resumeBar=tracker.querySelector('.optimizer-exec-resume-bar');
 if(resumeBar)resumeBar.hidden=!['prepared','blocked'].includes(progress.state);
 optimizerExecutionVisibleCommands(progress,job);
 if(!visible)return;
 const w=optimizerWorkflowPlan||{},sku=String(job?.sku||w.sku||'');
 // Check 08 indica prévia revisada; o status técnico mede apenas este job.
 const sameKitJob=Boolean(w.kitOptimization?.kitSku&&
  String(job?.sku||'')===String(w.sku)&&
  String(job?.item_id||'')===String(w.itemId)&&
  String(job?.model_id??0)===String(w.modelId??0));
 const kitDiscount=sameKitJob?optimizerKitDiscountReviewState(w):
  {prepared:false,confirmed:false};
 const discountPending=progress.verified&&kitDiscount.prepared&&!kitDiscount.confirmed&&
  !job?.plan?.kitDiscount;
 optimizerExecProgress={...progress,sku,itemId:String(job?.item_id||w.itemId||''),
  modelId:String(job?.model_id??job?.plan?.modelId??w.modelId??0)};
 $('#optimizerExecutionSku').textContent='SKU '+sku;
 const itemId=String(job?.item_id||w.itemId||'');
 $('#optimizerExecutionItemId').textContent='Item ID '+itemId;
 $('#optimizerExecutionProductTitle').textContent=String(w.productTitle||job?.plan?.original?.item_name||'Anúncio Shopee');
 const image=$('#optimizerExecutionProductImage'),fallback=$('#optimizerExecutionProductFallback');
 const src=(w.imageUrls||[]).find(x=>typeof x==='string'&&/^https:\/\//i.test(x));
 image.hidden=!src;fallback.hidden=Boolean(src);
 if(src&&image.src!==src){
  image.onerror=()=>{image.hidden=true;fallback.hidden=false;};
  image.onload=()=>{image.hidden=false;fallback.hidden=true;};
  image.src=src;
 }
 if(!src)image.removeAttribute?.('src');
 $('#optimizerExecutionPhaseTitle').textContent=progress.title;
 $('#optimizerExecutionPhaseSubtitle').textContent=discountPending?
  progress.message+' A prévia de Minha Promoção está conferida, mas a promoção precisa de autorização separada na etapa 08.':
  progress.message;
 const started=$('#optimizerExecutionStartedAt'),startedLabel=$('#optimizerExecutionStartLabel');
 const at=progress.startedAt||progress.updatedAt;
 startedLabel.textContent=progress.startedAt?'Início da execução':'Última atualização';
 started.textContent=at&&Number.isFinite(Date.parse(at))?
   new Date(at).toLocaleString('pt-BR',{day:'2-digit',month:'2-digit',hour:'2-digit',minute:'2-digit'}):
   'Horário indisponível';
 const badge=$('#optimizerExecutionLiveBadge');
 badge.textContent=discountPending?'✓ Anúncio confirmado · desconto pendente':
  progress.verified?'✓ Confirmado':progress.attention?'! Atenção':
  !progress.hasStarted?progress.resumable?'● Mídia pronta · autorizar retomada':'● Aguardando sua autorização':'● Atualização automática';
 badge.dataset.state=progress.fiscalPartial?'warning':progress.state;
 const pct=discountPending?88:Math.max(0,Math.min(100,Number(progress.percent)||0));
 $('#optimizerExecutionPercent').textContent=pct+'%';
 $('#optimizerExecutionPercent').title='Progresso técnico real. Apenas a confirmação pela Shopee significa publicação concluída.';
 $('#optimizerExecutionBar').setAttribute('aria-valuenow',String(pct));
 $('#optimizerExecutionBarFill').style.width=pct+'%';
 $('#optimizerExecutionProgressDetail').textContent=discountPending?
  progress.message+' Prévia do desconto conferida; publicação pendente. O 100% representa as alterações já confirmadas do anúncio.':
  progress.message;
 const savedScope=String(job?.plan?.selectedStage||'all');
 const scopeLabels={images:'SOMENTE IMAGENS',video:'SOMENTE VÍDEO',seo:'SOMENTE TÍTULO SEO',
  technical:'SOMENTE FICHA TÉCNICA',description:'SOMENTE DESCRIÇÃO',discount:'SOMENTE DESCONTO',discount_adjust:'PREÇO BRUTO + DESCONTO DO KIT',variants:'SOMENTE VARIAÇÕES',
  fiscal:'SOMENTE DADOS FISCAIS',remaining:'SOMENTE VARIAÇÕES + FISCAL + DESCONTO'};
 if(progress.state==='prepared'&&savedScope!=='all'){
  const scopeLabel=scopeLabels[savedScope]||'PARCIAL';
  $('#optimizerExecutionPhaseTitle').textContent='Prévia PARCIAL: '+scopeLabel;
  const explanation=savedScope==='discount'?'Somente desconto preparado. As sete etapas anteriores serão PRESERVADAS, sem novo envio.':
   savedScope==='discount_adjust'?'Somente preço bruto e Minha Promoção: as outras sete etapas serão preservadas; alterações somente após sua autorização.':
   'O plano salvo inclui '+scopeLabel+'. As demais etapas NÃO serão enviadas.'+
   ' Para executar tudo, clique em “Preparar TODAS as etapas aprovadas”.';
  $('#optimizerExecutionPhaseSubtitle').textContent=explanation;
  $('#optimizerExecutionProgressDetail').textContent=explanation+
   (Number(progress.percent)===0?' Ainda não houve envio à Shopee.':'');
 }
 if(optimizerExecPrepareError){
  $('#optimizerExecutionPhaseTitle').textContent='Prévia completa não preparada';
  $('#optimizerExecutionPhaseSubtitle').textContent=optimizerExecPrepareError;
  $('#optimizerExecutionProgressDetail').textContent='Falha na preparação: '+optimizerExecPrepareError;
 }
 $('#optimizerExecutionMediaCount').textContent=progress.imagesTotal?
   progress.imagesUploaded+' / '+progress.imagesTotal+' na mídia · '+
   progress.imagesPublished+' / '+progress.imagesTotal+' publicadas no anúncio':'';
 const stageList=$('#optimizerExecutionSteps');stageList.replaceChildren();
 const statuses={done:'Confirmado no anúncio',staged:'✓ Na mídia Shopee',checking:'Enviado · conferindo',
  active:'Em andamento',waiting:'Aguardando',skipped:'Não incluído',
  attention:'Verificar na Shopee',review:'Não incluído nesta execução',
  'kit-prepared':'✓ Prévia conferida · promoção pendente',
  'kit-published':'✓ Promoção aplicada separadamente',
  authorization:'Aguardando confirmação para executar'};
 for(const [i,step] of (progress.steps||[]).entries()){
  const actualStatus=step.id==='discount'&&sameKitJob&&
    ['review','authorization','skipped'].includes(step.status)?
    kitDiscount.confirmed?'kit-published':kitDiscount.prepared?'kit-prepared':step.status:
    step.status;
  const li=optimizerMake('li','optimizer-exec-step is-'+actualStatus);
  const marker=optimizerMake('span','optimizer-exec-step-number',
   ['done','staged','kit-prepared','kit-published'].includes(actualStatus)?'✓':
    actualStatus==='review'?'!':String(i+1));
  const name=optimizerMake('strong','',step.label);
  const status=optimizerMake('small','',((['discount','discount_adjust'].includes(savedScope)&&step.id!=='discount')||(savedScope==='variants'&&step.id!=='variants'))&&step.status==='skipped'? 'Preservado · sem reenvio':statuses[actualStatus]||'Aguardando');
  if(actualStatus==='kit-prepared')li.title='Check da etapa 08: prévia conferida. Desconto ainda não aplicado; a promoção exige autorização separada.';
  if(actualStatus==='kit-published')li.title='Desconto confirmado pela Shopee em operação separada; não integrou este job do anúncio.';
  if(actualStatus==='review')li.title='O desconto não foi aplicado neste job; confira a etapa 08.';
  if(step.status==='authorization')li.title='O desconto é confirmado somente no clique explícito Executar na Shopee. Nenhum desconto foi enviado nem recusado.';
  if(step.status==='staged')li.title='Arquivo confirmado na biblioteca de mídia da Shopee; a publicação neste anúncio ainda precisa ser verificada.';
  if(step.status==='checking')li.title='A API recebeu a atualização; ainda falta a confirmação de leitura do anúncio.';
  li.append(marker,name,status);stageList.append(li);
 }
 let kitDiscountAction=$('#optimizerExecutionOpenKitDiscount');
 if(!kitDiscountAction){
  kitDiscountAction=optimizerMake('button','optimizer-exec-kit-discount-action',
   'Abrir etapa 08 · aplicar Minha Promoção →');
  kitDiscountAction.id='optimizerExecutionOpenKitDiscount';
  kitDiscountAction.type='button';
  kitDiscountAction.addEventListener('click',()=>optimizerDiscountOpenReview());
  stageList.insertAdjacentElement('afterend',kitDiscountAction);
 }
 kitDiscountAction.hidden=!discountPending;
 const log=$('#optimizerExecutionEvents');log.replaceChildren();
 const logs=(progress.events||[]).slice(0,12);
 for(const event of logs){
  const li=optimizerMake('li','optimizer-exec-event is-'+(event.kind==='success'?'success':event.kind==='warning'?'warning':'info'));
  const date=event.at&&Number.isFinite(Date.parse(event.at))?
    new Date(event.at).toLocaleTimeString('pt-BR',{hour:'2-digit',minute:'2-digit'}):'—';
  li.append(optimizerMake('time','',date),optimizerMake('span','optimizer-exec-event-label',event.label));
  log.append(li);
 }
 if(progress.lastError){
  const li=optimizerMake('li','optimizer-exec-event is-warning');
  li.append(optimizerMake('time','','!'),optimizerMake('span','optimizer-exec-event-label','Motivo: '+progress.lastError));
  log.prepend(li);
 }
 if(!log.children.length)log.append(optimizerMake('li','optimizer-exec-event-empty','Aguardando registros da execução.'));
}
function optimizerExecutionIssueRender(issue){
 const el=$('#optimizerExecutionIssue');
 if(!el)return;
 el.hidden=!issue;
 if(!issue)return;
 $('#optimizerExecutionIssueTitle').textContent=issue.title||'Pendência fiscal';
 $('#optimizerExecutionIssueReason').textContent=issue.reason||'Confira as informações fiscais deste anúncio.';
 $('#optimizerExecutionIssueInfo').textContent='SKU '+(optimizerWorkflowPlan?.sku||'—')+
   ' · Campo: CEST'+(issue.ncm?' · NCM informado: '+issue.ncm:'');
 $('#optimizerExecutionIssueGuidance').textContent=issue.guidance||'Verifique os dados com seu fornecedor.';
 $('#optimizerExecutionFix').textContent=issue.action||'Corrigir informações fiscais';
 $('#optimizerExecutionIssueAfter').textContent=issue.retry||'A alteração exige nova aprovação.';
}
$('#optimizerExecutionFix')?.addEventListener?.('click',()=>{
 const w=optimizerWorkflowPlan;if(!w)return;
 optimizerWorkflowOpen('fiscal');
 const input=$('#optimizerFiscalFields')?.querySelector?.('[data-tax-field="cest"]');
 if(input){
  const label=input.closest?.('label');
  if(label){label.classList.add('optimizer-exec-field-target');label.scrollIntoView?.({behavior:'smooth',block:'center'});}
  input.focus?.({preventScroll:true});
 }
 optimizerWorkflowNotice('Erro da Shopee localizado: CEST correspondente ao NCM. Confira a nota fiscal, o XML ou confirme com a WeDrop/contabilidade; não invente o código. Depois registre a revisão fiscal.','warning');
});
function optimizerExecRow(parent,text,type='info'){
 const el=optimizerMake('div','optimizer-exec-line optimizer-exec-'+type,text);
 parent.appendChild(el);
}
function optimizerExecDiff(parent,key,before,after){
 const labels={item_name:'Título SEO',description:'Descrição',attribute_list:'Ficha técnica',tax_info:'Informações fiscais'};
 const detail=optimizerMake('details','optimizer-exec-diff');
 detail.append(optimizerMake('summary','',labels[key]||key));
 const columns=optimizerMake('div','optimizer-exec-diff-columns');
 for(const [label,value] of [['Atual na Shopee',before],['Após executar',after]]){
  const column=optimizerMake('div');column.append(optimizerMake('strong','',label),
   optimizerMake('pre','',optimizerExecutionDisplay(key,value)));
  columns.append(column);
 }
 detail.append(columns);parent.append(detail);
}
// Motor Matriz: preço e pesquisa iniciam ao reconhecer a SKU.
// O desconto é pré-calculado e salvo, mas só se publica após a execução
// comercial/fiscal ter sido confirmada e após selecionar Minha Promoção.
let optimizerDiscountFinalQuote=null,optimizerDiscountFinalIdentity='',optimizerDiscountFinalPreviewData=null;
let optimizerDiscountFinalLoading=0,optimizerDiscountFinalBusy=false,optimizerDiscountFinalSent=false;
let optimizerDiscountFinalPreviewKey='';
function optimizerDiscountFinalIdentityOf(w){
 return w?[String(w.sku),String(w.itemId),String(w.modelId||'0')].join('|'):'';
}
function optimizerDiscountFinalStatus(message,state='info'){
 const el=$('#optimizerExecDiscountResult');
 if(el){el.textContent=message;el.dataset.state=state;}
}
// Pesquisa validada e preco de mercado sao coisas diferentes. Se a MEDIA
// dos concorrentes estiver abaixo do piso, o vendedor pode revisar o preco
// ACIMA da media quando a margem/projecao continuam protegidas.
function optimizerDiscountMarketFloorProtected(q){
 const r=q?.marketResearch||{},n=x=>Number(x);
 const above= n(q?.marketGapPct),sale=n(q?.buyerAfterCoupon??q?.customerPrice);
 return Boolean(q?.status==='MERCADO_ABAIXO_DO_PISO'&&
  r.verified===true&&r.source==='shopee_affiliate_product_offers'&&
  r.sourceType==='researched_affiliate_offers'&&Number.isInteger(r.count)&&r.count>=2&&r.count<=5&&
  Number.isFinite(n(r.reference))&&n(r.reference)>0&&
  Number.isFinite(n(q.priceFloor))&&n(q.priceFloor)>0&&n(r.reference)<n(q.priceFloor)&&
  Number.isFinite(n(q.netMarginPct))&&n(q.netMarginPct)+0.0001>=n(q.minMarginPct)&&
  Number.isFinite(n(q.netProfit))&&n(q.netProfit)>0&&
  Number.isFinite(sale)&&sale>=n(q.priceFloor)-0.01&&
  Number.isFinite(above)&&above>=0&&above<=25&&
  Number.isFinite(n(q.grossPrice))&&n(q.grossPrice)>0&&
  Number.isFinite(n(q.discountPct))&&n(q.discountPct)>0&&n(q.discountPct)<90&&
  q.discountRecommendationSource==='researched');
}
function optimizerMarketExceptionReady(q){
 return Boolean(q?.status==='MERCADO_ABAIXO_DO_PISO'&&Number(q.marketGapPct)>25&&
  q.marketResearch?.verified===true&&q.marketResearch?.count>=2&&q.marketResearch?.count<=5&&
  Number(q.netMarginPct)>=Math.max(8,Number(q.minMarginPct)||8)&&Number(q.netProfit)>0&&
  Number(q.customerPrice)>=Number(q.priceFloor)-0.01);
}
function optimizerMarketExceptionConsent(q){
 return optimizerMarketExceptionReady(q)&&
  document.getElementById('optimizerMarketOver25Consent')?.checked===true;
}
function optimizerMarketExceptionWidget(q){
 const host=$('#optimizerExecDiscountCampaign')?.parentElement;
 if(!host)return;
 let label=document.getElementById('optimizerMarketOver25Approval');
 if(!label){
  label=document.createElement('label');label.id='optimizerMarketOver25Approval';
  label.style.cssText='display:flex;gap:10px;align-items:flex-start;margin:12px 0;font-weight:600;color:#8b3e13;';
  const checkbox=document.createElement('input');checkbox.type='checkbox';
  checkbox.id='optimizerMarketOver25Consent';checkbox.style.marginTop='4px';
  checkbox.addEventListener('change',()=>{optimizerDiscountFinalPreviewData=null;optimizerDiscountFinalPaint();});
  const description=document.createElement('span');description.id='optimizerMarketOver25Description';
  label.append(checkbox,description);host.append(label);
 }
 const visible=optimizerMarketExceptionReady(q);label.hidden=!visible;
 if(visible)$('#optimizerMarketOver25Description').textContent=
  'Autorizo excepcionalmente o preço '+shPricePercent(q.marketGapPct)+
  ' acima da média verificada, mantendo a margem de '+shPricePercent(q.netMarginPct)+
  ' e lucro '+shPriceMoney(q.netProfit)+'. A autorização vale apenas para esta prévia e não publica automaticamente.';
}
function optimizerDiscountFinalEligible(q){
 return Boolean(q&&q.marketResearch?.verified===true&&
  q.marketResearch?.source==='shopee_affiliate_product_offers'&&
  q.marketResearch?.sourceType==='researched_affiliate_offers'&&
  q.marketResearch?.count>=2&&q.marketResearch?.count<=5&&
  (q.status!=='MERCADO_ABAIXO_DO_PISO'||optimizerDiscountMarketFloorProtected(q)||optimizerMarketExceptionConsent(q))&&
  q.discountRecommendationSource==='researched'&&
  Number(q.netMarginPct)+0.001>=Number(q.minMarginPct)&&
  Number.isFinite(Date.parse(q.marketResearch?.researchedAt))&&
  Date.now()-Date.parse(q.marketResearch.researchedAt)<48*3600000);
}
function optimizerDiscountApprovalReady(){
 const w=optimizerWorkflowPlan,q=optimizerDiscountFinalQuote,p=optimizerDiscountFinalPreviewData?.preview;
 const deferred=optimizerDiscountFinalPreviewData?.deferred===true;
 if(!w||!q||!p||(!deferred&&!optimizerDiscountFinalPreviewData?.approvalToken)||
    optimizerDiscountFinalIdentityOf(w)!==optimizerDiscountFinalIdentity||!optimizerDiscountFinalEligible(q))return false;
 if(deferred&&!$('#optimizerExecDiscountDeferredConsent')?.checked)return false;
 const id=String($('#optimizerExecDiscountCampaign')?.value||'').trim();
 return /^\d{1,18}$/.test(id)&&String(p.sku)===String(w.sku)&&
  String(p.itemId)===String(w.itemId)&&String(p.modelId)===String(w.modelId)&&
  String(p.discountId)===id&&
  (!p.needsBasePriceUpdate||Boolean($('#optimizerExecDiscountPriceConsent')?.checked));
}
function optimizerDiscountOpenReview(){
 if(!optimizerWorkflowPlan)return;
 const section=$('#optimizerDiscountReviewInline');
 if(optimizerKitWorkflowActive()){
  globalThis.RAKitDiscountStageOpened?.();
  if(!kitOptimizerDiscountMount()){
   optimizerWorkflowNotice('Não foi possível abrir a etapa 08 do kit. Atualize a página.','error');return;
  }
 }else kitOptimizerDiscountUnmount();
 optimizerContentRemember();
 globalThis.ShopeeFiscalStudio?.close?.();
 globalThis.ShopeeDescriptionStudio?.close?.();
 globalThis.ShopeeTitleStudio?.close?.();
 optimizerWorkflowActivateOnly('discount');
 if(!$('#optimizerExecDiscountCampaign').value&&$('#discountPromotionId')?.value)
  $('#optimizerExecDiscountCampaign').value=String($('#discountPromotionId').value).trim();
 optimizerDiscountFinalPaint();
 section.scrollIntoView?.({behavior:'smooth',block:'start'});
 if(!optimizerDiscountFinalQuote)void optimizerDiscountFinalLoad();
}
function optimizerDiscountWorkflowRefresh(){
 const card=$('#optimizerWorkflowCards')?.querySelector('[data-stage="discount"]');
 if(!card)return;
 const w=optimizerWorkflowPlan,q=optimizerDiscountFinalQuote;
 const kit=optimizerKitWorkflowActive();
 const matching=Boolean(w&&q&&optimizerDiscountFinalIdentityOf(w)===optimizerDiscountFinalIdentity);
 const kitReview=kit?optimizerKitDiscountReviewState(w):{prepared:false,confirmed:false};
 const sent=kit?kitReview.confirmed:matching&&optimizerDiscountFinalSent;
 const prepared=kit&&kitReview.prepared;
 const reviewed=kit?prepared:matching&&optimizerDiscountApprovalReady();
 const state=card.querySelector('.optimizer-discount-workflow-state');
 if(state&&kit)state.textContent=sent?'✓ Aplicado e confirmado na Shopee':
  prepared?'✓ Conferência registrada · ainda não publicado':
  'Minha Promoção do kit · preparar e conferir a prévia';
 else if(state)state.textContent=sent?'Envio realizado · conferir na Shopee':
  reviewed?'Desconto conferido · execução liberada':
  !matching?'Calculando preço e desconto':
  optimizerDiscountFinalEligible(q)?'Preço calculado · conferir antes de executar':'Pesquisa/margem · revisar';
 card.classList.toggle('optimizer-workflow-reviewed',Boolean(sent||reviewed));
 card.classList.toggle('optimizer-workflow-pending',!sent&&!reviewed);
 card.classList.toggle('is-current',Boolean(!$('#optimizerDiscountReviewInline')?.hidden));
 card.querySelector('.optimizer-workflow-symbol').textContent=sent||reviewed?'✓':'→';
 const stages=(w?.stages||[]).filter(x=>x.key!=='final'&&!x.skipped);
 const done=stages.filter(x=>x.reviewed||x.skipped).length+(sent||reviewed?1:0);
 const progress=$('#optimizerWorkflowCounter');
 if(progress){progress.textContent=done+' / '+(stages.length+1)+' etapas conferidas';progress.style.setProperty('--stage-progress',String(Math.round(done/(stages.length+1)*100))+'%');}
}
function optimizerDiscountFinalPaint(){
 optimizerDiscountWorkflowRefresh();
 const block=$('#optimizerExecDiscountFinal'),w=optimizerWorkflowPlan;
 if(!block)return;
 const q=optimizerDiscountFinalQuote,key=optimizerDiscountFinalIdentityOf(w);
 const active=Boolean(q)&&key===optimizerDiscountFinalIdentity&&
  String(q.sku)===String(w?.sku)&&String(q.itemId)===String(w?.itemId)&&
  String(q.modelId)===String(w?.modelId);
 const target=$('#optimizerExecDiscountValues');target.replaceChildren();
 const vals=active?[
  ['Custo WeDrop',shPriceMoney(q.unitCost)],
  ['Média de mercado',q.marketResearch?.verified?shPriceMoney(q.marketResearch.reference):'Não validada'],
  ...(optimizerDiscountMarketFloorProtected(q)?[['Acima da média',shPricePercent(q.marketGapPct)]]:[]),
  ['Preço bruto',shPriceMoney(q.grossPrice)],
  ['Desconto',shPricePercent(q.discountPct)],
  ['Preço exibido na Shopee',shPriceMoney(shPriceVisiblePromotion(q))],
  ['Após cupom de '+shPricePercent(q.couponPct),shPriceMoney(q.customerPrice)],
  ['Lucro líquido',shPriceMoney(q.netProfit)],
  ['Margem líquida',shPricePercent(q.netMarginPct)],
  ['Anúncios comparados',q.marketResearch?.verified?String(q.marketResearch.count):'Insuficientes']
 ]:[['Pesquisa e cálculo',w?'Aguardando WeDrop / Shopee':'Escolha uma SKU']];
 for(const [label,value] of vals){
  const tile=optimizerMake('div');
  tile.append(optimizerMake('small','',label),optimizerMake('strong','',value));
  target.append(tile);
 }
 optimizerMarketExceptionWidget(active?q:null);
 const eligible=active&&optimizerDiscountFinalEligible(q);
 const verified=optimizerExecJob?.state==='verified'&&
  optimizerExecJob?.plan?.selectedStage==='all'&&
  optimizerExecJob?.result?.phase!=='verified_partial'&&
  String(optimizerExecJob.sku||optimizerExecJob.plan?.sku||'')===String(w?.sku)&&
  String(optimizerExecJob.plan?.itemId||'')===String(w?.itemId);
 const campaign=String($('#optimizerExecDiscountCampaign')?.value||'').trim();
 const campaignValid=/^\d{1,18}$/.test(campaign)&&Number.isSafeInteger(Number(campaign));
 $('#optimizerExecDiscountPreview').disabled=!eligible||!campaignValid||optimizerDiscountFinalBusy||optimizerDiscountFinalSent;
 const deferred=optimizerDiscountFinalPreviewData?.deferred===true;
 $('#optimizerExecDiscountDeferredApproval').hidden=!deferred;
 $('#optimizerExecDiscountPriceApproval').hidden=!optimizerDiscountFinalPreviewData?.preview?.needsBasePriceUpdate;
 const approved=optimizerDiscountApprovalReady();
 $('#optimizerExecDiscountPreview').textContent=approved?
  (deferred?'✓ Desconto programado · fluxo liberado':'✓ Desconto conferido · etapa 08 liberada'):
  '✓ Conferir desconto e liberar execução';
 $('#optimizerExecDiscountState').textContent=!active?'Calculando automaticamente desde a seleção da SKU':
  !eligible?q.marketResearch?.verified?
   (q.status==='MERCADO_ABAIXO_DO_PISO'?'Preço abaixo do piso seguro ou variação acima do limite · revisar':'Margem ou pesquisa vencida — revisar preço'):'Aguardando no mínimo dois anúncios reais':
  optimizerDiscountFinalPreviewData?(deferred?
    (approved?'Desconto autorizado · aguardará NORMAL':'Anúncio '+(optimizerDiscountFinalPreviewData.liveItemStatus||'em espera')+' · marque a autorização antecipada'):
    (approved?'Desconto conferido · 8ª etapa liberada':'Autorize alteração do preço bruto para liberar')):
  'Preço e desconto calculados · clique em Conferir desconto';
 $('#optimizerExecDiscountMessage').textContent=!active?
  'O sistema consulta automaticamente o custo WeDrop e os anúncios concorrentes ao localizar a SKU.':
  !eligible?(q.marketResearch?.verified?
   'A pesquisa possui '+q.marketResearch.count+' anúncios, mas o preço planejado não atende à margem ou ao limite de diferença da média. '+(q.status==='MERCADO_ABAIXO_DO_PISO'&&Number.isFinite(Number(q.marketGapPct))?'Preço após cupom '+shPricePercent(q.marketGapPct)+' acima da média; limite de exceção: 25%. Não reduza abaixo da margem mínima. ':'')+'Recalcule por variação, revise os anúncios comparados e prepare uma nova prévia.':
   'Plano salvo como simulação: ainda faltam 2 a 5 anúncios comparáveis verificados para publicar.') :
  optimizerDiscountMarketFloorProtected(q)?
   '⚠ A pesquisa de '+q.marketResearch.count+' concorrentes foi validada, porém a média está abaixo do piso seguro. O preço promocional desta SKU está '+shPricePercent(q.marketGapPct)+' acima da média e preserva '+shPricePercent(q.netMarginPct)+' de margem. Ao clicar em Conferir desconto você aprova a prévia desse preço MAIOR, sem reduzi-lo à média. A Shopee ainda validará a campanha; nada foi publicado.':
  !optimizerDiscountFinalPreviewData?'Informe a campanha Minha Promoção e clique em Conferir desconto para autorizar a prévia junto às demais etapas.':
  !approved?(deferred?'Marque a autorização antecipada e, se solicitado, a autorização para ajustar o preço bruto.':
    'Ajuste a autorização de preço bruto acima para concluir esta etapa.'):
  deferred?'Etapa 08 autorizada. O fluxo executará o anúncio primeiro. Depois consultará a Shopee: somente se NORMAL, revalidará a campanha, custos, preços e margem antes de enviar a promoção.':
    'Etapa 08 liberada. O botão único enviará a promoção somente após confirmar todas as outras etapas na Shopee.';
 const pending=optimizerDiscountFlowRead();
 const canRetry=Boolean(pending&&pending.deferred&&
  ['authorized','deferred_pending'].includes(pending.state)&&pending.identity===key&&
  optimizerExecJob?.state==='verified'&&
  String(optimizerExecJob?.plan?.planId||'')===String(pending.planId));
 $('#optimizerExecDiscountResume').hidden=!canRetry;
 optimizerExecUpdateRunButton();
}
async function optimizerDiscountFinalLoad(){
 const w=optimizerWorkflowPlan,key=optimizerDiscountFinalIdentityOf(w);
 const serial=++optimizerDiscountFinalLoading;
 if(!w)return optimizerDiscountFinalPaint();
 const q=shPriceCurrentQuote;
 if(q&&String(q.sku)===String(w.sku)&&String(q.itemId)===String(w.itemId)&&
   String(q.modelId)===String(w.modelId)){
  optimizerDiscountFinalQuote=q;optimizerDiscountFinalIdentity=key;
  optimizerDiscountFinalPaint();return;
 }
 try{
  const data=await json('/api/shopee/optimizer/pricing/saved?'+new URLSearchParams({
   sku:w.sku,itemId:w.itemId,modelId:w.modelId}),{signal:AbortSignal.timeout(25000)});
  if(serial!==optimizerDiscountFinalLoading||optimizerDiscountFinalIdentityOf(optimizerWorkflowPlan)!==key)return;
  optimizerDiscountFinalQuote=data.quote;optimizerDiscountFinalIdentity=key;
 }catch(error){
  if(serial!==optimizerDiscountFinalLoading||optimizerDiscountFinalIdentityOf(optimizerWorkflowPlan)!==key)return;
  optimizerDiscountFinalStatus('Aguardando plano de preço: '+error.message,'warning');
 }finally{if(serial===optimizerDiscountFinalLoading)optimizerDiscountFinalPaint();}
}
function optimizerDiscountFinalSavedQuote(q){
 const key=optimizerDiscountFinalIdentityOf(optimizerWorkflowPlan);
 if(!q||!key||key!==[String(q.sku),String(q.itemId),String(q.modelId)].join('|'))return;
 optimizerDiscountFinalQuote=q;optimizerDiscountFinalIdentity=key;
 optimizerDiscountFinalPreviewData=null;optimizerDiscountFinalPreviewKey='';
 optimizerDiscountFinalPaint();
 optimizerDiscountFinalStatus(
  q.marketResearch?.verified?'Preço, pesquisa e desconto salvos no Motor Matriz. Serão revisados ao final da execução.':
  'Preço provisório salvo. Sem 2 anúncios comparáveis, não haverá publicação de desconto.',
  q.marketResearch?.verified?'success':'warning');
}
// Somente leitura: falhas transitórias do Render não devem virar recusa
// comercial nem disparar inclusão de desconto na API Shopee.
async function optimizerDiscountReadOnlyPreview(request){
 const endpoint='/api/shopee/optimizer/discounts/preview';
 for(let attempt=1;attempt<=3;attempt++){
  let gatewayStatus=0;
  try{
   const response=await fetch(endpoint,{
    method:'POST',headers:{'Content-Type':'application/json'},
    body:JSON.stringify(request),cache:'no-store',
    signal:AbortSignal.timeout(22000)
   });
   const data=await response.json().catch(()=>({}));
   if(response.ok)return data;
   if(![502,503,504].includes(response.status)){
    const error=new Error(data.error||('HTTP '+response.status));
    error.nonRetryable=true;
    throw error;
   }
   gatewayStatus=response.status;
  }catch(error){
   if(error.nonRetryable)throw error;
   if(!gatewayStatus&&!['TypeError','TimeoutError','AbortError'].includes(error.name))
    throw error;
  }
  if(attempt<3){
   optimizerDiscountFinalStatus('Comunicação temporariamente indisponível'+
    (gatewayStatus?' (HTTP '+gatewayStatus+')':'')+
    '. Repetindo somente a conferência, sem publicar desconto ('+(attempt+1)+'/3)...','info');
   await new Promise(resolve=>setTimeout(resolve,900*attempt));
   continue;
  }
  const error=new Error('Falha temporária de comunicação'+
   (gatewayStatus?' (HTTP '+gatewayStatus+')':'')+
   ' após 3 consultas. Nenhum desconto foi enviado à Shopee. Confira novamente quando o serviço estabilizar.');
  error.transient=true;
  throw error;
 }
}
async function optimizerDiscountFinalPrepare({automatic=false}={}){
 const w=optimizerWorkflowPlan,q=optimizerDiscountFinalQuote;
 if(!w||!q||optimizerDiscountFinalBusy||optimizerDiscountFinalSent)return;
 const key=optimizerDiscountFinalIdentityOf(w);
 if(key!==optimizerDiscountFinalIdentity||
    key!==[String(q.sku),String(q.itemId),String(q.modelId)].join('|'))return;
 const campaign=String($('#optimizerExecDiscountCampaign').value||'').trim();
 if(!optimizerDiscountFinalEligible(q)||!/^\d{1,18}$/.test(campaign))
   return optimizerDiscountFinalPaint();
 const previewKey=key+'|'+campaign+'|'+String(q.calculatedAt||'')+'|'+String(optimizerMarketExceptionConsent(q));
 if(automatic&&previewKey===optimizerDiscountFinalPreviewKey)return;
 optimizerDiscountFinalBusy=true;optimizerDiscountFinalPaint();
 optimizerDiscountFinalStatus('Conferindo preço e promoção na API Shopee sem publicar...','info');
 try{
  const data=await optimizerDiscountReadOnlyPreview({
   sku:w.sku,itemId:w.itemId,modelId:w.modelId,discountId:campaign,
   allowDeferredPreview:true,allowOver25:optimizerMarketExceptionConsent(q)
  });
  if(optimizerDiscountFinalIdentityOf(optimizerWorkflowPlan)!==key||
     String($('#optimizerExecDiscountCampaign').value||'').trim()!==campaign)return;
  if((!data.approvalToken&&!data.deferred)||data.preview?.sku!==w.sku||
     String(data.preview?.itemId)!==String(w.itemId)||
     String(data.preview?.modelId)!==String(w.modelId)||
     String(data.preview?.discountId)!==campaign)
   throw Error('Prévia devolvida para outra SKU/campanha; nenhuma publicação.');
  optimizerDiscountFinalPreviewData=data;optimizerDiscountFinalPreviewKey=previewKey;
  $('#optimizerExecDiscountPriceConsent').checked=false;
  $('#optimizerExecDiscountDeferredConsent').checked=false;
  const realStatus='Anúncio '+String(data.itemId||w.itemId)+' · status Shopee '+
   String(data.liveItemStatus||'não informado')+
   ' (fonte: '+(data.liveStatusSource==='get_item_list'?'lista de anúncios ativos':'ficha do anúncio')+')'+
   (data.baseItemStatus&&data.baseItemStatus!==data.liveItemStatus?
    ' · ficha retornou '+data.baseItemStatus+'; lista ativa foi conferida pelo ID.':'')+'. ';
  optimizerDiscountFinalStatus(realStatus+(data.deferred?
   'Desconto conferido SEM publicação. Marque a autorização antecipada para executar o anúncio primeiro e aplicar a promoção somente após NORMAL e nova verificação de preço/margem/campanha.':
   data.preview.action==='already'?
    'Desconto já está confirmado nesta campanha; não será reenviado.':
    'Prévia confirmada: '+shPricePercent(data.preview.discountPct)+' de desconto · campanha '+
    campaign+' · preço promocional '+shPriceMoney(data.preview.promo)+
    (data.preview.needsBasePriceUpdate?' · requer autorização para ajustar preço bruto.':
     '. A promoção poderá ser aplicada depois da confirmação das outras etapas.')),
   data.deferred?'warning':'success');
  if(data.preview.action==='already'&&!data.deferred)optimizerDiscountFinalSent=true;
 }catch(error){
  optimizerDiscountFinalPreviewData=null;optimizerDiscountFinalPreviewKey='';
  const stale=/VINCULO_DESATUALIZADO/.test(String(error.message||''));
  optimizerDiscountFinalStatus(stale?
   'Foi encontrado anúncio EXCLUÍDO vinculado ao SKU. O Manager está consultando automaticamente o anúncio ativo correto. Planos antigos não serão transferidos; revise novamente o novo preço e desconto.':
   (error.transient?'Conferência pendente: ':'Desconto não liberado: ')+
   error.message+(error.transient?'':' Os demais dados da SKU permanecem intactos.'),'warning');
  if(stale&&String($('#optimizerSku').value||'').trim()===String(w.sku)){
   optimizerNotice('Vínculo antigo da SKU '+w.sku+
    ' detectado. Procurando o Item ID NORMAL correto antes de qualquer execução.','warning');
   void optimizerFindSku();
  }
 }finally{optimizerDiscountFinalBusy=false;optimizerDiscountFinalPaint();}
}
let optimizerDiscountCampaignTimer=null;
$('#optimizerExecDiscountCampaign')?.addEventListener('input',()=>{
 optimizerDiscountFinalPreviewData=null;optimizerDiscountFinalPreviewKey='';
 $('#optimizerExecDiscountPriceConsent').checked=false;
 $('#optimizerExecDiscountDeferredConsent').checked=false;
 optimizerDiscountFinalPaint();
 if(optimizerDiscountCampaignTimer)clearTimeout(optimizerDiscountCampaignTimer);
 const candidate=String($('#optimizerExecDiscountCampaign').value||'');
 if(/^\d{1,18}$/.test(candidate)&&$('#discountPromotionId'))
  $('#discountPromotionId').value=candidate;
 // A prévia exige clique explícito na conferência, não uma chamada automática ao digitar.
});
$('#optimizerExecDiscountPriceConsent')?.addEventListener('change',optimizerDiscountFinalPaint);
$('#optimizerExecDiscountDeferredConsent')?.addEventListener('change',optimizerDiscountFinalPaint);
$('#optimizerExecDiscountPreview')?.addEventListener('click',()=>void optimizerDiscountFinalPrepare());
// Retomada MANUAL segura da intenção já autorizada, sem repetir atualização do anúncio.
$('#optimizerExecDiscountResume')?.addEventListener('click',()=>{
 const intent=optimizerDiscountFlowRead();
 if(!intent?.deferred||!['authorized','deferred_pending'].includes(intent.state)||
    intent.identity!==optimizerDiscountFinalIdentityOf(optimizerWorkflowPlan)||
    optimizerExecJob?.state!=='verified'||
    String(optimizerExecJob?.plan?.planId||'')!==String(intent.planId))return;
 void optimizerDiscountFinishTogether(optimizerExecJob);
});
// Uma execução completa inclui o desconto aprovado como último passo.
// Após uma escrita iniciada, nunca reenvia automaticamente (inclusive após reload).
const SHOPEE_DISCOUNT_FLOW_KEY='ra-shopee-discount-fullflow-v1';
const APPROVED_DISCOUNT_KEYS=['sku','itemId','modelId','discountId','gross','promo',
 'buyerAfterCoupon','discountPct','couponPct','originalPrice','action','existingPrice',
 'quoteAt','promotionSignal','needsBasePriceUpdate'];
let optimizerDiscountAutoBusy=false;
function optimizerDiscountFlowRead(){
 try{
  const v=JSON.parse(sessionStorage.getItem(SHOPEE_DISCOUNT_FLOW_KEY)||'null');
  return v&&Date.now()-Number(v.when)<7*86400000?v:null;
 }catch{return null;}
}
function optimizerDiscountFlowSave(v){
 try{sessionStorage.setItem(SHOPEE_DISCOUNT_FLOW_KEY,JSON.stringify(v));}catch{}
}
function optimizerDiscountAuthorizedIntent(plan){
 if(optimizerKitWorkflowActive())return null;
 if(!['all','discount_adjust'].includes(plan?.selectedStage)||!optimizerDiscountApprovalReady())return null;
 const p=optimizerDiscountFinalPreviewData.preview;
 return {identity:optimizerDiscountFinalIdentityOf(optimizerWorkflowPlan),planId:plan.planId,
  expected:Object.fromEntries(APPROVED_DISCOUNT_KEYS.map(k=>[k,p[k]??null])),
  deferred:optimizerDiscountFinalPreviewData.deferred===true,
  consent:Boolean($('#optimizerExecDiscountPriceConsent').checked),when:Date.now(),state:'authorized'};
}
async function optimizerDiscountFinishTogether(job){
 const intent=optimizerDiscountFlowRead();
 if(optimizerDiscountAutoBusy||!intent||!['authorized','deferred_pending'].includes(intent.state)||
    job?.state!=='verified'||job?.plan?.selectedStage!=='all'||
    String(job.plan?.planId)!==String(intent.planId)||
    intent.identity!==optimizerDiscountFinalIdentityOf(optimizerWorkflowPlan))return;
 if(job.result?.phase==='verified_partial'){
  optimizerDiscountFlowSave({...intent,state:'blocked'});
  optimizerExecNotice('A etapa fiscal está pendente. Promoção NÃO enviada.','warning');return;
 }
 optimizerDiscountAutoBusy=true;
 optimizerExecNotice('Anúncio confirmado. Conferindo os mesmos valores aprovados da promoção...','info');
 try{
  const fresh=await optimizerDiscountReadOnlyPreview({
   sku:intent.expected.sku,itemId:intent.expected.itemId,
   modelId:intent.expected.modelId,discountId:intent.expected.discountId
  });
  if(intent.identity!==optimizerDiscountFinalIdentityOf(optimizerWorkflowPlan))return;
  const live=fresh.preview||{};
  const fixedKeys=['shopId','sku','itemId','modelId','discountId','gross','promo',
    'buyerAfterCoupon','discountPct','couponPct','quoteAt'];
  const keys=intent.deferred?fixedKeys:APPROVED_DISCOUNT_KEYS;
  const changed=keys.find(k=>String(live[k]??'')!==String(intent.expected[k]??''));
  if(!changed&&intent.deferred&&live.needsBasePriceUpdate&&!intent.consent){
   optimizerDiscountFlowSave({...intent,state:'changed'});
   optimizerExecNotice('Preço bruto da Shopee diferente e sem autorização. Desconto não enviado; revise a etapa 08.','warning');
   optimizerDiscountFinalStatus('Preço bruto exige sua autorização. Nenhum desconto foi enviado.','warning');
   optimizerDiscountFinalPaint();return;
  }
  if(changed){
   optimizerDiscountFlowSave({...intent,state:'changed'});
   optimizerExecNotice('Promoção alterada após revisão ('+changed+'). Desconto NÃO enviado; revise a etapa 08.','warning');
   optimizerDiscountFinalStatus('Os valores da Shopee mudaram após sua conferência. Nenhuma promoção foi enviada.','warning');return;
  }
  if(live.action==='already'){
   optimizerDiscountFlowSave({...intent,state:'confirmed'});
   optimizerDiscountFinalSent=true;
   optimizerExecNotice('Anúncio e desconto já confirmados na Shopee.','success');
   optimizerDiscountFinalStatus('Campanha já contém este desconto. Sem reenvio.','success');
   optimizerDiscountFinalPaint();return;
  }
  // A partir daqui a escrita é tentativa única; guardar antes de chamar a API.
  optimizerDiscountFlowSave({...intent,state:'posting'});
  const response=await fetch('/api/shopee/optimizer/discounts/execute',{
   method:'POST',headers:{'Content-Type':'application/json'},
   body:JSON.stringify({approvalToken:fresh.approvalToken,confirm:true,
    allowPriceChange:intent.consent}),signal:AbortSignal.timeout(120000)
  });
  const data=await response.json().catch(()=>({}));
  optimizerDiscountFinalSent=true;
  if(response.ok&&data.verified){
   optimizerDiscountFlowSave({...intent,state:'confirmed'});
   optimizerExecNotice('Tudo confirmado: anúncio e desconto publicados na Shopee.','success');
   optimizerDiscountFinalStatus('Anúncio e promoção confirmados na Shopee.','success');
  }else{
   optimizerDiscountFlowSave({...intent,state:'uncertain'});
   const why=String(data.error||data.message||'A confirmação da promoção não chegou.');
   optimizerExecNotice('Anúncio confirmado; desconto pendente de conferência: '+why,'warning');
   optimizerDiscountFinalStatus('Envio da promoção não confirmado: '+why+'. Não repetir automaticamente.','warning');
  }
  optimizerDiscountFinalPaint();
 }catch(e){
  if(intent.identity===optimizerDiscountFinalIdentityOf(optimizerWorkflowPlan)){
   const attempted=optimizerDiscountFlowRead()?.state==='posting';
   const notNormal=/não está em situação NORMAL|não está.*NORMAL/i.test(String(e.message||''));
   optimizerDiscountFlowSave({...intent,state:attempted?'uncertain':
    intent.deferred&&notNormal?'deferred_pending':'authorized'});
   optimizerExecNotice(intent.deferred&&notNormal?
    'Anúncio concluído, mas a Shopee ainda não o confirmou como NORMAL. Desconto autorizado e PENDENTE, sem escrita. Use Conferir desconto pendente quando o anúncio estiver ativo.':
    'Desconto pendente: '+e.message+
    (attempted?' Confira a campanha antes de novo envio.':' A consulta de prévia pode ser refeita.'),'warning');
   optimizerDiscountFinalStatus(attempted?'Resposta incerta; nenhuma repetição automática.':
    intent.deferred&&notNormal?'Pendente até NORMAL. Nenhuma promoção enviada.':'Consulta da promoção ainda pendente.','warning');
   optimizerDiscountFinalPaint();
  }
 }finally{optimizerDiscountAutoBusy=false;}
}
function optimizerExecFiscalLast(plan){
 const block=$('#optimizerExecFiscalLast');
 if(!block||!plan)return;
 const preview=plan.finalFiscal||plan.proposed?.tax_info||null;
 const draft=optimizerWorkflowPlan?.taxDraft||{};
 const values=preview||draft;
 const container=$('#optimizerExecFiscalValues');
 container.replaceChildren();
 const keymap=[
  ['ncm','NCM'],['origin','Origem'],['same_state_cfop','CFOP mesmo estado'],
  ['diff_state_cfop','CFOP outros estados'],['csosn','CSOSN'],
  ['measure_unit','Unidade'],['pis_cofins_cst','PIS/COFINS CST'],
  ['operation_type','Tipo de operação'],['cest','CEST']
 ];
 for(const [key,label] of keymap){
  const card=optimizerMake('div');
  card.append(optimizerMake('strong','',label),
   optimizerMake('span','',key==='cest'?
    (preview?.cest==='00'?'00 · previsto no envio':
      preview?.cest||draft?.cest||'00 · padrão cadastral'):
    String(values[key]||'Não informado')));
  container.append(card);
 }
 const mode=plan.finalFiscal?'Depois da confirmação comercial · envio fiscal pendente':
  plan.proposed?.tax_info?'Execução exclusivamente fiscal · após autorização':
  plan.fiscalDeferred?'Fiscal pendente: CEST/validação anterior impediu inclusão':
  'Fiscal não incluído nesta prévia · confira as regras da SKU';
 $('#optimizerExecFiscalState').textContent=mode;
 $('#optimizerExecFiscalNote').textContent=plan.finalFiscal?
  'Os valores acima irão em atualização fiscal própria como última etapa. Se CEST = 00, será transmitido literalmente, sujeito à validação da Shopee. A prévia não confirma publicação.':
  plan.proposed?.tax_info?
  'Somente os dados fiscais acima serão enviados após sua autorização, inclusive CEST 00 se constar na prévia. A Shopee poderá recusar o valor.':
  'A conferência registrada não significa publicação. Corrija o Motor Matriz e revalide a prévia se houver pendência.';
}
$('#optimizerExecFiscalEdit')?.addEventListener?.('click',()=>{
 if(!optimizerKitWorkflowActive())setTab('optimizer');
 if(!optimizerWorkflowPlan){optimizerWorkflowNotice('Localize uma SKU para conferir os dados fiscais.','warning');return;}
 $('#optimizerWorkflowEditor').hidden=false;
 optimizerWorkflowOpen('fiscal');
 $('#optimizerWorkflowEditor').scrollIntoView?.({behavior:'smooth',block:'start'});
});
$('#optimizerFiscalBackToSku')?.addEventListener?.('click',()=>{
 if(!optimizerKitWorkflowActive())setTab('optimizer');
 else $('#optimizerWorkflowPanel')?.scrollIntoView({behavior:'smooth',block:'start'});
});
function optimizerExecRender(data){
 const plan=data.plan,context=optimizerExecContext;
 if(!plan||!context||context.sku!==plan.sku||context.itemId!==plan.itemId||context.modelId!==plan.modelId)return;
 optimizerExecPlan={...plan,updatedAt:data.updatedAt};
 optimizerExecJob={sku:plan.sku,item_id:plan.itemId,model_id:plan.modelId,plan,
  state:data.executionStatus||(data.ready?'prepared':'blocked'),updated_at:data.updatedAt,result:null};
 if(plan.modelVariations)$('#optimizerFinalPending').hidden=true;
 optimizerExecAutoModelToken=data.autoModelDiscountToken||null;
 optimizerExecAutoModelPreview=data.autoModelDiscountPreview||null;
 // Uma nova prévia precisa de uma NOVA autorização para ultrapassar 25%.
 const marketConsent=$('#optimizerExecutionOver25Consent');
 if(marketConsent)marketConsent.checked=false;
 optimizerModelMarketApprovalPaint(plan);
 optimizerExecFiscalLast(plan);
 if(!$('#optimizerExecDiscountCampaign').value&&$('#discountPromotionId')?.value)
  $('#optimizerExecDiscountCampaign').value=String($('#discountPromotionId').value).trim();
 void optimizerDiscountFinalLoad();
 $('#optimizerExecutionScope').value=plan.selectedStage||'all';
 optimizerExecutionIssueRender(data.issue||null);
 optimizerExecutionTrackerRender(data.progress,optimizerExecJob);
 if(data.progress?.hasSavedProgress&&
    (optimizerWorkflowActiveView===null||optimizerWorkflowActiveView==='execution'))
  optimizerWorkflowActivateOnly('execution');
 const changes=$('#optimizerExecutionChanges'),blocked=$('#optimizerExecutionBlockers'),warn=$('#optimizerExecutionWarnings');
 changes.replaceChildren();blocked.replaceChildren();warn.replaceChildren();
 if(plan.actions.length){
   optimizerExecRow(changes,'Alterações disponíveis para executar após sua confirmação:','heading');
   for(const [key,value] of Object.entries(plan.proposed)){
     optimizerExecDiff(changes,key,plan.original[key],value);
   }
   if(plan.images?.length)optimizerExecRow(changes,'Imagens: substituir pela sequência de nove imagens revisadas.','action');
   if(plan.video)optimizerExecRow(changes,'Vídeo: '+plan.video.filename+' · validar, enviar, processar e confirmar no anúncio.','action');
   if(plan.modelVariations){
    optimizerExecRow(changes,'ETAPA 06 · '+(plan.modelVariations.alreadyCreated?'Reconhecer e confirmar':'Criar e confirmar')+' automaticamente as '+
     plan.modelVariations.options.length+' variações na Shopee.','heading');
    for(const option of plan.modelVariations.options)optimizerExecRow(changes,
     '• '+option.name+' · SKU Shopee '+option.sku+' · WeDrop '+option.supplierSku+
     ' · custo '+shPriceMoney(option.cost)+' · preço atual '+shPriceMoney(option.price)+
     (plan.modelVariations.alreadyCreated?' · fotos e estoque já cadastrados na Shopee':
      ' · foto conferida · estoque '+option.stock),'action');
   }
   if(plan.kitDiscount){
    const d=plan.kitDiscount,adjust=plan.selectedStage==='discount_adjust';
    optimizerExecRow(changes,'ETAPA 08/08 · '+(adjust?'PREÇO BRUTO + DESCONTO':'Minha Promoção')+
     ' · campanha '+d.discountId+
     (d.currentGross!=null?' · preço ATUAL Shopee '+shPriceMoney(d.currentGross):'')+
     ' · preço bruto planejado '+shPriceMoney(d.gross)+
     ' · oferta '+shPriceMoney(d.promo)+
     ' · após cupom '+shPriceMoney(d.afterCoupon)+
     (adjust?' · SOMENTE preço bruto e promoção serão alterados; demais etapas preservadas.':
      ' · sem ajuste de preço bruto; demais etapas preservadas.')+
     ' Confirmar alterações reais pela Shopee.','action');
   }
   if(plan.finalFiscal){
    optimizerExecRow(changes,'ETAPA FINAL 07 · Informações fiscais após confirmação do anúncio comercial.','heading');
    optimizerExecDiff(changes,'tax_info',plan.original.tax_info,plan.finalFiscal);
   }
   if(['all','remaining'].includes(plan.selectedStage)&&optimizerExecAutoModelPreview){
    const m=optimizerExecAutoModelPreview;
    optimizerExecRow(changes,'ETAPA 08 · AUTOMÁTICA · Minha Promoção '+m.discountId+
     ' · '+shPricePercent(m.discountPct)+' · '+shPriceMoney(m.promo)+
     ' por variação · margem estimada '+shPricePercent(m.netMarginPct)+
     (m.modelPriceChange?' · preço bruto dos modelos será ajustado para '+shPriceMoney(m.gross):''), 'action');
   }else if(['all','remaining','discount'].includes(plan.selectedStage)&&optimizerDiscountApprovalReady()){
    const v=optimizerDiscountFinalPreviewData.preview;
    optimizerExecRow(changes,'ETAPA 08 · '+shPricePercent(v.discountPct)+' na campanha '+v.discountId+
     ' · '+shPriceMoney(v.promo)+' (após confirmação do anúncio na Shopee).','action');
   }
 }else optimizerExecRow(changes,'Nenhum campo revisado possui alteração pendente.','info');
 if(plan.blocked.length){
   optimizerExecRow(blocked,'Pendências que impedem a execução:','heading');
   for(const issue of plan.blocked)optimizerExecRow(blocked,'• '+issue,'blocker');
 }
 optimizerExecRow(warn,'Verificações e cuidados incluídos no fluxo:','heading');
 for(const warning of plan.warnings)optimizerExecRow(warn,'• '+warning,'warning');
 $('#optimizerExecutionSummary').hidden=false;
 // As etapas já foram revisadas. Uma ação explícita no botão azul inicia o fluxo,
 // sem checkbox, nova digitação ou segunda confirmação.
 $('#optimizerExecutionConfirmation').hidden=true;
 $('#optimizerExecutionConfirmation').open=false;
 $('#optimizerExecutionLaunch').hidden=false;
 $('#optimizerExecutionPrepare').hidden=Boolean(data.ready);
 $('#optimizerExecutionShopeeLink').hidden=true;
 $('#optimizerExecutionAccept').checked=false;
 $('#optimizerExecutionInput').value='';
 $('#optimizerExecutionPhrase').textContent='EXECUTAR '+plan.sku;
 optimizerExecUpdateRunButton();
 optimizerExecutionVisibleCommands(data.progress,optimizerExecJob);
 const reviewTechnicalPending=Boolean(
   optimizerWorkflowPlan?.stages?.some(x=>x.key==='technical'&&!x.reviewed&&!x.skipped));
 if(reviewTechnicalPending&&plan.selectedStage==='all'){
  optimizerExecRow(warn,
   'Ficha técnica foi reaberta por correção na SKU. Está preservada no Manager, mas NÃO será enviada nesta prévia sem nova conferência. Abra a etapa Ficha técnica para incluir os dados corrigidos.','warning');
 }
 optimizerExecNotice(data.ready&&data.progress?.resumable?data.progress.message:
   data.ready&&plan.modelVariations?
   'Prévia única pronta: anúncio → variações → fiscal → desconto por modelo. Revise os preços e execute uma só vez.':
   data.ready
   ?plan.fiscalDeferred===true
     ?'Fiscal ainda pendente: a etapa fiscal não foi incluída por validação anterior. O restante aprovado pode ser executado, sem afirmar envio fiscal.'
     :plan.finalFiscal
      ?'Pronto: execução comercial primeiro, dados fiscais como ÚLTIMA etapa. Clique em “Executar na Shopee”; ambas serão conferidas separadamente.'
      :'Prévia pronta. Confira o bloco fiscal no fim: o que não estiver incluído não será publicado na Shopee.'
   : 'Nenhuma alteração aprovada está pronta. Revise as etapas e confira as pendências.',
   data.ready?'success':'warning');
}
function optimizerModelMarketConsent(plan=optimizerExecPlan){
 const promo=plan?.modelVariations?.promotion;
 return !promo?.marketOverrideRequired||
  (promo.allowOver25===true&&
   document.getElementById('optimizerExecutionOver25Consent')?.checked===true);
}
function optimizerModelMarketApprovalPaint(plan=optimizerExecPlan){
 const label=$('#optimizerExecutionOver25Approval');
 const input=$('#optimizerExecutionOver25Consent');
 const description=$('#optimizerExecutionOver25Text');
 if(!label||!input||!description)return;
 const promo=plan?.modelVariations?.promotion;
 const required=Boolean(promo?.marketOverrideRequired);
 label.hidden=!required;
 label.style.display=required?'flex':'none';
 if(!required){input.checked=false;return;}
 const gap=Number(promo.marketGapPct),margin=Number(promo.netMarginPct);
 const profit=Number(promo.netProfit);
 description.textContent='Autorizo EXCEPCIONALMENTE este anúncio com preço '+
  (Number.isFinite(gap)?shPricePercent(gap):'superior a 25%')+
  ' acima da média pesquisada. Margem '+shPricePercent(margin)+
  ', lucro estimado '+shPriceMoney(profit)+
  '. A autorização vale apenas para esta prévia; a Shopee só recebe alterações após clicar em EXECUTAR.';
}
function optimizerDiscountReviewedForExecution(plan){
 // Kit: otimizar primeiro; desconto proprio da etapa 08 exige confirmacao
 // da Shopee e autorizacao separada para a composicao completa.
 if(typeof optimizerKitWorkflowActive==='function'&&optimizerKitWorkflowActive())
  return !['all','discount','discount_adjust'].includes(plan?.selectedStage)||Boolean(plan?.kitDiscount);
 return !['all','remaining','discount','discount_adjust'].includes(plan?.selectedStage)||
  (plan?.modelVariations?
   Boolean(optimizerExecAutoModelToken)&&optimizerModelMarketConsent(plan):
   optimizerDiscountApprovalReady());
}
function optimizerExecUpdateRunButton(){
 const p=optimizerExecPlan;
 const wrongIdentity=optimizerExecBusy||!p||!optimizerExecContext||
   p.sku!==optimizerExecContext.sku||p.itemId!==optimizerExecContext.itemId||
   p.modelId!==optimizerExecContext.modelId;
 const canPublish=Boolean(p?.canExecute&&optimizerDiscountReviewedForExecution(p));
 const unavailable=wrongIdentity||!canPublish;
 // Mesmo bloqueado, o controle principal fica disponível para CORRIGIR
 // rascunhos válidos da própria SKU, nunca publicar sem prévia e autorização.
 $('#optimizerExecutionLaunch').disabled=wrongIdentity;
 // Nunca deixar o único botão de execução desabilitado sem um caminho
 // clicável para corrigir a aprovação comercial da mesma SKU.
 const launch=$('#optimizerExecutionLaunch');
 if(launch){
  let action=$('#optimizerExecutionFixDiscount');
  if(!action){
   action=optimizerMake('button','secondary','Conferir desconto para liberar execução');
   action.id='optimizerExecutionFixDiscount';action.type='button';action.hidden=true;
   action.onclick=()=>optimizerDiscountOpenReview();
   launch.parentElement?.append(action);
  }
  action.hidden=!p?.canExecute||optimizerDiscountReviewedForExecution(p)||
   !['all','remaining','discount','discount_adjust'].includes(p?.selectedStage)||Boolean(p?.modelVariations);
  if(!action.hidden)launch.title='Conclua a conferência do desconto na mesma SKU usando o botão ao lado.';
 }
 const justPending=p?.selectedStage==='remaining';
 const offerPending=p?.selectedStage==='all'&&Boolean(p?.modelVariations?.promotion);
 $('#optimizerExecutionRemaining').hidden=!offerPending;
 $('#optimizerExecutionRemaining').disabled=unavailable;
 const resume=Boolean(p?.reusedMedia?.imageIds?.length||p?.reusedMedia?.video?.phase==='ready');
 $('#optimizerExecutionLaunch').textContent=!canPublish?
  p?.canExecute?'🛠 Conferir desconto e liberar execução':'🛠 Corrigir pendências e revalidar':
  p?.selectedStage==='discount_adjust'?'▶ Autorizar preço calculado + desconto':
  p?.selectedStage==='discount'?'▶ Executar SOMENTE desconto':
  p?.selectedStage==='variants'?'▶ Executar SOMENTE variações':
  p?.selectedStage==='images'?'▶ EXECUTAR SOMENTE '+(p.images?.length||0)+' IMAGENS':
  justPending?'▶ Publicar variações + fiscal + desconto':
  resume&&p?.modelVariations?'▶ Executar plano completo (inclui mídia)':
  resume?'▶ Retomar de onde parou':
  p?.modelVariations?'▶ Executar anúncio + variações + fiscal + desconto':
  p?.selectedStage==='all'&&optimizerKitWorkflowActive()?'▶ Executar 8 etapas do kit + desconto':
  p?.selectedStage==='all'?'▶ Executar anúncio + desconto na Shopee':'▶ Executar etapa aprovada na Shopee';
 $('#optimizerExecutionLaunch').title=!optimizerDiscountReviewedForExecution(p)
   ?'Conferir a promoção no bloco de desconto antes de executar a SKU':'Executar etapas aprovadas na Shopee';
 // Mantido somente para compatibilidade com o fluxo legado oculto.
 $('#optimizerExecutionRun').disabled=unavailable;
 const nextTitle=$('#optimizerExecutionNextActionTitle');
 const nextDescription=$('#optimizerExecutionNextActionDescription');
 if(nextTitle&&nextDescription){
  if(!p){
   nextTitle.textContent='Verificando prévia da SKU';
   nextDescription.textContent='Aguardando a validação do anúncio e das etapas; nenhum envio foi iniciado.';
  }else if(!p.canExecute){
   nextTitle.textContent='Execução bloqueada — corrigir pendências';
   nextDescription.textContent=(p.blocked||[]).slice(0,2).join(' · ')||
    'Nenhuma alteração revisada incluída. Use Corrigir pendências: o sistema validará os rascunhos salvos da SKU e mostrará o que ainda falta.';
  }else if(!optimizerDiscountReviewedForExecution(p)){
   nextTitle.textContent=p.modelVariations?.promotion?.marketOverrideRequired?
    'Autorização de preço acima de 25% pendente':'Falta conferir o desconto da etapa 08';
   nextDescription.textContent=p.modelVariations?.promotion?.marketOverrideRequired?
    'Marque a autorização excepcional imediatamente abaixo e depois clique em Executar. Nada foi enviado à Shopee.':
    'A prévia comercial está preparada. Use “Conferir desconto para liberar execução” e depois execute uma única vez.';
  }else if(p.selectedStage==='discount_adjust'){
   const d=p.kitDiscount||optimizerDiscountFinalPreviewData?.preview||null;
   nextTitle.textContent='Autorizar preço bruto calculado + desconto — SKU '+p.sku;
   nextDescription.textContent=d?
    'Preço bruto Shopee '+shPriceMoney(d.currentGross??d.originalPrice)+' → '+shPriceMoney(d.gross)+
    ' · PREÇO PROMOCIONAL A PUBLICAR '+shPriceMoney(d.promo)+
    '. Só a etapa 08 será executada; as demais serão preservadas.':
    'Confira a prévia comercial desta SKU, incluindo preço bruto e preço promocional. Nenhuma outra etapa será alterada.';
  }else if(p.selectedStage==='discount'){
   nextTitle.textContent='Somente desconto — SKU '+p.sku;
   nextDescription.textContent='Apenas a Minha Promoção será alterada; preço bruto, imagens, título e demais etapas ficam preservados. Se o preço divergir, a prévia será bloqueada.';
  }else if(p.selectedStage==='variants'){
   nextTitle.textContent='Somente variações — SKU '+p.sku;
   nextDescription.textContent='Publica apenas os modelos e fotos de variações conferidos; sem descontos, dados fiscais ou alterações no anúncio-pai.';
  }else if(p.selectedStage!=='all'){
   const mode=$('#optimizerExecutionScope')?.selectedOptions?.[0]?.textContent||p.selectedStage;
   nextTitle.textContent='Prévia PARCIAL: '+mode;
   nextDescription.textContent='Só esta etapa será publicada. As demais etapas, incluindo desconto e variações, NÃO constam nesta prévia. Use “Preparar TODAS as etapas aprovadas” para executar o anúncio completo.';
  }else if(optimizerExecBusy){
   nextTitle.textContent='Autorização enviada — verificando início';
   nextDescription.textContent='O servidor ainda precisa confirmar o recebimento. Não repita o comando.';
  }else{
   nextTitle.textContent='Prévia pronta — executar SKU '+p.sku;
   nextDescription.textContent=optimizerKitWorkflowActive()?
    'A etapa 08 conferida será executada automaticamente após as demais etapas, na mesma autorização.':
    '0% significa aguardando sua autorização. O botão abaixo iniciará a execução única da prévia revisada; os resultados serão conferidos na API Shopee.';
  }
 }
 optimizerExecutionVisibleCommands(optimizerExecProgress,optimizerExecJob);
}
async function optimizerConnectionCheck(){
 const el=$('#optimizerConnectionStatus');const btn=$('#optimizerConnectionCheck');
 if(!el||!btn)return;
 btn.disabled=true;el.textContent='Verificando configurações da API, sem acessar chaves secretas...';
 try{
   const d=await json('/api/shopee/optimizer/execution/diagnostic',{
     signal:AbortSignal.timeout(22000)});
   el.textContent=d.ready
    ?'Configuração básica presente. Se houver bloqueio, será preciso verificar a permissão ou resposta da API Shopee.'
    :'Falta conferir no Render do serviço redeachados-shopee: '+
      (d.missing||[]).join(', ')+'. Abra Environment no Render e valide essas variáveis. Nenhuma chave precisa ser enviada no chat.';
   el.dataset.state=d.ready?'success':'warning';
 }catch(e){el.textContent='Falha ao verificar integração: '+e.message;el.dataset.state='error'}
 finally{btn.disabled=false}
}
$('#optimizerConnectionCheck')?.addEventListener?.('click',()=>void optimizerConnectionCheck());

async function optimizerExecutionPrepare({preserveStartError=false}={}){
 const w=optimizerWorkflowPlan;
 if(!w||optimizerExecBusy)return;
 const key=[w.sku,w.itemId,w.modelId,$('#optimizerExecutionScope').value].join('|');
 if(optimizerExecPreparation){
  if(optimizerExecPreparation.key===key&&optimizerExecPreparation.serial===optimizerExecSerial){
   optimizerExecPreparation.again=true;
   return;
  }
  // Uma consulta antiga não pode bloquear a próxima SKU durante timeout de API.
  optimizerExecPrepareController?.abort();
  optimizerExecPrepareController=null;
  optimizerExecPreparation=null;
 }
 if(!preserveStartError)optimizerExecStartError='';
 optimizerExecPrepareError='';
 const serial=++optimizerExecSerial;
 const controller=new AbortController();
 const preparation={key,serial,again:false,controller};
 optimizerExecPreparation=preparation;
 optimizerExecPrepareController=controller;
 optimizerExecContext={sku:w.sku,itemId:w.itemId,modelId:w.modelId};
 optimizerExecPlan=null;optimizerExecAutoModelToken=null;optimizerExecAutoModelPreview=null;
 $('#optimizerExecutionSummary').hidden=true;
 $('#optimizerExecutionConfirmation').hidden=true;
 $('#optimizerExecutionLaunch').hidden=true;
 $('#optimizerExecutionLaunch').disabled=true;
 $('#optimizerExecutionRemaining').hidden=true;
 $('#optimizerExecutionPrepare').hidden=false;
 $('#optimizerExecutionShopeeLink').hidden=true;
 const btn=$('#optimizerExecutionPrepare');btn.disabled=true;
 optimizerExecNotice('Conferindo o anúncio atual, os rascunhos revisados e os bloqueios por etapa...');
 try{
   const active=await optimizerExecutionRefresh(false);
   if(['running','uncertain'].includes(active?.state))return;
   const result=await json('/api/shopee/optimizer/execution/prepare',{
     method:'POST',headers:{'Content-Type':'application/json'},
     body:JSON.stringify({sku:w.sku,itemId:w.itemId,modelId:w.modelId,
       stage:$('#optimizerExecutionScope').value,
       campaignId:String($('#optimizerExecDiscountCampaign')?.value||
        $('#optimizerFinalCampaignId')?.value||$('#discountPromotionId')?.value||
        optimizerDiscountFinalPreviewData?.preview?.discountId||'').trim(),
       ...(['all','discount','discount_adjust'].includes($('#optimizerExecutionScope').value)&&optimizerDiscountApprovalReady()&&!(typeof optimizerKitWorkflowActive==='function'&&optimizerKitWorkflowActive())?
        {discountApprovalToken:optimizerDiscountFinalPreviewData?.approvalToken,
        allowOver25:optimizerMarketExceptionConsent(optimizerDiscountFinalQuote)}:{})}),
     signal:AbortSignal.any([controller.signal,AbortSignal.timeout(75000)])
   });
   if(serial!==optimizerExecSerial||optimizerWorkflowPlan?.sku!==w.sku||
      optimizerWorkflowPlan?.itemId!==w.itemId||optimizerWorkflowPlan?.modelId!==w.modelId)return;
   optimizerExecRender(result);
 }catch(e){
   if(serial===optimizerExecSerial){
     optimizerExecPrepareError=String(e.message||e);
     optimizerExecNotice('Não foi possível preparar '+($('#optimizerExecutionScope').value==='all'?'TODAS as etapas':'esta etapa')+
       ': '+optimizerExecPrepareError+'. Nenhum envio foi iniciado.','error');
     if(optimizerExecProgress){
      optimizerExecutionTrackerRender({...optimizerExecProgress},optimizerExecJob);
      optimizerExecutionVisibleCommands(optimizerExecProgress,optimizerExecJob);
     }
     if(/SHOPEE_PARTNER_|SHOPEE_REDIRECT_|configur|Shopee HTTP/i.test(e.message))
       void optimizerConnectionCheck();
   }
 }finally{
  // Resposta tardia de outra SKU não pode limpar o pedido novo nem seu botão.
  if(optimizerExecPreparation===preparation){
   optimizerExecPreparation=null;
   if(optimizerExecPrepareController===controller)optimizerExecPrepareController=null;
   btn.disabled=false;
   if(preparation.again&&optimizerWorkflowPlan&&!optimizerExecBusy)
    setTimeout(()=>void optimizerExecutionPrepare({preserveStartError}),100);
  }
 }
}
$('#optimizerExecutionKitDiscountOnly')?.addEventListener?.('click',()=>{
 const w=optimizerWorkflowPlan,p=w?.kitDiscountPreview,link=w?.kitOptimization;
 if(optimizerExecBusy||!p||p.status!=='prepared'||!link||
    String(p.kitSku)!==String(link.kitSku)||
    String(p.itemId)!==String(w.itemId)||
    String(p.modelId||'0')!==String(w.modelId||'0')){
  optimizerExecNotice('A etapa 08 desta SKU precisa ter desconto calculado e conferido antes do envio.','warning');
  return;
 }
 $('#optimizerExecutionScope').value='discount_adjust';
 optimizerExecPrepareError='';
 optimizerExecStartError='';
 optimizerExecPlan=null;
 optimizerExecNotice('Somente etapa 08: aplicar preço bruto calculado e preço promocional planejado. As outras sete etapas permanecerão intactas.','info');
 void optimizerExecutionPrepare();
});
$('#optimizerExecutionPrepare')?.addEventListener?.('click',()=>void optimizerExecutionPrepare());
$('#optimizerExecutionRecoverStart')?.addEventListener?.('click',()=>{
 if(optimizerWorkflowPlan&&!optimizerExecBusy)void optimizerExecutionPrepare();
});
$('#optimizerExecutionSwitchFull')?.addEventListener?.('click',()=>{
 if(!optimizerWorkflowPlan||optimizerExecBusy)return;
 $('#optimizerExecutionScope').value='all';
 optimizerExecNotice('Preparando todas as etapas revisadas desta SKU. Nenhum envio é iniciado sem clicar em Executar.','info');
 void optimizerExecutionPrepare();
});
$('#optimizerExecutionScope')?.addEventListener?.('change',()=>{
 const stage=$('#optimizerExecutionScope').value;
 const promo=optimizerDiscountFinalPreviewData?.preview;
 if(stage==='discount'&&promo?.needsBasePriceUpdate&&!optimizerKitWorkflowActive()){
  optimizerExecNotice('O preço bruto atual difere do calculado. Para executar o preço promocional planejado, selecione "Somente preço bruto calculado + desconto" e autorize os dois valores da prévia. Nenhuma alteração foi enviada.','warning');
  return;
 }
 optimizerExecPlan=null;
 $('#optimizerExecutionLaunch').hidden=true;
 $('#optimizerExecutionSummary').hidden=true;
 optimizerExecNotice('Modo selecionado: '+$('#optimizerExecutionScope').selectedOptions[0].text+
   '. Preparando somente os campos dessa etapa...');
 void optimizerExecutionPrepare();
});
async function optimizerResolveExecutionBlockers(){
 const w=optimizerWorkflowPlan,p=optimizerExecPlan;
 if(!w||!p||optimizerExecBusy||p.sku!==w.sku||
    String(p.itemId)!==String(w.itemId)||String(p.modelId)!==String(w.modelId))return;
 if(p.canExecute&&!optimizerDiscountReviewedForExecution(p)){
  if(p.modelVariations?.promotion?.marketOverrideRequired){
   optimizerExecNotice('Confirme a autorização acima de 25% na barra de execução antes de prosseguir.','warning');
   $('#optimizerExecutionOver25Consent')?.focus();
   return;
  }
  optimizerDiscountOpenReview();
  optimizerExecNotice('Ajustes comerciais preparados: confira a promoção da SKU antes de executar. Nenhuma publicação foi iniciada.','warning');
  return;
 }
 const identity=[w.sku,String(w.itemId),String(w.modelId)].join('|');
 const sameSku=()=>optimizerWorkflowPlan===w&&[w.sku,String(w.itemId),String(w.modelId)].join('|')===identity;
 const blockers=(p.blocked||[]).join(' · ');
 const textStages=[
  {key:'seo',pattern:/título seo|revisar.*título/i,field:'title',value:String(w.draftTitle||'')},
  {key:'description',pattern:/descrição|descricao/i,field:'description',value:String(w.draftDescription||'')}
 ];
 let fixed=0,manualStage='',reason='';
 optimizerExecNotice('Corrigindo rascunhos completos e revalidando a SKU '+w.sku+' sem alterar a Shopee...');
 try{
  for(const candidate of textStages){
   const stage=(w.stages||[]).find(x=>x.key===candidate.key);
   const currentField=candidate.key==='seo'?'item_name':'description';
   const changed=Boolean(candidate.value.trim()&&candidate.value.trim()!==String(p.original?.[currentField]||'').trim());
   if(stage?.reviewed===true||!candidate.value.trim()||
      (!candidate.pattern.test(blockers)&&!changed))continue;
   try{
    const saved=await optimizerSaveChecklistReview({
     sku:w.sku,itemId:w.itemId,modelId:w.modelId,
     stage:candidate.key,reviewed:true,[candidate.field]:candidate.value
    });
    if(!sameSku())return;
    w.stages=saved.stages||w.stages;
    fixed++;
   }catch(error){
    manualStage=manualStage||candidate.key;
    reason=reason||String(error.message||error);
   }
  }
  // O cenário sem bloqueios detalhados também pode ter mídias já salvas,
  // porém ainda sem a revisão da etapa. Conferir as mídias pela identidade
  // SKU/item/model no servidor e exigir aprovação de publicação separada.
  if(['all','images','video'].includes(p.selectedStage)){
   for(const media of ['images','video']){
    if(!['all',media].includes(p.selectedStage))continue;
    const stage=(w.stages||[]).find(x=>x.key===media);
    if(stage?.reviewed||stage?.skipped)continue;
    const eligible=media==='images'||Boolean(w.manualVideo);
    if(!eligible)continue;
    try{
     const saved=await optimizerSaveChecklistReview({sku:w.sku,itemId:w.itemId,modelId:w.modelId,
      stage:media,reviewed:true});
     if(!sameSku())return;
     w.stages=saved.stages||w.stages;
     fixed++;
    }catch(error){
     // Ausência de mídia ou revisão incompatível não cria autorização falsa.
     reason=reason||String(error.message||error);
    }
   }
  }
  if(fixed){
   const fresh=await json('/api/shopee/optimizer/workflow?'+new URLSearchParams({
    sku:w.sku,item_id:w.itemId,model_id:w.modelId}),{signal:AbortSignal.timeout(60000)});
   if(!sameSku())return;
   Object.assign(w,fresh);
   optimizerWorkflowRender(w);
  }
  // Uma ficha com atributos/Anatel/Marca só é corrigida pelos fatos
  // confirmados e pelas opções oficiais; nunca preencher certificações falsas.
  const technicalPending=Boolean((w.stages||[]).some(x=>x.key==='technical'&&!x.reviewed&&!x.skipped));
  if(!manualStage&&(/anatel|marca|atributo|ficha técnica|ficha tecnica/i.test(blockers)||
    (!fixed&&technicalPending&&['all','technical'].includes(p.selectedStage)))){
   manualStage='technical';
   optimizerWorkflowOpen('technical');
   await optimizerTechImport();
   if(!sameSku())return;
  }
  if(!manualStage&&/variaç|varia[cç][oõ]es|modelo/i.test(blockers))
   manualStage='variants';
  if(!manualStage&&/ncm|cest|fiscal/i.test(blockers))
   manualStage='fiscal';
  if(!manualStage&&/desconto|promoção|promocao|campanha/i.test(blockers)){
   optimizerDiscountOpenReview();
   optimizerExecNotice('A campanha precisa de aprovação comercial da própria SKU. Nenhum desconto foi enviado.','warning');
   return;
  }
  if(!sameSku())return;
  await optimizerExecutionPrepare({preserveStartError:true});
  if(!sameSku())return;
  if(manualStage){
   optimizerWorkflowOpen(manualStage);
   optimizerWorkflowNotice('Correção automática executada onde havia dados confirmados. '+(reason?
    'Campo não aprovado: '+reason+'. ':'')+
    'Confira apenas os valores ainda sem confirmação e registre a revisão.','warning');
  }else{
   optimizerExecNotice(fixed?
    fixed+' etapa(s) do rascunho validada(s). Prévia recalculada; autorize a publicação no botão azul se estiver pronta.':
    'Prévia revalidada sem alteração. Confira as pendências específicas da SKU antes de autorizar.','info');
  }
 }catch(error){
  optimizerExecNotice('Correção incompleta: '+String(error.message||error)+
   '. Os campos já salvos permaneceram na SKU. Nenhuma publicação foi iniciada.','error');
 }
}
$('#optimizerExecutionLaunch')?.addEventListener?.('click',()=>{
 if(optimizerExecPlan?.canExecute&&optimizerDiscountReviewedForExecution(optimizerExecPlan))
  return void optimizerExecuteApproved(false);
 void optimizerResolveExecutionBlockers();
});
$('#optimizerExecutionOver25Consent')?.addEventListener?.('change',()=>{
 optimizerExecUpdateRunButton();
});
$('#optimizerExecutionRemaining')?.addEventListener?.('click',()=>void optimizerExecuteApproved(true));
$('#optimizerExecutionRun')?.addEventListener?.('click',()=>void optimizerExecuteApproved(false));
function optimizerExecutionNeedsFreshPreview(message){
 return /Conteúdo ou aprovação mudou|A prévia tem alterações novas ou divergentes|Plano alterado em outra sessão|Plano mudou|Anúncio alterado após preparação|A ficha técnica da Shopee foi modificada|Os dados fiscais da Shopee mudaram|Imagens alteradas após preparação|Categoria alterada após preparação|A etapa escolhida mudou|Plano já executado, alterado/i.test(String(message||''));
}
async function optimizerExecuteApproved(remainingOnly=false){
 const p=optimizerExecPlan,ctx=optimizerExecContext;
 if(remainingOnly&&(p?.selectedStage!=='all'||!p?.modelVariations?.promotion))return;
 if(!p?.canExecute||!ctx||optimizerExecBusy||p.sku!==ctx.sku||
    p.itemId!==ctx.itemId||p.modelId!==ctx.modelId)return;
 if(!optimizerDiscountReviewedForExecution(p)){
  if(p.modelVariations?.promotion?.marketOverrideRequired&&!optimizerModelMarketConsent(p)){
   optimizerExecNotice('Para continuar, marque a autorização excepcional acima de 25% ao lado do andamento. O preço e a margem foram conferidos na prévia; nada foi enviado.','warning');
   $('#optimizerExecutionOver25Consent')?.focus();
   return;
  }
  optimizerExecNotice('Não foi possível gerar a aprovação automática do desconto. Confira a campanha da SKU na prévia.','warning');
  if(!p.modelVariations)optimizerDiscountOpenReview();return;
 }
 // Apenas a ação de clicar neste comando autoriza as modificações da prévia.
 const btn=$('#optimizerExecutionLaunch');
 const discountIntent=optimizerDiscountAuthorizedIntent(p);
 const executionSerial=optimizerExecSerial;
 optimizerExecStartError='';optimizerExecBusy=true;btn.disabled=true;$('#optimizerExecutionRun').disabled=true;
 $('#optimizerExecutionRemaining').disabled=true;
 $('#optimizerExecutionPrepare').disabled=true;
 $('#optimizerExecutionLaunch').hidden=true;
 $('#optimizerExecutionRemaining').hidden=true;
 let previewMustRefresh=false,recoverPrepared=false,failedStartReason='';
 optimizerExecNotice('Validando a prévia aprovada. O início só será confirmado após resposta do servidor...');
 $('#optimizerExecutionPanel').hidden=false;
 if(optimizerExecProgress){
  optimizerExecutionTrackerRender({...optimizerExecProgress,
   title:'Confirmando início na Shopee',message:'Validando a autorização. A publicação ainda NÃO começou; imagens e vídeo existentes ficam preservados.'},optimizerExecJob);
  $('#optimizerExecutionTracker').scrollIntoView?.({behavior:'smooth',block:'nearest'});
 }
 // A aprovação é registrada no job do servidor no mesmo clique único.
 try{
   const out=await json('/api/shopee/optimizer/execution/execute',{
     method:'POST',headers:{'Content-Type':'application/json'},
     body:JSON.stringify({sku:ctx.sku,itemId:ctx.itemId,modelId:ctx.modelId,
       planId:p.planId,updatedAt:p.updatedAt,stage:p.selectedStage||'all',
       confirmation:'EXECUTAR '+p.sku,acceptPartialExecution:true,
       ...(remainingOnly?{remainingOnly:true}:{}),
       ...(['all','remaining','discount','discount_adjust'].includes(p.selectedStage)&&!(typeof optimizerKitWorkflowActive==='function'&&optimizerKitWorkflowActive())?{discountApprovalToken:p.modelVariations?
        optimizerExecAutoModelToken:optimizerDiscountFinalPreviewData?.approvalToken,
        allowPriceChange:p.modelVariations?Boolean(
         optimizerExecAutoModelPreview?.needsBasePriceUpdate||
         optimizerExecAutoModelPreview?.modelPriceChange):
         discountIntent?.consent===true,
         allowOver25:p.modelVariations?
          (p.modelVariations.promotion?.marketOverrideRequired===true&&optimizerModelMarketConsent(p)):
          optimizerMarketExceptionConsent(optimizerDiscountFinalQuote)}:{})}),
     signal:AbortSignal.timeout(85000)
   });
   if(optimizerWorkflowPlan?.sku!==ctx.sku||optimizerWorkflowPlan?.itemId!==ctx.itemId||optimizerWorkflowPlan?.modelId!==ctx.modelId)return;
   optimizerExecPlan=null;
   $('#optimizerExecutionConfirmation').hidden=true;
   $('#optimizerExecutionLaunch').hidden=true;
   $('#optimizerExecutionRemaining').hidden=true;
   optimizerExecNotice(out.marketplaceUpdated===true
     ?'A Shopee confirmou as alterações aprovadas.'
     :'Execução iniciada. O progresso será consultado automaticamente.',
     out.marketplaceUpdated===true?'success':'info');
   $('#optimizerExecutionTracker').scrollIntoView?.({behavior:'smooth',block:'nearest'});
   void optimizerExecutionRefresh(true);
 }catch(e){
   if(optimizerWorkflowPlan?.sku!==ctx.sku||optimizerWorkflowPlan?.itemId!==ctx.itemId||optimizerWorkflowPlan?.modelId!==ctx.modelId)return;
   optimizerExecPlan=null;$('#optimizerExecutionConfirmation').hidden=true;
   $('#optimizerExecutionLaunch').hidden=true;
   $('#optimizerExecutionRemaining').hidden=true;
   optimizerExecStartError=String(e.message||e);
   failedStartReason=optimizerExecStartError;
   recoverPrepared=true;
   // Mostrar a falha na própria barra da SKU; o andamento não pode
   // continuar com título "Retomando" quando a API devolve erro.
   if(optimizerExecProgress){
    optimizerExecutionTrackerRender({...optimizerExecProgress,
     title:'Execução não iniciada',
     message:'O servidor não aceitou o início: '+failedStartReason+'. A mídia anterior está preservada.'
    },optimizerExecJob);
   }
   previewMustRefresh=optimizerExecutionNeedsFreshPreview(optimizerExecStartError);
   if(previewMustRefresh){
     optimizerExecNotice('A prévia anterior ficou desatualizada. Atualizando a prévia com as alterações vigentes para sua nova conferência. Nenhum envio ocorreu nesta tentativa.','warning');
   }else{
     optimizerExecNotice('Execução não confirmada: '+optimizerExecStartError+
       '. Consultando o andamento antes de permitir qualquer nova tentativa.','error');
     void optimizerExecutionRefresh(true);
   }
 }finally{
  // Finalização tardia de outra SKU não interfere na execução ativa.
  if(executionSerial===optimizerExecSerial){optimizerExecBusy=false;$('#optimizerExecutionPrepare').disabled=false;}
 }
 if(recoverPrepared&&optimizerWorkflowPlan?.sku===ctx.sku&&
    optimizerWorkflowPlan?.itemId===ctx.itemId&&optimizerWorkflowPlan?.modelId===ctx.modelId){
   // Recuperar somente o plano, nunca disparar outro POST de publicação
   // sem confirmar primeiro no banco se o POST anterior iniciou o worker.
   const state=await optimizerExecutionRefresh(true);
   if(state?.state==='prepared'||state?.state==='blocked'||state?.state==='failed'){
     await optimizerExecutionPrepare({preserveStartError:true});
     if(optimizerExecPlan?.canExecute&&optimizerExecPlan.sku===ctx.sku){
       optimizerExecNotice('A Shopee não iniciou essa tentativa: '+failedStartReason+
        '. Plano revalidado; o botão de retomada está disponível novamente. Nenhuma mídia foi reenviada.','warning');
     }
   }
 }
}

// A fiscal batch never posts whole ads: every row has its own verified
// immutable single-stage tax_info plan and independent persisted worker job.
let optimizerFiscalBatchRows=[],optimizerFiscalBatchBusy=false,optimizerFiscalBatchTimer=null;
const SHOPEE_BATCH_SESSION_KEY='ra-shopee-fiscal-batch-v1';
function optimizerFiscalBatchNotice(message,state='info'){
 const el=$('#optimizerFiscalBatchStatus');if(el){el.textContent=message;el.dataset.state=state;}
}
function optimizerFiscalBatchRender(){
 const list=$('#optimizerFiscalBatchList');if(!list)return;
 list.replaceChildren();
 let ready=0;
 for(const row of optimizerFiscalBatchRows){
  const card=optimizerMake('article','optimizer-fiscal-batch-item');
  const head=optimizerMake('div','optimizer-fiscal-batch-item-head');
  head.append(optimizerMake('strong','',row.sku||'SKU'));
  const status=row.status||row.state||(row.ready?'prepared':'blocked');
  const chip=optimizerMake('span','optimizer-fiscal-batch-state is-'+String(status).replace(/[^a-z-]/g,''),
   ({prepared:'Pronto',running:'Executando',verified:'Confirmado',
      draft_only:'Cadastrado no Motor Matriz',failed:'Falhou',uncertain:'Confirmação pendente',
      blocked:'Pendente',failed_preview:'Pendente'}[status]||status));
  head.append(chip);card.append(head);
  if(row.ready&&row.planId&&status==='prepared')ready++;
  if(row.ready&&row.proposed){
   const changed=Object.entries(row.proposed).filter(([k,v])=>k!=='evidence'&&String(v??'')!=='')
    .map(([k,v])=>k+': '+String(v)).join(' · ');
   if(changed)card.append(optimizerMake('p','optimizer-fiscal-batch-diff',changed));
  }
  const message=row.message||row.error||row.blocked?.join(' · ')||'';
  if(message)card.append(optimizerMake('small','',message));
  if(row.blocked?.length)card.append(optimizerMake('small','optimizer-fiscal-batch-warning',
    'Dados a revisar: '+row.blocked.join(' · ')));
  if(row.publicationPending?.length)card.append(optimizerMake('small','optimizer-fiscal-batch-pending',
    'Publicação fiscal pendente: '+row.publicationPending.join(' · ')));
  if(row.issue?.code==='CEST_REQUIRED')
   card.append(optimizerMake('small','optimizer-fiscal-batch-warning',
     'A Shopee exige CEST para este NCM. Esta SKU não foi confirmada.'));
  window.OptimizerFiscalPremium?.renderRow?.({row,card,chip,status,message});
  list.append(card);
 }
 window.OptimizerFiscalPremium?.sync?.(optimizerFiscalBatchRows);
 const execute=$('#optimizerFiscalBatchExecute');
 execute.hidden=!optimizerFiscalBatchRows.length||!optimizerFiscalBatchRows.some(x=>x.ready&&x.planId);
 execute.disabled=optimizerFiscalBatchBusy||ready===0;
 const refresh=$('#optimizerFiscalBatchRefresh');
 refresh.hidden=!optimizerFiscalBatchRows.some(x=>x.status==='running'||x.status==='uncertain'||x.status==='verified'||x.status==='failed');
}
$('#optimizerFiscalBatchSkus')?.addEventListener?.('input',()=>{
 optimizerFiscalBatchRows=[];
 $('#optimizerFiscalBatchExecute').hidden=true;
 $('#optimizerFiscalBatchRefresh').hidden=true;
 $('#optimizerFiscalBatchList').replaceChildren();
 optimizerFiscalBatchNotice('Seleção alterada. Prepare uma nova prévia antes de executar.');
});
async function optimizerFiscalBatchPrepare(){
 if(optimizerFiscalBatchBusy)return;
 const source=$('#optimizerFiscalBatchSkus').value.trim();
 if(!source){optimizerFiscalBatchNotice('Informe as SKUs que deseja incluir no lote.','warning');return;}
 optimizerFiscalBatchBusy=true;
 const btn=$('#optimizerFiscalBatchPrepare');btn.disabled=true;
 optimizerFiscalBatchNotice('Localizando SKUs e conferindo as fichas fiscais individualmente. Nenhum anúncio será alterado...');
 try{
  const data=await json('/api/shopee/optimizer/batch/fiscal/prepare',{
   method:'POST',headers:{'Content-Type':'application/json'},
   body:JSON.stringify({skus:source.split(/[\s,;]+/g).filter(Boolean)}),
   signal:AbortSignal.timeout(240000)
  });
  optimizerFiscalBatchRows=data.results||[];
  optimizerFiscalBatchRender();
  const registered=(data.results||[]).filter(x=>x.registered||x.ready).length;
  optimizerFiscalBatchNotice(registered+' de '+data.total+' SKUs com informações fiscais salvas no Motor Matriz. '+
   data.ready+' com prévia fiscal apta para envio opcional à Shopee. Preencher os campos não emite nota fiscal.',
   registered?'success':'warning');
 }catch(e){optimizerFiscalBatchRows=[];optimizerFiscalBatchRender();
  optimizerFiscalBatchNotice('Falha ao preparar lote fiscal: '+e.message,'error');}
 finally{optimizerFiscalBatchBusy=false;btn.disabled=false;optimizerFiscalBatchRender();}
}
$('#optimizerFiscalBatchPrepare')?.addEventListener?.('click',()=>void optimizerFiscalBatchPrepare());
const FISCAL_ONE_BY_ONE_KEY='ra-fiscal-single-worker-v1';
async function optimizerFiscalBatchExecute(){
 if(optimizerFiscalBatchBusy)return;
 const selected=optimizerFiscalBatchRows.filter(x=>x.ready&&x.planId&&(x.status||x.state)==='prepared');
 if(!selected.length)return;
 optimizerFiscalBatchBusy=true;
 $('#optimizerFiscalBatchExecute').disabled=true;
 const key=selected.map(x=>[x.sku,x.itemId,x.modelId,x.planId].join(':')).join('|');
 let start=0;
 try{
  const checkpoint=JSON.parse(localStorage.getItem(FISCAL_ONE_BY_ONE_KEY)||'null');
  if(checkpoint?.pending){
   // Uma resposta perdida não autoriza reenviar: confirmar a execução persistida na API.
   const pendingRow=selected.find(x=>x.sku===checkpoint.pending);
   if(!pendingRow){
    optimizerFiscalBatchNotice('Existe uma SKU de execução anterior sem confirmação ('+checkpoint.pending+'). Consulte o andamento antes de iniciar outro lote.','warning');
    return;
   }
   const status=await json('/api/shopee/optimizer/batch/fiscal/status?'+new URLSearchParams({
    items:JSON.stringify([{sku:pendingRow.sku,itemId:pendingRow.itemId,modelId:pendingRow.modelId}])
   }),{signal:AbortSignal.timeout(45000)});
   const item=(status.results||[]).find(x=>x.sku===pendingRow.sku);
   if(!item||!['verified','running'].includes(item.status)){
    optimizerFiscalBatchNotice('SKU '+pendingRow.sku+' com resultado não confirmado ('+(item?.status||'sem retorno')+'). Não houve reenvio. Confira a Shopee.','warning');
    return;
   }
   optimizerFiscalBatchRows=optimizerFiscalBatchRows.map(x=>x.sku===pendingRow.sku?
    {...x,status:item.status,message:item.message}:x);
   optimizerFiscalBatchRender();
   const nextIndex=selected.findIndex(x=>x.sku===pendingRow.sku)+1;
   try{localStorage.setItem(FISCAL_ONE_BY_ONE_KEY,JSON.stringify({key,next:nextIndex,pending:null}));}catch{}
   start=nextIndex;
  }else if(checkpoint?.key===key&&Number.isInteger(checkpoint.next)&&checkpoint.next>=0&&checkpoint.next<selected.length)
   start=checkpoint.next;
 }catch(error){
  optimizerFiscalBatchNotice('Não foi possível conferir a SKU interrompida: '+String(error.message||error)+'. Nenhum reenvio foi realizado.','warning');
  optimizerFiscalBatchBusy=false;
  optimizerFiscalBatchRender();
  return;
 }
 try{
  for(let i=start;i<selected.length;i++){
   const row=selected[i];
   optimizerFiscalBatchNotice('Processando SKU '+(i+1)+' de '+selected.length+': '+row.sku+'. Uma por vez, sem alterar preço ou mídia.');
   // Salvar antes da chamada: em caso de queda, consultar status antes de reenviar.
   try{localStorage.setItem(FISCAL_ONE_BY_ONE_KEY,JSON.stringify({key,next:i,pending:row.sku}));}catch{}
   let data;
   try{
    data=await json('/api/shopee/optimizer/batch/fiscal/execute',{
     method:'POST',headers:{'Content-Type':'application/json'},
     body:JSON.stringify({confirmation:'EXECUTAR LOTE FISCAL',acceptPartialExecution:true,
      items:[{sku:row.sku,itemId:row.itemId,modelId:row.modelId,planId:row.planId,updatedAt:row.updatedAt}]}),
     signal:AbortSignal.timeout(120000)
    });
   }catch(error){
    optimizerFiscalBatchNotice('Execução pausada na SKU '+row.sku+': '+error.message+
      '. Confira o resultado na Shopee antes de retomar para evitar reenvio duplicado.','warning');
    void optimizerFiscalBatchRefresh();
    return;
   }
   const item=(data.results||[]).find(x=>x.sku===row.sku);
   if(!item){
    optimizerFiscalBatchNotice('Resposta sem confirmação da SKU '+row.sku+'. Confira o status antes de continuar.','warning');
    void optimizerFiscalBatchRefresh();return;
   }
   optimizerFiscalBatchRows=optimizerFiscalBatchRows.map(x=>x.sku===row.sku?
    {...x,status:item.status,message:item.message}:x);
   optimizerFiscalBatchRender();
   if(!['running','verified'].includes(item.status)){
    optimizerFiscalBatchNotice('SKU '+row.sku+' exige revisão: '+(item.message||item.status)+
      '. Os demais itens não foram enviados; revise antes de continuar.','warning');
    return;
   }
   try{localStorage.setItem(FISCAL_ONE_BY_ONE_KEY,JSON.stringify({key,next:i+1,pending:null}));}catch{}
  }
  try{localStorage.removeItem(FISCAL_ONE_BY_ONE_KEY);}catch{}
  optimizerFiscalBatchNotice('Envio sequencial iniciado para as SKUs aptas. Confira a confirmação de cada uma na Shopee.','success');
  void optimizerFiscalBatchRefresh();
 }finally{optimizerFiscalBatchBusy=false;optimizerFiscalBatchRender();}
}
$('#optimizerFiscalBatchExecute')?.addEventListener?.('click',()=>void optimizerFiscalBatchExecute());
async function optimizerFiscalBatchRefresh(){
 if(optimizerFiscalBatchTimer){clearTimeout(optimizerFiscalBatchTimer);optimizerFiscalBatchTimer=null;}
 const refs=optimizerFiscalBatchRows.filter(x=>x.itemId&&
   ['running','uncertain','verified','failed'].includes(x.status)).map(x=>({sku:x.sku,itemId:x.itemId,modelId:x.modelId}));
 if(!refs.length)return;
 try{
  const data=await json('/api/shopee/optimizer/batch/fiscal/status?'+
   new URLSearchParams({items:JSON.stringify(refs)}),{signal:AbortSignal.timeout(45000)});
  const bySku=new Map((data.results||[]).map(x=>[x.sku,x]));
  optimizerFiscalBatchRows=optimizerFiscalBatchRows.map(x=>bySku.has(x.sku)?
   {...x,...{status:bySku.get(x.sku).status,message:bySku.get(x.sku).message,issue:bySku.get(x.sku).issue}}:x);
  optimizerFiscalBatchRender();
  const active=optimizerFiscalBatchRows.some(x=>x.status==='running');
  if(active){optimizerFiscalBatchNotice('Execução fiscal em andamento. Atualização automática a cada 7 segundos.','info');
   optimizerFiscalBatchTimer=setTimeout(()=>void optimizerFiscalBatchRefresh(),7000);}
  else{
   try{sessionStorage.removeItem(SHOPEE_BATCH_SESSION_KEY);}catch{}
   optimizerFiscalBatchNotice('Lote processado. '+optimizerFiscalBatchRows.filter(x=>x.status==='verified').length+
     ' SKUs confirmadas. Revise falhas individualmente; nenhuma SKU com erro será reenviada automaticamente.',
     optimizerFiscalBatchRows.some(x=>x.status==='failed'||x.status==='uncertain')?'warning':'success');
  }
 }catch(e){
  optimizerFiscalBatchNotice('Não foi possível atualizar o status do lote: '+e.message+
   '. As execuções já autorizadas continuam armazenadas. Atualize o andamento novamente.','warning');
 }
}
$('#optimizerFiscalBatchRefresh')?.addEventListener?.('click',()=>void optimizerFiscalBatchRefresh());
try{
 const pending=JSON.parse(sessionStorage.getItem(SHOPEE_BATCH_SESSION_KEY)||'[]');
 if(Array.isArray(pending)&&pending.length&&pending.length<=12){
  optimizerFiscalBatchRows=pending.map(x=>({...x,status:'running',ready:false}));
  optimizerFiscalBatchRender();
  void optimizerFiscalBatchRefresh();
 }
}catch{}
let optimizerAutoReadbackRecoveryKey='';
function optimizerExecutionAutoRecoverStale(job){
 const w=optimizerWorkflowPlan;
 const phase=String(job?.result?.phase||'');
 const modelPhase=/^variation_|^model_discount_/.test(phase);
 if(!w||job?.state!=='uncertain'||(!modelPhase&&!/^fiscal_|^discount_/.test(phase)&&!['updating','verifying'].includes(phase))||
  String(job.sku)!==String(w.sku)||String(job.item_id)!==String(w.itemId)||
  String(job.model_id||0)!==String(w.modelId||0))return;
 const updated=Math.max(Date.parse(job.updated_at||'')||0,
  Number(job.result?.updateStartedAt||0));
 const age=Date.now()-updated;
 if(!updated||age<25000)return;
 // Ler automaticamente a Shopee em intervalos limitados, sem POST de
 // publicação. Após 3 minutos, aplicar recuperação segura existente.
 const recover=age>=180000;
 const attempt=recover?'recover':'check-'+Math.floor((age-25000)/30000);
 const key=[w.sku,w.itemId,w.modelId,job.updated_at,attempt].join('|');
 if(optimizerAutoReadbackRecoveryKey===key)return;
 optimizerAutoReadbackRecoveryKey=key;
 // Reconciliação uma vez por versão. Escritas com resultado incerto não são
 // repetidas; as próximas etapas da execução já autorizada podem prosseguir.
 void (async()=>{
  try{
   const data=await json('/api/shopee/optimizer/execution/reconcile',{
    method:'POST',headers:{'Content-Type':'application/json'},
    body:JSON.stringify({sku:w.sku,itemId:w.itemId,modelId:w.modelId,recover}),
    signal:AbortSignal.timeout(65000)
   });
   if(optimizerWorkflowPlan?.sku!==w.sku||String(optimizerWorkflowPlan?.itemId)!==String(w.itemId)||
    String(optimizerWorkflowPlan?.modelId||0)!==String(w.modelId||0))return;
   if(data.recoveryReady){
    optimizerExecutionJobView(data.job,data.progress,data.issue);
    optimizerExecNotice('Recuperação automática: duas leituras da Shopee confirmaram o estado atual. Preparando apenas os campos pendentes, sem repetir envios.','success');
    await optimizerExecutionPrepare();
   }else if(data.job?.state!=='uncertain'){
    optimizerExecutionJobView(data.job,data.progress,data.issue);
    if(data.job?.state==='running'){
     if(optimizerExecPoll)clearTimeout(optimizerExecPoll);
     optimizerExecPoll=setTimeout(()=>void optimizerExecutionRefresh(true),500);
    }
   }else if(data.pendingChecks?.length){
    optimizerExecNotice('Conferência automática: '+data.pendingChecks.join('; ')+
     '. Imagens e vídeo já enviados continuam preservados; nenhuma escrita será repetida.','warning');
   }
  }catch(error){
   if(optimizerWorkflowPlan?.sku===w.sku)
    optimizerExecNotice('A recuperação automática não conseguiu confirmar a etapa na Shopee: '+
     error.message+'. Use Conferir e destravar execução para tentar novamente; nenhum envio foi repetido.','warning');
  }
 })();
}
function optimizerExecutionJobView(job,progress=null,issue=null){
 optimizerExecutionTrackerRender(progress,job);
 optimizerExecutionIssueRender(issue);
 optimizerExecJob=job;
 optimizerDiscountFinalPaint();
 if(job)void optimizerFinalPendingRefresh();
 if(job?.state==='uncertain')optimizerExecutionAutoRecoverStale(job);
 if(!job)globalThis.OptimizerSkuDashboard?.execution?.(null,null);
 // Continuar acompanhando a SKU automaticamente mesmo após recarregar a página.
 if(job&&(['running','uncertain'].includes(job.state)||progress?.hasSavedProgress)&&
     (optimizerWorkflowActiveView===null||optimizerWorkflowActiveView==='execution')){
  optimizerWorkflowActivateOnly('execution');
 }
 const active=['running','uncertain'].includes(job?.state);
 const verified=job?.state==='verified';
 const technicalReviewed=optimizerWorkflowPlan?.stages?.some(x=>
  x.key==='technical'&&x.reviewed===true);
 const technicalDraft=optimizerWorkflowPlan?.technicalDraft?.fields||[];
 const technicalPending=Boolean(verified&&technicalReviewed&&technicalDraft.some(x=>
  x.enabled===true&&!x.userDisabled&&x.values?.some(v=>Number(v.valueId)>0||
   Number(v.valueId)===0&&String(v.valueName||'').trim()))&&
  !job?.plan?.proposed?.attribute_list&&!job?.plan?.confirmedStages?.technical);
 const techPanel=$('#optimizerExecutionTechnicalPending');
 if(techPanel)techPanel.hidden=!technicalPending;
 const fiscalPartial=verified&&job?.result?.phase==='verified_partial';
 const resultLink=$('#optimizerExecutionShopeeLink');
 resultLink.hidden=!verified;
 resultLink.textContent=fiscalPartial?
  '⚠ Comercial confirmado; fiscal pendente — conferir na Shopee ↗':
  '✓ Alterações incluídas confirmadas na Shopee ↗';
 if(verified&&optimizerWorkflowPlan?.itemId)
   resultLink.href='https://seller.shopee.com.br/portal/product/'+encodeURIComponent(optimizerWorkflowPlan.itemId)+'?pageEntry=product_list';
 $('#optimizerExecutionReconcile').hidden=job?.state!=='uncertain';
 $('#optimizerExecutionReconcile').textContent=job?.state==='uncertain'?'Conferir e destravar execução':'Conferir resultado na Shopee';
 $('#optimizerExecutionRetry').textContent=job?.state==='uncertain'?'Recuperar e preparar pendências':'Repreparar execução';
 $('#optimizerExecutionRetry').hidden=!['failed','uncertain'].includes(job?.state);
 if(!job)return;
 // A rejected start leaves the job prepared. Do not erase its actionable
 // error when the follow-up status request returns the unchanged preview.
 if(job.state==='prepared'&&optimizerExecStartError){
  optimizerExecNotice('Execução não iniciada: '+optimizerExecStartError+
    '. O plano continua preparado; nenhuma alteração foi enviada por esta tentativa. Corrija o motivo e revalide a prévia.','error');
  return;
 }
 if(job.state!=='prepared')optimizerExecStartError='';
 const labels={images_upload:'Enviando imagens',queued:'Na fila',video_upload:'Enviando vídeo',video_processing:'Shopee processando vídeo',
  updating:'Aplicando alterações',verifying:'Conferindo o anúncio na Shopee',verified:'Alterações confirmadas',retry_allowed:'Pronto para uma nova prévia'};
 let message=progress?.resumable?progress.message:
  labels[job.result?.phase]||({failed:'Execução interrompida',uncertain:'Aguardando confirmação',prepared:'Prévia preparada',blocked:'Revisão pendente'}[job.state])||job.state;
 if(job.result?.phase==='images_upload')message+=' · '+(job.result.imageIds||[]).length+'/9';
 if(job.result?.video?.totalParts&&job.result.video.phase==='uploading')message+=' · parte '+job.result.video.nextPart+'/'+job.result.video.totalParts;
 if(job.last_error)message+=' · '+(issue?.code==='CEST_REQUIRED'
   ?'CEST correspondente ao NCM precisa ser corrigido na ficha fiscal.':job.last_error);
 if(fiscalPartial)message='Conteúdo e mídia confirmados na Shopee, mas a etapa FISCAL foi recusada e continua pendente. Corrija o CEST/NCM no Motor Matriz antes de preparar nova execução fiscal.';
 else if(job.state==='verified')message+=' · Todas as alterações incluídas nesta execução foram verificadas.';
 optimizerExecNotice(message,fiscalPartial?'warning':job.state==='verified'?'success':
  job.state==='failed'||job.state==='uncertain'?'warning':'info');
 // A etapa de desconto agora é exclusivamente do worker persistido no servidor.
 if(active||verified){
  $('#optimizerExecutionLaunch').hidden=true;
  $('#optimizerExecutionRemaining').hidden=true;
  optimizerExecPlan=null;$('#optimizerExecutionConfirmation').hidden=true;
  $('#optimizerExecutionRun').disabled=true;
 }
}
// One readback-only reconciliation for a historical field-level CEST refusal.
 // If the marketplace changed anything, keep the uncertain state and do not retry.
async function optimizerExecutionSafeRecoverCest(job,w){
 if(!job||optimizerExecSafeRecovering)return;
 const key=[w.sku,w.itemId,w.modelId,job.run_id||'',job.updated_at||''].join('|');
 if(optimizerExecSafeRecoveryKey===key)return;
 optimizerExecSafeRecoveryKey=key;optimizerExecSafeRecovering=true;
 try{
  const data=await json('/api/shopee/optimizer/execution/reconcile',{
   method:'POST',headers:{'Content-Type':'application/json'},
   body:JSON.stringify({sku:w.sku,itemId:w.itemId,modelId:w.modelId,safeRecover:true}),
   signal:AbortSignal.timeout(45000)});
  if(optimizerWorkflowPlan?.sku!==w.sku||optimizerWorkflowPlan?.itemId!==w.itemId||
      optimizerWorkflowPlan?.modelId!==w.modelId)return;
  optimizerExecutionJobView(data.job,data.progress,data.issue);
  if(data.job?.state==='failed')
   optimizerExecNotice('A Shopee rejeitou a edição por CEST. O anúncio foi conferido e nenhuma alteração foi reenviada. Corrija as informações fiscais para continuar.','warning');
 }catch(error){
  // Keep the uncertain state. Never infer a failed write from network loss.
  if(optimizerWorkflowPlan?.sku===w.sku&&optimizerWorkflowPlan?.itemId===w.itemId)
   optimizerExecNotice('Não foi possível confirmar com segurança a rejeição fiscal: '+error.message+'. Nenhum envio será repetido.','warning');
 }finally{optimizerExecSafeRecovering=false;}
}
async function optimizerExecutionRefresh(poll=false){
 const w=optimizerWorkflowPlan;if(!w)return null;
 const identity=w.sku+':'+w.itemId+':'+w.modelId;
 // Consulta de andamento antiga nunca impede a próxima SKU.
 if(optimizerExecPolling&&optimizerExecPollingIdentity===identity)return null;
 optimizerExecPolling=true;optimizerExecPollingIdentity=identity;
 try{
  const data=await json('/api/shopee/optimizer/execution/status?'+new URLSearchParams({
   sku:w.sku,item_id:w.itemId,model_id:w.modelId}),{signal:AbortSignal.timeout(25000)});
  const current=optimizerWorkflowPlan;
  if(!current||current.sku+':'+current.itemId+':'+current.modelId!==identity)return null;
  optimizerExecutionJobView(data.job,data.progress,data.issue);
  if(data.job?.state==='uncertain'&&data.issue?.code==='CEST_REQUIRED')
   void optimizerExecutionSafeRecoverCest(data.job,w);
  const awaitingReadback=data.job?.state==='uncertain'&&
   Date.now()-(Date.parse(data.job.updated_at||'')||0)<180000;
  if(data.job?.state==='running'||awaitingReadback){
   if(optimizerExecPoll)clearTimeout(optimizerExecPoll);
   optimizerExecPoll=setTimeout(()=>void optimizerExecutionRefresh(true),awaitingReadback?15000:4000);
  }
  return data.job;
 }catch(e){
  // Erros tardios não podem substituir o status de outra SKU.
  const current=optimizerWorkflowPlan;
  if(current&&current.sku+':'+current.itemId+':'+current.modelId===identity){
   optimizerExecNotice('Não foi possível consultar o andamento: '+e.message+'. Nova tentativa automática em 15 segundos.','warning');
   if(optimizerExecPoll)clearTimeout(optimizerExecPoll);
   optimizerExecPoll=setTimeout(()=>void optimizerExecutionRefresh(true),15000);
  }
  return null;
 }finally{
  if(optimizerExecPollingIdentity===identity){optimizerExecPolling=false;optimizerExecPollingIdentity='';}
 }
}
$('#optimizerExecutionTechnicalOnly')?.addEventListener?.('click',()=>{
 const w=optimizerWorkflowPlan;
 if(!w||optimizerExecBusy)return;
 $('#optimizerExecutionScope').value='technical';
 optimizerExecNotice('Preparando SOMENTE ficha técnica aprovada. Nenhuma imagem, vídeo, variação ou desconto será reenviado.','info');
 void optimizerExecutionPrepare();
});
$('#optimizerExecutionRefresh')?.addEventListener?.('click',()=>void optimizerExecutionRefresh(true));
async function optimizerReconcileUncertainExecution(){
 const w=optimizerWorkflowPlan;if(!w)return;
 const btn=$('#optimizerExecutionReconcile');btn.disabled=true;
 try{
  const d=await json('/api/shopee/optimizer/execution/reconcile',{method:'POST',
   headers:{'Content-Type':'application/json'},body:JSON.stringify({sku:w.sku,itemId:w.itemId,modelId:w.modelId,recover:true}),
   signal:AbortSignal.timeout(65000)});
  if(optimizerWorkflowPlan===w){
   optimizerExecutionJobView(d.job,d.progress,d.issue);
   if(d.recoveryReady){
    optimizerExecNotice('Execução antiga destravada após duas leituras estáveis. Preparando somente as pendências; nenhum envio foi repetido.','success');
    await optimizerExecutionPrepare();
    return;
   }
   if(d.pendingChecks?.length)optimizerExecNotice('Ainda não confirmado: '+d.pendingChecks.join('; ')+'. Nada foi reenviado.','warning');
   else if(d.message)optimizerExecNotice(d.message,d.job?.state==='verified'?'success':'info');
  }
 }catch(e){optimizerExecNotice(e.message,'warning');}finally{btn.disabled=false;}
}
$('#optimizerExecutionReconcile')?.addEventListener?.('click',()=>void optimizerReconcileUncertainExecution());
$('#optimizerExecutionRetry')?.addEventListener?.('click',async()=>{
 const w=optimizerWorkflowPlan;if(!w)return;
 if(optimizerExecJob?.state==='uncertain'){
  if(!confirm('Conferir duas vezes o anúncio na Shopee e liberar uma nova prévia apenas para o que falta? Nenhuma publicação será repetida por esta consulta.'))return;
  try{
   const d=await json('/api/shopee/optimizer/execution/reconcile',{method:'POST',
    headers:{'Content-Type':'application/json'},body:JSON.stringify({sku:w.sku,itemId:w.itemId,modelId:w.modelId,recover:true}),
    signal:AbortSignal.timeout(65000)});
   if(d.job?.state==='uncertain'){
    optimizerExecutionJobView(d.job,d.progress,d.issue);
    return optimizerExecNotice(d.message||'Ainda aguardando confirmação Shopee; nenhum envio foi repetido.','warning');
   }
   optimizerExecutionJobView(d.job,d.progress,d.issue);
  }catch(e){return optimizerExecNotice(e.message,'warning');}
 }
 await optimizerExecutionPrepare();
});
// Display-only compact dashboard: all actions reuse the original workflow.
globalThis.OptimizerSkuDashboard?.bind?.({
 openStage:key=>optimizerWorkflowOpen(key),
 openExecution:()=>$('#optimizerShowExecution')?.click?.(),
 openFiscal:()=>setTab('fiscal')
});
function optimizerCell(row,textValue,className=''){
  const td=optimizerMake('td',className,textValue);row.appendChild(td);return td;
}
function optimizerRender(record){
  $('#optimizerAuditPanel').hidden=false;
  $('#optimizerProductTitle').textContent=record.title||'Anúncio Shopee';
  $('#optimizerProductMeta').textContent='Item '+record.itemId+' · SKU '+(record.sku||'com variações')+
    ' · Categoria '+record.categoryId+' · Status '+(record.status||'não informado');
  const sellerUrl='https://seller.shopee.com.br/portal/product/'+encodeURIComponent(record.itemId)+'?pageEntry=product_list';
  $('#optimizerOpenShopee').href=sellerUrl;
  const a=record.attributeAudit||{};
  $('#optimizerAttributesTotal').textContent=String(a.total??'—');
  $('#optimizerRequiredMissing').textContent=String(a.missingMandatory??'—');
  $('#optimizerReviewCount').textContent=String(a.review??'—');
  $('#optimizerImageCount').textContent=String(record.imageCount??'—')+' / 9';
  const media=$('#optimizerProductMedia');media.replaceChildren();
  for(const url of record.imageUrls||[]){
    if(!financeCatalogImage(url))continue;
    const img=optimizerMake('img');img.src=url;img.alt='Imagem atual do anúncio';img.loading='lazy';
    img.referrerPolicy='no-referrer';media.appendChild(img);
  }
  const video=optimizerMake('p','optimizer-video','Vídeo: '+record.videoStatus);
  media.appendChild(video);
  $('#optimizerAuditWarning').textContent=
    (a.note||'Dados de categoria não verificados.')+
    (record.modelWarning?' '+record.modelWarning:'')+
    ' · Conferir EAN/GTIN e dados fiscais na Central do Vendedor; não usar campos não presentes na API como se fossem preenchidos.';
  const steps=$('#optimizerSteps');steps.replaceChildren();
  for(const [index,x] of (record.steps||[]).entries()){
    const div=optimizerMake('div','optimizer-step optimizer-step-'+x.state);
    div.appendChild(optimizerMake('strong','',(index+1)+'. '+x.name));
    const helper=optimizerMake('span','optimizer-tip','?');
    helper.tabIndex=0;
    helper.dataset.help=String(x.reason||'Etapa dependente de validação e revisão.');
    helper.setAttribute('aria-label',helper.dataset.help);
    div.appendChild(helper);
    steps.appendChild(div);
  }
  const body=$('#optimizerAttributesBody');body.replaceChildren();
  const ranks={review:0,missing:1,filled:2};
  const attrs=[...(a.attributes||[])].sort((x,y)=>
    Number(y.mandatory)-Number(x.mandatory)||
    (ranks[x.state]??3)-(ranks[y.state]??3)||optimizerTechLabel(x.name,x.id).localeCompare(optimizerTechLabel(y.name,y.id),'pt-BR'));
  for(const x of attrs){
    const tr=optimizerMake('tr','optimizer-attribute-'+x.state);
    const name=optimizerCell(tr,'','optimizer-attribute-name');
    name.append(optimizerMake('strong','',optimizerTechLabel(x.name,x.id)),optimizerMake('small','',
      'ID '+x.id+(x.mandatory?' · Obrigatório':' · Opcional')+
      ' · Tipo '+(x.inputType??'?')));
    const current=(x.values||[]).map(v=>
      optimizerTechValueLabel(v.name||('Opção '+v.valueId),v.valueId)+(v.unit?' '+v.unit:'')).filter(Boolean).join('; ');
    optimizerCell(tr,current||'Não preenchido','optimizer-attribute-value');
    const status=optimizerCell(tr,'','optimizer-attribute-status');
    const label=x.state==='conditional'?'Condicional à variação/atributo pai':
      x.state==='filled'?'Preenchido, verificar fonte':
      x.state==='review'?'Conferir dado suspeito':
      x.mandatory?'Obrigatório ausente':'Opcional ausente';
    status.appendChild(optimizerMake('span','optimizer-state '+x.state,label));
    for(const problem of x.issues||[])status.appendChild(optimizerMake('small','',problem));
    const examples=(x.options||[]).filter(o=>o.name).slice(0,4).map(o=>
      optimizerTechValueLabel(o.name,o.id)+(o.id?' (ID '+o.id+')':'')).join(' · ');
    optimizerCell(tr,examples||((x.allowedUnits||[]).join(', ')||
      (x.supportSearch?'Consultar opções paginadas pela API':'Valor sujeito a tipo do atributo')),
      'optimizer-attribute-options');
    body.appendChild(tr);
  }
}
async function optimizerRunAudit(itemId,sku,modelId=''){
  if(optimizerBusy){optimizerNextAudit={itemId,sku,modelId};return;}
  optimizerBusy=true;
  $('#optimizerAuditPanel').hidden=true;
  optimizerNotice('Consultando atributos oficiais da categoria deste SKU na Shopee...');
  if(globalThis.__RA_KIT_OPTIMIZATION_HANDOFF?.sku===sku)
   globalThis.RAKitAuditPhase?.('Conferindo ficha tecnica do Item ID '+itemId+' pela API Shopee.');
  try{
    const item=String(itemId||'').trim(),expectedSku=String(sku||'').trim();
    if(!/^[1-9]\d{0,17}$/.test(item)||!expectedSku)
      throw Error('O SKU selecionado não possui anúncio técnico válido. Sincronize o catálogo.');
    // Precificação não depende da leitura dos atributos: prepara mesmo quando
    // a árvore de categoria da Shopee estiver momentaneamente indisponível.
    if(shPriceSelection?.sku!==expectedSku||shPriceSelection?.itemId!==item||
       shPriceSelection?.modelId!==String(modelId||'0')){
      $('#priceMarketAvg').value='';
      optimizerDiscountFinalQuote=null;optimizerDiscountFinalIdentity='';
      optimizerDiscountFinalPreviewData=null;optimizerDiscountFinalPreviewKey='';
      optimizerDiscountFinalSent=false;++optimizerDiscountFinalLoading;
      optimizerDiscountFinalPaint();
    }
    if($('#optimizerSku').value.trim()!==expectedSku)return;
    shPriceSelection={sku:expectedSku,itemId:item,modelId:String(modelId||'0')};
    shPriceSaveSelection(shPriceSelection);
    $('#priceResults').hidden=true;
    $('#optimizerQuickValues').hidden=true;
    $('#optimizerQuickStatus').textContent='Conferindo o custo WeDrop e calculando o preço bruto da SKU '+expectedSku+'...';
    if(globalThis.__RA_KIT_OPTIMIZATION_HANDOFF?.sku===expectedSku){
      $('#optimizerQuickStatus').textContent='Kit WeDrop: conferindo custo dos componentes e calculando o preço bruto...';
      void shPriceLoadDefaults().then(()=>{
       const handoff=globalThis.__RA_KIT_OPTIMIZATION_HANDOFF;
       if(handoff?.sku===expectedSku&&handoff.itemId===item&&
          Number.isFinite(handoff.targetMarginPct)&&handoff.targetMarginPct>=0&&handoff.targetMarginPct<=70){
        $('#priceMargin').value=String(handoff.targetMarginPct);
        $('#optimizerQuickMargin').value=String(handoff.targetMarginPct);
        $('#optimizerQuickMargin').dataset.manualMargin='true';
        shManualMarginChoice=true;
        shPriceRefreshMarginLabel();shQuickSyncSlider();
        if(Number.isFinite(handoff.shipping)&&handoff.shipping>=0)$('#priceFreight').value=String(handoff.shipping);
        if(Number.isFinite(handoff.packing)&&handoff.packing>=0)$('#pricePackaging').value=String(handoff.packing);
       }
       return shPricePrepare();
      });
    }else     void shPriceLoadDefaults().then(()=>{
      const pending=adsReserveRequest;
      if(pending&&pending.sku===expectedSku){
        // Só depois que o usuário buscar e a Shopee confirmar a SKU.
        $('#priceAdsEnabled').checked=true;
        $('#priceAds').value=String(pending.pct);
        shPriceAdsLoadedKey=[shPriceSelection.sku,shPriceSelection.itemId,shPriceSelection.modelId].join('|');
        shPriceAdsRefreshUi();
        adsReserveRequest=null;
        adsReserveAwaitDiscountSku=expectedSku;
        shPriceSetStatus('Reserva Ads de '+pending.pct+'% selecionada para esta SKU. Revise os preços e o desconto preparado; nada foi publicado.','info');
      }
      return shPricePrepare();
    });
    const params=new URLSearchParams({item_id:item,sku:expectedSku,model_id:String(modelId||'')});
    const data=await json('/api/shopee/optimizer/audit?'+params.toString(),{
      signal:AbortSignal.timeout(60000)
    });
    if($('#optimizerSku').value.trim()!==expectedSku)return;
    optimizerRender(data.record);
    void optimizerWorkflowLoad(data.record);
    optimizerNotice('SKU '+expectedSku+' analisado. Ficha técnica consultada pela API. '+
      'Nenhuma imagem, informação, título, preço ou estoque foi alterado.','success');
  }catch(e){
    if($('#optimizerSku').value.trim()===String(sku||'').trim())
      optimizerNotice('Não foi possível validar a ficha técnica do SKU: '+e.message+
        '. O produto permanece intacto.','error');
  }finally{
    optimizerBusy=false;
    if(optimizerNextAudit){
      const next=optimizerNextAudit;optimizerNextAudit=null;
      if($('#optimizerSku').value.trim()===String(next.sku||'').trim())
        void optimizerRunAudit(next.itemId,next.sku,next.modelId);
    }
  }
}

let financeReport=null,financeSkuFilter='sold',financeSkuShown=24;
const financeSkuNode=(tag,cls,txt)=>{
  const el=document.createElement(tag);
  if(cls)el.className=cls;
  if(txt!==undefined&&txt!==null)el.textContent=String(txt);
  return el;
};
function financeCatalogImage(url){
  if(!url)return false;
  try{
    const p=new URL(String(url));
    const host=p.hostname.toLowerCase();
    return p.protocol==='https:'&&(host==='cf.shopee.com.br'||
      host==='down-br.img.susercontent.com'||host==='down-ph.img.susercontent.com'||
      host.endsWith('.susercontent.com'));
  }catch{return false;}
}
// Miniaturas financeiras: fotos somente de item_id / SKU comprovados no
// catálogo autenticado da mesma loja. Não presumir foto pela campanha ou SKU
// ambígua; imagem sem origem confiável mostra placeholder.
function financeCatalogPhotoMaps(report){
 const byItem=new Map(),bySkuIds=new Map();
 for(const p of Array.isArray(report?.catalogProducts)?report.catalogProducts:[]){
  const itemId=String(p?.itemId||'').trim(),sku=String(p?.sku||'').trim();
  if(!/^[1-9]\d{0,17}$/.test(itemId))continue;
  const profile={itemId,sku,name:String(p.name||'Anúncio Shopee'),
   imageUrl:financeCatalogImage(p.imageUrl)?String(p.imageUrl):''};
  if(!byItem.has(itemId)||(!byItem.get(itemId).imageUrl&&profile.imageUrl))
   byItem.set(itemId,profile);
  if(sku){
   if(!bySkuIds.has(sku))bySkuIds.set(sku,new Set());
   bySkuIds.get(sku).add(itemId);
  }
 }
 return {byItem,bySkuIds};
}
function financeMiniPhoto(profile,{title='Imagem do anúncio',missingLabel='Sem imagem confirmada'}={}){
 const wrap=financeSkuNode('span','finance-mini-photo');
 const verified=profile&&financeCatalogImage(profile.imageUrl);
 wrap.title=verified?String(profile.name||title):missingLabel;
 if(verified){
  const img=financeSkuNode('img','finance-mini-img');
  img.src=profile.imageUrl;img.alt=title;img.loading='lazy';img.decoding='async';
  img.referrerPolicy='no-referrer';img.width=42;img.height=42;
  img.addEventListener('error',()=>{
   img.remove();wrap.appendChild(financeSkuNode('span','finance-mini-fallback','▣'));
   wrap.title='Imagem não disponível no momento';
  },{once:true});
  wrap.appendChild(img);
 }else{
  wrap.appendChild(financeSkuNode('span','finance-mini-fallback','▣'));
 }
 return wrap;
}
function financeAuditIdentity(order,maps){
 const container=financeSkuNode('div','finance-audit-identity');
 const pictures=financeSkuNode('span','finance-mini-stack');
 const ids=[...new Set((Array.isArray(order.skuList)?order.skuList:[])
   .concat(order.sku||[]).map(x=>String(x||'').trim()).filter(Boolean))];
 const label=financeSkuNode('div','finance-mini-label');
 label.appendChild(financeSkuNode('strong','',ids.length?ids.join(', '):'SKU não informada'));
 const verified=[],unknown=[];
 for(const sku of ids){
  const matches=maps.bySkuIds.get(sku);
  if(matches?.size===1){
   const profile=maps.byItem.get([...matches][0]);
   if(profile&&!verified.some(x=>x.itemId===profile.itemId)){verified.push(profile);continue;}
  }
  unknown.push(sku);
 }
 for(const item of verified.slice(0,3)){
  pictures.appendChild(financeMiniPhoto(item,{
   title:'Imagem do anúncio '+item.sku+' — '+item.name
  }));
 }
 if(unknown.length||!verified.length)
  pictures.appendChild(financeMiniPhoto(null,{
   missingLabel:unknown.length
    ?'SKU sem anúncio único identificado: '+unknown.join(', ')
    :'Imagem do pedido não identificada no catálogo'
  }));
 if(verified.length>3)pictures.appendChild(financeSkuNode('span','finance-mini-overflow','+'+(verified.length-3)));
 if(ids.length===1&&verified.length===1)
  label.appendChild(financeSkuNode('small','',verified[0].name));
 else if(unknown.length)
  label.appendChild(financeSkuNode('small','','Foto indisponível ou SKU ambígua'));
 container.append(pictures,label);
 return container;
}
function financeAdsPhotos(review,maps){
 const ids=[...new Set((Array.isArray(review.itemIdList)?review.itemIdList:[])
   .map(x=>String(x)).filter(x=>/^[1-9]\d{0,17}$/.test(x)))];
 const outer=financeSkuNode('span','finance-mini-stack');
 for(const id of ids.slice(0,3)){
  const product=maps.byItem.get(id);
  outer.appendChild(financeMiniPhoto(product,{
   title:product?'Produto anunciado: '+product.name:'ID do anúncio: '+id,
   missingLabel:'Imagem não disponível para item '+id
  }));
 }
 const advertisedCount=Math.max(ids.length,Number(review.advertisedItemCount)||0);
 if(advertisedCount>3)outer.appendChild(financeSkuNode('span','finance-mini-overflow','+'+(advertisedCount-3)));
 if(!ids.length)outer.appendChild(financeMiniPhoto(null,{
  missingLabel:'A API Shopee Ads não identificou o produto desta campanha'
 }));
 return outer;
}
function financeAdsBySku(report){
 const sweep=report?.adsSweep;
 return sweep?.status==='verified_campaign_period'
   ?new Map((sweep.skuCosts||[]).map(x=>[String(x.sku),x]))
   :new Map();
}

/** Gráficos com dados de conciliação; Ads diário nunca é fabricado. */
function renderFinanceTrend(report){
 const svg=$('#financeTrendSvg');svg.replaceChildren();
 const rows=Array.isArray(report?.dailySeries)?report.dailySeries.filter(x=>
  /^\d{4}-\d{2}-\d{2}$/.test(String(x.day))&&
  [x.payout,x.costs,x.balanceBeforeAds].every(v=>Number.isFinite(Number(v)))):[];
 const caption=$('#financeTrendNote');
 const label=$('#financePeriodCaption');
 label.textContent=report?.selection?.label||'Período selecionado';
 if(!rows.length){
  caption.textContent='Nenhum pedido concluído e conciliado com data confirmada no período.';
  const noData=document.createElementNS('http://www.w3.org/2000/svg','text');
  noData.setAttribute('x','300');noData.setAttribute('y','110');
  noData.setAttribute('text-anchor','middle');noData.setAttribute('fill','#7991b0');
  noData.setAttribute('font-size','14');noData.textContent='Sem dados diários conciliados';
  svg.append(noData);return;
 }
 const ns='http://www.w3.org/2000/svg';
 const add=(tag,attributes,text)=>{
  const el=document.createElementNS(ns,tag);
  for(const [key,value] of Object.entries(attributes))el.setAttribute(key,String(value));
  if(text!==undefined)el.textContent=String(text);
  svg.append(el);return el;
 };
 const data=rows.slice(-30);
 const values=data.flatMap(x=>[Number(x.payout),Number(x.costs),Number(x.balanceBeforeAds)]);
 const high=Math.max(1,...values,0),low=Math.min(0,...values);
 const top=18,bottom=177,left=59,right=580,domainHigh=high+(high-low)*.08,
  domainLow=low-(high-low)*.08,range=domainHigh-domainLow||1;
 const y=v=>top+(domainHigh-v)/range*(bottom-top),zero=y(0);
 const moneyTick=n=>(n<0?'−':'')+'R$ '+Math.abs(n).toLocaleString('pt-BR',{maximumFractionDigits:0});
 for(let tick=0;tick<=4;tick++){
  const v=domainLow+(domainHigh-domainLow)*tick/4,yp=y(v);
  add('line',{x1:left,x2:right,y1:yp,y2:yp,stroke:'#e7eff8','stroke-width':1});
  add('text',{x:left-8,y:yp+4,'text-anchor':'end',fill:'#7b8ba2','font-size':10},moneyTick(v));
 }
 add('line',{x1:left,x2:right,y1:zero,y2:zero,stroke:'#b0c5df','stroke-width':1.4});
 const width=(right-left)/data.length,barWidth=Math.max(2.1,Math.min(12,width/5)),gap=Math.max(.6,barWidth*.18);
 const colors=['#25b77a','#ff943a','#f05155'],fields=['payout','costs','balanceBeforeAds'];
 data.forEach((point,index)=>{
  const center=left+width*(index+.5);
  fields.forEach((field,j)=>{
   const value=Number(point[field]),yp=y(value),height=Math.max(Math.abs(yp-zero),value===0?0:1);
   const x=center+(j-1)*(barWidth+gap)-barWidth/2;
   if(height<=0)return;
   const bar=add('rect',{x,y:Math.min(yp,zero),width:barWidth,height,rx:1.2,fill:colors[j]});
   const title=document.createElementNS(ns,'title');
   title.textContent=point.day+' · '+({payout:'Repasse',costs:'WeDrop',balanceBeforeAds:'Saldo antes Ads'})[field]+': '+wdMoney(value);
   bar.append(title);
  });
  const every=Math.max(1,Math.ceil(data.length/9));
  if(index%every===0||index===data.length-1){
   const date=point.day.slice(8,10)+'/'+point.day.slice(5,7);
   add('text',{x:center,y:198,'text-anchor':'middle',fill:'#7189a7','font-size':10},date);
  }
 });
 caption.textContent='Por data de criação dos pedidos COMPLETED, apenas repasses e custos confirmados. '+
  (report.complete?'Período conferido.':'Há pedidos pendentes; a evolução pode estar incompleta.')+
  ' Ads não são distribuídos artificialmente por dia.';
}
function renderFinanceDistribution(report){
 const donut=$('#financeAdsDonut'),center=$('#financeDonutCenter'),legend=$('#financeDonutLegend');
 legend.replaceChildren();donut.style.background='conic-gradient(#e6edf6 0 100%)';
 const sw=report?.adsSweep||{},verified=sw.status==='verified_campaign_period';
 const total=Number(sw.spendTotal);
 if(!verified||!Number.isFinite(total)||total<0){
  center.textContent='—';donut.setAttribute('aria-label','Ads não verificados');
  legend.textContent='Ads indisponíveis: não presumir gasto zero.';return;
 }
 center.textContent=wdMoney(total);
 const parts=[
  {label:'Com vínculo a SKU vendido',value:Number(sw.spendAllocatedToSoldSku),color:'#9363df'},
  {label:'Sem conversão direta',value:Number(sw.spendWithoutDirectConversions),color:'#ff9337'},
  {label:'Sem vínculo seguro',value:Number(sw.spendUnassigned),color:'#438cf3'}
 ];
 if(parts.some(x=>!Number.isFinite(x.value)||x.value<0)){
  center.textContent='—';donut.setAttribute('aria-label','Composição Ads inconsistente');
  legend.textContent='Não foi possível validar todas as categorias de gastos Ads.';return;
 }
 const assigned=parts.reduce((n,x)=>n+x.value,0),gap=Math.max(0,total-assigned);
 if(gap>.015)parts.push({label:'Não classificado',value:gap,color:'#a7b5c8'});
 const pct=x=>total>0?100*x/total:0;
 let offset=0;const slices=[];
 for(const part of parts){
  const start=offset;offset=Math.min(100,offset+pct(part.value));
  if(part.value>0)slices.push(part.color+' '+start.toFixed(3)+'% '+offset.toFixed(3)+'%');
  const item=financeSkuNode('div','finance-donut-legend-row');
  const name=financeSkuNode('span','finance-donut-category');
  const dot=financeSkuNode('span','finance-legend-dot');dot.style.background=part.color;
  name.append(dot,financeSkuNode('span','',part.label));
  item.append(name,financeSkuNode('strong','',wdMoney(part.value)));
  const percent=financeSkuNode('small','',pct(part.value).toLocaleString('pt-BR',{maximumFractionDigits:1})+'%');
  item.append(percent);legend.append(item);
 }
 donut.style.background=total>0&&slices.length?'conic-gradient('+slices.join(',')+')':'conic-gradient(#e6edf6 0 100%)';
 donut.setAttribute('aria-label','Total Ads '+wdMoney(total)+'. '+parts.map(x=>x.label+' '+wdMoney(x.value)).join('; '));
}
function financeCsvSafe(value){
 if(typeof value==='number'&&Number.isFinite(value))
   return '"'+value.toLocaleString('pt-BR',{useGrouping:false,maximumFractionDigits:2})+'"';
 const raw=String(value??'');
 const guarded=/^[\s\uFEFF]*[=+@\-\t\r]/.test(raw)?"'"+raw:raw;
 return '"'+guarded.replace(/"/g,'""')+'"';
}
function financeExportRows(report){
 const p=report.selection?.label||'Período sem identificação';
 const t=report.totals||{},sw=report.adsSweep||{},adsReady=sw.status==='verified_campaign_period';
 const items=[
  ['Relatório Financeiro Shopee · Rede Achados BR'],
  ['Período',p],['Gerado em',new Date().toLocaleString('pt-BR',{timeZone:'America/Sao_Paulo'})],
  ['Fonte repasse','API Shopee Payment'],['Fonte custos','WeDrop conciliado'],
  ['Pedidos conferidos',t.verified],['Pedidos elegíveis',t.eligible],
  ['Repasse Shopee',t.received],['Custo WeDrop',t.supplierCost],
  ['Saldo antes Ads',t.balanceBeforeAds],
  ['Ads total',adsReady?sw.spendTotal:'Não verificado'],
  ['Ads com vínculo seguro',adsReady?sw.spendAllocatedToSoldSku:'Não verificado'],
  ['Ads sem conversão',adsReady?sw.spendWithoutDirectConversions:'Não verificado'],
  ['Ads sem vínculo seguro',adsReady?sw.spendUnassigned:'Não verificado'],
  ['Resultado após Ads',adsReady&&Number.isFinite(Number(t.balanceBeforeAds))?
   Math.round((Number(t.balanceBeforeAds)-Number(sw.spendTotal))*100)/100:'Não verificado'],
  ['Lucro líquido fiscal','Em apuração'],[],
  ['SKU','Produto','Unidades','Repasse Shopee','Custo WeDrop','Ads SKU','Resultado após Ads','Situação']
 ];
 const skuAds=financeAdsBySku(report),safeZero=adsReady&&Number(sw.spendUnassigned)===0;
 for(const x of financeSkuEntries(report)){
  const s=x.sale,ad=skuAds.get(x.sku),operating=s?(ad?.afterAds??(safeZero?s.balanceBeforeAds:null)):null;
  items.push([x.sku,x.title,s?.quantity??'',s?.payout??'',s?.cost??'',ad?.expense??'',
   operating??'Não atribuído',s?'Venda concluída':x.pending?'Pendente':'Sem venda']);
 }
 items.push([],['Observação','Resultado operacional antes de tributos e despesas externas; não é lucro fiscal final.'],
  ['Observação','Campanhas não são atribuídas a pedidos individuais por presunção.']);
 return '\ufeff'+items.map(row=>row.map(financeCsvSafe).join(';')).join('\r\n');
}
$('#financeExportCsv')?.addEventListener?.('click',()=>{
 if(!financeReport)return;
 const start=String(financeReport.selection?.label||'periodo').replace(/[^a-zA-Z0-9]+/g,'-').slice(0,45);
 const blob=new Blob([financeExportRows(financeReport)],{type:'text/csv;charset=utf-8;'});
 const url=URL.createObjectURL(blob),a=document.createElement('a');
 a.href=url;a.download='rede-achados-shopee-financeiro-'+start+'.csv';
 document.body.append(a);a.click();a.remove();
 setTimeout(()=>URL.revokeObjectURL(url),1000);
});

function renderFinanceAdsScan(report){
 const sweep=report.adsSweep||{};
 const good=sweep.status==='verified_campaign_period';
 $('#financeSkuAdsKpi').textContent=good?wdMoney(sweep.spendAllocatedToSoldSku):'—';
 $('#financeAdsTotal').textContent=good?wdMoney(sweep.spendTotal):'—';
 $('#financeAdsNoConversion').textContent=good?wdMoney(sweep.spendWithoutDirectConversions):'—';
 const total=Number(report.totals?.balanceBeforeAds);
 const valid=good&&Number.isFinite(total)&&Number.isFinite(Number(sweep.spendTotal));
 const result=valid?Math.round((total-Number(sweep.spendTotal))*100)/100:null;
 const net=$('#financeSkuNetKpi');
 net.textContent=result===null?'—':wdMoney(result);
 net.classList.toggle('negative',result!==null&&result<0);
 net.classList.toggle('positive',result!==null&&result>=0);
 $('#financeResultCompleteness').textContent=result===null
  ?'Sem dados completos de Ads e repasses'
  :report.complete?'Após todos os Ads; antes de tributos'
    :'Resultado parcial: ainda há pedidos não conciliados';
 $('#financeTaxNetKpi').textContent='Em apuração';
 $('#financeAdsScanBadge').textContent=good?'Ads conferidos':'Ads não verificados';
 $('#financeAdsScanBadge').dataset.state=good?'ready':'error';
 $('#financeAdsScanText').textContent=good
   ?'Campanhas verificadas: '+wdNum(sweep.campaignCount)+'. '+
    'Ads com venda direta atribuída e custo vinculado a SKU vendido: '+
    wdMoney(sweep.spendAllocatedToSoldSku)+'. '+
    'Ads sem venda direta atribuída: '+wdMoney(sweep.spendWithoutDirectConversions)+
    ' (despesa da loja, fora de vendas individuais). '+
    'Ads com conversão mas não atribuíveis com segurança: '+
    wdMoney(sweep.spendUnassigned)+'. '+
    'Os valores Ads representam gasto de campanhas no período e não identificam o pedido individual.'
   :'Não foi possível consultar e vincular os Ads: '+(sweep.error||'dados indisponíveis')+
    '. Não use custo de publicidade igual a zero. Verifique as permissões Ads e tente novamente.';
 $('#financeAdsExceptionCount').textContent=good?wdNum((sweep.review||[]).length):'0';
 const list=$('#financeAdsExceptionList');list.replaceChildren();
 if(good){
  const photos=financeCatalogPhotoMaps(report);
  for(const x of (sweep.review||[]).slice(0,120)){
   const row=financeSkuNode('div','finance-ads-exception-row');
   const identity=financeSkuNode('div','finance-ads-exception-identity');
   identity.appendChild(financeAdsPhotos(x,photos));
   const info=financeSkuNode('div','finance-ads-exception-info');
   info.appendChild(financeSkuNode('strong','',
     'Campanha '+x.campaignId+' · '+wdMoney(x.expense)));
   const itemIds=Array.isArray(x.itemIdList)?x.itemIdList:[];
   const photosWithNames=itemIds.map(id=>photos.byItem.get(String(id))?.name).filter(Boolean);
   const note=photosWithNames.length?photosWithNames.slice(0,2).join(' · '):
     'Produto não identificado com segurança';
   info.appendChild(financeSkuNode('small','',note));
   identity.appendChild(info);row.appendChild(identity);
   row.appendChild(financeSkuNode('span','finance-ads-exception-reason',x.situation));
   list.appendChild(row);
  }
  if(!(sweep.review||[]).length)list.appendChild(
    financeSkuNode('p','hint','Nenhuma campanha pendente nesta varredura.'));
 }
}
function financeSkuEntries(report){
  const catalog=Array.isArray(report.catalogProducts)?report.catalogProducts:[];
  const bySku=new Map();
  for(const item of catalog){
    const sku=String(item.sku||'').trim();
    if(!sku)continue;
    const prev=bySku.get(sku);
    if(prev){prev.repeatedSku=true;continue;}
    bySku.set(sku,{sku,title:String(item.name||'')||'Produto Shopee',
      imageUrl:String(item.imageUrl||''),itemId:String(item.itemId||''),
      repeatedSku:false});
  }
  const sold=new Map((report.skuSummary||[]).map(x=>[String(x.sku),x]));
  const adsBySku=financeAdsBySku(report);
  const pending=new Set();
  for(const order of report.rows||[]){
    if(order.ready)continue;
    for(const sku of order.skuList||[])if(sku)pending.add(String(sku));
    if(order.sku)pending.add(String(order.sku));
  }
  const wanted=new Set([...sold.keys(),...pending]); // NUNCA exibir os 693 anúncios por padrão.
  return [...wanted].map(sku=>{
    const base=bySku.get(sku)||{
      sku,title:'Produto do pedido (não localizado no catálogo)',
      imageUrl:'',itemId:'',repeatedSku:false
    };
    return {...base,sale:sold.get(sku)||null,ads:adsBySku.get(sku)||null,
      pending:pending.has(sku)};
  }).sort((a,b)=>Number(Boolean(b.sale))-Number(Boolean(a.sale))||
    Number(b.pending)-Number(a.pending)||
    a.title.localeCompare(b.title,'pt-BR'));
}
function financeSkuFiltered(items){
  const q=$('#financeSkuSearch').value.trim().toLocaleLowerCase('pt-BR');
  return items.filter(x=>{
    if(q&&!x.title.toLocaleLowerCase('pt-BR').includes(q)&&
      !x.sku.toLocaleLowerCase('pt-BR').includes(q))return false;
    if(financeSkuFilter==='sold')return Boolean(x.sale);
    if(financeSkuFilter==='pending')return Boolean(x.pending||x.repeatedSku);
    return Boolean(x.sale||x.pending);
  });
}
function financeSkuDetail(row,source){
  const expanded=row.nextElementSibling;
  if(expanded?.classList.contains('finance-expanded-row')){
    expanded.remove();return;
  }
  document.querySelectorAll('#financeSkuBody .finance-expanded-row').forEach(el=>el.remove());
  const tr=financeSkuNode('tr','finance-expanded-row');
  const td=financeSkuNode('td');td.colSpan=8;
  const box=financeSkuNode('div','finance-expanded-content');
  const sale=source.sale,ads=source.ads;
  box.appendChild(financeSkuNode('strong','','Memória do cálculo · '+source.sku));
  if(sale){
    const count=(financeReport.rows||[]).filter(x=>x.ready&&x.sku===source.sku);
    const pieces=[
      'Pedidos concluídos: '+count.map(x=>x.orderSn).join(', '),
      'Repasse líquido Shopee: '+wdMoney(sale.payout),
      'Custo WeDrop × unidades: '+wdMoney(sale.cost)+' · '+wdNum(sale.quantity)+' un.',
      'Saldo antes Ads: '+wdMoney(sale.balanceBeforeAds),
      ads?'Ads de campanha vinculada: '+wdMoney(ads.expense):
        'Ads deste SKU: '+(financeReport.adsSweep?.status==='verified_campaign_period'
          ?'sem atribuição individual confirmada':'consulta indisponível'),
      'Resultado após Ads: '+(ads?wdMoney(ads.afterAds):
        financeReport.adsSweep?.spendUnassigned===0&&
        financeReport.adsSweep?.status==='verified_campaign_period'
          ?wdMoney(sale.balanceBeforeAds):'pendente de atribuição'),
      'Lucro líquido fiscal final depende de tributos e despesas externas.'
    ];
    for(const line of pieces)box.appendChild(financeSkuNode('p','',line));
    const open=financeSkuNode('button','secondary','Auditar pedidos e taxas');
    open.type='button';open.onclick=()=>{
      $('#financeOrdersDetails').open=true;
      $('#financeOrdersDetails').scrollIntoView?.({behavior:'smooth',block:'start'});
    };
    box.appendChild(open);
  }else{
    const details=(financeReport.rows||[]).filter(x=>!x.ready&&
      (x.skuList||[]).includes(source.sku));
    for(const x of details)box.appendChild(financeSkuNode('p','',
      (x.orderSn||'Pedido')+': '+(x.reason||'Pedido ainda sem conciliação financeira')));
  }
  td.appendChild(box);tr.appendChild(td);row.after(tr);
}
function renderFinanceSkuList(){
  const body=$('#financeSkuBody');body.replaceChildren();
  if(!financeReport){
    $('#financeSkuCount').textContent='—';
    $('#financeSkuPageInfo').textContent='';
    $('#financeSkuMore').hidden=true;return;
  }
  const entries=financeSkuEntries(financeReport);
  const filtered=financeSkuFiltered(entries);
  const visible=filtered.slice(0,financeSkuShown);
  const col=(tr,name,value,cls='')=>{
    const td=financeSkuNode('td',cls);
    td.dataset.label=name;
    if(value!==undefined&&value!==null)td.textContent=String(value);
    tr.appendChild(td);return td;
  };
  const adsReady=financeReport.adsSweep?.status==='verified_campaign_period';
  const safeZero=adsReady&&Number(financeReport.adsSweep?.spendUnassigned||0)===0;
  for(const x of visible){
    const sale=x.sale,hasSale=Boolean(sale);
    const operating=hasSale?(x.ads?.afterAds??(safeZero?sale.balanceBeforeAds:null)):null;
    const tr=financeSkuNode('tr',operating!==null?(operating<0?'finance-negative':'finance-positive'):
      x.pending?'finance-pending':'finance-no-sale');
    const productCell=col(tr,'Produto',null,'finance-product-cell');
    const product=financeSkuNode('div','finance-product-identity');
    if(financeCatalogImage(x.imageUrl)){
      const img=financeSkuNode('img','finance-thumbnail');
      img.src=x.imageUrl;img.loading='lazy';img.decoding='async';img.alt='';
      img.referrerPolicy='no-referrer';product.appendChild(img);
    }else product.appendChild(financeSkuNode('span','finance-thumbnail finance-thumbnail-empty','▣'));
    const title=financeSkuNode('div','finance-product-text');
    title.appendChild(financeSkuNode('strong','',x.title));
    if(x.repeatedSku)title.appendChild(financeSkuNode('small','finance-duplicate',
      'Mesmo SKU em mais de um anúncio; conferir'));
    product.appendChild(title);productCell.appendChild(product);
    const skucell=col(tr,'SKU / Qtd.',null,'finance-sku-code');
    skucell.appendChild(financeSkuNode('strong','',x.sku));
    skucell.appendChild(financeSkuNode('small','finance-sku-quantity',
      hasSale?wdNum(sale.quantity)+' unidade(s)':'Pendente'));
    col(tr,'Repasse Shopee',hasSale?wdMoney(sale.payout):'—','finance-number');
    col(tr,'Custo WeDrop',hasSale?wdMoney(sale.cost):'—','finance-number');
    col(tr,'Ads vinculado',hasSale&&x.ads?wdMoney(x.ads.expense):
      hasSale&&safeZero?wdMoney(0):'—','finance-number');
    const profit=col(tr,'Resultado após Ads',operating===null?'—':wdMoney(operating),
      'finance-amount '+(operating===null?'muted':operating<0?'negative':'positive'));
    profit.title='Resultado operacional do SKU após Ads identificados, antes de tributos e despesas externas.';
    const label=hasSale?(x.ads?'Venda + Ads':safeZero?'Venda sem Ads atribuído':'Ads em revisão'):
      'Pendente';
    col(tr,'Situação',label,'finance-status-cell '+
      (hasSale?'verified':x.pending?'pending':'neutral'));
    const actions=col(tr,'Ação',null,'finance-actions-cell');
    const btn=financeSkuNode('button','finance-row-action','Ver detalhes');
    btn.type='button';btn.setAttribute('aria-label','Ver cálculo do SKU '+x.sku);
    btn.onclick=()=>financeSkuDetail(tr,x);actions.appendChild(btn);
    body.appendChild(tr);
  }
  if(!visible.length){
    const row=financeSkuNode('tr'),cell=financeSkuNode('td','finance-empty',
      financeSkuFilter==='sold'?'Nenhuma venda concluída verificada no período selecionado.':
      'Nenhum resultado deste filtro no período.');cell.colSpan=8;
    row.appendChild(cell);body.appendChild(row);
  }
  $('#financeSkuCount').textContent=wdNum(filtered.length)+' SKU(s) no filtro';
  $('#financeSkuPageInfo').textContent=wdNum(visible.length)+' de '+
    wdNum(filtered.length)+' SKUs exibidos · somente vendas e pendências do período.';
  $('#financeSkuMore').hidden=visible.length>=filtered.length;
  const count={
    all:entries.length,sold:entries.filter(x=>x.sale).length,
    pending:entries.filter(x=>x.pending||x.repeatedSku).length
  };
  for(const btn of document.querySelectorAll('[data-finance-filter]')){
    const kind=btn.dataset.financeFilter;
    const selected=kind===financeSkuFilter;
    btn.classList.toggle('active',selected);
    btn.setAttribute('aria-pressed',String(selected));
    btn.textContent=({all:'Vendas e pendências',sold:'Vendas verificadas',
      pending:'Pendências'})[kind]+' ('+wdNum(count[kind])+')';
  }
}
document.querySelectorAll('[data-finance-filter]').forEach(btn=>{
  btn.onclick=()=>{financeSkuFilter=btn.dataset.financeFilter;financeSkuShown=24;renderFinanceSkuList();};
});
$('#financeSkuSearch').oninput=()=>{financeSkuShown=24;$('#financeGlobalSearch').value=$('#financeSkuSearch').value;renderFinanceSkuList();};
$('#financeGlobalSearch').oninput=()=>{financeSkuShown=24;$('#financeSkuSearch').value=$('#financeGlobalSearch').value;renderFinanceSkuList();};
$('#financeSkuMore').onclick=()=>{financeSkuShown+=24;renderFinanceSkuList();};
function financeSelectionChanged(){
  const selected=$('#shopeeFinanceDays').value;
  $('#financeCustomDates').hidden=selected!=='custom';
  financeReport=null;financeSkuShown=24;renderFinanceSkuList();
  $('#shopeeFinanceData').hidden=true;
  $('#financeExportCsv').disabled=true;
  renderFinanceTrend(null);renderFinanceDistribution(null);
  $('#financeVerifiedCaption').textContent='Aguardando consulta';
  for(const id of ['#shopeeFinanceVerified','#shopeeFinancePayout','#shopeeFinanceCosts',
    '#shopeeFinanceBalance','#financeSkuAdsKpi','#financeAdsNoConversion',
    '#financeAdsTotal','#financeSkuNetKpi'])$(id).textContent='—';
  $('#financeSkuNetKpi').classList.remove('negative','positive');
  $('#financeResultCompleteness').textContent='Atualize para o novo período';
  $('#financePeriodCaption').textContent=selected==='custom'
    ?'Personalizado: selecione as duas datas e clique Atualizar financeiro.'
    :'Últimos '+selected+' dias civis no Brasil; clique Atualizar financeiro para consultar.';
  wdSetNotice('#shopeeFinanceStatus',
    'O período mudou. Clique em Atualizar financeiro para não misturar vendas e Ads de outras datas.','info');
}
$('#shopeeFinanceDays').onchange=financeSelectionChanged;
$('#financePeriodStart').onchange=financeSelectionChanged;
$('#financePeriodEnd').onchange=financeSelectionChanged;

let shopeeFinanceBusy=false;
$('#shopeeFinanceLoad').onclick=async()=>{
  if(shopeeFinanceBusy)return;
  shopeeFinanceBusy=true;
  const button=$('#shopeeFinanceLoad');
  button.disabled=true;button.textContent='Consultando repasses reais...';
  // Esconder números da consulta anterior ao trocar período: nunca exibir como atual.
  financeReport=null;financeSkuBalances.clear();renderFinanceSkuList();
  $('#financeExportCsv').disabled=true;
  renderFinanceTrend(null);renderFinanceDistribution(null);
  $('#financeVerifiedCaption').textContent='Consultando pedidos...';
  for(const id of ['#shopeeFinanceVerified','#shopeeFinancePayout',
    '#shopeeFinanceCosts','#shopeeFinanceBalance','#financeSkuAdsKpi',
    '#financeAdsTotal','#financeAdsNoConversion','#financeSkuNetKpi'])
    $(id).textContent='—';
  $('#financeSkuNetKpi').classList.remove('negative','positive');
  $('#financeResultCompleteness').textContent='Aguardando conciliação';
  $('#shopeeFinanceData').hidden=true;
  wdSetNotice('#shopeeFinanceStatus',
    'Buscando pedidos concluídos e detalhes de pagamento da Shopee. Não estamos presumindo taxas ou despesas.','info');
  try{
    const selected=$('#shopeeFinanceDays').value;
    const params=new URLSearchParams();
    if(selected==='custom'){
      const from=$('#financePeriodStart').value,to=$('#financePeriodEnd').value;
      if(!from||!to)throw Error('Selecione as datas inicial e final.');
      params.set('start',from);params.set('end',to);
    }else params.set('days',selected);
    const report=await json('/api/shopee/finance/orders?'+params.toString(),{
      signal:AbortSignal.timeout(180000)
    });
    const t=report.totals||{};
    financeReport=report;financeSkuShown=24;
    renderFinanceTrend(report);renderFinanceDistribution(report);
    $('#financeExportCsv').disabled=false;
    $('#financeVerifiedCaption').textContent=(t.eligible>0&&t.verified===t.eligible&&report.complete?'100% dos elegíveis':'Conciliação parcial');
    $('#financePeriodCaption').title='Exibindo apenas pedidos criados em '+
      (report.selection?.label||'período selecionado')+
      ' e já concluídos. Vendas de outros períodos não aparecem na lista.';
    $('#financeResultsSubheading').textContent=
      'Pedidos COMPLETED criados no intervalo escolhido, com repasse confirmado. '+
      'Pendências financeiras têm filtro separado.';
    renderFinanceAdsScan(report);
    $('#shopeeFinanceData').hidden=false;
    renderFinanceSkuList();
    $('#shopeeFinanceVerified').textContent=wdNum(t.verified)+' de '+wdNum(t.eligible);
    $('#shopeeFinancePayout').textContent=wdMoney(t.received);
    $('#shopeeFinanceCosts').textContent=wdMoney(t.supplierCost);
    $('#shopeeFinanceBalance').textContent=wdMoney(t.balanceBeforeAds);
    const body=$('#shopeeFinanceOrders');body.replaceChildren();
    const orderPhotos=financeCatalogPhotoMaps(report);
    const feeText=entry=>{
      const f=entry.feeBreakdown||{};
      const parts=[
        ['Comissão',f.commission],['Serviço',f.service],['Transação',f.transaction]
      ].filter(([,v])=>v!==null&&v!==undefined);
      return parts.length?parts.map(([label,n])=>label+': '+wdMoney(n)).join(' · '):'—';
    };
    for(const x of report.rows||[]){
      const tr=document.createElement('tr');
      if(!x.ready)tr.className='wedrop-missing';
      const data=[
        x.orderSn||'—',
        x.sku||((x.skuList||[]).join(', ')||'—'),
        wdMoney(x.payout),
        feeText(x),
        x.feeBreakdown?.actualShipping===null||x.feeBreakdown?.actualShipping===undefined
          ?'—':wdMoney(x.feeBreakdown.actualShipping),
        wdMoney(x.totalCost),
        wdMoney(x.balanceBeforeAds),
        x.marginBeforeAds===null||x.marginBeforeAds===undefined?'—':
          Number(x.marginBeforeAds).toLocaleString('pt-BR')+'%',
        '— (Ads não conciliados)',
        x.reason||'Sem informações suficientes'
      ];
      for(const [index,value] of data.entries()){
        const td=document.createElement('td');
        if(index===1){
         td.className='finance-audit-sku-cell';
         td.appendChild(financeAuditIdentity(x,orderPhotos));
        }else td.textContent=String(value);
        tr.appendChild(td);
      }
      body.appendChild(tr);
    }
    if(!report.rows?.length){
      const tr=document.createElement('tr'),td=document.createElement('td');
      td.colSpan=10;td.textContent='Nenhum pedido concluído encontrado no período.';
      tr.appendChild(td);body.appendChild(tr);
    }
    financeSkuBalances=new Map((report.skuSummary||[]).map(x=>[x.sku,x]));
    $('#shopeeFinanceWarning').textContent=report.warning+' '+
      (report.paymentAccessWarning?'Acesso Payment: '+report.paymentAccessWarning+'. ':'')+
      (t.incompletePeriod?'Período incompleto: há pedidos ainda não consultados. ':'')+
      (t.incomplete?'Pedidos sem custo/repasse confirmado: '+wdNum(t.incomplete)+'. ':'')+
      (report.skippedCompleted?'Pedidos concluídos não examinados nesta consulta: '+
        wdNum(report.skippedCompleted)+'. ':'')+
      'As taxas e o frete estão no repasse, não devem ser descontados novamente. '+
      'Os Ads só entram no resultado do SKU quando existe venda atribuída e vínculo de campanha seguro; '+
      'despesa de Ads sem conversão permanece contabilizada separadamente na loja. '+
      'Resultado após Ads é parcial, ainda sem tributos e custos externos.';
    wdSetNotice('#shopeeFinanceStatus',
      'Consulta concluída: '+wdNum(t.verified)+' de '+wdNum(t.eligible)+
      ' pedidos concluídos com custo e repasse verificados. '+
      'Varredura de Ads '+(report.adsSweep?.status==='verified_campaign_period'
        ?'concluída':'pendente')+'. Máximo de 100 pedidos concluídos por consulta.'+
      ' Prejuízos são mostrados em vermelho. O resultado após Ads não inclui tributos.',
      report.complete?'success':'warning');
    // Atualiza a coluna por SKU apenas para vendas realmente verificadas.
    await refreshWeDropCoverage();
  }catch(error){
    $('#financeExportCsv').disabled=true;renderFinanceTrend(null);renderFinanceDistribution(null);
    financeReport=null;financeSkuBalances.clear();
    $('#shopeeFinanceData').hidden=true;renderFinanceSkuList();
    wdSetNotice('#shopeeFinanceStatus','Não foi possível verificar os dados financeiros: '+
      error.message+'. Lucro líquido e margem permanecem indisponíveis.','error');
  }finally{
    shopeeFinanceBusy=false;
    button.disabled=false;button.textContent='Atualizar financeiro';
  }
};



// Monitor de envios: todos os indicadores derivam das consultas autenticadas da Shopee.
let monitorSeenAlerts=null,monitorChecking=false,monitorCurrentPending=[],monitorCurrentAlerts=[];
let monitorCurrentFilter='all',monitorShowAll=false,monitorLastHealth='never',monitorDataLoaded=false;
function monitorDate(epoch){
  const n=Number(epoch);
  return Number.isFinite(n)&&n>1000000000
    ?new Date(n*1000).toLocaleString('pt-BR',{timeZone:'America/Sao_Paulo',dateStyle:'short',timeStyle:'short'})
    :'Não informado pela Shopee';
}
function monitorIso(value){
  if(!value)return 'Ainda não registrado';
  const date=new Date(value);
  return !Number.isNaN(date.getTime())
    ?date.toLocaleString('pt-BR',{timeZone:'America/Sao_Paulo'})
    :'Data indisponível';
}
function setMonitorText(id,value){const node=$(id);if(node)node.textContent=String(value);}
function monitorRiskLabel(risk){
  return ({overdue:'PRAZO VENCIDO',critical:'Menos de 2 horas',urgent:'Menos de 6 horas',
    today:'Menos de 24 horas',soon:'Menos de 48 horas',unknown:'Conferir prazo',
    normal:'No prazo'})[risk]||'Conferir prazo';
}
function monitorRiskFilter(order,filter){
  if(filter==='critical')return order.risk==='critical'||order.risk==='overdue';
  if(filter==='today')return ['overdue','critical','urgent','today'].includes(order.risk);
  if(filter==='soon')return order.risk==='soon';
  return true;
}
function monitorSetActiveIndicator(id,state){
  const node=$(id);if(node)node.dataset.state=state;
}
function monitorBrowserState(){
  const supported=typeof Notification!=='undefined';
  const permission=supported?Notification.permission:'unsupported';
  const state=permission==='granted'?'ok':permission==='denied'?'warn':'neutral';
  monitorSetActiveIndicator('#monitorStateBrowser',state);
  setMonitorText('#monitorBrowserInfo',permission==='granted'?'Permissão concedida (navegador aberto)':
    permission==='denied'?'Notificações bloqueadas':
    !supported?'Navegador sem suporte':'Permissão não concedida');
  setMonitorText('#browserAlertsLabel',permission==='granted'?'Avisos do navegador ativados':
    permission==='denied'?'Avisos bloqueados':'Ativar aviso no navegador');
}
function monitorShowEmpty(title,detail){
  $('#monitorEmpty').hidden=false;
  setMonitorText('#monitorEmptyTitle',title);
  setMonitorText('#monitorEmptyDetail',detail);
}
function renderPending(orders=monitorCurrentPending){
  const body=$('#monitorPendingBody');if(!body)return;
  body.replaceChildren();$('#monitorEmpty').hidden=true;
  if(!monitorDataLoaded){
    for(const id of ['#monitorFilterAll','#monitorFilterToday','#monitorFilterCritical','#monitorFilterSoon'])
      setMonitorText(id,'—');
    setMonitorText('#monitorFilterSummary','Aguardando uma consulta válida dos pedidos.');
    monitorShowEmpty('Pedidos não confirmados','É necessária uma sincronização bem-sucedida antes de mostrar contagens.');
    return;
  }
  const total=orders.length,urgent=orders.filter(x=>monitorRiskFilter(x,'critical')).length;
  const today=orders.filter(x=>monitorRiskFilter(x,'today')).length;
  const soon=orders.filter(x=>monitorRiskFilter(x,'soon')).length;
  for(const [id,value] of [['#monitorFilterAll',total],['#monitorFilterToday',today],
    ['#monitorFilterCritical',urgent],['#monitorFilterSoon',soon]])setMonitorText(id,value);
  document.querySelectorAll('[data-monitor-filter]').forEach(button=>{
    const selected=button.dataset.monitorFilter===monitorCurrentFilter;
    button.classList.toggle('is-active',selected);
    button.setAttribute('aria-pressed',String(selected));
  });
  const matching=orders.filter(x=>monitorRiskFilter(x,monitorCurrentFilter));
  const tab=({all:'Todos',today:'Hoje',critical:'Críticos',soon:'Próximos'})[monitorCurrentFilter]||'Todos';
  setMonitorText('#monitorFilterSummary',tab+' · '+matching.length+' de '+total+' pedido(s) pendente(s) na última sincronização.');
  if(!matching.length){
    const isAll=monitorCurrentFilter==='all',confirmed=monitorLastHealth==='healthy';
    monitorShowEmpty(isAll&&confirmed?'Nenhum pedido pendente de envio':'Nenhum pedido nesta categoria',
      !confirmed?'O monitor não confirmou uma sincronização recente. Confira o status acima.':
      isAll?'Nenhuma postagem pendente na última sincronização.':'Não há pedidos com essa prioridade na última consulta.');
    return;
  }
  for(const x of matching){
    const tr=document.createElement('tr');
    if(['overdue','critical'].includes(x.risk))tr.className='monitor-danger-row';
    const columns=[x.order_sn,x.order_status,monitorDate(x.ship_by_date),monitorRiskLabel(x.risk)];
    for(const value of columns){
      const td=document.createElement('td');td.textContent=String(value??'—');tr.appendChild(td);
    }
    const cell=document.createElement('td'),btn=document.createElement('button');
    btn.type='button';btn.className='mini secondary monitor-order-button';btn.textContent='Ver pedidos';
    btn.title='Abrir a página de pedidos do Shopee Manager para consultar o pedido '+String(x.order_sn||'');
    btn.onclick=()=>setTab('orders');
    cell.append(btn);tr.append(cell);body.appendChild(tr);
  }
}
function renderAlerts(items=monitorCurrentAlerts){
  const container=$('#monitorAlerts');container.replaceChildren();
  const unread=items.filter(a=>!a.read_at).length;
  const showButton=$('#monitorShowAllAlerts');
  if(showButton)showButton.textContent=monitorShowAll?'Mostrar recentes ←':'Ver todos →';
  if(!items.length){
    const empty=document.createElement('div');empty.className='monitor-alert-empty';
    empty.textContent=monitorLastHealth==='healthy'?'Nenhum aviso registrado. Tudo em dia na última consulta.':
      'Nenhum aviso carregado. Verifique o estado do monitor.';
    container.append(empty);return;
  }
  const displayed=monitorShowAll?items:items.slice(0,2);
  for(const a of displayed){
    const article=document.createElement('article');
    article.className='order-alert '+String(a.severity||'info')+(a.read_at?' read':'');
    const title=document.createElement('strong');title.textContent=a.title||'Aviso Shopee';
    const message=document.createElement('p');message.textContent=a.message||'';
    const meta=document.createElement('small');
    meta.textContent=monitorIso(a.created_at)+(a.read_at?' · Lido':' · Não lido');
    article.append(title,message,meta);
    if(!a.read_at){
      const btn=document.createElement('button');btn.className='mini secondary';
      btn.textContent='Marcar como lido';btn.type='button';
      btn.onclick=async()=>{
        btn.disabled=true;
        try{await json('/api/shopee/monitor/read',{
          method:'POST',headers:{'Content-Type':'application/json'},
          body:JSON.stringify({alert_key:a.alert_key})
        });await refreshMonitor();}
        catch(e){btn.disabled=false;setMonitorText('#monitorStatusDetail','Falha ao marcar aviso: '+e.message);}
      };
      article.append(btn);
    }
    container.append(article);
  }
  if(!monitorShowAll&&items.length>2){
    const summary=document.createElement('p');summary.className='monitor-alert-more';
    summary.textContent='Mais '+(items.length-2)+' aviso(s) no histórico. Selecione Ver todos.';
    container.append(summary);
  }
}
function monitorSyncStatus({state,reason,enabled,working,minutes,error,successAt}){
  const banner=$('#monitorStatus');
  if(!banner)return;
  const healthy=state==='healthy'&&enabled===true;
  monitorLastHealth=healthy?'healthy':state==='healthy'?'stale':state||'never';
  banner.dataset.health=monitorLastHealth;
  const headline=working?'Verificação de pedidos em andamento':
    healthy?'Monitor sincronizado recentemente':
    state==='stale'?'Monitor com sincronização atrasada':
    state==='failed'?'Monitor com falha na última consulta':
    !enabled?'Monitor indisponível':'Aguardando primeira sincronização';
  setMonitorText('#monitorHeadline',headline);
  setMonitorText('#monitorStatusDetail',
    String(reason||'Aguardando informações do monitor.')+
    ' Consultas previstas a cada '+(minutes||5)+' min enquanto o servidor estiver ativo.'+
    (error?' Último erro: '+error:''));
  setMonitorText('#monitorSystemHealth',healthy?'Sistema operacional':
    !enabled?'Monitor desativado':'Status requer atenção');
  setMonitorText('#monitorHealthDetail',healthy?'Última sincronização confirmada':
    successAt?'Último sucesso em '+monitorIso(successAt):'Sem sincronização confirmada');
  monitorSetActiveIndicator('#monitorStateRunning',healthy?'ok':enabled?'warn':'neutral');
  setMonitorText('#monitorRunningInfo',working?'Consulta em andamento':healthy?'Ativo e sincronizado':
    !enabled?'Serviço indisponível':'Verifique a sincronização');
  monitorSetActiveIndicator('#monitorStateInterval',healthy?'ok':enabled?'warn':'neutral');
  setMonitorText('#monitorIntervalLabel','Consultas a cada '+(minutes||5)+' min');
  setMonitorText('#monitorIntervalInfo',enabled?'Programadas com servidor ativo':'Monitor não habilitado');
  monitorSetActiveIndicator('#monitorStatePanel',healthy?'ok':enabled?'warn':'neutral');
  setMonitorText('#monitorPanelInfo',enabled?'Alertas exibidos nesta página':'Aguardando serviço');
  monitorBrowserState();
}
async function refreshMonitor(){
  if(!$('#monitorStatus'))return;
  try{
    const d=await json('/api/shopee/monitor');
    const status=d.status||{},health=status.health||{};
    const pending=Array.isArray(d.pending)?d.pending:[],alerts=Array.isArray(d.alerts)?d.alerts:[];
    monitorCurrentPending=pending;monitorCurrentAlerts=alerts;monitorDataLoaded=true;
    const countCritical=pending.filter(x=>monitorRiskFilter(x,'critical')).length;
    setMonitorText('#monitorPendingCount',pending.length);
    setMonitorText('#monitorCriticalCount',countCritical);
    setMonitorText('#monitorUnreadCount',d.unread??alerts.filter(x=>!x.read_at).length);
    setMonitorText('#monitorLastRun',status.lastSuccessAt?monitorIso(status.lastSuccessAt):'Aguardando');
    setMonitorText('#monitorBadge',(d.unread||0)?'('+(d.unread||0)+')':'');
    setMonitorText('#monitorLastAttempt',monitorIso(status.lastAttemptAt));
    setMonitorText('#monitorLastSuccessAudit',monitorIso(status.lastSuccessAt));
    setMonitorText('#monitorScannedCount',Number.isFinite(Number(status.scannedInLastRun))?status.scannedInLastRun:'—');
    setMonitorText('#monitorLastNewAlerts',Number.isFinite(Number(status.newAlertsLastRun))?status.newAlertsLastRun:'—');
    setMonitorText('#monitorLastError',status.lastError||health.reason||'Nenhuma falha informada no último registro.');
    monitorSyncStatus({state:health.state||'never',reason:health.reason,enabled:status.enabled===true,
      working:status.working,minutes:status.intervalMinutes,error:status.lastError,
      successAt:status.lastSuccessAt});
    renderPending(pending);renderAlerts(alerts);
    const keys=new Set(alerts.map(x=>x.alert_key));
    if(monitorSeenAlerts!==null&&typeof Notification!=='undefined'&&Notification.permission==='granted'){
      for(const a of alerts){
        if(!monitorSeenAlerts.has(a.alert_key)&&!a.read_at){
          try{new Notification('Shopee: '+a.title,{body:a.message,tag:a.alert_key});}catch{}
        }
      }
    }
    monitorSeenAlerts=keys;
  }catch(e){
    monitorLastHealth='failed';monitorDataLoaded=false;
    const banner=$('#monitorStatus');if(banner)banner.dataset.health='failed';
    setMonitorText('#monitorHeadline','Monitor indisponível');
    setMonitorText('#monitorStatusDetail','Não foi possível consultar pedidos e alertas: '+e.message+'. Utilize Verificar pedidos agora.');
    setMonitorText('#monitorSystemHealth','Falha de consulta');
    setMonitorText('#monitorHealthDetail','Dados atuais não confirmados');
    for(const id of ['#monitorPendingCount','#monitorCriticalCount','#monitorUnreadCount',
      '#monitorLastRun','#monitorFilterAll','#monitorFilterToday','#monitorFilterCritical','#monitorFilterSoon'])
      setMonitorText(id,'—');
    setMonitorText('#monitorBadge','');
    setMonitorText('#monitorFilterSummary','Falha ao consultar o monitor. Nenhuma contagem atual foi confirmada.');
    const body=$('#monitorPendingBody');if(body)body.replaceChildren();
    monitorShowEmpty('Consulta indisponível','Tente verificar novamente. O sistema não presumiu que não existem pendências.');
    monitorCurrentPending=[];monitorCurrentAlerts=[];
    const alerts=$('#monitorAlerts');if(alerts)alerts.textContent='Avisos indisponíveis durante a falha de consulta.';
    for(const id of ['#monitorStateRunning','#monitorStateInterval','#monitorStatePanel'])monitorSetActiveIndicator(id,'warn');
    monitorBrowserState();
  }
}
for(const button of document.querySelectorAll('[data-monitor-filter]')){
  button.addEventListener('click',()=>{monitorCurrentFilter=button.dataset.monitorFilter;renderPending();});
}
for(const button of document.querySelectorAll('[data-monitor-shortcut]')){
  button.addEventListener('click',()=>{
    const target=button.dataset.monitorShortcut;
    if(target==='notifications'){
      monitorShowAll=true;renderAlerts();$('#monitorAlerts')?.scrollIntoView?.({behavior:'smooth',block:'nearest'});
    }else if(target==='history'){
      $('#monitorHistory').open=true;$('#monitorHistory')?.scrollIntoView?.({behavior:'smooth',block:'nearest'});
    }else{
      monitorCurrentFilter=target;renderPending();
      $('#monitorPendingBody')?.scrollIntoView?.({behavior:'smooth',block:'nearest'});
    }
  });
}
$('#monitorShowAllAlerts')?.addEventListener?.('click',()=>{
  monitorShowAll=!monitorShowAll;renderAlerts();
});
$('#checkOrdersBtn').onclick=async()=>{
  if(monitorChecking)return;
  monitorChecking=true;
  const button=$('#checkOrdersBtn');button.disabled=true;setMonitorText('#checkOrdersLabel','Verificando...');
  setMonitorText('#monitorHeadline','Verificação manual iniciada');
  setMonitorText('#monitorStatusDetail','Consultando pedidos e prazos oficiais da Shopee. Aguarde.');
  try{
    const result=await json('/api/shopee/monitor/check-now',{method:'POST',signal:AbortSignal.timeout(120000)});
    setMonitorText('#monitorStatusDetail',result.busy?'Já existe uma verificação em andamento.':
      'Consulta concluída: '+result.scanned+' pedidos analisados e '+result.newAlerts+' novo(s) aviso(s).');
  }catch(e){setMonitorText('#monitorStatusDetail','Falha ao verificar pedidos: '+e.message+'. Tente novamente.');}
  finally{monitorChecking=false;button.disabled=false;setMonitorText('#checkOrdersLabel','Verificar pedidos agora');await refreshMonitor();}
};
$('#enableBrowserAlertsBtn').onclick=async()=>{
  const button=$('#enableBrowserAlertsBtn');
  if(typeof Notification==='undefined'){
    setMonitorText('#browserAlertsLabel','Navegador sem suporte');monitorBrowserState();return;
  }
  try{await Notification.requestPermission();}
  catch{setMonitorText('#browserAlertsLabel','Não foi possível solicitar permissão');}
  monitorBrowserState();
};
if(typeof setTimeout==='function')setTimeout(()=>refreshMonitor(),1500);
if(typeof setInterval==='function')setInterval(()=>refreshMonitor(),60000);

// Shopee: mesmo SKU da auditoria -> preço bruto -> plano de desconto salvo.
// A publicação na Shopee exige prévia assinada e confirmação específica em Descontos preparados.
let shPriceSelection=null,shPriceSettingsLoaded=false,shPriceSettingsPromise=null;
let shPriceSupplierQuote=null,shPricePreviewSerial=0;
let shPriceCurrentQuote=null,shPricePrepareBusy=false,shPricePrepareAgain=false;
let shPriceAdsLoadedKey='';
let shDiscountQuote=null;
const shPriceSelectionKey='shopee-optimizer-active-sku-v1142';
function shPriceSaveSelection(x){
  try{sessionStorage.setItem(shPriceSelectionKey,JSON.stringify(x));}catch{}
}
function shPriceRestoredSelection(){
  try{
    const p=JSON.parse(sessionStorage.getItem(shPriceSelectionKey)||'null');
    if(p&&/^[1-9]\d{0,17}$/.test(String(p.itemId))&&
       /^\d{1,18}$/.test(String(p.modelId))&&
       String(p.sku||'').trim().length>0&&String(p.sku).length<=120)
      return {itemId:String(p.itemId),modelId:String(p.modelId),sku:String(p.sku)};
  }catch{}
  return null;
}
function shPriceSetStatus(message,state='info'){
  const e=$('#priceStatus');e.textContent=message;e.dataset.state=state;
}
function shPriceFillSettings(c){
  const fields={
    marginPct:'#priceMargin',minMarginPct:'#priceMinMargin',
    discountPct:'#priceDiscount',taxPct:'#priceTax',flashPct:'#priceFlash',
    couponPct:'#priceCoupon',shipping:'#priceFreight',
    packing:'#pricePackaging',sellerType:'#priceSellerType'
  };
  for(const [key,selector] of Object.entries(fields))
    if(c[key]!==undefined)$(selector).value=c[key];
  $('#priceHighVolume').checked=c.highVolumeCpf===true;
  for(let i=0;i<4;i++){
    $('#priceRate'+i).value=Number(c.commissionRates?.[i]??[20,14,14,14][i]);
    $('#priceFee'+i).value=Number(c.fixedFees?.[i]??[4.5,16,20,26][i]);
  }
  shPriceRefreshMarginLabel();
  shQuickSyncSlider();
}
function shPriceReadSettings(){
  const number=id=>Number($(id).value);
  return {
    marginPct:number('#priceMargin'),minMarginPct:number('#priceMinMargin'),
    discountPct:number('#priceDiscount'),taxPct:number('#priceTax'),
    flashPct:number('#priceFlash'),couponPct:number('#priceCoupon'),
    adsPct:$('#priceAdsEnabled').checked?number('#priceAds'):0,shipping:number('#priceFreight'),
    packing:number('#pricePackaging'),sellerType:$('#priceSellerType').value,
    highVolumeCpf:$('#priceHighVolume').checked,
    commissionRates:[0,1,2,3].map(i=>number('#priceRate'+i)),
    fixedFees:[0,1,2,3].map(i=>number('#priceFee'+i))
  };
}
function shPriceAdsRefreshUi(){
 const on=$('#priceAdsEnabled').checked;
 const box=$('#pricingAdsReserveBox');
 box?.classList?.toggle('ads-selected',on);
 const pct=$('#priceAds');
 pct.disabled=!on;
 pct.required=on;
 const rate=Number(pct.value);
 const help=$('#priceAdsHelp');
 if(help)help.textContent=on
   ?'Reserva de '+(Number.isFinite(rate)?rate.toLocaleString('pt-BR'):'—')+
     '% do preço final estimado por venda. Esse valor entra como custo na simulação e reduz a margem antes de gerar o plano.'
   :'Desmarcado: não há reserva Ads no preço desta SKU. Outros anúncios não são afetados.';
 const preview=$('#priceAdsPreview');
 if(preview)preview.textContent=on&&shPriceCurrentQuote?.adsBudgetEnabled===true
   ?'Reserva estimada por venda: '+shPriceMoney(shPriceCurrentQuote.breakdown?.ads)+
     ' · percentual '+shPricePercent(shPriceCurrentQuote.adsBudgetPct)
   :on?'Defina o percentual e recalcule para salvar esta SKU na lista de Ads.'
     :'Nenhuma reserva Ads está prevista neste plano.';
}
async function shPriceAdsRestoreSelection(selected){
 const key=[selected.sku,selected.itemId,selected.modelId].join('|');
 if(shPriceAdsLoadedKey===key)return;
 const params=new URLSearchParams({sku:selected.sku,itemId:selected.itemId,modelId:selected.modelId});
 const d=await json('/api/shopee/optimizer/pricing/selection?'+params,
   {signal:AbortSignal.timeout(22000)});
 if(!shPriceSelection||[shPriceSelection.sku,shPriceSelection.itemId,shPriceSelection.modelId].join('|')!==key)return false;
 const enabled=d.adsBudgetEnabled===true;
 $('#priceAdsEnabled').checked=enabled;
 $('#priceAds').value=enabled?String(d.adsBudgetPct||0):'0';
 shPriceAdsLoadedKey=key;
 shPriceAdsRefreshUi();
 return true;
}
$('#priceAdsEnabled')?.addEventListener('change',()=>{
 // Uma escolha explícita do usuário nunca pode ser sobrescrita pela
 // restauração assíncrona de um plano anterior da mesma SKU.
 if(shPriceSelection)shPriceAdsLoadedKey=[shPriceSelection.sku,shPriceSelection.itemId,shPriceSelection.modelId].join('|');
 shPriceAdsRefreshUi();
 if($('#priceAdsEnabled').checked&&!(Number($('#priceAds').value)>0)){
  shPriceSetStatus('Informe o percentual de reserva para Ads desta SKU (acima de 0%).','warning');
  $('#priceAds').focus();return;
 }
 if(shPriceSelection)void shPricePrepare();
});
function shPriceRefreshMarginLabel(){
  const value=$('#priceMargin').value+'%';
  $('#priceMarginLabel').textContent=value;
  const readout=$('#pricingMarginValue');if(readout)readout.textContent=value;
  const summary=$('#pricingSummaryTarget');if(summary)summary.textContent=value;
}
function pricingShowSelection(selection){
  const sku=$('#pricingSummarySku');
  const inherited=$('#pricingInheritedBadge');
  if(sku)sku.textContent=selection?.sku||'—';
  if(inherited)inherited.classList.toggle('pricing-no-selection',!selection);
}
function pricingResetQuote(){
  for(const id of ['#priceGross','#pricePromoPct','#priceFinal','#priceProfit',
    '#priceMarginActual','#pricingSummaryCost']){
    const node=$(id);if(node)node.textContent='—';
  }
  $('#priceBreakdown')?.replaceChildren?.();
  $('#priceCostSource').textContent='';
  $('#priceMarketState').textContent='';
  $('#priceResults').hidden=false;
  pricingShowSelection(shPriceSelection);
  shPriceAdsRefreshUi();
}
for(const [id,change] of [['#pricingMarginPlus',1],['#pricingMarginMinus',-1]]){
  $(id)?.addEventListener?.('click',()=>{
    const slider=$('#priceMargin');const n=Number(slider.value||0);
    const next=Math.max(Number(slider.min||0),Math.min(Number(slider.max||70),n+change));
    if(next===n)return;
    slider.value=String(next);slider.dispatchEvent(new Event('input',{bubbles:true}));
  });
}
function shQuickSyncSlider(){
  const v=$('#priceMargin').value;
  $('#optimizerQuickMargin').value=v;
  $('#optimizerQuickMarginLabel').textContent=v+'%';
}
function shQuickSetStatus(message,state='info'){
  const e=$('#optimizerQuickStatus');e.textContent=message;e.dataset.state=state;
}
async function shPriceLoadDefaults(){
  if(shPriceSettingsLoaded)return;
  if(shPriceSettingsPromise)return shPriceSettingsPromise;
  shPriceSettingsPromise=(async()=>{
    try{
      const d=await json('/api/shopee/optimizer/pricing/settings',
        {signal:AbortSignal.timeout(24000)});
      shPriceFillSettings(d.settings||{});
      shPriceSettingsLoaded=true;
    }catch(e){shPriceSetStatus('Não foi possível carregar a precificação: '+e.message,'error');}
    finally{shPriceSettingsPromise=null;}
  })();
  return shPriceSettingsPromise;
}
function shPriceMoney(n){
  return Number(n||0).toLocaleString('pt-BR',{style:'currency',currency:'BRL'});
}
// Minha Promoção mostra este valor SEM cupom. Não confundir com a
// simulação conservadora do checkout caso o comprador aplique o cupom.
function shPriceVisiblePromotion(q){
 const saved=Number(q?.marketplaceDisplayPrice);
 if(q?.marketplaceDisplayPrice!==undefined&&Number.isFinite(saved)&&saved>0)return saved;
 const gross=Number(q?.grossPrice),pct=Number(q?.discountPct);
 return Number.isFinite(gross)&&gross>0&&Number.isFinite(pct)?
  Math.round(gross*(1-pct/100)*100)/100:0;
}
function shPricePercent(n){return Number(n||0).toLocaleString('pt-BR',
  {minimumFractionDigits:1,maximumFractionDigits:2})+'%';}
function shPriceBreakdown(q){
  const b=q.breakdown||{},rows=[
    ['Custo WeDrop',b.unitCost],['Frete pago pela loja',b.shipping],
    ['Embalagem',b.packing],['Comissão Shopee',b.commission],
    ['Taxa fixa',b.fixedFee],['Extra CPF',b.cpfExtra],
    ['Imposto',b.tax],['Oferta relâmpago',b.flash],['ADS',b.ads],
    ['Desconto no anúncio',b.campaignDiscount],['Cupom da loja',b.couponDiscount]
  ];
  const el=$('#priceBreakdown');el.replaceChildren();
  for(const [title,value] of rows){
    const line=optimizerMake('div','sh-price-breakdown-row');
    line.append(optimizerMake('span','',title),optimizerMake('strong','',shPriceMoney(value)));
    el.appendChild(line);
  }
}
function shPriceMarketResearchRender(q){
 const research=q?.marketResearch||null;
 const badge=$('#pricingMarketResearchBadge'),msg=$('#pricingMarketResearchStatus');
 const offers=$('#pricingMarketResearchOffers');
 if(!badge||!msg||!offers)return;
 offers.replaceChildren();
 const sample=Array.isArray(research?.sample)?research.sample.slice(0,5):[];
 const searchLink=$('#pricingMarketSearchShopee');
 const searchTerm=String(research?.searchTerms||'').trim();
 if(searchLink){
   searchLink.hidden=!searchTerm;
   if(searchTerm)searchLink.href='https://shopee.com.br/search?keyword='+encodeURIComponent(searchTerm);
 }
 const verified=research?.verified===true&&research?.sourceType==='researched_affiliate_offers';
 const top=$('#pricingMarketTopStatus');
 if(top){
  top.dataset.state=verified?'success':'warning';
  top.textContent=verified?
   'Mercado pesquisado: '+research.count+' ofertas equivalentes · referência '+shPriceMoney(research.reference)+
    ' · desconto calculado '+shPricePercent(q.discountPct):
   (sample.length?
     'Pesquisa parcial: '+sample.length+' anúncio(s) verificável(is); sem média validada. ':
     'Sem pesquisa de mercado validada: desconto base não pesquisado. ')+String(research?.message||'');
 }
 badge.textContent=verified?research.count+' anúncios comparados':
  sample.length?sample.length+' referência(s) parcial(is)':'Pesquisa sem comparáveis';
 badge.dataset.state=verified?'success':'warning';
 const avg=$('#pricingResearchAverage'),suggested=$('#pricingResearchSuggested'),margin=$('#pricingResearchMargin');
 if(avg)avg.textContent=verified?shPriceMoney(research.reference):'—';
 if(suggested)suggested.textContent=verified&&q.status==='COMPETITIVO'?shPriceMoney(q.customerPrice):
   verified&&q.status==='MERCADO_ABAIXO_DO_PISO'?'Sem preço viável':
   q.customerPrice>0?shPriceMoney(q.customerPrice)+' (provisório)':'—';
 if(margin)margin.textContent=verified&&q.status==='COMPETITIVO'?shPricePercent(q.netMarginPct):
   verified&&q.status==='MERCADO_ABAIXO_DO_PISO'?'Margem mínima protegida':'—';
 msg.textContent=verified?
  'Média aritmética de '+research.count+' anúncios de lojas diferentes: '+shPriceMoney(research.reference)+
  '. '+(q.status==='MERCADO_ABAIXO_DO_PISO'?
   'Preço médio inferior ao piso de margem mínima: NÃO reduzir abaixo do limite seguro.':
   'Preço sugerido com margem líquida de '+shPricePercent(q.netMarginPct)+' (mínima: '+shPricePercent(q.minMarginPct)+'). '+
     (q.netMarginPct+0.01<q.targetMarginPct?
      'A margem desejada de '+shPricePercent(q.targetMarginPct)+' não foi atingida.':'A margem desejada foi preservada.'))+
  ' Pesquisa em '+(research.researchedAt?new Date(research.researchedAt).toLocaleString('pt-BR'):'data não disponível')+'.':
  String(research?.message||'Nenhum preço comparável foi validado.')+
  ' São necessários de 2 a 5 anúncios comparáveis, em lojas distintas, usando a API Shopee Afiliados. '+
  (sample.length?'As referências exibidas são PARCIAIS e não definem desconto. ':'')+
  'O preço provisório deriva do custo e das taxas, não da média de concorrência.';
 for(const offer of sample){
  const shop=String(offer.shopId||''),item=String(offer.itemId||'');
  if(!/^\d{1,18}$/.test(shop)||!/^\d{1,18}$/.test(item))continue;
  const link=document.createElement('a');link.href='https://shopee.com.br/product/'+shop+'/'+item;
  link.target='_blank';link.rel='noopener noreferrer';link.className='pricing-market-offer';
  link.title='Abrir na Shopee · '+(offer.title||'Anúncio')+' · consultado em '+
   (offer.checkedAt?new Date(offer.checkedAt).toLocaleString('pt-BR'):'data desconhecida');
  const label=document.createElement('span');label.textContent=offer.title||'Anúncio semelhante';
  const price=document.createElement('strong');price.textContent=shPriceMoney(offer.price);
  link.append(label,price);offers.append(link);
 }
}
function shPriceRender(q){
  const isSupplierPreview=q.source==='wedrop_only';
  if(isSupplierPreview&&shPriceSelection)return;
  shPriceCurrentQuote=q;
  if(!isSupplierPreview)optimizerDiscountFinalSavedQuote(q);
  // O plano do anúncio preserva a reserva selecionada; nunca usa Ads de outra SKU.
  $('#priceAdsEnabled').checked=q.adsBudgetEnabled===true;
  $('#priceAds').value=String(q.adsBudgetEnabled===true?Number(q.adsBudgetPct||0):0);
  shPriceAdsRefreshUi();
  shQuickSyncSlider();
  $('#optimizerQuickValues').hidden=false;
  if(q.source==='kit_wedrop_components'){
   $('#priceFreight').value=String(q.pricingSettings?.shipping??0);
   $('#pricePackaging').value=String(q.pricingSettings?.packing??0);
  }
  $('#optimizerQuickGross').textContent=shPriceMoney(q.grossPrice);
  $('#optimizerQuickDiscount').textContent=shPricePercent(q.discountPct);
  const marketVerified=q.marketResearch?.verified===true;
  $('#optimizerQuickDiscountLabel').textContent=q.marginOverride?'Desconto base · margem personalizada':marketVerified?'Desconto baseado no mercado':'Desconto base · sem pesquisa';
  $('#pricePromoLabel').textContent=q.marginOverride?'Desconto mantido · margem manual':marketVerified?'Desconto competitivo calculado':'Desconto base · não pesquisado';
  $('#optimizerQuickFinal').textContent=shPriceMoney(shPriceVisiblePromotion(q));
  $('#optimizerQuickAfterCoupon').textContent='Com cupom de '+shPricePercent(q.couponPct)+
    ', se utilizado: '+shPriceMoney(q.customerPrice);
  $('#optimizerQuickProfit').textContent=shPriceMoney(q.netProfit);
  $('#optimizerQuickMarginPercent').textContent=shPricePercent(q.netMarginPct)+' de margem';
  const centsMarginNotice=q.marginOverride===true&&
    Number(q.netMarginPct)>Number(q.targetMarginPct)+0.3?
    ' · Meta mínima '+shPricePercent(q.targetMarginPct)+'; margem real '+
    shPricePercent(q.netMarginPct)+' porque os dois preços (Shopee e cupom) devem terminar em 0/9.':'';
  shQuickSetStatus((q.source==='kit_wedrop_components'?
    'KIT '+q.kitSku+' · SKU Principal '+q.mainSku+' · '+q.componentSkus.length+' SKUs · custo total dos produtos ':
    'SKU '+q.sku+' · Custo WeDrop ')+shPriceMoney(q.unitCost)+centsMarginNotice+
    (isSupplierPreview
      ?'. Simulação disponível. Aguarde a confirmação do anúncio Shopee para salvar na etapa Descontos.'
      :q.marketResearch?.verified===true
       ?'. Pesquisa de mercado validada e desconto preparado para o final da otimização; nada foi publicado.'
       :'. Preço provisório salvo, mas desconto NÃO liberado sem 2 anúncios comparáveis.' ),
    isSupplierPreview||q.marketResearch?.verified===true?'success':'warning');
  $('#priceResults').hidden=false;
  $('#priceGross').textContent=shPriceMoney(q.grossPrice);
  $('#pricePromoPct').textContent=shPricePercent(q.discountPct);
  $('#priceFinal').textContent=shPriceMoney(shPriceVisiblePromotion(q));
  $('#priceAfterCoupon').textContent='Com cupom de '+shPricePercent(q.couponPct)+
    ', se utilizado: '+shPriceMoney(q.customerPrice);
  $('#priceProfit').textContent=shPriceMoney(q.netProfit);
  $('#priceMarginActual').textContent=shPricePercent(q.netMarginPct);
  $('#pricingSummaryCost').textContent=shPriceMoney(q.unitCost);
  pricingShowSelection({sku:q.sku});
  shPriceRefreshMarginLabel();
  $('#priceCostSource').textContent=(q.source==='kit_wedrop_components'?
    'KIT '+q.kitSku+' · SKU Principal '+q.mainSku+' · '+q.componentSkus.join(' + '):
    'SKU '+q.sku+' · WeDrop '+q.supplierSku)+
    ' · Custo de aquisição '+shPriceMoney(q.unitCost)+
    ' · Piso com margem mínima: '+shPriceMoney(q.priceFloor);
  $('#priceMarketState').textContent=q.notice;
  shPriceMarketResearchRender(q);
  shPriceBreakdown(q);
  shPriceSetStatus(isSupplierPreview
    ?'Prévia WeDrop sem vínculo e sem pesquisa de concorrentes.'
    :q.marketResearch?.verified===true
      ?'Preço calculado com ofertas semelhantes; confira a pesquisa na memória de cálculo.'
      :'Preço simulado com desconto padrão, sem pesquisa de concorrentes validada.',
    q.marketResearch?.verified===true?'success':'warning');
  $('#priceSaveInfo').textContent=isSupplierPreview
    ?'Prévia da WeDrop, sem anúncio vinculado. Margem mínima '+shPricePercent(q.minMarginPct)+'.'
    :'Padrões e plano atualizados '+fmtDate(q.calculatedAt)+
      '. Margem mínima '+shPricePercent(q.minMarginPct)+'.';
}
async function shPricePreviewSupplierSku(sku,lookupSerial=null){
  if(!sku||sku.length>120)return;
  const serial=++shPricePreviewSerial;
  try{
    // Carregar preferências paralelamente, sem bloquear o custo e o cálculo
    // pela chamada anterior de /pricing/settings (podia levar até 24s).
    void shPriceLoadDefaults();
    if(lookupSerial!==null&&lookupSerial!==optimizerSkuLookupSerial)return;
    const market=$('#priceMarketAvg').value.trim();
    const override=shManualMarginChoice||$('#optimizerQuickMargin')?.dataset?.manualMargin==='true';
    const result=await json('/api/shopee/optimizer/pricing/supplier-preview',{
      method:'POST',headers:{'Content-Type':'application/json'},
      body:JSON.stringify({sku,
        ...(shPriceSettingsLoaded?{settings:shPriceReadSettings()}:{}),
        ...(override?{marginPct:Number($('#optimizerQuickMargin').value)}:{}),
        marketAverage:market===''?null:Number(market),
        marginOverride:override}),signal:AbortSignal.timeout(18000)
    });
    if(serial!==shPricePreviewSerial||$('#optimizerSku').value.trim()!==sku)return;
    $('#optimizerSupplierResult').hidden=false;
    if(!result.found){
      $('#optimizerSupplierResult').textContent='WeDrop · SKU '+sku+
        ' sem custo disponível no catálogo salvo. Confira a importação do fornecedor.';
      return;
    }
    // Custo sempre aparece, inclusive quando não houver solução matemática
    // para o preço. Falha no preço NÃO equivale a custo WeDrop indisponível.
    const cost=Number(result.unitCost??result.quote?.unitCost);
    $('#optimizerSupplierResult').textContent='✓ WeDrop · '+sku+' · Custo '+
      shPriceMoney(cost)+' · Catálogo do fornecedor confirmado.'+
      (result.pricingError?' Preço pendente: '+result.pricingError:'');
    shPriceSupplierQuote=result.quote||null;
    if(result.quote&&!shPriceSelection)shPriceRender(result.quote);
    else if(!result.quote&&!shPriceSelection){
      pricingShowSelection({sku});
      $('#pricingSummaryCost').textContent=shPriceMoney(cost);
      shQuickSetStatus('Custo WeDrop '+shPriceMoney(cost)+
        ' confirmado. Não foi possível concluir a simulação: '+result.pricingError,'warning');
      shPriceSetStatus('Custo identificado; ajuste a precificação antes de preparar desconto.','warning');
    }
  }catch(e){
    if(serial===shPricePreviewSerial&&$('#optimizerSku').value.trim()===sku){
      $('#optimizerSupplierResult').hidden=false;
      $('#optimizerSupplierResult').textContent='Consulta do custo WeDrop falhou: '+e.message+
        '. A identificação do anúncio Shopee segue independente.';
    }
  }
}
async function shPricePrepare({silent=false}={}){
  if(!shPriceSelection){
    pricingShowSelection(null);
    pricingResetQuote();
    if(!silent)shPriceSetStatus('Localize primeiro uma SKU na Otimização.');
    return;
  }
  if(shPricePrepareBusy){shPricePrepareAgain=true;return;}
  shPricePrepareBusy=true;
  const btn=$('#priceRecalculate');btn.disabled=true;
  const selected={...shPriceSelection};
  const marginKey=[selected.sku,selected.itemId,selected.modelId].join('|');
  if(shManualMarginSkuKey!==marginKey){
    shManualMarginChoice=$('#optimizerQuickMargin')?.dataset?.manualMargin==='true';
    shManualMarginSkuKey=marginKey;
  }
  pricingShowSelection(selected);
  if(!silent)shPriceSetStatus('Conferindo o custo WeDrop salvo e preparando o desconto da SKU...');
  shQuickSetStatus('Calculando preço bruto e desconto da SKU '+selected.sku+'...');
  try{
    const restored=await shPriceAdsRestoreSelection(selected);
    if(restored===false)return;
    if($('#priceAdsEnabled').checked&&!(Number($('#priceAds').value)>0))
      throw Error('Informe um adicional Ads superior a 0% para esta SKU.');
    const market=$('#priceMarketAvg').value.trim();
    const manualOverride=shManualMarginChoice||$('#optimizerQuickMargin')?.dataset?.manualMargin==='true';
    const requestedMargin=Number($('#optimizerQuickMargin').value);
    const d=await json('/api/shopee/optimizer/pricing/prepare',{
      method:'POST',headers:{'Content-Type':'application/json'},
      body:JSON.stringify({...selected,settings:shPriceReadSettings(),
        adsBudgetEnabled:$('#priceAdsEnabled').checked,
        adsBudgetPct:$('#priceAdsEnabled').checked?Number($('#priceAds').value):0,
        marketAverage:market===''?null:Number(market),
        marginOverride:manualOverride}),
      // Até cinco buscas sequenciais de ofertas podem levar mais de 35 segundos.
      signal:AbortSignal.timeout(75000)
    });
    if(shPriceSelection?.sku!==selected.sku||
      shPriceSelection?.itemId!==selected.itemId||
      shPriceSelection?.modelId!==selected.modelId)return;
    if(manualOverride&&Number(d.quote?.netMarginPct)+0.01<requestedMargin)
      throw Error('O motor retornou margem inferior aos '+requestedMargin+'% escolhidos. Cotação rejeitada; nenhum preço foi publicado.');
    shPriceRender(d.quote);
    if(adsReserveAwaitDiscountSku===selected.sku){
      adsReserveAwaitDiscountSku=null;
      // Após a busca manual da SKU e o cálculo concluído, abrir Descontos preparados.
      // Apenas prévia: nunca clicar em Executar nem publicar preço automaticamente.
      setTab('discounts');
    }
  }catch(e){
    if(shPriceSelection?.sku===selected.sku&&shPriceSelection?.itemId===selected.itemId){
      $('#optimizerQuickValues').hidden=true;shPriceCurrentQuote=null;
      pricingResetQuote();
      shPriceSetStatus('SKU '+selected.sku+': '+e.message,'error');
      shQuickSetStatus('SKU '+selected.sku+': '+e.message,'error');
    }
    $('#priceSaveInfo').textContent='Sem custo WeDrop confirmado, não é permitido sugerir preço ou desconto.';
  }finally{
    shPricePrepareBusy=false;btn.disabled=false;
    if(shPricePrepareAgain){shPricePrepareAgain=false;void shPricePrepare({silent:false});}
  }
}
let shQuickMarginTimer=null;
let shManualMarginChoice=false;
let shManualMarginSkuKey='';
for(const [selector,delta] of [['#optimizerMarginPlus',1],['#optimizerMarginMinus',-1]]){
 $(selector)?.addEventListener?.('click',()=>{
  const slider=$('#optimizerQuickMargin');
  const next=Math.max(Number(slider.min||0),Math.min(Number(slider.max||70),Number(slider.value||0)+delta));
  if(next===Number(slider.value))return;
  slider.value=String(next);
  slider.dispatchEvent(new Event('input',{bubbles:true}));
 });
}
$('#optimizerQuickMargin')?.addEventListener?.('input',()=>{
  $('#optimizerQuickMargin').dataset.manualMargin='true';
  shManualMarginChoice=true;
  if(shPriceSelection)shManualMarginSkuKey=[shPriceSelection.sku,shPriceSelection.itemId,shPriceSelection.modelId].join('|');
  $('#priceMargin').value=$('#optimizerQuickMargin').value;
  shPriceRefreshMarginLabel();
  shQuickSyncSlider();
  if(shQuickMarginTimer)clearTimeout(shQuickMarginTimer);
  if(shPriceSelection){
    shQuickSetStatus('Recalculando a SKU com margem desejada de '+$('#priceMargin').value+'%...');
    shQuickMarginTimer=setTimeout(()=>void shPricePrepare(),380);
  }else if(shPriceSupplierQuote){
    shQuickMarginTimer=setTimeout(()=>void shPricePreviewSupplierSku(shPriceSupplierQuote.sku),380);
  }
});
$('#priceMargin')?.addEventListener?.('input',()=>{
  $('#optimizerQuickMargin').dataset.manualMargin='true';
  shManualMarginChoice=true;
  if(shPriceSelection)shManualMarginSkuKey=[shPriceSelection.sku,shPriceSelection.itemId,shPriceSelection.modelId].join('|');
  shPriceRefreshMarginLabel();shQuickSyncSlider();
  if(shQuickMarginTimer)clearTimeout(shQuickMarginTimer);
  if(shPriceSelection)shQuickMarginTimer=setTimeout(()=>void shPricePrepare(),380);
  else if(shPriceSupplierQuote)
    shQuickMarginTimer=setTimeout(()=>void shPricePreviewSupplierSku(shPriceSupplierQuote.sku),380);
});
const shPriceInputIds=['#priceMinMargin','#priceDiscount',
  '#priceTax','#priceFlash','#priceCoupon','#priceAds','#priceFreight',
  '#pricePackaging','#priceMarketAvg','#priceSellerType','#priceHighVolume',
  ...[0,1,2,3].flatMap(i=>['#priceRate'+i,'#priceFee'+i])];
for(const id of shPriceInputIds){
  $(id)?.addEventListener?.('change',()=>{
    if(id==='#priceAds'&&shPriceSelection)
      shPriceAdsLoadedKey=[shPriceSelection.sku,shPriceSelection.itemId,shPriceSelection.modelId].join('|');
    if(id==='#priceAds')shPriceAdsRefreshUi();
    if(shPriceSelection)void shPricePrepare();
    else if(shPriceSupplierQuote)void shPricePreviewSupplierSku(shPriceSupplierQuote.sku);
  });
}
$('#priceRecalculate').onclick=()=>{
  if(shPriceSelection)void shPricePrepare();
  else if(shPriceSupplierQuote)void shPricePreviewSupplierSku(shPriceSupplierQuote.sku);
  else shPriceSetStatus('Selecione primeiro uma SKU em Otimização para calcular com o custo confirmado.','warning');
};
$('#priceOpenDiscounts').onclick=()=>setTab('discounts');
shPriceAdsRefreshUi();

// Reserva prevista no preço (dados persistidos) — independente das consultas
// de gasto real Shopee Ads. A lista NÃO autoriza campanhas nem publica preços.
let adsPricingLoadSerial=0;
async function adsPricingLoad(){
 const list=$('#adsPricingRows'),notice=$('#adsPricingReservedNotice'),count=$('#adsPricingCount');
 if(!list||!notice||!count)return;
 const serial=++adsPricingLoadSerial;
 list.replaceChildren();
 const wait=document.createElement('tr'),cell=document.createElement('td');
 cell.colSpan=8;cell.textContent='Consultando os planos salvos de precificação...';
 wait.append(cell);list.append(wait);
 notice.textContent='Consultando a reserva por SKU...';
 try{
  const data=await json('/api/shopee/optimizer/pricing/ads-reserved',
    {signal:AbortSignal.timeout(30000)});
  if(serial!==adsPricingLoadSerial)return;
  list.replaceChildren();
  const plans=Array.isArray(data.plans)?data.plans:[];
  count.textContent=plans.length+' anúncio(s) com reserva';
  notice.textContent=data.complete===false
   ?'Relatório parcial: existem mais planos do que o limite de consulta.'
   :plans.length?'Reserva já considerada na margem dos preços calculados.':'Nenhuma SKU marcada para Ads na precificação.';
  for(const plan of plans){
   const tr=document.createElement('tr');
   const td=(value)=>{const el=document.createElement('td');el.textContent=String(value);return el;};
   tr.append(td(plan.sku),td(shPriceMoney(plan.customerPrice)),td(shPriceMoney(plan.grossPrice)),
    td(shPricePercent(plan.adsBudgetPct)),td(shPriceMoney(plan.adsReserveAmount)),
    td(shPricePercent(plan.netMarginPct)),
    td(fmtDate(plan.updatedAt)));
   const action=document.createElement('td'),button=document.createElement('button');
   button.type='button';button.className='secondary';button.textContent='Ver plano';
   button.addEventListener('click',()=>{
    shPriceSelection={sku:plan.sku,itemId:plan.itemId,modelId:plan.modelId};
    shPriceSaveSelection(shPriceSelection);
    shPriceAdsLoadedKey='';
    setTab('pricing');
   });
   action.append(button);tr.append(action);list.append(tr);
  }
  if(!plans.length){
   const empty=document.createElement('tr'),blank=document.createElement('td');
   blank.colSpan=8;blank.textContent='Nenhum anúncio tem adicional Ads reservado em um plano salvo. Marque a opção na página Precificação e recalcule.';
   empty.append(blank);list.append(empty);
  }
 }catch(error){
  if(serial!==adsPricingLoadSerial)return;
  count.textContent='Indisponível';
  notice.textContent='Não foi possível consultar os planos de Ads: '+error.message;
  list.replaceChildren();const tr=document.createElement('tr'),cell=document.createElement('td');
  cell.colSpan=8;cell.textContent='Falha na consulta. Use Atualizar lista para tentar novamente.';
  tr.append(cell);list.append(tr);
 }
}
$('#adsPricingRefresh')?.addEventListener('click',()=>void adsPricingLoad());

let discountLoadRequestId=0,discountRefreshBusy=false;
let discountOneClickRows=[],discountOneClickBusy=false,discountOneClickLocked=false;
function discountOneClickStatus(message,state='info'){
 const el=$('#discountOneClickStatus');
 if(!el)return;
 el.textContent=message;el.dataset.state=state;
}
function discountOneClickReady(){
 const btn=$('#discountOneClickExecute');
 if(!btn)return;
 const q=shDiscountQuote;
 const research=q?.marketResearch;
 const researched=research?.verified===true&&
    research.sourceType==='researched_affiliate_offers'&&
    Number(research.count)>=3&&
    Number.isFinite(Date.parse(research.researchedAt))&&
    Date.now()-Date.parse(research.researchedAt)<=48*3600000;
 const valid=Boolean(q?.sku&&q?.itemId!==undefined&&q?.modelId!==undefined&&
    Number(q.grossPrice)>0&&Number(q.discountPct)>0&&
    Number(q.netMarginPct)+0.0001>=Number(q.minMarginPct)&&
    q.status!=='MERCADO_ABAIXO_DO_PISO'&&researched);
 btn.disabled=!valid||discountOneClickBusy||discountOneClickLocked;
 btn.textContent=discountOneClickBusy?'Executando na Shopee...':'Executar na Shopee';
 const select=$('#discountOneClickSku');
 if(select)select.disabled=discountOneClickBusy;
}
$('#discountOneClickSku')?.addEventListener('change',()=>{
 if(discountOneClickBusy)return;
 const idx=Number($('#discountOneClickSku').value);
 if(!Number.isInteger(idx)||idx<0||idx>=discountOneClickRows.length)return;
 void shDiscountChoose(discountOneClickRows[idx]);
});
$('#discountOneClickExecute')?.addEventListener('click',async()=>{
 if(discountOneClickBusy||discountOneClickLocked||!shDiscountQuote)return;
 const q=shDiscountQuote;
 const selected=[String(q.sku),String(q.itemId),String(q.modelId)].join('|');
 const unchanged=()=>shDiscountQuote&&
   [String(shDiscountQuote.sku),String(shDiscountQuote.itemId),String(shDiscountQuote.modelId)].join('|')===selected;
 const discountId=String($('#discountPromotionId')?.value||'').trim();
 if(!/^\d{1,18}$/.test(discountId)){
  discountOneClickStatus('Promoção da loja não configurada. Nenhum anúncio foi alterado.','error');
  return;
 }
 discountOneClickBusy=true;
 discountOneClickReady();
 let sentExecution=false;
 try{
  discountOneClickStatus('Conferindo automaticamente a SKU, o preço, o custo WeDrop e a promoção na Shopee...');
  const preview=await json('/api/shopee/optimizer/discounts/preview',{
   method:'POST',headers:{'Content-Type':'application/json'},
   body:JSON.stringify({sku:q.sku,itemId:q.itemId,modelId:q.modelId,discountId}),
   signal:AbortSignal.timeout(75000)
  });
  if(!unchanged())throw Error('A SKU selecionada mudou. Nenhuma alteração foi enviada.');
  const plan=preview?.preview;
  if(!preview?.approvalToken||!plan||String(plan.sku)!==String(q.sku)||
     String(plan.itemId)!==String(q.itemId)||String(plan.modelId)!==String(q.modelId))
   throw Error('Não foi possível confirmar a prévia segura do anúncio.');
  // Um único clique do lojista executa o plano exibido: quando necessário,
  // ajusta o preço bruto E insere/atualiza o desconto. O backend revalida
  // custo, vínculo, preço e campanha imediatamente antes de cada escrita.
  if(plan.action==='already'){
   discountOneClickLocked=true;
   discountOneClickStatus('Confirmado: o anúncio já está na promoção com o valor calculado. Nenhuma alteração necessária.','success');
   $('#discountSavedBadgeLabel').textContent='Confirmado na Shopee';
   return;
  }
  discountOneClickStatus(plan.needsBasePriceUpdate?
   'Ajustando o preço bruto de '+shPriceMoney(plan.originalPrice)+' para '+
   shPriceMoney(plan.gross)+' e incluindo o desconto na promoção...':
   'Incluindo o desconto da SKU na promoção escolhida...');
  sentExecution=true;
  const response=await fetch('/api/shopee/optimizer/discounts/execute',{
   method:'POST',headers:{'Content-Type':'application/json'},
   body:JSON.stringify({approvalToken:preview.approvalToken,confirm:true,
    allowPriceChange:true}),
   signal:AbortSignal.timeout(120000)
  });
  const result=await response.json().catch(()=>({}));
  discountOneClickLocked=true;
  if(!response.ok){
   const details=String(result.error||'A Shopee não confirmou a execução.');
   const partial=Boolean(result.basePriceUpdated||result.priceUpdated);
   discountOneClickStatus((partial?
    'Atenção: o preço bruto pode ter sido atualizado, mas o desconto não foi confirmado. '+
    'Confira o anúncio na Shopee antes de nova tentativa. ':
    'A Shopee não concluiu a promoção. Nenhum novo envio será repetido automaticamente. ')+details,'error');
   return;
  }
  if(result.verified===true){
   discountPromoPublished=true;
   $('#discountPlanNotice').textContent='Preço e desconto confirmados na Shopee para a promoção escolhida.';
   $('#discountSavedBadgeLabel').textContent='Confirmado na Shopee';
   discountOneClickStatus(result.message||'Desconto confirmado na Shopee.','success');
  }else{
   discountOneClickStatus(result.message||
    'A Shopee recebeu a operação, mas a confirmação ainda está pendente. Verifique antes de enviar outra vez.','warning');
  }
 }catch(error){
  if(sentExecution)discountOneClickLocked=true;
  discountOneClickStatus((sentExecution?
   'A solicitação pode ter chegado à Shopee. Verifique o preço e a promoção antes de tentar novamente. ':
   'Não foi possível concluir a conferência automática; nenhum preço ou desconto foi enviado. ')+
   String(error.message||error),'error');
 }finally{
  discountOneClickBusy=false;discountOneClickReady();
 }
});

let discountPromoPreview=null,discountPromoExecuting=false,discountPromoPublished=false;
function discountPromoStatus(message,state='info'){
 const n=$('#discountPromotionStatus');if(!n)return;
 n.textContent=message;n.dataset.state=state;
}
function discountPromoReset(){
 discountPromoPreview=null;discountPromoPublished=false;
 const box=$('#discountPromotionPreviewBox');
 if(box)box.hidden=true;
 const confirm=$('#discountPromotionConfirm');
 if(confirm)confirm.checked=false;
 const price=$('#discountPromotionAllowPrice');
 if(price)price.checked=false;
 const go=$('#discountPromotionExecute');
 if(go)go.disabled=true;
 const badge=$('#discountPublishBadge');
 if(badge){badge.textContent='Não executado';badge.dataset.state='pending';}
 discountPromoStatus('Nenhum desconto enviado. Gere uma prévia para conferir a campanha.');
}
function discountPromoApproval(){
 const preview=discountPromoPreview?.preview;
 // A prévia assinada, o anúncio atual e as DUAS confirmações relevantes
 // controlam a execução. O checklist de 4 itens é apenas informativo.
 const sameSku=Boolean(preview&&shDiscountQuote)&&
   String(preview.sku)===String(shDiscountQuote.sku)&&
   String(preview.itemId)===String(shDiscountQuote.itemId)&&
   String(preview.modelId)===String(shDiscountQuote.modelId);
 const authorized=Boolean($('#discountPromotionConfirm').checked);
 const priceAuthorized=preview?.needsBasePriceUpdate!==true||
   Boolean($('#discountPromotionAllowPrice').checked);
 const ready=Boolean(discountPromoPreview?.approvalToken)&&sameSku&&
   preview.action!=='already'&&!discountPromoExecuting&&
   authorized&&priceAuthorized;
 $('#discountPromotionExecute').disabled=!ready;
 if(ready){
  $('#discountPublishBadge').textContent='Pronto para executar';
  $('#discountPublishBadge').dataset.state='review';
  discountPromoStatus(preview.needsBasePriceUpdate
   ?'Autorizações confirmadas. Ao executar, a Shopee tentará atualizar o preço bruto de '+
     shPriceMoney(preview.originalPrice)+' para '+shPriceMoney(preview.gross)+
     ' e depois adicionar o desconto. Se a segunda etapa falhar, o preço bruto pode permanecer alterado.'
   :'Autorização confirmada. Clique em Executar para solicitar a inclusão do desconto na Shopee.',
   'success');
 }
 return ready;
}
function discountPromoRenderPreview(data){
 discountPromoPreview=data;
 const p=data.preview, box=$('#discountPromotionPreviewBox');
 box.hidden=false;
 const info=$('#discountPromotionPreviewInfo');info.replaceChildren();
 $('#discountPromotionPreviewBox')?.querySelectorAll('.discount-publish-promo-notice').forEach(el=>el.remove());
 const lines=[
  ['SKU',p.sku],['Campanha',p.promotionName+' · '+p.discountId],
  ['Situação',p.status],['Preço bruto no plano',shPriceMoney(p.gross)],
  ['Preço bruto atual Shopee',shPriceMoney(p.originalPrice)],
  ['Desconto calculado',shPricePercent(p.discountPct)],
  ['Preço para Minha Promoção',shPriceMoney(p.promo)],
  ['Após cupom da loja ('+shPricePercent(p.couponPct)+')',shPriceMoney(p.buyerAfterCoupon)],
  ['Operação',p.action==='add'?'Adicionar SKU à promoção':p.action==='update'?
    'Atualizar preço promocional da SKU já cadastrada':'Produto já tem o preço planejado na promoção'],
  ['Vínculo na campanha consultada',p.action==='add'?'Não encontrada — pronta para solicitar inclusão':
    'SKU identificada na promoção selecionada']
 ];
 for(const [label,value] of lines){
  const line=document.createElement('div');
  line.className='discount-publish-row';
  const key=document.createElement('span');key.textContent=label;
  const val=document.createElement('strong');val.textContent=String(value);
  line.append(key,val);info.append(line);
 }
 if(p.promotionNotice){
  const hint=document.createElement('p');
  hint.className='discount-publish-promo-notice';
  hint.textContent=p.promotionNotice;
  info.after(hint);
 }
 $('#discountPromotionPriceWrap').hidden=!p.needsBasePriceUpdate||p.action==='already';
 $('#discountPromotionPriceLabel').textContent='Autorizo atualizar o preço bruto na Shopee de '+
   shPriceMoney(p.originalPrice)+' para '+shPriceMoney(p.gross)+
   ' antes de adicionar o desconto. Se a inclusão falhar, o preço bruto pode permanecer atualizado.';
 $('#discountPromotionConfirm').checked=false;
 $('#discountPromotionAllowPrice').checked=false;
 const badge=$('#discountPublishBadge');
 badge.textContent=p.action==='already'?'Já incluído':'Prévia pronta';
 discountPromoPublished=p.action==='already';
 badge.dataset.state=p.action==='already'?'success':'review';
 discountPromoStatus(p.action==='already'
  ?'SKU já consta nesta promoção com o preço sugerido. Nenhuma alteração é necessária.'
  :p.needsBasePriceUpdate
  ?'O preço bruto precisa ser atualizado primeiro. A operação somente ocorrerá se você também autorizar esta etapa.'
  :p.promotionSignal==='unclassified_promotion'
    ?'A campanha escolhida não contém esta SKU. A sinalização promocional da Shopee não confirma conflito; a inclusão será validada no envio. Revise e autorize somente se os dados estiverem corretos.'
    :'SKU não encontrada na campanha escolhida. Revise os dados e confirme para solicitar inclusão à Shopee.',
  p.action==='already'?'success':'warning');
 discountPromoApproval();
}
$('#discountPromotionId')?.addEventListener('input',discountPromoReset);
$('#discountPromotionConfirm')?.addEventListener('change',discountPromoApproval);
$('#discountPromotionAllowPrice')?.addEventListener('change',discountPromoApproval);
$('#discountPromotionPreview')?.addEventListener('click',async()=>{
 if(!shDiscountQuote||discountPromoExecuting)return discountPromoStatus('Carregue uma SKU antes de conferir a promoção.','error');
 discountPromoReset();
 const btn=$('#discountPromotionPreview');btn.disabled=true;
 discountPromoStatus('Consultando preço, SKU e produtos da promoção na API Shopee...');
 try{
  const q=shDiscountQuote;
  const d=await json('/api/shopee/optimizer/discounts/preview',{
   method:'POST',headers:{'Content-Type':'application/json'},
   body:JSON.stringify({sku:q.sku,itemId:q.itemId,modelId:q.modelId,
    discountId:$('#discountPromotionId').value.trim()}),signal:AbortSignal.timeout(60000)});
  if(!shDiscountQuote||shDiscountQuote.sku!==q.sku||
     shDiscountQuote.itemId!==q.itemId||shDiscountQuote.modelId!==q.modelId)return;
  discountPromoRenderPreview(d);
 }catch(e){discountPromoStatus('A prévia não pôde ser confirmada: '+e.message,'error');}
 finally{btn.disabled=false;}
});
$('#discountPromotionExecute')?.addEventListener('click',async()=>{
 if(!discountPromoApproval())return discountPromoStatus('Gere uma prévia válida e confirme o envio. Se o preço bruto precisar mudar, autorize essa alteração separadamente.','warning');
 if(discountPromoExecuting)return;
 const data=discountPromoPreview;
 discountPromoExecuting=true;
 discountPromoApproval();
 const btn=$('#discountPromotionPreview');btn.disabled=true;
 discountPromoStatus('Executando UMA SKU via API Shopee. Aguarde a conferência do resultado...');
 try{
  const response=await fetch('/api/shopee/optimizer/discounts/execute',{
   method:'POST',headers:{'Content-Type':'application/json'},
   body:JSON.stringify({approvalToken:data.approvalToken,confirm:true,
    allowPriceChange:$('#discountPromotionAllowPrice').checked}),
   signal:AbortSignal.timeout(90000)});
  const body=await response.json().catch(()=>({}));
  if(!response.ok)throw Error(body.error||(body.basePriceUpdated
    ?'Preço bruto alterado, mas a inclusão do desconto não foi confirmada. Confira na Shopee.':
    'A Shopee não confirmou o envio.'));
  discountPromoPublished=body.verified===true;
  discountPromoStatus(body.message,body.verified?'success':'warning');
  if(body.verified){$('#discountPlanNotice').textContent='Shopee confirmou o desconto da SKU na campanha selecionada.';$('#discountSavedBadgeLabel').textContent='Desconto confirmado na Shopee';}
  $('#discountPublishBadge').textContent=body.verified?'Confirmado na Shopee':'Conferência pendente';
  $('#discountPublishBadge').dataset.state=body.verified?'success':'review';
  // Evitar novas submissões até outra prévia e nova revisão.
  discountPromoPreview=null;$('#discountPromotionExecute').disabled=true;
 }catch(e){
  discountPromoStatus('Não foi possível confirmar a execução: '+e.message+
   ' Não reenvie automaticamente. Confira primeiro a promoção na Shopee.','error');
  discountPromoPreview=null;$('#discountPromotionExecute').disabled=true;
 }finally{discountPromoExecuting=false;btn.disabled=false;}
});
const discountReviewLabels={campaign:'Campanha conferida',price:'Preço vigente conferido',tax:'Taxas revisadas',ready:'Promoção revisada para aplicar'};
function shDiscountResetReview(){
  document.querySelectorAll('[data-discount-review]').forEach(input=>{
    input.checked=false;input.disabled=!shDiscountQuote;
  });
  shDiscountReviewChanged();
}
function shDiscountReviewChanged(){
  const items=[...document.querySelectorAll('[data-discount-review]')];
  const checked=items.filter(i=>i.checked).length;
  const all=items.length>0&&checked===items.length;
  $('#discountReviewStatus').textContent=!shDiscountQuote?'Recupere primeiro um plano válido.':
    discountPromoPublished?'Desconto confirmado na Shopee. Conferências adicionais são opcionais.':
      checked+' de '+items.length+' conferências adicionais marcadas (opcionais). A execução depende da prévia e das autorizações abaixo.';
  $('#discountSavedBadgeLabel').textContent=!shDiscountQuote?'Aguardando plano salvo':
    discountPromoPublished?'Desconto confirmado na Shopee':
    all?'Plano salvo · conferências adicionais concluídas':'Plano salvo · aguarda prévia e aprovação';
  $('#discountSavedBadge').dataset.state=!shDiscountQuote?'unavailable':discountPromoPublished?'reviewed':all?'reviewed':'saved';
  discountPromoApproval();
}
for(const input of document.querySelectorAll('[data-discount-review]')){
 input.addEventListener('change',()=>{
   if(!shDiscountQuote){input.checked=false;return;}
   shDiscountReviewChanged();
 });
}
function shDiscountRender(q){
  if(!q||!q.sku||!Number.isFinite(Number(q.grossPrice))||Number(q.grossPrice)<=0||
   !Number.isFinite(Number(q.unitCost))||Number(q.unitCost)<=0||
   !Number.isFinite(Number(q.netMarginPct))||
   Number(q.netMarginPct)+0.0001<Number(q.minMarginPct)){
    throw Error('O plano não possui preço, custo ou margem mínima válida.');
  }
  shDiscountQuote=q;
  discountPromoReset();
  discountOneClickLocked=false;
  $('#discountPlanCard').hidden=false;
  $('#discountNoPlan').hidden=true;
  $('#discountSku').textContent='SKU '+q.sku+(String(q.modelId)!=='0'?' · Variação '+q.modelId:'');
  $('#discountPlanDate').textContent='Calculado '+fmtDate(q.calculatedAt);
  $('#discountGross').textContent=shPriceMoney(q.grossPrice);
  $('#discountPct').textContent=shPricePercent(q.discountPct);
  $('#discountPromoLabel').textContent=q.marketResearch?.verified===true
    ?'Desconto baseado no mercado':'Desconto base · sem pesquisa';
  $('#discountFinal').textContent=shPriceMoney(shPriceVisiblePromotion(q));
  $('#discountAfterCoupon').textContent='Com cupom de '+shPricePercent(q.couponPct)+
    ', se utilizado: '+shPriceMoney(q.customerPrice);
  $('#discountMargin').textContent=shPricePercent(q.netMarginPct);
  $('#discountProfit').textContent=shPriceMoney(q.netProfit);
  $('#discountSupplierCost').textContent=shPriceMoney(q.unitCost);
  $('#discountPlanNotice').textContent='Plano pronto: confira os valores acima. A execução verifica preço, custo e promoção automaticamente.';
  const gross=Number(q.grossPrice),discount=Number(q.discountPct);
  const promoPrice=Math.round(gross*(1-discount/100)*100)/100;
  $('#discountOneClickExplainer').textContent='Ao clicar, o sistema poderá ajustar o preço bruto para '+
   shPriceMoney(gross)+' e aplicará '+shPricePercent(discount)+
   ' de desconto na Minha Promoção (preço exibido na Shopee '+shPriceMoney(promoPrice)+
   '). Com cupom de '+shPricePercent(q.couponPct)+' (se utilizado): '+shPriceMoney(q.customerPrice)+
   '. A margem projetada já considera o cupom; nenhuma outra SKU será modificada.';
  shDiscountResetReview();
  discountOneClickStatus(q.marketResearch?.verified===true
    ?q.status==='MERCADO_ABAIXO_DO_PISO'
      ?'Preço da concorrência inferior à margem protegida. Desconto não executável.'
      :Number(q.discountPct)===0
        ?'Este anúncio já está competitivo sem desconto adicional. Não é necessário inserir na Minha Promoção.'
        :'Pesquisa de mercado verificada. Plano pronto para executar na Shopee.'
    :'Desconto base sem pesquisa comprovada. Conecte a API de ofertas Shopee e recalcule a SKU em Precificação.',
    q.marketResearch?.verified===true&&q.status!=='MERCADO_ABAIXO_DO_PISO'?'success':'warning');
  discountOneClickReady();
}
function shDiscountQuoteHasValidCents(q){
 const cents=v=>Math.round(Number(v)*100)%10;
 const gross=Number(q?.grossPrice),discount=Number(q?.discountPct);
 const promo=Math.round(gross*(1-discount/100)*100)/100;
 const checkout=Math.round(promo*(1-Number(q?.couponPct||0)/100)*100)/100;
 return Number(q?.priceEndingRuleVersion)===4&&
  q?.priceEndingPolicy==='both_checkout_and_visible'&&
  Number.isFinite(promo)&&Number.isFinite(checkout)&&promo>0&&checkout>0&&
  [0,9].includes(cents(promo))&&[0,9].includes(cents(checkout))&&
  Math.abs(promo-Number(q.marketplaceDisplayPrice))<0.011&&
  Math.abs(checkout-Number(q.customerPrice))<0.011;
}
function shDiscountStatus(message,state='info'){
  const n=$('#discountPlanStatus');
  n.textContent=message;n.dataset.state=state;
  if(!shDiscountQuote){
    const empty=$('#discountNoPlan');empty.hidden=false;empty.textContent=message;
    $('#discountPlanCard').hidden=true;
    $('#discountSavedBadge').dataset.state='unavailable';
    $('#discountSavedBadgeLabel').textContent='Aguardando plano salvo';
  }
}
async function shDiscountChoose(row){
  const requestId=++discountLoadRequestId;
  shDiscountQuote=null;
  discountOneClickLocked=false;
  discountOneClickStatus('Carregando plano da SKU '+row.sku+'...');
  discountOneClickReady();
  discountPromoReset();
  shDiscountResetReview();
  shDiscountStatus('Recuperando o plano salvo da SKU '+row.sku+' (sem sobrescrever o cálculo)...');
  try{
    const qs=new URLSearchParams({sku:row.sku,itemId:row.itemId,modelId:row.modelId});
    const data=await json('/api/shopee/optimizer/pricing/saved?'+qs,{
      signal:AbortSignal.timeout(35000)
    });
    if(requestId!==discountLoadRequestId)return;
    if(!data?.quote||data?.saved!==true)throw Error('O servidor não confirmou o salvamento do plano.');
    let quote=data.quote,recalculated=false;
    if(!shDiscountQuoteHasValidCents(quote)){
     if(!quote.pricingSettings)
      throw Error('Plano antigo sem configurações de custo e margem recuperáveis. Use Otimização > Buscar SKU para recalcular.');
     shDiscountStatus('Plano anterior fora da regra 0/9. Recalculando automaticamente com custo WeDrop, margem da SKU e cupom salvos; NADA será publicado...','warning');
     const fixed=await json('/api/shopee/optimizer/pricing/prepare',{
      method:'POST',headers:{'Content-Type':'application/json'},
      body:JSON.stringify({sku:row.sku,itemId:row.itemId,modelId:row.modelId,
       settings:quote.pricingSettings,marginOverride:quote.marginOverride===true,
       adsBudgetEnabled:quote.adsBudgetEnabled===true,
       adsBudgetPct:quote.adsBudgetEnabled===true?Number(quote.adsBudgetPct||0):0,
       marketAverage:quote.marketResearch?.manualMarketReference??null}),
      signal:AbortSignal.timeout(90000)
     });
     if(requestId!==discountLoadRequestId)return;
     quote=fixed?.quote;
     if(!quote||!shDiscountQuoteHasValidCents(quote))
      throw Error('A atualização não conseguiu proteger simultaneamente preço da Shopee, cupom e margem. Nenhum desconto foi enviado.');
     recalculated=true;
    }
    shPriceSelection={sku:row.sku,itemId:String(row.itemId),modelId:String(row.modelId)};
    shPriceSaveSelection(shPriceSelection);
    shDiscountRender(quote);
    const select=$('#discountOneClickSku');
    const index=discountOneClickRows.findIndex(x=>
      x.sku===row.sku&&String(x.itemId)===String(row.itemId)&&
      String(x.modelId)===String(row.modelId));
    if(index>=0)select.value=String(index);
    shDiscountStatus(recalculated
     ?'✓ Plano da SKU '+row.sku+' recalculado com ambos os preços terminando em 0/9. Confira os novos valores e autorize a prévia; nenhuma alteração foi enviada à Shopee.'
     :'Plano da SKU '+row.sku+' recuperado com preço Shopee e cupom dentro da regra 0/9. Confira e autorize somente após a prévia.','success');
    shDiscountHighlight(row);
  }catch(e){
    if(requestId!==discountLoadRequestId)return;
    $('#discountPlanCard').hidden=true;shDiscountQuote=null;
    discountOneClickStatus('Plano indisponível: '+e.message,'error');
    discountOneClickReady();
    shDiscountResetReview();
    shDiscountStatus('Plano não utilizável: '+e.message+
      '. Abra Otimização para revisar a SKU ou o custo WeDrop.','error');
  }
}
function shDiscountHighlight(row){
  document.querySelectorAll('.discount-v2-recent-plan').forEach(btn=>{
    const selected=btn.dataset.sku===String(row.sku)&&
      btn.dataset.itemId===String(row.itemId)&&btn.dataset.modelId===String(row.modelId);
    btn.classList.toggle('selected',selected);
    btn.setAttribute('aria-current',selected?'true':'false');
  });
}
async function shDiscountLoadLatest(){
  if(discountRefreshBusy)return;
  discountRefreshBusy=true;
  const requestId=++discountLoadRequestId;
  const list=$('#discountRecentPlans');list.replaceChildren();
  const selector=$('#discountOneClickSku');selector.replaceChildren();
  discountOneClickRows=[];
  const placeholder=document.createElement('option');
  placeholder.value='';placeholder.textContent='Carregando anúncios...';selector.append(placeholder);
  shDiscountQuote=null;discountPromoReset();shDiscountResetReview();
  discountOneClickStatus('Carregando os planos salvos...');
  discountOneClickReady();
  shDiscountStatus('Carregando os últimos planos de desconto...');
  const refresh=$('#discountRefresh');refresh.disabled=true;
  $('#discountRefreshLabel').textContent='Atualizando...';
  try{
    const result=await json('/api/shopee/optimizer/pricing/recent',
      {signal:AbortSignal.timeout(25000)});
    if(requestId!==discountLoadRequestId)return;
    const plans=Array.isArray(result.plans)?result.plans:[];
    discountOneClickRows=plans;
    selector.replaceChildren();
    plans.forEach((row,i)=>{
     const option=document.createElement('option');option.value=String(i);
     option.textContent=row.sku+
       (String(row.modelId)!=='0'?' · Variação '+row.modelId:'');
     selector.append(option);
    });
    if(!plans.length){
     const none=document.createElement('option');
     none.value='';none.textContent='Nenhum plano disponível';selector.append(none);
     discountOneClickStatus('Não há anúncios preparados. Calcule primeiro em Precificação.','warning');
     discountOneClickReady();
      shDiscountStatus('Nenhum plano salvo. Localize uma SKU uma única vez em Otimização.','warning');
      list.textContent='Nenhum plano encontrado para esta loja.';
      return;
    }
    const saved=shPriceSelection||shPriceRestoredSelection();
    const chosen=plans.find(p=>p.sku===saved?.sku&&
      String(p.itemId)===saved.itemId&&String(p.modelId)===saved.modelId)||plans[0];
    selector.value=String(plans.indexOf(chosen));
    for(const row of plans){
      const b=optimizerMake('button','sh-recent-plan discount-v2-recent-plan');b.type='button';
      b.dataset.sku=String(row.sku);b.dataset.itemId=String(row.itemId);
      b.dataset.modelId=String(row.modelId);
      const label=optimizerMake('span','discount-v2-recent-identity');
      label.append(optimizerMake('strong','',row.sku),
        optimizerMake('small','',fmtDate(row.updatedAt)));
      const values=optimizerMake('span','discount-v2-recent-values',
        row.quote?shPriceMoney(row.quote.grossPrice)+' → '+
        shPricePercent(row.quote.discountPct)+' → '+
        shPriceMoney(row.quote.customerPrice):'Recalcular para conferir valores');
      const chip=optimizerMake('span','discount-v2-recent-chip','✓  Plano salvo');
      const arrow=optimizerMake('span','discount-v2-recent-arrow','›');
      b.append(label,values,chip,arrow);
      b.onclick=()=>void shDiscountChoose(row);
      list.appendChild(b);
    }
    // Only select the relevant saved item, never invent the current SKU.
    if(requestId===discountLoadRequestId)await shDiscountChoose(chosen);
  }catch(e){
    if(requestId!==discountLoadRequestId)return;
    shDiscountStatus('Não foi possível consultar planos Shopee: '+e.message,'error');
    list.textContent='Consulta indisponível. Use Atualizar planos para tentar novamente.';
  }finally{
    discountRefreshBusy=false;refresh.disabled=false;
    $('#discountRefreshLabel').textContent='Atualizar planos';
  }
}
$('#discountRefresh').onclick=()=>void shDiscountLoadLatest();
$('#discountEdit').onclick=()=>{
  if(!shPriceSelection)return setTab('optimizer');
  setTab('optimizer');
  $('#optimizerSku').value=shPriceSelection.sku;
  void optimizerRunAudit(shPriceSelection.itemId,shPriceSelection.sku,shPriceSelection.modelId);
};
$('#discountOpenPromotion').onclick=()=>{
  if(!shDiscountQuote){
    shDiscountStatus('Não há plano confirmado para conferir na Minha Promoção.','warning');
    return;
  }
  // A rota da Minha Promoção foi fornecida pelo usuário; exigir ID numérico
  // e validação da loja durante a prévia antes de qualquer execução.
  const id=String($('#discountPromotionId')?.value||'').trim();
  const target=/^\d{1,18}$/.test(id)&&Number.isSafeInteger(Number(id))
   ?'https://seller.shopee.com.br/portal/marketing/discount/'+id
   :'https://seller.shopee.com.br/portal/marketing/discount';
  window.open(target,'_blank','noopener,noreferrer');
  shDiscountStatus('Central do Vendedor aberta. Confira o produto na promoção; a execução no Shopee Manager continua dependendo de prévia e confirmação.','warning');
};
$('#discountCopy').onclick=async()=>{
  const q=shDiscountQuote;
  if(!q)return shDiscountStatus('Não há plano para copiar.','warning');
  const manual=[...document.querySelectorAll('[data-discount-review]')]
    .map(i=>discountReviewLabels[i.dataset.discountReview]+': '+(i.checked?'Marcada manualmente':'Pendente'));
  const report=['SHOPEE · REDE ACHADOS BR','SKU '+q.sku,
    'Preço bruto: '+shPriceMoney(q.grossPrice),
    'Desconto do anúncio: '+shPricePercent(q.discountPct),
    'Cupom da loja: '+shPricePercent(q.couponPct),
    'Preço visível na Shopee, sem cupom: '+shPriceMoney(shPriceVisiblePromotion(q)),
    'Preço se o comprador usar cupom: '+shPriceMoney(q.customerPrice),
    'Lucro líquido previsto: '+shPriceMoney(q.netProfit),
    'Margem líquida prevista: '+shPricePercent(q.netMarginPct),
    'Custo WeDrop: '+shPriceMoney(q.unitCost),
    'Margem mínima: '+shPricePercent(q.minMarginPct),
    ...manual,discountPromoPublished?'Desconto confirmado pela API Shopee para a SKU na promoção consultada.':'Plano ainda sem confirmação de aplicação na Shopee. Conferir Minha Promoção.'].join('\n');
  try{
    await navigator.clipboard.writeText(report);
    shDiscountStatus('Valores copiados. Confira e aplique na Central da Shopee.','success');
  }catch(e){
    shDiscountStatus('A cópia automática foi bloqueada pelo navegador. Confira os valores na tela.','warning');
  }
};

boot();

function optimizerExecutionDisplay(key,value){
 if(key==='attribute_list')return (value||[]).map(attr=>{
  const meta=(optimizerWorkflowPlan?.attributes||[]).find(x=>Number(x.id)===Number(attr.attribute_id));
  return (meta?.name||'Atributo '+attr.attribute_id)+': '+(attr.attribute_value_list||[]).map(x=>
   (x.original_value_name||meta?.options?.find(o=>Number(o.id)===Number(x.value_id))?.name||'Valor '+x.value_id)+
   (x.value_unit?' '+x.value_unit:'')).join(', ');
 }).join('\n')||'Sem atributos';
 if(key==='tax_info')return Object.entries(value||{}).map(([k,v])=>(optimizerTaxLabels[k]||k)+': '+v).join('\n')||'Não informado';
 return String(value||'Não informado');
}

// Edições manuais persistem por SKU, sem exigir clique de aprovação.
// Uma alteração de texto invalida a conferência anterior, não publica na Shopee.
let optimizerContentTimer=0,optimizerContentPending=null,optimizerContentQueue=Promise.resolve();
function optimizerContentKey(w,stage){
 return ['ra-optimizer-content-v1',w.shopId,w.itemId,w.modelId,w.sku,stage].join(':');
}
function optimizerContentRemember(){
 const w=optimizerWorkflowPlan,stage=optimizerWorkflowStage;
 if(!w||!['seo','description'].includes(stage))return;
 const val=$('#optimizerWorkflowDraft').value;
 const field=stage==='seo'?'draftTitle':'draftDescription';
 if(w[field]===val&&!optimizerContentPending)return;
 w[field]=val;
 const reviewed=w.stages?.find(x=>x.key===stage);
 if(reviewed){reviewed.reviewed=false;reviewed.reviewedAt=null;reviewed.status='pending';}
 const pending={sku:w.sku,itemId:w.itemId,modelId:w.modelId,shopId:w.shopId,stage,value:val};
 try{localStorage.setItem(optimizerContentKey(w,stage),JSON.stringify(pending));}catch{}
 optimizerContentPending=pending;
 if(optimizerContentTimer)clearTimeout(optimizerContentTimer);
 optimizerContentTimer=setTimeout(()=>{void optimizerContentFlush().catch(()=>{});},650);
}
async function optimizerContentFlush(){
 if(optimizerContentTimer)clearTimeout(optimizerContentTimer);
 optimizerContentTimer=0;
 if(!optimizerContentPending)return optimizerContentQueue;
 const pending=optimizerContentPending;
 optimizerContentPending=null;
 const job=()=>json('/api/shopee/optimizer/workflow/content-draft',{
  method:'POST',headers:{'Content-Type':'application/json'},
  body:JSON.stringify({
   itemId:pending.itemId,modelId:pending.modelId,sku:pending.sku,
   stage:pending.stage,
   ...(pending.stage==='seo'?{title:pending.value}:{description:pending.value})
  }),signal:AbortSignal.timeout(45000)
 });
 // Todas as alterações são gravadas em ordem, impedindo que a revisão
 // explícita seja sobrescrita por um rascunho atrasado.
 optimizerContentQueue=optimizerContentQueue.catch(()=>{}).then(job).then(result=>{
  const active=optimizerWorkflowPlan;
  if(result?.saved===true){
   try{
    const id=optimizerContentKey(pending,pending.stage);
    const cached=JSON.parse(localStorage.getItem(id)||'null');
    if(cached?.value===pending.value)localStorage.removeItem(id);
   }catch{}
  }
  if(active?.sku===pending.sku&&active.itemId===pending.itemId&&
    active.modelId===pending.modelId&&active[ pending.stage==='seo'?'draftTitle':'draftDescription' ]===pending.value)
    optimizerWorkflowNotice('Texto da SKU '+pending.sku+' salvo automaticamente.','success');
  return result;
 }).catch(error=>{
  // Sem perder o texto ou exigir nova digitação: a próxima tentativa de
  // conferência ou retomada poderá reenviar este rascunho (não publica anúncio).
  if(!optimizerContentPending)optimizerContentPending=pending;
  optimizerWorkflowNotice('O rascunho continua protegido neste navegador, mas ainda não foi salvo no servidor: '+error.message,'warning');
  throw error;
 });
 return optimizerContentQueue;
}
// Geração pela Ponte ChatGPT: usar exatamente o MESMO pipeline de rascunho
// serializado do Manager; não publicar na Shopee nem confirmar antes de gravar.
globalThis.ShopeeDescriptionSaveChatGPT=async(description,identity)=>{
 const w=optimizerWorkflowPlan;
 if(optimizerWorkflowStage!=='description'||!w)throw Error('Abra a etapa Descrição antes de importar.');
 if(String(w.sku)!==String(identity?.sku)||String(w.itemId)!==String(identity?.itemId)||
    String(w.modelId)!==String(identity?.modelId))
  throw Error('A SKU mudou durante a geração. O texto não foi importado em outro produto.');
 const value=String(description||'').replace(/\r\n?/g,'\n').normalize('NFC').trim();
 if([...value].length<250||[...value].length>5000)throw Error('Descrição incompleta ou extensa demais.');
 const field=$('#optimizerWorkflowDraft');
 if(!field)throw Error('Editor da descrição indisponível.');
 // Concluir salvamentos antigos antes de aplicar este retorno.
 await optimizerContentFlush();
 if(optimizerWorkflowStage!=='description'||optimizerWorkflowPlan!==w)
  throw Error('A etapa foi alterada antes da importação.');
 field.value=value;
 field.dispatchEvent(new Event('input',{bubbles:true}));
 optimizerContentRemember();
 const result=await optimizerContentFlush();
 if(result?.saved!==true)throw Error('Banco não confirmou o salvamento da descrição.');
 if(optimizerWorkflowPlan!==w||optimizerWorkflowStage!=='description')
  throw Error('SKU alterada durante o salvamento. Confira o rascunho.');
 optimizerDescriptionCompactPreview(value);
 globalThis.ShopeeDescriptionStudio?.sync?.();
 return {saved:true,sku:w.sku,length:[...value].length};
};
// Usado pelo botão explícito "Salvar título manual" do editor SEO.
globalThis.ShopeeSeoSaveManual=async()=>{
 const w=optimizerWorkflowPlan;
 if(optimizerWorkflowStage!=='seo'||!w)throw Error('Abra a etapa Título SEO de uma SKU.');
 const title=$('#optimizerWorkflowDraft')?.value||'';
 if(!title.trim())throw Error('Digite um título antes de salvar.');
 optimizerContentRemember();
 await optimizerContentFlush();
 const result=await json('/api/shopee/optimizer/workflow/content-draft',{
  method:'POST',headers:{'Content-Type':'application/json'},
  body:JSON.stringify({itemId:w.itemId,modelId:w.modelId,sku:w.sku,stage:'seo',title}),
  signal:AbortSignal.timeout(45000)
 });
 if(optimizerWorkflowPlan?.sku!==w.sku||optimizerWorkflowPlan?.itemId!==w.itemId)
  throw Error('A SKU mudou durante o salvamento. Reabra o anúncio.');
 if(result.saved!==true)throw Error('O servidor não confirmou o salvamento.');
 return {saved:true,length:[...title.normalize('NFC').replace(/\s+/g,' ').trim()].length};
};
function optimizerContentRestore(w){
 if(!w)return w;
 const unsaved=[];
 for(const stage of ['seo','description']){
  try{
   const cached=JSON.parse(localStorage.getItem(optimizerContentKey(w,stage))||'null');
   if(!cached||cached.sku!==w.sku||cached.itemId!==w.itemId||
      cached.modelId!==w.modelId||typeof cached.value!=='string')continue;
   const field=stage==='seo'?'draftTitle':'draftDescription';
   w[field]=cached.value;
   const row=w.stages?.find(x=>x.key===stage);
   if(row){row.reviewed=false;row.status='pending';row.reviewedAt=null;}
   // As duas etapas podem ter alterações simultâneas pendentes.
   unsaved.push(cached);
  }catch{}
 }
 if(unsaved.length)setTimeout(()=>{
  void (async()=>{
   for(const draft of unsaved){
    const field=draft.stage==='seo'?'draftTitle':'draftDescription';
    if(optimizerWorkflowPlan?.sku!==draft.sku||
       optimizerWorkflowPlan?.itemId!==draft.itemId||
       optimizerWorkflowPlan?.[field]!==draft.value)continue;
    if(optimizerContentPending)await optimizerContentFlush().catch(()=>{});
    optimizerContentPending=draft;
    await optimizerContentFlush().catch(()=>{});
   }
  })();
 },350);
 return w;
}

function optimizerCopyCount(){
 const count=[...$('#optimizerWorkflowDraft').value.normalize('NFC')].length,isTitle=optimizerWorkflowStage==='seo';
 $('#optimizerCopyCount').textContent=count+' caracteres · '+(isTitle?'mínimo 100, máximo 120':'sem limite de redação no rascunho')+(isTitle&&count<100?' · faltam '+(100-count):isTitle&&count>120?' · excede '+(count-120):'');
 $('#optimizerCopyCount').className=(isTitle?count>=100&&count<=120:count>0)?'copy-count-valid':'copy-count-invalid';
}
$('#optimizerWorkflowDraft')?.addEventListener?.('input',()=>{
 optimizerContentRemember();
 optimizerExecReset();optimizerCopyCount();
 if(optimizerWorkflowStage==='description')optimizerDescriptionCompactPreview($('#optimizerWorkflowDraft').value);
});
function optimizerSupplierRender(data,key){
 const wrap=$('#optimizerSupplierFacts');wrap.replaceChildren();wrap.hidden=!['seo','description','technical','fiscal','category'].includes(key);
 if(wrap.hidden)return;
 const p=data.supplierProduct;
 if(!p){wrap.append(optimizerMake('p','','Ficha WeDrop ainda não importada. Reimporte o catálogo oficial para recuperar NCM e dados da SKU.'));return;}
 wrap.append(optimizerMake('strong','',p.source),optimizerMake('p','',[p.name,p.brand,'NCM: '+(p.ncm||'não confirmado'),'EAN: '+(p.ean||'não confirmado')].join(' · ')));
 if(key==='technical'&&p.catalogMeasurements){const m=p.catalogMeasurements;
  wrap.append(optimizerMake('p','','Valores brutos da planilha: C '+m.lengthCm+' × L '+m.widthCm+' × A '+m.heightCm+' cm; peso na coluna kg: '+m.weightKg+'. Confira se são dados de embalagem.'));
 }
 if(key==='technical'||key==='fiscal')for(const warning of p.warnings||[])wrap.append(optimizerMake('small','',warning));
}

const optimizerTechPtNames={
 'contains bluetooth, wireless and/or rf technology':'Contém Bluetooth, Wi-Fi ou tecnologia RF',
 'region of origin':'País ou região de origem','warranty duration':'Prazo de garantia',
 'material':'Material','condition':'Condição do produto','ball diameter':'Diâmetro da bola',
 'length':'Comprimento','height':'Altura','width':'Largura','quantity':'Quantidade',
 'indication':'Indicação de uso','custom product':'Produto personalizado',
 'quantity per pack':'Quantidade por embalagem','ball size':'Tamanho da bola',
 'model':'Modelo','color':'Cor','colour':'Cor','brand':'Marca','size':'Tamanho',
 'pattern':'Estampa','product dimensions':'Dimensões do produto',
 'power source':'Fonte de alimentação','power supply':'Fonte de alimentação',
 'battery type':'Tipo de bateria','battery capacity':'Capacidade da bateria',
 'built-in battery':'Bateria integrada','build-in battery':'Bateria integrada',
 'has bsmi no.':'Possui certificação BSMI','has bsmi no':'Possui certificação BSMI',
 'recommended age':'Idade recomendada','age range':'Faixa etária',
 'quantity per pack':'Quantidade por embalagem','product condition':'Condição do produto',
 'region of origin':'País ou região de fabricação','country of origin':'País de fabricação',
 'indication':'Indicação de uso','indication of use':'Indicação de uso',
 'input voltage':'Tensão de entrada','voltage':'Voltagem',
 'power':'Potência','maximum load':'Peso máximo suportado',
 'maximum weight':'Peso máximo suportado','product weight':'Peso do produto',
 'item weight':'Peso do produto','custom product':'Produto personalizado',
 'material':'Material','composition':'Composição',
 'product model':'Modelo do produto','type':'Tipo',
 'has certification':'Possui certificação','certification':'Certificação',
 'certification':'Certificação','weight':'Peso'};
function optimizerTechLabel(value,id){
 const localized=globalThis.RATechnicalPT?.attribute?.(value,id);
 if(localized)return localized;
 const raw=String(value||'').trim();
 const normalized=raw.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'');
 return optimizerTechPtNames[normalized]||
   (/\bpower source\b/i.test(raw)?'Fonte de alimentação':
    /\b(?:recommended age|age recommendation)\b/i.test(raw)?'Idade recomendada':
    /\bquantity per pack\b/i.test(raw)?'Quantidade por embalagem':
    /\b(?:country|region) of origin\b/i.test(raw)?'País ou região de fabricação':
    /\b(?:indication|usage recommendation)\b/i.test(raw)?'Indicação de uso':
    /\bhas bsmi\b/i.test(raw)?'Possui certificação BSMI':
    /\b(?:built.in|build.in) battery\b/i.test(raw)?'Bateria integrada':raw);
}
function optimizerTechValueLabel(value,id){
 const localized=globalThis.RATechnicalPT?.value?.(value,id);
 if(localized)return localized;
 const raw=String(value||'').trim();
 const threshold=raw.match(/^(\d{1,2})\s*(?:years?|yrs?)\s*(?:old\s*)?and\s+(?:above|up|over)$/i)||
  raw.match(/^(\d{1,2})\+\s*(?:years?|yrs?)$/i);
 if(threshold)return 'A partir de '+Number(threshold[1])+' anos';
 const band=raw.match(/^(\d{1,2})\s*[-–]\s*(\d{1,2})\s*(?:years?|yrs?)$/i);
 if(band)return Number(band[1])+' a '+Number(band[2])+' anos';
 const months=raw.match(/^(\d{1,2})\s*[-–]\s*(\d{1,2})\s*months?$/i);
 if(months)return Number(months[1])+' a '+Number(months[2])+' meses';
 return ({yes:'Sim',no:'Não',new:'Novo',used:'Usado','not applicable':'Não se aplica',
 'not specified':'Não informado',other:'Outro','no warranty':'Sem garantia',
 'battery':'Bateria','battery operated':'Alimentação por bateria',
 'battery powered':'Alimentação por bateria','rechargeable battery':'Bateria recarregável',
 'new':'Novo','used':'Usado','rechargeable':'Recarregável',
 '3 years and above':'A partir de 3 anos','3 years old and above':'A partir de 3 anos',
 '3 years and up':'A partir de 3 anos','3+ years':'A partir de 3 anos'})[raw.toLowerCase()]||
   (/^\d+\s*-\s*\d+\s+years?$/i.test(raw)?raw.replace(/years?/i,'anos').replace('-', 'a'):raw);
}
// Guarda imediatamente tudo o que o usuário editar, antes da revisão formal.
let techFieldTimer=0,techTextTimer=0,techFieldQueue=Promise.resolve(),techTextQueue=Promise.resolve();
function techKey(w,type){return ['ra-tech-draft-v1',w.shopId,w.itemId,w.modelId,w.sku,type].join(':');}
function techCached(w,type){try{return JSON.parse(localStorage.getItem(techKey(w,type))||'null');}catch{return null;}}
function techCache(w,type,data){try{localStorage.setItem(techKey(w,type),
 JSON.stringify({...data,updatedAt:new Date().toISOString()}));}catch{}}
// Fonte padrão apenas para atributos simples confirmados pelo próprio vendedor.
// O valor do país de fabricação nunca é escolhido a partir do país da loja.
function optimizerSellerDeclaredEvidence(meta,values,current=''){
 const evidence=String(current||'').trim();
 if(evidence)return evidence;
 const name=String(meta?.name||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'')
   .toLowerCase().replace(/\s+/g,' ').trim();
 if(!['pais ou regiao de origem','country or region of origin','country of origin',
   'quantidade','quantity'].includes(name))return '';
 if(!Array.isArray(values)||!values.length||values.some(v=>{
   const id=Number(v?.valueId);
   return !(id>0||(id===0&&String(v?.valueName??'').trim()));
 }))return '';
 return 'Informado e confirmado pelo vendedor';
}
function techFieldsSnapshot(){
 const metadata=optimizerWorkflowPlan?.attributes||[];
 return [...$('#optimizerTechnicalFields').querySelectorAll('fieldset[data-attribute-id]')].map(f=>{
  const attributeId=Number(f.dataset.attributeId);
  const values=[...f.querySelectorAll('[data-attribute-value]')].map(row=>({
   valueId:Number(row.querySelector('[data-value-id]')?.value||-1),
   valueName:String(row.querySelector('[data-value-name]')?.value||''),
   unit:String(row.querySelector('[data-value-unit]')?.value||'')
  }));
  const source=f.querySelector('[data-evidence-for]');
  const evidence=optimizerSellerDeclaredEvidence(metadata.find(a=>Number(a.id)===attributeId),
    values,source?.value);
  if(source&&evidence&&!source.value.trim())source.value=evidence;
  return {attributeId,enabled:Boolean(f.querySelector('[data-attribute-enabled]')?.checked),
   userDisabled:f.dataset.userDisabled==='true',evidence,values};
 });
}
function techFieldSend(w,fields){
 techFieldQueue=techFieldQueue.catch(()=>{}).then(async()=>{
  const result=await json('/api/shopee/optimizer/workflow/technical-draft',{
   method:'POST',headers:{'Content-Type':'application/json'},
   body:JSON.stringify({itemId:w.itemId,modelId:w.modelId,sku:w.sku,fields}),
   signal:AbortSignal.timeout(60000)
  });
  if(optimizerWorkflowPlan===w){
   w.technicalDraft=result.technicalDraft;
   optimizerTechNotice('✓ Campos manuais salvos no banco para a SKU '+w.sku+'.','success');
  }
  return result;
 });
 techFieldQueue.catch(e=>{if(optimizerWorkflowPlan===w)
  optimizerTechNotice('Campos mantidos no navegador; falha no banco: '+e.message,'error');});
 return techFieldQueue;
}
function techSaveFields(now=false){
 const w=optimizerWorkflowPlan;if(!w||optimizerWorkflowStage!=='technical')return Promise.resolve();
 const fields=techFieldsSnapshot();techCache(w,'fields',{fields});
 clearTimeout(techFieldTimer);
 if(now)return techFieldSend(w,fields);
 optimizerTechNotice('Salvando suas alterações da ficha…');
 techFieldTimer=setTimeout(()=>{techFieldTimer=0;void techFieldSend(w,fields);},850);
 return Promise.resolve();
}
function techTextSend(w,value){
 techTextQueue=techTextQueue.catch(()=>{}).then(async()=>{
  const res=await json('/api/shopee/optimizer/workflow/source',{
   method:'POST',headers:{'Content-Type':'application/json'},
   body:JSON.stringify({sku:w.sku,itemId:w.itemId,modelId:w.modelId,action:'text',sourceText:value}),
   signal:AbortSignal.timeout(60000)
  });
  if(optimizerWorkflowPlan===w){
   w.sourceEvidence={...(w.sourceEvidence||{}),...(res.sourceEvidence||{}),sourceText:value};
   optimizerTechNotice('✓ Texto manual salvo no banco para a SKU '+w.sku+'.','success');
  }
  return res;
 });
 techTextQueue.catch(e=>{if(optimizerWorkflowPlan===w)
  optimizerTechNotice('Texto mantido no navegador; falha no banco: '+e.message,'error');});
 return techTextQueue;
}
function techSaveText(value,now=false){
 const w=optimizerWorkflowPlan;if(!w?.sku)return Promise.resolve();
 value=String(value||'');techCache(w,'text',{text:value});
 for(const el of [$('#optimizerTechText'),$('#optimizerSourceText')])
  if(el&&el!==document.activeElement)el.value=value;
 clearTimeout(techTextTimer);
 if(now)return techTextSend(w,value);
 optimizerTechNotice('Salvando texto manual…');
 techTextTimer=setTimeout(()=>{techTextTimer=0;void techTextSend(w,value);},850);
 return Promise.resolve();
}
async function techFlush(){
 const w=optimizerWorkflowPlan;if(!w)return;
 if(techTextTimer){clearTimeout(techTextTimer);techTextTimer=0;
  await techTextSend(w,$('#optimizerTechText').value);}else await techTextQueue;
 if(techFieldTimer){clearTimeout(techFieldTimer);techFieldTimer=0;
  await techFieldSend(w,techFieldsSnapshot());}else await techFieldQueue;
}
async function techRefreshSuggestions(){
 const w=optimizerWorkflowPlan;
 if(!w?.sku||optimizerWorkflowStage!=='technical'||$('#optimizerTechFill')?.disabled)return;
 try{
  if(techTextTimer){clearTimeout(techTextTimer);techTextTimer=0;
   await techTextSend(w,$('#optimizerTechText')?.value||'');}
  else await techTextQueue;
  if(techFieldTimer){clearTimeout(techFieldTimer);techFieldTimer=0;
   await techFieldSend(w,techFieldsSnapshot());}
  else await techFieldQueue;
  if(optimizerWorkflowPlan!==w||optimizerWorkflowStage!=='technical')return;
  const fresh=await json('/api/shopee/optimizer/workflow?'+new URLSearchParams({
   sku:w.sku,item_id:w.itemId,model_id:w.modelId}),{signal:AbortSignal.timeout(60000)});
  if(optimizerWorkflowPlan!==w||optimizerWorkflowStage!=='technical')return;
  Object.assign(w,{sourceEvidence:fresh.sourceEvidence,sourceFacts:fresh.sourceFacts,
   supplierProduct:fresh.supplierProduct,attributeSuggestions:fresh.attributeSuggestions,
   attributes:fresh.attributes,technicalDraft:fresh.technicalDraft,shopId:fresh.shopId});
  optimizerTechnicalRender(w);
  optimizerTechNotice('✓ Texto salvo e ficha atualizada com as sugestões da WeDrop. Só os campos sem informação precisam ser revisados.','success');
 }catch(e){if(optimizerWorkflowPlan===w)
  optimizerTechNotice('Texto mantido no rascunho. Não foi possível atualizar sugestões: '+e.message,'warning');}
}
$('#optimizerTechText')?.addEventListener('input',e=>void techSaveText(e.target.value));
$('#optimizerTechText')?.addEventListener('blur',()=>void techRefreshSuggestions());
$('#optimizerSourceText')?.addEventListener('input',e=>void techSaveText(e.target.value));
$('#optimizerTechnicalFields')?.addEventListener('input',()=>void techSaveFields());
function optimizerTechNotice(message,state='info'){
 const notice=$('#optimizerTechStatus');if(notice){notice.textContent=message;notice.dataset.state=state;}
}
function optimizerTechnicalSummary(data){
 const target=$('#optimizerTechnicalSummary');if(!target)return;
 target.replaceChildren();
 const attrs=(data.attributes||[]),changes=optimizerTechnicalValues();
 const suggested=data.sourceFacts?.suggestions||[];
 const technicalStats=globalThis.RATechnicalStatus?.compute({
  attributes:attrs,changes,conflicts:data.sourceFacts?.conflicts||[],
  reviewed:data.stages?.find(x=>x.key==='technical')?.reviewed===true
 });
 const conflicts=(data.sourceFacts?.conflicts||[]).filter(x=>
   attrs.some(a=>Number(a.id)===Number(x.attributeId)&&!a.conditional)&&
   !changes.some(change=>Number(change.attributeId)===Number(x.attributeId)&&
    change.values?.some(v=>String(v.valueName||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'')
     .trim().toLowerCase()===String(x.recommended||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'')
     .trim().toLowerCase())));
 const unresolved=(data.sourceFacts?.unresolved||[]).filter(x=>x.value);
 const index=new Map(attrs.map(x=>[Number(x.id),x]));
 const chosen=changes.filter(x=>x.values?.some(v=>v.valueName&&v.valueId!==-1));
 const current=attrs.filter(x=>x.values?.length).length;
 const mandatory=attrs.filter(x=>x.mandatory&&!x.conditional&&!x.values?.length&&
   !chosen.some(c=>c.attributeId===Number(x.id)&&c.values.some(v=>v.valueName&&v.valueId!==-1)));
 const header=optimizerMake('div','optimizer-tech-summary-head');
 const title=optimizerMake('div');
 title.append(optimizerMake('strong','','② Prévia do preenchimento'),
  optimizerMake('small','','Dados da categoria '+String(data.categoryId||'—')+' · antes de enviar para a Shopee'));
 header.append(title);target.append(header);
 const stats=optimizerMake('div','optimizer-tech-summary-stats');
 const tile=(number,label,type)=>{
  const div=optimizerMake('div','optimizer-tech-summary-stat '+type);
  div.append(optimizerMake('strong','',String(number)),optimizerMake('span','',label));
  stats.append(div);
 };
 tile(technicalStats?.prepared??chosen.length,'Alterações para revisar','ok');
 tile(technicalStats?.inShopee??current,'Já preenchidos na Shopee','neutral');
 tile(technicalStats?.mandatoryMissing??mandatory.length,'Obrigatórios pendentes',mandatory.length?'warn':'ok');
 tile(technicalStats?.conflicts??conflicts.length,'Divergências WeDrop',conflicts.length?'warn':'neutral');
 target.append(stats);
 if(conflicts.length){
  const box=optimizerMake('div','optimizer-tech-source-conflicts');
  box.append(optimizerMake('strong','','⚠ Divergências entre a ficha salva e as informações WeDrop desta SKU'));
  for(const conflict of conflicts.slice(0,12)){
   const item=optimizerMake('p','optimizer-source-conflict',
    optimizerTechLabel(conflict.name)+': salvo "'+String(conflict.current).slice(0,100)+
    '" · WeDrop informa "'+String(conflict.recommended).slice(0,100)+'".');
   const go=optimizerMake('button','secondary','Conferir e corrigir');
   go.type='button';
   go.onclick=()=>{
    const details=$('#optimizerTechnicalAdvanced');
    const container=$('#optimizerTechnicalFields');
    if(details)details.open=true;
    if(!container){optimizerTechNotice('Os campos da ficha técnica não estão disponíveis. Recarregue a ficha e tente novamente.','warning');return;}
    const fields=[...container.querySelectorAll('fieldset[data-attribute-id]')];
    const normalize=value=>String(value||'').normalize('NFD').replace(/\p{M}/gu,'').toLowerCase().replace(/[^a-z0-9]/g,'');
    const field=fields.find(f=>Number(f.dataset.attributeId)===Number(conflict.attributeId))||
      fields.find(f=>normalize(f.querySelector('legend')?.textContent)===normalize(optimizerTechLabel(conflict.name)))||
      fields.find(f=>normalize(f.querySelector('legend')?.textContent).includes(normalize(optimizerTechLabel(conflict.name))));
    if(!field){
      optimizerTechNotice('O atributo '+optimizerTechLabel(conflict.name)+' não está disponível nos campos editáveis desta categoria. Atualize a ficha técnica ou confira a categoria Shopee antes de corrigir.','warning');
      return;
    }
    field.hidden=false;
    for(let parent=field.parentElement;parent&&parent!==container.parentElement;parent=parent.parentElement){
      if(parent.tagName==='DETAILS')parent.open=true;
      if(parent.hidden)parent.hidden=false;
    }
    const opt=field.closest('.optimizer-tech-optional');if(opt)opt.open=true;
    const group=field.closest('.ra-tech-attribute-group');if(group)group.open=true;
    const compact=field.closest('.ra-tech-field-row');if(compact)compact.open=true;
    field.scrollIntoView({behavior:'smooth',block:'center'});
    const input=field.querySelector('input:not([type=hidden]),select,textarea');
    if(input)input.focus({preventScroll:true});
    else optimizerTechNotice('O campo foi localizado, mas não oferece edição nesta categoria. Verifique os dados oficiais antes de prosseguir.','warning');
   };
   item.append(document.createTextNode(' '),go);box.append(item);
  }
  target.append(box);
 }
 if(unresolved.length){
  const requiredUnresolved=unresolved.filter(x=>attrs.some(a=>
   Number(a.id)===Number(x.attributeId)&&a.mandatory&&!a.conditional&&
   !a.values?.length&&!chosen.some(v=>v.attributeId===Number(a.id))));
  if(requiredUnresolved.length)target.append(optimizerMake('p','optimizer-tech-warning',
   requiredUnresolved.length+' atributo(s) obrigatório(s) dependem de uma opção oficial da Shopee. Confira antes de concluir.'));
  const optionalUnresolved=unresolved.length-requiredUnresolved.length;
  if(optionalUnresolved>0){
   const more=optimizerMake('details','optimizer-tech-nonblocking-suggestions');
   more.append(optimizerMake('summary','',optionalUnresolved+
    ' informação(ões) complementares da WeDrop sem opção oficial — opcionais, não bloqueiam'));
   more.append(optimizerMake('p','',
    'O sistema não inventará uma opção da categoria. Essas sugestões permanecem disponíveis para consulta, sem exigir preenchimento ou impedir a conferência.'));
   target.append(more);
  }
 }
 const remaining=technicalStats?.optionalRemaining??0;
 const summaryNote=optimizerMake('p','optimizer-tech-summary-note',
  mandatory.length||conflicts.length?
   'Atenção: '+mandatory.length+' obrigatório(s) pendente(s) e '+conflicts.length+
    ' divergência(s) para conferir. Alterações são somente rascunhos, ainda não publicadas.':
   '✓ Sem pendências obrigatórias ou divergências identificadas. '+
   (chosen.length?chosen.length+' alteração(ões) preparadas para revisão; ':'Nenhuma alteração técnica adicional necessária; ')+
   (technicalStats?.inShopee??current)+' atributo(s) já constam na Shopee. '+
   (remaining?remaining+' campo(s) opcionais podem permanecer vazios. ':'')+
   'Registre a revisão desta etapa quando estiver de acordo.');
 target.append(summaryNote);
 const list=optimizerMake('div','optimizer-tech-summary-list');
 for(const change of chosen.slice(0,18)){
  const attr=index.get(change.attributeId);
  if(!attr)continue;
  const item=optimizerMake('div','optimizer-tech-summary-item');
  const desc=optimizerMake('div','optimizer-tech-summary-desc');
  desc.append(optimizerMake('strong','',optimizerTechLabel(String(attr.name||'Atributo '+change.attributeId),change.attributeId)),
   optimizerMake('span','',change.values.map(x=>optimizerTechValueLabel(x.valueName)+(x.unit?' '+x.unit:'')).join(', ')));
  const proof=suggested.some(x=>Number(x.attributeId)===change.attributeId);
  item.append(desc,optimizerMake('small',proof?'Dado WeDrop · conferir':'Preenchimento registrado ou manual'));
  const edit=optimizerMake('button','secondary','Editar');edit.type='button';
  edit.onclick=()=>{
   const details=$('#optimizerTechnicalAdvanced');details.open=true;
   const field=[...$('#optimizerTechnicalFields').querySelectorAll('fieldset')].find(x=>
      Number(x.dataset.attributeId)===change.attributeId);
   if(field){field.hidden=false;const optional=field.closest('.optimizer-tech-optional');if(optional)optional.open=true;
    const group=field.closest('.ra-tech-attribute-group');if(group)group.open=true;
    const compact=field.closest('.ra-tech-field-row');if(compact)compact.open=true;
    field.scrollIntoView({behavior:'smooth',block:'center'});field.querySelector('input,select')?.focus({preventScroll:true});}
  };
  item.append(edit);list.append(item);
 }
 if(list.childElementCount){
  const details=optimizerMake('details','optimizer-tech-filled-list');
  details.append(optimizerMake('summary','','Ver '+list.childElementCount+' atributo(s) preenchidos e editar'));
  details.append(list);target.append(details);
 }
 if(mandatory.length)target.append(optimizerMake('p','optimizer-tech-warning',
  'Pendente: '+mandatory.map(x=>optimizerTechLabel(x.name,x.id)).slice(0,4).join(', ')+
  (mandatory.length>4?' e outros.':'.')+' Abra os campos apenas quando precisar corrigir.'));
 const info=$('#optimizerTechnicalAdvancedCount');
 if(info)info.textContent=mandatory.length+
  ' obrigatório(s) pendente(s) · '+(technicalStats?.filled??(current+chosen.length))+
  ' atributo(s) com valor · opcionais vazios não bloqueiam';
}
async function optimizerTechRequest(w,action,extra={}){
 return json('/api/shopee/optimizer/workflow/source',{
  method:'POST',headers:{'Content-Type':'application/json'},
  body:JSON.stringify({sku:w.sku,itemId:w.itemId,modelId:w.modelId,action,...extra}),
  signal:AbortSignal.timeout(action==='extract'?120000:90000)
 });
}
async function optimizerTechImport(){
 const w=optimizerWorkflowPlan,button=$('#optimizerTechFill');
 if(!w?.sku||optimizerWorkflowStage!=='technical'||button.disabled)return;
 const sku=w.sku,files=[...($('#optimizerTechFiles')?.files||[])];
 if(files.length>4){optimizerTechNotice('Selecione até 4 prints por vez.','warning');return;}
 for(const file of files){
  if(!['image/png','image/jpeg'].includes(file.type)||!file.size||file.size>4*1024*1024){
   optimizerTechNotice('Print inválido: use JPG/PNG de até 4 MB.','warning');return;
  }
 }
 const input=$('#optimizerTechText'),written=input.value.trim();
 const oldText=String(w.sourceEvidence?.sourceText||'').trim();
 const oldShots=(w.sourceEvidence?.screenshots||[]).length;
 if(!written&&!files.length&&!oldShots&&!w.supplierProduct){
  optimizerTechNotice('Cole as especificações ou selecione um print antes de continuar.','warning');return;
 }
 if(files.length+oldShots>4){
  optimizerTechNotice('Limite de 4 prints por SKU. Exclua os anexos antigos nas miniaturas desta ficha.','warning');return;
 }
 button.disabled=true;
 let warning='',extracted=0,updated=false,success=false;
 try{
  // Prevent a queued autosave from replacing text extracted from newly uploaded prints.
  if(techTextTimer){clearTimeout(techTextTimer);techTextTimer=0;}
  await techTextQueue;
  if(written!==oldText){
   optimizerTechNotice('Salvando texto WeDrop desta SKU...');
   await optimizerTechRequest(w,'text',{sourceText:written});
   updated=true;
  }
  for(let i=0;i<files.length;i++){
   optimizerTechNotice('Guardando print '+(i+1)+' de '+files.length+'...');
   const file=files[i],bytes=new Uint8Array(await file.arrayBuffer());let binary='';
   for(let n=0;n<bytes.length;n+=32768)binary+=String.fromCharCode(...bytes.subarray(n,n+32768));
   await optimizerTechRequest(w,'image',{imageBase64:btoa(binary),mime:file.type,filename:file.name});
   updated=true;
  }
  if(oldShots+files.length){
   optimizerTechNotice('Lendo informações dos prints com IA. Pode levar alguns segundos...');
   try{
    const scanned=await optimizerTechRequest(w,'extract');
    extracted=Number(scanned.extractedCount||0);
    if(extracted)updated=true;
   }catch(error){
    warning='Prints guardados, mas a leitura automática não concluiu: '+error.message+
      ' Você pode colar o texto manualmente.';
   }
  }
  optimizerTechNotice('Aplicando as sugestões às opções oficiais da categoria...');
  if(updated){
   // New evidence always reopens technical review, even if it was approved earlier.
   await json('/api/shopee/optimizer/workflow/review',{
    method:'POST',headers:{'Content-Type':'application/json'},
    body:JSON.stringify({itemId:w.itemId,modelId:w.modelId,sku:w.sku,stage:'technical',reviewed:false}),
    signal:AbortSignal.timeout(60000)
   });
  }
  const refreshed=await json('/api/shopee/optimizer/workflow?'+new URLSearchParams({
   sku:w.sku,item_id:w.itemId,model_id:w.modelId}),{signal:AbortSignal.timeout(90000)});
  if(optimizerWorkflowPlan!==w||optimizerWorkflowStage!=='technical'||w.sku!==sku)return;
  Object.assign(w,refreshed);optimizerWorkflowRender(w);optimizerExecReset();
  // Workflow render enters the technical step again and recalculates the summaries.
  $('#optimizerTechFiles').value='';
  success=true;
  const choices=optimizerTechnicalValues().length;
  optimizerTechNotice(choices+' atributo(s) preparados para conferência.'+
    (extracted?' '+extracted+' dado(s) lido(s) dos prints.':'')+
    (warning?' '+warning:'')+' Nenhuma alteração publicada.',warning?'warning':'success');
 }catch(error){
  optimizerTechNotice('Não foi possível preparar a ficha: '+error.message,'error');
 }finally{
  if(!success&&updated){
   // Source evidence may already have been saved. Preserve entered text and allow retry.
   optimizerSourceNotice('Informações da WeDrop guardadas; recarregue a SKU se o processamento interrompeu.','warning');
  }
  button.disabled=false;
 }
}
$('#optimizerTechFill')?.addEventListener?.('click',()=>void optimizerTechImport());
$('#optimizerTechFiles')?.addEventListener('change',()=>{
 if($('#optimizerTechFiles')?.files?.length&&optimizerWorkflowStage==='technical')
  void optimizerTechImport();
});
$('#optimizerTechnicalFields')?.addEventListener?.('change',event=>{
 const w=optimizerWorkflowPlan;
 if(w&&optimizerWorkflowStage==='technical'){
  // Aprender exclusivamente escolhas REAIS do vendedor. Não aprender padrões
  // inventados, preenchimentos automáticos ou cliques em outras SKUs.
  const field=event.target?.closest?.('fieldset[data-attribute-id]');
  if(event.isTrusted&&field?.querySelector('[data-attribute-enabled]')?.checked){
   const attr=(w.attributes||[]).find(a=>Number(a.id)===Number(field.dataset.attributeId));
   const row=[...field.querySelectorAll('[data-attribute-value]')].map(r=>({
    valueId:Number(r.querySelector('[data-value-id]')?.value||-1),
    valueName:String(r.querySelector('[data-value-name]')?.value||'')
   }));
   if(attr)globalThis.RATechnicalMemory?.learn?.(w,attr,row,{explicit:true});
  }
  optimizerTechnicalSummary(w);
  globalThis.RATechnicalStudio?.refresh?.(w);
  void techSaveFields();
 }
});
function optimizerTechnicalRender(data){
 const cached=techCached(data,'fields');
 const remoteTime=Date.parse(data.technicalDraft?.updatedAt||'')||0;
 const useCached=Array.isArray(cached?.fields)&&Date.parse(cached.updatedAt||'')>remoteTime;
 const manualFields=useCached?cached.fields:(data.technicalDraft?.fields||[]);
 const manualById=new Map(manualFields.map(f=>[Number(f.attributeId),f]));
 // As escolhas que o usuário já salvou nesta SKU podem ensinar padrões SEGUROS
 // da categoria, mesmo que sejam anteriores à versão com memória.
 const memory=globalThis.RATechnicalMemory;
 for(const [id,field] of manualById){
  if(!field.enabled||field.userDisabled)continue;
  const attr=(data.attributes||[]).find(a=>Number(a.id)===id);
  if(attr&&memory?.kind?.(attr.name))memory.learn(data,attr,field.values,{explicit:true});
 }
 if(useCached)setTimeout(()=>{if(optimizerWorkflowPlan===data&&optimizerWorkflowStage==='technical')
  void techFieldSend(data,manualFields);},80);
 const textCache=techCached(data,'text');
 const restoreText=textCache&&Date.parse(textCache.updatedAt||'')>
  (Date.parse(data.sourceEvidence?.updatedAt||'')||0);
 $('#optimizerTechSku').textContent='SKU '+String(data.sku||'—');
 const textBox=$('#optimizerTechText');
 if(textBox)textBox.value=restoreText?String(textCache.text||''):
  String(data.sourceEvidence?.sourceText||'');
 if(restoreText){
  const source=$('#optimizerSourceText');if(source)source.value=textBox.value;
  setTimeout(()=>{if(optimizerWorkflowPlan===data&&optimizerWorkflowStage==='technical')
   void techTextSend(data,textBox.value);},80);
 }
 const countTag=$('#optimizerTechImagesCount'),imageCount=(data.sourceEvidence?.screenshots||[]).length;
 if(data.supplierProduct&&data.sourceEvidence?.sourceText){
  optimizerTechNotice('Dados da WeDrop e texto vinculados a esta SKU. Sugestões compatíveis já aparecem na prévia; use “Ler dados” para interpretar prints.','info');
 }else if(data.supplierProduct){
  optimizerTechNotice('Catálogo WeDrop localizado. Atributos comprovados foram sugeridos automaticamente. Adicione texto ou prints para complementar.','info');
 }
 if(countTag)countTag.textContent=imageCount+' de 4 prints salvos nesta SKU. Confira ou exclua os anexos logo abaixo.';
 const wrap=$('#optimizerTechnicalFields');wrap.replaceChildren();
 if(data.anatel?.applicable){
   wrap.append(optimizerMake('p',data.anatel.requiresAction?'optimizer-warning':'optimizer-category-summary',
     'Anatel • '+data.anatel.message));
 }
 if(data.technicalWarning)wrap.append(optimizerMake('p','optimizer-warning',
  'Atenção: os dados da ficha técnica salva precisam de nova conferência nesta categoria: '+data.technicalWarning));
 const sourceDifferences=data.sourceFacts?.conflicts||[];
 if(sourceDifferences.length)wrap.append(optimizerMake('p','optimizer-warning',
  '⚠ '+sourceDifferences.length+' campo(s) da ficha diferem do texto WeDrop salvo. As escolhas anteriores foram preservadas e precisam de conferência: abra as divergências na prévia e aplique os dados confirmados.'));
 wrap.append(optimizerMake('p','optimizer-category-summary',
  'Ficha técnica oficial da categoria Shopee '+String(data.categoryId||'não identificada')+
  ' · '+(data.attributes||[]).filter(x=>x.mandatory&&!x.conditional).length+
  ' atributos obrigatórios ativos · '+(data.attributes||[]).filter(x=>!x.conditional).length+
  ' campos aplicáveis. Dependências inativas ficam ocultas.'));
 $('#optimizerTechnicalRefresh').hidden=!(data.attributes||[]).some(x=>x.parentId);
 // Campos já cadastrados ou com sugestão comprovada ficam somente na prévia.
 const optionalDetails=optimizerMake('details','optimizer-tech-optional');
 const optionalSummary=optimizerMake('summary','','Outros campos opcionais');
 optionalDetails.append(optionalSummary);
 let optionalMissing=0,autoHidden=0,requiredMissing=0,reusedDefaults=0;
 for(const attr of data.attributes||[]){
  // Children listed by the API but not activated by the current parent choice
  // are not fields to review and must not appear with a misleading "*" marker.
  if(attr.conditional)continue;
  const name=attr.name||'Atributo '+attr.id,type=Number(attr.inputType),custom=[2,3,5].includes(type),multi=[4,5].includes(type);
  const field=optimizerMake('fieldset','optimizer-attribute');field.dataset.attributeId=String(attr.id);
  field.append(optimizerMake('legend','',optimizerTechLabel(name,attr.id)+(attr.mandatory?' *':'')));
  field.append(optimizerMake('small','','Atual: '+((attr.values||[]).map(x=>optimizerTechValueLabel(x.name,x.valueId)+(x.unit?' '+x.unit:'')).join(', ')||'Não preenchido')));
  if(attr.introduction){const tip=optimizerMake('small','','Orientação oficial da categoria');tip.title='Consulte a orientação original na Central do Vendedor Shopee para confirmar este atributo.';field.append(tip);}
  field.append(optimizerMake('small','',attr.conditional?'Condicional • depende do atributo pai':
    attr.mandatory?'Obrigatório na categoria '+data.categoryId:'Opcional na categoria '+data.categoryId));
  wrap.append(field);
  if(![1,2,3,4,5].includes(type)&&!attr.options?.length){field.append(optimizerMake('p','','Campo existente sem esquema editável retornado pela Shopee.'));continue;}
  const suggested=(data.sourceFacts?.suggestions||[]).find(x=>Number(x.attributeId)===attr.id);
  const conflict=(data.sourceFacts?.conflicts||[]).find(x=>Number(x.attributeId)===attr.id);
  if(conflict)field.append(optimizerMake('p','optimizer-source-conflict',
   'Divergência com a fonte desta SKU: '+conflict.current+' → '+conflict.recommended+' (confira o fabricante/fornecedor antes de aplicar).'));
  if(!suggested&&['marca','estampa','numero de registro inmetro'].some(n=>String(name).toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'').includes(n))&&
     !attr.values?.length)field.append(optimizerMake('small','',
       'Sem comprovação automática: cole a ficha do fabricante acima ou selecione uma opção oficial.'));
  const reviewed=(data.attributeChanges||[]).find(x=>Number(x.attributeId)===attr.id);
  // Prefill confirmed supplier facts at OPEN, not behind a second "Usar sugestão"
  // click. A previously saved, deliberate manual edit takes precedence except
  // the invalid brand Novo copied from Shopee's condition NEW.
  const invalidNewBrand=String(name).normalize('NFD').replace(/[\u0300-\u036f]/g,'')
    .toLowerCase()==='marca'&&reviewed?.values?.[0]?.valueName?.trim().toLowerCase()==='novo';
  const manual=manualById.get(Number(attr.id));
  // Um rascunho vazio e não desabilitado intencionalmente NÃO pode apagar
  // um valor que já existe na Shopee ou que foi comprovado pela WeDrop.
  const manualHasValue=Boolean(manual?.values?.some(v=>
   Number(v.valueId)>0||String(v.valueName||'').trim()));
  const manualChoice=Boolean(manual&&(manual.userDisabled||manualHasValue));
  // Ordem: decisão manual efetiva da SKU > revisão salva > valor na Shopee >
  // sugestão comprovada WeDrop para campos ausentes > padrão seguro da loja.
  // Nunca transferir idade, bateria, país, material entre SKUs.
  const reusable=!manualChoice&&!reviewed&&!suggested&&!attr.values?.length?
   memory?.suggest?.(data,attr):null;
  const modelFromSupplier=!manualChoice&&!reviewed&&!suggested&&!attr.values?.length?
   memory?.modelSuggestion?.(data,attr):null;
  const live=memory?.liveDraft?.(attr)||null;
  // Em valores existentes, divergências são para conferência; não substituir
  // silenciosamente o que veio da API pelo texto de fornecedor.
  const auto=(!reviewed||invalidNewBrand)&&(!attr.values?.length||invalidNewBrand)&&!conflict?
   (suggested||reusable||modelFromSupplier):null;
  if(reusable||modelFromSupplier)reusedDefaults++;
  field.dataset.userDisabled=manual?.userDisabled?'true':'false';
  const existing=manualChoice?{values:manual.values,evidence:manual.evidence}:
   (invalidNewBrand&&auto?auto:reviewed||live||auto||
    (data.attributeSuggestions||[]).find(x=>Number(x.attributeId)===attr.id));
  const hasCurrentValue=Boolean(attr.values?.length);
  const hasDraft=Boolean((manualChoice?manual.enabled:true)&&existing?.values?.some(v=>Number(v.valueId)>0||String(v.valueName||'').trim()));
  // Medidas não devem ser interpretadas como finalidade/indicação de uso.
  const normalizedLabel=String(name).normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase();
  const suspiciousUsage=/^(?:indicacao de uso|indication|indication of use|uso indicado)$/.test(normalizedLabel)&&
   (attr.values||[]).some(v=>/^\d+(?:[.,]\d+)?\s*(?:cm|mm|m)$/i.test(
    [v.name,v.unit].filter(Boolean).join(' ').trim()));
  if(suspiciousUsage)field.append(optimizerMake('p','optimizer-source-conflict',
   '⚠ A Shopee retornou uma medida em Indicação de uso. Esse dado precisa ser conferido com a ficha WeDrop; não foi alterado.'));
  if((hasCurrentValue||hasDraft)&&!conflict&&!suspiciousUsage){
   field.hidden=true;field.dataset.autofilled='true';autoHidden++;
  }else if(!attr.mandatory&&!attr.conditional){
   optionalDetails.append(field);optionalMissing++;
  }else requiredMissing++;
  if(auto)field.append(optimizerMake('p','optimizer-source-autofilled',
    '✓ '+(auto.learned?'Padrão aprendido':'Dado da ficha')+': '+
    auto.values.map(x=>optimizerTechValueLabel(x.valueName,x.valueId)).join(', ')+
    ' · Origem: '+auto.evidence+'. Confirme na revisão antes de publicar.'));
  const enableLabel=optimizerMake('label','optimizer-attribute-toggle'),enabled=optimizerMake('input');
  enabled.type='checkbox';enabled.dataset.attributeEnabled='true';enabled.checked=manualChoice?Boolean(manual.enabled):Boolean(existing);
  enabled.setAttribute('aria-label','Preencher '+optimizerTechLabel(name));enableLabel.append(enabled,document.createTextNode(' Preencher este campo'));field.append(enableLabel);
  const controls=optimizerMake('div','optimizer-attribute-controls');controls.hidden=!enabled.checked;field.append(controls);
  const rows=optimizerMake('div');rows.dataset.attributeRows='true';controls.append(rows);
  if(attr.supportSearch){
   const searchBox=optimizerMake('div','optimizer-attribute-search');
   const inputSearch=optimizerMake('input');inputSearch.type='search';inputSearch.placeholder='Buscar opções oficiais na Shopee';
   inputSearch.maxLength=90;inputSearch.setAttribute('aria-label','Pesquisar opções de '+optimizerTechLabel(name));
   const runSearch=optimizerMake('button','secondary','Pesquisar opções');
   runSearch.type='button';
   const next=optimizerMake('button','secondary','Ver mais opções');next.type='button';next.hidden=true;
   const help=optimizerMake('small','','');
   let nextCursor=0,queryText='',busy=false;
   async function loadPage(reset=false){
    if(busy)return;
    const w=optimizerWorkflowPlan;if(!w||w.sku!==data.sku)return;
    const entered=inputSearch.value.trim();
    if(reset||queryText!==entered){nextCursor=0;queryText=entered;}
    busy=true;runSearch.disabled=true;next.disabled=true;help.textContent='Consultando a Shopee...';
    try{
     const response=await json('/api/shopee/optimizer/workflow/attributes/options',{
      method:'POST',headers:{'Content-Type':'application/json'},
      body:JSON.stringify({sku:w.sku,itemId:w.itemId,modelId:w.modelId,attributeId:attr.id,
       attributes:optimizerTechnicalValues(),valueName:queryText,cursor:nextCursor,limit:50}),
      signal:AbortSignal.timeout(50000)
     });
     if(optimizerWorkflowPlan!==w||optimizerWorkflowStage!=='technical')return;
     const options=new Map((attr.options||[]).map(x=>[Number(x.id),x]));
     for(const option of response.options||[])options.set(Number(option.id),option);
     attr.options=[...options.values()];
     for(const select of field.querySelectorAll('select[data-value-id]')){
      const selected=select.value;
      for(const option of response.options||[]){
       if([...select.options].some(o=>o.value===String(option.id)))continue;
       const element=optimizerMake('option','',optimizerTechValueLabel(option.name,option.id)+(option.unit?' '+option.unit:''));
       element.value=String(option.id);
       select.append(element);
      }
      select.value=selected;
     }
     nextCursor=response.nextCursor??0;next.hidden=!response.hasNext;
     help.textContent=(response.options||[]).length+' opção(ões) carregadas. Escolha o valor oficial no campo.';
    }catch(e){help.textContent='Erro ao consultar opções: '+e.message;}
    finally{busy=false;runSearch.disabled=false;next.disabled=false;}
   }
   runSearch.onclick=()=>void loadPage(true);
   next.onclick=()=>void loadPage(false);
   inputSearch.onkeydown=e=>{if(e.key==='Enter'){e.preventDefault();void loadPage(true);}};
   searchBox.append(inputSearch,runSearch,next,help);
   controls.append(searchBox);
  }

  function addRow(value={}){
   const row=optimizerMake('div','optimizer-attribute-value');row.dataset.attributeValue='true';
   const select=optimizerMake('select');select.dataset.valueId='true';select.setAttribute('aria-label',optimizerTechLabel(name)+' — opção');
   const blank=optimizerMake('option','','Selecione uma opção');blank.value='';select.append(blank);
   for(const option of (attr.options||[]).filter(x=>x.id>0)){
    const item=optimizerMake('option','',optimizerTechValueLabel(option.name,option.id)+(option.unit?' '+option.unit:''));item.value=String(option.id);select.append(item);
   }
   if(custom){const other=optimizerMake('option','','Informar valor');other.value='0';select.append(other);}
   select.value=value.valueId!==undefined?String(value.valueId):type===3||!attr.options?.length?'0':'';
   select.hidden=type===3||(!attr.options?.length&&custom&&!attr.supportSearch);row.append(select);
   const input=optimizerMake('input');input.type=Number(attr.validationType)===4?'date':'text';input.maxLength=500;
   input.dataset.valueName='true';input.setAttribute('aria-label',optimizerTechLabel(name)+' — valor');
   input.placeholder='Informe somente um valor confirmado do fabricante ou fornecedor';
   input.value=Number(attr.validationType)===4&&/^\d+$/.test(String(value.valueName||''))?
    new Date(Number(value.valueName)*1000).toISOString().slice(0,10):String(value.valueName||'');row.append(input);
   const units=(attr.allowedUnits||[]).map(x=>typeof x==='string'?x:x.unit||x.name||'').filter(Boolean);
   let unit;
   if(units.length){
    unit=optimizerMake('select');unit.dataset.valueUnit='true';unit.setAttribute('aria-label',optimizerTechLabel(name)+' — unidade');
    const empty=optimizerMake('option','','Unidade');empty.value='';unit.append(empty);
    for(const u of units){const o=optimizerMake('option','',u);o.value=u;unit.append(o);}unit.value=value.unit||'';row.append(unit);
   }
   const show=()=>{input.hidden=select.value!=='0';if(unit)unit.hidden=select.value!=='0';optimizerExecReset();};
   select.onchange=show;input.oninput=()=>optimizerExecReset();if(unit)unit.onchange=()=>optimizerExecReset();show();
   if(multi){const remove=optimizerMake('button','secondary','Remover valor');remove.type='button';remove.onclick=()=>{row.remove();optimizerExecReset();};row.append(remove);}
   rows.append(row);
  }
  for(const value of existing?(existing.values||[existing]):[{}])addRow(value);
  if(suggested&&!auto){
   const apply=optimizerMake('button','secondary','Aplicar dado WeDrop: '+optimizerTechValueLabel(suggested.values[0].valueName,suggested.values[0].valueId));
   apply.type='button';
   apply.onclick=()=>{
    enabled.checked=true;controls.hidden=false;rows.replaceChildren();
    for(const v of suggested.values)addRow(v);
    evidence.value=suggested.evidence;
    optimizerExecReset();
    optimizerWorkflowNotice('Sugestão aplicada em '+optimizerTechLabel(name,attr.id)+'. Confira e registre a revisão técnica antes de executar.','info');
   };
   field.append(apply);
  }
  if(multi){const add=optimizerMake('button','secondary','Adicionar valor');add.type='button';
   add.onclick=()=>{if(rows.children.length<(Number(attr.maxValues)>0?Number(attr.maxValues):20))addRow();};controls.append(add);}
  const evidence=optimizerMake('input');evidence.type='text';evidence.maxLength=500;evidence.placeholder='Fonte (opcional): WeDrop, fabricante, nota ou declaração do vendedor';
  evidence.dataset.evidenceFor=String(attr.id);evidence.setAttribute('aria-label',optimizerTechLabel(name)+' — fonte');
  evidence.value=optimizerSellerDeclaredEvidence(attr,existing?.values||[],existing?.evidence||'');
  if(evidence.value==='Informado e confirmado pelo vendedor'){
    evidence.title='Fonte declarada por você. Valor do país ou quantidade definido no campo acima; não inferido pelo sistema.';
  }
  evidence.oninput=()=>optimizerExecReset();controls.append(evidence);
  enabled.onchange=()=>{field.dataset.userDisabled=(!enabled.checked).toString();controls.hidden=!enabled.checked;optimizerExecReset();};
 }
 if(optionalMissing){
  optionalSummary.textContent='Mostrar '+optionalMissing+' atributo(s) opcionais sem informação comprovada';
  wrap.append(optionalDetails);
 }
 if(!wrap.children.length)wrap.append(optimizerMake('p','','A categoria não retornou atributos.'));
 wrap.prepend(optimizerMake('p','optimizer-tech-compact-summary',
  '✓ '+autoHidden+' preenchidos/recuperados · '+requiredMissing+
  ' precisam de conferência'+(optionalMissing?' · '+optionalMissing+' opcionais recolhidos':'')));
 optimizerTechnicalSummary(data);
 globalThis.RATechnicalStudio?.render?.(data);
 if(reusedDefaults){
  optimizerTechNotice('✓ '+reusedDefaults+' campo(s) opcionais preparados com padrões confirmados desta categoria ou nome da WeDrop. Confira antes de executar; país, idade, bateria e certificações exigem comprovação da SKU.','success');
  // Persistir estes rascunhos da SKU sem editar anúncios na Shopee.
  setTimeout(()=>{if(optimizerWorkflowPlan===data&&optimizerWorkflowStage==='technical')
   void techSaveFields();},150);
 }
}
function optimizerTechnicalValues(){
 const metadata=optimizerWorkflowPlan?.attributes||[];
 const same=(a,b)=>{
  const normalized=rows=>(rows||[]).map(v=>{
   const id=Number(v.valueId);
   return id>0?'id:'+id:'value:'+String(v.valueName??v.name??'').trim()+':'+String(v.unit||'').trim().toLowerCase();
  }).sort();
  const x=normalized(a),y=normalized(b);
  return x.length===y.length&&x.every((v,i)=>v===y[i]);
 };
 return [...$('#optimizerTechnicalFields').querySelectorAll('fieldset[data-attribute-id]')]
  .filter(field=>field.querySelector('[data-attribute-enabled]')?.checked)
  .map(field=>{
   const attributeId=Number(field.dataset.attributeId);
   const attr=metadata.find(a=>Number(a.id)===attributeId);
   if(!attr||attr.conditional)return null;
   const values=[...field.querySelectorAll('[data-attribute-value]')].map(row=>{
    const input=row.querySelector('[data-value-name]'),
     raw=String(input?.value||'').trim(),
     selected=row.querySelector('[data-value-id]')?.value??'';
    const official=Number(selected)>0?(attr.options||[]).find(o=>Number(o.id)===Number(selected)):null;
    return {valueId:selected===''?-1:Number(selected),
     valueName:official?.name||(input?.type==='date'&&raw?String(Date.parse(raw+'T00:00:00Z')/1000):raw),
     unit:row.querySelector('[data-value-unit]')?.value||''};
   });
   // Incomplete optional controls and values already live on Shopee are not edits.
   // Server independently rechecks real mandatory fields after parent changes.
   if(!values.length||values.some(v=>!(v.valueId>0||(v.valueId===0&&v.valueName.trim()))))return null;
   if(same(values,attr.values))return null;
   const source=field.querySelector('[data-evidence-for]');
   const evidence=optimizerSellerDeclaredEvidence(attr,values,source?.value);
   if(source&&evidence&&!source.value.trim())source.value=evidence;
   return {attributeId,evidence,values};
  }).filter(Boolean);
}
$('#optimizerTechnicalRefresh')?.addEventListener?.('click',async()=>{
 const w=optimizerWorkflowPlan,attributes=optimizerTechnicalValues(),btn=$('#optimizerTechnicalRefresh');if(!w)return;
 btn.disabled=true;
 try{
  const result=await json('/api/shopee/optimizer/workflow/attributes/preview',{method:'POST',headers:{'Content-Type':'application/json'},
   body:JSON.stringify({itemId:w.itemId,modelId:w.modelId,sku:w.sku,attributes}),signal:AbortSignal.timeout(60000)});
  if(optimizerWorkflowPlan!==w||optimizerWorkflowStage!=='technical')return;
  w.attributes=result.attributes;w.attributeChanges=attributes;w.anatel=result.anatel;optimizerTechnicalRender(w);
  optimizerWorkflowNotice('Opções dependentes atualizadas. Confira os campos liberados.');
 }catch(e){optimizerWorkflowNotice(e.message,'error');}finally{btn.disabled=false;}
});
const optimizerTaxLabels={ncm:'NCM do produto (8 dígitos)',origin:'Origem',same_state_cfop:'CFOP mesmo estado',
 diff_state_cfop:'CFOP outros estados',csosn:'CSOSN',measure_unit:'Unidade de medida',cest:'CEST (se aplicável)',
 pis_cofins_cst:'PIS e COFINS CST (padrão 99 — Outras Operações)',operation_type:'Tipo de operação: 1 Revendedor / 2 Fabricante',evidence:'Fonte e validação fiscal desta SKU'};
function optimizerFiscalRender(data){
 const wrap=$('#optimizerFiscalFields');wrap.replaceChildren();
 const defaults=data.taxSuggestion||{},saved=data.taxDraft||{};
 // Regras da loja sugerem CST 99 de PIS/COFINS para o cadastro Shopee.
 // Valores específicos já salvos ou presentes na Shopee não são sobrescritos.
 // CEST 00 = ausência de código na WeDrop, para esta SKU.
 // CEST de 7 dígitos só vem da planilha WeDrop, não da API da Shopee,
 // nem de valores fiscais antigos carregados da publicação.
 const draft={...(data.taxCurrent||{}),...defaults,...saved};
 // Rascunho antigo vazio não pode esconder uma sugestão comprovada pela WeDrop
 // ou pelas regras já cadastradas no Motor Matriz.
 for(const [key,value] of Object.entries(defaults)){
  if(!String(draft[key]??'').trim()&&String(value??'').trim())draft[key]=value;
 }
 // CEST do formulário vem EXCLUSIVAMENTE do CSV WeDrop da SKU vinculada.
 // Jamais reutilizar o CEST salvo anteriormente ou o valor recebido da Shopee.
 const liveCest=String(data.taxCurrent?.cest??'').trim();
 const suggestedCest=String(defaults.cest??'').trim();
 draft.cest=/^\d{7}$/.test(suggestedCest)?suggestedCest:'00';
 const existingPis=String(saved.pis_cofins_cst||data.taxCurrent?.pis_cofins_cst||'').trim();
 if(existingPis)draft.pis_cofins_cst=existingPis;
 const summary=optimizerMake('p','optimizer-category-summary',
  'Motor Matriz · preenchimento automático da SKU '+(data.sku||'')+
  '. Os campos abaixo são uma prévia do Shopee Manager; a Central do Vendedor só muda após execução e confirmação da API.');
 wrap.append(summary);
 if(liveCest&&liveCest!==draft.cest){
  const divergence=optimizerMake('p','optimizer-warning',
    '⚠ CEST DIVERGENTE: Shopee apresenta '+liveCest+', mas a planilha WeDrop da SKU '+
    (data.sku||'')+' '+(draft.cest==='00'?'NÃO informa CEST.':'informa '+draft.cest+'.')+
    ' Valor preparado no Motor Matriz: '+draft.cest+
    '. O CEST antigo não será reutilizado. Para corrigir a Shopee, faça uma NOVA prévia exclusivamente fiscal e autorize o envio; a Shopee poderá recusar 00 porque não é CEST de 7 dígitos. O resultado precisa ser verificado.');
  wrap.append(divergence);
 }
 for(const [key,label] of Object.entries(optimizerTaxLabels)){
  const field=optimizerMake('label','optimizer-field',label),input=optimizerMake('input');
  const value=String(draft[key]??'');
  input.type='text';input.dataset.taxField=key;input.value=value;input.maxLength=key==='evidence'?300:20;
  if(key==='cest'){input.readOnly=true;input.title='CEST somente da planilha WeDrop da SKU; sem informação, 00.';}
  if(value&&key!=='evidence'){
   const savedValue=Object.hasOwn(saved,key)&&String(saved[key]??'').trim()!==''&&saved[key]===draft[key];
   const origin=key==='cest'?
     ((data.taxSuggestionSources||{}).cest||'Motor Matriz · 00, sem CEST informado pela WeDrop'):
     savedValue?'Revisão salva desta SKU':
     (data.taxSuggestionSources||{})[key]||'Informação fiscal obtida do anúncio';
   const provenance=optimizerMake('small','optimizer-fiscal-filled',
     '✓ '+(savedValue?'Valor já salvo':'Pré-preenchido automaticamente')+' · '+origin);
   field.append(provenance);
  }
  input.oninput=()=>optimizerExecReset();field.append(input);wrap.append(field);
  if(key==='pis_cofins_cst'){
   input.placeholder='99';
   field.append(optimizerMake('small','optimizer-fiscal-cest-help',
    'Motor Matriz: padrão da loja 99 (Outras Operações). Pode ser alterado conforme a contabilidade e os dados específicos da SKU. O cadastro Shopee não substitui o CST da NF-e.'));
  }
 }
 const cest=wrap.querySelector('[data-tax-field="cest"]');
 if(cest){
  const marker=String(draft.cest||'').trim()==='00';
  const info=optimizerMake('small','optimizer-fiscal-cest-help',marker
    ?'WeDrop sem CEST confirmado para esta SKU: 00 é um marcador de ausência, NÃO é um CEST fiscal de 7 dígitos. Uma tentativa explícita de edição poderá ser recusada pela Shopee. '+
     (liveCest&&liveCest!=='00'?'CEST publicado na Shopee: '+liveCest+' — não foi modificado. ':'')+
     'Para emissão fiscal, confirmar o enquadramento com a contabilidade.'
    :'CEST de 7 dígitos obtido da planilha WeDrop desta SKU. Confira o enquadramento fiscal antes do envio. '+
     (liveCest&&liveCest!==draft.cest?'Shopee informa '+liveCest+' — não foi modificado.':'') );
  cest.closest('label')?.append(info);
 }
}
function optimizerFiscalValues(){
 return Object.fromEntries([...$('#optimizerFiscalFields').querySelectorAll('input')].map(x=>[x.dataset.taxField,x.value.trim()]));
}
// Imagens OpenAI: cada etapa salva o arquivo no Supabase; somente a revisão explícita permite executar na Shopee.
let optimizerImagesAutoBusy=false,optimizerImagesStopRequested=false;
let optimizerImagesSavedSlots=new Set(),optimizerImagesApiConfigured=false;
let optimizerImagesFilter='all';
const optimizerCommercialPositionNames=["Capa","Uso real","Especificações","Benefícios","Dor e solução","Persuasão","Transformação","Quebra de objeções","Mockup e confiança"];
function optimizerCommercialSetFilter(filter){
 if(!['all','pending','saved'].includes(filter))return;
 optimizerImagesFilter=filter;
 for(const id of ['all','pending','saved']){
  const button=$('#optimizerImagesFilter'+id[0].toUpperCase()+id.slice(1));
  if(button){button.classList.toggle('is-active',id===filter);button.setAttribute('aria-pressed',String(id===filter));}
 }
 void optimizerImagesLoad();
}
for(const [name,filter] of [['All','all'],['Pending','pending'],['Saved','saved']])
 $('#optimizerImagesFilter'+name)?.addEventListener?.('click',()=>optimizerCommercialSetFilter(filter));
for(const id of ['optimizerCommercialRules','optimizerCommercialShowRules'])
 $('#'+id)?.addEventListener?.('click',()=>{
  const guidance=$('#optimizerWorkflowStageGuidance');
  guidance.hidden=!guidance.hidden;
  const button=$('#optimizerCommercialRules');if(button)button.setAttribute('aria-expanded',String(!guidance.hidden));
 });

let optimizerImagesMode=null;
let optimizerChatgptBrief=null,optimizerChatgptBriefSku='';
function optimizerImagesRenderMode(){
 const mode=optimizerImagesMode||'chatgpt';
 const chat=mode==='chatgpt';
 $('#optimizerImagesChatgptPanel').hidden=!chat;
 $('#optimizerImagesApiPanel').hidden=chat;
 $('#optimizerModeApi').setAttribute('aria-pressed',String(!chat));
 $('#optimizerModeApi').classList.toggle('is-active',!chat);
}
async function optimizerChatgptMakeBrief(w,{defaultOnly=false}={}){
 const {createChatGptPrompts}=await import('/chatgptPrompts.js?v=1.21.85-assembled-track-clean03');
 return createChatGptPrompts({
  sku:w.sku,title:w.draftTitle||'Produto Shopee',
  imageUrls:w.imageUrls||[],
  attributes:w.attributes||[],
  imageNotes:w.imageNotes||{},
  imagePrompts:defaultOnly?{}:(w.imagePrompts||{}),
  masterPrompt:$('#optimizerPrompt')?.value||'',
  supplierSourceText:(String(w.sourceEvidence?.sku||'')===String(w.sku)&&
   ['exact-sku','reviewed-link'].includes(String(w.supplierProduct?.matchedBy||'')))?
   (w.sourceEvidence?.sourceText||''):'',

  supplierProduct:w.supplierProduct||null,
  supplierMetrics:w.sourceFacts?.metrics||[]
 });
}
async function optimizerChatgptRender(w){
 try{
  const brief=await optimizerChatgptMakeBrief(w);
  if(!optimizerImagesSameSku(w))return;
  optimizerChatgptBrief=brief;
  optimizerChatgptBriefSku=[w.sku,w.itemId,w.modelId].join('|');
  const original=$('#optimizerChatgptOriginal');
  original.hidden=!brief.original;
  if(brief.original)original.href=brief.original;
  else original.removeAttribute('href');
  const list=$('#optimizerChatgptPromptList');
  list.replaceChildren();
  for(let i=0;i<9;i++){
   const card=optimizerMake('div','optimizer-chatgpt-prompt-item');
   card.append(optimizerMake('span','',brief.scenes[i].label));
   const copy=optimizerMake('button','secondary','Copiar prompt '+String(i+1).padStart(2,'0'));
   copy.type='button';
   copy.onclick=async()=>{
    try{
     await navigator.clipboard.writeText(brief.prompts[i]);
     $('#optimizerChatgptCopyStatus').textContent='Pedido da imagem '+String(i+1).padStart(2,'0')+' copiado. Anexe a mesma foto original no ChatGPT antes de gerar.';
    }catch(e){$('#optimizerChatgptCopyStatus').textContent='Não foi possível copiar: '+String(e.message||e);}
   };
   card.append(copy);
   list.append(card);
  }
 }catch(e){$('#optimizerChatgptCopyStatus').textContent='Não foi possível preparar os pedidos: '+e.message;}
}
// A imagem preparada é lida de forma autenticada e comprimida apenas para
// ser anexada no ChatGPT. Nenhum dado privado é enviado a serviços adicionais.
async function optimizerImageEditReference(w,slot){
 const q=new URLSearchParams({sku:w.sku,item_id:w.itemId,model_id:w.modelId,slot});
 const res=await fetch('/api/shopee/optimizer/images/reference?'+q,{credentials:'same-origin',cache:'no-store',signal:AbortSignal.timeout(45000)});
 if(!res.ok){
  const data=await res.json().catch(()=>({}));
  throw Error(data.error||'Não foi possível carregar a imagem '+slot+' para edição (HTTP '+res.status+').');
 }
 const raw=await res.blob();
 if(!/^image\/(png|jpeg)$/.test(raw.type)||raw.size<1024||raw.size>10*1024*1024)
  throw Error('Arquivo da imagem preparada inválido para edição.');
 const bitmap=await createImageBitmap(raw);
 try{
  const canvas=document.createElement('canvas');
  const ratio=Math.min(1,1024/Math.max(bitmap.width,bitmap.height));
  canvas.width=Math.max(1,Math.round(bitmap.width*ratio));
  canvas.height=Math.max(1,Math.round(bitmap.height*ratio));
  const ctx=canvas.getContext('2d',{alpha:false});
  if(!ctx)throw Error('Chrome não permitiu preparar a imagem de referência.');
  ctx.fillStyle='#ffffff';ctx.fillRect(0,0,canvas.width,canvas.height);
  ctx.drawImage(bitmap,0,0,canvas.width,canvas.height);
  const dataUrl=canvas.toDataURL('image/jpeg',0.88);
  if(!/^data:image\/jpeg;base64,[A-Za-z0-9+/=]+$/.test(dataUrl)||dataUrl.length>5*1024*1024)
   throw Error('A imagem preparada excede o limite de envio à extensão.');
  return dataUrl;
 }finally{bitmap.close();}
}
async function optimizerCommercialRequestChatgptSlot(w,slot,{editMode=''}={}){
 if(!optimizerImagesSameSku(w))return;
 const status=$('#optimizerImagesStatus');
 if(optimizerChatBridgeBusy){
  const job=optimizerChatBridgeJob;
  if(optimizerChatBridgeIdentity(job,w)&&job?.slots?.length===1&&Number(job.slots[0])===Number(slot)){
   if(await optimizerChatBridgeRecover({includeBlocked:true})){
    const msg='A imagem '+String(slot).padStart(2,'0')+' já está sendo recuperada. Aguarde o upload, ou pause a geração para refazer.';
    status.textContent=msg;optimizerCommercialActionMessage(msg);return;
   }
  }
  // Refazer é uma ordem explícita: interromper a tentativa antiga da SKU
  // antes de iniciar a posição selecionada. Imagens anteriores permanecem no servidor.
  await optimizerChatBridgeRelease('Execução anterior pausada para refazer somente a imagem '+slot+'.');
 }
 if(!optimizerChatBridgeReady){
  const msg='Não foi possível refazer a imagem '+String(slot).padStart(2,'0')+': a Ponte ChatGPT v1.0.26 ou superior não está detectada. Ative uma única extensão no Chrome e atualize esta página. Nenhuma imagem foi apagada.';
  status.textContent=msg;optimizerCommercialActionMessage(msg,true);return;
 }
 try{
  if(optimizerChatBridgeIdentity(optimizerChatBridgeJob,w)&&optimizerChatBridgeJob?.slots?.length===1&&Number(optimizerChatBridgeJob.slots[0])===Number(slot)&&!optimizerChatBridgeJob.complete&&await optimizerChatBridgeRecover({includeBlocked:true}))return;
  const brief=await optimizerChatgptMakeBrief(w);
  if(!brief.original)throw Error('Não há fotografia original da Shopee para esta SKU.');
  if(editMode&&!['improve','white-bg','custom'].includes(editMode))throw Error('Tipo de edição não permitido.');
  const prompts=[...brief.prompts];
  let referenceDataUrl='';
  if(editMode){
   if(!optimizerImageCorrectionPreviewMap.has(slot))throw Error('A imagem '+slot+' não está salva. Não é possível editar sem a fotografia atual.');
   referenceDataUrl=await optimizerImageEditReference(w,slot);
   if(!optimizerImagesSameSku(w))throw Error('A SKU mudou durante o carregamento da imagem.');
   const pos=String(slot).padStart(2,'0');
   if(editMode==='improve')prompts[slot-1]=[
    brief.prompts[slot-1],
    'EDIÇÃO DA FOTO PREPARADA ANEXADA DA POSIÇÃO '+pos+': crie uma nova versão da MESMA fotografia e do MESMO produto, com ângulo de câmera claramente diferente, enquadramento mais sofisticado, iluminação refinada e fundo ambientado moderno relacionado ao uso real. Não mudar o formato, as cores, os materiais, o número de peças, as marcas nem o conteúdo do produto. A imagem comercial anterior está anexada como referência. Gere somente UMA imagem nova, individual.',
   ].join('\n\n');
   if(editMode==='white-bg')prompts[slot-1]=[
    'REDE ACHADOS BR — EDIÇÃO DA IMAGEM '+pos+'/09 DA SKU '+w.sku+' — '+(w.draftTitle||'Produto'),
    'Edite EXCLUSIVAMENTE a imagem preparada anexada. Recorte fielmente o mesmo produto e retire totalmente o fundo atual. Substitua o cenário por BRANCO PURO (#FFFFFF), sem objetos, sem textura e sem decoração. Preserve geometria, escala, cores, componentes, número de peças, marcas originais e a disposição real. Permita apenas sombra suave e discreta, sem inventar acessórios. Remova quaisquer rótulos promocionais da fotografia anterior, sem apagar marcas físicas reais do produto. Imagem única, quadrada, para 1200 × 1200 pixels. Não colocar títulos nem textos. NÃO usar fundo ambientado nesta edição. Gere apenas esta imagem.',
   ].join('\n\n');
  }
  optimizerChatBridgeNonce=crypto.randomUUID();
  optimizerChatBridgeSku=w.sku;
  sessionStorage.setItem(RA_CHAT_BRIDGE_SESSION_KEY,optimizerChatBridgeNonce);
  const current=await json('/api/shopee/optimizer/images/manual?'+new URLSearchParams({
   sku:w.sku,item_id:w.itemId,model_id:w.modelId
  }));
  if(!optimizerImagesSameSku(w))return;
  const original=(current.images||[]).find(x=>Number(x.slot)===slot);
  optimizerChatBridgeRemember(w,[slot],original?.sha256?{[slot]:original.sha256}:{});
  optimizerChatBridgeBusy=true;
  $('#optimizerChatgptAbort').hidden=false;
  status.textContent='Solicitando à extensão a imagem '+slot+' da SKU '+w.sku+'. Aguarde confirmação do upload.';
  optimizerChatBridgeStartConfirmed=false;
  const activeNonce=optimizerChatBridgeNonce;
  window.postMessage({kind:'RA_SITE_START',payload:{
   nonce:optimizerChatBridgeNonce,sku:w.sku,itemId:String(w.itemId),modelId:String(w.modelId),
   imageUrl:brief.original,prompts,referenceDataUrl,imageMode:editMode,
   // Só esta posição é autorizada. A próxima requer outro comando.
   completed:Array.from({length:9},(_,i)=>i+1).filter(n=>n!==slot)
  }},location.origin);
  setTimeout(()=>{
   if(!optimizerChatBridgeStartConfirmed&&optimizerChatBridgeNonce===activeNonce&&optimizerChatBridgeBusy){
    void optimizerChatBridgeRelease('A extensão não confirmou o comando de imagem '+slot+'.');
    optimizerCommercialActionMessage('A Ponte v1.0.26 não confirmou o pedido da imagem '+String(slot).padStart(2,'0')+' em 12 segundos. Confira a extensão do Chrome e use Refazer novamente. A imagem anterior foi mantida.',true);
   }
  },12000);
 }catch(e){
  optimizerChatBridgeBusy=false;$('#optimizerChatgptAbort').hidden=true;
  status.textContent='Não foi possível iniciar a posição '+slot+': '+e.message;
  optimizerCommercialActionMessage(status.textContent,true);
 }
}
async function optimizerChatgptCopyAll({open=false}={}){
 const w=optimizerWorkflowPlan;
 if(!w||!optimizerImagesSameSku(w))return;
 const status=$('#optimizerChatgptCopyStatus');
 const key=[w.sku,w.itemId,w.modelId].join('|');
 const recent=optimizerChatgptBriefSku===key?optimizerChatgptBrief:null;
 try{
  // Fallback manual: sempre copia apenas a PRIMEIRA posição ainda pendente, nunca um lote.
  const slot=Array.from({length:9},(_,i)=>i+1).find(x=>!optimizerImagesSavedSlots.has(x))||1;
  const pos=String(slot).padStart(2,'0');
  const copy=recent
   ?navigator.clipboard.writeText(recent.prompts[slot-1])
   :optimizerChatgptMakeBrief(w).then(brief=>navigator.clipboard.writeText(brief.prompts[slot-1]));
  if(open)window.open('https://chatgpt.com/','_blank','noopener,noreferrer');
  await copy;
  status.textContent=open
   ?'Comando SOMENTE da imagem '+pos+'/09 copiado. Anexe a foto original e cole (Ctrl + V) no ChatGPT.'
   :'Comando individual da imagem '+pos+'/09 copiado. Anexe a fotografia original no ChatGPT e importe a imagem nessa posição.';
 }catch(e){status.textContent='Falha ao copiar os roteiros: '+e.message+'. Use os botões individuais abaixo.';}
}
$('#optimizerModeApi')?.addEventListener?.('click',()=>{
 optimizerImagesMode='api';optimizerImagesRenderMode();
});

const RA_CHAT_BRIDGE_SESSION_KEY='redeAchadosBridgeNonceV1';
let optimizerChatBridgeReady=false,optimizerChatBridgeVersion='',optimizerChatBridgeBusy=false,optimizerChatBridgeUploading=false;
// Cada clique confirma novamente a comunicação com a Ponte, sem depender da
// única sondagem enviada no carregamento do navegador.
async function optimizerChatBridgeWaitReady(maxWait=5500){
 if(optimizerChatBridgeReady)return true;
 return new Promise(resolve=>{
  let finished=false;
  const stop=()=>{
   if(finished)return;
   finished=true;clearInterval(poll);clearTimeout(limit);
   window.removeEventListener('message',observe);resolve(optimizerChatBridgeReady);
  };
  const observe=event=>{
   if(event.source!==window||event.origin!==location.origin||event.data?.kind!=='RA_EXTENSION_READY')return;
   queueMicrotask(()=>{if(optimizerChatBridgeReady)stop();});
  };
  window.addEventListener('message',observe);
  const probe=()=>window.postMessage({kind:'RA_EXTENSION_PROBE'},location.origin);
  const poll=setInterval(()=>{if(optimizerChatBridgeReady)stop();else probe();},650);
  const limit=setTimeout(stop,maxWait);
  probe();
 });
}
let optimizerChatBridgeNonce=typeof sessionStorage==='undefined'?'':sessionStorage.getItem(RA_CHAT_BRIDGE_SESSION_KEY)||'';
let optimizerChatBridgeSku='';
const RA_CHAT_BRIDGE_JOB_KEY='redeAchadosBridgeJobV2';
const RA_CHAT_BRIDGE_ACTIVE_KEY='redeAchadosBridgeActiveV3';
let optimizerChatBridgeJob=null,optimizerChatBridgeQueuePromise=null;
let optimizerChatBridgeStartConfirmed=false;
// A identificação é compartilhada entre abas do Manager (sem dados privados).
// A fila de arquivos continua isolada por nonce/SKU e conserva imagens salvas.
function optimizerChatBridgeActive(){
 try{return JSON.parse(localStorage.getItem(RA_CHAT_BRIDGE_ACTIVE_KEY)||'null')}catch{return null}
}
function optimizerChatBridgeActiveSave(job){
 try{
  if(job?.nonce&&!job?.stopped&&!job?.complete)localStorage.setItem(RA_CHAT_BRIDGE_ACTIVE_KEY,
   JSON.stringify({nonce:job.nonce,sku:job.sku,itemId:job.itemId,modelId:job.modelId}));
 }catch{}
}
function optimizerChatBridgeActiveClear(nonce){
 try{
  if(optimizerChatBridgeActive()?.nonce===nonce)localStorage.removeItem(RA_CHAT_BRIDGE_ACTIVE_KEY);
 }catch{}
}
function optimizerChatBridgeSwitchSku(newSku){
 const target=String(newSku||'').trim();
 const local=optimizerChatBridgeJob,active=optimizerChatBridgeActive();
 const obsolete=[local,active].filter(x=>x?.nonce&&String(x.sku)!==target);
 if(!obsolete.length)return Promise.resolve(false);
 // O Chrome pode ter fechado a aba antiga: enviar a ordem de encerramento
 // também para o nonce mantido em outra aba do mesmo domínio.
 for(const old of obsolete){
  window.postMessage({kind:'RA_SITE_ABORT',nonce:old.nonce,sku:old.sku,
   reason:'A SKU mudou. Preservar imagens já importadas e parar a tarefa anterior.'},location.origin);
  optimizerChatBridgeActiveClear(old.nonce);
 }
 const current=local&&String(local.sku)!==target;
 const pending=current?optimizerChatBridgeRelease('Tarefa da SKU '+local.sku+
  ' pausada. Agora trabalhando somente na SKU '+(target||'nova')+'.'):Promise.resolve();
 if(current){
  optimizerChatBridgeJob=null;optimizerChatBridgeBusy=false;optimizerChatBridgeUploading=false;
  optimizerChatBridgeNonce='';optimizerChatBridgeSku='';
  try{sessionStorage.removeItem(RA_CHAT_BRIDGE_JOB_KEY);sessionStorage.removeItem(RA_CHAT_BRIDGE_SESSION_KEY)}catch{}
  const abort=$('#optimizerChatgptAbort');if(abort)abort.hidden=true;
 }
 return Promise.resolve(pending).then(()=>true);
}
try{
 const saved=JSON.parse(sessionStorage.getItem(RA_CHAT_BRIDGE_JOB_KEY)||'null');
 if(saved?.nonce===optimizerChatBridgeNonce){
  const newer=optimizerChatBridgeActive();
  if(!saved.stopped&&!saved.complete&&newer?.nonce&&newer.nonce!==saved.nonce){
   // Uma aba antiga nunca pode roubar a tarefa ativa da nova SKU.
   saved.stopped=true;saved.complete=true;
   sessionStorage.setItem(RA_CHAT_BRIDGE_JOB_KEY,JSON.stringify(saved));
   window.postMessage({kind:'RA_SITE_ABORT',nonce:saved.nonce},location.origin);
  }else{
   optimizerChatBridgeJob=saved;
   if(!saved.stopped&&!saved.complete)optimizerChatBridgeActiveSave(saved);
  }
 }
}catch{}
window.addEventListener('storage',event=>{
 if(event.key!==RA_CHAT_BRIDGE_ACTIVE_KEY||!optimizerChatBridgeJob||
    optimizerChatBridgeJob.stopped||optimizerChatBridgeJob.complete)return;
 const latest=optimizerChatBridgeActive();
 if(!latest||latest.nonce!==optimizerChatBridgeJob.nonce){
  void optimizerChatBridgeRelease('Outra aba iniciou uma nova SKU. Fotos salvas foram mantidas; esta ponte antiga foi pausada.');
 }
});
function optimizerChatBridgeRelease(reason='Extensão interrompida. Fotos já salvas foram preservadas.'){
 const job=optimizerChatBridgeJob,nonce=optimizerChatBridgeNonce;
 if(job&&!job.stopped&&nonce)window.postMessage({kind:'RA_SITE_ABORT',nonce},location.origin);
 if(job){job.stopped=true;job.complete=true;sessionStorage.setItem(RA_CHAT_BRIDGE_JOB_KEY,JSON.stringify(job));
  optimizerChatBridgeActiveClear(job.nonce);
 }
 optimizerChatBridgeBusy=false;
 const abort=$('#optimizerChatgptAbort');if(abort)abort.hidden=true;
 optimizerChatBridgeNotice(reason);
 return job&&optimizerChatBridgeQueuePromise
  ?optimizerChatBridgeQueuePromise.then(queue=>queue.cancel(job)).catch(error=>{
    optimizerChatBridgeNotice('Envio interrompido, mas a fila local não respondeu: '+error.message);
   }):Promise.resolve();
}
function optimizerChatBridgeIdentity(a,b){
 return Boolean(a&&b&&String(a.sku)===String(b.sku)&&String(a.itemId)===String(b.itemId)&&String(a.modelId)===String(b.modelId));
}
function optimizerChatBridgeRemember(w,slots=Array.from({length:9},(_,i)=>i+1),expectedHashes={}){
 optimizerChatBridgeJob={nonce:optimizerChatBridgeNonce,sku:String(w.sku),itemId:String(w.itemId),
  modelId:String(w.modelId),slots,expectedHashes};
 sessionStorage.setItem(RA_CHAT_BRIDGE_JOB_KEY,JSON.stringify(optimizerChatBridgeJob));
 optimizerChatBridgeActiveSave(optimizerChatBridgeJob);
}
function optimizerChatBridgeNotice(message){
 const status=$('#optimizerChatgptBridgeStatus');if(status)status.textContent=message;
 const job=optimizerChatBridgeJob,w=optimizerWorkflowPlan;
 if(job?.slots?.length===1&&optimizerChatBridgeIdentity(w,job)&&
    Number($('#optimizerImageCorrectionSlot')?.value)===Number(job.slots[0])){
  const correction=$('#optimizerImageCorrectionStatus');
  if(correction)correction.textContent=message;
 }
 if(job?.slots?.length===1&&optimizerChatBridgeIdentity(w,job)){
  optimizerCommercialActionMessage(message,/erro|falh|recusad|rejeitad|interrompid|não conseguiu|não foi possível|pausad/i.test(message));
 }
}
function optimizerChatBridgeAck(row,ok,error=''){
 window.postMessage({kind:'RA_SITE_UPLOAD_RESULT',nonce:row.nonce,slot:row.slot,ok,error},location.origin);
}
async function optimizerChatBridgeConfirmed(job){
 const data=await json('/api/shopee/optimizer/images/manual?'+new URLSearchParams({
  sku:job.sku,item_id:job.itemId,model_id:job.modelId
 }));
 const slots=new Map((data.images||[]).map(row=>[Number(row.slot),row]));
 const complete=job.slots.every(slot=>slots.has(slot)&&
  (!job.expectedHashes?.[slot]||slots.get(slot)?.sha256!==job.expectedHashes[slot]));
 if(complete&&job.nonce===optimizerChatBridgeNonce){
  optimizerChatBridgeJob.complete=true;
  sessionStorage.setItem(RA_CHAT_BRIDGE_JOB_KEY,JSON.stringify(optimizerChatBridgeJob));
  optimizerChatBridgeActiveClear(job.nonce);
  optimizerChatBridgeBusy=false;$('#optimizerChatgptAbort').hidden=true;
  optimizerChatBridgeNotice(slots.size===9
   ?'9/9 imagens comerciais salvas na SKU '+job.sku+'. Confira todas antes de executar na Shopee.'
   :'Imagem salva na SKU '+job.sku+'.');
 }
 return complete;
}
function optimizerChatBridgeQueue(){
 if(!optimizerChatBridgeQueuePromise)optimizerChatBridgeQueuePromise=import('/chatgptUploadQueue.js?v=1.21.14-db-reconcile').then(({createImageUploadQueue,createIndexedImageStore})=>
  createImageUploadQueue({
   storage:createIndexedImageStore(),
   send:async(row,{signal}={})=>{
    const response=await fetch('/api/shopee/optimizer/images/manual?'+new URLSearchParams({
     sku:row.sku,item_id:row.itemId,model_id:row.modelId,slot:row.slot
    }),{method:'POST',headers:{'Content-Type':row.blob.type,'X-Image-Filename':encodeURIComponent(row.filename)},
     body:row.blob,signal:signal?AbortSignal.any([signal,AbortSignal.timeout(90000)]):AbortSignal.timeout(90000)});
    const data=await response.json().catch(()=>({}));
    if(!response.ok){
     const error=Error(data.error||'Não foi possível confirmar o envio (HTTP '+response.status+').');
     error.retryable=response.status>=500||[408,425,429].includes(response.status)||
      /HTTP (?:5\d\d|408|429)|timeout|fetch failed|temporariamente/i.test(error.message);
     throw error;
    }
    return data;
   },
   onAck:optimizerChatBridgeAck,
   onWaiting:(row,delay)=>{
    if(optimizerChatBridgeJob?.nonce!==row.nonce||
       !optimizerChatBridgeIdentity(optimizerWorkflowPlan,row))return;
    optimizerChatBridgeNotice('Imagem '+row.slot+'/9 preservada na SKU '+row.sku+'. Reconectando para enviar em '+Math.ceil(delay/1000)+' s...');
   },
   onFailure:row=>{
    if(optimizerChatBridgeJob?.nonce!==row.nonce||
       !optimizerChatBridgeIdentity(optimizerWorkflowPlan,row))return;
    // Falha de uma posição não cancela a sessão inteira, nem a mídia ainda
    // capturada. A extensão decidirá a retomada após a leitura do servidor.
    optimizerChatBridgeBusy=false;
    optimizerChatBridgeNotice('Imagem '+String(row.slot).padStart(2,'0')+
     ' ainda não confirmada. Arquivo preservado. Use Gerar / continuar automaticamente para sincronizar sem repetir imagens: '+row.error);
   },
   onSaved:async row=>{
    const w=optimizerWorkflowPlan;
    if(optimizerChatBridgeJob?.nonce!==row.nonce||!optimizerChatBridgeIdentity(w,row))return;
    optimizerChatBridgeNotice('Imagem '+row.slot+'/9 salva na SKU '+row.sku+'. '+(row.wasPadded?'Formato ajustado para 1:1 com margens, sem cortes. ':'')+'Aguardando a próxima imagem.');
    if(optimizerChatBridgeIdentity(w,row)){
     const status=$('#optimizerImageCorrectionStatus');
     if(status&&Number($('#optimizerImageCorrectionSlot')?.value)===Number(row.slot))
      status.textContent='Arquivo recebido na posição '+row.slot+'. Verificando a substituição no servidor...';
     optimizerImagesSavedSlots.add(row.slot);
     const stage=w.stages?.find(x=>x.key==='images');
     if(stage){stage.reviewed=false;stage.status='pending';stage.reviewedAt=null;}
     optimizerExecReset();
     if(optimizerWorkflowStage==='images')await optimizerImagesLoad();
    }
    if(optimizerChatBridgeJob?.nonce===row.nonce){
      const job=optimizerChatBridgeJob, confirmed=await optimizerChatBridgeConfirmed(job);
      if(job?.slots?.length===1&&optimizerChatBridgeIdentity(w,job)&&
       Number($('#optimizerImageCorrectionSlot')?.value)===Number(job.slots[0])){
       const correction=$('#optimizerImageCorrectionStatus');
       if(correction)correction.textContent=confirmed
        ?'✓ Foto '+String(row.slot).padStart(2,'0')+' realmente substituída e confirmada no servidor. Revise antes de publicar.'
        :'A foto foi enviada, mas não houve confirmação de substituição. Confira a prévia e importe a nova imagem.';
      }
     }
   }
  })).catch(error=>{optimizerChatBridgeQueuePromise=null;throw error;});
 return optimizerChatBridgeQueuePromise;
}
async function optimizerChatBridgeRecover({includeBlocked=false}={}){
 const job=optimizerChatBridgeJob;if(!job||job.complete||job.stopped)return 0;
 // No carregamento e no retorno de páginas, NÃO reativar um trabalho cujo
 // item/modelo não é exatamente a SKU exibida pelo Manager.
 if(!optimizerChatBridgeIdentity(job,optimizerWorkflowPlan)||
    String($('#optimizerSku')?.value||'').trim()!==String(job.sku))return 0;
 try{
  // Somente as posições efetivamente ausentes devem ser reenviadas.
  // Um ACK perdido não autoriza sobrescrever a foto que já está no banco.
  const server=await json('/api/shopee/optimizer/images/manual?'+new URLSearchParams({
   sku:job.sku,item_id:job.itemId,model_id:job.modelId
  }));
  const stored=new Map((server.images||[]).map(img=>[Number(img.slot),img]));
  const missing=job.slots.filter(slot=>!stored.has(slot)||
   // Correção individual explicitamente iniciada: repetir somente enquanto
   // o servidor ainda contém a imagem antiga que o usuário quis substituir.
   job.slots.length===1&&Boolean(job.expectedHashes?.[slot])&&
   stored.get(slot)?.sha256===job.expectedHashes[slot]);
  const queue=await optimizerChatBridgeQueue();
  const pending=await queue.resume(job,{includeBlocked,onlySlots:missing});
  if(pending){
   if(!optimizerChatBridgeIdentity(job,optimizerWorkflowPlan)||job.stopped)return 0;
   optimizerChatBridgeBusy=true;$('#optimizerChatgptAbort').hidden=false;
   optimizerChatBridgeNotice('Retomando o envio de '+pending+' imagem(ns) preservada(s) da SKU '+job.sku+'.');
  }
  return pending;
 }catch(e){optimizerChatBridgeNotice('Não foi possível recuperar as imagens: '+e.message);return 0;}
}
globalThis.window?.addEventListener?.('online',()=>void optimizerChatBridgeRecover());
globalThis.window?.addEventListener?.('pageshow',()=>void optimizerChatBridgeRecover());
void optimizerChatBridgeRecover();
globalThis.window?.addEventListener?.('message',async(event)=>{
 if(event.source!==window||event.origin!==location.origin||!event.data||typeof event.data!=='object')return;
 const m=event.data,status=$('#optimizerChatgptBridgeStatus');
 const actionStatus=$('#optimizerChatgptActionStatus');
 const report=message=>{if(status)status.textContent=message;if(actionStatus)actionStatus.textContent=message;};
 // Only extension-origin event types belong here. Site-emitted control messages
 // (RA_SITE_ABORT / RA_SITE_UPLOAD_RESULT / RA_SITE_START) must never be
 // interpreted as extension input, or cancellation can recursively echo.
 if(!['RA_EXTENSION_READY','RA_EXTENSION_START_RESULT','RA_EXTENSION_WAKE_RESULT','RA_EXTENSION_PROGRESS','RA_EXTENSION_IMAGE'].includes(m.kind))return;
 // Ponte compartilhada: mensagens de kits são tratadas pelo editor de kits.
 // Não enviar ACK negativo nem RA_SITE_ABORT apenas porque não há SKU individual.
 if(m.kind!=='RA_EXTENSION_READY'&&m.nonce){
  try{
   const activeKit=JSON.parse(sessionStorage.getItem('raKitExtensionActiveV1')||'null');
   if(activeKit?.nonce===m.nonce&&activeKit.kitSku)return;
  }catch{}
 }
 if(m.kind==='RA_EXTENSION_READY'){
  const version=String(m.version||'');
  optimizerChatBridgeVersion=version;
  const parts=version.split('.').map(Number);
  const needsUpdate=parts.length!==3||parts.some(n=>!Number.isInteger(n))||
   parts[0]<1||(parts[0]===1&&parts[1]===0&&parts[2]<26);
  if(needsUpdate&&optimizerChatBridgeReady)return;
  optimizerChatBridgeReady=!needsUpdate;
  if(status&&!optimizerChatBridgeBusy)status.textContent=needsUpdate
   ?'Extensão ChatGPT '+(version||'antiga')+' detectada: para enviar um prompt individual por posição é necessária a Ponte v1.0.26 ou superior. Atualize a extensão e recarregue o Chrome.'
   :'Extensão Rede Achados BR '+version+' detectada. Clique em Gerar as 9 imagens para abrir o ChatGPT e receber cada foto automaticamente.';
  return;
 }
 if(m.kind==='RA_EXTENSION_START_RESULT'&&m.nonce===optimizerChatBridgeNonce){
  optimizerChatBridgeStartConfirmed=true;
  report(m.ok?'Extensão confirmou o início. Gerando imagens individualmente, aguardando cada importação.':'Extensão recusou o comando: '+(m.error||'erro não identificado'));
  if(!m.ok){
   optimizerChatBridgeBusy=false;
   $('#optimizerChatgptAbort').hidden=true;
   if(status)status.textContent='Não foi possível iniciar a extensão: '+(m.error||'erro não identificado')+'. Verifique se está instalada e atualizada no Chrome.';
   optimizerChatBridgeNotice('Não foi possível iniciar o ChatGPT: '+(m.error||'extensão indisponível')+'. A imagem anterior foi preservada.');
   optimizerCommercialActionMessage('Falha ao iniciar o ChatGPT: '+(m.error||'Ponte indisponível')+'. Verifique a extensão v1.0.26.',true);
  }else if(status){
   status.textContent='Extensão iniciada para a SKU '+(optimizerWorkflowPlan?.sku||'')+'. O ChatGPT está gerando e cada foto será enviada à galeria automaticamente.';
   if(optimizerChatBridgeJob?.slots?.length===1)
    optimizerCommercialActionMessage('ChatGPT confirmou a geração da imagem '+String(optimizerChatBridgeJob.slots[0]).padStart(2,'0')+'. Aguarde o arquivo ser salvo antes de refazer outra posição.');
  }
  return;
 }
 if(m.nonce!==optimizerChatBridgeNonce||!m.nonce){
  if(m.kind==='RA_EXTENSION_IMAGE'&&m.nonce){
   optimizerChatBridgeAck(m,false,'Tarefa de SKU anterior não está ativa neste anúncio.');
   window.postMessage({kind:'RA_SITE_ABORT',nonce:m.nonce},location.origin);
  }
  return;
 }
 // Bind delivery to the authorized job, not to the panel or SKU currently on screen.
 const w=optimizerWorkflowPlan;
 if(String($('#optimizerSku')?.value||'').trim()!==String(m.sku||'')||
    !optimizerChatBridgeIdentity(w,m)){
  if(m.kind==='RA_EXTENSION_IMAGE')optimizerChatBridgeAck(m,false,'A SKU ativa foi alterada. Abra a nova SKU para gerar suas imagens.');
  window.postMessage({kind:'RA_SITE_ABORT',nonce:m.nonce},location.origin);
  return;
 }
 if(!optimizerChatBridgeJob&&optimizerChatBridgeIdentity(w,m))optimizerChatBridgeRemember(w);
 const job=optimizerChatBridgeJob;
 if(!job||job.nonce!==m.nonce||!optimizerChatBridgeIdentity(job,m))return;
 if(job.stopped){if(m.kind==='RA_EXTENSION_IMAGE')optimizerChatBridgeAck(m,false,'Envio anterior interrompido.');return;}
 if(m.kind==='RA_EXTENSION_WAKE_RESULT'){
  if(!m.ok){optimizerChatBridgeBusy=false;$('#optimizerChatgptAbort').hidden=true;
   report('A Ponte não conseguiu retomar a imagem pendente: '+(m.error||'erro não identificado'));}
  return;
 }
 if(m.kind==='RA_EXTENSION_PROGRESS'){
  const done=m.status==='9/9 imagens armazenadas. Confira e aprove a etapa no Shopee Manager antes de publicar na Shopee.';
  optimizerChatBridgeNotice(m.status+(m.error?' '+m.error:'')+
   (m.slot?' · posição '+Math.min(9,m.slot)+'/9':''));
  optimizerCommercialActionMessage('Ponte ChatGPT · imagem '+String(Math.min(9,Number(m.slot)||1)).padStart(2,'0')+
   '/09: '+String(m.status||'Aguardando atualização')+(m.error?' · '+m.error:''),
   Boolean(m.error)||/falh|pausad|recusad|interrompid/i.test(String(m.status||'')));
  const paused=/pausad[ao]|interrompid[ao]|cancelad[ao]|falha (?:no |de )?(?:upload|importação)/i.test(m.status||'');
  if(paused){optimizerChatBridgeBusy=false;$('#optimizerChatgptAbort').hidden=true;}
  else if(!done){optimizerChatBridgeBusy=true;$('#optimizerChatgptAbort').hidden=false;}
  if(done)void optimizerChatBridgeConfirmed(job).then(complete=>{
   if(!complete)optimizerChatBridgeNotice('Aguardando o sistema confirmar todas as imagens novas da SKU '+job.sku+'.');
  }).catch(e=>optimizerChatBridgeNotice('Conferência pendente: '+e.message));
  return;
 }
 if(m.kind!=='RA_EXTENSION_IMAGE')return;
 try{
  if(!Number.isInteger(m.slot)||m.slot<1||m.slot>9||!job.slots.includes(m.slot))throw Error('Slot inválido.');
  if(typeof m.dataUrl!=='string'||m.dataUrl.length>28*1024*1024||
    !/^data:image\/(?:png|jpeg|webp);base64,/i.test(m.dataUrl))
   throw Error('O ChatGPT não entregou um arquivo de imagem válido.');
  optimizerChatBridgeNotice('Imagem '+m.slot+'/9 recebida. Preparando e preservando o envio para a SKU '+job.sku+'...');
  const blob=await(await fetch(m.dataUrl)).blob();
  const file=new File([blob],'chatgpt-auto-'+String(m.slot).padStart(2,'0')+'.'+(blob.type==='image/jpeg'?'jpg':blob.type==='image/webp'?'webp':'png'),{type:blob.type});
  let prepared=await optimizerChatgptScaleFile(file);
  if(Number(m.slot)===3){
   // A foto gerada é SOMENTE a base. Montar a ficha com números de produto
   // confirmados, não confiar em textos/medidas imaginados pelo gerador.
   const {confirmedSpecCard,addConfirmedSpecificationCard}=await import('/specificationCard.js?v=1.3.0-assembled-track-no-fake-specs');
   const spec=confirmedSpecCard({
    sourceText:w.sourceEvidence?.sourceText||'',
    sku:w.sku,sourceEvidenceSku:w.sourceEvidence?.sku||'',
    supplierMatchedBy:w.supplierProduct?.matchedBy||''
   });
   if(spec){
    optimizerChatBridgeNotice('Imagem 03 recebida. Aplicando cotas finas e somente dados confirmados na WeDrop da SKU...');
    const annotated=await addConfirmedSpecificationCard(prepared.blob,spec);
    prepared={...prepared,blob:annotated,filename:'imagem-03-medidas.png'};
   }else{
    optimizerChatBridgeNotice('Imagem 03 sem vínculo WeDrop validado da mesma SKU ou sem medidas explícitas: nenhuma informação técnica será inventada. Revise a foto limpa.');
   }
  }
  const {imageBlobSha256}=await import('/chatgptUploadQueue.js?v=1.21.14-db-reconcile');
  const sha256=await imageBlobSha256(prepared.blob);
  if(job.expectedHashes?.[m.slot]===sha256)throw Error('A extensão reenviou a imagem antiga, não uma foto corrigida.');
  const existing=await json('/api/shopee/optimizer/images/manual?'+new URLSearchParams({
   sku:job.sku,item_id:job.itemId,model_id:job.modelId
  }));
  const other=(existing.images||[]).find(row=>Number(row.slot)!==m.slot&&row.sha256===sha256);
  if(other)throw Error('A extensão devolveu a foto da posição '+String(other.slot).padStart(2,'0')+
   ' em vez da nova imagem '+String(m.slot).padStart(2,'0')+'.');
  const extension=prepared.blob.type==='image/jpeg'?'jpg':'png';
  const queue=await optimizerChatBridgeQueue();
  // The queue ACKs immediately after server confirmation. Rendering is independent.
  await queue.enqueue({...job,slot:m.slot,blob:prepared.blob,sha256,wasPadded:prepared.wasPadded,
   filename:'chatgpt-auto-'+String(m.slot).padStart(2,'0')+'.'+extension});
 }catch(e){
  // ACK negativo informa apenas o slot. NÃO enviar RA_SITE_ABORT, pois
  // isso transforma uma falha isolada em bloqueio de toda a automação.
  optimizerChatBridgeAck(m,false,String(e.message||e));
  optimizerChatBridgeBusy=false;
  optimizerChatBridgeNotice('Imagem '+String(m.slot).padStart(2,'0')+
   ' não confirmada nesta tentativa: '+String(e.message||e)+
   '. As fotos já salvas permanecem. Retomar fará nova conferência pelo servidor.');
 }
});
// A new nine-image action is atomic: clear only commercial staging and
// start a fresh extension job from image 01. No nested click/confirm recursion.
$('#optimizerChatgptRestartAll')?.addEventListener?.('click',async()=>{
 const w=optimizerWorkflowPlan,button=$('#optimizerChatgptRestartAll');
 const status=$('#optimizerChatgptBridgeStatus');
 let near=$('#optimizerChatgptActionStatus');
 if(!near&&button){
  near=document.createElement('div');near.id='optimizerChatgptActionStatus';
  near.setAttribute('role','status');
  near.style.cssText='grid-column:1/-1;flex-basis:100%;width:100%;box-sizing:border-box;margin:8px 0;padding:10px;border-radius:8px;background:#eaf2ff;color:#18355e;font-size:14px;font-weight:600;line-height:1.5;white-space:normal;overflow-wrap:anywhere';
  button.insertAdjacentElement('afterend',near);
 }
 const notify=message=>{if(status)status.textContent=message;if(near)near.textContent=message;};
 if(!w||!optimizerImagesSameSku(w)){notify('Selecione uma SKU válida antes de gerar as imagens.');return;}
 if(button.disabled)return;
 button.disabled=true;
 try{
  optimizerImagesMode='chatgpt';optimizerImagesRenderMode();
  if(!optimizerChatBridgeReady){
   window.postMessage({kind:'RA_EXTENSION_PROBE'},location.origin);
   throw Error('Extensão ChatGPT indisponível ou antiga ('+(optimizerChatBridgeVersion||'não detectada')+'). Instale a Ponte v1.0.26 e recarregue o Chrome.');
  }
  // Validate the original photo and the 9 scene prompts before mutating anything.
  const brief=await optimizerChatgptMakeBrief(w);
  if(!brief.original||brief.prompts?.length!==9)throw Error('Foto original ou roteiro de 9 imagens indisponível.');
  if(!optimizerImagesSameSku(w))throw Error('A SKU mudou durante a preparação.');
  const current=await json('/api/shopee/optimizer/images/manual?'+new URLSearchParams({sku:w.sku,item_id:w.itemId,model_id:w.modelId}));
  if(!optimizerImagesSameSku(w))throw Error('A SKU foi alterada.');
  const slots=(current.images||[]).map(row=>Number(row.slot)).filter(slot=>Number.isInteger(slot)&&slot>=1&&slot<=9);
  if(slots.length&&!confirm('Iniciar as 9 imagens desde 01/09 para a SKU '+w.sku+'? As '+slots.length+' imagens comerciais atualmente preparadas serão substituídas. As fotos originais da Shopee permanecem intactas.'))return;
  notify('Iniciando nova sequência da SKU '+w.sku+' desde 01/09...');
  // Stop old queue and extension before deleting staged assets.
  await optimizerChatBridgeRelease('Encerrando tarefa anterior para iniciar desde a imagem 01.');
  optimizerChatBridgeActiveClear(optimizerChatBridgeNonce);
  optimizerChatBridgeJob=null;optimizerChatBridgeNonce='';optimizerChatBridgeSku='';
  optimizerChatBridgeBusy=false;optimizerChatBridgeUploading=false;
  sessionStorage.removeItem(RA_CHAT_BRIDGE_JOB_KEY);
  sessionStorage.removeItem(RA_CHAT_BRIDGE_SESSION_KEY);
  for(const slot of slots){
   if(!optimizerImagesSameSku(w))throw Error('SKU alterada durante a limpeza.');
   const result=await json('/api/shopee/optimizer/images/manual?'+new URLSearchParams({sku:w.sku,item_id:w.itemId,model_id:w.modelId,slot}),{method:'DELETE'});
   if(result.deleted!==true)throw Error('Não foi possível limpar a posição '+slot+'. Nova geração não iniciada.');
  }
  const after=await json('/api/shopee/optimizer/images/manual?'+new URLSearchParams({sku:w.sku,item_id:w.itemId,model_id:w.modelId}));
  if((after.images||[]).length)throw Error('O servidor ainda possui imagens comerciais anteriores. Nova geração não iniciada.');
  optimizerImagesSavedSlots.clear();optimizerChatgptBrief=null;optimizerChatgptBriefSku='';
  optimizerChatBridgeNonce=crypto.randomUUID();optimizerChatBridgeSku=w.sku;
  sessionStorage.setItem(RA_CHAT_BRIDGE_SESSION_KEY,optimizerChatBridgeNonce);
  optimizerChatBridgeRemember(w);
  optimizerChatBridgeBusy=true;optimizerChatBridgeStartConfirmed=false;
  $('#optimizerChatgptAbort').hidden=false;
  notify('Enviando imagem 01/09 da SKU '+w.sku+' à extensão. A próxima começará após confirmação da importação.');
  window.postMessage({kind:'RA_SITE_START',payload:{
   nonce:optimizerChatBridgeNonce,sku:w.sku,itemId:String(w.itemId),modelId:String(w.modelId),
   imageUrl:brief.original,prompts:brief.prompts,completed:[],
   // Reinício TOTAL da posição 01 autoriza invalidar o nonce anterior da mesma SKU.
   restart:true
  }},location.origin);
  const issuedNonce=optimizerChatBridgeNonce;
  setTimeout(()=>{
   if(!optimizerChatBridgeStartConfirmed&&optimizerChatBridgeBusy&&optimizerChatBridgeNonce===issuedNonce){
    void optimizerChatBridgeRelease('Extensão não confirmou o início da sequência 01/09. Atualize ou reative a Ponte ChatGPT e tente novamente.');
    notify('A extensão não confirmou o comando. Nenhuma imagem foi gerada nesta tentativa; as fotos originais da Shopee foram preservadas.');
   }
  },8000);
  void optimizerImagesLoad();
 }catch(e){optimizerChatBridgeBusy=false;$('#optimizerChatgptAbort').hidden=true;notify('Falha ao iniciar a imagem 01/09: '+e.message);}
 finally{button.disabled=false;}
});
// Recuperação não destrutiva: posições já confirmadas continuam no servidor.
function optimizerBridgeRecoverFromExtension(payload){
 const requestId=crypto.randomUUID();
 return new Promise((resolve,reject)=>{
  const timer=setTimeout(()=>{
   window.removeEventListener('message',receive);
   reject(Error('A Ponte não respondeu à recuperação. Atualize a extensão para v1.0.26 e recarregue o Chrome.'));
  },12000);
  function receive(event){
   if(event.source!==window||event.origin!==location.origin||
      event.data?.kind!=='RA_EXTENSION_CONTINUE_RESULT'||event.data.requestId!==requestId)return;
   clearTimeout(timer);window.removeEventListener('message',receive);resolve(event.data);
  }
  window.addEventListener('message',receive);
  window.postMessage({kind:'RA_SITE_CONTINUE',requestId,payload},location.origin);
 });
}
// Impedir execução duplicada mesmo se a galeria reativar o botão durante uma consulta.
let optimizerChatgptContinueBusy=false;
// Clique principal executa DIRETAMENTE a continuação, sem outro botão oculto.
// Espera resposta da extensão, vinculada ao mesmo nonce. Um clique sem ACK nunca é sucesso.
function optimizerWaitBridgeReply(kind,nonce,timeoutMs=18000){
 return new Promise(resolve=>{
  const cleanup=()=>{clearTimeout(timer);window.removeEventListener('message',onMessage);};
  const onMessage=e=>{
   if(e.source!==window||e.origin!==location.origin||
      e.data?.kind!==kind||e.data?.nonce!==nonce)return;
   cleanup();resolve({ok:e.data.ok===true,error:String(e.data.error||'').slice(0,200)});
  };
  const timer=setTimeout(()=>{cleanup();resolve({ok:false,error:'Confirmação não recebida no prazo'});},timeoutMs);
  window.addEventListener('message',onMessage);
 });
}
async function optimizerChatgptContinueFromServer(){
 const w=optimizerWorkflowPlan,button=$('#optimizerChatgptAuto');
 const status=$('#optimizerChatgptBridgeStatus');
 let near=$('#optimizerChatgptActionStatus');
 if(!near&&button){
  near=document.createElement('div');
  near.id='optimizerChatgptActionStatus';
  near.setAttribute('role','status');
  near.setAttribute('aria-live','polite');
  near.style.cssText='grid-column:1/-1;flex-basis:100%;width:100%;box-sizing:border-box;margin:8px 0;padding:12px;border-radius:8px;background:#eaf2ff;color:#18355e;font-size:14px;font-weight:600;line-height:1.5;white-space:normal;overflow-wrap:anywhere';
  button.insertAdjacentElement('afterend',near);
 }
 const notify=(message,isError=false)=>{
  if(status)status.textContent=message;
  if(near){near.textContent=message;near.style.background=isError?'#fff1ef':'#eaf2ff';near.style.color=isError?'#a02a21':'#18355e';}
 };
 notify('Consultando a primeira posição pendente diretamente no servidor...');
 if(!w||!optimizerImagesSameSku(w)){notify('Abra a etapa Imagens de uma SKU válida antes de continuar.',true);return;}
 if(!button||optimizerChatgptContinueBusy||button.disabled){notify('O comando já está em execução ou não existem imagens pendentes.',true);return;}
 optimizerChatgptContinueBusy=true;button.disabled=true;
 try{
  optimizerImagesMode='chatgpt';optimizerImagesRenderMode();
  if(!await optimizerChatBridgeWaitReady()){
   throw Error('Ponte não conectada ao Manager. Em chrome://extensions, ative a Ponte e em Detalhes → Acesso a sites permita redeachados-shopee.onrender.com. Se tiver a Ponte v1.0.23, clique em Reconectar ao Manager no ícone da extensão. As fotos salvas permanecem intactas.');
  }
  const brief=await optimizerChatgptMakeBrief(w);
  if(!brief.original||brief.prompts?.length!==9)throw Error('Foto original ou os nove roteiros não estão disponíveis.');
  const data=await json('/api/shopee/optimizer/images/manual?'+new URLSearchParams({sku:w.sku,item_id:w.itemId,model_id:w.modelId}));
  if(!optimizerImagesSameSku(w))throw Error('A SKU mudou durante a consulta. Nenhuma tarefa foi iniciada.');
  const stored=[...new Set((data.images||[]).map(row=>Number(row.slot)).filter(x=>Number.isInteger(x)&&x>=1&&x<=9))].sort((a,b)=>a-b);
  const missing=Array.from({length:9},(_,i)=>i+1).filter(x=>!stored.includes(x));
  if(!missing.length){notify('9/9 imagens já preparadas. Revise a galeria ou use Gerar 9 imagens para refazer desde 01.');return;}
  const first=String(missing[0]).padStart(2,'0');
  // Esta ação NÃO deleta arquivos: preserva inclusive importações pendentes.
  // Se já há uma tentativa no Chrome, retomá-la recupera a imagem antes de criar outra.
  notify('Servidor conferido: '+stored.length+'/9 salvas. Primeira pendente: '+first+'/09. Sincronizando a Ponte sem excluir fotos.');
  // NÃO enviar RA_SITE_ABORT antes de RA_SITE_CONTINUE: isso causava
  // competição e podia pausar a mesma execução que deveria ser retomada.
  const priorJob=optimizerChatBridgeJob;
  if(priorJob&&!optimizerChatBridgeIdentity(priorJob,w))
   await optimizerChatBridgeRelease('Outra SKU pausada. Continuando '+w.sku+'.');
  else if(priorJob&&!priorJob.stopped&&!priorJob.complete){
   const pendingUploads=await optimizerChatBridgeRecover({includeBlocked:true});
   if(pendingUploads)notify('Recuperando '+pendingUploads+' arquivo(s) capturado(s) antes de continuar na imagem '+first+'/09.');
  }
  const recovered=await optimizerBridgeRecoverFromExtension({
   sku:String(w.sku),itemId:String(w.itemId),modelId:String(w.modelId),
   completed:stored,imageUrl:brief.original,prompts:brief.prompts
  });
  if(!optimizerImagesSameSku(w))throw Error('A SKU mudou; o comando de recuperação foi interrompido.');
  if(recovered.ok){
   // Só encerrar uma sessão anterior se seu nonce NÃO for o recuperado.
   if(optimizerChatBridgeJob?.nonce&&optimizerChatBridgeJob.nonce!==recovered.nonce)
    await optimizerChatBridgeRelease('Sessão antiga substituída pela reconciliação.');
   optimizerChatBridgeNonce=recovered.nonce;optimizerChatBridgeSku=w.sku;
   sessionStorage.setItem(RA_CHAT_BRIDGE_SESSION_KEY,optimizerChatBridgeNonce);
   optimizerChatBridgeRemember(w,missing);
   optimizerChatBridgeBusy=true;optimizerChatBridgeStartConfirmed=true;
   $('#optimizerChatgptAbort').hidden=false;
   notify('Recuperando a imagem '+first+'/09 da SKU '+w.sku+'. Imagens existentes preservadas. Se a conversa não puder ser recuperada, use “Recomeçar somente imagem pendente” na Ponte.');
   // O runner recebe autorização somente DEPOIS que esta aba registrou o nonce antigo.
   const wakeAck=optimizerWaitBridgeReply('RA_EXTENSION_WAKE_RESULT',optimizerChatBridgeNonce,18000);
   window.postMessage({kind:'RA_SITE_WAKE',nonce:optimizerChatBridgeNonce},location.origin);
   const wakeResult=await wakeAck;
   if(!wakeResult?.ok)throw Error('A Ponte não confirmou a reativação: '+(wakeResult?.error||'sem confirmação'));
  }else if(recovered.reason==='NO_RECOVERABLE_JOB'||recovered.reason==='ALREADY_COMPLETE'){
   // Sem job recuperável na extensão: novo trabalho começando na primeira vaga
   // do servidor, sem restart total nem remoção dos arquivos já salvos.
   if(optimizerChatBridgeJob)await optimizerChatBridgeRelease('Sessão antiga encerrada; fotos já salvas preservadas.');
   optimizerChatBridgeActiveClear(optimizerChatBridgeNonce);
   optimizerChatBridgeJob=null;optimizerChatBridgeNonce='';optimizerChatBridgeSku='';
   sessionStorage.removeItem(RA_CHAT_BRIDGE_JOB_KEY);
   sessionStorage.removeItem(RA_CHAT_BRIDGE_SESSION_KEY);
   optimizerChatBridgeNonce=crypto.randomUUID();optimizerChatBridgeSku=w.sku;
   sessionStorage.setItem(RA_CHAT_BRIDGE_SESSION_KEY,optimizerChatBridgeNonce);
   optimizerChatBridgeRemember(w,missing);
   optimizerChatBridgeBusy=true;optimizerChatBridgeStartConfirmed=false;
   $('#optimizerChatgptAbort').hidden=false;
   notify('Iniciando nova sessão pela primeira imagem pendente '+first+'/09. '+stored.length+' imagem(ns) salva(s) preservada(s).');
   const startAck=optimizerWaitBridgeReply('RA_EXTENSION_START_RESULT',optimizerChatBridgeNonce,18000);
   window.postMessage({kind:'RA_SITE_START',payload:{
    nonce:optimizerChatBridgeNonce,sku:w.sku,itemId:String(w.itemId),modelId:String(w.modelId),
    imageUrl:brief.original,prompts:brief.prompts,completed:stored
   }},location.origin);
   const startResult=await startAck;
   if(!startResult?.ok)throw Error('A Ponte não confirmou a nova sessão: '+(startResult?.error||'sem confirmação'));
   const issuedNonce=optimizerChatBridgeNonce;
   setTimeout(()=>{
    if(!optimizerChatBridgeStartConfirmed&&optimizerChatBridgeBusy&&optimizerChatBridgeNonce===issuedNonce){
     void optimizerChatBridgeRelease('A extensão não confirmou o reinício pela posição '+first+'. Imagens anteriores preservadas.');
     notify('A extensão não confirmou o comando para posição '+first+'/09. Verifique se a Ponte 1.0.26 está ativa.');
    }
   },18000);
  }else{
   throw Error(recovered.error||'Não foi possível recuperar o estado da extensão.');
  }
  void optimizerImagesLoad();
  // Só confirmar à Ponte APÓS reconciliação da sessão e solicitação de wake.
  return {ok:true,nonce:optimizerChatBridgeNonce,sku:String(w.sku),itemId:String(w.itemId),modelId:String(w.modelId),slot:missing[0]};
 }catch(e){
  optimizerChatBridgeBusy=false;$('#optimizerChatgptAbort').hidden=true;
  notify('Não foi possível continuar a sequência: '+String(e.message||e)+'. Nenhuma foto salva foi apagada.',true);
  return {ok:false,error:String(e.message||e)};
 }finally{optimizerChatgptContinueBusy=false;if(button)button.disabled=false;}
}
// O coordenador da extensão espera um resultado REAL, não apenas button.click().
// Expor somente a mesma ação de interface após conferir SKU/item/modelo ativos.
globalThis.__RA_SHOPEE_RESUME_BRIDGE=async identity=>{
 const w=optimizerWorkflowPlan;
 if(!w||String(w.sku)!==String(identity?.sku)||String(w.itemId)!==String(identity?.itemId)||String(w.modelId)!==String(identity?.modelId)||
    String($('#optimizerSku')?.value||'').trim()!==String(identity.sku))
  return {ok:false,error:'A SKU/item/variação exibida não corresponde à execução da Ponte.'};
 if(optimizerChatgptContinueBusy)
  return {ok:false,error:'O Manager ainda está reconciliando a sessão anterior. Não iniciar outro comando.'};
 const result=await optimizerChatgptContinueFromServer();
 return result?.ok===true?result:{ok:false,error:result?.error||String($('#optimizerChatgptActionStatus')?.textContent||$('#optimizerChatgptBridgeStatus')?.textContent||'Manager não confirmou a retomada.').slice(0,330)};
};
$('#optimizerChatgptAuto')?.addEventListener?.('click',()=>void optimizerChatgptContinueFromServer());
$('#optimizerChatgptResume')?.addEventListener?.('click',()=>void optimizerChatgptContinueFromServer());
$('#optimizerChatgptAbort')?.addEventListener?.('click',()=>{
 optimizerChatBridgeRelease('Geração pausada. As fotos já salvas foram preservadas. Para continuar, faça nova solicitação.');
});
globalThis.window?.postMessage?.({kind:'RA_EXTENSION_PROBE'},location.origin);

$('#optimizerChatgptOpen')?.addEventListener?.('click',()=>void optimizerChatgptCopyAll({open:true}));
$('#optimizerChatgptCopyAll')?.addEventListener?.('click',()=>void optimizerChatgptCopyAll());
async function optimizerChatgptScaleFile(file){
 if(file.size>30*1024*1024)throw Error('Arquivo '+file.name+' excede 30 MB.');
 if(!/\.(png|jpg|jpeg|webp)$/i.test(file.name)&&!['image/png','image/jpeg','image/webp'].includes(file.type))
  throw Error('Use arquivos PNG, JPG ou WebP.');
 const {prepareSquareImage}=await import('/imageSquare.js?v=1.20.10');
 return prepareSquareImage(file);
}
$('#optimizerChatgptImport')?.addEventListener?.('click',async()=>{
 const w=optimizerWorkflowPlan;
 if(!w||!optimizerImagesSameSku(w)||optimizerImagesAutoBusy)return;
 const chosen=Array.from($('#optimizerChatgptFiles').files||[]);
 const status=$('#optimizerChatgptImportStatus'),button=$('#optimizerChatgptImport');
 let ordered;
 try{
  const {assignChatGptFiles}=await import('/chatgptPrompts.js?v=1.21.83-prompts-hd-wedrop');
  ordered=assignChatGptFiles(chosen,{startSlot:Number($('#optimizerChatgptStart').value)});
 }catch(e){status.textContent=e.message;return;}
 const mapping=ordered.map(x=>String(x.slot).padStart(2,'0')+' ← '+x.file.name).join('\n');
 const overwrites=ordered.filter(x=>optimizerImagesSavedSlots.has(x.slot)).map(x=>String(x.slot).padStart(2,'0'));
 if(!window.confirm('Confira o destino das imagens do ChatGPT:\n'+mapping+
  (overwrites.length?'\n\nAtenção: substituirá as posições já salvas '+overwrites.join(', ')+'.':'')+
  '\n\nSalvar estas imagens para revisão? A Shopee NÃO será atualizada agora.'))return;
 optimizerImagesAutoBusy=true;optimizerImagesSetProgress();button.disabled=true;optimizerExecReset();
 let processed=0;
 try{
  for(const {file,slot} of ordered){
   if(!optimizerImagesSameSku(w))throw Error('A SKU mudou durante a importação.');
   status.textContent='Preparando e salvando imagem '+slot+' de 9 ('+(processed+1)+'/'+ordered.length+')...';
   const prepared=await optimizerChatgptScaleFile(file);
   const outputType=prepared.blob.type==='image/jpeg'?'image/jpeg':'image/png';
   const extension=outputType==='image/jpeg'?'jpg':'png';
   const response=await fetch('/api/shopee/optimizer/images/manual?'+new URLSearchParams({
    sku:w.sku,item_id:w.itemId,model_id:w.modelId,slot
   }),{
    method:'POST',headers:{'Content-Type':outputType,
     'X-Image-Filename':encodeURIComponent('chatgpt-'+String(slot).padStart(2,'0')+'.'+extension)},
    body:prepared.blob,signal:AbortSignal.timeout(90000)
   });
   const result=await response.json();
   if(!response.ok)throw Error(result.error||'Erro ao salvar imagem '+slot+'.');
   optimizerImagesSavedSlots.add(slot);
   processed++;
  }
  $('#optimizerChatgptFiles').value='';
  const stage=w.stages?.find(x=>x.key==='images');
  if(stage){stage.reviewed=false;stage.status='pending';stage.reviewedAt=null;}
  optimizerWorkflowRender(w);
  status.textContent=processed+' foto(s) ChatGPT salvas para revisão nesta SKU. '+optimizerImagesSavedSlots.size+'/9 disponíveis. Confira a galeria e aprove as nove antes de enviar.';
 }catch(e){
  status.textContent='Importação interrompida após '+processed+' imagem(ns): '+e.message+'. Os arquivos já salvos continuam disponíveis.';
 }finally{
  optimizerImagesAutoBusy=false;button.disabled=false;optimizerImagesSetProgress();
  if(optimizerImagesSameSku(w))await optimizerImagesLoad();
 }
});

function optimizerImagesSameSku(w){
 return optimizerWorkflowPlan?.sku===w.sku&&optimizerWorkflowPlan?.itemId===w.itemId&&
  optimizerWorkflowPlan?.modelId===w.modelId&&optimizerWorkflowStage==='images';
}
function optimizerImagesSetProgress(){
 const count=optimizerImagesSavedSlots.size;
 const p=$('#optimizerImagesProgress');if(p)p.value=count;
 const b=$('#optimizerImagesGenerateAll');if(b)b.disabled=optimizerImagesAutoBusy||!optimizerImagesApiConfigured;
 // A galeria pode ter sido renderizada durante um upload: nunca deixar
 // o seletor de movimento preso em disabled depois que a operação termina.
 for(const select of document.querySelectorAll('#optimizerImagesGallery .optimizer-commercial-move-select')){
  select.disabled=optimizerImagesAutoBusy;
  select.title=optimizerImagesAutoBusy
   ?'Conclua a importação atual para reorganizar as imagens.'
   :'Mover ou trocar esta imagem de posição';
 }
}
// Result messages live OUTSIDE the gallery because each refresh rebuilds its cards.
function optimizerCommercialActionMessage(message,isError=false){
 const gallery=$('#optimizerImagesGallery');if(!gallery)return;
 let notice=$('#optimizerCommercialActionNotice');
 if(!notice){
  notice=document.createElement('div');notice.id='optimizerCommercialActionNotice';
  notice.style.cssText='margin:10px 0;padding:11px 14px;border:1px solid currentColor;border-radius:10px;line-height:1.5;font-weight:600;white-space:normal;overflow-wrap:anywhere';
  gallery.parentNode?.insertBefore(notice,gallery);
 }
 notice.hidden=false;notice.setAttribute('role',isError?'alert':'status');
 notice.style.color=isError?'#a02a21':'#165b3f';
 notice.textContent=message;
}
async function optimizerImagesMove(w,fromSlot,toSlot,stored){
 if(!optimizerImagesSameSku(w)||optimizerImagesAutoBusy||fromSlot===toSlot)return;
 const source=stored.get(fromSlot),target=stored.get(toSlot);
 if(!source)return;
 const status=$('#optimizerImagesStatus');
 optimizerImagesAutoBusy=true;optimizerImagesSetProgress();
 let message='';
 try{
  status.textContent='Salvando nova posição da imagem '+fromSlot+'...';
  const result=await json('/api/shopee/optimizer/images/reorder?'+new URLSearchParams({
   sku:w.sku,item_id:w.itemId,model_id:w.modelId
  }),{
   method:'POST',headers:{'Content-Type':'application/json'},
   body:JSON.stringify({
    fromSlot,toSlot,fromSha256:source.sha256,toSha256:target?.sha256||null
   }),signal:AbortSignal.timeout(60000)
  });
  const stage=w.stages?.find(x=>x.key==='images');
  if(stage){stage.reviewed=false;stage.status='pending';stage.reviewedAt=null;}
  optimizerWorkflowRender(w);optimizerExecReset();
  message=result.mode==='swap'
   ?'Imagens '+fromSlot+' e '+toSlot+' trocadas e salvas. Confira a nova sequência antes de aprovar.'
   :'Imagem movida da posição '+fromSlot+' para '+toSlot+'. Confira a nova sequência antes de aprovar.';
 }catch(e){message='Não foi possível reorganizar as imagens: '+e.message;}
 finally{
  optimizerImagesAutoBusy=false;optimizerImagesSetProgress();
  if(optimizerImagesSameSku(w)){
   await optimizerImagesLoad();
   status.textContent=message;
  }
 }
}
async function optimizerImagesLoad(){
 const w=optimizerWorkflowPlan;if(!w)return;
 const status=$('#optimizerImagesStatus');if(!optimizerImagesAutoBusy)status.textContent='Consultando imagens salvas...';
 try{
  const [data,provider]=await Promise.all([
   json('/api/shopee/optimizer/images/manual?'+new URLSearchParams({sku:w.sku,item_id:w.itemId,model_id:w.modelId})),
   json('/api/shopee/optimizer/images/generation/status')
  ]);
  if(!optimizerImagesSameSku(w))return;
  if(optimizerChatgptBriefSku!==[w.sku,w.itemId,w.modelId].join('|')){
   optimizerChatgptBrief=null;optimizerChatgptBriefSku='';
  }
  optimizerImagesApiConfigured=provider.configured===true;
  if(optimizerImagesMode===null)optimizerImagesMode='chatgpt';
  optimizerImagesRenderMode();
  if(optimizerImagesMode==='chatgpt')void optimizerChatgptRender(w);
  const connect=$('#optimizerOpenAiConnect'),connected=$('#optimizerOpenAiConnected');
  connect.hidden=optimizerImagesApiConfigured;
  connected.hidden=!optimizerImagesApiConfigured;
  $('#optimizerOpenAiDisconnect').hidden=provider.source==='render';
  $('#optimizerImagesProvider').textContent=optimizerImagesApiConfigured
   ?'✓ API OpenAI conectada · '+provider.model
   :'API OpenAI desconectada · conecte abaixo para liberar as imagens';
  const gallery=$('#optimizerImagesGallery');
  // Reuse loaded image elements across the 9-slot gallery rebuilds. Recreating
  // their IMG elements after every upload caused repeated decodes and blank frames.
  const existingThumbs=new Map();
  for(const oldCard of gallery.querySelectorAll('.optimizer-commercial-image-card[data-slot]')){
   const photo=oldCard.querySelector('.optimizer-commercial-thumb img');
   if(photo?.src)existingThumbs.set(Number(oldCard.dataset.slot),photo);
  }
  const stored=new Map((data.images||[]).map(image=>[Number(image.slot),image]));
  gallery.replaceChildren();
  optimizerImageCorrectionPreviewMap=stored;
  optimizerImageCorrectionRefreshPreview();
  optimizerImagesSavedSlots=new Set(stored.keys());
   // Servidor define a PRIMEIRA posição realmente vazia.
   const firstMissing=Array.from({length:9},(_,i)=>i+1).find(n=>!stored.has(n));
   const runButton=$('#optimizerChatgptAuto');
   if(runButton){
    runButton.disabled=!firstMissing;
    runButton.textContent=firstMissing
     ?'✦ Gerar / continuar da imagem '+String(firstMissing).padStart(2,'0')+'/09'
     :'✓ 9/9 imagens prontas';
   }
   const resumeButton=$('#optimizerChatgptResume');
   if(resumeButton)resumeButton.disabled=!firstMissing;
  const completed=stored.size,pending=9-completed;
  const originals=Array.isArray(w.imageUrls)?w.imageUrls.filter(Boolean):[];
  const counters={
   optimizerCommercialOriginalCount:originals.length,
   optimizerCommercialPreparedCount:completed,
   optimizerImagesFilterAllCount:9,
   optimizerImagesFilterPendingCount:pending,
   optimizerImagesFilterSavedCount:completed
  };
  for(const [id,value] of Object.entries(counters)){const element=$('#'+id);if(element)element.textContent=String(value);}
  $('#optimizerCommercialGallerySummary').textContent=completed+' / 9 imagens preparadas';
  $('#optimizerCommercialGalleryProgress').value=completed;
  const reviewStage=w.stages?.find(x=>x.key==='images');
  const reviewBtn=$('#optimizerWorkflowReview');
  if(reviewBtn&&optimizerWorkflowStage==='images'){
   reviewBtn.disabled=completed!==9&&!reviewStage?.reviewed;
   reviewBtn.title=completed===9?'Conferir as 9 imagens antes de aprovar.':'Prepare todas as nove imagens para registrar a conferência.';
  }
  let draggedImageSlot=null;
  for(let slot=1;slot<=9;slot++){
   const image=stored.get(slot);
   if(optimizerImagesFilter==='saved'&&!image)continue;
   if(optimizerImagesFilter==='pending'&&image)continue;
   const originalUrl=originals[slot-1]||null;
   const card=optimizerMake('article','optimizer-commercial-image-card');
   card.dataset.slot=String(slot);
   card.draggable=Boolean(image)&&!optimizerImagesAutoBusy;
   if(image){
    card.title='Arraste esta imagem para outra posição.';
    card.ondragstart=e=>{
     if(optimizerImagesAutoBusy){e.preventDefault();return;}
     draggedImageSlot=slot;
     e.dataTransfer.effectAllowed='move';
     e.dataTransfer.setData('text/plain','imagem-preparada-'+slot);
     card.classList.add('optimizer-image-dragging');
    };
    card.ondragend=()=>{
     draggedImageSlot=null;
     gallery.querySelectorAll('.optimizer-image-drag-target,.optimizer-image-dragging')
      .forEach(el=>el.classList.remove('optimizer-image-drag-target','optimizer-image-dragging'));
    };
   }
   card.ondragover=e=>{
    if(!optimizerImagesAutoBusy&&draggedImageSlot!==null&&draggedImageSlot!==slot){
     e.preventDefault();e.dataTransfer.dropEffect='move';
     card.classList.add('optimizer-image-drag-target');
    }
   };
   card.ondragleave=e=>{if(!card.contains(e.relatedTarget))card.classList.remove('optimizer-image-drag-target');};
   card.ondrop=e=>{
    e.preventDefault();
    const from=draggedImageSlot;
    draggedImageSlot=null;
    gallery.querySelectorAll('.optimizer-image-drag-target')
     .forEach(el=>el.classList.remove('optimizer-image-drag-target'));
    if(from!==null&&from!==slot)void optimizerImagesMove(w,from,slot,stored);
   };
   const thumb=optimizerMake('div','optimizer-commercial-thumb');
   const url=image?.previewUrl||'';
   if(url){
    const previousPhoto=existingThumbs.get(slot);
    const photo=previousPhoto?.src===url?previousPhoto:optimizerMake('img');
    if(photo.src!==url)photo.src=url;
    photo.alt='Imagem comercial preparada da posição '+slot;
    // The first row is always visible; lazy loading caused empty thumbnails
    // after scrolling the page or during successive saved-image refreshes.
    photo.loading=slot<=3?'eager':'lazy';
    if(slot<=3)photo.setAttribute('fetchpriority','high');
    photo.decoding='async';
    photo.draggable=false;thumb.append(photo);
   }else thumb.append(optimizerMake('span','optimizer-image-placeholder','▧'));
   thumb.append(optimizerMake('span','optimizer-commercial-thumb-slot',String(slot)));
   card.append(thumb);
   const detail=optimizerMake('div','optimizer-commercial-image-info');
   const heading=optimizerMake('div','optimizer-commercial-image-meta');
   heading.append(optimizerMake('strong','',String(slot).padStart(2,'0')+' · '+optimizerCommercialPositionNames[slot-1]));
   heading.append(optimizerMake('span',image?'optimizer-slot-ready':'optimizer-slot-pending',
    image?'● Pronta':originalUrl?'◉ Original':'◆ Pendente'));
   detail.append(heading);
   if(!image)detail.append(optimizerMake('small','optimizer-commercial-original-caption','Posição vazia · foto original preservada na Shopee'));
   const actions=optimizerMake('div','optimizer-commercial-image-actions');
   const generate=optimizerMake('button','secondary',image?'↻ Refazer':'✧ Gerar');
   generate.type='button';generate.disabled=optimizerImagesAutoBusy;
   generate.setAttribute('aria-label',(image?'Refazer':'Gerar')+' imagem '+slot);
   generate.onclick=async()=>{
    if(optimizerImagesAutoBusy)return;
    if(!optimizerImagesSameSku(w))return;
    $('#optimizerImageCorrectionSlot').value=String(slot);optimizerImageCorrectionLoad();
    // A loja escolheu ChatGPT: a API paga só pode ser usada quando selecionada
    // explicitamente, e nunca como fallback automático do botão Refazer.
    if(optimizerImagesMode!=='api'){
     const msg=(image?'Refazendo':'Gerando')+' imagem '+String(slot).padStart(2,'0')+
      ' pelo ChatGPT. A versão anterior permanece salva até a nova imagem ser confirmada.';
     optimizerCommercialActionMessage(msg);
     await optimizerCommercialRequestChatgptSlot(w,slot);return;
    }
    if(!optimizerImagesApiConfigured){
     optimizerCommercialActionMessage('API não conectada. Selecione ChatGPT para refazer esta imagem sem consumir créditos da API.',true);return;
    }
    optimizerImagesAutoBusy=true;optimizerImagesSetProgress();optimizerExecReset();
    try{
     status.textContent='Gerando imagem '+slot+' de 9 pela OpenAI...';
     await optimizerImagesGenerateSlot(w,slot,Boolean(image));
     status.textContent='Imagem '+slot+' salva nesta SKU. Confira antes de aprovar.';
    }catch(e){status.textContent='Imagem '+slot+' não foi gerada: '+e.message+'. As anteriores foram mantidas.';}
    finally{optimizerImagesAutoBusy=false;optimizerImagesSetProgress();if(optimizerImagesSameSku(w))await optimizerImagesLoad();}
   };
   actions.append(generate);
   const adjust=optimizerMake('button','secondary','✎');adjust.type='button';
   adjust.title='Ajustar pedido da imagem '+slot;adjust.setAttribute('aria-label','Ajustar imagem '+slot);
   adjust.onclick=()=>{$('#optimizerImageCorrectionSlot').value=String(slot);optimizerImageCorrectionLoad();void optimizerOpenImagePromptEditor();};
   actions.append(adjust);
   const remove=optimizerMake('button','secondary','⌫');remove.type='button';
   remove.classList.add('optimizer-commercial-delete');
   remove.title=image?'Excluir apenas a imagem comercial preparada':'Não há imagem comercial preparada para excluir';
   remove.setAttribute('aria-label','Excluir imagem preparada '+slot);
   remove.disabled=!image||optimizerImagesAutoBusy;
   remove.onclick=()=>{
    if(!image||optimizerImagesAutoBusy||!optimizerImagesSameSku(w))return;
    // Confirmação DENTRO do cartão: o navegador pode bloquear window.confirm
    // e antes isso deixava o clique aparentemente sem resposta.
    let confirmPanel=card.querySelector('.optimizer-delete-inline-confirm');
    if(confirmPanel){confirmPanel.hidden=false;return;}
    confirmPanel=optimizerMake('div','optimizer-delete-inline-confirm');
    confirmPanel.style.cssText='margin-top:8px;padding:9px;border:1px solid #d2a39c;border-radius:8px;background:#fff8f6;font-size:12px;line-height:1.45';
    confirmPanel.setAttribute('role','group');
    confirmPanel.setAttribute('aria-label','Confirmar exclusão da imagem '+slot);
    confirmPanel.append(optimizerMake('div','', 'Excluir somente a imagem comercial '+String(slot).padStart(2,'0')+'? A imagem publicada na Shopee não será alterada.'));
    const buttons=optimizerMake('div','');
    buttons.style.cssText='display:flex;gap:6px;flex-wrap:wrap;margin-top:7px';
    const yes=optimizerMake('button','secondary','Confirmar exclusão');
    yes.type='button';yes.style.cssText='font-size:12px;padding:7px;background:#8e302c;color:white';
    const no=optimizerMake('button','secondary','Cancelar');
    no.type='button';no.style.cssText='font-size:12px;padding:7px';
    no.onclick=()=>{confirmPanel.remove();};
    yes.onclick=async()=>{
     if(optimizerImagesAutoBusy||!optimizerImagesSameSku(w))return;
     yes.disabled=true;no.disabled=true;
     optimizerImagesAutoBusy=true;optimizerImagesSetProgress();optimizerExecReset();
     let msg='',failed=false;
     try{
      optimizerCommercialActionMessage('Excluindo imagem '+String(slot).padStart(2,'0')+' da SKU '+w.sku+'... Aguarde a confirmação no servidor.');
      // Uma imagem não pode ser excluída durante a geração no mesmo slot.
      if(optimizerChatBridgeBusy&&optimizerChatBridgeIdentity(optimizerChatBridgeJob,w))
       await optimizerChatBridgeRelease('Pausado para excluir a imagem '+slot+'.');
      const params=new URLSearchParams({sku:w.sku,item_id:w.itemId,model_id:w.modelId});
      const before=await json('/api/shopee/optimizer/images/manual?'+params);
      const currently=(before.images||[]).find(row=>Number(row.slot)===slot);
      if(!currently)throw Error('A imagem já não consta no servidor. A galeria será atualizada.');
      if(currently.sha256!==image.sha256)throw Error('A imagem foi alterada desde a abertura desta tela. Confira a galeria antes de excluir.');
      params.set('slot',String(slot));
      const removal=await json('/api/shopee/optimizer/images/manual?'+params,{
       method:'DELETE',signal:AbortSignal.timeout(60000)});
      if(removal.deleted!==true)throw Error('O servidor não confirmou a exclusão da posição '+slot+'.');
      params.delete('slot');
      const check=await json('/api/shopee/optimizer/images/manual?'+params);
      if((check.images||[]).some(row=>Number(row.slot)===slot))
       throw Error('O servidor ainda mostra a imagem '+slot+' após a exclusão.');
      optimizerImagesSavedSlots.delete(slot);
      const stage=w.stages?.find(x=>x.key==='images');
      if(stage){stage.reviewed=false;stage.status='pending';stage.reviewedAt=null;}
      optimizerWorkflowRender(w);
      msg='✓ Imagem '+String(slot).padStart(2,'0')+' excluída e conferida no servidor. Posição livre para gerar novamente. As imagens da Shopee estão intactas.';
     }catch(e){
      failed=true;msg='Não foi possível excluir a imagem '+String(slot).padStart(2,'0')+': '+String(e.message||e);
     }finally{
      optimizerImagesAutoBusy=false;optimizerImagesSetProgress();
      if(optimizerImagesSameSku(w))await optimizerImagesLoad();
      optimizerCommercialActionMessage(msg,failed);
     }
    };
    buttons.append(yes,no);confirmPanel.append(buttons);card.append(confirmPanel);
    optimizerCommercialActionMessage('Confirme a exclusão da imagem '+String(slot).padStart(2,'0')+' no próprio cartão. Nenhum arquivo foi apagado ainda.');
   };
   actions.append(remove);detail.append(actions);
   if(image){
    const moveSelect=optimizerMake('select','optimizer-commercial-move-select');
    moveSelect.setAttribute('aria-label','Mover imagem '+slot+' para outra posição');
    moveSelect.title='Mover ou trocar esta imagem de posição';
    moveSelect.disabled=optimizerImagesAutoBusy;
    const hint=optimizerMake('option','','↔ Mover para…');hint.value='';moveSelect.append(hint);
    for(let destination=1;destination<=9;destination++){
     if(destination===slot)continue;
     const option=optimizerMake('option','',String(destination).padStart(2,'0')+' · '+optimizerCommercialPositionNames[destination-1]);
     option.value=String(destination);moveSelect.append(option);
    }
    moveSelect.value='';
    moveSelect.onchange=()=>{
     const destination=Number(moveSelect.value);moveSelect.value='';
     if(destination>=1&&destination<=9&&destination!==slot)
      void optimizerImagesMove(w,slot,destination,stored);
    };
    detail.append(moveSelect);
   }
   card.append(detail);gallery.append(card);
  }
  if(!gallery.children.length)gallery.append(optimizerMake('p','optimizer-commercial-empty',
   optimizerImagesFilter==='saved'?'Nenhuma imagem comercial preparada nesta SKU.':'Nenhuma posição pendente.'));
  optimizerImagesSetProgress();
  if(!optimizerImagesAutoBusy)status.textContent=stored.size+'/9 imagens salvas. Revise todas e registre a conferência antes de executar na Shopee.';
 }catch(e){status.textContent='Falha ao carregar imagens: '+e.message;}
}
async function optimizerImagesGenerateSlot(w,slot,replace,{editCurrent=false}={}){
 const result=await json('/api/shopee/optimizer/images/generate',{
  method:'POST',headers:{'Content-Type':'application/json'},
  body:JSON.stringify({sku:w.sku,itemId:w.itemId,modelId:w.modelId,slot,replace,editCurrent}),
  signal:AbortSignal.timeout(210000)
 });
 if(optimizerImagesSameSku(w)){
  optimizerImagesSavedSlots.add(slot);
  const stage=w.stages?.find(x=>x.key==='images');
  if(stage){stage.reviewed=false;stage.status='pending';stage.reviewedAt=null;}
  optimizerWorkflowRender(w);optimizerExecReset();
 }
 return result;
}
$('#optimizerOpenAiSave')?.addEventListener?.('click',async()=>{
 const field=$('#optimizerOpenAiKey'),btn=$('#optimizerOpenAiSave'),notice=$('#optimizerOpenAiNotice');
 const key=field.value.trim();
 if(!key){notice.textContent='Crie uma chave na plataforma OpenAI e cole aqui.';return;}
 btn.disabled=true;notice.textContent='Conferindo a chave com a OpenAI e salvando em cofre privado...';
 try{
  const result=await json('/api/shopee/optimizer/images/generation/connect',{
   method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({apiKey:key}),
   signal:AbortSignal.timeout(30000)
  });
  field.value='';
  notice.textContent=result.message||'Conexão ativada! A geração das nove imagens está liberada.';
  optimizerImagesApiConfigured=true;
  await optimizerImagesLoad();
 }catch(e){
  notice.textContent='Não foi possível conectar: '+e.message;
 }finally{btn.disabled=false;}
});
$('#optimizerOpenAiDisconnect')?.addEventListener?.('click',async()=>{
 if(!window.confirm('Desconectar a chave OpenAI salva? As imagens já preparadas serão mantidas.'))return;
 const btn=$('#optimizerOpenAiDisconnect'),notice=$('#optimizerOpenAiNotice');
 btn.disabled=true;
 try{
  const r=await json('/api/shopee/optimizer/images/generation/disconnect',{
   method:'POST',headers:{'Content-Type':'application/json'},body:'{}',signal:AbortSignal.timeout(25000)
  });
  notice.textContent=r.message||'Integração desconectada.';
  await optimizerImagesLoad();
 }catch(e){notice.textContent='Não foi possível desconectar: '+e.message;}
 finally{btn.disabled=false;}
});
$('#optimizerImagesStop')?.addEventListener?.('click',()=>{
 optimizerImagesStopRequested=true;
 $('#optimizerImagesStatus').textContent='Interrupção solicitada. A imagem atual será concluída e salva primeiro.';
});
$('#optimizerImagesGenerateAll')?.addEventListener?.('click',async()=>{
 const w=optimizerWorkflowPlan;
 if(!w||!optimizerImagesSameSku(w)||optimizerImagesAutoBusy)return;
 if(!optimizerImagesApiConfigured){$('#optimizerImagesStatus').textContent='Conecte a API OpenAI no painel acima para gerar imagens.';return;}
 optimizerImagesAutoBusy=true;optimizerImagesStopRequested=false;
 const btn=$('#optimizerImagesGenerateAll'),stop=$('#optimizerImagesStop'),status=$('#optimizerImagesStatus');
 stop.hidden=false;optimizerImagesSetProgress();optimizerExecReset();
 let count=0,errorMessage='';
 try{
  // Retoma somente as posições ainda vazias, sem pagar novamente pelas já salvas.
  for(let slot=1;slot<=9;slot++){
   if(optimizerImagesStopRequested||!optimizerImagesSameSku(w))break;
   if(optimizerImagesSavedSlots.has(slot))continue;
   status.textContent='OpenAI gerando imagem '+slot+' de 9. '+optimizerImagesSavedSlots.size+'/9 concluídas. Não feche o anúncio.';
   await optimizerImagesGenerateSlot(w,slot,false);
   count++;
   await optimizerImagesLoad();
  }
  if(optimizerImagesSameSku(w))
   status.textContent=optimizerImagesSavedSlots.size===9
    ?'9/9 imagens prontas e salvas. Confira a galeria e aprove a etapa antes do envio à Shopee.'
    :optimizerImagesStopRequested?'Geração interrompida. '+optimizerImagesSavedSlots.size+'/9 imagens salvas. Clique novamente para continuar.'
    :'Geração parcial. '+optimizerImagesSavedSlots.size+'/9 imagens disponíveis.';
 }catch(e){
  errorMessage=e.message;
  status.textContent='Geração interrompida: '+errorMessage+'. '+optimizerImagesSavedSlots.size+'/9 imagens permanecem salvas. Use Gerar / retomar para continuar.';
 }finally{
  optimizerImagesAutoBusy=false;stop.hidden=true;optimizerImagesSetProgress();
  if(optimizerImagesSameSku(w))await optimizerImagesLoad();
  if(optimizerImagesSameSku(w)){
   status.textContent=errorMessage?'Falha na geração: '+errorMessage+'. '+optimizerImagesSavedSlots.size+'/9 imagens salvas; clique em Gerar / retomar para tentar novamente.'
    :optimizerImagesSavedSlots.size===9?'9/9 imagens salvas. Confira cada foto e aprove a etapa antes de executar na Shopee.'
    :'Lote encerrado: '+optimizerImagesSavedSlots.size+'/9 imagens salvas. Use Gerar / retomar quando quiser.';
  }
 }
});
$('#optimizerImagesUpload')?.addEventListener?.('click',async()=>{
 const w=optimizerWorkflowPlan,files=[...($('#optimizerImagesFiles').files||[])],start=Number($('#optimizerImagesStart').value);
 if(!w||!files.length)return;
 const status=$('#optimizerImagesStatus'),btn=$('#optimizerImagesUpload');
 if(files.length+start-1>9){status.textContent='A sequência deve ocupar no máximo nove posições.';return;}
 btn.disabled=true;optimizerExecReset();
 try{
  for(const [index,file] of files.entries()){
   if(!['image/jpeg','image/png'].includes(file.type)||file.size>10*1024*1024)throw Error('Use JPG/PNG de até 10 MB.');
   status.textContent='Importando imagem '+(start+index)+' de 9...';
   const res=await fetch('/api/shopee/optimizer/images/manual?'+new URLSearchParams({sku:w.sku,item_id:w.itemId,model_id:w.modelId,slot:start+index}),{
    method:'POST',headers:{'Content-Type':file.type,'X-Image-Filename':encodeURIComponent(file.name)},body:file,signal:AbortSignal.timeout(90000)});
   const data=await res.json();if(!res.ok)throw Error(data.error||'Falha ao importar imagem.');
  }
  if(optimizerWorkflowPlan?.sku===w.sku&&optimizerWorkflowPlan?.itemId===w.itemId&&optimizerWorkflowPlan?.modelId===w.modelId){$('#optimizerImagesFiles').value='';await optimizerImagesLoad();}
 }catch(e){status.textContent='Importação interrompida: '+e.message+'. As imagens já salvas foram mantidas.';}
 finally{btn.disabled=false;}
});


/* Compact image studio API: exposes only the current SKU and existing safe refresh/review methods. */
window.RACommercialStudioBridge={
 getPlan:()=>optimizerWorkflowPlan,
 reload:()=>optimizerImagesLoad(),
 invalidate:()=>{
  const plan=optimizerWorkflowPlan;
  if(!plan)return;
  const stage=plan.stages?.find(x=>x.key==='images');
  if(stage){stage.reviewed=false;stage.status='pending';stage.reviewedAt=null;}
  optimizerExecReset();
  optimizerWorkflowRender(plan);
 }
};
