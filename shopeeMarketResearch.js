// Market sample: Shopee Brasil Affiliate productOfferV2, not the seller API.
// Never invent competitor prices or call a static discount "researched".
// Query covers ONLY affiliate-eligible offers; sample is not entire marketplace.
import crypto from 'node:crypto';

const endpoint='https://open-api.affiliate.shopee.com.br/graphql';
// API Shopee Afiliados retorna erro 11001 se limit superar 50.
export const SHOPEE_OFFER_PAGE_LIMIT=50;
const env=n=>String(process.env[n]||'').trim();
export const marketResearchConfigured=()=>Boolean(env('SHOPEE_AFFILIATE_APP_ID')&&
 env('SHOPEE_AFFILIATE_SECRET'));
const normalize=t=>String(t||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'')
 .toLowerCase().replace(/[^a-z0-9 ]+/g,' ').replace(/\s+/g,' ').trim();
const stops=new Set(['de','do','da','dos','das','com','para','em','e','ou','a','o','na',
 'no','sem','cor','cores','azul','branco','preto','rosa','verde','top','rio','unidade',
 'litros','litro','litre','l','cm','ml','kit','produto','infantil','crianca','criancas',
 'original','promo','oferta','completo','super','acessorios','acessorio','novo','nova']);
const wordset=txt=>new Set(normalize(txt).split(' ').filter(s=>s.length>2&&!stops.has(s)));
const capacity=txt=>{
 const match=normalize(txt).match(/\b(\d{2,5})\s*(l|litros|litro)\b/);
 return match?Number(match[1]):null;
};
const dimension=txt=>{
 // Different sizes strongly imply another variant even with similar titles.
 const matches=normalize(txt).match(/\b\d{2,4}\s*(?:x|por)\s*\d{2,4}(?:\s*(?:x|por)\s*\d{1,4})?\s*cm?\b/g);
 return matches?.[0]||null;
};
const banned=/\b(capa|inflador|bomba|adesivo|reparo|conserto|tapete|borda|filtro|somente|pecas|suporte|acessorio)\b/;
export function marketSearchKeywords(title){
 const words=normalize(title).split(' ').filter(w=>w.length>2&&!stops.has(w));
 const unique=[...new Set(words)].filter(w=>!/^(\d+|ml|cm)$/.test(w)).slice(0,4);
 const cap=capacity(title);
 return [...unique,cap?cap+' litros':''].filter(Boolean).join(' ').slice(0,100);
}
export function marketSearchQueries(title){
 const exact=marketSearchKeywords(title),normalized=normalize(title);
 let variants=[];
 if(/\bmochila\b/.test(normalized)&&/\b(construtor|ferramentas|ferramenta|oficina)\b/.test(normalized)){
  variants=['mochila construtor ferramentas','mochila ferramentas brinquedo',
   'mochila bancada ferramentas infantil','maleta mochila ferramentas brinquedo'];
 }else{
  const words=exact.split(' ').filter(Boolean);
  variants=[words.slice(0,3).join(' '),words.slice(-3).join(' '),words.slice(0,2).join(' ')];
 }
 return [...new Set([exact,...variants].map(v=>v.trim()).filter(v=>v.split(' ').length>=2))].slice(0,5);
}
export function comparableTitle(source,candidate){
 const src=wordset(source),dst=wordset(candidate);
 const cap=capacity(source),other=capacity(candidate);
 if(cap!==null&&(other===null||cap!==other))return false;
 const size=dimension(source),size2=dimension(candidate);
 if(size&&size2&&size!==size2)return false;
 if(banned.test(normalize(candidate))&&!banned.test(normalize(source)))return false;
 const sourceText=normalize(source),candidateText=normalize(candidate);
 if(/\bmochila\b/.test(sourceText)&&/\b(construtor|ferramentas|ferramenta|oficina)\b/.test(sourceText)){
  if(!/\bmochila\b/.test(candidateText)||!/\b(construtor|ferramentas|ferramenta|oficina)\b/.test(candidateText))return false;
  if(/\b(profissional|pedreiro|eletricista|lona|impermeavel|oxford)\b/.test(candidateText))return false;
  if(!/\b(infantil|crianca|criancas|brinquedo|brinquedos|kids|construtor|oficina|3 em 1)\b/.test(candidateText))return false;
  return true;
 }
 const overlap=[...src].filter(w=>dst.has(w)).length;
 return overlap>=Math.max(2,Math.min(3,src.size));
}
const asPrice=raw=>{
 const n=Number(String(raw??'').replace(',','.'));
 return Number.isFinite(n)&&n>=1&&n<=100000?Math.round(n*100)/100:null;
};
const median=arr=>{
 const ordered=[...arr].sort((a,b)=>a-b);
 const middle=Math.floor(ordered.length/2);
 return ordered.length%2?ordered[middle]:(ordered[middle-1]+ordered[middle])/2;
};
export const MARKET_COMPARISON_MIN=2;
export const MARKET_COMPARISON_MAX=5;
// Amostra observada de 2 até 5 anúncios diferentes, não estimativa de demanda.
export function evaluateMarketOffers({title,offers=[],ownItemId,ownShopId,queriedAt=new Date().toISOString()}){
 const comparable=[],seen=new Set();
 for(const offer of offers){
  const shop=String(offer.shopId||'').trim(),id=String(offer.itemId||'').trim();
  const key=shop+':'+id;
  if(!/^\d{1,18}$/.test(shop)||!/^\d{1,18}$/.test(id)||
     seen.has(key)||shop===String(ownShopId)||id===String(ownItemId))continue;
  seen.add(key);
  if(!comparableTitle(title,offer.productName))continue;
  const min=asPrice(offer.priceMin),max=asPrice(offer.priceMax);
  if(min===null||max===null||max<min||max>min*1.3)continue;
  const targetWords=wordset(title),candidateWords=wordset(offer.productName);
  const overlap=[...targetWords].filter(x=>candidateWords.has(x)).length;
  const similarity=overlap/Math.max(1,targetWords.size);
  comparable.push({title:String(offer.productName).slice(0,180),shopId:shop,
   itemId:id,price:min,url:'https://shopee.com.br/product/'+shop+'/'+id,
   checkedAt:queriedAt,similarity:Number(similarity.toFixed(3))});
 }
 if(comparable.length<MARKET_COMPARISON_MIN)return {verified:false,reference:null,average:null,
  count:comparable.length,sample:comparable.slice(0,MARKET_COMPARISON_MAX),
  reason:'Menos de 2 anúncios comparáveis encontrados para esta SKU.'};
 const center=median(comparable.map(x=>x.price));
 // Evitar que anúncio de acessório ou preço promocional anômalo contamine a média.
 const filtered=comparable.filter(x=>x.price>=center*.65&&x.price<=center*1.55);
 filtered.sort((a,b)=>b.similarity-a.similarity||
  Math.abs(a.price-center)-Math.abs(b.price-center)||a.price-b.price);
 const shops=new Set(),selected=[];
 for(const offer of filtered){
  if(shops.has(offer.shopId))continue;
  shops.add(offer.shopId);selected.push(offer);
  if(selected.length>=MARKET_COMPARISON_MAX)break;
 }
 if(selected.length<MARKET_COMPARISON_MIN)return {verified:false,reference:null,average:null,
  count:selected.length,sample:selected,
  reason:'Não há pelo menos 2 lojas diferentes com preços comparáveis consistentes.'};
 const average=Math.round(selected.reduce((total,o)=>total+o.price,0)/selected.length*100)/100;
 return {verified:true,reference:average,average,count:selected.length,
  sample:selected,method:'arithmetic_mean',minimumCount:MARKET_COMPARISON_MIN,
  maximumCount:MARKET_COMPARISON_MAX,reason:null};
}

