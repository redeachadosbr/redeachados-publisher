const $=s=>document.querySelector(s);
async function json(url,opt={}){const r=await fetch(url,opt);const d=await r.json().catch(()=>({}));if(!r.ok)throw new Error(d.error||('HTTP '+r.status));return d;}
function fmtDate(v){if(!v)return '—';const n=Number(v);const d=Number.isFinite(n)&&n>1000000000?new Date(n*1000):new Date(v);return Number.isNaN(d.getTime())?String(v):d.toLocaleString('pt-BR');}
function debug(v){$('#output').textContent=typeof v==='string'?v:JSON.stringify(v,null,2);}
function setTab(name){document.querySelectorAll('.tab').forEach(b=>b.classList.toggle('active',b.dataset.tab===name));document.querySelectorAll('.tabpane').forEach(p=>p.classList.toggle('active',p.id==='tab-'+name));if(name==='wedrop')refreshWeDropCoverage();}
document.querySelectorAll('.tab').forEach(b=>b.onclick=()=>setTab(b.dataset.tab));

async function boot(){
  const a=await json('/api/auth-state');
  if(a.locked&&!a.loggedIn){$('#login').classList.remove('hidden');return;}
  $('#app').classList.remove('hidden');await loadStatus();loadCatalogCache();
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
$('#loginBtn').onclick=async()=>{try{await json('/api/login',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({password:$('#password').value})});$('#login').classList.add('hidden');$('#app').classList.remove('hidden');await loadStatus();loadCatalogCache();}catch(e){$('#loginMsg').textContent=e.message;}};
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
let weDropImportBusy=false;
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
    weDropCsvText=raw;weDropPreview=data;
    wdRenderPreview(data);
    $('#wedropPreviewArea').hidden=false;
    $('#wedropOverwrite').checked=false;
    $('#wedropSkipInvalid').checked=false;
    $('#wedropImportBtn').disabled=false;
    wdSetNotice('#wedropPreviewSummary','Arquivo com '+wdNum(data.rowCount)+
      ' linhas. Selecione manualmente as colunas SKU e custo. Confira a prévia antes de confirmar.','info');
    wdSetNotice('#wedropImportStatus','Prévia concluída. Nenhum custo foi gravado no banco.','info');
  }catch(e){
    wdSetNotice('#wedropImportStatus','Falha na prévia: '+e.message,'error');
  }finally{
    button.disabled=false;button.textContent='Conferir colunas do CSV';
  }
};
$('#wedropFile').onchange=()=>{
  weDropCsvText=null;weDropPreview=null;
  $('#wedropPreviewArea').hidden=true;
  wdSetNotice('#wedropImportStatus','Novo arquivo selecionado. Confira novamente suas colunas.','info');
};
$('#wedropImportBtn').onclick=async()=>{
  if(weDropImportBusy)return;
  const skuColumn=$('#wedropSkuColumn').value,costColumn=$('#wedropCostColumn').value;
  if(!weDropPreview||!weDropCsvText||skuColumn===''||costColumn===''||skuColumn===costColumn){
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
    weDropCsvText=null;
    $('#wedropPreviewArea').hidden=true;
    await refreshWeDropCoverage();
  }catch(e){
    wdSetNotice('#wedropImportStatus','Não foi possível concluir a importação: '+e.message+
      ' Verifique os dados antes de tentar novamente.','error');
  }finally{
    weDropImportBusy=false;button.disabled=false;button.textContent='Confirmar importação dos custos';
  }
};
async function refreshWeDropCoverage(){
  const button=$('#wedropRefreshBtn');
  if(button.disabled)return;
  button.disabled=true;button.textContent='Consultando...';
  wdSetNotice('#wedropCoverageStatus','Cruzando SKUs cadastrados no Supabase...','info');
  try{
    const data=await json('/api/shopee/wedrop/coverage',{signal:AbortSignal.timeout(45000)});
    const t=data.totals||{};
    $('#wedropCompared').textContent=wdNum(t.comparedSkus);
    $('#wedropMatched').textContent=wdNum(t.matched);
    $('#wedropMissingCost').textContent=wdNum(t.missingCost);
    $('#wedropPendingModels').textContent=wdNum(t.waitingModels);
    $('#wedropImported').textContent=wdNum(t.importedCosts);
    const body=$('#wedropCoverageBody');body.replaceChildren();
    for(const x of data.rows||[]){
      const tr=document.createElement('tr');
      const values=[
        x.name||'Anúncio '+x.itemId,x.sku,
        wdMoney(x.price),wdMoney(x.unitCost),wdMoney(x.grossDifference),
        x.costMatched?'Custo vinculado':'SEM CUSTO'
      ];
      for(const val of values){
        const td=document.createElement('td');td.textContent=String(val);
        tr.appendChild(td);
      }
      if(!x.costMatched)tr.className='wedrop-missing';
      body.appendChild(tr);
    }
    if(!data.rows?.length){
      const tr=document.createElement('tr'),td=document.createElement('td');td.colSpan=6;
      td.textContent='Sem SKUs sincronizados para comparação. Sincronize o catálogo na aba Produtos.';
      tr.appendChild(td);body.appendChild(tr);
    }
    const text='Cruzamento: '+wdNum(t.matched)+' de '+wdNum(t.comparedSkus)+
      ' SKUs encontrados nos custos WeDrop. '+wdNum(t.withoutSku)+' anúncios/modelos sem SKU, '+
      wdNum(t.waitingModels)+' anúncios aguardando consulta das variações. '+
      wdNum(t.supplierSkusNotMatched)+' custos importados sem SKU correspondente no catálogo.'+
      (data.truncated?' Exibindo somente os primeiros 500 resultados.':'')+
      ' Diferença bruta não é lucro líquido.';
    wdSetNotice('#wedropCoverageStatus',text,t.missingCost||t.waitingModels?'warning':'success');
  }catch(error){
    wdSetNotice('#wedropCoverageStatus','Não foi possível conferir custos: '+error.message,'error');
  }finally{
    button.disabled=false;button.textContent='Atualizar cruzamento';
  }
}
$('#wedropRefreshBtn').onclick=refreshWeDropCoverage;

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