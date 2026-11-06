import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {normalizeVisibleOffers,verifiedMonthlyEvidence,qualifyChromeMatches,confirmChromeMonthlySamples,splitChromeAdsCandidates} from '../shopeeChromeCurves.js';
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

test('duas lojas comprovam B acima de 700 e A acima de 900 vendas/mês',()=>{
 const rows=confirmChromeMonthlySamples([
  {sku:'A',curve:'A',verified30:true,monthlyCompetitors:[{monthlySold:1100},{monthlySold:990},{monthlySold:710}],adsCompetitiveness:{eligible:true}},
  {sku:'MISTA',curve:'A',verified30:true,monthlyCompetitors:[{monthlySold:1100},{monthlySold:820}],adsCompetitiveness:{eligible:true}},
  {sku:'UMA',curve:'A',verified30:true,monthlyCompetitors:[{monthlySold:1100}],adsCompetitiveness:{eligible:true}},
  {sku:'ACUMULADO',curve:'PENDING',verified30:false,monthlyCompetitors:[{monthlySold:1000},{monthlySold:950}],adsCompetitiveness:{eligible:true}},
  {sku:'SEMDEMANDA',curve:'LOW',verified30:true,monthlyCompetitors:[{monthlySold:600},{monthlySold:550}],adsCompetitiveness:{eligible:true}}
 ]);
 assert.equal(rows[0].curve,'A');
 assert.equal(rows[1].curve,'B');
 assert.deepEqual(qualifyChromeMatches(rows).map(x=>x.sku),['A','MISTA']);
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
  {sku:'OK',curve:'A',verified30:true,curveSampleConfirmed:true,monthlyCompetitorCount:3,
   adsCompetitiveness:{eligible:true}},
  {sku:'BICICLETA',curve:'A',verified30:true,curveSampleConfirmed:true,monthlyCompetitorCount:4,
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

test('preço visível sem vendas continua na média, nunca vira Venda/Mês',()=>{
 const out=normalizeVisibleOffers([{itemId:'15',shopId:'77',
  productName:'Pano Multiuso Rolo 600 Unidades',priceMin:53.99}]);
 assert.equal(out.length,1);
 assert.equal(out[0].monthlySold,null);
 assert.equal(out[0].sales,null);
 assert.equal(out[0].priceMin,53.99);
});

test('recuperação de Curvas utiliza vitrine pública somente quando a extensão não traz vendas mensais',()=>{
 const source=readFileSync(new URL('../shopeeChromeCurves.js',import.meta.url),'utf8');
 assert.match(source,/searchFeaturedPublic\(search,\{timeoutMs:5000\}\)/);
 assert.match(source,/if\(normalized\.length&&!normalized\.some/);
 assert.match(source,/recoveredMonthly/);
 assert.match(source,/featuredUnavailableUntil/);
});

test('custo acima da média nunca aparece como Potencial em verificação',()=>{
 const qualified=[{sku:'APROVADO',adsCompetitiveness:{eligible:true,status:'within_market'}}];
 const candidates=[
  ...qualified,
  {sku:'INOX',verified30:false,adsCompetitiveness:{eligible:false,status:'cost_above_market'}},
  {sku:'SEM_MARGEM',verified30:false,adsCompetitiveness:{eligible:false,status:'above_40_pct'}},
  {sku:'SEM_ESTOQUE',adsCompetitiveness:{eligible:false,status:'out_of_stock'}},
  {sku:'SEM_PRECO',adsCompetitiveness:{eligible:false,status:'missing_market'}},
  {sku:'DEMADA',adsCompetitiveness:{eligible:true,status:'within_market'}}
 ];
 const groups=splitChromeAdsCandidates(candidates,qualified);
 assert.deepEqual(groups.discarded.map(x=>x.sku),['INOX','SEM_MARGEM','SEM_ESTOQUE']);
 assert.deepEqual(groups.pending.map(x=>x.sku),['SEM_PRECO','DEMADA']);
 assert.equal(groups.discardedReasons.cost_above_market,1);
 assert.ok(!groups.pending.some(x=>x.sku==='INOX'));
});

test('novos preços da mesma oferta substituem informações anteriores sem perder evidência mensal',()=>{
 const content=readFileSync(new URL('../shopeeChromeCurves.js',import.meta.url),'utf8');
 assert.match(content,/state\.offers\.set\(id,prev\?\{\.\.\.prev,\.\.\.offer/);
 assert.match(content,/monthlySold:offer\.monthlySold\?\?prev\.monthlySold/);
});
