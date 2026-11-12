import test from 'node:test';
import assert from 'node:assert/strict';
import {quoteShopeeKitPrice} from '../shopeePricing.js';
import {validateKitDiscountQuote} from '../shopeeKitDiscountService.js';

const settings={marginPct:15,minMarginPct:5,packing:2,shipping:1,
 discountPct:20,couponPct:1,taxPct:4,flashPct:3,adsPct:0};

function sampleQuote(){
 const q=quoteShopeeKitPrice({unitCost:23,settings});
 return {grossPrice:q.grossPrice,marketplacePrice:q.marketplaceDisplayPrice,
  afterCoupon:q.customerPrice,netMarginPct:q.netMarginPct,
  targetMarginPct:15,couponPct:q.couponPct,priceEndingRuleVersion:q.priceEndingRuleVersion};
}
const lastCent=value=>Math.round(value*100)%10;
const badCent=value=>(Math.round(value*100)+2)/100;

test('prévia do desconto aceita cotação v6 e cupom condicional do motor de kits',()=>{
 const quote=sampleQuote();
 assert.equal(quote.priceEndingRuleVersion,6);
 assert.ok(quote.netMarginPct>=quote.targetMarginPct);
 assert.ok([0,9].includes(lastCent(quote.marketplacePrice)));
 assert.equal(quote.afterCoupon,Math.round(quote.marketplacePrice*(1-quote.couponPct/100)*100)/100);
 assert.deepEqual(validateKitDiscountQuote(quote),{
  gross:quote.grossPrice,promo:quote.marketplacePrice,afterCoupon:quote.afterCoupon
 });
});

test('versão antiga continua exigindo recálculo sem mascarar o problema como margem',()=>{
 const quote=sampleQuote();
 assert.throws(()=>validateKitDiscountQuote({...quote,priceEndingRuleVersion:5}),
  /versão incompatível/);
});

test('desconto continua protegido contra margem insuficiente e finais inválidos',()=>{
 const quote=sampleQuote();
 assert.throws(()=>validateKitDiscountQuote({
  ...quote,netMarginPct:quote.targetMarginPct-1
 }),/margem líquida/);
 assert.throws(()=>validateKitDiscountQuote({
  ...quote,marketplacePrice:badCent(quote.marketplacePrice)
 }),/preço visível/);
 assert.throws(()=>validateKitDiscountQuote({
  ...quote,afterCoupon:badCent(quote.afterCoupon)
 }),/preço após cupom/);
 assert.throws(()=>validateKitDiscountQuote({
  ...quote,grossPrice:quote.marketplacePrice
 }),/Preço bruto ou desconto inválido/);
});

test('o desconto aceita centavos condicionais mas rejeita alterar o cupom ou o bruto',()=>{
 const q=sampleQuote();
 assert.ok([0,9].includes(lastCent(q.grossPrice)));
 assert.throws(()=>validateKitDiscountQuote({...q,couponPct:50}),/preço após cupom/);
 assert.throws(()=>validateKitDiscountQuote({...q,grossPrice:badCent(q.grossPrice)}),/preço bruto/);
});
