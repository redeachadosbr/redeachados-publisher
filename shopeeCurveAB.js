// Curvas A/B — amostra de ofertas Shopee Afiliados e catálogo WeDrop da própria loja.
// Nenhuma consulta nesta rota publica anúncios, modifica campanhas ou informa
// como "30 dias" um contador de vendas acumuladas sem histórico real.
import crypto from 'node:crypto';
import {readWeDropCatalogProducts,readWeDropCosts} from './wedropCosts.js';
import {comparableTitle} from './shopeeMarketResearch.js';

const ENDPOINT='https://open-api.affiliate.shopee.com.br/graphql';
const env=name=>String(process.env[name]||'').trim();
const normal=value=>String(value??'').normalize('NFD').replace(/[\u0300-\u036f]/g,'')
 .toLowerCase().replace(/[^a-z0-9 ]/g,' ').replace(/\s+/g,' ').trim();
const ignored=new Set('de do da das dos e em para com sem um uma o a os as infantil crianca criancas kit produto produtos sortido cores cor modelo original escolar'.split(' '));
const words=value=>[...new Set(normal(value).split(' ').filter(x=>x.length>=3&&!ignored.has(x)))];
const validId=value=>/^\d{1,18}$/.test(String(value??'').trim());
const num=value=>{const n=Number(value);return Number.isFinite(n)&&n>=0?n:null};
const available=raw=>!/(^|\s)(indisponivel|sem estoque|esgotado|inativo)(\s|$)/.test(normal(raw));
const intSales=value=>{const n=Number(value);return Number.isSafeInteger(n)&&n>=0?n:null};
const isHttpImage=url=>{
 try{
  const value=new URL(String(url||''));
  return value.protocol==='https:'&&value.hostname.endsWith('digitaloceanspaces.com');
 }catch{return false;}
};

export function curveGroup(sales30,salesDisplayed){
 if(Number.isSafeInteger(sales30)&&sales30>=0)
  return sales30>=900&&sales30<=1000?
   {curve:'A',verified30:true,label:'Curva A • 30 dias observados'}:
   sales30<900?{curve:'B',verified30:true,label:'Curva B • 30 dias observados'}:
   {curve:'HIGH',verified30:true,label:'Acima de 1.000 / 30 dias'};
 // Campo sales da API é acumulado: só sinaliza candidatos.
 return Number.isSafeInteger(salesDisplayed)&&salesDisplayed>=900?
  {curve:'A',verified30:false,label:'Potencial A • acumulado'}:
  {curve:'B',verified30:false,label:'Potencial B • acumulado'};
}

export function curveSearchTerms(products,{keyword=''}={}){
 const term=String(keyword||'').trim();
 if(term)return [term.slice(0,70)];
 const count=new Map();
 for(const p of products){
  if(!available(p.product_data?.rawAvailability))continue;
  const category=String(p.product_data?.category||'');
  for(const part of category.split(/,|\s+e\s+|\/|&/i)){
   const title=part.trim();
   if(title.length<4||/^(outros|geral|diversos|acessorios)$/i.test(normal(title)))continue;
   count.set(title,(count.get(title)||0)+1);
  }
 }
 const sorted=[...count].sort((a,b)=>b[1]-a[1]).map(([word])=>word);
 return [...new Set(sorted.map(x=>normal(x)).filter(Boolean))].slice(0,18);
}

