// Captura apenas texto e links visíveis em cartões Shopee.
(()=>{'use strict';
 const allowed=/^https:\/\/(?:www\.)?shopee\.com\.br$/;
 if(!allowed.test(location.origin))return;
 const clean=x=>String(x??'').replace(/\s+/g,' ').trim();
 const parseCount=raw=>{
  const text=clean(raw).toLowerCase();
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
 const quantity='(\\d[\\d.,]*(?:\\s*(?:milh(?:ão|ões)|mil|k))?)';
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
  // Vendas mensais exibidas não equivalem ao contador histórico acumulado.
  const sold=historicalSales(monthly.monthlyEvidence?
   content.replace(monthly.monthlyEvidence,''):content);
  if(monthly.monthlySold===null&&sold===null)return null;
  return {...identity,productName,historicalSold:sold,priceMin:amount(content),
   ...monthly,featuredRank:rank};
 }
 function extract(){
  if(!/\/search(?:\/|$)/.test(location.pathname))
   return {ok:false,blocked:true,error:'Abra uma pesquisa de produtos Em Destaque.',offers:[]};
  const body=clean(document.body?.innerText||'');
  if(/verifique que voc[eê] [eé] humano|captcha|acesso negado/i.test(body.slice(0,1000)))
   return {ok:false,blocked:true,error:'A Shopee apresentou verificação; conclua-a manualmente.',offers:[]};
  const found=[],seen=new Set();
  for(const link of document.querySelectorAll('a[href]')){
   const identity=ids(link.getAttribute('href'));if(!identity)continue;
   const id=identity.shopId+':'+identity.itemId;
   if(seen.has(id))continue;seen.add(id);
   const card=link.closest('[data-sqe="item"],.shopee-search-item-result__item,[class*="search-item-result__item"]')||link;
   const product=fromCard(card,link,identity,found.length+1);
   if(product)found.push(product);
   if(found.length>=50)break;
  }
  return {ok:true,offers:found,visibleCards:seen.size,
   monthlyCards:found.filter(x=>x.monthlySold!==null).length};
 }
 globalThis.RAShopeeVisible={parseCount,monthlyEvidence,historicalSales,ids,extract};
 chrome.runtime.onMessage.addListener((msg,_sender,reply)=>{
  if(msg?.kind!=='RA_CURVE_READ_VISIBLE')return;
  reply(extract());
 });
})();