// Read-only Shopee product views by Item ID. The Open Platform only gives
// general page views, not organic-only impressions, visitors, clicks or carts.
// Period differences below represent observed sample intervals, never official
// Seller Center daily/weekly historical statistics.
import {validItemId} from './catalog.js';
const TABLE='shopee_product_view_samples';
const MAX_ITEMS=5000;
const safeCount=x=>x!==null&&x!==undefined&&x!==''&&Number.isSafeInteger(Number(x))&&Number(x)>=0?Number(x):null;
function dbCfg(){
 const url=String(process.env.SUPABASE_URL||'').replace(/\/$/,'');
 const key=String(process.env.SUPABASE_SECRET_KEY||process.env.SUPABASE_SERVICE_ROLE_KEY||'').trim();
 if(!url||!key)throw Error('Banco não configurado para registrar visualizações da Shopee.');
 const headers={apikey:key,Accept:'application/json','Content-Type':'application/json'};
 if(/^eyJ[A-Za-z0-9_-]*\./.test(key))headers.Authorization='Bearer '+key;
 return {url,headers};
}
function shop(id){
 const n=Number(id);
 if(!Number.isSafeInteger(n)||n<=0)throw Error('ID da loja inválido.');
 return n;
}
async function rest(params,{method='GET',payload,prefer}={}){
 const {url,headers}=dbCfg();
 const response=await fetch(url+'/rest/v1/'+TABLE+params,{
  method,headers:{...headers,...(prefer?{Prefer:prefer}:{})},
  ...(payload!==undefined?{body:JSON.stringify(payload)}:{}),
  signal:AbortSignal.timeout(25000)
 });
 if(!response.ok)throw Error('Histórico de visualizações indisponível HTTP '+response.status+
  ': '+(await response.text().catch(()=>'' )).slice(0,120));
 return method==='GET'?response.json():null;
}
export function saoPauloDay(date=new Date()){
 const parts=new Intl.DateTimeFormat('en-CA',{timeZone:'America/Sao_Paulo',
  year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(date);
 const lookup=Object.fromEntries(parts.map(p=>[p.type,p.value]));
 return [lookup.year,lookup.month,lookup.day].join('-');
}
const isoDay=x=>/^\d{4}-\d{2}-\d{2}$/.test(String(x||''))&&
 !Number.isNaN(Date.parse(x+'T00:00:00Z'));
const advance=(value,days)=>new Date(Date.parse(value+'T00:00:00Z')+days*86400000)
 .toISOString().slice(0,10);
export function parseViewsWindow({period='7',start='',end=''}={},today=saoPauloDay()){
 if(!isoDay(today))throw Error('Dia de referência inválido.');
 let a,b=String(today);
 if(period==='today')a=b;
 else if(period==='7')a=advance(b,-6);
 else if(period==='30')a=advance(b,-29);
 else if(period==='day'||period==='custom'){
  a=String(start);b=period==='day'?a:String(end);
  if(!isoDay(a)||!isoDay(b)||a>b||b>today||a<advance(today,-89))
   throw Error('Selecione datas válidas dentro dos últimos 90 dias.');
 }else throw Error('Período inválido: use hoje, dia específico, 7 dias, 30 dias ou personalizado.');
 return {start:a,end:b,period,days:Math.round((Date.parse(b)-Date.parse(a))/86400000)+1};
}
export function normalizeExtraItem(row){
 const itemId=validItemId(row?.item_id);
 const views=safeCount(row.views);
 if(views===null)throw Error('Shopee não retornou views para Item ID '+itemId+'.');
 return {itemId,views,sale:safeCount(row.sale),likes:safeCount(row.likes)};
}
export async function scanLiveShopViews({cfg,auth,callApi,now=new Date()}){
 let offset=0,total=null,loops=0;
 const output=new Map();
 while(++loops<=150){
  const result=await callApi(cfg,{
   path:'/api/v2/product/get_item_list',
   accessToken:auth.accessToken,shopId:auth.shopId,
   query:{item_status:'NORMAL',offset,page_size:50}
  });
  const body=result?.response||{};
  const count=safeCount(body.total_count);
  if(count===null||count>MAX_ITEMS||(total!==null&&count!==total))
   throw Error('Listagem da Shopee inconsistente ou acima do limite de '+MAX_ITEMS+' anúncios.');
  total=count;
  const listing=Array.isArray(body.item)?body.item:
   Array.isArray(body.item_list)?body.item_list:null;
  if(!listing&&!(count===0&&offset===0))
   throw Error('Shopee não retornou os Item IDs da página '+offset+'.');
  const items=listing||[];
  if(!items.length&&offset<count)
   throw Error('A Shopee interrompeu a paginação antes do fim.');
  const ids=items.map(x=>validItemId(x.item_id));
  if(new Set(ids).size!==ids.length||ids.some(id=>output.has(id)))
   throw Error('IDs duplicados na varredura da Shopee.');
  for(let i=0;i<ids.length;i+=50){
   const batch=ids.slice(i,i+50);
   const joined=batch.join(',');
   const [extra,base]=await Promise.all([
    callApi(cfg,{path:'/api/v2/product/get_item_extra_info',
     accessToken:auth.accessToken,shopId:auth.shopId,query:{item_id_list:joined}}),
    callApi(cfg,{path:'/api/v2/product/get_item_base_info',
     accessToken:auth.accessToken,shopId:auth.shopId,query:{item_id_list:joined}})
   ]);
   const extraList=extra?.response?.item_list,baseList=base?.response?.item_list;
   if(!Array.isArray(extraList)||!Array.isArray(baseList))
    throw Error('Shopee não retornou métricas e dados completos de '+joined+'.');
   const extraMap=new Map(extraList.map(x=>[validItemId(x.item_id),normalizeExtraItem(x)]));
   const baseMap=new Map(baseList.map(x=>[validItemId(x.item_id),x]));
   for(const id of batch){
    const metrics=extraMap.get(id),info=baseMap.get(id);
    if(!metrics||!info)throw Error('Informações incompletas para Item ID '+id+'.');
    const image=info.image?.image_url_list?.[0]||info.image?.image_url||'';
    output.set(id,{...metrics,sku:String(info.item_sku||'').slice(0,120),
     title:String(info.item_name||'').slice(0,240),
     imageUrl:/^https:\/\//i.test(String(image))?String(image):'',
     status:String(info.item_status||'NORMAL')});
   }
  }
  const next=Number.isSafeInteger(Number(body.next_offset))&&Number(body.next_offset)>offset?
   Number(body.next_offset):offset+items.length;
  if(next>total||next<=offset&&items.length)throw Error('Paginação não avançou corretamente.');
  offset=next;
  if(!body.has_next_page&&offset===total)break;
  if(offset===total)break;
 }
 if(output.size!==total)throw Error('A Shopee informou '+total+
  ' anúncios, mas somente '+output.size+' retornaram dados. Nada foi gravado.');
 return {items:[...output.values()],total,observedAt:now.toISOString(),day:saoPauloDay(now),
  source:'product.get_item_extra_info',scope:'general_views_including_possible_ads'};
}
export async function listViewSamples(shopId,{start,end}){
 const all=[];
 for(let offset=0;offset<25000;offset+=1000){
  const params='?shop_id=eq.'+shop(shopId)+
   '&observed_day=gte.'+encodeURIComponent(start)+
   '&observed_day=lte.'+encodeURIComponent(end)+
   '&select=item_id,observed_day,first_seen_at,last_seen_at,first_views,last_views,sku,title,image_url,item_status,last_sale,last_likes'+
   '&order=item_id.asc,observed_day.asc&limit=1000&offset='+offset;
  const page=await rest(params);
  if(!Array.isArray(page))throw Error('O banco não retornou amostras válidas.');
  all.push(...page);
  if(page.length<1000)return all;
 }
 throw Error('Mais de 25 mil amostras; ajuste a paginação antes de consultar.');
}
export async function saveViewsScan(shopId,scan){
 if(!scan?.items||scan.items.length!==scan.total||
  !/^\d{4}-\d{2}-\d{2}$/.test(scan.day))
  throw Error('Só é permitido salvar uma leitura completa da Shopee.');
 const id=shop(shopId),current=await listViewSamples(id,{start:scan.day,end:scan.day});
 const prev=new Map(current.map(x=>[String(x.item_id),x]));
 const rows=scan.items.map(item=>{
  const old=prev.get(item.itemId);
  const initial=old&&Date.parse(old.first_seen_at)<=Date.parse(scan.observedAt);
  return {shop_id:id,item_id:Number(item.itemId),observed_day:scan.day,
   first_seen_at:initial?old.first_seen_at:scan.observedAt,
   last_seen_at:scan.observedAt,
   first_views:initial?Number(old.first_views):item.views,
   last_views:item.views,sku:item.sku,title:item.title,image_url:item.imageUrl,
   item_status:item.status,last_sale:item.sale,last_likes:item.likes};
 });
 for(let i=0;i<rows.length;i+=150)
  await rest('?on_conflict=shop_id,item_id,observed_day',{method:'POST',
   payload:rows.slice(i,i+150),prefer:'resolution=merge-duplicates,return=minimal'});
 return {saved:rows.length,observedAt:scan.observedAt,day:scan.day};
}
export function rankObservedViews(samples,window,{limit=10}={}){
 const groups=new Map();
 for(const row of samples||[]){
  const id=String(row.item_id);
  if(!groups.has(id))groups.set(id,[]);
  groups.get(id).push(row);
 }
 const ranked=[];
 for(const [id,rows] of groups){
  rows.sort((a,b)=>a.first_seen_at.localeCompare(b.first_seen_at));
  const first=rows[0],latest=rows[rows.length-1];
  const startViews=safeCount(first.first_views);
  const endViews=safeCount(latest.last_views);
  const firstAt=String(first.first_seen_at),lastAt=String(latest.last_seen_at);
  // Require two independent measurements. Never claim delta 0 when one
  // historic cumulative reading is all that is available.
  const enough=Date.parse(lastAt)>Date.parse(firstAt)&&
   startViews!==null&&endViews!==null&&endViews>=startViews;
  const observedViews=enough?endViews-startViews:null;
  ranked.push({
   itemId:id,sku:latest.sku||first.sku||'',title:latest.title||first.title||'',
   imageUrl:latest.image_url||first.image_url||'',
   viewsObserved:observedViews,latestTotalViews:endViews,
   salesTotal:safeCount(latest.last_sale),likesTotal:safeCount(latest.last_likes),
   observedFrom:firstAt,observedTo:lastAt,
   coverage:enough?'observed_partial':'insufficient_samples',
   source:'shopee_general_product_page_views',
   // No guaranteed per-SKU attribution when listing has multiple models.
   attribution:'item_id',impressions:null,visits:null,clicks:null,ctr:null,
   cartAdded:null,cartPending:null,cartAbandonmentRate:null
  });
 }
 ranked.sort((a,b)=>
  (b.viewsObserved??-1)-(a.viewsObserved??-1)||
  (b.latestTotalViews??-1)-(a.latestTotalViews??-1)||
  a.itemId.localeCompare(b.itemId));
 return {list:ranked.slice(0,limit),totalProducts:ranked.length,
  withPeriodDelta:ranked.filter(x=>x.viewsObserved!==null).length,
  window,precision:'sampled_partial_not_full_period',
  warning:'Contagem geral por Item ID, inclusive tráfego potencialmente pago. A Shopee não fornece período neste endpoint. A diferença é observada apenas entre amostras gravadas, não representa todo o dia/7/30 dias e não fornece impressões, visitantes únicos, CTR ou carrinhos.'};
}
