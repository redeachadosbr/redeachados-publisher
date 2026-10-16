const $=s=>document.querySelector(s);
async function json(url,opt={}){const r=await fetch(url,opt);const d=await r.json().catch(()=>({}));if(!r.ok)throw new Error(d.error||('HTTP '+r.status));return d;}
function fmtDate(v){if(!v)return '—';const n=Number(v);const d=Number.isFinite(n)&&n>1000000000?new Date(n*1000):new Date(v);return Number.isNaN(d.getTime())?String(v):d.toLocaleString('pt-BR');}
function debug(v){$('#output').textContent=typeof v==='string'?v:JSON.stringify(v,null,2);}
// Roteador do aplicativo SaaS. Cada setor tem URL própria sem desmontar os formulários,
 // preservando cálculos em andamento e os controles já conectados à API Shopee.
const APP_PAGES={
  overview:{slug:'inicio',title:'Painel inicial',group:'Visão geral',
    description:'Informações essenciais e acesso rápido aos setores da sua loja.'},
  products:{slug:'produtos',title:'Produtos e anúncios',group:'Operação',
    description:'Catálogo, variações, estoque e situação dos anúncios Shopee.'},
  orders:{slug:'pedidos',title:'Pedidos e vendas',group:'Operação',
    description:'Consulte as vendas e os estados dos seus pedidos.'},
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
  const page=APP_PAGES[name];
  const pane=$('#tab-'+name);
  if(!pane)return;
  activeAppPage=name;
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
  if(name==='wedrop'){refreshWeDropCoverage();loadWeDropSourceState();void loadWeDropSkuReview();}
  else if(name==='finance'){refreshWeDropCoverage();}
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
    $('#statusPill').textContent=s.connected?'API conectada':'API pendente';
    $('#statusPill').classList.toggle('ok',Boolean(s.connected));
    $('#testBtn').disabled=!s.connected;
    $('#retryTestBtn').disabled=!s.connected;
    $('#refreshBtn').disabled=!s.connected;
    $('#signatureBtn').disabled=!s.configured||s.mode!=='live';
  }catch(e){$('#connTitle').textContent='Erro de configuração';$('#connMeta').textContent=e.message;$('#statusPill').textContent='Erro';}
}
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
      for(const x of data.items){
        if(x.itemId&&!catalogMap.has(x.itemId))catalogMap.set(x.itemId,x);
      }
      catalogRender();
      if(data.items.length){
        $('#productsSummary').dataset.state='warning';
        $('#productsSummary').textContent='Histórico recuperado do Supabase: '+data.items.length+
          ' anúncios. Dados salvos anteriormente podem estar desatualizados. '+
          'Clique em Sincronizar catálogo para conferir todos os anúncios e atualizar o estoque.';
      }
    }
  }catch(error){
    catalogCacheLoaded=false;
    // A falha de cache não impede a consulta direta à Shopee.
    debug({catalogCache:'indisponível',error:String(error.message||error)});
  }
}
let catalogProgress={statusIndex:0,offset:0,page:0};
let catalogBusy=false,catalogStop=false,catalogDone=false,catalogRowsLimit=150;
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
    return (status==='ALL'||x.status===status)&&
      (!q||[x.itemId,x.sku,x.title].some(v=>String(v||'').toLocaleLowerCase('pt-BR').includes(q)));
  });
  if(sort==='name')result.sort((a,b)=>a.title.localeCompare(b.title,'pt-BR'));
  else if(sort==='stock')result.sort((a,b)=>(a.stock??Infinity)-(b.stock??Infinity));
  else if(sort==='price')result.sort((a,b)=>(a.price??Infinity)-(b.price??Infinity));
  else result.sort((a,b)=>(b.updateTime||0)-(a.updateTime||0));
  return result;
}
function catalogCell(tr,value){
  const td=document.createElement('td');td.textContent=String(value??'—');tr.appendChild(td);return td;
}
function catalogRender(){
  const rows=catalogFiltered();
  const body=$('#productsBody');body.replaceChildren();
  for(const x of rows.slice(0,catalogRowsLimit)){
    const tr=document.createElement('tr');
    const product=document.createElement('td');
    const top=document.createElement('div');top.className='catalog-product-title';
    if(x.imageUrl){
      const img=document.createElement('img');
      img.src=x.imageUrl;img.alt='';img.loading='lazy';img.width=48;img.height=48;top.appendChild(img);
    }
    const title=document.createElement('span');title.textContent=x.title||'Nome indisponível';top.appendChild(title);
    product.appendChild(top);tr.appendChild(product);
    catalogCell(tr,x.itemId+' / '+(x.sku||'Sem SKU'));
    catalogCell(tr,x.status);
    catalogCell(tr,catalogMoney(x.price));
    catalogCell(tr,x.hasModel?'Ver variações':catalogNumber(x.stock));
    catalogCell(tr,x.promotion?'Sim':'—');
    catalogCell(tr,fmtDate(x.updateTime));
    const action=document.createElement('td');
    const b=document.createElement('button');b.type='button';b.className='mini';b.textContent=x.hasModel?'Variações':'Detalhes';
    b.onclick=()=>catalogShowModels(x);
    action.appendChild(b);tr.appendChild(action);body.appendChild(tr);
  }
  if(!rows.length){
    const tr=document.createElement('tr');const td=document.createElement('td');td.colSpan=8;
    td.textContent=catalogBusy?'Buscando anúncios na Shopee...':'Nenhum anúncio encontrado com estes filtros.';
    tr.appendChild(td);body.appendChild(tr);
  }
  const all=catalogAll();
  $('#catalogTotal').textContent=catalogNumber(all.length);
  $('#catalogActive').textContent=catalogNumber(all.filter(x=>x.status==='NORMAL').length);
  $('#catalogUnlisted').textContent=catalogNumber(all.filter(x=>x.status==='UNLIST').length);
  $('#catalogNoSku').textContent=catalogNumber(all.filter(x=>!x.sku).length);
  $('#catalogStockZero').textContent=catalogNumber(all.filter(x=>x.stock===0).length);
  $('#productsRowsShown').textContent=rows.length?'Exibindo '+Math.min(rows.length,catalogRowsLimit)+' de '+rows.length+' registros filtrados.':'';
  $('#productsMoreBtn').hidden=rows.length<=catalogRowsLimit;
  $('#exportProductsBtn').disabled=!all.length;
}
function catalogSummaryText(prefix=''){
  const all=catalogAll();
  const unknown=all.filter(x=>!x.baseLoaded).length;
  const state=catalogDone?(catalogProblems.length?'Listagem concluída com ressalvas':'Listagem concluída'):catalogBusy?'Em andamento':'Parcial';
  const notice=$('#productsSummary');
  notice.dataset.state=catalogProblems.length?'warning':catalogDone?'success':catalogBusy?'loading':'warning';
  notice.textContent=(prefix?prefix+' ':'')+'Catálogo: '+state+'. '+all.length+
    ' anúncios únicos carregados; '+unknown+' sem detalhes.'+
    (catalogProblems.length?' Avisos: '+catalogProblems.slice(-3).join(' | '):'')+
    (!catalogDone?' É possível continuar sem descartar os anúncios já obtidos.':'');
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
    catalogMap.clear();catalogProgress={statusIndex:0,offset:0,page:0};catalogProblems=[];catalogDone=false;
  }
  catalogBusy=true;catalogStop=false;
  const btn=$('#loadProductsBtn');btn.disabled=true;
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
        if(item.itemId)catalogMap.set(item.itemId,item);
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
    catalogSummaryText(catalogStop?'Sincronização interrompida a pedido.':catalogDone?'Sincronização finalizada.':'Sincronização incompleta.');
  }finally{
    catalogBusy=false;btn.disabled=false;
    btn.textContent=catalogDone?'Sincronizar novamente':'Continuar sincronização';
    $('#stopProductsBtn').hidden=true;
    catalogRender();
  }
}
$('#loadProductsBtn').onclick=catalogScan;
$('#stopProductsBtn').onclick=()=>{catalogStop=true;$('#stopProductsBtn').disabled=true;$('#stopProductsBtn').textContent='Interrompendo...';};
$('#productsSearch').oninput=()=>{catalogRowsLimit=150;catalogRender();};
$('#productsStatusFilter').onchange=()=>{catalogRowsLimit=150;catalogRender();};
$('#productsSort').onchange=()=>{catalogRowsLimit=150;catalogRender();};
$('#productsMoreBtn').onclick=()=>{catalogRowsLimit+=150;catalogRender();};
$('#exportProductsBtn').onclick=()=>{
  const headers=['Item ID','SKU','Título','Status','Preço BRL','Estoque','Tem variações','Promoção','Atualização','Detalhes confirmados'];
  const data=catalogFiltered().map(x=>[x.itemId,x.sku,x.title,x.status,
    x.price??'',x.stock??'',x.hasModel?'Sim':'Não',x.promotion?'Sim':'Não',fmtDate(x.updateTime),x.baseLoaded?'Sim':'Não']);
  const csv='\uFEFF'+[headers,...data].map(row=>row.map(catalogCsvProtect).join(';')).join('\r\n');
  const url=URL.createObjectURL(new Blob([csv],{type:'text/csv;charset=utf-8'}));
  const anchor=document.createElement('a');anchor.href=url;anchor.download='shopee-catalogo-'+new Date().toISOString().slice(0,10)+'.csv';
  document.body.appendChild(anchor);anchor.click();anchor.remove();URL.revokeObjectURL(url);
};
catalogRender();

