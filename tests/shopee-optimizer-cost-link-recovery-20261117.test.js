import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {shopeePricingDirectSupplierCost,shopeePricingSupplierCost} from '../shopeePricingStore.js';
import {quoteShopeeOptimizationPrice} from '../shopeePricing.js';

async function withSupplierMock(handler,run){
 const oldUrl=process.env.SUPABASE_URL;
 const oldKey=process.env.SUPABASE_SECRET_KEY;
 const oldFetch=globalThis.fetch;
 process.env.SUPABASE_URL='https://supabase.test';
 process.env.SUPABASE_SECRET_KEY='test-role';
 globalThis.fetch=async rawUrl=>{
  const url=new URL(String(rawUrl));
  const rows=handler(url);
  return {ok:true,json:async()=>rows};
 };
 try{return await run();}
 finally{
  globalThis.fetch=oldFetch;
  if(oldUrl===undefined)delete process.env.SUPABASE_URL;
  else process.env.SUPABASE_URL=oldUrl;
  if(oldKey===undefined)delete process.env.SUPABASE_SECRET_KEY;
  else process.env.SUPABASE_SECRET_KEY=oldKey;
 }
}

test('SKU da Shopee com vínculo WeDrop já revisado recupera o custo e calcula a prévia',async()=>{
 const queries=[];
 await withSupplierMock(url=>{
  queries.push(url.toString());
  if(url.pathname.endsWith('/shopee_wedrop_sku_links'))
   return [{shopee_sku:'3283',supplier_sku:'TRC1525'}];
  if(url.searchParams.get('supplier_sku')==='eq.TRC1525')
   return [{supplier_sku:'TRC1525',unit_cost:19.99,imported_at:'2026-11-17'}];
  return [];
 },async()=>{
  const cost=await shopeePricingDirectSupplierCost(123,'3283');
  assert.equal(cost.supplierSku,'TRC1525');
  assert.equal(cost.unitCost,19.99);
  const q=quoteShopeeOptimizationPrice({unitCost:cost.unitCost,settings:{marginPct:8}});
  assert.ok(q.grossPrice>q.marketplaceDisplayPrice);
  assert.ok(q.netMarginPct>=8);
  assert.equal(q.appliedInShopee,false);
 });
 assert.ok(queries.some(url=>url.includes('shopee_wedrop_sku_links')));
});

test('vínculos ambíguos não fornecem custo por aproximação',async()=>{
 await withSupplierMock(url=>
  url.pathname.endsWith('/shopee_wedrop_sku_links')
   ?[{shopee_sku:'3283',supplier_sku:'X'},{shopee_sku:'3283',supplier_sku:'Y'}]:[],
  async()=>assert.equal(await shopeePricingDirectSupplierCost(123,'3283'),null));
});

test('precificação final não aceita vínculo pertencente a outro Item ID',async()=>{
 await withSupplierMock(url=>{
  if(url.pathname.endsWith('/shopee_wedrop_sku_links'))
   return [{shopee_sku:'3283',supplier_sku:'TRC1525'}];
  if(url.searchParams.get('supplier_sku')==='eq.TRC1525')
   return [{supplier_sku:'TRC1525',unit_cost:19.99}];
  return [];
 },async()=>{
  // Prévia de fornecedor lê vínculo por SKU, mas preparação exige item/modelo exatos.
  await assert.rejects(
   shopeePricingSupplierCost(123,{sku:'3283',itemId:999,modelId:0}),
   /Custo WeDrop não vinculado/);
 });
});

test('frontend mostra falta de custo no resumo, não somente painel vazio',()=>{
 const app=readFileSync(new URL('../public/app.js',import.meta.url),'utf8');
 assert.match(app,/function shPriceShowUnavailable\(sku,message/);
 assert.match(app,/values\.hidden=false/);
 assert.match(app,/Conferir ou vincular custo na WeDrop/);
 assert.match(app,/preço indisponível porque falta o custo WeDrop/);
 assert.match(app,/shPriceShowUnavailable\(sku,'WeDrop/);
});
