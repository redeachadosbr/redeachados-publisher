import test from 'node:test';
import assert from 'node:assert/strict';
import {quoteShopeePrice} from '../shopeePricing.js';
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
