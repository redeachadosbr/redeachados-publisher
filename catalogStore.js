// Persistência mínima do catálogo Shopee no Supabase.
// Somente o backend usa service role. Sem credenciais ou dados de compradores.
function envText(name){return String(process.env[name]||'').trim();}
function config(){
  const url=envText('SUPABASE_URL').replace(/\/$/,'');
  const key=envText('SUPABASE_SECRET_KEY')||envText('SUPABASE_SERVICE_ROLE_KEY');
  return {url,key,configured:Boolean(url&&key)};
}
function headers(key,prefer){
  const h={apikey:key,Accept:'application/json','Content-Type':'application/json'};
  if(/^eyJ[A-Za-z0-9_-]*\./.test(key))h.Authorization='Bearer '+key;
  if(prefer)h.Prefer=prefer;
  return h;
}
async function request(table,params='',{method='GET',payload,prefer}={}){
  const cfg=config();
  if(!cfg.configured)throw Error('Armazenamento de catálogo não configurado.');
  const r=await fetch(cfg.url+'/rest/v1/'+table+params,{
    method,headers:headers(cfg.key,prefer),
    ...(payload!==undefined?{body:JSON.stringify(payload)}:{}),
    signal:AbortSignal.timeout(15000)
  });
  if(!r.ok)throw Error('Supabase catálogo HTTP '+r.status);
  if(method==='GET')return r.json();
  return null;
}
function shopNumber(id){
  const n=Number(id);
  if(!Number.isSafeInteger(n)||n<=0)throw Error('Shop ID inválido.');
  return n;
}
export function catalogStoreReady(){return config().configured;}
export function persistedCatalogRows(shopId,items,at=new Date().toISOString()){
  shopId=shopNumber(shopId);
  return (Array.isArray(items)?items:[]).filter(x=>x.baseLoaded).map(x=>({
    shop_id:shopId,item_id:Number(x.itemId),
    sku:String(x.sku||''),item_name:String(x.title||''),item_status:String(x.status||''),
    image_url:String(x.imageUrl||''),price:x.price??null,stock:x.stock??null,
    has_model:Boolean(x.hasModel),has_promotion:Boolean(x.promotion),
    item_updated_at:x.updateTime??null,base_loaded:true,last_seen_at:at
  })).filter(x=>Number.isSafeInteger(x.item_id)&&x.item_id>0);
}
export async function storeCatalogItems(shopId,items){
  const rows=persistedCatalogRows(shopId,items);
  if(!rows.length)return {stored:0,configured:catalogStoreReady()};
  if(!catalogStoreReady())return {stored:0,configured:false,warning:'Supabase indisponível; consulta de produtos continua sem cache.'};
  await request('shopee_catalog_items','?on_conflict=shop_id,item_id',{
    method:'POST',payload:rows,prefer:'resolution=merge-duplicates,return=minimal'
  });
  return {stored:rows.length,configured:true};
}
export async function storeCatalogModels(shopId,itemId,models){
  if(!catalogStoreReady())return {stored:0,configured:false};
  const now=new Date().toISOString();
  const rows=(Array.isArray(models)?models:[]).map(x=>({
    shop_id:shopNumber(shopId),item_id:Number(itemId),model_id:Number(x.modelId),
    model_sku:String(x.sku||''),model_status:String(x.status||''),
    price:x.price??null,stock:x.stock??null,last_seen_at:now
  })).filter(x=>Number.isSafeInteger(x.item_id)&&x.item_id>0&&
    Number.isSafeInteger(x.model_id)&&x.model_id>0);
  if(!rows.length)return {stored:0,configured:true};
  await request('shopee_catalog_models','?on_conflict=shop_id,item_id,model_id',{
    method:'POST',payload:rows,prefer:'resolution=merge-duplicates,return=minimal'
  });
  return {stored:rows.length,configured:true};
}
export function mapPersistedCatalogRow(x){
  return {
    itemId:String(x.item_id),
    title:x.item_name||'',sku:x.sku||'',status:x.item_status||'',
    imageUrl:x.image_url||'',
    price:x.price===null?null:Number(x.price),
    stock:x.stock===null?null:Number(x.stock),
    hasModel:Boolean(x.has_model),promotion:Boolean(x.has_promotion),
    updateTime:x.item_updated_at===null?null:Number(x.item_updated_at),
    baseLoaded:Boolean(x.base_loaded),
    lastSeenAt:x.last_seen_at||null
  };
}
export async function readCatalogCache(shopId){
  if(!catalogStoreReady())return {configured:false,items:[],count:0,partial:true};
  shopId=shopNumber(shopId);
  const all=[];
  for(let page=0;page<30;page++){
    const chunk=await request('shopee_catalog_items',
      '?shop_id=eq.'+shopId+
      '&select=item_id,sku,item_name,item_status,image_url,price,stock,has_model,has_promotion,item_updated_at,base_loaded,last_seen_at'+
      '&order=item_id.asc&limit=1000&offset='+(page*1000));
    if(!Array.isArray(chunk))throw Error('Resposta inesperada do cache do catálogo.');
    all.push(...chunk);
    if(chunk.length<1000)return {
      configured:true,items:all.map(mapPersistedCatalogRow),count:all.length,
      lastSavedAt:all.reduce((latest,x)=>x.last_seen_at>latest?x.last_seen_at:latest,''),
      partial:true // O cache por si só não comprova que todos os status foram percorridos.
    };
  }
  throw Error('Cache acima de 30.000 itens. É necessário implementar paginação adicional antes de exibir tudo.');
}

export async function findExactCatalogSku(shopId,sku){
  shopId=shopNumber(shopId);
  sku=String(sku||'').trim();
  if(!sku||sku.length>120||/[\\x00-\\x1F]/.test(sku))
    throw Error('Informe um SKU válido da Shopee.');
  const filter='shop_id=eq.'+shopId+'&limit=30&';
  const [parents,models]=await Promise.all([
    request('shopee_catalog_items','?'+filter+
      'sku=eq.'+encodeURIComponent(sku)+
      '&select=item_id,sku,item_name,item_status,image_url,has_model'),
    request('shopee_catalog_models','?'+filter+
      'model_sku=eq.'+encodeURIComponent(sku)+
      '&select=item_id,model_id,model_sku,model_status')
  ]);
  const keyed=new Map();
  for(const row of parents){
    keyed.set(String(row.item_id)+':0',{
      itemId:String(row.item_id),modelId:'0',sku:row.sku,title:row.item_name||'',
      imageUrl:row.image_url||'',status:row.item_status||'',source:'item_sku'
    });
  }
  for(const row of models){
    keyed.set(String(row.item_id)+':'+String(row.model_id),{
      itemId:String(row.item_id),modelId:String(row.model_id),
      sku:row.model_sku,title:'Variação do Item '+row.item_id,
      imageUrl:'',status:row.model_status||'',source:'model_sku'
    });
  }
  return [...keyed.values()];
}
