import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {quoteShopeePrice,normalizeShopeePricingSettings,
  minimumGrossForNetMargin,calculateShopeeSale} from '../shopeePricing.js';
test('bruto, desconto, cupom, custo e margem 5% ficam separados',()=>{
  const q=quoteShopeePrice({unitCost:99.99});
  assert.equal(q.discountPct,20);
  assert.ok(q.grossPrice>q.customerPrice);
  assert.ok(q.netProfit>0&&q.netMarginPct>=25);
  assert.equal(q.appliedInShopee,false);
  assert.equal(q.minMarginPct,5);
  assert.equal(q.breakdown.unitCost,99.99);
  assert.ok(q.breakdown.tax>0&&q.breakdown.flash>0&&q.breakdown.couponDiscount>0);
});
test('ajusta desconto automaticamente somente se a média permite preservar 5%',()=>{
  const base=quoteShopeePrice({unitCost:99.99});
  const market=Number((base.customerPrice-12).toFixed(2));
  const q=quoteShopeePrice({unitCost:99.99,marketAverage:market});
  assert.ok(q.discountPct>20);
  assert.ok(q.customerPrice<=market);
  assert.ok(q.netMarginPct>=5);
  assert.equal(q.status,'COMPETITIVO');
});
test('mercado abaixo do piso não força prejuízo',()=>{
  const q=quoteShopeePrice({unitCost:99.99,marketAverage:100});
  assert.equal(q.status,'MERCADO_ABAIXO_DO_PISO');
  assert.ok(q.customerPrice>100);
  assert.ok(q.netMarginPct>=5);
});
test('limiares e itens baratos permanecem protegidos',()=>{
  for(const cost of [1.5,5,15,35,99.99,140,450]){
    for(const margin of [5,15,25,35,50]){
      const q=quoteShopeePrice({unitCost:cost,settings:{marginPct:margin}});
      assert.ok(q.netMarginPct+0.005>=margin,
        'margem caiu abaixo de '+margin+'% no custo '+cost);
    }
  }
});
test('edicoes manuais e tarifas por faixa refletem no lucro',()=>{
  const a=quoteShopeePrice({unitCost:100});
  const b=quoteShopeePrice({unitCost:100,
    settings:{taxPct:5,flashPct:4,couponPct:2,adsPct:3,
      shipping:15,packing:2,sellerType:'cpf',highVolumeCpf:true}});
  assert.ok(b.grossPrice>a.grossPrice);
  assert.ok(b.breakdown.cpfExtra>=3);
});
test('configuracao invalida e falta custo bloqueiam recomendacao',()=>{
  assert.throws(()=>quoteShopeePrice({unitCost:0}),/Custo/);
  assert.throws(()=>normalizeShopeePricingSettings({minMarginPct:-1}),/inválido/);
  assert.throws(()=>normalizeShopeePricingSettings({fixedFees:[0]}),/Tabela/);
});
test('painel tem uma SKU, mostra bruto e desconto e guarda mesmos valores na pagina de Descontos',()=>{
  const html=fs.readFileSync(new URL('../public/index.html',import.meta.url),'utf8');
  const app=fs.readFileSync(new URL('../public/app.js',import.meta.url),'utf8');
  const srv=fs.readFileSync(new URL('../server.js',import.meta.url),'utf8');
  assert.equal((html.match(/id="optimizerSku"/g)||[]).length,1);
  assert.ok(html.includes('id="priceGross"')&&html.includes('id="pricePromoPct"'));
  assert.ok(html.includes('id="discountGross"')&&html.includes('id="discountPct"'));
  assert.ok(html.includes('id="tab-discounts"'));
  assert.ok(app.includes('shPriceSaveSelection(shPriceSelection)'));
  assert.ok(app.includes("json('/api/shopee/optimizer/pricing/prepare'"));
  assert.ok(app.includes('shDiscountChoose(chosen)'));
  assert.ok(srv.includes("app.get('/api/shopee/optimizer/pricing/recent'"));
  assert.ok(!srv.includes("app.post('/api/shopee/optimizer/pricing/apply'"));
});
