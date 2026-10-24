import test from 'node:test';
import assert from 'node:assert/strict';
import {quoteShopeePrice,normalizeShopeePricingSettings,
 calculateShopeeSale} from '../shopeePricing.js';
import {promotionFromQuote} from '../shopeeDiscountPublish.js';

const settings={adsPct:0,taxPct:4,flashPct:3,packing:0,shipping:0,
 couponPct:1,marginPct:5,minMarginPct:5,discountPct:20,sellerType:'cnpj',
 commissionRates:[20,14,14,14],fixedFees:[4.5,16,20,26]};
const ends09=v=>[0,9].includes(Math.round(v*100)%10);
test('regressão SKU 303448: 122,84 menos 20% exibe 98,27, cupom opcional resulta 97,29',()=>{
 const before=calculateShopeeSale(12284,normalizeShopeePricingSettings(settings),5599);
 assert.equal(before.marketplaceDisplayPrice,98.27);
 assert.equal(before.finalPrice,97.29);
 assert.equal(before.profit,4.87);
 assert.equal(Number(before.marginPct.toFixed(3)),5.006);
 assert.equal(ends09(before.marketplaceDisplayPrice),false);
 assert.equal(ends09(before.finalPrice),true);
});
test('novas cotações garantem finais 0/9 na Shopee visível E no checkout eventual com cupom, margem >=5%',()=>{
 const q=quoteShopeePrice({unitCost:55.99,settings,marketAverage:99.91});
 assert.equal(q.priceEndingRuleVersion,2);
 assert.equal(q.grossPrice,123.24);
 assert.equal(q.marketplaceDisplayPrice,98.59);
 assert.equal(q.customerPrice,97.60);
 assert.equal(q.buyerAfterCoupon,97.60);
 assert.equal(q.netProfit,5.12);
 assert.ok(q.netMarginPct>=5);
 assert.ok(ends09(q.marketplaceDisplayPrice));
 assert.ok(ends09(q.customerPrice));
 assert.ok(q.marketplaceDisplayPrice<=99.91);
 const promo=promotionFromQuote(q);
 assert.equal(promo.gross,q.grossPrice);
 assert.equal(promo.promo,q.marketplaceDisplayPrice);
 assert.equal(promo.buyerAfterCoupon,q.customerPrice);
});
test('impede publicar cotação nova com preço de vitrine adulterado ou sem final comercial',()=>{
 const quote=quoteShopeePrice({unitCost:55.99,settings,marketAverage:99.91});
 assert.throws(()=>promotionFromQuote({...quote,marketplaceDisplayPrice:98.27}),/visível divergente/);
 assert.throws(()=>promotionFromQuote({...quote,
   priceEndingRuleVersion:2,marketplaceDisplayPrice:98.59,customerPrice:97.31}),/não confere/);
});
test('sem cupom não introduz cobrança condicional: preço da vitrine e final coincidem',()=>{
 const q=quoteShopeePrice({unitCost:55.99,settings:{...settings,couponPct:0}});
 assert.equal(q.marketplaceDisplayPrice,q.customerPrice);
 assert.ok(ends09(q.marketplaceDisplayPrice));
 assert.ok(q.netMarginPct>=5);
});
