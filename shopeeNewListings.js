// Rede Achados BR: count shop listings by ORIGINAL Shopee item create_time.
// update_time is intentionally never used as a fallback: edits are not new ads.
// Counts include currently listed/unlisted/reviewing/banned items, not deleted items.
// Distinct item_id is one ad; models/variants do not inflate totals.
const STATUSES=Object.freeze(['NORMAL','UNLIST','BANNED']);
// Shopee get_item_list aceita filtros NORMAL, UNLIST e BANNED.
// REVIEWING pode aparecer como situação de um item, mas não é um filtro
// confiavelmente aceito em todas as lojas/versões e interrompia a consulta.
const ZONE='America/Sao_Paulo';
const MAX_PAGES_PER_STATUS=40; // 4,000 listings/status; fail explicitly above limit.
const PAGE_SIZE=100;
const MAX_ITEMS_PER_BASE=50;
const CACHE_MS=10*60*1000;
const transient=/rate.?limit|too.many|429|timeout|timed.?out|temporar|bad.gateway|503|502|504|frequency|throttl|network|socket|fetch.failed/i;
const wait=ms=>new Promise(resolve=>setTimeout(resolve,ms));
async function shopRead(callApi,cfg,params){
 for(let attempt=0;attempt<3;attempt++){
  try{return await callApi(cfg,params)}catch(error){
   const message=String(error?.message||error);
   if(!transient.test(message)||attempt===2)throw error;
   await wait(350*(attempt+1)*(attempt+1));
  }
 }
}

const cache=new Map();

const dateFormatter=new Intl.DateTimeFormat('en-US',{
 timeZone:ZONE,year:'numeric',month:'2-digit',day:'2-digit'
});
export function localDateKey(date){
 if(!(date instanceof Date)||!Number.isFinite(date.getTime()))return null;
 const parts=Object.fromEntries(dateFormatter.formatToParts(date)
  .filter(p=>['year','month','day'].includes(p.type)).map(p=>[p.type,p.value]));
 return parts.year+'-'+parts.month+'-'+parts.day;
}
const timestamp=t=>{
 const n=Number(t);
 return Number.isSafeInteger(n)&&n>1_000_000_000&&n<6_000_000_000?n:null;
};
const monthName=month=>new Intl.DateTimeFormat('pt-BR',{
 month:'short',timeZone:ZONE}).format(new Date(Date.UTC(2024,month-1,15)));
