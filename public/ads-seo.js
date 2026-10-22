// Rede Achados BR • Inteligência Ads. Leitura de dados oficiais sem ações de campanha.
(()=>{
 const root=document.getElementById('adsSeoSection');
 const button=document.getElementById('adsSeoRefresh');
 const cards=document.getElementById('adsSeoResults');
 const campaigns=document.getElementById('adsSeoCampaigns');
 const summary=document.getElementById('adsSeoSummary');
 const status=document.getElementById('adsSeoStatus');
 const sort=document.getElementById('adsSeoSort');
 if(!root||!button||!cards||!campaigns||!summary||!status||!sort)return;
 let last=null,busy=false;
 const el=(tag,value,className)=>{
  const node=document.createElement(tag);if(className)node.className=className;
  if(value!==undefined&&value!==null)node.textContent=String(value);
  return node;
 };
 const money=value=>value===null||value===undefined?'—':Number(value).toLocaleString('pt-BR',{style:'currency',currency:'BRL'});
 const integer=value=>value===null||value===undefined?'—':Number(value).toLocaleString('pt-BR',{maximumFractionDigits:0});
 const pct=value=>value===null||value===undefined?'—':Number(value).toLocaleString('pt-BR',{minimumFractionDigits:2,maximumFractionDigits:2})+'%';
 const num=value=>value===null||value===undefined?'—':Number(value).toLocaleString('pt-BR',{maximumFractionDigits:2})+'x';
 const imageUrl=url=>{
  try{
   const u=new URL(String(url||''));return u.protocol==='https:'&&
    ['shopee.com.br','susercontent.com','shopeeusercontent.com','shopeemobile.com'].some(d=>u.hostname===d||u.hostname.endsWith('.'+d))?u.href:null;
  }catch{return null;}
 };
 function thumb(url,title){
  const holder=el('span','📦','ads-seo-thumb ads-seo-thumb-fallback');
  const src=imageUrl(url);if(!src)return holder;
  const image=el('img',null,'ads-seo-thumb');image.src=src;image.loading='lazy';
  image.alt='Imagem do produto '+String(title||'');image.referrerPolicy='no-referrer';
  image.addEventListener('error',()=>image.replaceWith(holder),{once:true});
  return image;
 }
 function metricRow(data){
  const grid=el('div',null,'ads-seo-metrics');
  for(const [name,value] of data){
   const item=el('div',null,'ads-seo-metric');
   item.append(el('small',name),el('strong',value));grid.append(item);
  }
  return grid;
 }
 function chip(title,level){
  const badge=el('span',title,'ads-seo-tag');badge.dataset.level=level||'neutral';return badge;
 }
 function head(image,title,info){
  const row=el('div',null,'ads-seo-item-head');
  const heading=el('div',null,'ads-seo-card-heading');
  heading.append(el('strong',title),el('small',info));
  row.append(thumb(image,title),heading);return row;
 }
 function openSku(sku){
  // A mesma transferência usada no monitor Ads: abrir Otimização e preencher, sem buscar automaticamente.
  if(!sku)return;
  if(typeof globalThis.redeAdsOpenOptimizerSku==='function'){
   globalThis.redeAdsOpenOptimizerSku(sku);
  }else{
   status.dataset.state='error';
   status.textContent='Não foi possível abrir a Otimização. Atualize a página e tente novamente.';
  }
 }
 function action(label,callback){
  const btn=el('button',label,'secondary');btn.type='button';btn.addEventListener('click',callback);return btn;
 }
 function displayCandidates(data){
  cards.replaceChildren();
  const items=[...(data.candidates||[])], mode=sort.value;
  if(mode!=='score')items.sort((a,b)=>
   (Number(b.adsMetrics?.[mode]??-1)-Number(a.adsMetrics?.[mode]??-1))||
   (Number(b.score)-Number(a.score)));
  if(!items.length){cards.append(el('p','Nenhuma SKU com preço, estoque e margem mínima válida entre os planos recentes. Atualize o catálogo/WeDrop e a precificação antes de anunciar.','ads-seo-empty'));return;}
  for(const c of items){
   const card=el('article',null,'ads-seo-card');
   card.append(head(c.imageUrl,c.title,'SKU '+c.sku+' · '+integer(c.stock)+' em estoque'));
   const tag=Number(c.score)>=70?'Prioridade alta':Number(c.score)>=50?'Em avaliação':'Prioridade cautelosa';
   card.append(chip(tag,Number(c.score)>=70?'good':'neutral'));
   card.append(metricRow([
    ['Pontuação Ads',integer(c.score)+'/100'],['Impressões Ads',integer(c.adsMetrics?.impressions)],
    ['Cliques Ads',integer(c.adsMetrics?.clicks)],['CTR Ads',pct(c.adsMetrics?.ctr)],
    ['Margem antes Ads',pct(c.marginPct)],['ROAS sugerido',num(c.roasTarget)],
    ['Orçamento diário estimado',money(c.suggestedDailyBudget)],['Pedidos atribuídos',integer(c.adsMetrics?.orders)]
   ]));
   card.append(el('p',c.scoreBasis||c.reason,'ads-seo-detail'));
   if(c.alertCount>0)card.append(chip(c.alertCount+' alerta(s) no anúncio','attention'));
   if(c.adsMetrics?.source)card.append(el('div',c.adsMetrics.source,'ads-seo-note'));
   const row=el('div',null,'ads-seo-actions');
   row.append(action('Ver SKU / pesquisar preço',()=>openSku(c.sku)));
   card.append(row);cards.append(card);
  }
 }
 function displayCampaigns(data){
  campaigns.replaceChildren();
  if(!data.adsAvailable){
   campaigns.append(el('p',data.adsWarning||'Não há acesso confirmado à API Shopee Ads. Verifique as permissões da Open Platform.','ads-seo-empty'));return;
  }
  if(!data.campaigns?.length){
   campaigns.append(el('p','A Shopee não retornou campanhas de produto para o período. Sem campanha Ads não é possível medir impressões e cliques patrocinados por SKU.','ads-seo-empty'));return;
  }
  for(const c of data.campaigns.slice(0,36)){
   const card=el('article',null,'ads-seo-card');card.dataset.severity=c.severity||'neutral';
   card.append(head(c.imageUrl,c.title||c.name,c.sku?
    'SKU '+c.sku+' · Campanha '+c.campaignId:'Campanha '+c.campaignId));
   card.append(chip(c.statusGroup==='active'?'Ativa na Shopee':
    c.statusGroup==='inactive'?'Não ativa':'Status não confirmado',
    c.severity==='attention'?'attention':'neutral'));
   card.append(metricRow([
    ['Impressões • 7 dias',integer(c.metrics.impressions)],['Cliques • 7 dias',integer(c.metrics.clicks)],
    ['CTR',pct(c.metrics.ctr)],['Pedidos atribuídos',integer(c.metrics.orders)],
    ['Investimento',money(c.metrics.expense)],['ROAS amplo',num(c.metrics.roas)]
   ]));
   if(c.metrics.impressionChangePct!==null)card.append(el('p',
    'Variação de impressões ante semana anterior: '+pct(c.metrics.impressionChangePct),'ads-seo-detail'));
   if(c.sharedCampaign||c.productIsVariation||!c.itemId)card.append(el('p',
    c.productIsVariation?'Anúncio com variações: métricas do item-pai não podem ser separadas por variação.':c.attribution,'ads-seo-note'));
   if(c.metrics.ordersLabel)card.append(el('small',c.metrics.ordersLabel,'ads-seo-detail'));
   for(const alert of c.alerts.slice(0,3)){
    const box=el('div',null,'ads-seo-alert');box.dataset.level=alert.level;
    box.append(el('strong',alert.title),el('p',alert.reason));
    if(alert.actions?.length){
     const ul=el('ul');for(const step of alert.actions)ul.append(el('li',step));
     box.append(ul);
    }
    card.append(box);
   }
   if(c.pricing?.verified&&c.pricing?.fresh&&c.pricing?.price!==null&&c.pricing?.reference!==null){
    card.append(el('p','Preço atual: '+money(c.pricing.price)+' · Média pesquisada: '+money(c.pricing.reference)+
      ' ('+pct(c.pricing.deltaPct)+'). Amostra de ofertas comparáveis.','ads-seo-detail'));
   }else if(c.alerts.some(a=>a.code==='no_sales')){
    card.append(el('p','Pesquisa de mercado ainda não confirmada ou vencida — atualizar antes de alterar desconto.','ads-seo-detail'));
   }
   if(c.sku){
    const buttons=el('div',null,'ads-seo-actions');
    buttons.append(action('Revisar anúncio e preço',()=>openSku(c.sku)));card.append(buttons);
   }
   campaigns.append(card);
  }
  if(data.campaigns.length>36)campaigns.append(el('p','Mostrando 36 campanhas prioritárias dentre as '+data.monitoredCampaigns+' encontradas.','ads-seo-empty'));
 }
 async function refresh(){
  if(busy)return;
  busy=true;button.disabled=true;status.dataset.state='loading';
  status.textContent='Consultando catálogo, precificação, Ads Shopee e períodos comparativos...';
  try{
   const response=await fetch('/api/shopee/ads/seo/candidates',{credentials:'same-origin',cache:'no-store'});
   const data=await response.json();
   if(!response.ok)throw Error(data.error||'Falha ao consultar a Shopee.');
   last=data;
   summary.replaceChildren();
   for(const message of [
    (data.candidates?.length||0)+' SKUs elegíveis nos planos recentes',
    (data.monitoredCampaigns||0)+' campanhas monitoradas',
    (data.withAlerts||0)+' campanhas com alerta',
    'Acompanhamento de 7 dias vs 7 anteriores'
   ])summary.append(el('span',message));
   displayCandidates(data);displayCampaigns(data);
   status.dataset.state='success';
   status.textContent='Consulta '+new Date().toLocaleString('pt-BR')+'. '+(data.adsWarning||data.warning)+
    ' ROAS e orçamento estimados não garantem resultados.';
  }catch(e){status.dataset.state='error';status.textContent='Falha na análise: '+e.message;}
  finally{busy=false;button.disabled=false;}
 }
 button.addEventListener('click',refresh);
 sort.addEventListener('change',()=>{if(last)displayCandidates(last);});
 if('IntersectionObserver' in window){
  const observer=new IntersectionObserver(entries=>{
   if(entries.some(e=>e.isIntersecting)){observer.disconnect();void refresh();}
  },{threshold:0.05});
  observer.observe(root);
 }
})();