$('#loadOrdersBtn').onclick=async()=>{
  const b=$('#ordersBody');b.innerHTML='<tr><td colspan="3">Carregando…</td></tr>';
  try{
    const d=await json('/api/shopee/orders?page_size=50');debug(d);
    const orders=d.response?.order_list||[];
    const datesCount=orders.filter(o=>Number(o.create_time)>0).length;
    const countText=`${orders.length} pedido(s) retornado(s) nos últimos 15 dias.`;
    const datesText=orders.length?` Datas de criação: ${datesCount} de ${orders.length}.`:'';
    const moreText=d.response?.more?' Existem mais pedidos; a paginação será implementada na sincronização completa.':'';
    const warningText=d.detailStatus?.warning?' '+d.detailStatus.warning:'';
    $('#ordersSummary').textContent=countText+datesText+moreText+warningText;
    b.replaceChildren();
    if(!orders.length){
      const empty=document.createElement('tr');
      const cell=document.createElement('td');
      cell.colSpan=3;
      cell.textContent='Nenhum pedido encontrado no período consultado.';
      empty.appendChild(cell);
      b.appendChild(empty);
    }
    for(const x of orders){
      const tr=document.createElement('tr');
      [x.order_sn||'—',x.order_status||'—',fmtDate(x.create_time)].forEach(value=>{
        const td=document.createElement('td');
        td.textContent=String(value);
        tr.appendChild(td);
      });
      b.appendChild(tr);
    }
  }catch(e){b.innerHTML='<tr><td colspan="3">'+e.message+'</td></tr>';$('#ordersSummary').textContent='Falha na consulta.';}
};

