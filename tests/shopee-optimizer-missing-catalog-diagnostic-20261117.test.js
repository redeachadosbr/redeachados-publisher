import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {shopeePricingSupplierCatalogStatus} from '../shopeePricingStore.js';

async function withMock(products,run){
 const oldUrl=process.env.SUPABASE_URL;
 const oldKey=process.env.SUPABASE_SECRET_KEY;
 const originalFetch=globalThis.fetch;
 const calls=[];
 process.env.SUPABASE_URL='https://supabase.test';
 process.env.SUPABASE_SECRET_KEY='test-role';
 globalThis.fetch=async rawUrl=>{
  const url=new URL(String(rawUrl));
  calls.push(url);
  const rows=url.pathname.endsWith('/shopee_wedrop_products')
    ?products:[{source_name:'produtos-catalogo.xlsx',
      last_success_at:'2026-11-05T03:23:44Z',status:'success'}];
  return {ok:true,json:async()=>rows};
 };
 try{return await run(calls);}
 finally{
  globalThis.fetch=originalFetch;
  if(oldUrl===undefined)delete process.env.SUPABASE_URL;
  else process.env.SUPABASE_URL=oldUrl;
  if(oldKey===undefined)delete process.env.SUPABASE_SECRET_KEY;
  else process.env.SUPABASE_SECRET_KEY=oldKey;
 }
}
test('SKU 3283 ausente no catálogo não é confundido com produto existente sem custo',async()=>{
 await withMock([],async calls=>{
  const result=await shopeePricingSupplierCatalogStatus(852701218,'3283');
  assert.deepEqual(result,{
   skuInStoredCatalog:false,
   lastCatalogImportAt:'2026-11-05T03:23:44Z',
   catalogSourceName:'produtos-catalogo.xlsx'
  });
  assert.equal(calls.length,2);
  assert.ok(calls.every(url=>url.searchParams.get('shop_id')==='eq.852701218'));
  assert.equal(calls[0].searchParams.get('supplier_sku'),'eq.3283');
  assert.ok(calls.every(url=>url.pathname.endsWith('/shopee_wedrop_products')||
   url.pathname.endsWith('/shopee_wedrop_sync_state')));
 });
});
test('SKU encontrado no catálogo é distinguido de SKU que nunca foi importado',async()=>{
 await withMock([{supplier_sku:'3283'}],async()=>{
  const result=await shopeePricingSupplierCatalogStatus(852701218,'3283');
  assert.equal(result.skuInStoredCatalog,true);
 });
});
test('código parecido não serve de identidade de fornecedor',async()=>{
 await withMock([{supplier_sku:'32830'}],async()=>{
  const result=await shopeePricingSupplierCatalogStatus(852701218,'3283');
  assert.equal(result.skuInStoredCatalog,false);
 });
});
test('prévia usa diagnóstico apenas sem custo, sem publicar preço',()=>{
 const server=readFileSync(new URL('../server.js',import.meta.url),'utf8');
 const frontend=readFileSync(new URL('../public/app.js',import.meta.url),'utf8');
 const begin=server.indexOf("app.post('/api/shopee/optimizer/pricing/supplier-preview'");
 const end=server.indexOf("app.get('/api/shopee/optimizer/pricing/market-status'",begin);
 const endpoint=server.slice(begin,end);
 assert.match(endpoint,/shopeePricingDirectSupplierCost\(auth\.shopId,sku\)/);
 assert.match(endpoint,/shopeePricingSupplierCatalogStatus\(auth\.shopId,sku\)/);
 assert.match(endpoint,/SKU_NOT_IN_STORED_CATALOG/);
 assert.match(endpoint,/COST_NOT_IMPORTED/);
 assert.doesNotMatch(endpoint,/saveShopeePricePlan|update_price|add_discount|update_discount/);
 assert.match(frontend,/Última importação:/);
 assert.match(frontend,/Atualizar catálogo WeDrop/);
 assert.match(frontend,/missingReason:result\.missingReason/);
});
