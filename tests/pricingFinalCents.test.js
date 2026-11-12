import test from 'node:test';
import assert from 'node:assert/strict';
import {SHOPEE_ATTRACTIVE_CENTS,adjustShopeeCustomerPriceEnding,
 quoteShopeePrice,quoteShopeeKitPrice,quoteShopeeOptimizationPrice,normalizeShopeePricingSettings,calculateShopeeSale} from '../shopeePricing.js';

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
  taxPct:4,flashPct:3,shipping:0,packing:0,adsPct:0,sellerType:'cpf',
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
  discountPct:22.7,couponPct:1,shipping:0,marginPct:8,minMarginPct:5,
  taxPct:4,flashPct:3
 });
 const result=adjustShopeeCustomerPriceEnding({
  grossCents:13514,settings:c,unitCostCents:5599,
  minimumMarginPct:5.52,maximumSaleCents:10342
 });
 assert.equal(result.adjusted,false);
 assert.match(result.reason,/margem|limites/);
});

test('SKU 2392: custo R$569,99 e margem 5% geram preco com dois finais 0/9 sem travar',()=>{
 const settings=normalizeShopeePricingSettings({
  marginPct:5,minMarginPct:5,discountPct:20,couponPct:1,
  taxPct:4,flashPct:3,adsPct:0,shipping:0,packing:0,
  sellerType:'cnpj',commissionRates:[20,14,14,14],fixedFees:[4.5,16,20,26]
 });
 const q=quoteShopeePrice({unitCost:569.99,settings});
 assert.equal(q.unitCost,569.99);
 assert.ok(q.netMarginPct>=5);
 assert.equal(Math.round(q.marketplaceDisplayPrice*100)%10===0||
  Math.round(q.marketplaceDisplayPrice*100)%10===9,true);
 assert.equal(Math.round(q.customerPrice*100)%10===0||
  Math.round(q.customerPrice*100)%10===9,true);
 assert.ok(q.customerPrice>=810.40,'Primeiro preco duplamente valido deve proteger a margem');
 const simulated=calculateShopeeSale(Math.round(q.grossPrice*100),settings,56999);
 assert.equal(simulated.finalPrice,q.customerPrice);
});

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

test('Otimização de anúncios: desconto variável dos kits na SKU 305350, sem fixar 20%',()=>{
 const settings=normalizeShopeePricingSettings({
  marginPct:15,minMarginPct:5,discountPct:20,couponPct:1,
  sellerType:'cnpj',commissionRates:[20,14,14,14],fixedFees:[4.5,16,20,26]
 });
 const q=quoteShopeeOptimizationPrice({unitCost:91.99,settings,marginOverride:true});
 assert.equal(q.variableDiscount,true);
 assert.equal(q.maxDiscountPct,50);
 assert.equal(q.grossMultiplier,3);
 assert.ok(q.grossPrice<=Math.round(91.99*300)/100+0.01);
 assert.ok(q.discountPct>0&&q.discountPct<=50);
 assert.notEqual(q.discountPct,20,'A taxa antiga não pode ser fixa na SKU 305350');
 assert.ok(q.netMarginPct>=15);
 assert.equal(q.priceEndingRuleVersion,6);
 assert.equal(q.priceEndingPolicy,'listed_price_coupon_conditional');
 for(const value of [q.grossPrice,q.marketplaceDisplayPrice])
  assert.ok([0,9].includes(Math.round(value*100)%10),'Final 0/9: '+value);
 const same=calculateShopeeSale(Math.round(q.grossPrice*100),
  {...settings,discountPct:q.discountPct},9199);
 assert.equal(same.finalPrice,q.customerPrice);
 assert.equal(same.marketplaceDisplayPrice,q.marketplaceDisplayPrice);
 assert.equal(same.profit,q.netProfit);
});
test('Otimização: margem da barra muda cálculo e não ultrapassa desconto máximo',()=>{
 const settings=normalizeShopeePricingSettings({marginPct:15,minMarginPct:5,couponPct:1,
  sellerType:'cnpj',taxPct:4,flashPct:3});
 const a=quoteShopeeOptimizationPrice({unitCost:50.47,settings,marginOverride:true});
 const b=quoteShopeeOptimizationPrice({unitCost:50.47,settings:{...settings,marginPct:30},marginOverride:true});
 assert.ok(a.netMarginPct>=15&&b.netMarginPct>=30);
 assert.notEqual(a.customerPrice,b.customerPrice,'Margem deve alterar preço final');
 assert.ok(a.discountPct<=50&&b.discountPct<=50);
});
test('Otimização: referência de mercado inviável rejeita sem inventar desconto',()=>{
 const settings=normalizeShopeePricingSettings({marginPct:15,minMarginPct:5,couponPct:1,
  sellerType:'cnpj',taxPct:4,flashPct:3});
 // No modo de margem manual, o motor produz uma cotação segura.
 const q=quoteShopeeOptimizationPrice({unitCost:91.99,settings,marginOverride:true});
 assert.ok(q.netMarginPct>=15);
 assert.ok(q.discountPct>0&&q.discountPct<=50);
 for(const value of [q.grossPrice,q.marketplaceDisplayPrice,q.customerPrice])
  assert.ok([0,9].includes(Math.round(value*100)%10));
 // O mercado abaixo da margem/terminações não deve gerar cotação falsa.
 assert.throws(()=>quoteShopeeOptimizationPrice({unitCost:91.99,settings,marketAverage:180}),
  /Desconto variável inviável/);
});