function ddmmyyyy(v){if(!v)return'';const [y,m,d]=v.split('-');return `${d}-${m}-${y}`;}
const today=new Date(), before=new Date(Date.now()-7*86400000);
$('#adsEnd').value=today.toISOString().slice(0,10);$('#adsStart').value=before.toISOString().slice(0,10);
const adsMoney=v=>new Intl.NumberFormat('pt-BR',{style:'currency',currency:'BRL'}).format(Number(v)||0);
const adsNum=v=>new Intl.NumberFormat('pt-BR',{maximumFractionDigits:2}).format(Number(v)||0);
const adsMetric=v=>v===null||v===undefined?'—':adsNum(v);
let adsCampaignRows=[];
let adsCurrentGroup='active';
function adsStatusLabel(code){
  const map={ongoing:'Ativa / Rodando',paused:'Pausada',ended:'Encerrada',
    deleted:'Excluída',closed:'Desativada / Fechada',scheduled:'Agendada',unknown:'Não confirmado'};
  const key=String(code||'unknown').toLowerCase();
  return map[key]||('Outro: '+key);
}
function displayAdsGroup(group){
  adsCurrentGroup=group;
  const labels={active:'Ativas',inactive:'Pausadas ou desativadas',other:'Outras ou sem confirmação'};
  document.querySelectorAll('.ads-status-tab').forEach(button=>{
    const selected=button.dataset.adsGroup===group;
    button.classList.toggle('selected',selected);
    button.setAttribute('aria-pressed',selected?'true':'false');
  });
  const filtered=adsCampaignRows.filter(c=>c.statusGroup===group);
  $('#adsFilterSummary').textContent=filtered.length+' campanha(s) — '+labels[group]+
    '. O status corresponde à situação atual na Shopee; Impressões, Cliques e CTR ao período selecionado.';
  const body=$('#adsResultsBody');body.replaceChildren();
  if(!filtered.length){
    const tr=document.createElement('tr'),td=document.createElement('td');
    td.colSpan=10;
    td.textContent=group==='active'?'Nenhuma campanha confirmada como ativa na consulta atual. Confira as outras abas.':
      group==='inactive'?'Nenhuma campanha pausada, encerrada ou desativada identificada.':
      'Nenhuma campanha agendada ou com status não confirmado.';
    tr.appendChild(td);body.appendChild(tr);return;
  }
  for(const campaign of filtered){
    const tr=document.createElement('tr');
    const cells=[
      (campaign.name||'Campanha')+' · '+campaign.campaignId,
      adsStatusLabel(campaign.status),
      campaign.adType||'—',
      adsNum(campaign.impressions),
      adsNum(campaign.clicks),
      campaign.ctr===null?'—':adsNum(campaign.ctr)+'%',
      adsMoney(campaign.expense),
      adsMoney(campaign.broadGmv),
      campaign.roas===null?'—':adsNum(campaign.roas)+'x',
      campaign.acos===null?'—':adsNum(campaign.acos)+'%'
    ];
    for(const value of cells){
      const td=document.createElement('td');td.textContent=String(value);tr.appendChild(td);
    }
    body.appendChild(tr);
  }
}
document.querySelectorAll('.ads-status-tab').forEach(button=>{
  button.onclick=()=>displayAdsGroup(button.dataset.adsGroup);
});
function renderShopeeAds(data){
  const campaigns=Array.isArray(data.campaigns)?data.campaigns:[];
  const total=data.total||{};
  const counts=data.statusCounts||{active:0,inactive:0,other:campaigns.length};
  adsCampaignRows=campaigns;
  $('#adsResults').hidden=false;
  $('#adsCampaignCount').textContent=data.campaignCount??campaigns.length;
  $('#adsImpressions').textContent=adsNum(total.impressions);
  $('#adsClicks').textContent=adsNum(total.clicks);
  $('#adsCtr').textContent=total.ctr===null||total.ctr===undefined?'—':adsNum(total.ctr)+'%';
  $('#adsExpense').textContent=adsMoney(total.expense);
  $('#adsGmv').textContent=adsMoney(total.broadGmv);
  $('#adsRoasAcos').textContent=adsMetric(total.roas)+'x / '+(total.acos===null?'—':adsNum(total.acos)+'%');
  $('#adsActiveCount').textContent=counts.active||0;
  $('#adsInactiveCount').textContent=counts.inactive||0;
  $('#adsOtherCount').textContent=counts.other||0;
  $('#adsOtherTab').hidden=!(counts.other>0);
  $('#adsStatusExplanation').textContent=data.statusWarning
    ?'Atenção: '+data.statusWarning+' Campanhas sem status confirmado ficam na aba Outras / Sem confirmação.'
    :'Situação atual confirmada pela API Shopee; as métricas são do período selecionado (inclusive nas campanhas pausadas).';
  displayAdsGroup('active');
}
$('#loadAdsAutoBtn').onclick=async()=>{
  const button=$('#loadAdsAutoBtn'),summary=$('#adsSummary');
  if(button.disabled)return;
  button.disabled=true;button.textContent='Consultando campanhas...';
  summary.textContent='Buscando os IDs de campanhas e resultados pela Shopee. Aguarde.';
  summary.dataset.state='loading';
  $('#adsResults').hidden=true;
  try{
    const start=$('#adsStart').value,end=$('#adsEnd').value;
    if(!start||!end||start>=end)throw Error('Selecione um período válido, com pelo menos dois dias.');
    const q=new URLSearchParams({start_date:start,end_date:end});
    const data=await json('/api/shopee/ads/overview?'+q,{signal:AbortSignal.timeout(120000)});
    if(!data.ok)throw Error(data.error||'Resposta de Ads não confirmada.');
    renderShopeeAds(data);
    summary.dataset.state='success';
    summary.textContent='Consulta concluída: '+data.campaignCount+' campanhas identificadas, '+
      (data.total?.withData||0)+' com métricas no período. '+(data.statusWarning?' Status: '+data.statusWarning+' ':'')+data.caveat;
    debug({shopId:data.shopId,campaignCount:data.campaignCount,dates:data.dates,total:data.total,coverage:data.coverage});
  }catch(error){
    const message=error?.name==='TimeoutError'?'Tempo de consulta excedido. Tente novamente com período menor.':String(error.message||error);
    summary.dataset.state='error';
    summary.textContent='Não foi possível consultar Ads: '+message+
      (/permission|denied|403|restricted|api_permission/i.test(message)
        ?' Verifique o acesso ao módulo Ads na Shopee Open Platform.':' Confira a autorização e tente novamente.');
    debug({adsError:message});
  }finally{
    button.disabled=false;button.textContent='Localizar campanhas e analisar';
  }
};
$('#loadAdsBtn').onclick=async()=>{
  try{
    const ids=$('#campaignIds').value.trim();
    if(!ids)throw new Error('Informe pelo menos um Campaign ID.');
    const q=new URLSearchParams({campaign_ids:ids,start_date:ddmmyyyy($('#adsStart').value),end_date:ddmmyyyy($('#adsEnd').value)});
    const d=await json('/api/shopee/ads/product-campaign-performance?'+q);debug(d);
    const campaigns=(d.response||[]).flatMap(x=>x.campaign_list||[]);
    let expense=0,gmv=0,clicks=0,impressions=0;
    campaigns.forEach(c=>(c.metrics_list||[]).forEach(m=>{expense+=Number(m.expense||0);gmv+=Number(m.broad_gmv||0);clicks+=Number(m.clicks||0);impressions+=Number(m.impression||0);}));
    const roas=expense?gmv/expense:0, acos=gmv?expense/gmv*100:0;
    $('#adsSummary').textContent=`Campanhas: ${campaigns.length} · Gasto: R$ ${expense.toFixed(2)} · GMV: R$ ${gmv.toFixed(2)} · ROAS: ${roas.toFixed(2)} · ACOS: ${acos.toFixed(1)}% · Cliques: ${clicks} · Impressões: ${impressions}`;
  }catch(e){$('#adsSummary').textContent=e.message;debug(e.message);}
};

