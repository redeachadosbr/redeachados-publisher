import test from 'node:test';
import assert from 'node:assert/strict';
import {quoteShopeePrice,normalizeShopeePricingSettings} from '../shopeePricing.js';
import {discountPlanSnapshot} from '../shopeeDiscountPublish.js';

const settings={adsPct:0,taxPct:4,flashPct:3,packing:0,shipping:0,
 couponPct:1,marginPct:5,minMarginPct:5,discountPct:20,sellerType:'cnpj',
 commissionRates:[20,14,14,14],fixedFees:[4.5,16,20,26]};
const q=quoteShopeePrice({unitCost:55.99,settings:normalizeShopeePricingSettings(settings),marketAverage:99.91});
const snapshot=(originalPrice,existing=null)=>discountPlanSnapshot({
 shopId:'123',sku:'TEST-1',itemId:'58222065786',modelId:'0',discountId:'512820626272845',
 quote:{...q,sku:'TEST-1',itemId:'58222065786',modelId:'0'},
 record:{status:'ongoing',end_time:Math.floor(Date.now()/1000)+86400},
 existing,originalPrice
});
test('preço original um centavo acima do bruto aprovado exige autorização de atualização',()=>{
 const out=snapshot(q.grossPrice+0.01);
 assert.equal(out.needsBasePriceUpdate,true);
 assert.equal(out.action,'add');
 assert.equal(Math.round((out.originalPrice-out.gross)*100),1);
});
test('preço original um centavo abaixo também exige atualização',()=>{
 assert.equal(snapshot(q.grossPrice-0.01).needsBasePriceUpdate,true);
});
test('preço original idêntico em centavos não exige atualização',()=>{
 const out=snapshot(q.grossPrice);
 assert.equal(out.needsBasePriceUpdate,false);
});
test('campanha já existente só é considerada publicada quando preço bruto coincide nos centavos',()=>{
 const member={item_promotion_price:q.marketplaceDisplayPrice};
 assert.equal(snapshot(q.grossPrice+0.01,member).action,'update');
 assert.equal(snapshot(q.grossPrice,member).action,'already');
});
