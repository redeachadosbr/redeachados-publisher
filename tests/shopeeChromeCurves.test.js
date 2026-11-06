import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {normalizeVisibleOffers,verifiedMonthlyEvidence,qualifyChromeMatches} from '../shopeeChromeCurves.js';
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

test('três lojas independentes com evidência mensal são obrigatórias antes da Curva A/B',()=>{
 const candidates=[
  {sku:'A',curve:'A',verified30:true,monthlyCompetitorCount:3,adsCompetitiveness:{eligible:true}},
  {sku:'B',curve:'B',verified30:true,monthlyCompetitorCount:4,adsCompetitiveness:{eligible:true}},
  {sku:'FRACO',curve:'A',verified30:true,monthlyCompetitorCount:2},
  {sku:'ACUMULADO',curve:'PENDING',verified30:false,monthlyCompetitorCount:9},
  {sku:'SEMDEMANDA',curve:'LOW',verified30:true,monthlyCompetitorCount:3}
 ];
 assert.deepEqual(qualifyChromeMatches(candidates).map(x=>x.sku),['A','B']);
});

test('lotes comportam até 100 anúncios distintos das páginas Em Destaque',()=>{
 const rows=Array.from({length:80},(_,i)=>({itemId:String(i+1),shopId:String(i+200),
  productName:'Organizador de cozinha plástico 500ml',historicalSold:100+i,priceMin:19.9}));
 assert.equal(normalizeVisibleOffers(rows).length,80);
 assert.throws(()=>normalizeVisibleOffers([...rows,...rows.slice(0,21)]),/Máximo de 100/);
});

test('vendas/mês e Vendas 30d são reconhecidas como período mensal explícito',()=>{
 assert.equal(verifiedMonthlyEvidence('950 vendas/mês'),true);
 assert.equal(verifiedMonthlyEvidence('Vendas 30d: 850'),true);
 assert.equal(verifiedMonthlyEvidence('Vendas acumuladas 850'),false);
});

test('Ponte Chrome exclui Curva A se preço WeDrop não competir e corrige média antes ausente',()=>{
 const candidates=[
  {sku:'OK',curve:'A',verified30:true,monthlyCompetitorCount:3,
   adsCompetitiveness:{eligible:true}},
  {sku:'BICICLETA',curve:'A',verified30:true,monthlyCompetitorCount:4,
   adsCompetitiveness:{eligible:false,status:'cost_above_market'}}
 ];
 assert.deepEqual(qualifyChromeMatches(candidates).map(x=>x.sku),['OK']);
 const offer=normalizeVisibleOffers([{
  itemId:'9981',shopId:'8878',productName:'Bicicleta de Equilíbrio Infantil Sem Pedal',
  priceMin:79.99,monthlySold:950,monthlyPeriod:'month',monthlyEvidence:'950 vendidos/mês'
 }])[0];
 assert.equal(offer.priceMin,79.99);
 assert.equal(offer.priceMax,79.99);
});