export function countCreatedListings(rows,now=new Date()){
 const current=localDateKey(now);
 if(!current)throw Error('Data local inválida.');
 const month=current.slice(0,7),year=current.slice(0,4);
 const byMonth=Array.from({length:12},(_,index)=>({
  key:year+'-'+String(index+1).padStart(2,'0'),
  label:monthName(index+1),count:0
 }));
 const days=new Map();
 let today=0,inMonth=0,inYear=0,known=0;
 const ids=new Set();
 for(const row of Array.isArray(rows)?rows:[]){
  const id=String(row?.item_id??row?.itemId??'');
  const time=timestamp(row?.create_time??row?.createTime);
  if(!/^\d{1,18}$/.test(id)||ids.has(id)||!time)continue;
  ids.add(id);
  known++;
  const key=localDateKey(new Date(time*1000));
  if(!key||key>current)continue;
  if(key===current)today++;
  if(key.startsWith(month))inMonth++;
  if(key.startsWith(year)){
   inYear++;
   byMonth[Number(key.slice(5,7))-1].count++;
  }
  days.set(key,(days.get(key)||0)+1);
 }
 const last7=Array.from({length:7},(_,index)=>{
  // Use UTC noon to calculate the previous local calendar days without DST drift.
  const localToday=new Date(current+'T12:00:00Z');
  localToday.setUTCDate(localToday.getUTCDate()-(6-index));
  const key=localToday.toISOString().slice(0,10);
  return {date:key,label:key.slice(8,10)+'/'+key.slice(5,7),count:days.get(key)||0};
 });
 return {today,month:inMonth,year:inYear,byMonth,last7,known,dayKey:current,
  monthKey:month,yearKey:year,timezone:ZONE};
}
export function validatePage(body,status,{offset=0}={}){
 // Com nenhum item, a Shopee pode omitir "item" ou retorná-lo null.
 // Essa resposta é válida APENAS se houver sinal explícito de página final
 // sem itens. Não transformar falha, resposta ausente ou página truncada em zero.
 if(!body||typeof body!=='object'||Array.isArray(body))
  throw Error('A Shopee não retornou uma resposta válida para os anúncios '+status+'.');
 const arr=Array.isArray(body.item)?body.item:
  Array.isArray(body.item_list)?body.item_list:null;
 const count=body.total_count===null||body.total_count===undefined
  ?null:Number(body.total_count);
 const hasNext=body.has_next_page;
 if(arr){
  if(offset===0&&arr.length===0&&Number.isFinite(count)&&count>0)
   throw Error('A listagem '+status+' informou '+count+' anúncios, mas nenhum item foi retornado.');
  return arr;
 }
 const noItems=body.item==null&&body.item_list==null;
 const confirmedEmpty=hasNext===false&&noItems&&
  (count===null||count===0);
 if(confirmedEmpty)return [];
 throw Error('A listagem de anúncios '+status+' veio incompleta (paginação ou total não confirmados).');
}
export async function getShopeeNewListingsSummary({cfg,auth,callApi,now=new Date()}){
 const id=Number(auth?.shopId);
 if(!Number.isSafeInteger(id)||id<=0)throw Error('Loja Shopee não identificada.');
 if(typeof callApi!=='function')throw Error('API Shopee indisponível.');
 const current=cache.get(id);
 if(current&&Date.now()<current.expiresAt&&current.localDay===localDateKey(now))
  return current.task;
 const task=(async()=>{
  const ids=new Set();
  for(const status of STATUSES){
   let offset=0,complete=false;
   for(let page=0;page<MAX_PAGES_PER_STATUS;page++){
    const data=await shopRead(callApi,cfg,{path:'/api/v2/product/get_item_list',
     accessToken:auth.accessToken,shopId:id,
     query:{item_status:status,offset,page_size:PAGE_SIZE}});
    const body=data?.response,items=validatePage(body,status,{offset});
    for(const row of items){
     const itemId=String(row?.item_id??'');
     if(/^\d{1,18}$/.test(itemId))ids.add(itemId);
    }
    if(!body.has_next_page){complete=true;break;}
    const next=Number(body.next_offset);
    const nextOffset=Number.isSafeInteger(next)&&next>offset?next:offset+items.length;
    if(nextOffset<=offset||items.length===0)
     throw Error('Paginação de anúncios da Shopee não avançou.');
    offset=nextOffset;
   }
   if(!complete)throw Error('A loja possui mais anúncios que o limite de consulta. O total não será estimado.');
  }
  const all=[...ids],rows=[];
  for(let i=0;i<all.length;i+=MAX_ITEMS_PER_BASE){
   const segment=all.slice(i,i+MAX_ITEMS_PER_BASE);
   const base=await shopRead(callApi,cfg,{path:'/api/v2/product/get_item_base_info',
    accessToken:auth.accessToken,shopId:id,
    query:{item_id_list:segment.join(',')}});
   const results=base?.response?.item_list;
   if(!Array.isArray(results))
    throw Error('A Shopee não retornou as datas de criação de todos os anúncios.');
   const found=new Map(results.map(x=>[String(x?.item_id??''),x]));
   for(const item of segment){
    const row=found.get(item);
    if(!row||!timestamp(row.create_time))
     throw Error('Falta a data original de criação de alguns anúncios. Não é possível confirmar a contagem.');
    rows.push({item_id:item,create_time:row.create_time});
   }
  }
  const totals=countCreatedListings(rows,now);
  return {ok:true,source:'shopee.product.get_item_base_info.create_time',
   scope:'Anúncios ainda presentes na loja (NORMAL, UNLIST e BANNED); exclui excluídos e outros estados não consultados.',
   shopId:String(id),checkedAt:new Date().toISOString(),totalItems:all.length,...totals};
 })();
 cache.set(id,{task,expiresAt:Date.now()+CACHE_MS,localDay:localDateKey(now)});
 try{return await task;}catch(e){cache.delete(id);throw e;}
}
export function clearShopeeNewListingsCache(shopId){cache.delete(Number(shopId));}