export function matchCurveOffers({catalog=[],offers=[],costs=[],baseline=new Map(),today=new Date().toISOString().slice(0,10)}={}){
 const inventory=catalog.map(item=>{
  const d=item.product_data||{};
  return {sku:String(item.supplier_sku||''),name:String(d.name||'').trim(),
   category:String(d.category||''),imageUrl:isHttpImage(d.imageUrl)?String(d.imageUrl):'',
   availability:String(d.rawAvailability||''),inStock:available(d.rawAvailability),
   sourceFile:String(item.source_file||''),tokens:words(d.name)};
 }).filter(x=>x.sku&&x.tokens.length>=2);
 const index=new Map();
 for(const p of inventory){
  for(const t of p.tokens){
   if(!index.has(t))index.set(t,[]);
   index.get(t).push(p);
  }
 }
 const costIndex=new Map(costs.map(x=>[String(x.supplier_sku),num(x.unit_cost)]));
 const found=new Map();
 for(const offer of offers){
  if(!validId(offer.itemId)||!validId(offer.shopId)||
    !String(offer.productName||'').trim()||intSales(offer.sales)===null)continue;
  const tokens=words(offer.productName),hits=new Map();
  for(const token of tokens)for(const item of index.get(token)||[])
   hits.set(item.sku,{item,count:(hits.get(item.sku)?.count||0)+1});
  const short=[...hits.values()].filter(x=>x.count>=2).sort((a,b)=>b.count-a.count).slice(0,110);
  for(const entry of short){
   const p=entry.item;
   if(!comparableTitle(p.name,offer.productName))continue;
   const common=entry.count;
   const score=common/Math.max(1,Math.min(p.tokens.length,tokens.length));
   if(score<0.62||common<Math.min(3,p.tokens.length))continue;
   const current=found.get(p.sku);
   const sales=intSales(offer.sales),price=num(offer.priceMin);
   if(current&&(current.salesDisplayed>sales||
     current.salesDisplayed===sales&&current.matchScore>=score))continue;
   const history=baseline instanceof Map?baseline.get(String(offer.itemId)):null;
   let sales30=null,observedDays=null;
   if(history&&intSales(history.sales)!==null&&sales>=history.sales){
    const age=Math.floor((Date.parse(today+'T00:00:00Z')-
     Date.parse(String(history.day)+'T00:00:00Z'))/86400000);
    if(age>=29&&age<=31){sales30=sales-history.sales;observedDays=age;}
   }
   const group=curveGroup(sales30,sales);
   found.set(p.sku,{sku:p.sku,name:p.name,category:p.category,
    imageUrl:p.imageUrl,availability:p.availability,inStock:p.inStock,
    cost:costIndex.get(p.sku)??null,competitorName:String(offer.productName).slice(0,200),
    shopId:String(offer.shopId),itemId:String(offer.itemId),
    competitorUrl:'https://shopee.com.br/product/'+offer.shopId+'/'+offer.itemId,
    competitorPrice:price,salesDisplayed:sales,sales30,observedDays,
    curve:group.curve,curveLabel:group.label,verified30:group.verified30,
    matchScore:Number(score.toFixed(2)),source:'Shopee Affiliate productOfferV2',
    sourceFile:p.sourceFile});
  }
 }
 return [...found.values()].sort((a,b)=>
  Number(b.verified30)-Number(a.verified30)||
  Number(b.inStock)-Number(a.inStock)||
  b.salesDisplayed-a.salesDisplayed||b.matchScore-a.matchScore||
  a.sku.localeCompare(b.sku));
}
export function pickCurveResults(rows,{curve='ALL',limit=10}={}){
 if(![5,10,15,20].includes(Number(limit)))throw Error('Escolha 5, 10, 15 ou 20 produtos.');
 const choice=String(curve).toUpperCase();
 if(!['ALL','A','B'].includes(choice))throw Error('Filtro de curva inválido.');
 const accepted=rows.filter(x=>x.curve!=='HIGH'&&(choice==='ALL'||x.curve===choice));
 return {items:accepted.slice(0,Number(limit)),found:accepted.length,requested:Number(limit),
  shortage:Math.max(0,Number(limit)-accepted.length)};
}
function saoPauloDay(date=new Date()){
 const parts=new Intl.DateTimeFormat('en-CA',{timeZone:'America/Sao_Paulo',
  year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(date);
 const p=Object.fromEntries(parts.map(x=>[x.type,x.value]));
 return [p.year,p.month,p.day].join('-');
}
function daysBack(date,days){
 return new Date(Date.parse(date+'T12:00:00Z')-days*86400000).toISOString().slice(0,10);
}
function dbConfig(){
 const url=env('SUPABASE_URL').replace(/\/$/,'');
 const key=env('SUPABASE_SECRET_KEY')||env('SUPABASE_SERVICE_ROLE_KEY');
 if(!url||!key)throw Error('Banco de histórico Shopee não configurado.');
 const headers={apikey:key,'Content-Type':'application/json',Accept:'application/json'};
 if(/^eyJ[A-Za-z0-9_-]*\./.test(key))headers.Authorization='Bearer '+key;
 return {url,headers};
}
async function historyRequest(path,{method='GET',body,prefer}={}){
 const cfg=dbConfig();
 const response=await fetch(cfg.url+'/rest/v1/shopee_curve_offer_snapshots'+path,{
  method,headers:{...cfg.headers,...(prefer?{Prefer:prefer}:{})},
  ...(body?{body:JSON.stringify(body)}:{}),signal:AbortSignal.timeout(15000)
 });
 if(!response.ok)throw Error('Histórico de 30 dias indisponível (HTTP '+response.status+').');
 return method==='GET'?response.json():null;
}
async function readBaselines(shopId,today){
 const first=daysBack(today,31),last=daysBack(today,29),all=[];
 for(let offset=0;offset<15000;offset+=1000){
  const page=await historyRequest('?shop_id=eq.'+shopId+
   '&observed_day=gte.'+first+'&observed_day=lte.'+last+
   '&select=item_id,observed_day,cumulative_sales&order=observed_day.asc&limit=1000&offset='+offset);
  all.push(...page);
  if(page.length<1000)break;
 }
 const result=new Map();
 for(const r of all){
  const key=String(r.item_id),prev=result.get(key);
  if(!prev||r.observed_day>prev.day)result.set(key,{
   day:String(r.observed_day),sales:Number(r.cumulative_sales)});
 }
 return result;
}
async function saveObservations(shopId,today,offers){
 const byId=new Map();
 for(const offer of offers){
  if(validId(offer.itemId)&&intSales(offer.sales)!==null)
   byId.set(String(offer.itemId),{shop_id:Number(shopId),
    item_id:Number(offer.itemId),observed_day:today,
    cumulative_sales:Number(offer.sales),observed_at:new Date().toISOString()});
 }
 const all=[...byId.values()];
 for(let i=0;i<all.length;i+=150)
  await historyRequest('?on_conflict=shop_id,item_id,observed_day',{
   method:'POST',body:all.slice(i,i+150),
   prefer:'resolution=merge-duplicates,return=minimal'});
 return all.length;
}
function signedRequest(keyword,page,mode=2){
 const appId=env('SHOPEE_AFFILIATE_APP_ID'),secret=env('SHOPEE_AFFILIATE_SECRET');
 const args=[...(keyword?['keyword:'+JSON.stringify(keyword)]:[]),
  'listType:'+mode,'sortType:2','page:'+page,'limit:50'].join(',');
 const query='{productOfferV2('+args+
  '){nodes{itemId shopId productName sales priceMin priceMax imageUrl}pageInfo{hasNextPage}}}';
 const payload=JSON.stringify({query}),now=String(Math.floor(Date.now()/1000));
 const signature=crypto.createHash('sha256').update(appId+now+payload+secret).digest('hex');
 return fetch(ENDPOINT,{method:'POST',headers:{
  'Content-Type':'application/json',
  Authorization:'SHA256 Credential='+appId+', Timestamp='+now+', Signature='+signature
 },body:payload,signal:AbortSignal.timeout(9000)}).then(async response=>{
  if(!response.ok)throw Error('HTTP '+response.status);
  const result=await response.json();
  if(result.errors?.length)throw Error(String(result.errors[0]?.message||'API Shopee').slice(0,170));
  if(!Array.isArray(result.data?.productOfferV2?.nodes))
   throw Error('Resposta Shopee incompleta.');
  return result.data.productOfferV2.nodes;
 });
}
async function offersQuery(keyword,page){
 try{return await signedRequest(keyword,page,2);}
 catch(err){
  // Algumas contas não habilitam lista Top performance. Modo 0 ainda usa
  // ordenação por vendidos; resultado identificado como amostra de ofertas.
  if(/rate.limit|limit exceeded|signature|unauthorized|forbidden|credential/i.test(String(err.message)))throw err;
  return signedRequest(keyword,page,0);
 }
}
async function fetchOffers(terms){
 const tasks=[{term:'',page:1},{term:'',page:2},
  ...terms.map(term=>({term,page:1}))];
 const offers=[],errors=[],queried=[];
 let cursor=0;
 await Promise.all(Array.from({length:4},async()=>{
  while(cursor<tasks.length){
   const job=tasks[cursor++];
   try{
    const results=await offersQuery(job.term,job.page);
    queried.push(job.term||'Top performance');
    offers.push(...results);
   }catch(error){errors.push((job.term||'Top performance')+': '+
    String(error.message||error).slice(0,120));}
  }
 }));
 const unique=new Map();
 for(const item of offers){
  if(!validId(item.itemId)||!validId(item.shopId))continue;
  unique.set(String(item.shopId)+':'+String(item.itemId),item);
 }
 return {offers:[...unique.values()],queries:queried,errors:errors.slice(0,7)};
}
const cache=new Map();
export async function researchCurveAB(shopId,{limit=10,curve='ALL',keyword='',refresh=false}={}){
 const desired=Number(limit),chosen=String(curve||'ALL').toUpperCase();
 if(![5,10,15,20].includes(desired)||!['ALL','A','B'].includes(chosen))
  throw Error('Seleção de quantidade ou curva inválida.');
 const term=String(keyword||'').trim();
 if(term.length>70)throw Error('Pesquisa muito longa (máximo 70 caracteres).');
 const configured=Boolean(env('SHOPEE_AFFILIATE_APP_ID')&&env('SHOPEE_AFFILIATE_SECRET'));
 if(!configured)return {ok:true,configured:false,requested:desired,curve:chosen,
  items:[],found:0,shortage:desired,catalogCount:0,offerCount:0,queries:[],
  warning:'A pesquisa automática depende das credenciais Shopee Affiliate App ID e Secret configuradas no Render. A API de vendedor não fornece vendas dos concorrentes.'};
 const cacheKey=String(shopId)+'|'+normal(term),prior=cache.get(cacheKey);
 let work;
 if(!refresh&&prior&&Date.now()-prior.at<3*60000)work=prior.promise;
 else{
  work=(async()=>{
   const [catalog,costs]=await Promise.all([
    readWeDropCatalogProducts(shopId),readWeDropCosts(shopId)]);
   const terms=curveSearchTerms(catalog,{keyword:term});
   const result=await fetchOffers(terms);
   const today=saoPauloDay();
   const baseline=await readBaselines(shopId,today).catch(()=>new Map());
   const matches=matchCurveOffers({catalog,offers:result.offers,costs,baseline,today});
   const observations=await saveObservations(shopId,today,result.offers)
    .catch(()=>null);
   return {matches,catalogCount:catalog.length,offerCount:result.offers.length,
    queries:result.queries,errors:result.errors,observations,checkedAt:new Date().toISOString()};
  })();
  cache.set(cacheKey,{promise:work,at:Date.now()});
  if(cache.size>22)cache.delete(cache.keys().next().value);
 }
 let data;
 try{data=await work;}catch(error){cache.delete(cacheKey);throw error;}
 const chosenResults=pickCurveResults(data.matches,{limit:desired,curve:chosen});
 const notes=[
  'A fonte Shopee Afiliados mostra vendas acumuladas, NÃO vendas oficiais de 30 dias. Quando não há duas observações separadas por aproximadamente 30 dias, a curva é apenas uma indicação de demanda.',
  'Amostra de anúncios elegíveis à API de afiliados, ordenados por vendas: não reproduz literalmente a aba Em Destaque nem cobre todo o marketplace.',
  chosenResults.shortage?'Foram encontrados '+chosenResults.items.length+' dos '+desired+
   ' produtos solicitados. A consulta não foi bloqueada.':'',
  data.observations===null?'Histórico temporal não pôde ser gravado; indicadores de 30 dias indisponíveis.':'',
  data.errors.length?'Algumas buscas não responderam: '+data.errors.slice(0,2).join(' | '):''
 ].filter(Boolean);
 return {ok:true,configured:true,curve:chosen,...chosenResults,
  catalogCount:data.catalogCount,offerCount:data.offerCount,
  queryCount:data.queries.length,checkedAt:data.checkedAt,
  recordedOffers:data.observations,rowsWith30Days:chosenResults.items.filter(x=>x.verified30).length,
  warning:notes.join(' '),readOnly:true,marketplaceUpdated:false};
}
