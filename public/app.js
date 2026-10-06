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
    $('#connMeta').textContent=`Partner ID: ${s.partnerId||'-'} · Shop ID: ${s.shopId||'-'} · API: ${s.apiHost||'-'}`;
    $('#mConnection').textContent=s.connected?'Conectada':'Pendente';
    $('#mShop').textContent=s.shopId||'—';
    $('#mMode').textContent=(s.mode||'—').toUpperCase();
    $('#mStorage').textContent=s.storage?.supabaseConfigured?'Supabase':'Local';
    $('#statusPill').textContent=s.connected?'API conectada':'API pendente';
    $('#statusPill').classList.toggle('ok',Boolean(s.connected));
  }catch(e){$('#connTitle').textContent='Erro de configuração';$('#connMeta').textContent=e.message;$('#statusPill').textContent='Erro';}
}
$('#loginBtn').onclick=async()=>{try{await json('/api/login',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({password:$('#password').value})});$('#login').classList.add('hidden');$('#app').classList.remove('hidden');await loadStatus();}catch(e){$('#loginMsg').textContent=e.message;}};
$('#connectBtn').onclick=()=>location.href='/auth/shopee/start';
$('#testBtn').onclick=async()=>{try{const d=await json('/api/shopee/test-shop');debug(d);}catch(e){debug(e.message);}};
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
    $('#ordersSummary').textContent=`${orders.length} pedido(s) retornado(s) nos últimos 15 dias.`;
    b.innerHTML=orders.length?'':'<tr><td colspan="3">Nenhum pedido no Sandbox.</td></tr>';
    for(const x of orders){
      const tr=document.createElement('tr');
      tr.innerHTML=`<td>${x.order_sn||'—'}</td><td>${x.order_status||'—'}</td><td>${fmtDate(x.create_time)}</td>`;b.appendChild(tr);
    }
  }catch(e){b.innerHTML='<tr><td colspan="3">'+e.message+'</td></tr>';$('#ordersSummary').textContent='Falha na consulta.';}
};

function ddmmyyyy(v){if(!v)return'';const [y,m,d]=v.split('-');return `${d}-${m}-${y}`;}
const today=new Date(), before=new Date(Date.now()-7*86400000);
$('#adsEnd').value=today.toISOString().slice(0,10);$('#adsStart').value=before.toISOString().slice(0,10);
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
boot();