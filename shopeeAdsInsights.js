// Alertas Ads: sinais da API oficial + preços salvos no Motor Matriz.
// Nunca confundir GMV atribuído com lucro, nem atribuir campanhas multiproduto a uma SKU.
const n=v=>Number.isFinite(Number(v))?Number(v):0;
const round=(v,d=2)=>Math.round(v*10**d)/10**d;
const unit=x=>String(x??'');
const safeDate=x=>Number.isFinite(Date.parse(x||''))?Date.parse(x):null;
const validPrice=x=>Number.isFinite(Number(x))&&Number(x)>0?Number(x):null;
const clamp=(v,a,b)=>Math.min(b,Math.max(a,v));
export function adsSevenDayWindows(today){
 if(!/^\d{4}-\d{2}-\d{2}$/.test(String(today)))throw Error('Dia de referência inválido.');
 const base=Date.parse(today+'T00:00:00Z');
 if(!Number.isFinite(base))throw Error('Dia de referência inválido.');
 const shift=k=>new Date(base+k*86400000).toISOString().slice(0,10);
 return {recent:{start:shift(-7),end:shift(-1)},previous:{start:shift(-14),end:shift(-8)}};
}
export function offerPriceEvidence(plan,{now=Date.now()}={}){
 const q=plan?.quote||{},mr=q.marketResearch||{};
 const current=validPrice(q.customerPrice),market=validPrice(mr.reference);
 const compared=Number(mr.count);
 const verified=mr.verified===true&&compared>=2&&compared<=5;
 const when=safeDate(mr.researchedAt);
 const fresh=verified&&when!==null&&when<=now&&now-when<=48*3600000;
 const delta=current&&market?round((current/market-1)*100):null;
 return {price:current,reference:market,deltaPct:delta,verified,fresh,
  compared:verified?compared:0,observedAt:when!==null?new Date(when).toISOString():null,
  source:'Amostra de ofertas afiliadas Shopee; não representa todo o mercado'};
}
function pricingAction(e){
 if(e.verified&&e.fresh&&e.deltaPct!==null&&e.deltaPct>8)
  return 'Preço da SKU '+e.price.toFixed(2)+' ante média amostral '+e.reference.toFixed(2)+
   ' (+'+e.deltaPct.toFixed(1)+'%). Conferir comparabilidade, frete e desconto antes de ajustar; preservar a margem mínima.';
 if(e.verified&&e.fresh)
  return 'Preço da SKU está '+(e.deltaPct>=0?'acima':'abaixo')+' da média da amostra em '+
   Math.abs(e.deltaPct).toFixed(1)+'%. Conferir frete, avaliações, prazo e descrição antes de alterar o preço.';
 return 'Atualizar pesquisa de 2 a 5 ofertas comparáveis da Shopee na Otimização: preço de mercado ainda não validado ou pesquisa vencida.';
}
function addAlert(list,level,code,title,reason,actions){
 list.push({level,code,title,reason,actions});
}
function makeCampaignCard(c,prev,byItem,byPlan,{now=Date.now()}={}){
 const ids=Array.isArray(c.itemIdList)?c.itemIdList:[];
 const exclusive=ids.length===1?unit(ids[0]):null;
 const item=exclusive?byItem.get(exclusive):null;
 const linked=Boolean(item);
 const plan=item&&byPlan.get(exclusive+'|'+unit(item.sku));
 const pricing=offerPriceEvidence(plan,{now});
 const hasData=n(c.daysWithData)>0;
 const impressions=hasData?n(c.impressions):null;
 const clicks=hasData?n(c.clicks):null;
 const ctr=hasData&&impressions>0?round(clicks/impressions*100):null;
 const ordersObserved=hasData&&(c.directOrdersObserved||c.broadOrdersObserved);
 const orders=ordersObserved?(c.directOrdersObserved?n(c.directOrders):n(c.broadOrders)):null;
 const orderBasis=c.directOrdersObserved?'Pedidos diretos Ads':c.broadOrdersObserved?'Pedidos atribuídos amplos':'Pedidos não disponíveis';
 const prevHasData=n(prev?.daysWithData)>0;
 const change=prevHasData&&hasData&&n(prev.impressions)>=100?
  round((n(c.impressions)-n(prev.impressions))/n(prev.impressions)*100):null;
 const alert=[];
 if(c.statusGroup==='inactive')addAlert(alert,'info','inactive','Campanha não ativa',
  'A Shopee informa status '+c.status+'. Não confundir desempenho antigo com campanha ativa.',
  ['Confirmar se a pausa ou encerramento foi intencional antes de considerar retomada.']);
 else if(c.statusGroup!=='active')addAlert(alert,'info','status_unknown','Status da campanha não confirmado',
  'Não há confirmação oficial de entrega ativa.',['Conferir status na Central do Vendedor.']);
 else if(!hasData)addAlert(alert,'info','no_metrics','Sem métricas no período',
  'A API não retornou registros diários suficientes para concluir se houve entrega.',
  ['Conferir autorização de Ads, datas e relatório da campanha na Shopee.']);
 else if(impressions===0)addAlert(alert,'warning','no_delivery','Sem impressões no período',
  'Campanha marcada como ativa, mas o relatório não mostra exibições.',
  ['Verificar saldo Ads, orçamento, elegibilidade, moderação e segmentação.','Checar se a campanha começou dentro do período observado.']);
 else if(impressions>=300&&clicks===0)addAlert(alert,'warning','zero_clicks','Impressões sem cliques',
  impressions+' impressões com zero cliques registrados.',
  ['Trocar foto de capa por uma referência mais clara e atraente sem alterar o produto.','Revisar título SEO, relevância das palavras-chave e preço exibido.','Conferir segmentação e posicionamento do anúncio.']);
 else if(impressions>=300&&ctr!==null&&ctr<0.6)addAlert(alert,'warning','low_ctr','CTR baixo',
  impressions+' impressões e CTR de '+ctr.toFixed(2)+'%. O limite de 0,60% é um sinal interno, não um padrão oficial da Shopee.',
  ['Testar foto principal, primeiras palavras do título e coerência da oferta.','Revisar palavras-chave e público antes de aumentar orçamento.']);
 if(hasData&&clicks>=20&&orders===0)
  addAlert(alert,'warning','no_sales','Cliques sem pedidos atribuídos',
   clicks+' cliques com zero pedidos segundo '+orderBasis.toLowerCase()+'. Atribuição pode ter atraso.',
   ['Conferir preço, frete, avaliações, estoque e prazo de envio.',pricingAction(pricing),
    'Revisar ficha técnica, fotos e descrição; não elevar investimento enquanto a conversão estiver em investigação.']);
 if(hasData&&change!==null&&change<=-40&&c.statusGroup==='active')
  addAlert(alert,'warning','impressions_drop','Queda de impressões',
   'Impressões '+Math.abs(change)+'% frente aos sete dias anteriores, com base comparável.',
   ['Conferir alterações de orçamento, ROAS-alvo, saldo, concorrência e status do anúncio.']);
 const margin=Number(plan?.quote?.netMarginPct);
 const breakeven=Number.isFinite(margin)&&margin>0?round(100/margin):null;
 const directRoas=validPrice(c.directRoas);
 const attributedRoas=directRoas??validPrice(c.roas);
 const roasKind=directRoas!==null?'direto':'amplo';
 if(hasData&&n(c.expense)>=10&&breakeven!==null&&attributedRoas!==null&&attributedRoas<breakeven)
  addAlert(alert,'warning','roas_below_margin','ROAS abaixo do equilíbrio estimado',
   'ROAS '+roasKind+' '+round(attributedRoas)+'x versus referência teórica de '+breakeven+'x pela margem antes Ads. Comparação indicativa, não lucro contabilizado.',
   ['Conferir atribuição de pedidos, custo por clique e margem real.','Avaliar reduzir lance ou revisar oferta somente após confirmar dados.']);
 if(!alert.length&&hasData&&impressions>=100&&clicks>0)
  addAlert(alert,'positive','monitoring','Campanha com tráfego',
   'Há impressões e cliques no período; ainda é preciso considerar vendas, custo e lucro.',
   ['Continuar acompanhando CTR, pedidos atribuídos e ROAS antes de ampliar orçamento.']);
 if(!alert.length)
  addAlert(alert,'info','insufficient','Dados insuficientes para diagnóstico',
   'Não há volume suficiente para concluir qual ajuste teria maior efeito.',
   ['Revisar mais dias e conferir disponibilidade de métricas.']);
 const severity=alert.some(x=>x.level==='warning')?'attention':alert.some(x=>x.level==='positive')?'good':'neutral';
 return {campaignId:c.campaignId,name:c.name||('Campanha '+c.campaignId),status:c.status,
  statusGroup:c.statusGroup,adType:c.adType,itemId:exclusive,
  sku:linked?String(item.sku||''):null,title:linked?String(item.title||''):null,
  imageUrl:linked?String(item.imageUrl||''):null,productIsVariation:linked&&Boolean(item.hasModel),
  sharedCampaign:ids.length>1,attribution:ids.length===1?'Produto individual':ids.length>1?
   'Campanha com vários produtos: métricas não atribuíveis a uma única SKU':'Produto não identificado na API',
  metrics:{impressions,clicks,ctr,expense:hasData?round(n(c.expense)):null,
   broadGmv:hasData?round(n(c.broadGmv)):null,
   orders,ordersLabel:orderBasis,roas:hasData&&Number.isFinite(Number(c.roas))?Number(c.roas):null,
   directRoas:hasData&&Number.isFinite(Number(c.directRoas))?Number(c.directRoas):null,
   priorImpressions:prevHasData?n(prev.impressions):null,impressionChangePct:change,
   daysWithData:n(c.daysWithData)},
  pricing,marginPct:Number.isFinite(margin)?margin:null,alerts:alert,severity};
}
export function buildAdsMonitor({catalog=[],plans=[],candidates=[],recent=null,previous=null,now=Date.now()}={}){
 const byItem=new Map(catalog.map(c=>[String(c.itemId),c]));
 const byPlan=new Map(plans.map(p=>[unit(p.itemId)+'|'+unit(p.sku),p]));
 const past=new Map((previous?.campaigns||[]).map(c=>[unit(c.campaignId),c]));
 const cards=(recent?.campaigns||[]).map(c=>makeCampaignCard(c,past.get(unit(c.campaignId)),byItem,byPlan,{now}));
 const single=new Map();
 for(const c of cards){
  if(!c.itemId||c.sharedCampaign||!c.metrics.daysWithData)continue;
  const list=single.get(c.itemId)||[];list.push(c);single.set(c.itemId,list);
 }
 const ranked=(candidates||[]).map(candidate=>{
  const matches=(single.get(String(candidate.itemId))||[]).filter(c=>!c.productIsVariation);
  const complete=matches.length>0;
  const impressions=complete?matches.reduce((a,c)=>a+c.metrics.impressions,0):null;
  const clicks=complete?matches.reduce((a,c)=>a+c.metrics.clicks,0):null;
  const ctr=complete&&impressions>0?round(clicks/impressions*100):null;
  const orders=complete&&matches.every(c=>c.metrics.orders!==null)?
   matches.reduce((a,c)=>a+c.metrics.orders,0):null;
  const trafficScore=complete?clamp(
   (impressions>=500?12:impressions>=100?7:2)+
   (clicks>=50?15:clicks>=15?10:clicks>0?5:0)+
   (ctr>=2?18:ctr>=1?13:ctr>=0.6?8:0)+
   (orders>0?10:0),0,55):0;
  const score=complete?Math.round(candidate.score*0.45+trafficScore):candidate.score;
  return {...candidate,score,adsMetrics:{impressions,clicks,ctr,orders,
   source:complete?'API Shopee Ads — campanhas de produto individual':'Não disponível: campanha Ads individual sem métricas'},
   confidence:complete?'observada em Ads':candidate.confidence,
   scoreBasis:complete?'Financeiro + tráfego Ads':'Financeiro, sem dados de tráfego',
   alertCount:matches.reduce((a,c)=>a+c.alerts.filter(x=>x.level==='warning').length,0)};
 }).sort((a,b)=>b.score-a.score);
 cards.sort((a,b)=>Number(b.severity==='attention')-Number(a.severity==='attention')||
  n(b.metrics.expense)-n(a.metrics.expense));
 return {candidates:ranked,campaigns:cards.slice(0,100),
  monitoredCampaigns:cards.length,withAlerts:cards.filter(c=>c.severity==='attention').length,
  warnings:[
   'Impressões e CTR são exclusivamente de campanhas Ads. Produtos sem Ads não possuem CTR orgânico neste painel.',
   'Uma campanha que anuncia vários produtos não permite inferir desempenho individual por SKU.',
   'Conversões e preços podem ter atraso; decisões devem considerar amostra e rentabilidade real.'
  ]};
}
