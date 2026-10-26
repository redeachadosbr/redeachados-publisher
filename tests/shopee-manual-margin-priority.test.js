import test from 'node:test';
import assert from 'node:assert/strict';
import {quoteShopeePrice} from '../shopeePricing.js';
import {promotionFromQuote} from '../shopeeDiscountPublish.js';
const settings={marginPct:25,minMarginPct:5,discountPct:20,couponPct:1,taxPct:4};
test('margem manual tem prioridade à referência de mercado',()=>{
 const auto=quoteShopeePrice({unitCost:90,settings,marketAverage:120});
 const manual=quoteShopeePrice({unitCost:90,settings,marketAverage:120,marginOverride:true});
 assert.equal(manual.status,'MARGEM_MANUAL');
 assert.equal(manual.marginOverride,true);
 assert.ok(manual.netMarginPct>=25);
 assert.equal(manual.discountPct,20);
 assert.ok(manual.customerPrice>=auto.customerPrice);
});
test('sem mover a barra continua a cotação automática',()=>{
 const quote=quoteShopeePrice({unitCost:90,settings,marketAverage:120});
 assert.equal(quote.marginOverride,false);
 assert.notEqual(quote.status,'MARGEM_MANUAL');
});

test('SKU 684BR: barra de 5% respeita 0/9 nos dois valores e mantém margem mínima',()=>{
 const c={marginPct:5,minMarginPct:5,discountPct:20,couponPct:1,taxPct:4,
  flashPct:3,adsPct:0,shipping:0,packing:0,sellerType:'cpf',
  highVolumeCpf:false,commissionRates:[20,14,14,14],fixedFees:[4.5,16,20,26]};
 const q=quoteShopeePrice({unitCost:36.99,settings:c,marginOverride:true});
 assert.equal(q.status,'MARGEM_MANUAL');
 assert.equal(q.marginOverride,true);
 assert.equal(q.targetMarginPct,5);
 assert.equal(q.grossPrice,85.74);
 assert.equal(q.discountPct,20);
 assert.equal(q.marketplaceDisplayPrice,68.59);
 assert.equal(q.customerPrice,67.90);
 assert.equal(q.netProfit,8.07);
 assert.ok(q.netMarginPct>=5);
 assert.equal(q.priceEndingRuleVersion,4);
 assert.equal(q.priceEndingPolicy,'both_checkout_and_visible');
 assert.equal(Math.round(q.marketplaceDisplayPrice*100)%10,9);
 assert.equal(Math.round(q.customerPrice*100)%10,0);
});
test('alterar a barra para 15% recalcula tudo e mantém a margem acima da meta',()=>{
 for(const marginPct of [5,8,10,15,20,25]){
  const q=quoteShopeePrice({unitCost:36.99,settings:{marginPct,minMarginPct:5},
   marginOverride:true});
  assert.ok(q.netMarginPct+0.001>=marginPct);
  assert.ok([0,9].includes(Math.round(q.marketplaceDisplayPrice*100)%10));
  assert.ok([0,9].includes(Math.round(q.customerPrice*100)%10));
  assert.equal(q.targetMarginPct,marginPct);
  assert.equal(q.discountPct,20);
 }
});

test('prévia de desconto da margem manual preserva valores reais e não bloqueia cupom',()=>{
 const q=quoteShopeePrice({unitCost:36.99,
  settings:{marginPct:5,minMarginPct:5,discountPct:20,couponPct:1,taxPct:4,flashPct:3},
  marginOverride:true});
 const p=promotionFromQuote(q);
 assert.equal(p.gross,85.74);
 assert.equal(p.promo,68.59);
 assert.equal(p.buyerAfterCoupon,67.90);
 assert.equal(p.discountPct,20);
 assert.equal(q.appliedInShopee,false);
});

test('SKU 684BR: barra 10% repara R$ 66,59 / 65,92 antes de abrir desconto',()=>{
 const q=quoteShopeePrice({unitCost:36.99,settings:{
  marginPct:10,minMarginPct:5,discountPct:20,couponPct:1,taxPct:4,flashPct:3,
  commissionRates:[20,14,14,14],fixedFees:[4.5,16,20,26]
 },marginOverride:true});
 assert.equal(q.marketplaceDisplayPrice,68.59);
 assert.equal(q.customerPrice,67.90);
 assert.equal(q.grossPrice,85.74);
 assert.ok(q.netMarginPct>=10);
 const preview=promotionFromQuote(q);
 assert.deepEqual([preview.gross,preview.promo,preview.buyerAfterCoupon],[85.74,68.59,67.90]);
});
