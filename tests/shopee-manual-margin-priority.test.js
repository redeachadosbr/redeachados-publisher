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

test('SKU 684BR: barra em 5% deve aproximar margem real de 5%, sem inflar para 11,89%',()=>{
 const c={marginPct:5,minMarginPct:5,discountPct:20,couponPct:1,taxPct:4,
  flashPct:3,adsPct:0,shipping:0,packing:0,sellerType:'cpf',
  highVolumeCpf:false,commissionRates:[20,14,14,14],fixedFees:[4.5,16,20,26]};
 const q=quoteShopeePrice({unitCost:36.99,settings:c,marginOverride:true});
 assert.equal(q.status,'MARGEM_MANUAL');
 assert.equal(q.marginOverride,true);
 assert.equal(q.targetMarginPct,5);
 assert.equal(q.grossPrice,77.12);
 assert.equal(q.discountPct,20);
 assert.equal(q.marketplaceDisplayPrice,61.70);
 assert.equal(q.customerPrice,61.08);
 assert.equal(q.netProfit,3.10);
 assert.ok(q.netMarginPct>=5&&q.netMarginPct<5.25);
 assert.equal(q.priceEndingPolicy,'visible_price_margin_priority');
 assert.equal(Math.round(q.marketplaceDisplayPrice*100)%10,0);
 // Com cupom opcional, a terminação do checkout não deve forçar +6,89 pontos.
 assert.equal(Math.round(q.customerPrice*100)%100,8);
});
test('alterar a barra para 15% recalcula tudo e mantém a margem acima da meta',()=>{
 for(const marginPct of [5,8,10,15,20,25]){
  const q=quoteShopeePrice({unitCost:36.99,settings:{marginPct,minMarginPct:5},
   marginOverride:true});
  assert.ok(q.netMarginPct+0.001>=marginPct);
  assert.ok(q.netMarginPct<marginPct+1.5,
   'Margem '+marginPct+'% não deve virar lucro artificial de '+q.netMarginPct+'%');
  assert.equal(q.targetMarginPct,marginPct);
  assert.equal(q.discountPct,20);
 }
});

test('prévia de desconto da margem manual preserva valores reais e não bloqueia cupom',()=>{
 const q=quoteShopeePrice({unitCost:36.99,
  settings:{marginPct:5,minMarginPct:5,discountPct:20,couponPct:1,taxPct:4,flashPct:3},
  marginOverride:true});
 const p=promotionFromQuote(q);
 assert.equal(p.gross,77.12);
 assert.equal(p.promo,61.70);
 assert.equal(p.buyerAfterCoupon,61.08);
 assert.equal(p.discountPct,20);
 assert.equal(q.appliedInShopee,false);
});
