// Armazenamento de custos WeDrop exclusivo da loja Shopee, com acesso service-role.
function envText(k){return String(process.env[k]||'').trim();}
function credentials(){
  const url=envText('SUPABASE_URL').replace(/\/$/,'');
  const key=envText('SUPABASE_SECRET_KEY')||envText('SUPABASE_SERVICE_ROLE_KEY');
  if(!url||!key)throw Error('Supabase não configurado para custos WeDrop.');
  return {url,key};
}
function validShopId(value){
  const id=Number(value);
  if(!Number.isSafeInteger(id)||id<=0)throw Error('Shop ID inválido.');
  return id;
}
async function request(table,query='',{method='GET',rows,prefer}={}){
  const cfg=credentials();
  const headers={apikey:cfg.key,Accept:'application/json','Content-Type':'application/json'};
  if(/^eyJ[A-Za-z0-9_-]*\./.test(cfg.key))headers.Authorization='Bearer '+cfg.key;
  if(prefer)headers.Prefer=prefer;
  const response=await fetch(cfg.url+'/rest/v1/'+table+query,{
    method,headers,...(rows!==undefined?{body:JSON.stringify(rows)}:{}),
    signal:AbortSignal.timeout(16000)
  });
  if(!response.ok)throw Error('Supabase custos HTTP '+response.status+'.');
  if(method==='GET'||prefer?.includes('return=representation')){
    const json=await response.json();
    if(!Array.isArray(json))throw Error('Resposta inesperada do banco de custos.');
    return json;
  }
  return [];
}
async function readAll(table,query,columns){
  const all=[];
  for(let i=0;i<30;i++){
    const more=await request(table,'?'+query+'&select='+columns+'&limit=1000&offset='+(i*1000));
    all.push(...more);
    if(more.length<1000)return all;
  }
  throw Error('Limite de 30.000 registros atingido. Não é possível apresentar cobertura completa.');
}
export async function readWeDropCosts(shopId){
  const id=validShopId(shopId);
  return readAll('shopee_wedrop_costs','shop_id=eq.'+id+'&order=supplier_sku.asc',
    'supplier_sku,unit_cost,source_file,imported_at');
}
export function parseSupabaseExactCount(header){
  const match=String(header||'').match(/\/(\d+)$/);
  return match?Number(match[1]):null;
}
export async function getStoredWeDropCostCount(shopId){
  const id=validShopId(shopId),cfg=credentials();
  const headers={apikey:cfg.key,Accept:'application/json','Prefer':'count=exact'};
  if(/^eyJ[A-Za-z0-9_-]*\./.test(cfg.key))headers.Authorization='Bearer '+cfg.key;
  const res=await fetch(cfg.url+'/rest/v1/shopee_wedrop_costs?shop_id=eq.'+id+
    '&select=supplier_sku&limit=1',{headers,signal:AbortSignal.timeout(16000)});
  if(!res.ok)throw Error('Não foi possível conferir os custos salvos no banco (HTTP '+res.status+').');
  const count=parseSupabaseExactCount(res.headers.get('content-range'));
  if(count!==null)return count;
  // Alguns gateways não expõem Content-Range: retornar uma contagem real, não presumir zero.
  return (await readWeDropCosts(id)).length;
}
export async function readWeDropSyncState(shopId){
  const rows=await request('shopee_wedrop_sync_state',
    '?shop_id=eq.'+validShopId(shopId)+
    '&select=source_kind,source_name,source_hash,imported_skus,changed_skus,matched_skus,status,last_success_at,last_checked_at,last_error&limit=1');
  return rows[0]||null;
}
export async function saveWeDropSyncState(shopId,state){
  const row={
    shop_id:validShopId(shopId),
    source_kind:String(state.sourceKind||'').slice(0,30),
    source_name:String(state.sourceName||'').slice(0,135),
    source_hash:String(state.sourceHash||'').slice(0,100),
    imported_skus:Number(state.importedSkus)||0,
    changed_skus:Number(state.changedSkus)||0,
    matched_skus:Number(state.matchedSkus)||0,
    status:'success',last_success_at:new Date().toISOString(),
    last_checked_at:new Date().toISOString(),last_error:null
  };
  await request('shopee_wedrop_sync_state','?on_conflict=shop_id',{
    method:'POST',rows:[row],prefer:'resolution=merge-duplicates,return=minimal'
  });
}
export async function saveWeDropCosts(shopId,costs,{overwrite=false,sourceFile=''}={}){
  const id=validShopId(shopId);
  if(!Array.isArray(costs)||costs.length<1||costs.length>15000)
    throw Error('Importação sem custos válidos ou quantidade excessiva.');
  const existing=new Set((await readWeDropCosts(id)).map(x=>x.supplier_sku));
  const incoming=costs.filter(x=>overwrite||!existing.has(x.sku));
  const file=String(sourceFile||'exportacao.csv').split(/[\\/]/).pop().slice(0,130);
  let saved=0;
  // Operações em lotes idempotentes. Se falhar, informar contagem parcial.
  for(let i=0;i<incoming.length;i+=150){
    const chunk=incoming.slice(i,i+150).map(x=>({
      shop_id:id,supplier_sku:x.sku,unit_cost:x.unitCost,source_file:file,
      imported_at:new Date().toISOString()
    }));
    try{
      await request('shopee_wedrop_costs','?on_conflict=shop_id,supplier_sku',{
        method:'POST',rows:chunk,prefer:'resolution=merge-duplicates,return=minimal'
      });
      saved+=chunk.length;
    }catch(e){
      throw Error('Importação parcial: '+saved+' SKUs gravados antes da falha. Retome o mesmo arquivo; operação idempotente. '+String(e.message||e));
    }
  }
  return {totalReceived:costs.length,saved,
    preservedExisting:overwrite?0:costs.length-incoming.length,
    updatedExisting:overwrite?costs.filter(x=>existing.has(x.sku)).length:0,
    overwrite:Boolean(overwrite)};
}
export async function saveWeDropProducts(shopId,products,{sourceFile='',sourceHash=''}={}){
  const id=validShopId(shopId);
  if(!Array.isArray(products)||products.length>15000)throw Error('Catálogo de produtos inválido.');
  const file=String(sourceFile||'catalogo.csv').split(/[\\/]/).pop().slice(0,130);
  let saved=0;
  for(let i=0;i<products.length;i+=150){
    const rows=products.slice(i,i+150).map(p=>({shop_id:id,supplier_sku:p.sku,product_data:p.data,
      source_line:p.sourceLine,source_file:file,source_hash:sourceHash,imported_at:new Date().toISOString()}));
    await request('shopee_wedrop_products','?on_conflict=shop_id,supplier_sku',{
      method:'POST',rows,prefer:'resolution=merge-duplicates,return=minimal'});
    saved+=rows.length;
  }
  return saved;
}
export async function readWeDropProduct(shopId,{sku,itemId,modelId=0}){
  const id=validShopId(shopId);
  const read=async supplierSku=>{
    const literal='"'+String(supplierSku).replace(/\\/g,'\\\\').replace(/"/g,'\\"')+'"';
    const rows=await request('shopee_wedrop_products','?shop_id=eq.'+id+'&supplier_sku=eq.'+
      encodeURIComponent(literal)+'&select=supplier_sku,product_data,source_file,source_line,source_hash,imported_at&limit=1');
    return rows[0]||null;
  };
  const direct=await read(sku);if(direct)return {...direct,matchedBy:'exact-sku'};
  const link=(await readWeDropSkuLinks(id)).find(x=>String(x.item_id)===String(itemId)&&
    String(x.model_id||0)===String(modelId)&&x.shopee_sku===sku);
  if(!link)return null;
  const linked=await read(link.supplier_sku);return linked?{...linked,matchedBy:'reviewed-link'}:null;
}
export async function readWeDropSkuLinks(shopId){
  const id=validShopId(shopId);
  return readAll('shopee_wedrop_sku_links','shop_id=eq.'+id+'&order=item_id.asc',
    'item_id,model_id,shopee_sku,supplier_sku,linked_at');
}
export async function upsertWeDropSkuLink(shopId,{itemId,modelId=0,shopeeSku,supplierSku}){
  const id=validShopId(shopId);
  const item=Number(itemId),model=Number(modelId);
  if(!Number.isSafeInteger(item)||item<=0||!Number.isSafeInteger(model)||model<0)
    throw Error('Identificador de anúncio ou variação inválido.');
  if(!shopeeSku||!supplierSku||shopeeSku.length>120||supplierSku.length>120)
    throw Error('Selecione SKUs válidos.');
  await request('shopee_wedrop_sku_links','?on_conflict=shop_id,item_id,model_id',{
    method:'POST',rows:[{shop_id:id,item_id:item,model_id:model,
      shopee_sku:shopeeSku,supplier_sku:supplierSku,
      updated_at:new Date().toISOString()}],
    prefer:'resolution=merge-duplicates,return=minimal'
  });
}
export async function deleteWeDropSkuLink(shopId,{itemId,modelId=0}){
  const id=validShopId(shopId),item=Number(itemId),model=Number(modelId);
  if(!Number.isSafeInteger(item)||item<=0||!Number.isSafeInteger(model)||model<0)
    throw Error('Identificador de anúncio ou variação inválido.');
  await request('shopee_wedrop_sku_links','?shop_id=eq.'+id+'&item_id=eq.'+item+
    '&model_id=eq.'+model,{method:'DELETE'});
}
export function matchWeDropCosts(items,models,costs,{filter='all',offset=0,limit=500,links=[]}={}){
  if(!['all','matched','unmatched'].includes(filter))throw Error('Filtro de custo inválido.');
  const start=Number(offset),perPage=Number(limit);
  if(!Number.isSafeInteger(start)||start<0||!Number.isSafeInteger(perPage)||perPage<1||perPage>500)
    throw Error('Paginação de custos inválida.');
  const bySku=new Map(costs.map(x=>[String(x.supplier_sku),Number(x.unit_cost)]));
  const byItemModel=new Map((links||[]).map(link=>[
    String(link.item_id)+':'+String(link.model_id||0),link
  ]));
  const modelByItem=new Map();
  for(const x of models){
    const id=String(x.item_id);
    if(!modelByItem.has(id))modelByItem.set(id,[]);
    modelByItem.get(id).push(x);
  }
  const results=[];
  let waitingModels=0,withoutSku=0;
  for(const item of items){
    const itemId=String(item.item_id);
    const variations=item.has_model?modelByItem.get(itemId)||[]:[];
    if(item.has_model&&!variations.length){waitingModels++;continue;}
    const list=item.has_model?variations:[item];
    for(const model of list){
      const sku=String(item.has_model?model.model_sku||'':item.sku||'').trim();
      if(!sku){withoutSku++;continue;}
      const amount=item.has_model?model.price:item.price;
      const price=amount===null||amount===undefined?null:Number(amount);
      const modelId=item.has_model?String(model.model_id):null;
      const link=byItemModel.get(itemId+':'+(modelId||'0'));
      // Nunca usar vínculo antigo se o SKU publicado foi alterado na Shopee.
      const linkedSupplierSku=link?.shopee_sku===sku&&bySku.has(link?.supplier_sku)
        ?String(link.supplier_sku):null;
      const supplierSku=bySku.has(sku)?sku:linkedSupplierSku;
      const cost=supplierSku===null?null:bySku.get(supplierSku);
      results.push({
        itemId,sku,modelId,
        supplierSku:supplierSku||null,linkedByReview:Boolean(linkedSupplierSku&&supplierSku!==sku),
        name:String(item.item_name||''),imageUrl:String(item.image_url||''),status:String(item.item_status||''),
        price:Number.isFinite(price)?price:null,
        unitCost:cost,
        grossDifference:cost!==null&&Number.isFinite(price)?Math.round((price-cost)*100)/100:null,
        costMatched:cost!==null
      });
    }
  }
  const matched=results.filter(x=>x.costMatched).length;
  const priced=results.filter(x=>x.price!==null&&x.costMatched).length;
  const filtered=results.filter(x=>filter==='all'||x.costMatched===(filter==='matched'));
  // Custo cadastrado primeiro; pendências nunca escondem as centenas já vinculadas.
  filtered.sort((a,b)=>Number(b.costMatched)-Number(a.costMatched)||a.sku.localeCompare(b.sku,'pt-BR'));
  const used=new Set(results.filter(x=>x.costMatched).map(x=>x.supplierSku));
  return {
    totals:{
      catalogItems:items.length,variantSkus:models.length,
      skusWithPriceAndCost:priced,
      comparedSkus:results.length,
      matched,missingCost:results.length-matched,withoutSku,waitingModels,
      importedCosts:bySku.size,supplierSkusNotMatched:[...bySku.keys()].filter(x=>!used.has(x)).length
    },
    // Não gerar tabela sem custos; paginação e filtro aplicados antes do recorte.
    rows:bySku.size?filtered.slice(start,start+perPage):[],
    filter,offset:start,pageSize:perPage,
    totalFiltered:filtered.length,
    nextOffset:bySku.size&&start+perPage<filtered.length?start+perPage:null,
    truncated:bySku.size>0&&start+perPage<filtered.length,
    financialReady:bySku.size>0,
    warning:bySku.size
      ?'Preço do catálogo pode não refletir promoções, frete ou valor efetivamente recebido. Diferença bruta não é lucro líquido.'
      :'Nenhum custo WeDrop importado. Comparação financeira indisponível até existir custo real cadastrado.'
  };
}

export async function pendingWeDropModels(shopId,{limit=10,exclude=[]}={}){
  const id=validShopId(shopId);
  const [items,models]=await Promise.all([
    readAll('shopee_catalog_items','shop_id=eq.'+id+'&order=item_id.asc',
      'item_id,item_name,has_model'),
    readAll('shopee_catalog_models','shop_id=eq.'+id+'&order=model_id.asc',
      'item_id,model_id')
  ]);
  const present=new Set(models.map(x=>String(x.item_id)));
  const pending=items.filter(x=>x.has_model&&!present.has(String(x.item_id)));
  const max=Math.max(1,Math.min(500,Number(limit)||10));
  const excluding=new Set(Array.isArray(exclude)?exclude.map(String):[]);
  return {
    totalPending:pending.length,
    items:pending.filter(x=>!excluding.has(String(x.item_id))).slice(0,max)
      .map(x=>({itemId:String(x.item_id),title:String(x.item_name||'')}))
  };
}
export function compareSkuSets(supplierSkus,catalogSkus){
  const catalog=new Set(catalogSkus.map(x=>String(x).trim()).filter(Boolean));
  const offered=new Set(supplierSkus.map(x=>String(x).trim()).filter(Boolean));
  const matching=[...offered].filter(x=>catalog.has(x));
  const noMatch=[...offered].filter(x=>!catalog.has(x));
  return {
    uniqueCosts:offered.size,matchedCount:matching.length,
    unmatchedCount:noMatch.length,unmatchedExamples:noMatch.slice(0,7),
    catalogSkuCount:catalog.size
  };
}
export async function compareIncomingCosts(shopId,costs){
  const id=validShopId(shopId);
  const [items,models]=await Promise.all([
    readAll('shopee_catalog_items','shop_id=eq.'+id+'&order=item_id.asc',
      'item_id,sku,item_name,has_model'),
    readAll('shopee_catalog_models','shop_id=eq.'+id+'&order=model_id.asc',
      'item_id,model_sku')
  ]);
  const comparison=compareSkuSets(
    costs.map(x=>x.sku),
    [...items.filter(x=>!x.has_model).map(x=>x.sku||''),
      ...models.map(x=>x.model_sku||'')]
  );
  const presentModels=new Set(models.map(x=>String(x.item_id)));
  const variantsWaiting=items.filter(x=>x.has_model&&!presentModels.has(String(x.item_id))).length;
  return {
    ...comparison,variantsWaiting,
    warning:!comparison.matchedCount
      ?'Nenhum SKU corresponde exatamente ao catálogo atualmente salvo. Confira se selecionou SKU da WeDrop (não código de barras/EAN/NCM), se há zeros à esquerda e se o catálogo/variações foram sincronizados.'
      :'Somente os custos com SKU idêntico ao da Shopee serão vinculados. Outros custos podem permanecer sem correspondência.'
  };
}

// Índice visual da área Financeiro — thumbnails e variações oficiais Shopee.
 // Consulta somente dados de catálogo da loja, sem compradores nem cálculos.
export async function readFinanceCatalogProfiles(shopId){
  const id=validShopId(shopId);
  const [items,models]=await Promise.all([
    readAll('shopee_catalog_items','shop_id=eq.'+id+'&order=item_id.asc',
      'item_id,sku,item_name,image_url,has_model,item_status'),
    readAll('shopee_catalog_models','shop_id=eq.'+id+'&order=model_id.asc',
      'item_id,model_id,model_sku')
  ]);
  const modelByItem=new Map();
  for(const model of models){
    const key=String(model.item_id);
    if(!modelByItem.has(key))modelByItem.set(key,[]);
    modelByItem.get(key).push(model);
  }
  const out=[];
  for(const item of items){
    const variants=item.has_model?modelByItem.get(String(item.item_id))||[]:[null];
    for(const model of variants){
      const sku=String(model?model.model_sku:item.sku||'').trim();
      if(!sku)continue;
      out.push({
        sku,itemId:String(item.item_id),modelId:model?String(model.model_id):null,
        name:String(item.item_name||''),imageUrl:String(item.image_url||''),
        status:String(item.item_status||'')
      });
    }
  }
  return out;
}
export async function getWeDropCoverage(shopId,{filter='matched',offset=0,limit=500}={}){
  const id=validShopId(shopId);
  const [costs,items,models,links]=await Promise.all([
    readWeDropCosts(id),
    readAll('shopee_catalog_items','shop_id=eq.'+id+'&order=item_id.asc',
      'item_id,sku,item_name,item_status,price,has_model,image_url'),
    readAll('shopee_catalog_models','shop_id=eq.'+id+'&order=model_id.asc',
      'item_id,model_id,model_sku,price,stock'),
    readWeDropSkuLinks(id)
  ]);
  const coverage=matchWeDropCosts(items,models,costs,{filter,offset,limit,links});
  return {shopId:id,...coverage,hasImportedCosts:costs.length>0};
}

