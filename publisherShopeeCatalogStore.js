// Backup privado do catálogo dos anúncios Shopee usado pelo Publisher.
// Supabase é o armazenamento definitivo; o JSON local é apenas cache do Render.
const TABLE='publisher_shopee_catalog_snapshots';
const SHOP_ID='852701218';
function configuration(){
 const base=String(process.env.SUPABASE_URL||'').trim().replace(/\/$/,'');
 const key=String(process.env.SUPABASE_SECRET_KEY||process.env.SUPABASE_SERVICE_ROLE_KEY||'').trim();
 if(!/^https:\/\/[a-z0-9.-]+$/i.test(base)||!key)
  throw Error('Backup permanente da Shopee indisponível: configure SUPABASE_URL e SUPABASE_SECRET_KEY no Render.');
 const headers={apikey:key,'Content-Type':'application/json',Accept:'application/json'};
 if(/^eyJ[A-Za-z0-9_-]*\./.test(key))headers.Authorization='Bearer '+key;
 return {base,headers};
}
export function validatePublisherCatalog(catalog,shopId=SHOP_ID){
 if(!catalog||typeof catalog!=='object'||!Array.isArray(catalog.products)||!catalog.products.length)
  throw Error('Catálogo vazio ou inválido. O backup anterior foi mantido.');
 if(String(catalog.shopId||'')!==String(shopId))
  throw Error('O catálogo não corresponde à loja Shopee deste Publisher.');
 const seen=new Set();
 for(const item of catalog.products){
  const id=String(item?.id||''),name=String(item?.name||'').trim();
  if(!/^\d+$/.test(id)||!name||seen.has(id))
   throw Error('Catálogo contém anúncio sem nome, ID inválido ou duplicado.');
  seen.add(id);
 }
 return catalog;
}
async function request(endpoint,options={}){
 const cfg=configuration();
 const res=await fetch(cfg.base+'/rest/v1/'+TABLE+endpoint,{
  method:options.method||'GET',
  headers:{...cfg.headers,...(options.prefer?{Prefer:options.prefer}:{})},
  ...(options.data?{body:JSON.stringify(options.data)}:{}),
  signal:AbortSignal.timeout(15000)
 });
 if(!res.ok)throw Error('Falha ao acessar backup permanente do catálogo (HTTP '+res.status+').');
 if(res.status===204)return [];
 const text=await res.text();
 return text?JSON.parse(text):[];
}
export async function readPublisherCatalog(shopId=SHOP_ID){
 const rows=await request('?shop_id=eq.'+encodeURIComponent(shopId)+'&select=catalog,source,updated_at&limit=1');
 const row=rows?.[0];if(!row)return null;
 const catalog=validatePublisherCatalog(row.catalog,shopId);
 return {catalog,source:row.source||'backup',updatedAt:row.updated_at||null};
}
export async function savePublisherCatalog(catalog,{shopId=SHOP_ID,source='shopee_excel'}={}){
 validatePublisherCatalog(catalog,shopId);
 const updatedAt=new Date().toISOString();
 // Em caso de falha, o banco não substitui a versão previamente confirmada.
 await request('?on_conflict=shop_id',{method:'POST',
  prefer:'resolution=merge-duplicates,return=minimal',
  data:[{shop_id:String(shopId),catalog,source,updated_at:updatedAt}]});
 return {saved:true,source,updatedAt};
}
export const PUBLISHER_SHOPEE_SHOP_ID=SHOP_ID;
