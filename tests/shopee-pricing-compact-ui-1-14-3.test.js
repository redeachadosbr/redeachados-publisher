import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const html=readFileSync(new URL('../public/index.html',import.meta.url),'utf8');
const js=readFileSync(new URL('../public/app.js',import.meta.url),'utf8');
const server=readFileSync(new URL('../server.js',import.meta.url),'utf8');
const page=(id,end)=>html.slice(html.indexOf('id="tab-'+id+'"'),html.indexOf('id="tab-'+end+'"'));
test('precificação aparece no submenu próprio sem segunda digitação da SKU',()=>{
  assert.match(html,/data-tab="pricing" data-page="precificacao"/);
  assert.match(html,/id="tab-pricing"/);
  assert.match(server,/'precificacao'/);
  assert.equal((html.match(/id="optimizerSku"/g)||[]).length,1);
  assert.equal((html.match(/id="optimizerPricingPanel"/g)||[]).length,1);
  assert.equal((html.match(/id="optimizerQuickMargin"/g)||[]).length,1);
});
test('Otimização mostra somente barra e os valores; custos ficam recolhidos na página Precificação',()=>{
  const optimizer=page('optimizer','pricing'),pricing=page('pricing','discounts');
  for(const field of ['optimizerQuickMargin','optimizerQuickGross','optimizerQuickDiscount',
      'optimizerQuickFinal','optimizerQuickProfit','optimizerQuickStatus'])
    assert.match(optimizer,new RegExp('id="'+field+'"'));
  assert.doesNotMatch(optimizer,/id="priceMinMargin"/);
  assert.doesNotMatch(optimizer,/id="priceFlash"/);
  assert.match(pricing,/<details class="sh-price-advanced sh-price-settings-collapsed" id="priceSettingsDetails">/);
  for(const field of ['priceMargin','priceMinMargin','priceDiscount','priceTax','priceFlash',
      'priceCoupon','priceGross','pricePromoPct','priceFinal','priceProfit'])
    assert.match(pricing,new RegExp('id="'+field+'"'));
  assert.doesNotMatch(pricing,/<details[^>]*id="priceSettingsDetails"[^>]*\sopen/);
});
test('busca SKU inicia ao digitar com debounce, compartilha resultado e margem',()=>{
  assert.match(js, /optimizerSku'\)\?\.addEventListener\?\.\('input'/);
  assert.match(js,/setTimeout\(\(\)=>void optimizerFindSku\(\),1000\)/);
  assert.match(js,/optimizerSkuRequest\.abort\(\)/);
  assert.match(js,/optimizerQuickGross'\)\.textContent=shPriceMoney\(q\.grossPrice\)/);
  assert.match(js,/optimizerQuickDiscount'\)\.textContent=shPricePercent\(q\.discountPct\)/);
  assert.match(js,/optimizerQuickMargin'\)\?\.addEventListener\?\.\('input'/);
  assert.match(js,/shPriceSaveSelection\(shPriceSelection\)/);
  assert.match(js,/shDiscountLoadLatest/);
});
