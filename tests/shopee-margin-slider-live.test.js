import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {quoteShopeeOptimizationPrice} from '../shopeePricing.js';

const app=readFileSync(new URL('../public/app.js',import.meta.url),'utf8');
const server=readFileSync(new URL('../server.js',import.meta.url),'utf8');
const defaults={minMarginPct:5,discountPct:20,couponPct:1,taxPct:4,flashPct:0,
 adsPct:0,shipping:0,packing:0,sellerType:'cpf',highVolumeCpf:false,
 commissionRates:[20,14,14,14],fixedFees:[4.5,16,20,26]};

test('barra de margem envia o percentual exato ao backend e ignora resposta anterior',()=>{
 const begin=app.indexOf('async function shPricePrepare(');
 const end=app.indexOf('let shQuickMarginTimer=',begin);
 const request=app.slice(begin,end);
 assert.ok(begin>0&&end>begin);
 assert.match(request,/const requestedMargin=Number\(\$\('#optimizerQuickMargin'\)\.value\)/);
 assert.match(request,/requestedSettings\.marginPct=requestedMargin/);
 assert.match(request,/marginPct:requestedMargin/);
 assert.match(request,/revision!==shPriceMarginRevision/);
 assert.match(request,/Number\(d\.quote\?\.targetMarginPct\)!==requestedMargin/);
 assert.match(app,/function shPriceMarginMarkDirty\(\)/);
 assert.match(app,/optimizerDiscountFinalQuote=null;/);
 assert.match(app,/shPriceMarginMarkDirty\(\)/);
 assert.match(app,/keepManualMargin&&Number\.isFinite\(manualMargin\)/);
 assert.match(server,/const pricingSettings=manualMargin===null\?sourceSettings/);
 assert.match(server,/marginPct:manualMargin/);
 assert.match(server,/const settings=\{\.\.\.pricingSettings,adsPct:adsBudgetPct/);
});
test('SKU PL001.U02: 3%, 12% e 24% produzem preço e desconto diferentes',()=>{
 const quote=marginPct=>quoteShopeeOptimizationPrice({
  unitCost:10.99,settings:{...defaults,marginPct},marginOverride:true});
 const low=quote(3),medium=quote(12),high=quote(24);
 assert.equal(low.targetMarginPct,3);
 assert.equal(medium.targetMarginPct,12);
 assert.equal(high.targetMarginPct,24);
 // Piso comercial de 5% permanece mesmo com slider em 3%.
 assert.ok(low.netMarginPct>=5);
 assert.ok(low.netMarginPct<8,'3% não pode continuar com margem 21,27%');
 assert.ok(medium.netMarginPct>=12&&medium.netMarginPct<14);
 assert.ok(high.netMarginPct>=24&&high.netMarginPct<26);
 assert.ok(low.marketplaceDisplayPrice<medium.marketplaceDisplayPrice);
 assert.ok(medium.marketplaceDisplayPrice<high.marketplaceDisplayPrice);
 assert.ok(low.discountPct>medium.discountPct&&medium.discountPct>high.discountPct);
 assert.ok(Math.abs(low.marketplaceDisplayPrice-22.10)<0.02);
 assert.ok(Math.abs(medium.marketplaceDisplayPrice-24.49)<0.02);
 for(const q of [low,medium,high]){
  assert.equal(q.priceEndingRuleVersion,6);
  assert.equal(q.priceEndingPolicy,'listed_price_coupon_conditional');
  for(const n of [q.grossPrice,q.marketplaceDisplayPrice])
   assert.ok([0,9].includes(Math.round(n*100)%10),'Valor anunciado '+n);
  assert.equal(q.appliedInShopee,false);
  assert.ok(q.grossPrice<=3*10.99+0.01);
 }
});
test('a tela não oculta o desvio quando terminações 0/9 impedem atingir exatamente a meta',()=>{
 assert.match(app,/real · meta/);
 assert.match(app,/O cupom de /);
 const q=quoteShopeeOptimizationPrice({unitCost:10.99,
   settings:{...defaults,marginPct:12},marginOverride:true});
 if(q.netMarginPct>12.3)assert.match(q.notice,/margem escolhida é um mínimo/i);
});

test('a cotação manual não altera o cupom nem descarta seu custo',()=>{
 const q=quoteShopeeOptimizationPrice({unitCost:10.99,
  settings:{...defaults,marginPct:12},marginOverride:true});
 assert.equal(q.couponPct,1);
 assert.ok(q.customerPrice<q.marketplaceDisplayPrice);
 assert.ok(q.netMarginPct<14);
 assert.ok(q.netProfit>0);
});
