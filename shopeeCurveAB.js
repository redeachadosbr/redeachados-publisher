// Curvas A/B — amostra de ofertas Shopee Afiliados e catálogo WeDrop da própria loja.
// Nenhuma consulta nesta rota publica anúncios, modifica campanhas ou informa
// como "30 dias" um contador de vendas acumuladas sem histórico real.
import crypto from 'node:crypto';
import {readWeDropCatalogProducts,readWeDropCosts} from './wedropCosts.js';
import {comparableTitle,evaluateMarketOffers} from './shopeeMarketResearch.js';
import {categoryMatches} from './shopeeKitBuilder.js';
import {searchFeaturedPublic} from './shopeeFeaturedSearch.js';

const ENDPOINT='https://open-api.affiliate.shopee.com.br/graphql';
const env=name=>String(process.env[name]||'').trim();
const normal=value=>String(value??'').normalize('NFD').replace(/[\u0300-\u036f]/g,'')
 .toLowerCase().replace(/[^a-z0-9 ]/g,' ').replace(/\s+/g,' ').trim();
const ignored=new Set('de do da das dos e em para com sem um uma o a os as infantil crianca criancas kit produto produtos sortido cores cor modelo original escolar'.split(' '));
const words=value=>[...new Set(normal(value).split(' ').filter(x=>x.length>=3&&!ignored.has(x)))];
const validId=value=>/^\d{1,18}$/.test(String(value??'').trim());
const num=value=>{const n=Number(value);return Number.isFinite(n)&&n>=0?n:null};
const available=raw=>!/(^|\s)(indisponivel|sem estoque|esgotado|inativo)(\s|$)/.test(normal(raw));
const intSales=value=>{if(value===null||value===undefined||value==='')return null;const n=Number(value);return Number.isSafeInteger(n)&&n>=0?n:null};
const isHttpImage=url=>{
 try{
  const value=new URL(String(url||''));
  return value.protocol==='https:'&&value.hostname.endsWith('digitaloceanspaces.com');
 }catch{return false;}
};

