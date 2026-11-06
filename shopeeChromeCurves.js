
// Motor de classificação com dados VISÍVEIS coletados por extensão Chrome opcional.
// O plano de pesquisa sempre nasce das SKUs WeDrop, independentemente de publicação Shopee.
import {readWeDropCatalogProducts,readWeDropCosts} from './wedropCosts.js';
import {categoryMatches} from './shopeeKitBuilder.js';
import {curveSkuSearchPlan,officialFeaturedSearchUrl,matchCurveOffers,pickCurveResults} from './shopeeCurveAB.js';
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
  query:job.query,skuCount:job.skus.length,searchUrl:officialFeaturedSearchUrl(job.query)
 }));
 return {ok:true,catalogCount:state.catalog.length,totalQueries:state.plan.length,
  offset,nextOffset:offset+jobs.length,hasMore:offset+jobs.length<state.plan.length,jobs};
}
export function verifiedMonthlyEvidence(value){
 const text=String(value||'').replace(/\s+/g,' ').trim();
 return text.length<=160&&(
  /\bvendid[oa]s?\s*(?:\/|por|no|nos|em)\s*m[eê]s\b/i.test(text)||
  /\b(?:vendas|vendid[oa]s?)\s*(?:nos\s+)?(?:[uú]ltimos\s+)?30\s*dias\b/i.test(text)||
  /\bm[eê]s\s*[:\-]\s*\d/i.test(text)
 );
}
export function normalizeVisibleOffers(rows,{ownShopId='0'}={}){
 if(!Array.isArray(rows)||rows.length>60)throw Error('Máximo de 60 anúncios por consulta.');
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
  if(monthlySold===null&&historical===null)continue;
  const price=Number(row.priceMin);
  out.push({itemId,shopId,productName,
   sales:historical??monthlySold,historicalSold:historical,monthlySold,
   priceMin:Number.isFinite(price)&&price>0&&price<100000?price:null,
   dataSource:'shopee-featured-chrome',monthlyEvidence:evidence,
   featuredRank:amount(row.featuredRank)});
 }
 return out;
}
// Uma SKU só entra no Top A/B quando três LOJAS concorrentes distintas
// têm dados mensais verificáveis. Um anúncio isolado não valida a pesquisa.
export function qualifyChromeMatches(rows,{minCompetitors=3}={}){
 if(!Number.isInteger(minCompetitors)||minCompetitors<3)throw Error('Amostra mínima inválida.');
 return rows.filter(row=>row.verified30===true&&
  (row.curve==='A'||row.curve==='B')&&
  Number(row.monthlyCompetitorCount||0)>=minCompetitors);
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
 const rows=matchCurveOffers({catalog:state.catalog,
  offers:[...state.offers.values()],costs:state.costs,ownShopId:shopId});
 const qualified=qualifyChromeMatches(rows);
 const picked=pickCurveResults(qualified,{curve,limit,verifiedOnly:true});
 const pending=rows.filter(x=>!qualified.includes(x));
 return {ok:true,configured:true,verifiedOnly:true,curve,category,readOnly:true,
  ...picked,possibleMatches:rows.length,pendingCount:pending.length,
  pendingItems:[],catalogCount:state.catalog.length,
  offerCount:state.offers.size,skuSearchesCompleted:state.scanned.size,
  skuQueriesCompleted:state.queries,remainingSkuQueries:Math.max(0,state.plan.length-state.queries),
  sources:{featured:0,affiliate:0,chrome:state.queries},
  rowsWith30Days:picked.items.filter(x=>x.verified30).length,
  checkedAt:state.lastAt,hasMore:false,chromeHasMore:state.queries<state.plan.length,
  shortage:picked.shortage,qualifiedCount:picked.found,monthlyCompetitorsRequired:3,
  inspectedCompetitors:rows.reduce((n,row)=>n+Number(row.comparableCompetitorCount||0),0),
  shortageReason:picked.shortage?'Ainda não foram identificadas '+Number(limit)+
   ' SKUs com 3 concorrentes distintos e evidência mensal. Continue a pesquisa ou conecte uma fonte com vendas em 30 dias.':'',
  chromeImport:{
   query:search,imported:normalized.length,monthlyOffers:normalized.filter(x=>x.monthlySold!==null).length},
  warning:'Apenas SKUs com ao menos 3 lojas concorrentes com evidência de vendas nos últimos 30 dias entram nas Curvas A/B. Totais acumulados não classificam; não se somam vendas das lojas.',
  searchMode:'wedrop-first-chrome-visible-featured',marketplaceUpdated:false};
}
