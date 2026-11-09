
// Motor de classificação com dados VISÍVEIS coletados por extensão Chrome opcional.
// O plano de pesquisa sempre nasce das SKUs WeDrop, independentemente de publicação Shopee.
import {readWeDropCatalogProducts,readWeDropCosts} from './wedropCosts.js';
import {categoryMatches} from './shopeeKitBuilder.js';
import {curveSkuSearchPlan,officialFeaturedSearchUrl,matchCurveOffers,pickCurveResults} from './shopeeCurveAB.js';
import {curveAdsRejectionStats,CURVE_ADS_POLICY} from './shopeeCurveAdsFit.js';
import {searchFeaturedPublic} from './shopeeFeaturedSearch.js';
import {lookupShopeeCompetitors,marketResearchConfigured} from './shopeeMarketResearch.js';
const fold=s=>String(s||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/\s+/g,' ').trim();
const validId=v=>/^\d{1,18}$/.test(String(v??''));
const amount=v=>{if(v===null||v===undefined||v==='')return null;const n=Number(v);return Number.isSafeInteger(n)&&n>=0?n:null;};
// Evidências complementares só entram se tiverem ID, título e preço real.
// Nunca sobrepor dados capturados pela Ponte Chrome para o mesmo anúncio.
export function mergeCurvePriceSamples(store,samples=[]){
 let count=0;
 for(const item of samples){
  const shopId=String(item?.shopId??''),itemId=String(item?.itemId??'');
  const title=String(item?.title||'').trim().slice(0,220);
  const price=Number(item?.price);
  if(!validId(shopId)||!validId(itemId)||title.length<6||
   !Number.isFinite(price)||price<=0||price>=100000)continue;
  const key=shopId+':'+itemId,existing=store.get(key);
  if(existing&&Number(existing.priceMin)>0)continue;
  store.set(key,{...existing,shopId,itemId,productName:title,
   priceMin:price,priceMax:price,dataSource:existing?.dataSource||'shopee-affiliate-recovery'});
  count++;
 }
 return count;
}
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
     offers:new Map(),scanned:new Set(),marketAttempted:new Set(),queries:0,lastAt:null};
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
 if(offset===0){
  // Nova pesquisa deve começar com os dados atuais, nunca misturar
  // preços e volumes de uma tentativa anterior da mesma categoria.
  state.offers.clear();state.scanned.clear();state.marketAttempted.clear();
  state.queries=0;state.lastAt=null;state.featuredUnavailableUntil=0;
 }
 const costIndex=new Map(state.costs.map(x=>[String(x.supplier_sku),Number(x.unit_cost)]));
 const jobs=state.plan.slice(offset,offset+limit).map(job=>{
  const costs=job.skus.map(sku=>costIndex.get(String(sku)));
  return {query:job.query,skuCount:job.skus.length,skus:job.skus,
   minSkuCost:costs.length&&costs.every(c=>Number.isFinite(c)&&c>0)?
    Math.min(...costs):null,
   searchUrl:officialFeaturedSearchUrl(job.query)};
 });
 return {ok:true,catalogCount:state.catalog.length,totalQueries:state.plan.length,
  offset,nextOffset:offset+jobs.length,hasMore:offset+jobs.length<state.plan.length,jobs};
}
export function verifiedMonthlyEvidence(value){
 const text=String(value||'').normalize('NFC')
  .replace(/[\u200b-\u200d\u2060\ufeff]/g,'').replace(/[\u2044\u2215\uff0f]/g,'/')
  .replace(/\s+/g,' ').trim();
 return text.length<=160&&(
  /(?<![a-z])(?:vendid[oa]s?|vendas)\s*(?:\/|por|no|nos|em)\s*m[eê]s\b/i.test(text)||
  /(?<![a-z])(?:vendas|vendid[oa]s?)\s*(?:nos\s+)?(?:[uú]ltimos\s+)?30\s*dias\b/i.test(text)||
  /\bm[eê]s\s*[:\-]\s*\d/i.test(text)||
  /(?<![a-z])(?:vendas|vendidos?)\s*(?:nos\s+)?(?:[uú]ltimos\s+)?30\s*(?:dias|d)\s*[:\-]?\s*\d/i.test(text)
 );
}
// Confere o NÚMERO do rótulo mensal, não só se o texto contém Vendido/Mês.
export function monthlyEvidenceMatchesValue(raw,expected){
 if(!Number.isSafeInteger(expected)||expected<0||!verifiedMonthlyEvidence(raw))return false;
 const text=String(raw).normalize('NFC').replace(/[\u200b-\u200d\u2060\ufeff]/g,'')
  .replace(/[\u2044\u2215\uff0f]/g,'/').replace(/\s+/g,' ').trim();
 const quantity='(\\d[\\d.,]*(?:\\s*(?:milh(?:ão|ões)|mil|k))?\\s*\\+?)';
 const patterns=[
  new RegExp(quantity+'\\s*(?:vendid[oa]s?|vendas)\\s*(?:\\/|por|no|nos|em)\\s*m[eê]s','gi'),
  new RegExp('(?:vendid[oa]s?|vendas)\\s*(?:\\/|por|no|nos|em)\\s*m[eê]s\\s*[:\\-]?\\s*'+quantity,'gi'),
  new RegExp(quantity+'\\s*(?:vendid[oa]s?|vendas)\\s*(?:nos\\s+)?(?:[uú]ltimos\\s+)?30\\s*dias','gi'),
  new RegExp('(?:vendas|vendid[oa]s?)\\s*(?:nos\\s+)?(?:[uú]ltimos\\s+)?30\\s*(?:dias|d)\\s*[:\\-]?\\s*'+quantity,'gi')
 ];
 const parse=rawValue=>{
  const m=String(rawValue).toLowerCase().replace(/\+\s*$/,'').trim()
   .match(/^(\d[\d.,]*)(?:\s*(milh(?:ão|ões)|mil|k))?$/i);
  if(!m)return null;
  const number=m[1],unit=m[2]||'';
  let value;
  if(unit)value=Number(number.includes(',')?number.replace(/\./g,'').replace(',','.'):
   /^\d{1,3}(?:\.\d{3})+$/.test(number)?number.replace(/\./g,''):number);
  else if(/^\d{1,3}(?:\.\d{3})+$/.test(number))value=Number(number.replace(/\./g,''));
  else if(/^\d{1,3}(?:,\d{3})+$/.test(number))value=Number(number.replace(/,/g,''));
  else value=Number(number.replace(',','.'));
  if(!unit&&!Number.isInteger(value))return null;
  value=Math.round(value*(/milh/.test(unit)?1000000:/mil|k/.test(unit)?1000:1));
  return Number.isSafeInteger(value)&&value>=0?value:null;
 };
 const values=new Set();
 for(const regex of patterns)for(const match of text.matchAll(regex)){
  const count=parse(match[1]||match[2]);
  if(count!==null)values.add(count);
 }
 return values.size===1&&values.has(expected);
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
  const monthlySold=row.monthlyPeriod==='month'&&monthlyEvidenceMatchesValue(evidence,monthly)?monthly:null;
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
  // Nenhuma SKU é Curva A/B sem DUAS lojas distintas de >=700 vendas/mês.
  const stores=new Map();
  for(const offer of row.monthlyCompetitors||[]){
   const shopId=String(offer?.shopId||''),monthly=Number(offer?.monthlySold);
   if(!validId(shopId)||!Number.isSafeInteger(monthly)||monthly<700)continue;
   const prev=stores.get(shopId);
   if(!prev||monthly>Number(prev.monthlySold))stores.set(shopId,offer);
  }
  const monthly=[...stores.values()].sort((a,b)=>Number(b.monthlySold)-Number(a.monthlySold)).slice(0,5);
  const aCount=monthly.filter(o=>Number(o.monthlySold)>=900).length;
  const curve=aCount>=2?'A':monthly.length>=2?'B':null;
  const confirmed=Boolean(curve&&row.verified30);
  return {...row,curve:confirmed?curve:'PENDING',curveSampleConfirmed:confirmed,
   monthlyCompetitorCount:monthly.length,monthlyCompetitors:monthly,
   curveLabel:confirmed?'Curva '+curve+' • '+monthly.length+
    ' lojas com vendas mensais verificadas':'A/B não comprovada: exige 2 lojas com 700+ vendas/mês'};
 });
}
// Produtos com custo/preço comprovadamente incompatíveis NUNCA são candidatos pendentes.
// Exigir renda/demanda adicional para esses itens não muda a inviabilidade financeira.
const FINAL_ADS_REJECTIONS=new Set([
 'cost_above_market','above_60_pct','unprofitable','out_of_stock'
]);
const SKIP_MONTHLY_REJECTIONS=new Set([...FINAL_ADS_REJECTIONS,'missing_cost']);
export function canSkipCurveDemandRecovery(rows,skus=[]){
 if(!Array.isArray(skus)||!skus.length)return false;
 const statuses=new Map(rows.map(row=>[String(row.sku),row.adsCompetitiveness?.status]));
 return skus.every(sku=>SKIP_MONTHLY_REJECTIONS.has(statuses.get(String(sku))));
}
export function splitChromeAdsCandidates(rows,qualified=[]){
 const approved=new Set(qualified.map(row=>String(row.sku)));
 const pending=[],discarded=[],discardedReasons={};
 for(const row of rows){
  if(approved.has(String(row.sku)))continue;
  const status=String(row.adsCompetitiveness?.status||'unknown');
  if(FINAL_ADS_REJECTIONS.has(status)){
   discarded.push(row);
   discardedReasons[status]=(discardedReasons[status]||0)+1;
  }else pending.push(row);
 }
 return {pending,discarded,discardedReasons};
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
 // Preço/custo antes de consultas adicionais de demanda.
 for(const offer of normalized){
  const id=offer.shopId+':'+offer.itemId,prev=state.offers.get(id);
  state.offers.set(id,prev?{...prev,...offer,
   monthlySold:offer.monthlySold??prev.monthlySold,
   monthlyEvidence:offer.monthlySold!==null?offer.monthlyEvidence:prev.monthlyEvidence,
   sales:offer.sales??prev.sales}:offer);
 }
 const pricedRows=matchCurveOffers({catalog:state.catalog,
  offers:[...state.offers.values()],costs:state.costs,ownShopId:shopId});
 const costFirstSkippedMonthly=canSkipCurveDemandRecovery(pricedRows,task.skus);
 // Segundo caminho de recuperação: somente quando a Ponte trouxe ofertas,
 // mas NENHUMA venda mensal. A vitrine pública é uma fonte opcional, não
 // substituir rótulos não verificados por vendas acumuladas.
 let recoverySource='not_needed',recoveryReason='',recoveredMonthly=0;
 let recovered=[];
 if(normalized.length&&!normalized.some(o=>o.monthlySold!==null)&&!costFirstSkippedMonthly){
  if(Date.now()<Number(state.featuredUnavailableUntil||0)){
   recoverySource='temporarily_unavailable';
   recoveryReason='Fonte pública temporariamente indisponível; não repetir chamadas bloqueadas.';
  }else{
   const fallback=await searchFeaturedPublic(search,{timeoutMs:5000});
   if(fallback.ok){
    recovered=normalizeVisibleOffers((fallback.offers||[]).map(offer=>({
     ...offer,monthlyPeriod:offer.monthlySold!==null?'month':null,
     monthlyEvidence:offer.monthlySold!==null?String(offer.monthlySold)+' Vendido/Mês • vitrine pública Shopee':''
    })),{ownShopId:shopId}).map((offer,i)=>({
     ...offer,dataSource:'shopee-featured-public',
     featuredRank:i+1
    }));
    recoveredMonthly=recovered.filter(o=>o.monthlySold!==null).length;
    recoverySource=recoveredMonthly?'featured_public':'featured_without_monthly';
    recoveryReason=recoveredMonthly?'Vendas/mês verificadas na segunda fonte oficial':
     'Vitrine pública não apresentou vendas mensais verificáveis.';
   }else{
    recoverySource=fallback.blocked?'featured_blocked':'featured_unavailable';
    recoveryReason=String(fallback.error||'A fonte pública não retornou evidências.').slice(0,180);
    state.featuredUnavailableUntil=Date.now()+10*60000;
   }
  }
 }
 for(const offer of recovered){
  const id=offer.shopId+':'+offer.itemId,prev=state.offers.get(id);
  // Atualização da extensão precisa substituir preços/títulos obsoletos
  // do mesmo anúncio, preservando prova mensal quando a página atual omitir o rótulo.
  state.offers.set(id,prev?{...prev,...offer,
   monthlySold:offer.monthlySold??prev.monthlySold,
   monthlyEvidence:offer.monthlySold!==null?offer.monthlyEvidence:prev.monthlyEvidence,
   sales:offer.sales??prev.sales}:offer);
 }
 // Com 1/2 anúncio relacionado, recuperar ofertas com preços verificáveis
 // da API de Afiliados, quando configurada. Vendas/mês continuam independentes.
 const initialRows=recovered.length?matchCurveOffers({catalog:state.catalog,
  offers:[...state.offers.values()],costs:state.costs,ownShopId:shopId}):pricedRows;
 const priceRecovery=[];
 if(marketResearchConfigured()){
  const missing=task.skus.filter(sku=>{
   const row=initialRows.find(x=>x.sku===sku);
   return row&&row.avgCompetitorPrice===null&&
    !SKIP_MONTHLY_REJECTIONS.has(row.adsCompetitiveness?.status)&&
    Number(row.marketCandidateCount||0)<2&&!state.marketAttempted.has(sku);
  }).slice(0,2);
  for(const sku of missing)state.marketAttempted.add(sku);
  await Promise.all(missing.map(async sku=>{
   const record=state.catalog.find(x=>String(x.supplier_sku)===sku);
   if(!record)return;
   try{
    const sample=await lookupShopeeCompetitors({
     title:String(record.product_data?.name||''),
     ownShopId:shopId,ownItemId:'0',curveRecovery:true});
    const added=mergeCurvePriceSamples(state.offers,sample.sample);
    priceRecovery.push({sku,source:'shopee-affiliate',added,
     verified:sample.verified===true,status:sample.status,
     searchedQueries:sample.searchedQueries?.length||0,
     referenceCount:sample.count||0});
   }catch(error){
    priceRecovery.push({sku,source:'shopee-affiliate',added:0,
     status:'error',reason:String(error?.message||error).slice(0,130)});
   }
  }));
 }
 for(const sku of task.skus)state.scanned.add(sku);
 state.queries++;
 state.lastAt=new Date().toISOString();
 const allMatches=matchCurveOffers({catalog:state.catalog,
  offers:[...state.offers.values()],costs:state.costs,ownShopId:shopId});
 // Não contabilizar SKU ainda não pesquisada que apenas coincidiu com
 // um anúncio pesquisado para outra SKU da mesma categoria.
 const captured=[...state.offers.values()];
  const rows=confirmChromeMonthlySamples(allMatches.filter(row=>state.scanned.has(row.sku)))
   .map(row=>({...row,chromeCapturedOffers:captured.length,
    chromeCapturedWithPrice:captured.filter(o=>Number(o.priceMin)>0).length}));
 const qualified=qualifyChromeMatches(rows);
 const picked=pickCurveResults(qualified,{curve,limit,verifiedOnly:true});
 const {pending,discarded,discardedReasons}=splitChromeAdsCandidates(rows,qualified);
 const priceStats=curveAdsRejectionStats(rows);
 return {ok:true,configured:true,verifiedOnly:true,curve,category,readOnly:true,
  ...picked,competitiveOnly:true,pricePolicy:CURVE_ADS_POLICY,
  ...priceStats,possibleMatches:rows.length,matchedSkuCount:rows.length,
  viableSkuCount:qualified.length,
  matchedSkuIds:rows.map(row=>row.sku),
  viableSkuIds:qualified.map(row=>row.sku),
  pendingCount:pending.length,pendingSkuIds:pending.map(row=>row.sku),
  pendingItems:[],
  discardedCount:discarded.length,discardedSkuIds:discarded.map(row=>row.sku),
  discardedItems:[],discardedReasons,
  catalogCount:state.catalog.length,
  offerCount:state.offers.size,skuSearchesCompleted:state.scanned.size,
  skuQueriesCompleted:state.queries,remainingSkuQueries:Math.max(0,state.plan.length-state.queries),
  sources:{featured:recoveredMonthly?1:0,affiliate:0,chrome:state.queries},
  rowsWith30Days:rows.filter(x=>x.verified30&&x.curveSampleConfirmed).length,
  checkedAt:state.lastAt,hasMore:false,chromeHasMore:state.queries<state.plan.length,
  shortage:picked.shortage,qualifiedCount:picked.found,monthlyCompetitorsRequired:2,
  inspectedCompetitors:rows.reduce((n,row)=>n+Number(row.comparableCompetitorCount||0),0),
  shortageReason:picked.shortage?'Ainda não foram identificadas '+Number(limit)+
   ' SKUs com 2 a 5 lojas com vendas mensais na curva e preço competitivo para Ads.':'',
  chromeImport:{
   query:search,imported:normalized.length,
   importedWithPrice:normalized.filter(o=>o.priceMin!==null).length,
    priceRecovery,costFirstSkippedMonthly,affiliatePricesAdded:priceRecovery.reduce((sum,row)=>sum+row.added,0),
   inspectedRawOffers:offers.length,
    skuPriceDiagnostics:task.skus.map(sku=>{
     const row=rows.find(x=>x.sku===sku);
     return {sku,candidates:row?.marketCandidateCount||0,
      validated:row?.competitorOfferCount||0,
      average:row?.avgCompetitorPrice??null};
    }).slice(0,20),
   monthlyOffers:normalized.filter(x=>x.monthlySold!==null).length+recoveredMonthly,
   recoveredMonthly,recoverySource,recoveryReason,
   skuCount:task.skus.length,searchedSkus:task.skus,
   matchedSkus:task.skus.filter(sku=>rows.some(row=>row.sku===sku)),
   viableSkus:task.skus.filter(sku=>qualified.some(row=>row.sku===sku))},
  warning:'Somente Curvas A/B com 2 a 5 concorrentes de 700+ vendas/mês, média do preço de 2 a 10 anúncios do mesmo produto (mesma loja permitida), custo inferior à média e preço rentável até '+CURVE_ADS_POLICY.maxAboveMarketPct+'% acima dela. '+
   discarded.length+' SKU(s) descartadas de Ads por custo, margem ou estoque; '+
   pending.length+' SKU(s) aguardam evidências ou dados financeiros. '+
   'Vendas acumuladas não comprovam uma Curva A/B.',
  searchMode:'wedrop-first-chrome-visible-featured',marketplaceUpdated:false};
}

