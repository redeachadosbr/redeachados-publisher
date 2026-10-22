// Shopee Ads — diagnósticos por campanha. Baseado apenas nos números oficiais recebidos.
// Foto/título têm diagnóstico indireto (CTR), NÃO uma avaliação visual automatizada.
(()=>{
 'use strict';
 const number=value=>Number.isFinite(Number(value))?Number(value):0;
 const count=value=>number(value).toLocaleString('pt-BR',{maximumFractionDigits:0});
 const pct=value=>value===null||value===undefined?'—':Number(value).toLocaleString('pt-BR',{minimumFractionDigits:2,maximumFractionDigits:2})+'%';
 const money=value=>'R$ '+number(value).toLocaleString('pt-BR',{minimumFractionDigits:2,maximumFractionDigits:2});
 const node=(tag,className,text)=>{
  const element=document.createElement(tag);
  if(className)element.className=className;
  if(text!==undefined)element.textContent=String(text);
  return element;
 };
 function allowedImage(value){
  try{
   const u=new URL(String(value||''));
   return u.protocol==='https:'&&['shopee.com.br','susercontent.com','shopeeusercontent.com','shopeemobile.com']
    .some(domain=>u.hostname===domain||u.hostname.endsWith('.'+domain))?u.href:null;
  }catch{return null;}
 }
 function diagnose(c){
  if(c.statusGroup!=='active'||number(c.daysWithData)<1)return null;
  const imps=number(c.impressions),clicks=number(c.clicks),expense=number(c.expense);
  const observed=c.directOrdersObserved===true;
  const orders=observed?number(c.directOrders):null;
  const traffic={impressions:imps,clicks,ctr:imps>0?clicks/imps*100:null,expense};
  const price=c.priceEvidence;
  const highPrice=price&&Number(price.differencePct)>8;
  let problems=[];
  if(imps===0)problems.push({
   id:'no_impressions',weight:70,title:'Sem impressões',
   why:'A campanha está ativa, mas não registrou impressões neste período.',
   solution:'Verificar saldo Ads, elegibilidade, moderação e limites de orçamento. Não aumentar investimento antes de confirmar a causa.',
   target:'Configuração da campanha e entrega'});
  if(imps>=300&&clicks===0)problems.push({
   id:'no_clicks',weight:90,title:'Impressões, mas nenhum clique',
   why:count(imps)+' visualizações do anúncio sem cliques.',
   solution:'Revisar a capa principal, as primeiras palavras do título SEO, preço, palavras-chave e relevância. Testar nova capa fiel ao produto antes de ampliar o Ads.',
   target:'Capa, título e relevância'});
  else if(imps>=200&&traffic.ctr!==null&&traffic.ctr<1)problems.push({
   id:'low_ctr',weight:65,title:'CTR baixo',
   why:'CTR '+pct(traffic.ctr)+' em '+count(imps)+' impressões. O limite de 1% é uma referência interna, não um padrão oficial.',
   solution:'Comparar a foto de capa com anúncios concorrentes, revisar título e público. Só o CTR não comprova que a foto esteja ruim.',
   target:'Atratividade da capa e do anúncio'});
  if(clicks>=20&&observed&&orders===0)problems.push({
   id:'clicks_no_orders',weight:100,title:'Cliques sem pedido direto',
   why:count(clicks)+' cliques e nenhum pedido direto atribuído no período. A atribuição pode sofrer atraso.',
   solution:highPrice?
    'Preço da SKU acima da média da pesquisa recente. Conferir ofertas equivalentes, frete e margem antes de propor desconto; revisar fotos, avaliações e descrição.':
    'Pesquisar preços comparáveis, frete, avaliações, prazo e descrição. Revisar conversão antes de gastar mais; não há prova suficiente para atribuir o problema só ao preço.',
   target:'Preço, frete e conversão'});
  else if(expense>=10&&observed&&orders===0)problems.push({
   id:'spent_no_orders',weight:85,title:'Gasto sem pedido direto',
   why:money(expense)+' investidos sem pedido direto atribuído no período.',
   solution:'Conferir preço, frete e margem. Avaliar uma pausa ou redução de orçamento somente depois de revisar o anúncio.',
   target:'Rentabilidade e orçamento'});
  if(expense>=10&&c.acos!==null&&Number.isFinite(Number(c.acos))&&number(c.acos)>30)problems.push({
   id:'high_acos',weight:72,title:'ACOS elevado',
   why:'ACOS '+pct(c.acos)+' na campanha (regra interna acima de 30%).',
   solution:'Comparar o custo da publicidade com a margem líquida real, custo WeDrop e pedidos atribuídos; avaliar ajustar orçamento ou pausar via API.',
   target:'Margem, ACOS e orçamento'});
  if(!problems.length)return null;
  problems.sort((a,b)=>b.weight-a.weight);
  const top=problems[0];
  return {...top,problems,traffic,orders,
   campaignId:String(c.campaignId),active:true,raw:c,
   rank:top.weight+Math.min(15,expense/2)+Math.min(10,clicks/10)};
 }
 function recommendations(campaigns){
  return (Array.isArray(campaigns)?campaigns:[]).map(diagnose).filter(Boolean)
   .sort((a,b)=>b.rank-a.rank||number(b.raw.expense)-number(a.raw.expense));
 }
 function imageElement(c){
  const src=allowedImage(c.productImage);
  const fallback=node('div','ads-improvement-thumb ads-improvement-no-thumb','▣');
  fallback.title='Foto não retornada pela API ou item não associado; não significa que o anúncio esteja sem foto.';
  if(!src)return fallback;
  const img=node('img','ads-improvement-thumb');
  img.src=src;img.loading='lazy';img.referrerPolicy='no-referrer';img.alt='Foto original do produto';
  img.addEventListener('error',()=>img.replaceWith(fallback),{once:true});
  return img;
 }
 function metrics(c){
  const result=node('div','ads-improvement-metrics');
  const values=[
   ['Impressões',count(c.impressions)],['Cliques',count(c.clicks)],
   ['CTR',number(c.impressions)>0?pct(number(c.clicks)/number(c.impressions)*100):'—'],
   ['Pedidos diretos',c.directOrdersObserved?count(c.directOrders):'—']
  ];
  for(const [name,value] of values){
   const tile=node('div');
   tile.append(node('small','',name),node('strong','',value));result.append(tile);
  }
  return result;
 }
 function render({campaigns,expanded=false,container,onReview,onProduct}){
  if(!container)return false;
  const entries=recommendations(campaigns);
  container.replaceChildren();
  container.classList.add('ads-improvement-grid');
  const show=expanded?entries.slice(0,80):entries.slice(0,4);
  const toggle=document.getElementById('adsShowAllSuggestions');
  if(toggle)toggle.textContent=expanded?'Mostrar menos':'Ver todas ('+entries.length+')';
  const intro=document.getElementById('adsImprovementCount');
  if(intro)intro.textContent=entries.length?
   entries.length+' campanha(s) ativas com sinais de melhoria · por prioridade':
   'Monitoramento de campanhas ativas';
  if(!entries.length){
   container.append(node('p','ads-improvement-empty',
    'Não há campanhas ativas com alertas verificáveis neste período. Confira as datas, a conexão Ads e os indicadores antes de concluir que todas estão saudáveis.'));
   return true;
  }
  for(const entry of show){
   const c=entry.raw;
   const card=node('article','ads-improvement-card');
   card.dataset.diagnosis=entry.id;
   const top=node('div','ads-improvement-top');
   top.append(imageElement(c));
   const identity=node('div','ads-improvement-name');
   identity.append(node('strong','',c.productTitle||c.name||'Campanha '+entry.campaignId),
    node('small','',c.productSku?'SKU '+c.productSku+' · Campanha '+entry.campaignId:
     'Campanha '+entry.campaignId+' · SKU não identificada'));
   top.append(identity);card.append(top,node('span','ads-improvement-kind',entry.title),
    metrics(c),node('p','ads-improvement-description',entry.why));
   const solution=node('div','ads-improvement-solution');
   solution.append(node('strong','','Onde melhorar: '+entry.target),
    node('p','',entry.solution));
   if(entry.problems.length>1)solution.append(node('p','',
     'Outros sinais: '+entry.problems.slice(1).map(x=>x.title).join(' · ')));
   card.append(solution);
   if(c.priceEvidence&&Number(c.priceEvidence.price)>0&&Number(c.priceEvidence.marketAverage)>0){
    const price=c.priceEvidence;
    card.append(node('div','ads-improvement-price',
     'Preço estimado: '+money(price.price)+' · Média pesquisada: '+money(price.marketAverage)+
     ' · Diferença: '+pct(price.differencePct)+
     '. Pesquisa de '+count(price.compared)+' ofertas comparáveis; verificar antes de aplicar.'));
   }else if(entry.id==='clicks_no_orders'||entry.id==='spent_no_orders'){
    card.append(node('div','ads-improvement-price',
     'Sem pesquisa de preço recente e validada para esta campanha. Não é possível recomendar um desconto específico.'));
   }
   const actions=node('div','ads-improvement-actions');
   if(c.productSku&&c.itemIdList?.length===1){
    const productButton=node('button','secondary','Revisar capa, SEO e preço');
    productButton.type='button';productButton.onclick=()=>onProduct?.(c);
    actions.append(productButton);
   }
   const apiButton=node('button','ads-improvement-api','Ajuste de campanha via API');
   apiButton.type='button';apiButton.onclick=()=>onReview?.(c);
   actions.append(apiButton);card.append(actions);
   card.append(node('small','ads-improvement-hint',
    'O CTR é um sinal estatístico; a qualidade visual da capa não foi avaliada por IA. Alterações Ads exigem prévia e confirmação. Foto, título e preço seguem o fluxo do anúncio.'));
   container.append(card);
  }
  if(expanded&&entries.length>80)container.append(node('p','ads-improvement-empty',
   'Exibindo os primeiros 80 de '+entries.length+' alertas por prioridade.'));
  return true;
 }
 globalThis.RedeAdsImprovements={render,recommendations};
})();
