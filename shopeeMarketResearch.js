// Market sample: Shopee Brasil Affiliate productOfferV2, not the seller API.
// Never invent competitor prices or call a static discount "researched".
// Query covers ONLY affiliate-eligible offers; sample is not entire marketplace.
import crypto from 'node:crypto';
import {REDE_ACHADOS_MARKET_RULES,marketMatrixSearchQueries,marketMatrixFamilyCompatible,
 marketMatrixProfile} from './shopeeMatrixRules.js';

const endpoint='https://open-api.affiliate.shopee.com.br/graphql';
// API Shopee Afiliados retorna erro 11001 se limit superar 50.
export const SHOPEE_OFFER_PAGE_LIMIT=REDE_ACHADOS_MARKET_RULES.apiPageLimit;
const env=n=>String(process.env[n]||'').trim();
export const marketResearchConfigured=()=>Boolean(env('SHOPEE_AFFILIATE_APP_ID')&&
 env('SHOPEE_AFFILIATE_SECRET'));
const normalize=t=>String(t||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'')
 .toLowerCase().replace(/[^a-z0-9 ]+/g,' ').replace(/\s+/g,' ')
 // 10kg, 10 KG e 10 kg identificam a MESMA capacidade.
 .replace(/\b(\d{1,5})\s+(kg|g|ml)\b/g,'$1$2').trim();
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
 const withoutDecimalMeters=String(title||'').replace(/\b\d{1,2}[,.]\d{1,2}\s*m\b/gi,' ');
 const words=normalize(withoutDecimalMeters).split(' ').filter(w=>w.length>2&&!stops.has(w));
 const unique=[...new Set(words)].filter(w=>!/^(\d+|ml|cm)$/.test(w)).slice(0,4);
 const cap=capacity(title);
 return [...unique,cap?cap+' litros':''].filter(Boolean).join(' ').slice(0,100);
}
export function marketSearchQueries(title){
 return marketMatrixSearchQueries(title,marketSearchKeywords(title));
}
// Características essenciais das variações não podem ser misturadas
// só porque os anúncios têm palavras parecidas (ex. 900ml vs 750ml).
// Materiais e formatos devem corresponder à PEÇA principal, não só à palavra
// "inox". Ex.: cabo inox com suporte plástico NÃO equivale a suporte inox.
export function bathroomBrushVariantCompatible(source,candidate){
 const a=normalize(source),b=normalize(candidate);
 const brush=/\bescova\b.*\bsanitari[ao]\b/;
 if(!brush.test(a)||!brush.test(b))return true;
 const inox=/\binox\b/;
 const plastic=/\b(plastico|polipropileno|pvc|acrilico)\b/;
 const holder=/(?:suporte|base|porta escova|recipiente|copo|portaescova)/;
 const holderMaterial=(text,material)=>{
  const pattern=material==='inox'?'inox':'(?:plastico|polipropileno|pvc|acrilico)';
  return new RegExp('(?:'+holder.source+')\\s+(?:de\\s+)?'+pattern+'\\b|\\b'+
   pattern+'\\s+(?:'+holder.source+')\\b').test(text);
 };
 const handleOnlyInox=/\b(?:cabo|haste)\s+(?:de\s+)?inox\b/.test(b);
 const sourceInoxHolder=holderMaterial(a,'inox')||
  (inox.test(a)&&!holderMaterial(a,'plastic')&&!/\b(?:cabo|haste)\s+(?:de\s+)?inox\b/.test(a));
 const sourcePlasticHolder=holderMaterial(a,'plastic')||
  (plastic.test(a)&&!inox.test(a));
 const candidateInoxHolder=holderMaterial(b,'inox');
 const candidatePlasticHolder=holderMaterial(b,'plastic');
 if(sourceInoxHolder&&(candidatePlasticHolder||handleOnlyInox&&!candidateInoxHolder))
  return false;
 if(sourcePlasticHolder&&candidateInoxHolder)return false;
 // Geometrias opostas não pertencem ao mesmo modelo, mesmo se o metal
 // e as palavras "escova sanitária" coincidirem.
 const shape=text=>{
  if(/\b(esferic[ao]|esfera|bola|globo|globular)\b/.test(text))return 'sphere';
  if(/\b(cilindric[ao]|cilindro|tubular)\b/.test(text))return 'cylinder';
  if(/\b(quadrad[ao]|retangular)\b/.test(text))return 'angular';
  return null;
 };
 const sa=shape(a),sb=shape(b);
 if(sa&&sb&&sa!==sb)return false;
 return true;
}
const comparableSpecs=(source,candidate)=>{
 const sn=normalize(source),cn=normalize(candidate);
 if(!bathroomBrushVariantCompatible(source,candidate))return false;
 // Não comparar motor elétrico com utensílio manual mesmo que compartilhem
 // "mini processador de alimentos". Isso evita preço e lucro fantasiosos.
 const manual=/\b(manual|manivela|puxador|corda|cordao|puxar)\b/;
 const powered=/\b(eletric[oa]|eletronico|motor(?:izado)?|usb|recarregavel|bateria|pilhas?|bivolt|watts?)\b|\b\d{1,4}\s*w\b/;
 if(manual.test(sn)&&powered.test(cn))return false;
 if(powered.test(sn)&&manual.test(cn)&&!powered.test(cn))return false;
 const cap=txt=>{
  const m=normalize(txt).match(/\b(\d{1,5})\s*(ml|mililitros|litros|litro|l)\b/);
  return m?Number(m[1])*(m[2]==='ml'||m[2]==='mililitros'?1:1000):null;
 };
 const integer=(txt,re)=>{
  const m=normalize(txt).match(re);
  return m?Number(m[1]):null;
 };
 const metric=(txt,re)=>{
  const m=String(txt||'').replace(',','.').toLowerCase().match(re);
  return m?Number(m[1]):null;
 };
 const specs=[
  [cap(source),cap(candidate)],
  [integer(source,/\b(\d{2,4})\s*w\b/),integer(candidate,/\b(\d{2,4})\s*w\b/) ],
  [integer(source,/\b(110|127|220|240)\s*v\b/),integer(candidate,/\b(110|127|220|240)\s*v\b/) ],
  [integer(source,/\b(\d{1,4})\s*(?:pecas|pcs|pçs|itens)\b/),
   integer(candidate,/\b(\d{1,4})\s*(?:pecas|pcs|pçs|itens)\b/) ],
  [integer(source,/\b(\d)\s*(?:andares|andar|niveis|nivel)\b/),
   integer(candidate,/\b(\d)\s*(?:andares|andar|niveis|nivel)\b/) ],
  [integer(source,/\b(\d{2,4})\s*galhos\b/),integer(candidate,/\b(\d{2,4})\s*galhos\b/) ],
  [metric(source,/\b(\d(?:\.\d{1,2})?)\s*m(?:etros?)?\b/),
   metric(candidate,/\b(\d(?:\.\d{1,2})?)\s*m(?:etros?)?\b/)]
 ];
 if(specs.some(([a,b])=>a!==null&&(b===null||Math.abs(a-b)>0.01)))return false;
 // Mesmo sem especificação numérica, materiais e formatos incompatíveis importam.
 if(/\binox\b/.test(sn)&&/\bplastico\b/.test(cn)&&!/\binox\b/.test(cn))return false;
 // "Escova plástica" não é o mesmo modelo que "escova com cabo inox e
 // suporte plástico". O acabamento predominante da SKU precisa corresponder.
 if(/\bplastico\b/.test(sn)&&!/\binox\b/.test(sn)&&/\binox\b/.test(cn))return false;
 const size=dimension(source),otherSize=dimension(candidate);
 if(size&&otherSize&&size!==otherSize)return false;
 return true;
};
// Em balanças de cozinha de 10 kg, reconhecer títulos curtos equivalentes,
// sem confundir balanças corporais, de bagagem ou versões de 5 kg.
export function kitchenScaleVariantCompatible(source,candidate){
 const src=normalize(source),dst=normalize(candidate);
 if(!/\bbalanca\b/.test(src)||!/\bcozinha\b/.test(src)||!/\b10kg\b/.test(src))
  return null;
 if(!/\bbalanca\b/.test(dst)||!/\b10kg\b/.test(dst))return false;
 if(!/\b(digital|eletronica|cozinha|precisao|culinaria|alimentos|confeitaria)\b/.test(dst))
  return false;
 if(/\b(corporal|banheiro|pessoas?|industrial|comercial|plataforma|gancho|pesca|bagagem|malas?)\b/.test(dst))
  return false;
 const weights=[...dst.matchAll(/\b(\d{1,3})kg\b/g)].map(match=>Number(match[1]));
 if(weights.some(weight=>weight!==10))return false;
 return true;
}
export function comparableTitle(source,candidate){
 if(!source||!candidate)return false;
 const src=wordset(source),dst=wordset(candidate);
 const sourceText=normalize(source),candidateText=normalize(candidate);
 const family=marketMatrixFamilyCompatible(source,candidate);
 if(family===false)return false;
 if(!comparableSpecs(source,candidate))return false;
 const accessories=/\b(capa|inflador|bomba|adesivo|reparo|conserto|borda|filtro|somente|pecas avulsas|acessorio avulso|refil|reposicao)\b/;
 if(accessories.test(candidateText)&&!accessories.test(sourceText))return false;
 const kitchenScale=kitchenScaleVariantCompatible(source,candidate);
 if(kitchenScale!==null)return kitchenScale;
 if(marketMatrixProfile(source).family==='mochila_construtor'&&
    /\b(profissional|pedreiro|eletricista|lona|impermeavel|oxford)\b/.test(candidateText))return false;
 if(family===true)return true;
 // SKU de qualquer categoria nova: duas palavras do nome-base coincidentes.
 // Apenas uma palavra comum não autoriza chamar produtos diferentes de iguais.
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
export const MARKET_COMPARISON_MIN=REDE_ACHADOS_MARKET_RULES.minimumOffers;
export const MARKET_COMPARISON_MAX=REDE_ACHADOS_MARKET_RULES.maximumOffers;
// Amostra observada de 2 até 5 anúncios diferentes, não estimativa de demanda.
export function evaluateMarketOffers({title,offers=[],ownItemId,ownShopId,
 queriedAt=new Date().toISOString(),minOffers=MARKET_COMPARISON_MIN,
 maxOffers=MARKET_COMPARISON_MAX,allowSameShop=false,strictPriceCluster=false,
 priceClusterRatio=1.45}){
 const minimumCount=Number.isInteger(minOffers)&&minOffers>=2&&minOffers<=5?minOffers:MARKET_COMPARISON_MIN;
 const maximumCount=Number.isInteger(maxOffers)&&maxOffers>=minimumCount&&maxOffers<=10?maxOffers:MARKET_COMPARISON_MAX;
 const comparable=[],seen=new Set();
 for(const offer of offers){
  const shop=String(offer.shopId||'').trim(),id=String(offer.itemId||'').trim();
  const key=shop+':'+id;
  if(!/^\d{1,18}$/.test(shop)||!/^\d{1,18}$/.test(id)||
     seen.has(key)||shop===String(ownShopId)||id===String(ownItemId))continue;
  seen.add(key);
  if(!comparableTitle(title,offer.productName))continue;
  const min=asPrice(offer.priceMin),max=asPrice(offer.priceMax);
  if(min===null||max===null||max<min||max>min*REDE_ACHADOS_MARKET_RULES.maxVariantPriceRatio)continue;
  const targetWords=wordset(title),candidateWords=wordset(offer.productName);
  const overlap=[...targetWords].filter(x=>candidateWords.has(x)).length;
  const similarity=overlap/Math.max(1,targetWords.size);
  comparable.push({title:String(offer.productName).slice(0,180),shopId:shop,
   itemId:id,price:min,url:'https://shopee.com.br/product/'+shop+'/'+id,
   checkedAt:queriedAt,similarity:Number(similarity.toFixed(3))});
 }
 if(comparable.length<minimumCount)return {verified:false,reference:null,average:null,
  count:comparable.length,sample:comparable.slice(0,maximumCount),
  reason:'Menos de '+minimumCount+' anúncios comparáveis encontrados para esta SKU.'};
 const center=median(comparable.map(x=>x.price));
 // Em Curvas, tratar anúncios como grupos de produtos equivalentes também
 // pelo patamar de preços. Um anúncio de R$ 25 e outro de R$ 150 NÃO
 // comprovam a mesma média, mesmo se tiverem títulos semelhantes.
 let filtered;
 if(strictPriceCluster){
  const ordered=[...comparable].sort((a,b)=>a.price-b.price);
  // Padrão 45%; Curvas só permite tolerância distinta para família confirmada.
  const ratio=Number.isFinite(priceClusterRatio)&&priceClusterRatio>=1.2&&
   priceClusterRatio<=1.8?priceClusterRatio:1.45;
  let groups=[];
  for(let i=0;i<ordered.length;i++){
   let end=i;
   while(end+1<ordered.length&&
    ordered[end+1].price<=ordered[i].price*ratio)end++;
   const items=ordered.slice(i,end+1);
   const signature=items.map(x=>x.shopId+':'+x.itemId).join('|');
   if(!groups.some(g=>g.signature===signature))
    groups.push({items,signature,center:median(items.map(x=>x.price))});
  }
  groups.sort((a,b)=>b.items.length-a.items.length||
   b.items.reduce((n,x)=>n+x.similarity,0)-
    a.items.reduce((n,x)=>n+x.similarity,0));
  const best=groups[0];
  const alternate=groups.find(g=>g!==best&&g.items.length===best.items.length&&
   Math.max(g.center,best.center)/Math.min(g.center,best.center)>ratio);
  if(alternate||best.items.length<minimumCount){
   return {verified:false,reference:null,average:null,count:best.items.length,
    sample:best.items.slice(0,maximumCount),rejectedPriceOutliers:
     comparable.length-best.items.length,
    reason:alternate?'Há faixas de preços divergentes; falta identificar o mesmo modelo antes de calcular a média.':
     'Anúncios semelhantes com preços muito diferentes não formam uma amostra segura do mesmo produto.'};
  }
  filtered=best.items;
 }else{
  // Política padrão dos outros módulos de mercado permanece inalterada.
  filtered=comparable.filter(x=>
   x.price>=center*REDE_ACHADOS_MARKET_RULES.minimumPriceRatioToMedian&&
   x.price<=center*REDE_ACHADOS_MARKET_RULES.maximumPriceRatioToMedian);
 }
 filtered.sort((a,b)=>b.similarity-a.similarity||
  Math.abs(a.price-center)-Math.abs(b.price-center)||a.price-b.price);
 const shops=new Set(),selected=[];
 for(const offer of filtered){
  if(!allowSameShop&&shops.has(offer.shopId))continue;
  shops.add(offer.shopId);selected.push(offer);
  if(selected.length>=maximumCount)break;
 }
 if(selected.length<minimumCount)return {verified:false,reference:null,average:null,
  count:selected.length,sample:selected,
  reason:allowSameShop?'Não há pelo menos '+minimumCount+' anúncios distintos do mesmo produto com preços consistentes.':
   'Não há pelo menos '+minimumCount+' lojas diferentes com preços comparáveis consistentes.'};
 const average=Math.round(selected.reduce((total,o)=>total+o.price,0)/selected.length*100)/100;
 return {verified:true,reference:average,average,count:selected.length,
  sample:selected,method:'arithmetic_mean',minimumCount,
  maximumCount,rejectedPriceOutliers:comparable.length-filtered.length,
  reason:null};
}

const safeError=e=>String(e?.message||'Falha na consulta').slice(0,170);
async function lookupShopeeCompetitorsUncached({title,ownShopId,ownItemId}){
 const searchedAt=new Date().toISOString(),keywords=marketSearchKeywords(title);
 const queries=marketSearchQueries(title);
 const base={source:'shopee_affiliate_product_offers',searchTerms:keywords,
  searchedQueries:[],researchedAt:searchedAt,verified:false,reference:null,count:0,sample:[]};
 if(!queries.length)return {...base,status:'insufficient_product_description',
  message:'Título insuficiente para comparar produtos semelhantes.'};
 if(!marketResearchConfigured())return {...base,status:'provider_not_configured',
  message:'Pesquisa automática indisponível: credenciais da API de ofertas Shopee ainda não configuradas.'};
 const id=env('SHOPEE_AFFILIATE_APP_ID'),secret=env('SHOPEE_AFFILIATE_SECRET');
 const offers=[],searchedQueries=[],errors=[];
 let assessment=null;
 for(const term of queries){
  const query='{ productOfferV2(keyword:'+JSON.stringify(term)+
   ', listType:0, sortType:1, page:1, limit:'+SHOPEE_OFFER_PAGE_LIMIT+
   '){ nodes { itemId shopId productName priceMin priceMax } pageInfo{hasNextPage} } }';
  const payload=JSON.stringify({query}),now=String(Math.floor(Date.now()/1000));
  const signature=crypto.createHash('sha256').update(id+now+payload+secret).digest('hex');
  try{
   const response=await fetch(endpoint,{method:'POST',headers:{
    'Content-Type':'application/json',
    'Authorization':'SHA256 Credential='+id+', Timestamp='+now+', Signature='+signature},
    body:payload,signal:AbortSignal.timeout(8500)});
   if(!response.ok)throw Error('HTTP '+response.status);
   const result=await response.json();
   if(result?.errors?.length)throw Error(safeError(result.errors[0]));
   if(!Array.isArray(result?.data?.productOfferV2?.nodes))
    throw Error('Dados incompletos no retorno de ofertas');
   searchedQueries.push(term);
   offers.push(...result.data.productOfferV2.nodes);
   assessment=evaluateMarketOffers({title,offers,ownShopId,ownItemId,queriedAt:searchedAt});
   if(assessment.verified&&assessment.count>=MARKET_COMPARISON_MIN)break;
  }catch(error){
   errors.push(String(error.message||error).slice(0,145));
   if(/credential|signature|unauthorized|forbidden|auth|rate.limit|limite de requis/i.test(String(error.message||error)))break;
  }
 }
 assessment ||=evaluateMarketOffers({title,offers,ownShopId,ownItemId,queriedAt:searchedAt});
 const status=assessment.verified?'verified':searchedQueries.length?
  'insufficient_comparables':'provider_error';
 const message=assessment.verified?
  'Média aritmética de '+assessment.count+' anúncios semelhantes em lojas diferentes, consultados pela API Shopee Afiliados. A amostra não representa todo o mercado.':
  searchedQueries.length?
   'Foram consultadas '+searchedQueries.length+' buscas, mas só '+assessment.count+
   ' oferta(s) passaram pela verificação de comparabilidade. Veja as referências parciais e a busca ampliada; sem 2 anúncios válidos, não há média confiável.':
   'A API Shopee Afiliados não concluiu a pesquisa: '+errors.join(' | ').slice(0,180);
 return {...base,...assessment,status,message,searchedQueries,rawOfferCount:offers.length,errors:errors.slice(0,2)};
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
  const ttl=result.verified?10*60000:result.status==='insufficient_comparables'?60000:20000;
  marketCache.set(key,{promise:Promise.resolve(result),expiresAt:Date.now()+ttl});
  if(marketCache.size>180)marketCache.delete(marketCache.keys().next().value);
  return result;
 }catch(e){
  marketCache.delete(key);throw e;
 }
}
