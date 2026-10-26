import test from 'node:test';
import assert from 'node:assert/strict';
import {
 SHOPEE_ATTRACTIVE_CENTS,normalizeShopeePricingSettings,
 quoteShopeePrice,calculateShopeeSale,adjustShopeeCustomerPriceEnding
} from '../shopeePricing.js';
import {promotionFromQuote} from '../shopeeDiscountPublish.js';

const cents=amount=>Math.round(amount*100);
const ending=amount=>((cents(amount)%100)+100)%100;

test('All the customer-price ending options are enabled',()=>{
 assert.deepEqual(SHOPEE_ATTRACTIVE_CENTS,Array.from({length:10},(_,i)=>[i*10,i*10+9]).flat());
});

test('R$ 63,82 becomes R$ 63,89 when R$ 63,79 breaks an 8% margin',()=>{
 const settings=normalizeShopeePricingSettings({
  marginPct:8,minMarginPct:8,discountPct:20,couponPct:1,
  sellerType:'cnpj',taxPct:0,flashPct:0,adsPct:0,
  commissionRates:[0,0,0,0],fixedFees:[0,0,0,0]
 });
 const from=calculateShopeeSale(8057,settings,5870);
 assert.equal(from.saleCents,6382);
 const rounded=adjustShopeeCustomerPriceEnding({
  grossCents:8057,settings,unitCostCents:5870,minimumMarginPct:8
 });
 assert.equal(rounded.financial.saleCents,6389);
 assert.equal(rounded.grossCents,8067);
 assert.ok(rounded.financial.marginPct>=8);
 assert.equal(rounded.adjusted,true);
});

test('Closest attractive end is preferred when downward rounding is safe',()=>{
 const settings=normalizeShopeePricingSettings({
  discountPct:20,couponPct:1,
  sellerType:'cnpj',taxPct:0,flashPct:0,adsPct:0,
  commissionRates:[0,0,0,0],fixedFees:[0,0,0,0]
 });
 const rounded=adjustShopeeCustomerPriceEnding({
  grossCents:8057,settings,unitCostCents:5000,minimumMarginPct:0
 });
 assert.equal(rounded.financial.saleCents,6379);
});

test('Never violate market ceiling or margin to force a psychological ending',()=>{
 const settings=normalizeShopeePricingSettings({
  discountPct:20,couponPct:1,sellerType:'cnpj',
  taxPct:0,flashPct:0,adsPct:0,commissionRates:[0,0,0,0],
  fixedFees:[0,0,0,0]
 });
 const rounded=adjustShopeeCustomerPriceEnding({
  grossCents:8057,settings,unitCostCents:5870,
  minimumMarginPct:8,maximumSaleCents:6382
 });
 assert.equal(rounded.adjusted,false);
 assert.equal(rounded.financial.saleCents,6382);
 assert.ok(rounded.reason);
});

test('For varied SKUs quote, displayed price and real promotion agree',()=>{
 for(const unitCost of [12.99,36.99,79.99,170,399]){
  const raw={marginPct:8,minMarginPct:5,discountPct:20,couponPct:1,
   taxPct:4,flashPct:3};
  const quote=quoteShopeePrice({unitCost,settings:raw});
  const endingOk=SHOPEE_ATTRACTIVE_CENTS.includes(ending(quote.customerPrice));
  assert.ok(endingOk||quote.notice.includes('Sem terminação atrativa'),
   'Unexpected end on quote for cost '+unitCost);
  const details=calculateShopeeSale(cents(quote.grossPrice),
   normalizeShopeePricingSettings(raw),cents(unitCost));
  assert.equal(quote.customerPrice,details.finalPrice);
  assert.equal(quote.netProfit,details.profit);
  assert.equal(quote.netMarginPct,Number(details.marginPct.toFixed(3)));
  assert.ok(details.marginPct+1e-8>=quote.minMarginPct);
  const payload=promotionFromQuote(quote);
  assert.ok(Math.abs(payload.buyerAfterCoupon-quote.customerPrice)<=0.02);
  assert.equal(payload.gross,quote.grossPrice);
 }
});

test('Seller-defined margin and market references are preserved by ending rule',()=>{
 const settings={marginPct:8,minMarginPct:5,discountPct:20,couponPct:1,
  taxPct:4,flashPct:3};
 for(const marketAverage of [55,70,100,225]){
  const q=quoteShopeePrice({unitCost:36.99,settings,marketAverage});
  assert.ok(q.netMarginPct+0.002>=q.minMarginPct);
  assert.equal(q.marketGapPct,Number(((q.customerPrice/marketAverage-1)*100).toFixed(2)));
  if(q.status==='COMPETITIVO'&&q.customerPriceBeforeRounding<=marketAverage)
   assert.ok(q.customerPrice<=marketAverage+0.000001);
 }
});
