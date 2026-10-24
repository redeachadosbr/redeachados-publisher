import test from 'node:test';
import assert from 'node:assert/strict';
import {SHOPEE_ATTRACTIVE_CENTS,adjustShopeeCustomerPriceEnding,
 quoteShopeePrice,normalizeShopeePricingSettings,calculateShopeeSale} from '../shopeePricing.js';

const lastCents=price=>Math.round(price*100)%100;

test('preço final permite qualquer centavo terminado em 0 ou 9, inclusive ,40 e ,49',()=>{
 assert.equal(SHOPEE_ATTRACTIVE_CENTS.length,20);
 for(const ending of SHOPEE_ATTRACTIVE_CENTS)
  assert.ok(ending%10===0||ending%10===9,'Final inválido '+ending);
 assert.ok(SHOPEE_ATTRACTIVE_CENTS.includes(40));
 assert.ok(SHOPEE_ATTRACTIVE_CENTS.includes(49));
 for(const ending of [42,48,52,63])assert.equal(SHOPEE_ATTRACTIVE_CENTS.includes(ending),false);
});
test('reproduz SKU 303448: R$ 103,42 vira R$ 103,40 sem cair abaixo de 5% nem superar teto',()=>{
 const c=normalizeShopeePricingSettings({
  marginPct:8,minMarginPct:5,discountPct:22.7,couponPct:1,
  taxPct:4,flashPct:3,shipping:4,packing:0,adsPct:0,sellerType:'cpf',
  commissionRates:[20,14,14,14],fixedFees:[4.5,16,20,26]
 });
 const original=calculateShopeeSale(13514,c,5599);
 assert.equal(original.finalPrice,103.42);
 assert.equal(original.profit,5.71);
 const picked=adjustShopeeCustomerPriceEnding({
  grossCents:13514,settings:c,unitCostCents:5599,
  minimumMarginPct:5,maximumSaleCents:10342
 });
 assert.equal(picked.adjusted,true);
 assert.equal(picked.financial.finalPrice,103.40);
 assert.equal(picked.financial.gross,135.11);
 assert.ok(picked.financial.marginPct>=5);
 assert.ok(picked.financial.finalPrice<=103.42);
 assert.equal(Math.round(picked.financial.finalPrice*100)%10,0);
});
test('preço mostrado é o mesmo simulado após promoção e cupom, sem alterar somente a UI',()=>{
 for(const market of [null,103.42,109.90,150.87]){
  const quote=quoteShopeePrice({
   unitCost:55.99,marketAverage:market,
   settings:{
    marginPct:8,minMarginPct:5,discountPct:20,couponPct:1,
    shipping:4,packing:0,taxPct:4,flashPct:3
   }
  });
  assert.ok(lastCents(quote.customerPrice)%10===0||lastCents(quote.customerPrice)%10===9);
  assert.ok(quote.netMarginPct>=quote.minMarginPct-0.002);
  assert.equal(quote.attractiveEndingOptions.length,20);
  const simulation=calculateShopeeSale(
   Math.round(quote.grossPrice*100),
   normalizeShopeePricingSettings({...{
    marginPct:8,minMarginPct:5,discountPct:20,couponPct:1,
    shipping:4,packing:0,taxPct:4,flashPct:3},discountPct:quote.discountPct}),
   5599
  );
  assert.equal(simulation.finalPrice,quote.customerPrice);
  assert.equal(simulation.profit,quote.netProfit);
 }
});
test('se houver conflito entre terminação e margem/teto, o ajustador não inventa preço',()=>{
 const c=normalizeShopeePricingSettings({
  discountPct:22.7,couponPct:1,shipping:4,marginPct:8,minMarginPct:5,
  taxPct:4,flashPct:3
 });
 const result=adjustShopeeCustomerPriceEnding({
  grossCents:13514,settings:c,unitCostCents:5599,
  minimumMarginPct:5.52,maximumSaleCents:10342
 });
 assert.equal(result.adjusted,false);
 assert.match(result.reason,/margem|limites/);
});
