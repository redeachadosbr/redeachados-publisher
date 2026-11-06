// Captura apenas texto e links visíveis em cartões Shopee.
(()=>{'use strict';
 const allowed=/^https:\/\/(?:www\.)?shopee\.com\.br$/;
 if(!allowed.test(location.origin))return;
 const clean=x=>String(x??'').replace(/\s+/g,' ').trim();
 const parseCount=raw=>{
  const text=clean(raw).toLowerCase().replace(/\+\s*$/,'').trim();
  const m=text.match(/^(\d[\d.,\s]*)(?:\s*(milh(?:ão|ões)|mil|k))?$/i);
  if(!m)return null;
  const number=m[1].replace(/\s/g,'');
  let n;
  if(m[2])n=Number(number.replace(/\./g,'').replace(',','.'));
  else if(/^\d{1,3}(?:\.\d{3})+$/.test(number))n=Number(number.replace(/\./g,''));
  else if(/^\d{1,3}(?:,\d{3})+$/.test(number))n=Number(number.replace(/,/g,''));
  else n=Number(number.replace(',','.'));
  const scale=/milh/.test(m[2]||'')?1e6:/mil|k/.test(m[2]||'')?1000:1;
  const value=Math.round(n*scale);
  return Number.isSafeInteger(value)&&value>=0?value:null;
 };
 const quantity='(\\d[\\d.,]*(?:\\s*(?:milh(?:ão|ões)|mil|k))?\\s*\\+?)';
 function monthlyEvidence(text){
  const patterns=[
   new RegExp(quantity+'\\s*(?:vendid[oa]s?|vendas)\\s*(?:\\/|por|no|nos|em)\\s*m[eê]s','i'),
   new RegExp('(?:vendid[oa]s?|vendas)\\s*(?:\\/|por|no|nos|em)\\s*m[eê]s\\s*[:\\-]?\\s*'+quantity,'i'),
   new RegExp(quantity+'\\s*(?:vendid[oa]s?|vendas)\\s*(?:nos\\s+)?(?:[uú]ltimos\\s+)?30\\s*dias','i'),
   new RegExp('(?:vendas|vendid[oa]s?)\\s*(?:nos\\s+)?(?:[uú]ltimos\\s+)?30\\s*(?:dias|d)\\s*[:\\-]?\\s*'+quantity,'i')
  ];
  for(const re of patterns){
   const m=text.match(re);if(!m)continue;
   const value=parseCount(m[1]||m[2]);
   if(value!==null)return {monthlySold:value,monthlyPeriod:'month',monthlyEvidence:m[0].slice(0,140)};
  }
  return {monthlySold:null,monthlyPeriod:null,monthlyEvidence:''};
 }
 function historicalSales(text){
  const m=text.match(new RegExp(quantity+'\\s*vendid[oa]s?(?!\\s*(?:\\/|por|no|nos|em)\\s*m[eê]s)','i'));
  return m?parseCount(m[1]):null;
 }
 function ids(href){
  try{
   const u=new URL(href,location.href);
   if(!allowed.test(u.origin))return null;
   const a=u.pathname.match(/-i\.(\d{1,18})\.(\d{1,18})(?:$|\/)/);
   const b=u.pathname.match(/\/product\/(\d{1,18})\/(\d{1,18})(?:\/|$)/);
   if(a||b)return {shopId:(a||b)[1],itemId:(a||b)[2]};
   const item=u.searchParams.get('itemid'),shop=u.searchParams.get('shopid');
   if(/^\d{1,18}$/.test(item||'')&&/^\d{1,18}$/.test(shop||''))
    return {itemId:item,shopId:shop};
  }catch{}
  return null;
 }
 function amount(text){
  const m=text.match(/R\$\s*(\d[\d.\s]*(?:,\s*\d{2})?)/i);
  if(!m)return null;
  const n=Number(m[1].replace(/\s/g,'').replace(/\./g,'').replace(',','.'));
  return Number.isFinite(n)&&n>0&&n<100000?Number(n.toFixed(2)):null;
 }
 function fromCard(card,link,identity,rank){
  const content=clean(card.innerText||card.textContent||'').slice(0,1300);
  if(!content)return null;
  const nameNode=card.querySelector('[data-sqe="name"],h3,[class*="line-clamp"],[class*="truncate"]');
  const image=card.querySelector('img[alt]');
  const productName=clean(nameNode?.innerText||nameNode?.textContent||image?.alt||
    link.getAttribute('title')||link.getAttribute('aria-label')||content.split('R$')[0]).slice(0,210);
  if(productName.length<6)return null;
  const monthly=monthlyEvidence(content);
  const monthlyLabelVisible=/(?:vendid[oa]s?|vendas)\s*(?:\/|por|no|nos|em)\s*m[eê]s/i.test(content);
  // Vendas mensais exibidas não equivalem ao contador histórico acumulado.
  const sold=historicalSales(monthly.monthlyEvidence?
   content.replace(monthly.monthlyEvidence,''):content);
  const price=amount(content);
  // Anúncio com preço mas sem vendas também pode ser usado na média de preços.
  if(monthly.monthlySold===null&&sold===null&&price===null)return null;
  return {...identity,productName,historicalSold:sold,priceMin:price,
   ...monthly,monthlyLabelVisible,featuredRank:rank};
 }
 function cardFor(link,identity){
  // O nó .search-item pode conter só o preço. Vendido/Mês pode surgir
  // depois, no ancestral do MESMO anúncio (ou após renderização tardia).
  // NÃO retornar o primeiro .search-item antes de procurar o selo mensal.
  const known=link.closest('[data-sqe="item"],.shopee-search-item-result__item,[class*="search-item-result__item"]');
  let current=link,fallback=known||link;
  for(let depth=0;depth<10&&current;depth++,current=current.parentElement){
   const content=clean(current.innerText||current.textContent||'');
   if(content.length>1800)break;
   // Pare no limite entre anúncios para não copiar vendas/preços do vizinho.
   const other=[...current.querySelectorAll('a[href]')].some(a=>{
    const found=ids(a.getAttribute('href'));
    return found&&(found.shopId!==identity.shopId||found.itemId!==identity.itemId);
   });
   if(other)break;
   if(!/R\$\s*\d/.test(content))continue;
   fallback=current;
   if(monthlyEvidence(content).monthlySold!==null)return current;
  }
  return fallback;
 }
 function extract(){
  if(!/\/search(?:\/|$)/.test(location.pathname))
   return {ok:false,blocked:true,error:'Abra uma pesquisa de produtos Em Destaque.',offers:[]};
  const body=clean(document.body?.innerText||'');
  if(/verifique que voc[eê] [eé] humano|captcha|acesso negado/i.test(body.slice(0,1000)))
   return {ok:false,blocked:true,error:'A Shopee apresentou verificação; conclua-a manualmente.',offers:[]};
  const found=[],seen=new Set(),seenCards=new Set();
  for(const link of document.querySelectorAll('a[href]')){
   const identity=ids(link.getAttribute('href'));if(!identity)continue;
   const id=identity.shopId+':'+identity.itemId;
   if(seen.has(id))continue;
   const card=cardFor(link,identity);
   if(clean(card.innerText||card.textContent||'').length>=6)seenCards.add(id);
   const product=fromCard(card,link,identity,found.length+1);
   if(product){seen.add(id);found.push(product);}
   if(found.length>=50)break;
  }
  // Diagnóstico não comprova vendas sem vínculo ao anúncio.
  const labelInPage=(body.match(/(?:vendid[oa]s?|vendas)\s*(?:\/|por|no|nos|em)\s*m[eê]s/gi)||[]).length;
  return {ok:true,offers:found,visibleCards:seenCards.size,
   saleCards:found.length,monthlyCards:found.filter(x=>x.monthlySold!==null).length,
   monthlyLabelsVisible:labelInPage,
   monthlyLabelsInCards:found.filter(x=>x.monthlyLabelVisible).length};
 }
 // A vitrine Shopee carrega anúncios por rolagem. Uma leitura do DOM no topo
 // captura só parte dos preços e frequentemente retorna 0 rótulos mensais.
 // Percorrer a página atual sem abrir abas; preservar IDs e números do MESMO cartão.
 async function scanPage(){
  const seen=new Map();
  let totalVisible=0,labelsSeen=0,blocked=null;
  const y=typeof window!=='undefined'?window.scrollY||0:0;
  const collect=()=>{
   const batch=extract();
   if(!batch.ok){blocked=batch;return;}
   totalVisible=Math.max(totalVisible,Number(batch.visibleCards||0));
   labelsSeen=Math.max(labelsSeen,Number(batch.monthlyLabelsVisible||0));
   for(const item of batch.offers||[]){
    const key=item.shopId+':'+item.itemId,old=seen.get(key);
    const improved=!old||
     (old.monthlySold===null&&item.monthlySold!==null)||
     (old.priceMin===null&&item.priceMin!==null);
    if(improved)seen.set(key,item);
   }
  };
  collect();
  if(!blocked&&typeof window!=='undefined'){
   const body=document.body,root=document.documentElement;
   const max=Math.max(0,Math.max(root?.scrollHeight||0,body?.scrollHeight||0)-
    (window.innerHeight||720));
   // Até oito passos; preservar os anúncios já vistos em grids virtualizados.
   for(let step=1;step<=8&&seen.size<100;step++){
    if(blocked)break;
    const next=Math.min(max,Math.round(step*Math.max(400,(window.innerHeight||720)*0.85)));
    window.scrollTo(0,next);
    await new Promise(resolve=>setTimeout(resolve,420));
    collect();
    if(next>=max)break;
   }
   window.scrollTo(0,y);
  }
  if(blocked&&!seen.size)return blocked;
  const offers=[...seen.values()].slice(0,100);
  return {ok:true,offers,visibleCards:Math.max(totalVisible,offers.length),
   saleCards:offers.length,
   monthlyCards:offers.filter(x=>x.monthlySold!==null).length,
   monthlyLabelsVisible:labelsSeen,
   monthlyLabelsInCards:offers.filter(x=>x.monthlyLabelVisible).length,
   deepScan:true};
 }
 globalThis.RAShopeeVisible={parseCount,monthlyEvidence,historicalSales,ids,extract,scanPage};
 chrome.runtime.onMessage.addListener((msg,_sender,reply)=>{
  if(msg?.kind!=='RA_CURVE_READ_VISIBLE')return;
  if(msg.deep){
   scanPage().then(reply).catch(error=>reply({ok:false,
    error:'Falha na leitura de cartões: '+String(error?.message||error).slice(0,130),
    offers:[]}));
   return true;
  }
  reply(extract());
 });
})();