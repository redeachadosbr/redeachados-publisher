import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {findCatalogSkuIgnoringCase} from '../catalogStore.js';
import {normalizedShopeeFiscalBatchSkus} from '../shopeeExecutionBatch.js';

test('trc1525 digitada em minúsculas localiza TRC1525 preservando SKU e Item ID oficiais',async()=>{
 const oldFetch=globalThis.fetch,oldUrl=process.env.SUPABASE_URL,oldKey=process.env.SUPABASE_SECRET_KEY;
 process.env.SUPABASE_URL='https://mock-project.supabase.co';
 process.env.SUPABASE_SECRET_KEY='test-service-key';
 const calls=[];
 globalThis.fetch=async url=>{
  const parsed=new URL(url),filters=parsed.searchParams;
  calls.push({table:parsed.pathname,exact:filters.get('sku')||filters.get('model_sku')});
  const isParent=parsed.pathname.endsWith('/shopee_catalog_items');
  const predicate=filters.get('sku')||'';
  const rows=isParent&&predicate==='ilike.trc1525'?
   [{shop_id:852701218,item_id:22095398152,sku:'TRC1525',item_name:'Piscina Inflável Azul',
     item_status:'NORMAL',image_url:'',has_model:false}]:[];
  return {ok:true,json:async()=>rows};
 };
 try{
  const result=await findCatalogSkuIgnoringCase(852701218,'trc1525');
  assert.equal(result.length,1);
  assert.equal(result[0].sku,'TRC1525');
  assert.equal(result[0].itemId,'22095398152');
  assert.equal(result[0].modelId,'0');
  assert.ok(calls.some(x=>x.exact==='ilike.trc1525'));
 }finally{
  globalThis.fetch=oldFetch;
  if(oldUrl===undefined)delete process.env.SUPABASE_URL;else process.env.SUPABASE_URL=oldUrl;
  if(oldKey===undefined)delete process.env.SUPABASE_SECRET_KEY;else process.env.SUPABASE_SECRET_KEY=oldKey;
 }
});
test('entrada do lote preserva texto; servidor traduz para o SKU oficial sem alterar outros campos',()=>{
 assert.deepEqual(normalizedShopeeFiscalBatchSkus(['trc1525','TRC1525']),['trc1525']);
 const server=readFileSync(new URL('../server.js',import.meta.url),'utf8');
 const start=server.indexOf("app.post('/api/shopee/optimizer/batch/fiscal/prepare'");
 const end=server.indexOf("app.post('/api/shopee/optimizer/batch/fiscal/execute'",start);
 const route=server.slice(start,end);
 assert.match(route,/findCatalogSkuIgnoringCase\(auth\.shopId,requestedSku\)/);
 assert.match(route,/sku=matches\[0\]\.sku/);
 assert.match(route,/findLiveShopeeSku\(cfg,auth,callShopeeShopApi,candidate,\{fastOnly:true\}\)/);
 assert.match(route,/auditShopeeItem\(cfg,auth,callShopeeShopApi,itemId/);
 assert.match(route,/selectedStage:'fiscal'/);
 assert.match(route,/fiscalMatrixSource/);
 assert.doesNotMatch(route,/update_item|update_stock|update_price/);
});
