import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {quoteShopeePrice,normalizeShopeePricingSettings} from '../shopeePricing.js';

const settings={marginPct:10,minMarginPct:5,discountPct:20,couponPct:1,taxPct:4,
 flashPct:3,adsPct:0,shipping:0,packing:0,sellerType:'cpf',highVolumeCpf:false,
 commissionRates:[20,14,14,14],fixedFees:[4.5,16,20,26]};

test('Sem checkbox Ads não há custo adicional na cotação',()=>{
 const out=quoteShopeePrice({unitCost:99.99,settings});
 assert.equal(out.breakdown.ads,0);
 assert.ok(out.netMarginPct>=9.99);
});
test('Reserva de Ads entra na cotação antes da margem e eleva o preço protegido',()=>{
 const base=quoteShopeePrice({unitCost:99.99,settings});
 const planned=quoteShopeePrice({unitCost:99.99,settings:{...settings,adsPct:10}});
 assert.ok(planned.breakdown.ads>0);
 assert.ok(planned.grossPrice>base.grossPrice);
 assert.ok(planned.netMarginPct>=9.99);
 assert.equal(planned.breakdown.ads,Math.round(planned.customerPrice*10)/100);
});
test('Taxa Ads aceita valores separados por SKU sem afetar configuração original',()=>{
 const x=normalizeShopeePricingSettings({...settings,adsPct:6});
 const y=normalizeShopeePricingSettings({...settings,adsPct:0});
 assert.equal(x.adsPct,6);assert.equal(y.adsPct,0);assert.equal(settings.adsPct,0);
});
test('Checkbox único na Precificação e relatório Ads sempre visível',()=>{
 const html=readFileSync(new URL('../public/index.html',import.meta.url),'utf8');
 assert.equal((html.match(/id="priceAdsEnabled"/g)||[]).length,1);
 assert.equal((html.match(/id="priceAds"/g)||[]).length,1);
 assert.ok(html.includes('id="adsPricingRows"'));
 assert.ok(html.indexOf('id="adsPricingRows"')<html.indexOf('id="adsSummary"'));
});
