// Market sample: Shopee Brasil Affiliate productOfferV2, not the seller API.
// Never invent competitor prices or call a static discount "researched".
// Query covers ONLY affiliate-eligible offers; sample is not entire marketplace.
import crypto from 'node:crypto';

const endpoint='https://open-api.affiliate.shopee.com.br/graphql';
const env=n=>String(process.env[n]||'').trim();
export const marketResearchConfigured=()=>Boolean(env('SHOPEE_AFFILIATE_APP_ID')&&
 env('SHOPEE_AFFILIATE_SECRET'));
const normalize=t=>String(t||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'')
 .toLowerCase().replace(/[^a-z0-9 ]+/g,' ').replace(/\s+/g,' ').trim();
const stops=new Set(['de','do','da','dos','das','com','para','em','e','ou','a','o','na',
 'no','sem','cor','cores','azul','branco','preto','rosa','verde','top','rio','unidade',
 'litros','litro','litre','l','cm','ml','kit','produto','infantil','crianca','criancas',
 'original','promo','oferta','completo']);
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
export function comparableTitle(source,candidate){
 const src=wordset(source),dst=wordset(candidate);
 const cap=capacity(source),other=capacity(candidate);
 if(cap!==null&&(other===null||cap!==other))return false;
 const size=dimension(source),size2=dimension(candidate);
 if(size&&size2&&size!==size2)return false;
 if(banned.test(normalize(candidate))&&!banned.test(normalize(source)))return false;
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
export function evaluateMarketOffers({title,offers=[],ownItemId,ownShopId,queriedAt=new Date().toISOString()}){
 const comparable=[],seen=new Set();
 for(const offer of offers){
  const shop=String(offer.shopId||'').trim(),id=String(offer.itemId||'').trim();
  const key=shop+':'+id;
  if(!shop||!id||seen.has(key)||shop===String(ownShopId)||id===String(ownItemId))continue;
  seen.add(key);
  if(!comparableTitle(title,offer.productName))continue;
  const min=asPrice(offer.priceMin),max=asPrice(offer.priceMax);
  if(min===null||max===null||max<min||max>min*1.3)continue; // variant ranges not reliably comparable
  comparable.push({title:String(offer.productName).slice(0,180),shopId:shop,
   itemId:id,price:min,url:'https://shopee.com.br/product/'+shop+'/'+id,
   checkedAt:queriedAt});
 }
 // Three different stores and tight spreads avoid distorted variant/sponsored prices.
 const uniqueShops=new Set(comparable.map(o=>o.shopId));
 if(comparable.length<3||uniqueShops.size<3)return {verified:false,reference:null,
  count:comparable.length,sample:comparable.slice(0,8),
  reason:'Menos de três ofertas equivalentes de lojas diferentes disponíveis para comparação.'};
 const initial=median(comparable.map(o=>o.price));
 const filtered=comparable.filter(o=>o.price>=initial*.65&&o.price<=initial*1.55);
 if(filtered.length<3||new Set(filtered.map(o=>o.shopId)).size<3)
  return {verified:false,reference:null,count:filtered.length,sample:filtered.slice(0,8),
   reason:'Preços encontrados muito divergentes; não há amostra consistente.'};
 const reference=Math.round(median(filtered.map(o=>o.price))*100)/100;
 return {verified:true,reference,count:filtered.length,
  sample:filtered.slice(0,12),reason:null};
}
const safeError=e=>String(e?.message||'Falha na consulta').slice(0,170);
export async function lookupShopeeCompetitors({title,ownShopId,ownItemId}){
 const searchedAt=new Date().toISOString(),keywords=marketSearchKeywords(title);
 const base={source:'shopee_affiliate_product_offers',searchTerms:keywords,
  researchedAt:searchedAt,verified:false,reference:null,count:0,sample:[]};
 if(!keywords||keywords.split(' ').length<2)return {...base,
  status:'insufficient_product_description',message:'Título insuficiente para comparar produtos semelhantes.'};
 if(!marketResearchConfigured())return {...base,status:'provider_not_configured',
  message:'Pesquisa automática indisponível: credenciais da API de ofertas Shopee ainda não configuradas.'};
 const id=env('SHOPEE_AFFILIATE_APP_ID'),secret=env('SHOPEE_AFFILIATE_SECRET');
 const query=`{ productOfferV2(keyword:${JSON.stringify(keywords)}, listType:0, sortType:1, page:1, limit:60){ nodes { itemId shopId productName priceMin priceMax } pageInfo{hasNextPage} } }`;
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
    'Referência de ofertas equivalentes da API de afiliados Shopee; amostra não representa todo o mercado.':
    assessment.reason};
 }catch(e){return {...base,status:'provider_error',
  message:'Não foi possível pesquisar concorrentes: '+safeError(e)};}
}