export function curveGroup(sales30,salesDisplayed){
 // Classificação baseada em concorrentes equivalentes, inclusive para SKUs ainda não publicadas.
 if(Number.isSafeInteger(sales30)&&sales30>=0){
  if(sales30>=900)return {curve:'A',verified30:true,label:'Curva A • 900 ou mais vendas em 30 dias'};
  if(sales30>=700)return {curve:'B',verified30:true,label:'Curva B • 700 a 899 vendas em 30 dias'};
  return {curve:'LOW',verified30:true,label:'Abaixo de 700 vendas em 30 dias'};
 }
 // Vendas acumuladas nunca são evidência suficiente para classificar a curva mensal.
 return {curve:'PENDING',verified30:false,label:'Vendas dos últimos 30 dias não disponíveis; conferir concorrente Em Destaque'};
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

// Cada consulta de descoberta é derivada de um produto REAL da WeDrop,
// não só do rótulo de categoria. A ordenação por subcategoria evita que as
// primeiras 40 buscas sejam todas, por exemplo, de utensílios.
const genericColors=new Set([
 'preto','preta','branco','branca','azul','rosa','roxo','roxa',
 'vermelho','vermelha','verde','amarelo','amarela','cinza','bege',
 'colorido','colorida','sortida','sortido','multicolorido'
]);
export function curveSkuSearchQuery(name){
 const title=String(name||'').slice(0,240);
 const tokens=words(title).filter(token=>!genericColors.has(token));
 // Ao buscar, preferir tipo e características da própria SKU.
 const head=tokens.filter(x=>!(/^\d+$/.test(x))).slice(0,3);
 const measure=normal(title).match(/\b\d{1,5}\s*(?:ml|litros|litro|l|cm|w)\b/);
 if(measure&&!head.some(t=>t===measure[0]))head.push(measure[0]);
 return head.join(' ').slice(0,70);
}
export function curveSkuSearchPlan(catalog,{keyword=''}={}){
 const term=normal(keyword).slice(0,70),buckets=new Map();
 for(const row of catalog){
  const name=String(row.product_data?.name||'');
  const sku=String(row.supplier_sku||'').trim();
  if(!sku||!name||!available(row.product_data?.rawAvailability))continue;
  if(term&&!normal(name).includes(term))continue;
  const query=curveSkuSearchQuery(name);
  if(query.length<3)continue; // pesquisar também SKUs com nome curto
  const bucket=String(row.product_data?.category||'Sem categoria');
  if(!buckets.has(bucket))buckets.set(bucket,[]);
  buckets.get(bucket).push({query,sku,name,bucket});
 }
 // Distribui a pesquisa pela categoria WeDrop real (ex. Cozinha possui
 // panelas, utensílios, potes e garrafas), sem escolher apenas os primeiros.
 const groups=[...buckets].sort((a,b)=>a[0].localeCompare(b[0],'pt-BR'))
  .map(([,rows])=>rows.sort((a,b)=>a.sku.localeCompare(b.sku)));
 const plan=[],lookup=new Map();
 let remaining=groups.reduce((count,group)=>count+group.length,0),cursor=0;
 while(remaining>0){
  for(const group of groups){
   if(cursor>=group.length)continue;
   const entry=group[cursor],key=normal(entry.query);
   if(!lookup.has(key)){
    const task={query:entry.query,skus:[entry.sku],category:entry.bucket};
    lookup.set(key,task);plan.push(task);
   }else lookup.get(key).skus.push(entry.sku);
   remaining--;
  }
  cursor++;
 }
 return plan;
}

// A página oficial do comprador usa "Em Destaque" (sortBy=sales).
// A API Afiliados é somente uma amostra, nunca o mesmo ranking da vitrine.
export function officialFeaturedSearchUrl(keyword){
 const term=String(keyword||'').trim().slice(0,100);
 const params=new URLSearchParams({keyword:term,page:'0',sortBy:'sales'});
 return 'https://shopee.com.br/search?'+params.toString();
}
const pretty=text=>String(text||'').replace(/\s+/g,' ').trim();
const meaningful=(input)=>words(input).filter(w=>w.length>2);
function verifiedKeywordEvidence(name,offers=[]){
 const allowed=new Set(meaningful(name));
 const counts=new Map(),names=new Map();
 for(const offer of offers){
  // Cada anúncio contribui uma única vez por expressão.
  const seq=meaningful(offer.productName).filter(x=>allowed.has(x));
  const phrases=new Set();
  for(let i=0;i<seq.length;i++){
   const w=seq[i];
   if(w.length>=4)phrases.add(w);
   if(i+1<seq.length&&seq[i+1]!==w)
    phrases.add(w+' '+seq[i+1]);
  }
  for(const term of phrases){
   counts.set(term,(counts.get(term)||0)+1);
   if(!names.has(term))names.set(term,term);
  }
 }
 const base=meaningful(name);
 const options=[...counts.entries()].sort((a,b)=>
   b[1]-a[1]||b[0].split(' ').length-a[0].split(' ').length||a[0].localeCompare(b[0]));
 const chosen=[],seen=new Set();
 const add=(term,count)=>{
  if(!term||seen.has(term))return;
  seen.add(term);
  chosen.push({term,mentions:count,source:count?
   'títulos de ofertas comparáveis (não é volume de busca)':
   'termo da ficha WeDrop; demanda não aferida',
   searchUrl:officialFeaturedSearchUrl(term)});
 };
 for(const [term,count] of options){
  if(term.split(' ').length<2)continue;
  add(term,count);
  if(chosen.length>=5)break;
 }
 for(const [term,count] of options){
  if(chosen.length>=5)break;
  add(term,count);
 }
 if(chosen.length<5){
  for(let i=0;i<base.length&&chosen.length<5;i++){
   add(base[i],0);
   if(i+1<base.length)add(base[i]+' '+base[i+1],0);
  }
 }
 return chosen.slice(0,5);
}
export function seoTitleFromEvidence(productName,keywords=[],sku=''){
 // Somente fatos do produto WeDrop podem compor o título. Reordena termos
 // com evidência em anúncios comparáveis sem duplicá-los deliberadamente.
 const skuEsc=String(sku||'').replace(/[^A-Za-z0-9]/g,'\\$&');
 let name=pretty(productName).replace(/\bSKU\s*[:#-]?\s*[A-Z0-9.-]+/gi,'');
 if(skuEsc)name=name.replace(new RegExp('\\b'+skuEsc+'\\b','gi'),' ').trim();
 name=name.replace(/\bKIT-[A-Z0-9-]+\b/gi,'').replace(/\s+/g,' ').trim();
 if(!name)return '';
 const best=keywords.find(x=>x.mentions>0&&x.term.includes(' ')&&
  normal(name).includes(x.term));
 if(best){
  const regex=new RegExp(best.term.split(/\s+/).join('\\s+'),'i');
  const match=regex.exec(name);
  if(match&&match.index>0){
   name=[match[0],name.slice(0,match.index),name.slice(match.index+match[0].length)]
    .map(x=>x.trim()).filter(Boolean).join(' ').replace(/\s+/g,' ');
  }
 }
 let title=name;
 for(const entry of keywords){
  const term=String(entry.term||'').trim();
  const confirmedWords=new Set(meaningful(name));
  if(!meaningful(term).every(word=>confirmedWords.has(word)))continue;
  if(entry.mentions<=0||!term.includes(' ')||normal(title).includes(term))continue;
  if(title.length+term.length+4>117)continue;
  title+=' | '+term;
  if(title.split(' | ').length>2)break;
 }
 if(title.length>117){
  title=title.slice(0,117).replace(/\s+\S*$/,'').replace(/[;,| ]+$/,'').trim();
 }
 if(title.length<=117)title+=' ✨';
 return title.slice(0,120);
}

function addMarketAnalysis(row,offers,checkedAt,ownShopId='0'){
 const compare=evaluateMarketOffers({
  title:row.name,offers,ownShopId,ownItemId:'0',queriedAt:checkedAt});
 const keywords=verifiedKeywordEvidence(row.name,offers);
 const strong=compare.verified===true&&Number(compare.count)>=2;
 return {...row,
  avgCompetitorPrice:strong?compare.average:null,
  competitorOfferCount:strong?compare.count:compare.count,
  competitorOffers:compare.sample.map(o=>({
   title:o.title,shopId:o.shopId,itemId:o.itemId,
   price:o.price,url:o.url,checkedAt:o.checkedAt})),
  priceEvidence:strong?
   'Média aritmética de '+compare.count+' anúncios comparáveis de lojas diferentes':
   'Média indisponível: menos de 2 lojas independentes comparáveis nesta amostra',
  keywords,
  seoTitle:seoTitleFromEvidence(row.name,keywords,row.sku),
  seoMethod:'Termos recorrentes em títulos de anúncios equivalentes; sem medição oficial de buscas',
  featuredSearchUrl:officialFeaturedSearchUrl(row.name.split(/[,|-]/)[0]||row.name)
 };
}

export function matchCurveOffers({catalog=[],offers=[],costs=[],baseline=new Map(),today=new Date().toISOString().slice(0,10),ownShopId='0'}={}){
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
 const found=new Map(),offersBySku=new Map();
 for(const offer of offers){
  if(!validId(offer.itemId)||!validId(offer.shopId)||
    String(offer.shopId)===String(ownShopId)||
    !String(offer.productName||'').trim()||intSales(offer.sales)===null)continue;
  const tokens=words(offer.productName),hits=new Map();
  for(const token of tokens)for(const item of index.get(token)||[])
   hits.set(item.sku,{item,count:(hits.get(item.sku)?.count||0)+1});
  const short=[...hits.values()].filter(x=>x.count>=2).sort((a,b)=>b.count-a.count).slice(0,110);
  for(const entry of short){
   const p=entry.item;
   // Nunca confundir produtos que apenas compartilham tema/marca/cor.
   // A categoria comercial principal precisa existir em ambos os nomes
   // (ex.: lancheira nao pode herdar vendas de um estojo T-Rex).
   const primary=p.tokens[0];
   if(primary&&!tokens.includes(primary))continue;
   if(!comparableTitle(p.name,offer.productName))continue;
   const common=entry.count;
   const score=common/Math.max(1,Math.min(p.tokens.length,tokens.length));
   if(score<0.62||common<Math.min(3,p.tokens.length))continue;
   if(!offersBySku.has(p.sku))offersBySku.set(p.sku,new Map());
   const unique=String(offer.shopId)+':'+String(offer.itemId);
   offersBySku.get(p.sku).set(unique,offer);
   const current=found.get(p.sku);
   const sales=intSales(offer.sales),price=num(offer.priceMin);
   const monthly=intSales(offer.monthlySold);
   const history=baseline instanceof Map?baseline.get(String(offer.itemId)):null;
   let sales30=monthly,observedDays=null,periodSource=monthly!==null?
    'Shopee Em Destaque • campo sold (Vendido/Mês)':'';
   if(monthly===null&&history&&intSales(history.sales)!==null&&sales>=history.sales){
    const age=Math.floor((Date.parse(today+'T00:00:00Z')-
     Date.parse(String(history.day)+'T00:00:00Z'))/86400000);
    if(age>=29&&age<=31){
     sales30=sales-history.sales;observedDays=age;
     periodSource='Diferença de contadores acumulados em '+age+' dias';
    }
   }
   const rankVolume=sales30??sales;
   const currentVolume=current?(current.sales30??current.salesDisplayed):null;
   if(current&&(Number(current.verified30)>Number(sales30!==null)||
    (Number(current.verified30)===Number(sales30!==null)&&
    (currentVolume>rankVolume||
     currentVolume===rankVolume&&current.matchScore>=score))))continue;
   const group=curveGroup(sales30,sales);
   found.set(p.sku,{sku:p.sku,name:p.name,category:p.category,
    imageUrl:p.imageUrl,availability:p.availability,inStock:p.inStock,
    cost:costIndex.get(p.sku)??null,competitorName:String(offer.productName).slice(0,200),
    shopId:String(offer.shopId),itemId:String(offer.itemId),
    competitorUrl:'https://shopee.com.br/product/'+offer.shopId+'/'+offer.itemId,
    competitorPrice:price,salesDisplayed:sales,sales30,observedDays,
    periodSource,curve:group.curve,
    curveLabel:sales30!==null&&monthly!==null?
     'Curva '+group.curve+' • Vendido/Mês informado pela vitrine Shopee':group.label,
    verified30:group.verified30,
    matchScore:Number(score.toFixed(2)),source:offer.dataSource||'Shopee Affiliate productOfferV2',
    sourceFile:p.sourceFile});
  }
 }
 const checkedAt=today+'T12:00:00.000Z';
 return [...found.values()].map(row=>{
  // Várias ofertas independentes com volume mensal são necessárias para
  // validar a oportunidade. Não somar as vendas das diferentes lojas.
  const comparable=[...(offersBySku.get(row.sku)||new Map()).values()];
  const independent=new Map();
  for(const offer of comparable){
   const monthly=intSales(offer.monthlySold);
   if(monthly===null)continue;
   const key=String(offer.shopId),prior=independent.get(key);
   if(!prior||monthly>prior.monthlySold)independent.set(key,{
    shopId:key,itemId:String(offer.itemId),title:String(offer.productName||'').slice(0,210),
    price:num(offer.priceMin),monthlySold:monthly,source:offer.dataSource||'',
    url:'https://shopee.com.br/product/'+offer.shopId+'/'+offer.itemId});
  }
  const monthlyCompetitors=[...independent.values()].sort((a,b)=>b.monthlySold-a.monthlySold);
  return {...addMarketAnalysis(row,comparable,checkedAt,ownShopId),
   monthlyCompetitorCount:monthlyCompetitors.length,
   monthlyCompetitors:monthlyCompetitors.slice(0,5),
   comparableCompetitorCount:new Set(comparable.map(o=>String(o.shopId))).size};
 }).sort((a,b)=>
  Number(b.verified30)-Number(a.verified30)||
  Number(b.inStock)-Number(a.inStock)||
  (b.sales30??b.salesDisplayed)-(a.sales30??a.salesDisplayed)||b.matchScore-a.matchScore||
  a.sku.localeCompare(b.sku));
}
export function pickCurveResults(rows,{curve='ALL',limit=10,verifiedOnly=false}={}){
 if(![5,10,15,20].includes(Number(limit)))throw Error('Escolha 5, 10, 15 ou 20 produtos.');
 const choice=String(curve).toUpperCase();
 if(!['ALL','A','B'].includes(choice))throw Error('Filtro de curva inválido.');
 const accepted=rows.filter(x=>
  (x.verified30&&(x.curve==='A'||x.curve==='B')&&(choice==='ALL'||x.curve===choice))||
  (!verifiedOnly&&choice==='ALL'&&!x.verified30&&x.curve==='PENDING'));
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
  if(validId(offer.itemId)&&intSales(offer.sales)!==null&&
    (offer.dataSource!=='shopee-featured-public'||intSales(offer.historicalSold)!==null))
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
// A Shopee pode desabilitar o acesso público sem aviso. Não contornar
// autenticação, CAPTCHA, 403 ou limitação; usar a fonte de Afiliados se
// houver credenciais próprias e distinguir métricas acumuladas de mensais.
const featuredCircuit={state:'unknown',lastChecked:0,reason:''};
const affiliateConfigured=()=>Boolean(env('SHOPEE_AFFILIATE_APP_ID')&&env('SHOPEE_AFFILIATE_SECRET'));
// Registro seguro no log de implantação: somente conectividade configurada, nunca credenciais.
console.info('[Curvas A/B] API Afiliados '+(affiliateConfigured()?'configurada':'não configurada')+'; leitura pública Em Destaque habilitada com respeito a bloqueios.');
export function curveProvidersStatus(){
 return {featured:{state:featuredCircuit.state,
  checkedAt:featuredCircuit.lastChecked?new Date(featuredCircuit.lastChecked).toISOString():null,
  reason:featuredCircuit.reason},
  affiliate:{configured:affiliateConfigured()},
  monthlyPolicy:'Somente sold da vitrine ou histórico observado em 29 a 31 dias'};
}
export async function probeCurveAffiliateAccess(){
 if(!affiliateConfigured())return {status:'unconfigured',returnedOffers:0,
  message:'API de Afiliados não configurada no Render (SHOPEE_AFFILIATE_APP_ID e SHOPEE_AFFILIATE_SECRET).'};
 try{
  const result=await signedRequest('coqueteleira',1,2);
  return {status:'accessible',returnedOffers:result.length,
   message:result.length?'API Afiliados respondeu com ofertas.':'API Afiliados respondeu, mas sem ofertas para a pesquisa de teste.'};
 }catch(error){
  return {status:'error',returnedOffers:0,
   message:'API Afiliados não respondeu corretamente: '+String(error.message||error).slice(0,170)};
 }
}
async function offersQuery(keyword,page){
 const expiry=featuredCircuit.state==='blocked'?20*60*1000:90*1000;
 const shouldProbe=featuredCircuit.state==='unknown'||
  featuredCircuit.state==='available'||
  Date.now()-featuredCircuit.lastChecked>expiry;
 let reason='';
 if(shouldProbe){
  const result=await searchFeaturedPublic(keyword);
  featuredCircuit.lastChecked=Date.now();
  featuredCircuit.state=result.ok?'available':result.blocked?'blocked':'unavailable';
  featuredCircuit.reason=result.error||'';
  if(result.ok)return {offers:result.offers,source:'shopee-featured-public'};
  reason=result.error||'Fonte pública não retornou dados.';
 }
 if(!affiliateConfigured())
  throw Error('Sem fonte automática acessível. Vitrine: '+
   (featuredCircuit.reason||reason||'indisponível')+
   '. Configure as credenciais da API Shopee Afiliados para a busca alternativa.');
 try{
  return {offers:await signedRequest(keyword,page,2),source:'shopee-affiliate'};
 }catch(err){
  if(/rate.limit|limit exceeded|signature|unauthorized|forbidden|credential/i.test(String(err.message)))
   throw err;
  return {offers:await signedRequest(keyword,page,0),source:'shopee-affiliate'};
 }
}
async function fetchOffers(terms){
 // Uma verificação inicial da vitrine antes de distribuir consultas evita
 // dezenas de solicitações repetidas quando a Shopee limita acessos públicos.
 const tasks=[...new Set(terms.map(x=>String(x||'').trim()).filter(Boolean))];
 const offers=[],errors=[],queried=[],sources={featured:0,affiliate:0};
 let cursor=0,limited=false;
 const collect=(term,result)=>{
  queried.push(term);
  offers.push(...result.offers.map(x=>result.source==='shopee-affiliate'?
   {...x,dataSource:'shopee-affiliate'}:x));
  if(result.source==='shopee-featured-public')sources.featured++;
  else sources.affiliate++;
 };
 if(tasks.length){
  cursor=1;
  try{collect(tasks[0],await offersQuery(tasks[0],1));}
  catch(error){
   const message=String(error.message||error).slice(0,360);
   errors.push(tasks[0]+': '+message);
   if(/sem fonte|rate.limit|limit exceeded|too many|429|unauthorized|forbidden|credential|signature/i.test(message.toLowerCase()))
    limited=true;
  }
 }
 if(!limited)await Promise.all(Array.from({length:3},async()=>{
  while(cursor<tasks.length&&!limited){
   const term=tasks[cursor++];
   try{collect(term,await offersQuery(term,1));}
   catch(error){
    const detail=String(error.message||error).slice(0,360);
    errors.push(term+': '+detail);
    if(/sem fonte|rate.limit|limit exceeded|too many|429|unauthorized|forbidden|credential|signature/i.test(detail.toLowerCase()))
     limited=true;
   }
  }
 }));
 const unique=new Map();
 for(const item of offers){
  if(!validId(item.itemId)||!validId(item.shopId))continue;
  const key=String(item.shopId)+':'+String(item.itemId);
  const old=unique.get(key);
  if(!old||(intSales(item.monthlySold)!==null&&intSales(old.monthlySold)===null))
   unique.set(key,item);
 }
 return {offers:[...unique.values()],queries:queried,errors:errors.slice(0,10),
  attempted:cursor,limited,sources};
}

const cache=new Map();
const CURVE_SCAN_BATCH_SIZE=8;
const CURVE_SCAN_MAX_QUERIES=32;
const CURVE_SCAN_MAX_MS=55000;
const CURVE_CACHE_MS=30*60*1000;
async function prepareCurveCatalog(shopId,{category,keyword}){
 const [catalog,costs]=await Promise.all([
  readWeDropCatalogProducts(shopId),readWeDropCosts(shopId)]);
 const term=normal(keyword);
 const filtered=catalog.filter(row=>
  categoryMatches(String(row.product_data?.category||''),category)&&
  (!term||normal(String(row.product_data?.name||'')).includes(term)));
 const plan=curveSkuSearchPlan(filtered,{keyword});
 return {catalog:filtered,costs,plan,cursor:0,offers:new Map(),
  baseline:await readBaselines(shopId,saoPauloDay()).catch(()=>new Map()),
  errors:[],queries:0,successfulQueries:0,limited:false,
  sources:{featured:0,affiliate:0},scannedSkus:new Set(),
  checkedAt:null,recordedOffers:0,matches:[]};
}
async function advanceCurveCatalog(shopId,state,{desired,curve,verifiedOnly}){
 const started=Date.now(),newOffers=[];
 let performed=0;
 while(state.cursor<state.plan.length&&!state.limited&&
       performed<CURVE_SCAN_MAX_QUERIES&&Date.now()-started<CURVE_SCAN_MAX_MS){
  const jobs=state.plan.slice(state.cursor,
   state.cursor+Math.min(CURVE_SCAN_BATCH_SIZE,CURVE_SCAN_MAX_QUERIES-performed));
  if(!jobs.length)break;
  const result=await fetchOffers(jobs.map(x=>x.query));
  const used=Math.max(0,Math.min(jobs.length,result.attempted));
  if(!used)break;
  for(const job of jobs.slice(0,used))for(const sku of job.skus)
   state.scannedSkus.add(sku);
  state.cursor+=used;performed+=used;
  state.queries+=used;state.successfulQueries+=result.queries.length;
  state.errors.push(...result.errors);
  state.errors=state.errors.slice(-12);
  state.sources.featured+=result.sources.featured;
  state.sources.affiliate+=result.sources.affiliate;
  for(const offer of result.offers){
   const id=String(offer.shopId)+':'+String(offer.itemId);
   const previous=state.offers.get(id);
   if(!previous)newOffers.push(offer);
   if(!previous||(intSales(offer.monthlySold)!==null&&
      intSales(previous.monthlySold)===null))state.offers.set(id,offer);
  }
  state.checkedAt=new Date().toISOString();
  state.matches=matchCurveOffers({
   catalog:state.catalog,offers:[...state.offers.values()],costs:state.costs,
   baseline:state.baseline,today:saoPauloDay(),ownShopId:shopId});
  if(result.limited){state.limited=true;break;}
  if(pickCurveResults(state.matches,{limit:desired,curve,verifiedOnly}).items.length>=desired)break;
 }
 if(newOffers.length){
  const n=await saveObservations(shopId,saoPauloDay(),newOffers).catch(()=>null);
  if(n===null)state.recordedOffers=null;
  else if(state.recordedOffers!==null)state.recordedOffers+=n;
 }
 if(!state.checkedAt)state.checkedAt=new Date().toISOString();
}
export async function researchCurveAB(shopId,{
 limit=10,curve='ALL',category='Todos',keyword='',refresh=false,advance=false,verifiedOnly=true
}={}){
 const desired=Number(limit),chosen=String(curve||'ALL').toUpperCase();
 if(![5,10,15,20].includes(desired)||!['ALL','A','B'].includes(chosen))
  throw Error('Seleção de quantidade ou curva inválida.');
 const term=String(keyword||'').trim(),selectedCategory=String(category||'Todos').trim();
 if(selectedCategory.length>90)throw Error('Categoria inválida.');
 if(term.length>70)throw Error('Pesquisa muito longa (máximo 70 caracteres).');

 const key=String(shopId)+'|'+normal(selectedCategory)+'|'+normal(term);
 let holder=cache.get(key);
 if(refresh||!holder||Date.now()-holder.at>CURVE_CACHE_MS){
  holder={at:Date.now(),ready:prepareCurveCatalog(shopId,{
   category:selectedCategory,keyword:term}),active:null};
  cache.set(key,holder);
  while(cache.size>18)cache.delete(cache.keys().next().value);
 }
 let state;
 try{state=await holder.ready;}
 catch(error){cache.delete(key);throw error;}
 const current=pickCurveResults(state.matches,{limit:desired,curve:chosen,verifiedOnly});
 const shouldSearch=Boolean((advance||current.items.length<desired)&&
  state.cursor<state.plan.length&&!state.limited);
 if(shouldSearch){
  if(!holder.active)holder.active=advanceCurveCatalog(shopId,state,{
   desired,curve:chosen,verifiedOnly}).finally(()=>{holder.active=null;});
  await holder.active;
 }else if(holder.active)await holder.active;
 const selected=pickCurveResults(state.matches,{limit:desired,curve:chosen,verifiedOnly});
 const hasMore=state.cursor<state.plan.length&&!state.limited;
 const notes=[
  'Pesquisa parte do catálogo WeDrop, inclusive SKUs ainda não anunciadas na sua loja; cruza produtos equivalentes com concorrentes da Shopee, priorizando a busca pública Em Destaque.',
  'Curva A: 900 ou mais vendas em 30 dias; Curva B: 700 a 899. A API de Afiliados informa vendas acumuladas e não pode confirmar curva mensal sozinha.',
  verifiedOnly&&state.matches.some(x=>!x.verified30)&&!selected.items.length?'Foram encontrados concorrentes equivalentes, mas faltam vendas mensais. Exibimos candidatos pendentes com SKU WeDrop, sem inventar Curva A/B.':'',
  selected.shortage?'Encontradas '+selected.items.length+' das '+desired+
    ' SKUs solicitadas com classificação comprovada. Sem dados mensais não é possível confirmar curva.':'',
  hasMore?'A busca pausou no limite seguro de chamadas. Use Continuar varredura para pesquisar mais SKUs sem repetir consultas anteriores.':'',
  state.limited?'A API de ofertas interrompeu a pesquisa por limite de requisições ou autorização. Confira o diagnóstico antes de repetir.':'',
  state.recordedOffers===null?'Não foi possível registrar observações para a apuração de 30 dias.':'',
  state.successfulQueries===0?'Nenhuma fonte automática retornou ofertas. Verifique diagnóstico: '+(state.errors[0]||'busca sem resultados'):'',
  state.sources.featured?'Vendas mensais obtidas da busca pública Shopee para parte dos resultados.':'',
  state.errors.length?'Consultas que falharam: '+state.errors.slice(0,2).join(' | '):''
 ].filter(Boolean);
 const pending=state.matches.filter(x=>!x.verified30&&x.curve==='PENDING');
  return {ok:true,configured:state.successfulQueries>0,verifiedOnly,
   possibleMatches:state.matches.length,pendingCount:pending.length,
   pendingItems:pending.slice(0,desired),
  sources:state.sources,providers:curveProvidersStatus(),
  curve:chosen,category:selectedCategory,
  ...selected,catalogCount:state.catalog.length,offerCount:state.offers.size,
  skuSearchesCompleted:state.scannedSkus.size,
  skuQueriesPlanned:state.plan.length,
  skuQueriesCompleted:state.cursor,
  remainingSkuQueries:Math.max(0,state.plan.length-state.cursor),
  queryCount:state.queries,successfulQueries:state.successfulQueries,
  hasMore,nextCursor:state.cursor,
  apiLimited:state.limited,
  checkedAt:state.checkedAt,recordedOffers:state.recordedOffers,
  rowsWith30Days:selected.items.filter(x=>x.verified30).length,
  featuredSearchUrl:officialFeaturedSearchUrl(term||(selectedCategory==='Todos'?'':selectedCategory)),
  warning:notes.join(' '),searchMode:'wedrop-first-featured-competitor-monthly',
  readOnly:true,marketplaceUpdated:false};
}
