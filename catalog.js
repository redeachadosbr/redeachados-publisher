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
  const prices=Array.isArray(obj?.price_info)?obj.price_info:[];
  for(const x of prices){
    const v=safeNonnegative(x.current_price);
    if(v!==null)return v;
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
    promotion:Boolean(baseItem?.has_promotion),
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
  const entries=Array.isArray(body.item)?body.item:Array.isArray(body.item_list)?body.item_list:null;
  if(!entries)throw Error('Resposta inesperada da listagem Shopee: não há itens.');
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
  const hasNext=Boolean(body.has_next_page);
  const nextOffset=Number(body.next_offset);
  const calculated=Number.isSafeInteger(nextOffset)&&nextOffset>at?nextOffset:at+entries.length;
  if(hasNext&&calculated<=at)throw Error('Paginação Shopee não avançou.');
  return {
    status,items,
    hasNext,
    nextOffset:hasNext?calculated:null,
    totalCount:safeNonnegative(body.total_count),
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
