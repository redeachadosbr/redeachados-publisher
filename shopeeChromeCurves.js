
// Motor de classificação com dados VISÍVEIS coletados por extensão Chrome opcional.
// O plano de pesquisa sempre nasce das SKUs WeDrop, independentemente de publicação Shopee.
import {readWeDropCatalogProducts,readWeDropCosts} from './wedropCosts.js';
import {categoryMatches} from './shopeeKitBuilder.js';
import {curveSkuSearchPlan,officialFeaturedSearchUrl,matchCurveOffers,pickCurveResults} from './shopeeCurveAB.js';
import {curveAdsRejectionStats,CURVE_ADS_POLICY} from './shopeeCurveAdsFit.js';
const fold=s=>String(s||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/\s+/g,' ').trim();
const validId=v=>/^\d{1,18}$/.test(String(v??''));
const amount=v=>{if(v===null||v===undefined||v==='')return null;const n=Number(v);return Number.isSafeInteger(n)&&n>=0?n:null;};
const stateCache=new Map();
const TTL=90*60*1000;
const KEY=(shopId,category,keyword)=>String(shopId)+'|'+fold(category)+'|'+fold(keyword);
function options({category='Todos',keyword=''}={}){
 const cat=String(category||'Todos').trim(),term=String(keyword||'').trim();
 if(cat.length>90||term.length>70)throw Error('Filtro WeDrop muito longo.');
 return {cat,term};
}
async function stateFor(shopId,input){
 const {cat,term}=options(input),key=KEY(shopId,cat,term);
 let entry=stateCache.get(key);
 if(!entry||Date.now()-entry.createdAt>TTL){
  const promise=Promise.all([readWeDropCatalogProducts(shopId),readWeDropCosts(shopId)])
   .then(([catalog,costs])=>{
    const subset=catalog.filter(row=>categoryMatches(String(row.product_data?.category||''),cat)&&
     (!term||fold(String(row.product_data?.name||'')).includes(fold(term))));
    return {catalog:subset,costs,plan:curveSkuSearchPlan(subset,{keyword:term}),
     offers:new Map(),scanned:new Set(),queries:0,lastAt:null};
   });
  entry={createdAt:Date.now(),promise};
  stateCache.set(key,entry);
  while(stateCache.size>15)stateCache.delete(stateCache.keys().next().value);
 }
 try{return await entry.promise;}catch(error){stateCache.delete(key);throw error;}
}
export async function chromeCurvePlan(shopId,{category='Todos',keyword='',offset=0,limit=6}={}){
 if(!Number.isSafeInteger(offset)||offset<0||offset>10000)throw Error('Posição de busca inválida.');
 if(!Number.isInteger(limit)||limit<1||limit>10)throw Error('Escolha entre 1 e 10 buscas por lote.');
 const state=await stateFor(shopId,{category,keyword});
 const jobs=state.plan.slice(offset,offset+limit).map(job=>({
  query:job.query,skuCount:job.skus.length,skus:job.skus,
  searchUrl:officialFeaturedSearchUrl(job.query)
 }));
 return {ok:true,catalogCount:state.catalog.length,totalQueries:state.plan.length,
  offset,nextOffset:offset+jobs.length,hasMore:offset+jobs.length<state.plan.length,jobs};
}
export function verifiedMonthlyEvidence(value){
 const text=String(value||'').replace(/\s+/g,' ').trim();
 return text.length<=160&&(
  /\b(?:vendid[oa]s?|vendas)\s*(?:\/|por|no|nos|em)\s*m[eê]s\b/i.test(text)||
  /\b(?:vendas|vendid[oa]s?)\s*(?:nos\s+)?(?:[uú]ltimos\s+)?30\s*dias\b/i.test(text)||
  /\bm[eê]s\s*[:\-]\s*\d/i.test(text)||
  /\b(?:vendas|vendidos?)\s*(?:nos\s+)?(?:[uú]ltimos\s+)?30\s*(?:dias|d)\s*[:\-]?\s*\d/i.test(text)
 );
}
export function normalizeVisibleOffers(rows,{ownShopId='0'}={}){
 if(!Array.isArray(rows)||rows.length>100)throw Error('Máximo de 100 anúncios por consulta.');
 const seen=new Set(),out=[];
 for(const row of rows){
  if(!row||!validId(row.itemId)||!validId(row.shopId)||
   String(row.shopId)===String(ownShopId))continue;
  const itemId=String(row.itemId),shopId=String(row.shopId);
  const id=shopId+':'+itemId;
  if(seen.has(id))continue;seen.add(id);
  const productName=String(row.productName||'').replace(/\s+/g,' ').trim().slice(0,220);
  if(productName.length<6)continue;
  const monthly=amount(row.monthlySold),historical=amount(row.historicalSold);
  const evidence=String(row.monthlyEvidence||'').slice(0,160);
  const monthlySold=row.monthlyPeriod==='month'&&verifiedMonthlyEvidence(evidence)?monthly:null;
  const price=Number(row.priceMin);
  if(monthlySold===null&&historical===null&&!(Number.isFinite(price)&&price>0))continue;
  out.push({itemId,shopId,productName,
   sales:historical??monthlySold,historicalSold:historical,monthlySold,
   priceMin:Number.isFinite(price)&&price>0&&price<100000?price:null,
   // Valor unitário visível no cartão, usado como uma observação de preço.
   // Não representa preços de variações ocultas do anúncio.
   priceMax:Number.isFinite(price)&&price>0&&price<100000?price:null,
   dataSource:'shopee-featured-chrome',monthlyEvidence:evidence,
   featuredRank:amount(row.featuredRank)});
 }
 return out;
}
// Duas a cinco lojas distintas precisam comprovar 700+ vendas/mês.
// Curva A: no mínimo duas com >=900; B: no mínimo duas com >=700 (conservadora se mista).
export function confirmChromeMonthlySamples(rows){
 return rows.map(row=>{
  const monthly=(row.monthlyCompetitors||[]).filter(o=>
   Number.isSafeInteger(Number(o.monthlySold))&&Number(o.monthlySold)>=700).slice(0,5);
  const aCount=monthly.filter(o=>Number(o.monthlySold)>=900).length;
  const curve=aCount>=2?'A':monthly.length>=2?'B':null;
  const confirmed=Boolean(curve&&row.verified30);
  return {...row,curve:curve||row.curve,curveSampleConfirmed:confirmed,
   monthlyCompetitorCount:monthly.length,monthlyCompetitors:monthly,
   curveLabel:confirmed?'Curva '+curve+' • '+monthly.length+
    ' lojas com vendas mensais verificadas':row.curveLabel};
 });
}
export function qualifyChromeMatches(rows,{minCompetitors=2}={}){
 if(!Number.isInteger(minCompetitors)||minCompetitors<2||minCompetitors>5)
  throw Error('Amostra mensal fora do intervalo de 2 a 5.');
 return rows.filter(row=>row.curveSampleConfirmed===true&&row.verified30===true&&
  (row.curve==='A'||row.curve==='B')&&
  Number(row.monthlyCompetitorCount||0)>=minCompetitors&&
  row.adsCompetitiveness?.eligible===true);
}
export async function importChromeOffers(shopId,{
 category='Todos',keyword='',query='',offers=[],curve='ALL',limit=10,verifiedOnly=true
}={}){
 const search=String(query||'').trim();
 if(search.length<3||search.length>70)throw Error('Pesquisa fora dos limites.');
 const state=await stateFor(shopId,{category,keyword});
 const task=state.plan.find(j=>fold(j.query)===fold(search));
 if(!task)throw Error('Pesquisa não pertence ao catálogo WeDrop selecionado.');
 const normalized=normalizeVisibleOffers(offers,{ownShopId:shopId});
 for(const offer of normalized){
  const id=offer.shopId+':'+offer.itemId,prev=state.offers.get(id);
  if(!prev||(offer.monthlySold!==null&&prev.monthlySold===null))
   state.offers.set(id,offer);
 }
 for(const sku of task.skus)state.scanned.add(sku);
 state.queries++;
 state.lastAt=new Date().toISOString();
 const allMatches=matchCurveOffers({catalog:state.catalog,
  offers:[...state.offers.values()],costs:state.costs,ownShopId:shopId});
 // Não contabilizar SKU ainda não pesquisada que apenas coincidiu com
 // um anúncio pesquisado para outra SKU da mesma categoria.
 const rows=confirmChromeMonthlySamples(allMatches.filter(row=>state.scanned.has(row.sku)));
 const qualified=qualifyChromeMatches(rows);
 const picked=pickCurveResults(qualified,{curve,limit,verifiedOnly:true});
 const pending=rows.filter(x=>!qualified.includes(x));
 const priceStats=curveAdsRejectionStats(rows);
 return {ok:true,configured:true,verifiedOnly:true,curve,category,readOnly:true,
  ...picked,competitiveOnly:true,pricePolicy:CURVE_ADS_POLICY,
  ...priceStats,possibleMatches:rows.length,matchedSkuCount:rows.length,
  viableSkuCount:qualified.length,
  matchedSkuIds:rows.map(row=>row.sku),
  viableSkuIds:qualified.map(row=>row.sku),
  pendingCount:pending.length,
  pendingItems:pending.slice(0,20),catalogCount:state.catalog.length,
  offerCount:state.offers.size,skuSearchesCompleted:state.scanned.size,
  skuQueriesCompleted:state.queries,remainingSkuQueries:Math.max(0,state.plan.length-state.queries),
  sources:{featured:0,affiliate:0,chrome:state.queries},
  rowsWith30Days:picked.items.filter(x=>x.verified30).length,
  checkedAt:state.lastAt,hasMore:false,chromeHasMore:state.queries<state.plan.length,
  shortage:picked.shortage,qualifiedCount:picked.found,monthlyCompetitorsRequired:2,
  inspectedCompetitors:rows.reduce((n,row)=>n+Number(row.comparableCompetitorCount||0),0),
  shortageReason:picked.shortage?'Ainda não foram identificadas '+Number(limit)+
   ' SKUs com 2 a 5 lojas com vendas mensais na curva e preço competitivo para Ads.':'',
  chromeImport:{
   query:search,imported:normalized.length,
   monthlyOffers:normalized.filter(x=>x.monthlySold!==null).length,
   skuCount:task.skus.length,searchedSkus:task.skus,
   matchedSkus:task.skus.filter(sku=>rows.some(row=>row.sku===sku)),
   viableSkus:task.skus.filter(sku=>qualified.some(row=>row.sku===sku))},
  warning:'Somente Curvas A/B com 2 a 5 concorrentes de 700+ vendas/mês, média do preço de 5 a 10 anúncios do mesmo produto (mesma loja permitida), custo inferior à média e preço rentável até 40% acima dela. '+
   priceStats.excludedByPrice+' SKUs Curva A/B excluídas por custo/preço ou falta de média. Sem confirmação, não indicar Ads.',
  searchMode:'wedrop-first-chrome-visible-featured',marketplaceUpdated:false};
}
