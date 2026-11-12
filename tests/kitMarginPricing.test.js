import test from 'node:test';
import assert from 'node:assert/strict';
import {quoteShopeeKitPrice,normalizeShopeePricingSettings,calculateShopeeSale} from '../shopeePricing.js';

test('kit WeDrop usa bruto de até 3x e margem líquida da barra sem degraus do cupom',()=>{
  const settings=normalizeShopeePricingSettings({
    marginPct:15,minMarginPct:5,couponPct:1,taxPct:4,flashPct:3,
    packing:0,shipping:0,adsPct:0
  });
  for(const cost of [23,50.47,71.47,100,250]){
    const q=quoteShopeeKitPrice({unitCost:cost,settings});
    assert.equal(q.grossMultiplier,3);
    assert.equal(q.priceEndingRuleVersion,6);
    assert.equal(q.priceEndingPolicy,'listed_price_coupon_conditional');
    assert.ok(q.grossPrice<=Math.round(cost*300)/100+0.001);
    assert.ok(q.discountPct>0&&q.discountPct<=50);
    assert.ok(q.netMarginPct+0.002>=15);
    for(const price of [q.grossPrice,q.marketplaceDisplayPrice])
      assert.ok([0,9].includes(Math.round(price*100)%10),'Centavos do anúncio 0/9: '+price);
    const simulation=calculateShopeeSale(
      Math.round(q.grossPrice*100),{...settings,discountPct:q.discountPct},
      Math.round(cost*100)
    );
    assert.equal(simulation.marketplaceDisplayPrice,q.marketplaceDisplayPrice);
    assert.equal(simulation.finalPrice,q.customerPrice);
    assert.equal(simulation.profit,q.netProfit);
  }
  const extra=quoteShopeeKitPrice({unitCost:50.47,
    settings:{...settings,packing:2,shipping:1}});
  assert.ok(extra.grossPrice<=Math.round((50.47+2+1)*300)/100+0.001);
});

test('barra de 15% do kit de R$ 21,18 não fica presa em 22,62% pelo cupom',()=>{
  const settings=normalizeShopeePricingSettings({
    marginPct:15,minMarginPct:5,couponPct:1,taxPct:4,flashPct:0,
    packing:0,shipping:0,adsPct:0
  });
  const low=quoteShopeeKitPrice({unitCost:21.18,settings});
  const high=quoteShopeeKitPrice({unitCost:21.18,
    settings:{...settings,marginPct:20}});
  assert.ok(low.netMarginPct>=15&&low.netMarginPct<17,
    'Margem real precisa se aproximar de 15%, não saltar para 22,62%');
  assert.ok(low.marketplaceDisplayPrice<48.59);
  assert.ok(high.netMarginPct>=20);
  assert.ok(high.marketplaceDisplayPrice>low.marketplaceDisplayPrice);
  assert.ok(low.discountPct>high.discountPct);
  for(const q of [low,high]){
    assert.equal(q.priceEndingRuleVersion,6);
    assert.ok([0,9].includes(Math.round(q.grossPrice*100)%10));
    assert.ok([0,9].includes(Math.round(q.marketplaceDisplayPrice*100)%10));
    assert.equal(q.customerPrice,Math.round(q.marketplaceDisplayPrice*99)/100);
  }
});

test('subir a barra dos kits nunca reduz o preço anunciado nem viola a margem',()=>{
  const settings=normalizeShopeePricingSettings({
    minMarginPct:5,couponPct:1,taxPct:4,flashPct:0,adsPct:0
  });
  for(const cost of [21.18,36.99,71.47]){
    let previous=0;
    for(const marginPct of [5,10,15,20,25]){
      const q=quoteShopeeKitPrice({unitCost:cost,settings:{...settings,marginPct}});
      assert.ok(q.netMarginPct+0.002>=marginPct);
      assert.ok(q.marketplaceDisplayPrice+0.0001>=previous,
        'Preço invertido para custo '+cost+' e margem '+marginPct);
      previous=q.marketplaceDisplayPrice;
    }
  }
});

