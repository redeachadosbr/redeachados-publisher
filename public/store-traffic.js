// Tráfego e Vendas da Loja — fontes da Central do Vendedor, SKUs e API sem misturar métricas.
(()=>{
 'use strict';
 const $=id=>document.getElementById(id);
 const fmt=new Intl.NumberFormat('pt-BR');
 const brl=new Intl.NumberFormat('pt-BR',{style:'currency',currency:'BRL'});
 const qty=v=>v===null||v===undefined?'—':fmt.format(Number(v));
 const money=v=>v===null||v===undefined?'—':brl.format(Number(v));
 const pct=v=>v===null||v===undefined?'—':Number(v).toLocaleString('pt-BR',{maximumFractionDigits:2})+'%';
 const date=v=>/^\d{4}-\d{2}-\d{2}$/.test(String(v||''))?
   v.slice(8,10)+'/'+v.slice(5,7)+'/'+v.slice(0,4):'—';
 const escapeHtml=v=>String(v??'').replace(/[&<>"']/g,c=>({
   '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'
 })[c]);
 let initialized=false,busy=false,report=null,views=null,selectedSource='all';
 const say=(value,tone='')=>{
  const node=$('trafficStatus');if(!node)return;
  node.textContent=String(value||'');node.dataset.tone=tone;
 };
 async function get(url,options={}){
  const response=await fetch(url,{credentials:'same-origin',cache:'no-store',...options});
  const data=await response.json().catch(()=>({}));
  if(!response.ok||data.ok===false)throw Error(data.error||'Falha HTTP '+response.status);
  return data;
 }
 const metric=(label,value,sub)=>'<article class="traffic-kpi"><small>'+
  escapeHtml(label)+'</small><strong>'+escapeHtml(value)+'</strong><span>'+
  escapeHtml(sub||'')+'</span></article>';
 const scopeInfo=()=>{
  const snap=report?.traffic;
  if(!snap)return 'Sem relatório de fontes importado. A API não informa automaticamente a origem Pesquisa, Carrinho ou Recomendação.';
  return 'Fonte: exportação Shopee · '+date(snap.periodStart)+' a '+date(snap.periodEnd)+
   ' · Importado em '+new Date(snap.importedAt).toLocaleString('pt-BR')+
   ' · '+(snap.scope==='sku_by_source'?'origem e SKU comprovados':'visão geral da loja');
 };
 function renderOverview(){
  const t=report?.traffic;
  $('trafficWindow').textContent=scopeInfo();
  if(!t){
   $('trafficKpis').innerHTML=metric('Impressões por fonte','—','Aguardando relatório')+
    metric('Cliques por fonte','—','Aguardando relatório')+
    metric('Vendas por fonte','—','Aguardando relatório')+
    metric('CTR dos cards','—','Aguardando relatório');
   $('trafficSources').innerHTML='<p class="traffic-empty">Importe o relatório “Tráfego do Produto → Contribuição da Fonte” para ver a participação de Pesquisa, Carrinho, Recomendação, Loja e Promoção. Nenhum número é simulado.</p>';
   $('trafficInsights').innerHTML='<p class="traffic-empty">Os diagnósticos por origem aparecerão após uma importação verificada.</p>';
   return;
  }
  const total=t.total||{};
  $('trafficKpis').innerHTML=metric('Impressões dos cards',qty(total.impressions),'Exibições, não pessoas únicas')+
   metric('Cliques nos cards',qty(total.clicks),'Acessos, não visitantes únicos')+
   metric('Vendas atribuídas',money(total.sales),'Pedido feito, não lucro líquido')+
   metric('CTR calculado',pct(total.ctr),'Cliques ÷ impressões');
  const max=Math.max(1,...(t.sources||[]).map(x=>Number(x.sales||0)));
  const sources=(t.sources||[]).map(s=>{
   const width=Math.max(0,Number(s.sales||0))/max*100;
   return '<button type="button" class="traffic-source-row" data-traffic-source="'+escapeHtml(s.source)+'">'+
    '<span class="traffic-source-name">'+escapeHtml(s.source)+'</span>'+
    '<span class="traffic-source-meter"><i style="width:'+width.toFixed(1)+'%"></i></span>'+
    '<strong>'+money(s.sales)+'</strong><small>'+qty(s.clicks)+' cliques</small>'+
    '<small>'+pct(s.salesShare)+' das vendas</small></button>';
  }).join('');
  $('trafficSources').innerHTML=sources||'<p class="traffic-empty">Sem linhas de fontes válidas.</p>';
  $('trafficSources').querySelectorAll('[data-traffic-source]').forEach(button=>{
   button.addEventListener('click',()=>{selectedSource=button.dataset.trafficSource;renderProducts();});
  });
  const insights=t.diagnostics||[];
  $('trafficInsights').innerHTML=insights.length?insights.map(d=>
   '<article class="traffic-insight"><div class="traffic-insight-top"><strong>'+
   escapeHtml(d.title)+'</strong><small>'+escapeHtml(d.source)+'</small></div>'+
   '<p>'+escapeHtml(d.why)+'</p><p><b>Ação recomendada:</b> '+
   escapeHtml(d.action)+'</p></article>').join(''):
   '<p class="traffic-empty">Sem alertas suficientes para um diagnóstico específico. Compare também períodos diferentes.</p>';
 }
 function renderProducts(){
  const t=report?.traffic,p=report?.performance;
  const captured=Array.isArray(t?.sourceProducts)?t.sourceProducts:[];
  const attributable=captured.some(x=>x.source);
  const sourceList=(t?.sources||[]).map(x=>x.source);
  const select=$('trafficSkuFilter');
  select.innerHTML='<option value="all">Todas as fontes</option>'+
   sourceList.map(s=>'<option value="'+escapeHtml(s)+'">'+escapeHtml(s)+'</option>').join('');
  if(!sourceList.includes(selectedSource))selectedSource='all';
  select.value=selectedSource;
  const filtered=captured.filter(row=>selectedSource==='all'||row.source===selectedSource);
  const rows=filtered.length?filtered:!attributable?Array.isArray(p?.products)?p.products:[]:[];
  const provenance=filtered.length?'Métricas vinculadas à fonte e ao SKU no relatório importado.':
   p?.available?'Desempenho por SKU de outro relatório: NÃO há vínculo comprovado com a fonte selecionada.':
   'Ainda não há planilha da Shopee relacionando esta fonte aos SKUs. Use a aba Performance do Produto para métricas gerais por anúncio.';
  $('trafficSkuHint').textContent=provenance;
  const box=$('trafficSkuRows');
  if(!rows.length){
   box.innerHTML='<p class="traffic-empty">Sem dados por SKU para esta seleção. A origem geral não identifica sozinha quais itens venderam.</p>';return;
  }
  box.innerHTML=rows.slice(0,100).map(r=>
   '<article class="traffic-product"><div class="traffic-product-main"><strong>'+
   escapeHtml(r.title||'Anúncio Shopee')+'</strong><small>'+
   (r.sku?'SKU '+escapeHtml(r.sku):'SKU não informado')+
   (r.itemId?' · Item '+escapeHtml(r.itemId):'')+
   (r.source?' · '+escapeHtml(r.source):'')+'</small></div>'+
   '<div><small>Impressões</small><b>'+qty(r.impressions)+'</b></div>'+
   '<div><small>Cliques</small><b>'+qty(r.clicks)+'</b></div>'+
   '<div><small>Pedidos</small><b>'+qty(r.orders)+'</b></div>'+
   '<div><small>Vendas</small><b>'+money(r.sales)+'</b></div>'+
   '<button type="button" class="traffic-product-open" data-traffic-sku="'+
   escapeHtml(r.sku||'')+'" '+(!r.sku?'disabled':'')+'>Otimizar SKU</button></article>'
  ).join('');
  box.querySelectorAll('[data-traffic-sku]').forEach(button=>button.addEventListener('click',()=>{
   const sku=button.dataset.trafficSku;if(!sku)return;
   if(typeof window.RAOpenPendingImageSku==='function')window.RAOpenPendingImageSku(sku);
   else if(typeof window.RATrafficOpenSku==='function')window.RATrafficOpenSku(sku);
   else say('A otimização desta SKU deve ser aberta no menu Otimização de anúncios: '+sku,'notice');
  }));
 }
 function renderViews(){
  const node=$('trafficLiveViews'),status=$('trafficApiStatus');
  if(!views?.ok){
   node.innerHTML='<p class="traffic-empty">Ainda não há leitura de visualizações da API.</p>';return;
  }
  const rows=(views.list||[]).slice(0,20);
  status.textContent='API Shopee get_item_extra_info: visualizações cumulativas por anúncio; não separam Ads, cliques, carrinho ou fontes.';
  node.innerHTML=rows.length?rows.map(r=>
   '<div class="traffic-view-row"><span>'+escapeHtml(r.title||r.sku||'Produto Shopee')+
   '<small>SKU '+escapeHtml(r.sku||'não vinculada')+' · Item '+escapeHtml(r.itemId||'—')+
   '</small></span><b>'+qty(r.viewsObserved!==null&&r.viewsObserved!==undefined?r.viewsObserved:r.latestTotalViews)+
   '</b><small>'+(r.viewsObserved!==null&&r.viewsObserved!==undefined?'Variação observada':'Contador acumulado')+
   '</small></div>').join(''):
   '<p class="traffic-empty">Sem medições salvas. Clique em Atualizar visualizações para registrar a primeira leitura.</p>';
 }
 async function load(){
  if(!initialized)initialize();
  if(busy)return;
  busy=true;say('Carregando dados verificados da Shopee...');
  try{
   report=await get('/api/shopee/store-traffic');
   renderOverview();renderProducts();
   say(report.traffic?'Relatório de origens carregado.':'Fontes ainda não importadas; visualizações por SKU disponíveis separadamente.','notice');
  }catch(error){say(error.message,'error');}
  finally{busy=false;}
  try{
   views=await get('/api/shopee/product-views/top10?period=7&limit=50');
   renderViews();
  }catch(error){$('trafficApiStatus').textContent='API de visualizações: '+error.message;}
 }
 function toBase64(file){
  return new Promise((resolve,reject)=>{
   const reader=new FileReader();
   reader.onload=()=>resolve(String(reader.result||'').split(',')[1]||'');
   reader.onerror=()=>reject(Error('Não foi possível ler o arquivo.'));
   reader.readAsDataURL(file);
  });
 }
 async function importFile(){
  const file=$('trafficFile').files?.[0];
  if(!file)return say('Selecione o arquivo exportado da Shopee.','error');
  if(file.size>4_000_000)return say('Máximo de 4 MB por arquivo.','error');
  const periodStart=$('trafficStart').value,periodEnd=$('trafficEnd').value;
  if(!periodStart||!periodEnd||periodStart>periodEnd)
   return say('Informe as datas inicial e final conforme o relatório exportado.','error');
  const button=$('trafficImport');button.disabled=true;
  say('Conferindo o arquivo e registrando os dados da Shopee...');
  try{
   const base64=await toBase64(file);
   const result=await get('/api/shopee/store-traffic/import',{
    method:'POST',headers:{'Content-Type':'application/json'},
    body:JSON.stringify({fileName:file.name,base64,periodStart,periodEnd})
   });
   say('Importação confirmada: '+qty(result.rowCount)+' linhas.','success');
   report=null;await load();
  }catch(error){say('Não foi possível importar: '+error.message,'error');}
  finally{button.disabled=false;}
 }
 async function refreshViews(){
  const btn=$('trafficRefreshApi');btn.disabled=true;
  $('trafficApiStatus').textContent='Consultando visualizações dos anúncios na Shopee...';
  try{
   await get('/api/shopee/product-views/collect',{method:'POST',
    headers:{'Content-Type':'application/json'},body:JSON.stringify({force:false})});
   views=await get('/api/shopee/product-views/top10?period=7&limit=50');
   renderViews();say('Visualizações atualizadas sem alterar anúncios.','success');
  }catch(error){$('trafficApiStatus').textContent='Atualização não concluída: '+error.message;}
  finally{btn.disabled=false;}
 }
 function initialize(){
  if(initialized||!$('trafficStatus'))return;initialized=true;
  $('trafficRefresh').addEventListener('click',()=>void load());
  $('trafficImport').addEventListener('click',()=>void importFile());
  $('trafficRefreshApi').addEventListener('click',()=>void refreshViews());
  $('trafficSkuFilter').addEventListener('change',event=>{
   selectedSource=event.target.value;renderProducts();
  });
  const now=new Date(),parts=new Intl.DateTimeFormat('en-US',{timeZone:'America/Sao_Paulo',
   year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(now);
  const p=Object.fromEntries(parts.map(x=>[x.type,x.value]));
  const today=p.year+'-'+p.month+'-'+p.day;
  const end=new Date(today+'T00:00:00Z');end.setUTCDate(end.getUTCDate()-1);
  const start=new Date(end);start.setUTCDate(start.getUTCDate()-29);
  $('trafficEnd').value=end.toISOString().slice(0,10);
  $('trafficStart').value=start.toISOString().slice(0,10);
 }
 window.RAStoreTraffic={onOpen:load};
 initialize();
})();