const safeError=e=>String(e?.message||'Falha na consulta').slice(0,170);
async function lookupShopeeCompetitorsUncached({title,ownShopId,ownItemId}){
 const searchedAt=new Date().toISOString(),keywords=marketSearchKeywords(title);
 const base={source:'shopee_affiliate_product_offers',searchTerms:keywords,
  researchedAt:searchedAt,verified:false,reference:null,count:0,sample:[]};
 if(!keywords||keywords.split(' ').length<2)return {...base,
  status:'insufficient_product_description',message:'Título insuficiente para comparar produtos semelhantes.'};
 if(!marketResearchConfigured())return {...base,status:'provider_not_configured',
  message:'Pesquisa automática indisponível: credenciais da API de ofertas Shopee ainda não configuradas.'};
 const id=env('SHOPEE_AFFILIATE_APP_ID'),secret=env('SHOPEE_AFFILIATE_SECRET');
 const query=`{ productOfferV2(keyword:${JSON.stringify(keywords)}, listType:0, sortType:1, page:1, limit:${SHOPEE_OFFER_PAGE_LIMIT}){ nodes { itemId shopId productName priceMin priceMax } pageInfo{hasNextPage} } }`;
 const payload=JSON.stringify({query});
 const now=String(Math.floor(Date.now()/1000));
 const signature=crypto.createHash('sha256').update(id+now+payload+secret).digest('hex');
 try{
  const response=await fetch(endpoint,{method:'POST',headers:{
   'Content-Type':'application/json','Authorization':`SHA256 Credential=${id}, Timestamp=${now}, Signature=${signature}`},
   body:payload,signal:AbortSignal.timeout(14000)});
  if(!response.ok)throw Error('Consulta de ofertas Shopee retornou HTTP '+response.status);
  const result=await response.json();
  if(result?.errors?.length)throw Error('API de ofertas indisponível: '+safeError(result.errors[0]));
  if(!Array.isArray(result?.data?.productOfferV2?.nodes))
   throw Error('API de ofertas retornou dados incompletos.');
  const assessment=evaluateMarketOffers({title,offers:result.data.productOfferV2.nodes,
   ownShopId,ownItemId,queriedAt:searchedAt});
  return {...base,...assessment,status:assessment.verified?'verified':'insufficient_comparables',
   message:assessment.verified?
    'Média aritmética de '+assessment.count+' anúncios comparáveis em lojas diferentes (ofertas da API de afiliados Shopee). Amostra parcial do mercado.':
    assessment.reason};
 }catch(e){return {...base,status:'provider_error',
  message:'Não foi possível pesquisar concorrentes: '+safeError(e)};}
}

// Reuse the same checked offer sample while the seller changes the margin
// slider; never repeatedly bill or rate-limit a public-offer API on each keypress.
// Bad/missing credentials are cached for only 45 seconds.
const marketCache=new Map();
export async function lookupShopeeCompetitors(input){
 const key=[String(input.ownShopId||''),String(input.ownItemId||''),normalize(input.title)].join('|');
 const old=marketCache.get(key),now=Date.now();
 if(old&&now<old.expiresAt)return old.promise;
 const promise=lookupShopeeCompetitorsUncached(input);
 marketCache.set(key,{promise,expiresAt:now+45000});
 try{
  const result=await promise;
  const ttl=result.verified?10*60000:result.status==='insufficient_comparables'?2*60000:45000;
  marketCache.set(key,{promise:Promise.resolve(result),expiresAt:Date.now()+ttl});
  if(marketCache.size>180)marketCache.delete(marketCache.keys().next().value);
  return result;
 }catch(e){
  marketCache.delete(key);throw e;
 }
}
