import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {normalizeVisibleOffers,verifiedMonthlyEvidence} from '../shopeeChromeCurves.js';
test('somente texto explícito de período permite vendas mensais',()=>{
 assert.equal(verifiedMonthlyEvidence('950 vendidos/mês'),true);
 assert.equal(verifiedMonthlyEvidence('Vendido no mês: 950'),true);
 assert.equal(verifiedMonthlyEvidence('950 vendidos nos últimos 30 dias'),true);
 assert.equal(verifiedMonthlyEvidence('950 vendidos'),false);
 assert.equal(verifiedMonthlyEvidence('10 mil vendidos ao todo'),false);
});
test('não transforma vendas acumuladas em mensais e ignora anúncio próprio',()=>{
 const out=normalizeVisibleOffers([
  {itemId:'1',shopId:'9',productName:'Coqueteleira Shaker Inox 500ml',
   historicalSold:10000,monthlySold:950,monthlyPeriod:'month',monthlyEvidence:'950 vendidos',
   priceMin:24.9},
  {itemId:'2',shopId:'9',productName:'Coqueteleira Shaker Inox 500ml',
   monthlySold:1100,monthlyPeriod:'month',monthlyEvidence:'1100 vendidos/mês',priceMin:29},
  {itemId:'3',shopId:'123',productName:'Coqueteleira Shaker Inox 500ml',
   monthlySold:5000,monthlyPeriod:'month',monthlyEvidence:'5000 vendidos/mês',priceMin:9}
 ],{ownShopId:'123'});
 assert.equal(out.length,2);
 assert.equal(out[0].monthlySold,null);
 assert.equal(out[0].sales,10000);
 assert.equal(out[1].monthlySold,1100);
 assert.equal(out[1].dataSource,'shopee-featured-chrome');
});
test('rota da extensão usa autenticação, origem e plano pelo catálogo',()=>{
 const src=readFileSync(new URL('../shopeeChromeCurves.js',import.meta.url),'utf8');
 const server=readFileSync(new URL('../server.js',import.meta.url),'utf8');
 assert.match(src,/readWeDropCatalogProducts/);
 assert.match(src,/curveSkuSearchPlan\(subset,\{keyword:term\}\)/);
 assert.match(src,/state\.plan\.find/);
 assert.match(server,/api\/shopee\/curvas-ab\/chrome-plan',mustLogin,requireWeDropAdmin/);
 assert.match(server,/api\/shopee\/curvas-ab\/chrome-import',mustLogin,requireWeDropAdmin/);
 assert.match(server,/if\(!verifiedSameOrigin\(req\)\)/);
});
