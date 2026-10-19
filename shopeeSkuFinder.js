// Recupera SKUs ausentes do cache consultando somente endpoints de LEITURA Shopee.
// Nunca presume igualdade por título ou SKU parcial. Persistência limitada ao catálogo Supabase Shopee.
import {validItemId,normalizeCatalogItem,normalizeShopeeModels,fetchCatalogPage} from './catalog.js';
import {storeCatalogItems,storeCatalogModels} from './catalogStore.js';

function uniqueItemIds(values){
  const ids=new Set();
  for(const v of Array.isArray(values)?values:[]){
    try{ids.add(validItemId(typeof v==='object'?(v?.item_id??v?.itemId):v));}catch{}
  }
  return [...ids].slice(0,100);
}
const sameSku=(a,b)=>String(a??'').trim()===b;

export async function findLiveShopeeSku(cfg,auth,callApi,sku,{maxPages=12,maxModels=80,fastOnly=false,
  saveItems=storeCatalogItems,saveModels=storeCatalogModels,pageFetcher=fetchCatalogPage}={}){
  sku=String(sku??'').trim();
  if(!sku||sku.length>120||/[\x00-\x1F]/.test(sku))
    throw Error('Informe um SKU válido da Shopee.');
  const common={accessToken:auth.accessToken,shopId:auth.shopId};
  const matches=new Map(),checked=new Set(),variantIds=[];
  const failures=[];
  const remember=(base,model=null)=>{
    const id=validItemId(base.item_id);
    const mid=model?String(model.modelId):'0';
    const code=model?model.sku:String(base.item_sku||'');
    if(!sameSku(code,sku))return false;
    matches.set(id+':'+mid,{
      itemId:id,modelId:mid,sku,
      title:String(base.item_name||'Produto Shopee'),
      imageUrl:String(base.image?.image_url_list?.[0]||''),
      status:String(base.item_status||''),
      source:model?'shopee_model_live':'shopee_item_live'
    });
    return true;
  };
  const enrich=async(ids)=>{
    for(let i=0;i<ids.length;i+=50){
      const data=await callApi(cfg,{...common,path:'/api/v2/product/get_item_base_info',
        query:{item_id_list:ids.slice(i,i+50).join(',')}});
      const items=data?.response?.item_list;
      if(!Array.isArray(items))throw Error('A Shopee não retornou os detalhes para verificar o SKU.');
      for(const base of items){
        let id;
        try{id=validItemId(base.item_id)}catch{continue}
        if(checked.has(id))continue;
        checked.add(id);
        const normalized=normalizeCatalogItem({item_id:id,item_status:base.item_status},base);
        await saveItems(auth.shopId,[normalized]);
        remember(base);
        if(base.has_model)variantIds.push({id,base});
      }
    }
  };
  // search_item suporta item_sku; usa o endpoint direcionado antes de percorrer páginas.
  try{
    const response=await callApi(cfg,{...common,path:'/api/v2/product/search_item',
      query:{item_sku:sku,offset:0,page_size:100}});
    const body=response?.response||{};
    const ids=uniqueItemIds(body.item_id_list||body.item_list||body.item||[]);
    if(ids.length)await enrich(ids);
  }catch(error){
    failures.push('Pesquisa direcionada Shopee indisponível: '+String(error.message||error).slice(0,160));
  }
  // Para SKU de variação, validar o modelo real (nunca usar o pai como variação).
  async function inspectVariants(limit){
    for(const row of variantIds.splice(0,limit)){
      try{
        const data=await callApi(cfg,{...common,path:'/api/v2/product/get_model_list',
          query:{item_id:row.id}});
        const models=normalizeShopeeModels(data);
        await saveModels(auth.shopId,row.id,models);
        for(const model of models)remember(row.base,model);
        if(matches.size)return;
      }catch(e){failures.push('Variação do anúncio '+row.id+': '+String(e.message||e).slice(0,120))}
    }
  }
  if(!matches.size&&variantIds.length)await inspectVariants(Math.min(variantIds.length,maxModels));
  if(matches.size)return {matches:[...matches.values()],source:'live_search',warnings:failures};
  // Avoid expensive full catalog/model scans during automatic SKU lookup.
  if(fastOnly)return {matches:[],source:'fast_not_found',warnings:failures,incomplete:true};

  // Cache pode estar incompleto (sincronização parcial). Varrer produtos oficiais
  // paginados; cada página de 100 inclui dados base, sem alterar anúncio.
  let pages=0,scanned=0;
  const statuses=['NORMAL','UNLIST','REVIEWING'];
  for(const status of statuses){
    let offset=0;
    while(pages<maxPages){
      let page;
      try{page=await pageFetcher(cfg,auth,callApi,{status,offset,pageSize:100})}
      catch(e){failures.push('Listagem '+status+': '+String(e.message||e).slice(0,150));break}
      pages++;
      const items=page.items||[];
      scanned+=items.length;
      if(items.length)await saveItems(auth.shopId,items);
      const matched=items.filter(x=>sameSku(x.sku,sku));
      for(const item of matched){
        matches.set(String(item.itemId)+':0',{
          itemId:String(item.itemId),modelId:'0',sku,title:item.title,
          imageUrl:item.imageUrl||'',status:item.status||'',source:'shopee_catalog_refresh'
        });
      }
      for(const item of items){
        const id=String(item.itemId||'');
        if(item.hasModel&&!checked.has(id)){
          checked.add(id);
          variantIds.push({id,base:{
            item_id:id,item_name:item.title,item_status:item.status,
            item_sku:item.sku,image:{image_url_list:item.imageUrl?[item.imageUrl]:[]}
          }});
        }
      }
      if(matches.size)break;
      if(!page.hasNext)break;
      if(!Number.isSafeInteger(page.nextOffset)||page.nextOffset<=offset)
        throw Error('Paginação do catálogo Shopee não avançou.');
      offset=page.nextOffset;
    }
    if(matches.size||pages>=maxPages)break;
  }
  if(!matches.size&&variantIds.length){
    const candidates=variantIds.length;
    await inspectVariants(Math.min(maxModels,candidates));
    if(candidates>maxModels)failures.push('A pesquisa de variações foi limitada para evitar excesso de chamadas à Shopee.');
  }
  return {matches:[...matches.values()],source:matches.size?'live_catalog_refresh':'not_found',
    scanned,warnings:failures,
    incomplete:pages>=maxPages||variantIds.length>0};
}
