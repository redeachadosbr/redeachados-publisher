// Leitura publica da busca Shopee por vendas (Em Destaque).
// Não envia cookies, não usa proxy, não tenta contornar bloqueios ou CAPTCHA.
// É um endpoint não contratual da vitrine: ausência, 403 ou resposta
// incompleta exigem fallback e diagnóstico, NUNCA dados inventados.
const BASE='https://shopee.com.br';
const isId=value=>/^\d{1,18}$/.test(String(value??''));
const integer=value=>{
 if(value===undefined||value===null||value==='')return null;
 const n=Number(value);
 return Number.isSafeInteger(n)&&n>=0?n:null;
};
const clean=name=>String(name||'').replace(/\s+/g,' ').trim();
const rawMoney=value=>{
 if(value===undefined||value===null)return null;
 const n=Number(value);
 if(!Number.isFinite(n)||n<0)return null;
 // O search_items da vitrine representa preço em 1/100000 R$.
 const v=n/100000;
 return Number.isFinite(v)&&v>=0.1&&v<100000?Number(v.toFixed(2)):null;
};
export function featuredSearchUrl(keyword){
 const u=new URL('/api/v4/search/search_items',BASE);
 const params={
  by:'sales',keyword:String(keyword||'').slice(0,75),
  limit:'30',newest:'0',order:'desc',
  page_type:'search',scenario:'PAGE_GLOBAL_SEARCH',version:'2'
 };
 for(const [key,value] of Object.entries(params))u.searchParams.set(key,value);
 return u.toString();
}
export function parseFeaturedSearch(payload){
 const entries=payload?.data?.items||payload?.items;
 if(!Array.isArray(entries))throw Error('Shopee não forneceu itens de pesquisa estruturados.');
 const found=[],seen=new Set();
 for(const item of entries){
  const d=item?.item_basic||item?.item||item;
  if(!d||typeof d!=='object')continue;
  const id=d.itemid??d.item_id??item.itemid??item.item_id;
  const shop=d.shopid??d.shop_id??item.shopid??item.shop_id;
  const name=clean(d.name??item.name??d.productName);
  if(!isId(id)||!isId(shop)||!name)continue;
  const key=String(shop)+':'+String(id);
  if(seen.has(key))continue;seen.add(key);
  // Campo sold da vitrine é reportado como vendas do mês pelo cliente
  // Shopee, quando disponível. A API pode omiti-lo em acessos públicos.
  const monthly=integer(d.sold??d.monthly_sold);
  const historical=integer(d.historical_sold??d.sales);
  const volume=historical??monthly;
  if(volume===null)continue;
  const price=rawMoney(d.price??d.price_min);
  if(price===null)continue;
  found.push({
   itemId:String(id),shopId:String(shop),productName:name,
   sales:volume,monthlySold:monthly,historicalSold:historical,
   priceMin:price,priceMax:price,
   dataSource:'shopee-featured-public',soldSource:monthly!==null?
    'Vendido/Mês do campo sold exibido pela vitrine Shopee':
    'Vendas históricas, período não confirmado',
   featuredRank:found.length+1
  });
 }
 return found;
}
export async function searchFeaturedPublic(keyword,{
 fetchImpl=globalThis.fetch,timeoutMs=7500
}={}){
 const query=String(keyword||'').trim();
 if(query.length<2||query.length>75)throw Error('Termo inválido para Em Destaque.');
 try{
  const response=await fetchImpl(featuredSearchUrl(query),{
   method:'GET',headers:{Accept:'application/json'},redirect:'error',
   signal:AbortSignal.timeout(timeoutMs)
  });
  if(response.status===403||response.status===401||response.status===429)
   return {ok:false,blocked:true,status:response.status,offers:[],
    error:'A vitrine Shopee não autorizou leitura automática pública (HTTP '+response.status+').'};
  if(!response.ok)return {ok:false,blocked:false,status:response.status,offers:[],
   error:'Pesquisa da vitrine indisponível (HTTP '+response.status+').'};
  const type=String(response.headers?.get?.('content-type')||'');
  if(!/json/i.test(type))return {ok:false,blocked:true,status:response.status,offers:[],
   error:'A Shopee retornou uma página de verificação em vez de dados de pesquisa.'};
  const payload=await response.json();
  const offers=parseFeaturedSearch(payload);
  return {ok:offers.length>0,blocked:false,status:response.status,
   offers,error:offers.length?'':'Busca da vitrine não retornou ofertas legíveis. Pode ter omitido preços ou vendas mensais.'};
 }catch(error){
  return {ok:false,blocked:false,status:0,offers:[],
   error:'Não foi possível consultar a vitrine Shopee: '+String(error.message||error).slice(0,140)};
 }
}
