// Captura apenas texto e links visíveis em cartões Shopee.
(()=>{'use strict';
 const allowed=/^https:\/\/(?:www\.)?shopee\.com\.br$/;
 if(!allowed.test(location.origin))return;
 const clean=x=>String(x??'').normalize('NFC')
  .replace(/[\u200b-\u200d\u2060\ufeff]/g,'').replace(/[\u2044\u2215\uff0f]/g,'/')
  .replace(/\s+/g,' ').trim();
 const parseCount=raw=>{
  const text=clean(raw).toLowerCase().replace(/\+\s*$/,'').trim();
  const m=text.match(/^(\d[\d.,\s]*)(?:\s*(milh(?:ão|ões)|mil|k))?$/i);
  if(!m)return null;
  const number=m[1].replace(/\s/g,'');
  let n;
  if(m[2])n=Number(number.includes(',')?number.replace(/\./g,'').replace(',','.'):
   /^\d{1,3}(?:\.\d{3})+$/.test(number)?number.replace(/\./g,''):number);
  else if(/^\d{1,3}(?:\.\d{3})+$/.test(number))n=Number(number.replace(/\./g,''));
  else if(/^\d{1,3}(?:,\d{3})+$/.test(number))n=Number(number.replace(/,/g,''));
  else n=Number(number.replace(',','.'));
  // Uma nota como 4.9 não é quantidade de vendas. Fração só com mil/k/milhão.
  if(!m[2]&&!Number.isInteger(n))return null;
  const scale=/milh/.test(m[2]||'')?1e6:/mil|k/.test(m[2]||'')?1000:1;
  const value=Math.round(n*scale);
  return Number.isSafeInteger(value)&&value>=0?value:null;
 };
 const quantity='(\\d[\\d.,]*(?:\\s*(?:milh(?:ão|ões)|mil|k))?\\s*\\+?)';
 function monthlyEvidence(text){
  text=clean(text);
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
 const monthlyLabel=text=>/(?:vendid[oa]s?|vendas)\s*(?:(?:\/|por|no|nos|em)\s*m[eê]s|(?:nos\s+)?(?:[uú]ltimos\s+)?30\s*(?:dias|d)\b)/i.test(clean(text));
 function rendered(node){
  if(!node||node.nodeType===3)return true;
  if(node.hidden||
    /^(?:SCRIPT|STYLE|TEMPLATE|NOSCRIPT)$/.test(node.tagName||''))return false;
  if(typeof getComputedStyle==='function'){
   const style=getComputedStyle(node);
   if(style.display==='none'||style.visibility==='hidden'||style.visibility==='collapse')return false;
  }
  return true;
 }
 // Ler os campos do DOM separadamente: innerText pode omitir o rodapé em
 // display:contents; textContent pode colar avaliação, quantidade e rótulo.
 // Só usa nós renderizados do MESMO cartão, nunca estado interno da Shopee.
 function fieldText(node,fields){
  if(!rendered(node))return '';
  if(node.nodeType===3)return node.textContent||'';
  const children=node.childNodes;
  const text=children?.length?clean([...children].map(child=>fieldText(child,fields)).join(' ')):
   clean(node.innerText||node.textContent||'');
  if(monthlyLabel(text))fields.push({text});
  return text;
 }
 function cardMonthly(card){
  const empty=monthlyEvidence('');
  for(let parent=card;parent;parent=parent.parentElement)
   if(!rendered(parent))return {...empty,monthlyLabelVisible:false};
  let labelVisible=false;
  // Campos menores primeiro, isolando o contador da nota 4.9 e do preço.
  // Uma só passagem por cartão, sem reler cada subárvore a cada campo.
  const fields=[];
  const text=fieldText(card,fields);
  fields.sort((a,b)=>a.text.length-b.text.length);
  // Se o mesmo cartão tiver dois valores mensais contraditórios, nenhum
  // deles será usado para classificar a curva.
  const distinct=new Set();
  for(const field of fields){
   labelVisible=true;
   const first=monthlyEvidence(field.text);
   if(first.monthlySold===null)continue;
   distinct.add(first.monthlySold);
   const second=monthlyEvidence(field.text.replace(first.monthlyEvidence,' '));
   if(second.monthlySold!==null)distinct.add(second.monthlySold);
  }
  if(distinct.size>1)return {...empty,monthlyLabelVisible:true};
  for(const field of fields){
   const value=monthlyEvidence(field.text);
   if(value.monthlySold!==null)return {...value,monthlyLabelVisible:true};
  }
  return {...empty,monthlyLabelVisible:labelVisible||monthlyLabel(text)};
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
  const m=String(text).replace(/(\d)\s*,\s*(\d{2})(?!\d)/g,(_full,integer,cents)=>
   integer+','+cents).match(/R\$\s*(\d[\d.\s]*(?:,\s*\d{2})?)/i);
  if(!m)return null;
  const n=Number(m[1].replace(/\s/g,'').replace(/\./g,'').replace(',','.'));
  return Number.isFinite(n)&&n>0&&n<100000?Number(n.toFixed(2)):null;
 }
 function fromCard(card,link,identity,rank){
  const content=clean(card.innerText||card.textContent||'').slice(0,1300);
  if(!content)return null;
  const image=card.querySelector('img[alt]');
  // Priorizar o título do anúncio, não selos "Indicado" ou "Vendido/Mês".
  const titleNodes=[
   link.querySelector?.('[data-sqe="name"]'),card.querySelector('[data-sqe="name"]'),
   link.querySelector?.('h3'),card.querySelector('h3'),
   card.querySelector('[class*="line-clamp"]'),card.querySelector('[class*="truncate"]')
  ];
  const candidates=[...titleNodes.map(node=>clean(node?.innerText||node?.textContent||'')),
   clean(image?.alt||''),clean(link.getAttribute('title')||''),
   clean(link.getAttribute('aria-label')||''),
   clean(link.innerText||link.textContent||''),clean(content.split('R$')[0])];
  const productName=(candidates.find(value=>value.length>=6&&
   !/^(?:indicado|patrocinado|vendid[oa]s?\s*\/\s*m[eê]s|\d+[.,]?\d*\s*vendid[oa])/i.test(value)&&
   !/R\$\s*\d/.test(value))||'').slice(0,210);
  if(productName.length<6)return null;
  const monthly=cardMonthly(card);
  const monthlyLabelVisible=monthly.monthlyLabelVisible;
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
   if(cardMonthly(current).monthlySold!==null)return current;
  }
  return fallback;
 }
 function extract(){
  if(/\/verify\//.test(location.pathname)||/\/buyer\/login/.test(location.pathname))
   return {ok:false,blocked:true,error:'A Shopee exige login ou verificação nesta janela. Conclua no Chrome antes de pesquisar.',offers:[]};
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
   if(found.length>=100)break;
  }
  // Diagnóstico não comprova vendas sem vínculo ao anúncio.
  const labelInPage=Math.max(
   (body.match(/(?:vendid[oa]s?|vendas)\s*(?:\/|por|no|nos|em)\s*m[eê]s/gi)||[]).length,
   found.filter(x=>x.monthlyLabelVisible).length);
  return {ok:true,offers:found,visibleCards:seenCards.size,
   pricedCards:found.filter(x=>x.priceMin!==null).length,
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
    seen.set(key,!old?item:{...old,...item,
     priceMin:item.priceMin??old.priceMin,
     historicalSold:item.historicalSold??old.historicalSold,
     monthlySold:item.monthlySold??old.monthlySold,
     monthlyPeriod:item.monthlySold!=null?item.monthlyPeriod:old.monthlyPeriod,
     monthlyEvidence:item.monthlySold!=null?item.monthlyEvidence:old.monthlyEvidence,
     monthlyLabelVisible:item.monthlyLabelVisible||old.monthlyLabelVisible});
   }
  };
  collect();
  if(!blocked&&typeof window!=='undefined'){
   const body=document.body,root=document.documentElement;
   const max=Math.max(0,Math.max(root?.scrollHeight||0,body?.scrollHeight||0)-
    (window.innerHeight||720));
   // Até dez passos; dar tempo aos selos mensais em cada dobra do grid.
   for(let step=1;step<=6&&seen.size<100;step++){
    if(blocked)break;
    const next=Math.min(max,Math.round(step*Math.max(400,(window.innerHeight||720)*0.85)));
    window.scrollTo(0,next);
    await new Promise(resolve=>setTimeout(resolve,350));
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
