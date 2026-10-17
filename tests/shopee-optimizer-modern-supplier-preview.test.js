import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {shopeePricingDirectSupplierCost} from '../shopeePricingStore.js';
import {quoteShopeePrice} from '../shopeePricing.js';
const read=file=>readFileSync(new URL('../'+file,import.meta.url),'utf8');
test('SKU da WeDrop pode ter preço simulado mesmo se nenhum anúncio estiver no cache Shopee',async()=>{
  const oldUrl=process.env.SUPABASE_URL,oldKey=process.env.SUPABASE_SECRET_KEY,oldFetch=globalThis.fetch;
  process.env.SUPABASE_URL='https://example.test';
  process.env.SUPABASE_SECRET_KEY='test-service-role';
  const urls=[];
  globalThis.fetch=async(url)=>{urls.push(String(url));return {
    ok:true,json:async()=>[{supplier_sku:'TRC1525',unit_cost:99.99,imported_at:'2026-10-16T15:00:00Z'}]
  }};
  try{
    const cost=await shopeePricingDirectSupplierCost(123,'TRC1525');
    assert.equal(cost.supplierSku,'TRC1525');
    assert.equal(cost.unitCost,99.99);
    assert.ok(urls[0].includes('shopee_wedrop_costs'));
    assert.ok(!urls[0].includes('shopee_catalog_items'));
    const quote=quoteShopeePrice({unitCost:cost.unitCost,settings:{minMarginPct:5}});
    assert.ok(quote.grossPrice>quote.customerPrice);
    assert.ok(quote.netMarginPct>=5);
    assert.equal(quote.appliedInShopee,false);
  }finally{
    globalThis.fetch=oldFetch;
    if(oldUrl===undefined)delete process.env.SUPABASE_URL;else process.env.SUPABASE_URL=oldUrl;
    if(oldKey===undefined)delete process.env.SUPABASE_SECRET_KEY;else process.env.SUPABASE_SECRET_KEY=oldKey;
  }
});
test('produto com SKU inválida ou ausente na WeDrop nunca inventa custo',async()=>{
  await assert.rejects(shopeePricingDirectSupplierCost(123,'TRC15\x00'),/inválida/);
  const oldUrl=process.env.SUPABASE_URL,oldKey=process.env.SUPABASE_SECRET_KEY,oldFetch=globalThis.fetch;
  process.env.SUPABASE_URL='https://example.test';
  process.env.SUPABASE_SECRET_KEY='test-service-role';
  globalThis.fetch=async()=>({ok:true,json:async()=>[]});
  try{assert.equal(await shopeePricingDirectSupplierCost(123,'SEM-CUSTO'),null);}
  finally{
    globalThis.fetch=oldFetch;
    if(oldUrl===undefined)delete process.env.SUPABASE_URL;else process.env.SUPABASE_URL=oldUrl;
    if(oldKey===undefined)delete process.env.SUPABASE_SECRET_KEY;else process.env.SUPABASE_SECRET_KEY=oldKey;
  }
});
test('backend de prévia não requer Item ID e não grava planos de promoção',()=>{
 const server=read('server.js');
 const begin=server.indexOf("app.post('/api/shopee/optimizer/pricing/supplier-preview'");
 const end=server.indexOf("app.get('/api/shopee/optimizer/pricing/settings'",begin);
 assert.ok(begin>=0&&end>begin);
 const endpoint=server.slice(begin,end);
 assert.match(endpoint,/shopeePricingDirectSupplierCost\(auth.shopId,sku\)/);
 assert.match(endpoint,/listingVerified:false/);
 assert.match(endpoint,/saved:false/);
 assert.doesNotMatch(endpoint,/saveShopeePricePlan|update_price|add_discount|update_discount/);
});
test('tela moderna tem ajuda acessível e regras, etapas e auditoria recolhidas',()=>{
 const html=read('public/index.html');
 const app=read('public/app.js');
 const css=read('public/style.css');
 assert.equal((html.match(/id="optimizerSku"/g)||[]).length,1);
 for(const id of ['optimizerSupplierResult','optimizerQuickGross','optimizerQuickDiscount',
   'optimizerQuickMargin','optimizerRulesDetails','optimizerProgressDetails','optimizerAuditPanel'])
   assert.match(html,new RegExp('id="'+id+'"'));
 assert.match(html,/class="optimizer-panel optimizer-rules optimizer-v15-accordion"/);
 assert.match(html,/class="optimizer-panel optimizer-progress optimizer-v15-accordion"/);
 assert.match(html,/data-help="Informe a SKU do produto/);
 assert.match(html,/<details class="optimizer-panel optimizer-audit optimizer-v15-audit-details"/);
 assert.match(css,/\.optimizer-tip:hover::after/);
 assert.match(app,/json\('\/api\/shopee\/optimizer\/pricing\/supplier-preview'/);
 assert.match(app,/shPriceSupplierQuote/);
});
