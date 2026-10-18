import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const html=readFileSync(new URL('../public/index.html',import.meta.url),'utf8');
const app=readFileSync(new URL('../public/app.js',import.meta.url),'utf8');
const css=readFileSync(new URL('../public/style.css',import.meta.url),'utf8');
const server=readFileSync(new URL('../server.js',import.meta.url),'utf8');
const page=html.slice(html.indexOf('id="tab-pricing"'),html.indexOf('id="tab-discounts"'));
test('v1.19.5 Precificação tem sete KPIs, margem funcional, card bruto e rodapé de ações',()=>{
  for(const id of ['pricingSummarySku','pricingSummaryCost','pricingSummaryTarget',
    'pricePromoPct','priceFinal','priceProfit','priceMarginActual',
    'priceMargin','priceMarginLabel','pricingMarginMinus','pricingMarginPlus','pricingMarginValue',
    'priceResults','priceGross','priceStatus','priceSaveInfo','priceBreakdown',
    'priceRecalculate','priceOpenDiscounts','priceSettingsDetails']){
    assert.equal((page.match(new RegExp('id="'+id+'"','g'))||[]).length,1,id);
  }
  assert.equal((page.match(/class="pricing-v2-summary-item"/g)||[]).length,7);
  assert.match(page,/class="pricing-v2-columns"/);
  assert.match(page,/class="pricing-v2-summary"/);
  assert.match(page,/class="sh-price-hero pricing-v2-gross"/);
  assert.match(page,/class="pricing-v2-footer"/);
  assert.match(page,/<details class="sh-price-advanced sh-price-settings-collapsed" id="priceSettingsDetails">/);
  assert.match(page,/<details class="sh-price-advanced pricing-v2-breakdown">/);
  assert.match(html,/style\.css\?v=1\.19\.5/);
  assert.match(html,/app\.js\?v=1\.19\.5/);
  assert.match(server,/version:'1\.19\.5'/);
});
test('todos os campos oficiais salvos continuam disponíveis, recolhidos por padrão',()=>{
  for(const id of ['priceMinMargin','priceDiscount','priceTax','priceFlash','priceCoupon',
    'priceMarketAvg','priceAds','priceFreight','pricePackaging','priceSellerType','priceHighVolume',
    ...[0,1,2,3].flatMap(n=>['priceRate'+n,'priceFee'+n])]){
    assert.equal((page.match(new RegExp('id="'+id+'"','g'))||[]).length,1,id);
  }
  assert.doesNotMatch(page,/<details[^>]*id="priceSettingsDetails"[^>]*\sopen/);
  assert.equal((html.match(/id="optimizerSku"/g)||[]).length,1);
});
test('cálculo real alimenta os KPIs, conserva planilha WeDrop e protege falhas',()=>{
  assert.match(app,/pricingShowSelection\(selected\)/);
  assert.match(app,/pricingSummaryCost'\)\.textContent=shPriceMoney\(q\.unitCost\)/);
  assert.match(app,/pricingSummaryTarget'\);if\(summary\)summary\.textContent=value/);
  assert.match(app,/pricingResetQuote\(\)/);
  assert.match(app,/slider\.dispatchEvent\(new Event\('input',\{bubbles:true\}\)\)/);
  assert.match(app,/shPricePrepare\(\{silent:true\}\)/);
  assert.match(app,/json\('\/api\/shopee\/optimizer\/pricing\/prepare'/);
  assert.match(app,/shPriceSaveSelection\(shPriceSelection\)/);
  assert.match(app,/classList\?\.toggle\?\.\('view-pricing',name==='pricing'\)/);
  assert.match(css,/#tab-pricing \.pricing-v2-summary\{display:grid/);
  assert.match(css,/#tab-pricing \.pricing-v2-columns\{display:grid/);
  assert.match(css,/@media\(max-width:680px\)/);
});
