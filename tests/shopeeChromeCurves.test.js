import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {normalizeVisibleOffers,verifiedMonthlyEvidence,qualifyChromeMatches,confirmChromeMonthlySamples,splitChromeAdsCandidates,mergeCurvePriceSamples,monthlyEvidenceMatchesValue,canSkipCurveDemandRecovery} from '../shopeeChromeCurves.js';
import {matchCurveOffers} from '../shopeeCurveAB.js';
test('média é recuperada só com ofertas reais e modelos equivalentes',()=>{
 const store=new Map([['100:101',{shopId:'100',itemId:'101',
  productName:'Balança Digital Cozinha 10kg',priceMin:47.99,priceMax:47.99,
  sales:146,monthlySold:null,dataSource:'shopee-featured-chrome'}]]);
 const added=mergeCurvePriceSamples(store,[
  {shopId:'201',itemId:'301',title:'Balança Digital Cozinha 10kg Alta Precisão',price:16.90},
  {shopId:'202',itemId:'302',title:'Balança Eletrônica Precisão 10 KG',price:17.90},
  {shopId:'203',itemId:'303',title:'Balança Digital Corporal 10kg',price:5},
  {shopId:'201',itemId:'301',title:'Balança Digital Cozinha 10kg',price:16.90}
 ]);
 assert.equal(added,3);
 const rows=matchCurveOffers({catalog:[{supplier_sku:'PL001.U02',product_data:{
  name:'Balança Digital de Cozinha 10kg',rawAvailability:'Disponível'}}],
  offers:[...store.values()]});
 assert.equal(rows.length,1);
 assert.equal(rows[0].marketCandidateCount,3);
 assert.equal(rows[0].competitorOfferCount,2);
 assert.equal(rows[0].avgCompetitorPrice,17.4);
 assert.ok(rows[0].competitorOffers.every(offer=>offer.price<30));
 assert.equal(rows[0].verified30,false);
});
test('número de Vendido/Mês deve coincidir com o próprio selo da Shopee',()=>{
 assert.equal(monthlyEvidenceMatchesValue('866Vendido/Mês',866),true);
 assert.equal(monthlyEvidenceMatchesValue('1mil+ Vendido/Mês',1000),true);
 assert.equal(monthlyEvidenceMatchesValue('Vendido no mês: 1,2 mil',1200),true);
 assert.equal(monthlyEvidenceMatchesValue('Vendas 30d: 850',850),true);
 assert.equal(monthlyEvidenceMatchesValue('950 Vendido/Mês',12),false);
 assert.equal(monthlyEvidenceMatchesValue('12 vendidos',12),false);
 const rows=normalizeVisibleOffers([
  {itemId:'102',shopId:'12',productName:'Suporte papel higiênico com lixeira',
   priceMin:99,monthlySold:950,monthlyPeriod:'month',monthlyEvidence:'6 Vendido/Mês'},
  {itemId:'103',shopId:'13',productName:'Suporte papel higiênico com lixeira',
   priceMin:99,monthlySold:850,monthlyPeriod:'month',monthlyEvidence:'850 Vendido/Mês'}]);
 assert.deepEqual(rows.map(x=>x.monthlySold),[null,850]);
});
test('duas lojas distintas são obrigatórias, não somar itens da mesma loja',()=>{
 const x=confirmChromeMonthlySamples([
  {sku:'A',verified30:true,curve:'A',monthlyCompetitors:[
   {shopId:'8',monthlySold:1000},{shopId:'8',monthlySold:930},{shopId:'9',monthlySold:6}]},
  {sku:'B',verified30:true,curve:'A',monthlyCompetitors:[
   {shopId:'10',monthlySold:1000},{shopId:'11',monthlySold:800}]},
  {sku:'C',verified30:true,curve:'B',monthlyCompetitors:[
   {shopId:'12',monthlySold:930},{shopId:'13',monthlySold:910}]}
 ]);
 assert.equal(x[0].curve,'PENDING');assert.equal(x[0].curveSampleConfirmed,false);
 assert.equal(x[1].curve,'B');assert.equal(x[2].curve,'A');
});
test('somente texto explícito de período permite vendas mensais',()=>{
 assert.equal(verifiedMonthlyEvidence('950 vendidos/mês'),true);
 assert.equal(verifiedMonthlyEvidence('Vendido no mês: 950'),true);
 assert.equal(verifiedMonthlyEvidence('950 vendidos nos últimos 30 dias'),true);
 assert.equal(verifiedMonthlyEvidence('950 vendidos'),false);
 assert.equal(verifiedMonthlyEvidence('10 mil vendidos ao todo'),false);
});
test('importação mantém o volume mensal quando número e rótulo chegam sem espaço',()=>{
 const rows=['2mil+Vendido/Mês','1mil+Vendido/Mês','866Vendido/Mês',
  '495Vendido/Me\u0302s','392\u200bVendido／Mês','0Vendido/Mês'].map((monthlyEvidence,i)=>({
  itemId:String(100+i),shopId:String(200+i),productName:'Dispenser Lavanderia Sabão Líquido',
  priceMin:30.9,monthlySold:[2000,1000,866,495,392,0][i],monthlyPeriod:'month',monthlyEvidence
 }));
 for(const row of rows)assert.equal(verifiedMonthlyEvidence(row.monthlyEvidence),true);
 assert.deepEqual(normalizeVisibleOffers(rows).map(x=>x.monthlySold),[2000,1000,866,495,392,0]);
 assert.equal(verifiedMonthlyEvidence('866 Vendidos'),false);
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
 ].map(row=>({...row,monthlyCompetitors:row.monthlyCompetitors.map((o,i)=>({...o,shopId:String(100+i)}))})));
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
 assert.match(source,/if\(pricedOpportunity&&normalized\.length&&/);
 assert.match(source,/!normalized\.some/);
 assert.match(source,/recoveredMonthly/);
 assert.match(source,/featuredUnavailableUntil/);
});

test('custo acima da média nunca aparece como Potencial em verificação',()=>{
 const qualified=[{sku:'APROVADO',adsCompetitiveness:{eligible:true,status:'within_market'}}];
 const candidates=[
  ...qualified,
  {sku:'INOX',verified30:false,adsCompetitiveness:{eligible:false,status:'cost_above_market'}},
  {sku:'SEM_MARGEM',verified30:false,adsCompetitiveness:{eligible:false,status:'above_60_pct'}},
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

test('novo plano de Curvas zera evidências anteriores antes da primeira consulta',()=>{
 const source=readFileSync(new URL('../shopeeChromeCurves.js',import.meta.url),'utf8');
 assert.match(source,/if\(offset===0\)\{/);
 assert.match(source,/state\.offers\.clear\(\)/);
 assert.match(source,/state\.scanned\.clear\(\)/);
 assert.match(source,/state\.queries=0/);
});


test('custo primeiro dispensa pesquisa mensal somente para SKUs inviáveis',()=>{
 const rows=[{sku:'A',adsCompetitiveness:{status:'cost_above_market'}},
  {sku:'B',adsCompetitiveness:{status:'above_60_pct'}},
  {sku:'C',adsCompetitiveness:{status:'missing_market'}}];
 assert.equal(canSkipCurveDemandRecovery(rows,['A','B']),true);
 assert.equal(canSkipCurveDemandRecovery(rows,['A','C']),false);
 assert.equal(canSkipCurveDemandRecovery(rows,['A','X']),false);
 assert.equal(canSkipCurveDemandRecovery(rows,[]),false);
});