// Custos WeDrop: importação exige prévia e mapeamento explícito do arquivo CSV.
let weDropCsvText=null;
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
    if(!file)throw Error('Selecione um arquivo CSV exportado da WeDrop.');
    if(file.size>4_000_000)throw Error('Arquivo acima de 4 MB. Divida o CSV em partes menores.');
    const raw=await file.text();
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
    button.disabled=false;button.textContent='Conferir colunas do CSV';
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
      $('#wedropStoredSummary').textContent=
        wdNum(status.storedCosts)+' SKUs com custo salvos permanentemente no Supabase. '+
        'Última sincronização: '+savedAt+'. '+
        (state?'Última conferência: '+wdNum(state.changed_skus)+' custos novos ou alterados. ':'')+
        'Os anúncios Shopee utilizam estes custos automaticamente no cruzamento.';
    }else{
      $('#wedropUploadDetails').open=true;
      $('#wedropNoCatalogMessage').textContent=
        'Ainda não há custos WeDrop cadastrados nesta loja. '+
        'Selecione um CSV oficial uma única vez para começar.';
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
  weDropCsvText=null;weDropPreview=null;weDropValidation=null;
  $('#wedropImportBtn').disabled=true;
  $('#wedropPreviewArea').hidden=true;
  $('#wedropZeroMatchLabel').hidden=true;
  const file=$('#wedropFile').files?.[0];
  if(!file)return;
  const control=$('#wedropFile');
  if(file.size>4_000_000){
    wdSetNotice('#wedropAutoStatus',
      'Arquivo acima de 4 MB. Divida o CSV ou utilize uma origem de feed autorizada.','error');
    return;
  }
  control.disabled=true;
  wdSetNotice('#wedropAutoStatus',
    'Lendo catálogo oficial WeDrop e atualizando custos por SKU automaticamente...','info');
  try{
    const raw=await file.text();
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
      '. Se este CSV não segue o layout oficial, abra a importação manual avançada.','error');
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
    :'Nenhuma pendência de custo encontrada.';
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
  $('#wedropReviewMessage').textContent=data.warning||
    'Confirme o produto antes de aplicar qualquer vínculo.';
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
function financeAdsBySku(report){
 const sweep=report?.adsSweep;
 return sweep?.status==='verified_campaign_period'
   ?new Map((sweep.skuCosts||[]).map(x=>[String(x.sku),x]))
   :new Map();
}
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
  for(const x of (sweep.review||[]).slice(0,120)){
   const row=financeSkuNode('div','finance-ads-exception-row');
   row.appendChild(financeSkuNode('strong','',
     'Campanha '+x.campaignId+' · '+wdMoney(x.expense)));
   row.appendChild(financeSkuNode('span','',x.situation));
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
  for(const btn of document.querySelectorAll('[data-finance-filter]').forEach(btn=>{
  btn.onclick=()=>{financeSkuFilter=btn.dataset.financeFilter;financeSkuShown=24;renderFinanceSkuList();};
});
$('#financeSkuSearch').oninput=()=>{financeSkuShown=24;renderFinanceSkuList();};
$('#financeSkuMore').onclick=()=>{financeSkuShown+=24;renderFinanceSkuList();};
function financeSelectionChanged(){
  const selected=$('#shopeeFinanceDays').value;
  $('#financeCustomDates').hidden=selected!=='custom';
  financeReport=null;financeSkuShown=24;renderFinanceSkuList();
  $('#shopeeFinanceData').hidden=true;
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
    $('#financePeriodCaption').textContent='Exibindo apenas pedidos criados em '+
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
      for(const value of data){
        const td=document.createElement('td');td.textContent=String(value);
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
    financeReport=null;financeSkuBalances.clear();
    $('#shopeeFinanceData').hidden=true;renderFinanceSkuList();
    wdSetNotice('#shopeeFinanceStatus','Não foi possível verificar os dados financeiros: '+
      error.message+'. Lucro líquido e margem permanecem indisponíveis.','error');
  }finally{
    shopeeFinanceBusy=false;
    button.disabled=false;button.textContent='Atualizar financeiro';
  }
};



// Monitor de vendas: consultas com autenticação da sessão, sem expor dados privados.
let monitorSeenAlerts=null;
let monitorChecking=false;
function monitorDate(epoch){
  const n=Number(epoch);
  return n>1000000000?new Date(n*1000).toLocaleString('pt-BR',{
    timeZone:'America/Sao_Paulo',dateStyle:'short',timeStyle:'short'
  }):'Não informado pela Shopee';
}
function setMonitorText(id,value){const node=$(id);if(node)node.textContent=String(value);}
function monitorRiskLabel(risk){
  return ({overdue:'PRAZO VENCIDO',critical:'Menos de 2 horas',urgent:'Menos de 6 horas',
    today:'Menos de 24 horas',soon:'Menos de 48 horas',
    unknown:'Conferir prazo',normal:'No prazo'})[risk]||'Conferir';
}
function renderPending(orders){
  const body=$('#monitorPendingBody');body.replaceChildren();
  if(!orders.length){
    const tr=document.createElement('tr');
    const td=document.createElement('td');td.colSpan=4;
    td.textContent='Nenhum pedido pendente de envio na última sincronização concluída. Confira a saúde do monitor acima.';
    tr.appendChild(td);body.appendChild(tr);return;
  }
  for(const x of orders){
    const tr=document.createElement('tr');
    if(['overdue','critical'].includes(x.risk))tr.className='monitor-danger-row';
    [x.order_sn,x.order_status,monitorDate(x.ship_by_date),monitorRiskLabel(x.risk)].forEach(v=>{
      const td=document.createElement('td');td.textContent=String(v||'—');tr.appendChild(td);
    });
    body.appendChild(tr);
  }
}
function renderAlerts(items){
  const container=$('#monitorAlerts');container.replaceChildren();
  if(!items.length){container.textContent='Nenhum aviso registrado até o momento.';return;}
  for(const a of items){
    const article=document.createElement('article');
    article.className='order-alert '+String(a.severity||'info')+(a.read_at?' read':'');
    const title=document.createElement('strong');title.textContent=a.title||'Aviso Shopee';
    const message=document.createElement('p');message.textContent=a.message||'';
    const meta=document.createElement('small');
    meta.textContent=new Date(a.created_at).toLocaleString('pt-BR',{timeZone:'America/Sao_Paulo'})+
      (a.read_at?' · Lido':' · Novo');
    article.append(title,message,meta);
    if(!a.read_at){
      const btn=document.createElement('button');btn.className='mini secondary';
      btn.textContent='Marcar como lido';
      btn.onclick=async()=>{
        btn.disabled=true;
        try{await json('/api/shopee/monitor/read',{
          method:'POST',headers:{'Content-Type':'application/json'},
          body:JSON.stringify({alert_key:a.alert_key})
        });await refreshMonitor();}
        catch(e){btn.disabled=false;setMonitorText('#monitorStatus','Falha ao marcar aviso: '+e.message);}
      };
      article.appendChild(btn);
    }
    container.appendChild(article);
  }
}
async function refreshMonitor(){
  if(!$('#monitorStatus'))return;
  try{
    const d=await json('/api/shopee/monitor');
    const status=d.status||{};
    const pending=d.pending||[],alerts=d.alerts||[];
    setMonitorText('#monitorPendingCount',pending.length);
    setMonitorText('#monitorCriticalCount',pending.filter(x=>['overdue','critical'].includes(x.risk)).length);
    setMonitorText('#monitorUnreadCount',d.unread||0);
    setMonitorText('#monitorLastRun',status.lastSuccessAt
      ?new Date(status.lastSuccessAt).toLocaleString('pt-BR',{timeZone:'America/Sao_Paulo'}):'Aguardando');
    setMonitorText('#monitorBadge',(d.unread||0)?'('+(d.unread||0)+')':'');
    const health=status.health||{};
    const panelOnly=status.alertChannel!=='telegram';
    const notice=$('#monitorStatus');
    notice.dataset.health=health.state||'never';
    let text=(status.working?'Verificação em andamento. ':'')+
      (health.reason||'Aguardando verificação de saúde do monitor.')+
      ' Consultas previstas a cada '+(status.intervalMinutes||5)+' min somente enquanto o Render estiver ativo.'+
      (panelOnly?' Alertas somente no painel e neste navegador.':' Canal externo habilitado.')+
      (status.lastError?' Último erro: '+status.lastError:'');
    setMonitorText('#monitorStatus',text);
    renderPending(pending);
    renderAlerts(alerts);
    const keys=new Set(alerts.map(x=>x.alert_key));
    if(monitorSeenAlerts!==null&&typeof Notification!=='undefined'&&Notification.permission==='granted'){
      for(const a of alerts){
        if(!monitorSeenAlerts.has(a.alert_key)&&!a.read_at){
          try{new Notification('Shopee: '+a.title,{body:a.message,tag:a.alert_key});}catch{}
        }
      }
    }
    monitorSeenAlerts=keys;
  }catch(e){setMonitorText('#monitorStatus','Monitor não disponível: '+e.message+'. Atualize a página ou repita a consulta.');}
}
$('#checkOrdersBtn').onclick=async()=>{
  if(monitorChecking)return;
  monitorChecking=true;
  const b=$('#checkOrdersBtn');b.disabled=true;b.textContent='Verificando...';
  setMonitorText('#monitorStatus','Consultando novos pedidos e prazos oficiais da Shopee. Aguarde.');
  try{
    const d=await json('/api/shopee/monitor/check-now',{method:'POST',signal:AbortSignal.timeout(120000)});
    setMonitorText('#monitorStatus',d.busy?'Já existe uma verificação em andamento.':'Consulta concluída: '+d.scanned+' pedidos analisados, '+d.newAlerts+' novo(s) aviso(s).');
  }catch(e){setMonitorText('#monitorStatus','Não foi possível concluir: '+e.message+'. Utilize Verificar pedidos agora para tentar novamente.');}
  finally{monitorChecking=false;b.disabled=false;b.textContent='Verificar pedidos agora';await refreshMonitor();}
};
$('#enableBrowserAlertsBtn').onclick=async()=>{
  const b=$('#enableBrowserAlertsBtn');
  if(typeof Notification==='undefined'){b.textContent='Navegador não suporta alertas';return;}
  const permission=await Notification.requestPermission();
  b.textContent=permission==='granted'?'Avisos do navegador ativados':'Avisos bloqueados no navegador';
};
if(typeof setTimeout==='function')setTimeout(()=>refreshMonitor(),1500);
if(typeof setInterval==='function')setInterval(()=>refreshMonitor(),60000);

boot();