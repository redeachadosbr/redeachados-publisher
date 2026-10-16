const $=s=>document.querySelector(s);
async function json(url,opt={}){const r=await fetch(url,opt);const d=await r.json().catch(()=>({}));if(!r.ok)throw new Error(d.error||('HTTP '+r.status));return d;}
function fmtDate(v){if(!v)return '—';const n=Number(v);const d=Number.isFinite(n)&&n>1000000000?new Date(n*1000):new Date(v);return Number.isNaN(d.getTime())?String(v):d.toLocaleString('pt-BR');}
function debug(v){$('#output').textContent=typeof v==='string'?v:JSON.stringify(v,null,2);}
function setTab(name){document.querySelectorAll('.tab').forEach(b=>b.classList.toggle('active',b.dataset.tab===name));document.querySelectorAll('.tabpane').forEach(p=>p.classList.toggle('active',p.id==='tab-'+name));}
document.querySelectorAll('.tab').forEach(b=>b.onclick=()=>setTab(b.dataset.tab));

async function boot(){
  const a=await json('/api/auth-state');
  if(a.locked&&!a.loggedIn){$('#login').classList.remove('hidden');return;}
  $('#app').classList.remove('hidden');await loadStatus();
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
$('#loginBtn').onclick=async()=>{try{await json('/api/login',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({password:$('#password').value})});$('#login').classList.add('hidden');$('#app').classList.remove('hidden');await loadStatus();}catch(e){$('#loginMsg').textContent=e.message;}};
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

$('#loadProductsBtn').onclick=async()=>{
  const b=$('#productsBody');b.innerHTML='<tr><td colspan="4">Carregando…</td></tr>';
  try{
    const d=await json('/api/shopee/products?page_size=50&item_status=NORMAL');
    debug(d);
    const items=d.response?.item||d.response?.item_list||[];
    $('#productsSummary').textContent=`${items.length} produto(s) retornado(s) nesta página.`;
    b.innerHTML=items.length?'':'<tr><td colspan="4">Nenhum produto no Sandbox.</td></tr>';
    for(const x of items){
      const id=x.item_id??x.itemid??'—';
      const tr=document.createElement('tr');
      tr.innerHTML=`<td>${id}</td><td>${x.item_status||x.status||'—'}</td><td>${fmtDate(x.update_time)}</td><td><button class="mini" data-id="${id}">Detalhes</button></td>`;
      b.appendChild(tr);
    }
    b.querySelectorAll('.mini').forEach(btn=>btn.onclick=async()=>{try{const d=await json('/api/shopee/products/base-info?item_ids='+encodeURIComponent(btn.dataset.id));debug(d);}catch(e){debug(e.message);}});
  }catch(e){b.innerHTML='<tr><td colspan="4">'+e.message+'</td></tr>';$('#productsSummary').textContent='Falha na consulta.';}
};

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
function renderShopeeAds(data){
  const campaigns=Array.isArray(data.campaigns)?data.campaigns:[];
  const total=data.total||{};
  $('#adsResults').hidden=false;
  $('#adsCampaignCount').textContent=data.campaignCount||0;
  $('#adsExpense').textContent=adsMoney(total.expense);
  $('#adsGmv').textContent=adsMoney(total.broadGmv);
  $('#adsRoasAcos').textContent=adsMetric(total.roas)+'x / '+(total.acos===null?'—':adsNum(total.acos)+'%');
  const body=$('#adsResultsBody');body.replaceChildren();
  if(!campaigns.length){
    const tr=document.createElement('tr'),td=document.createElement('td');
    td.colSpan=7;td.textContent='Nenhuma campanha de anúncio de produto retornada para esta loja.';
    tr.appendChild(td);body.appendChild(tr);
    return;
  }
  for(const campaign of campaigns){
    const tr=document.createElement('tr');
    const cells=[
      (campaign.name||'Campanha')+' · '+campaign.campaignId,
      campaign.adType||'—',
      adsMoney(campaign.expense),adsMoney(campaign.broadGmv),
      campaign.roas===null?'—':adsNum(campaign.roas)+'x',
      campaign.acos===null?'—':adsNum(campaign.acos)+'%',
      adsNum(campaign.clicks)
    ];
    for(const value of cells){
      const td=document.createElement('td');td.textContent=String(value);tr.appendChild(td);
    }
    body.appendChild(tr);
  }
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
      (data.total?.withData||0)+' com métricas no período. '+data.caveat;
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