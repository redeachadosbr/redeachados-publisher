// Leitura e normalização do catálogo Shopee sem alteração de anúncios.
const STATUSES=new Set(['NORMAL','UNLIST','BANNED','REVIEWING']);
export const CATALOG_STATUSES=[...STATUSES];
export function normalStatus(value){
  const status=String(value||'NORMAL').trim().toUpperCase();
  if(!STATUSES.has(status))throw Error('Status não permitido para consultar anúncios.');
  return status;
}
export function validItemId(value){
  const id=String(value||'').trim();
  if(!/^[1-9][0-9]{0,17}$/.test(id))throw Error('Item ID Shopee inválido.');
  return id;
}
export function safeNonnegative(value){
  if(value===null||value===undefined||value==='')return null;
  const n=Number(value);
  return Number.isFinite(n)&&n>=0?n:null;
}
function stockValue(obj){
  if(!obj||typeof obj!=='object')return null;
  const v2=obj.stock_info_v2?.summary_info;
  const candidates=[v2?.total_available_stock,v2?.total_stock,obj.stock_info_v2?.total_available_stock];
  for(const v of candidates){
    const n=safeNonnegative(v);if(n!==null)return n;
  }
  const all=Array.isArray(obj.stock_info)?obj.stock_info:[];
  if(all.length){
    const n=all.map(x=>safeNonnegative(x.normal_stock)).filter(x=>x!==null);
    if(n.length)return n.reduce((a,b)=>a+b,0);
  }
  return null;
}
function priceValue(obj){
  // current_price é o preço vigente; original_price pode ignorar descontos.
  const prices=Array.isArray(obj?.price_info)?obj.price_info:[];
  for(const x of prices){
    const v=safeNonnegative(x.current_price);
    if(v!==null&&v>0)return v;
  }
  return null;
}
function imageValue(obj){
  const url=obj?.image?.image_url_list?.[0]||obj?.image?.image_url||'';
  return typeof url==='string'&&/^https:\/\//i.test(url)?url:'';
}
export function normalizeCatalogItem(listItem,baseItem){
  const itemId=validItemId(listItem?.item_id||baseItem?.item_id);
  return {
    itemId,
    status:String(baseItem?.item_status||listItem?.item_status||'UNKNOWN'),
    title:String(baseItem?.item_name||'').trim(),
    sku:String(baseItem?.item_sku||'').trim(),
    imageUrl:imageValue(baseItem),
    hasModel:Boolean(baseItem?.has_model),
    price:priceValue(baseItem),
    stock:stockValue(baseItem),
    promotion:typeof baseItem?.has_promotion==='boolean'?baseItem.has_promotion:null,
    updateTime:safeNonnegative(baseItem?.update_time)||safeNonnegative(listItem?.update_time)||null,
    baseLoaded:Boolean(baseItem)
  };
}
export function normalizeShopeeModels(data){
  if(!Array.isArray(data?.response?.model))throw Error('Shopee não retornou lista válida de variações.');
  return data.response.model.map(x=>({
    modelId:String(x.model_id||''),
    sku:String(x.model_sku||'').trim(),
    status:String(x.model_status||''),
    price:priceValue(x),
    stock:stockValue(x)
  }));
}
// O preço de anúncios com variações é fornecido por get_model_list.
export function modelPriceRange(models){
 const prices=(Array.isArray(models)?models:[])
  .map(x=>safeNonnegative(x.price)).filter(x=>x!==null&&x>0);
 if(!prices.length)return null;
 return {price:Math.min(...prices),priceMax:Math.max(...prices),
  confirmedModels:prices.length,priceSource:'model_current_price'};
}
export async function enrichCatalogModelPrices(cfg,auth,callApi,items,{maxItems=12,concurrency=3}={}){
 const targets=items.filter(x=>x.baseLoaded&&x.hasModel&&x.price==null).slice(0,maxItems);
 const warnings=[];let cursor=0;
 await Promise.all(Array.from({length:Math.min(concurrency,targets.length)},async()=>{
  while(cursor<targets.length){
   const item=targets[cursor++];
   try{
    const data=await callApi(cfg,{path:'/api/v2/product/get_model_list',
     accessToken:auth.accessToken,shopId:auth.shopId,query:{item_id:item.itemId}});
    const range=modelPriceRange(normalizeShopeeModels(data));
    if(!range)throw Error('Nenhuma variação retornou current_price válido.');
    Object.assign(item,range);
   }catch(error){
    warnings.push('Item '+item.itemId+': preço das variações não confirmado: '+String(error.message||error).slice(0,110));
   }
  }
 }));
 return {items,warnings,checked:targets.length};
}
export async function fetchCatalogPrices(cfg,auth,callApi,itemIds){
 const ids=[...new Set(itemIds.map(validItemId))];
 if(!ids.length||ids.length>10)throw Error('Consulte de 1 a 10 anúncios por vez.');
 const data=await callApi(cfg,{path:'/api/v2/product/get_item_base_info',
  accessToken:auth.accessToken,shopId:auth.shopId,query:{item_id_list:ids.join(',')}});
 if(!Array.isArray(data?.response?.item_list))
  throw Error('A Shopee não confirmou os dados básicos dos anúncios.');
 const allowed=new Set(ids);
 const items=data.response.item_list.filter(x=>{
  try{return allowed.has(validItemId(x.item_id));}catch{return false;}
 }).map(x=>normalizeCatalogItem({item_id:x.item_id,item_status:x.item_status},x));
 const result=await enrichCatalogModelPrices(cfg,auth,callApi,items,{maxItems:10,concurrency:3});
 return {items,verified:items.filter(x=>Number.isFinite(x.price)&&x.price>0),
  missing:ids.filter(id=>!items.some(x=>x.itemId===id)),
  warnings:result.warnings,checked:ids.length};
}
export async function fetchCatalogPage(cfg,auth,callApi,{status='NORMAL',offset=0,pageSize=50}={}){
  status=normalStatus(status);
  const page=Math.min(100,Math.max(1,Number(pageSize)||50));
  const at=Number(offset);
  if(!Number.isSafeInteger(at)||at<0||at>100000)throw Error('Offset fora do limite permitido.');
  const listing=await callApi(cfg,{
    path:'/api/v2/product/get_item_list',
    accessToken:auth.accessToken,shopId:auth.shopId,
    query:{item_status:status,offset:at,page_size:page}
  });
  const body=listing?.response||{};
  // A API da Shopee pode omitir a propriedade item quando um status não
  // possui anúncios. Isso NÃO deve interromper a leitura dos demais status.
  // Ausência de itens com contagem positiva continua sendo erro bloqueante.
  const totalCount=safeNonnegative(body.total_count);
  const hasNext=Boolean(body.has_next_page);
  let entries=Array.isArray(body.item)?body.item:Array.isArray(body.item_list)?body.item_list:null;
  const isVerifiedEmpty=totalCount===0&&!hasNext&&at===0;
  if(entries===null){
    if(isVerifiedEmpty)entries=[];
    else throw Error('Listagem Shopee incompleta ('+status+', página '+at+
      '): campo de itens ausente, total '+(totalCount??'desconhecido')+
      ', próxima página '+hasNext+'. Nenhum envio fiscal autorizado.');
  }
  if(entries.length===0&&totalCount>at)
    throw Error('Listagem Shopee incompleta ('+status+', página '+at+
      '): nenhum anúncio retornado de '+totalCount+' esperados. Nenhum envio fiscal autorizado.');
  const unique=new Map();
  for(const row of entries){
    try{const id=validItemId(row.item_id);unique.set(id,row);}catch{}
  }
  const ids=[...unique.keys()];
  const enriched=new Map();
  const warnings=[];
  for(let i=0;i<ids.length;i+=50){
    try{
      const base=await callApi(cfg,{
        path:'/api/v2/product/get_item_base_info',
        accessToken:auth.accessToken,shopId:auth.shopId,
        query:{item_id_list:ids.slice(i,i+50).join(',')}
      });
      if(!Array.isArray(base?.response?.item_list))throw Error('Detalhes não retornados.');
      for(const item of base.response.item_list){
        try{enriched.set(validItemId(item.item_id),item);}catch{}
      }
    }catch(error){
      warnings.push('Não foi possível consultar nome, preço ou estoque de '+ids.slice(i,i+50).length+
        ' anúncios: '+String(error.message||error).slice(0,130));
    }
  }
  const items=ids.map(id=>normalizeCatalogItem(unique.get(id),enriched.get(id)));
  const prices=await enrichCatalogModelPrices(cfg,auth,callApi,items,{maxItems:12,concurrency:3});
  warnings.push(...prices.warnings);
  const nextOffset=Number(body.next_offset);
  const calculated=Number.isSafeInteger(nextOffset)&&nextOffset>at?nextOffset:at+entries.length;
  if(hasNext&&calculated<=at)throw Error('Paginação Shopee não avançou.');
  return {
    status,items,
    hasNext,
    nextOffset:hasNext?calculated:null,
    totalCount,
    warnings,
    enrichedCount:items.filter(x=>x.baseLoaded).length
  };
}
export function catalogSummary(items){
  const all=Array.isArray(items)?items:[];
  return {
    total:all.length,
    active:all.filter(x=>x.status==='NORMAL').length,
    unlisted:all.filter(x=>x.status==='UNLIST').length,
    banned:all.filter(x=>x.status==='BANNED').length,
    reviewing:all.filter(x=>x.status==='REVIEWING').length,
    withoutSku:all.filter(x=>!x.sku).length,
    stockUnknown:all.filter(x=>x.stock===null).length,
    outOfStock:all.filter(x=>x.stock===0).length,
    enriched:all.filter(x=>x.baseLoaded).length
  };
}
