import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {curveGroup,curveSearchTerms,matchCurveOffers,pickCurveResults,
 officialFeaturedSearchUrl,seoTitleFromEvidence,curveSkuSearchPlan,curveSkuSearchQuery} from '../shopeeCurveAB.js';
import {categoryMatches} from '../shopeeKitBuilder.js';

const photo='https://wedrop-products-images.nyc3.cdn.digitaloceanspaces.com/teste-xl.jpg';
const fixture=[
 {supplier_sku:'LAN001',source_file:'catalogo.xlsx',product_data:{
  name:'Lancheira Escolar Dinossauro T Rex Verde com Zíper',
  category:'Mochilas, Estojos e Lancheiras',imageUrl:photo,rawAvailability:'Disponível'}},
 {supplier_sku:'EST002',source_file:'catalogo.xlsx',product_data:{
  name:'Estojo Escolar Dinossauro T Rex com Zíper',
  category:'Mochilas, Estojos e Lancheiras',imageUrl:photo,rawAvailability:'Disponível'}}
];
const offers=[
 {itemId:'1001',shopId:'999',productName:'Lancheira Escolar Dinossauro T Rex Verde com Zíper',
  priceMin:'45.90',sales:950},
 {itemId:'1002',shopId:'998',productName:'Estojo Escolar Dinossauro T Rex com Zíper',
  priceMin:'24.90',sales:650}
];
test('curva A começa em 900 sem teto, B entre 700 e 899 e valores inferiores não classificam',()=>{
 assert.equal(curveGroup(900,7000).curve,'A');
 assert.equal(curveGroup(1000,7000).curve,'A');
 assert.equal(curveGroup(1001,7000).curve,'A');
 assert.equal(curveGroup(12000,7000).curve,'A');
 assert.equal(curveGroup(899,7000).curve,'B');
 assert.equal(curveGroup(700,7000).curve,'B');
 assert.equal(curveGroup(699,7000).curve,'LOW');
 assert.equal(curveGroup(0,7000).curve,'LOW');
});
test('vendas acumuladas de concorrentes nunca confirmam A/B sem período mensal',()=>{
 const x=curveGroup(null,950),y=curveGroup(null,400);
 assert.equal(x.curve,'PENDING');assert.equal(x.verified30,false);
 assert.match(x.label,/não disponíveis/);
 assert.equal(y.curve,'PENDING');assert.equal(y.verified30,false);
});
test('cruzamento valida identidade do produto e traz SKU imagem WeDrop e concorrente',()=>{
 const rows=matchCurveOffers({catalog:fixture,offers,costs:[
  {supplier_sku:'LAN001',unit_cost:19.5}],today:'2026-11-05'});
 assert.equal(rows.length,2);
 assert.equal(rows[0].sku,'LAN001');
 assert.equal(rows[0].imageUrl,photo);
 assert.equal(rows[0].salesDisplayed,950);
 assert.equal(rows[0].sales30,null);
 assert.equal(rows[0].competitorUrl,'https://shopee.com.br/product/999/1001');
 assert.equal(rows[0].cost,19.5);
 assert.equal(rows[1].sku,'EST002');
 assert.equal(rows[1].curve,'PENDING');
});
test('histórico de 30 dias observa delta verdadeiro e nao total acumulado',()=>{
 const rows=matchCurveOffers({catalog:fixture,offers,baseline:new Map([
  ['1001',{day:'2026-10-06',sales:0}],
  ['1002',{day:'2026-10-06',sales:120}]
 ]),today:'2026-11-05'});
 assert.equal(rows[0].sales30,950);
 assert.equal(rows[0].verified30,true);
 assert.equal(rows[1].sales30,530);
 assert.equal(rows[1].curve,'LOW');
 assert.equal(rows[1].verified30,true);
});
test('quantidades 5, 10, 15, 20 retornam menos sem bloquear',()=>{
 const rows=matchCurveOffers({catalog:fixture,offers,today:'2026-11-05'});
 for(const limit of [5,10,15,20]){
  const result=pickCurveResults(rows,{limit});
  assert.equal(result.items.length,2);
  assert.equal(result.shortage,limit-2);
 }
 assert.equal(pickCurveResults(rows,{limit:10,curve:'A'}).items.length,0);
 assert.equal(pickCurveResults(rows,{limit:10,curve:'B'}).items.length,0);
 assert.throws(()=>pickCurveResults(rows,{limit:12}),/Escolha/);
});
test('pesquisa sem termos usa categorias do catálogo e ignora indisponíveis',()=>{
 const terms=curveSearchTerms(fixture);
 assert.ok(terms.some(t=>/mochilas|estojos|lancheiras/.test(t)));
 assert.deepEqual(curveSearchTerms(fixture,{keyword:'brinquedo'}),['brinquedo']);
});
test('anúncio de produto diferente nao pode herdar SKU e foto do catálogo',()=>{
 const rows=matchCurveOffers({catalog:fixture,offers:[{
  itemId:'555',shopId:'556',productName:'Bomba Elétrica para colchão inflável',
  sales:9000,priceMin:'29.99'}]});
 assert.equal(rows.length,0);
});
test('roteamento mostra menu, formulário e API autenticada sem criar Ads',()=>{
 const app=readFileSync(new URL('../public/app.js',import.meta.url),'utf8');
 const page=readFileSync(new URL('../public/index.html',import.meta.url),'utf8');
 const server=readFileSync(new URL('../server.js',import.meta.url),'utf8');
 assert.match(app,/curves:\{slug:'curvas-ab'/);
 assert.match(page,/data-tab="curves"/);
 assert.match(page,/id="curveLimit"/);
 assert.match(page,/value="5"/);
 assert.match(page,/value="10"/);
 assert.match(page,/value="15"/);
 assert.match(page,/value="20"/);
 assert.match(page,/id="curveResults"/);
 assert.match(server,/api\/shopee\/curvas-ab\/search',mustLogin,requireWeDropAdmin/);
 assert.match(server,/await researchCurveAB\(auth.shopId/);
});

test('Em Destaque abre a ordenação oficial sortBy=sales da página Shopee',()=>{
 const url=new URL(officialFeaturedSearchUrl('coqueteleira 500ml'));
 assert.equal(url.hostname,'shopee.com.br');
 assert.equal(url.pathname,'/search');
 assert.equal(url.searchParams.get('sortBy'),'sales');
 assert.equal(url.searchParams.get('keyword'),'coqueteleira 500ml');
 assert.equal(url.searchParams.get('page'),'0');
});
test('categorias seguem o MESMO agrupamento dos Kits Inteligentes WeDrop',()=>{
 assert.equal(categoryMatches('Copos, Jarras e Servir','Cozinha'),true);
 assert.equal(categoryMatches('Bonecas e Casinhas','Brinquedos'),true);
 assert.equal(categoryMatches('Bonecas e Casinhas','Cozinha'),false);
 const server=readFileSync(new URL('../server.js',import.meta.url),'utf8');
 const module=readFileSync(new URL('../shopeeCurveAB.js',import.meta.url),'utf8');
 assert.match(server,/limit:count,curve,category,keyword,refresh/);
 assert.match(module,/categoryMatches\(/);
 assert.match(module,/selectedCategory/);
});
test('média de Curvas usa 2 a 10 anúncios do mesmo produto, sem exigir lojas distintas',()=>{
 const catalog=[{supplier_sku:'CQA-500',source_file:'wedrop.xlsx',product_data:{
  name:'Coqueteleira Shaker Inox 500ml',category:'Copos, Jarras e Servir',
  imageUrl:photo,rawAvailability:'Disponível'}}];
 const competitors=[
  {itemId:'8881',shopId:'201',productName:'Coqueteleira Shaker Inox 500ml',
   priceMin:'29.90',priceMax:'29.90',sales:950},
  {itemId:'8882',shopId:'202',productName:'Coqueteleira Shaker Inox 500ml com Tampa',
   priceMin:'31.90',priceMax:'31.90',sales:930},
  {itemId:'8883',shopId:'203',productName:'Coqueteleira Shaker Inox 500ml',
   priceMin:'33.90',priceMax:'33.90',sales:915},
  {itemId:'8884',shopId:'201',productName:'Coqueteleira Shaker Inox 500ml',
   priceMin:'31.90',priceMax:'31.90',sales:930},
  {itemId:'8885',shopId:'201',productName:'Coqueteleira Shaker Inox 500ml',
   priceMin:'31.90',priceMax:'31.90',sales:935}
 ];
 const rows=matchCurveOffers({catalog,offers:competitors});
 assert.equal(rows.length,1);
 assert.equal(rows[0].avgCompetitorPrice,31.90);
 assert.equal(rows[0].competitorOfferCount,5);
 assert.equal(rows[0].competitorOffers.length,5);
 assert.equal(rows[0].keywords.length,5);
 assert.ok(rows[0].keywords.every(x=>x.mentions>0));
 assert.ok(rows[0].keywords.every(x=>x.searchUrl.includes('sortBy=sales')));
 assert.match(rows[0].seoTitle,/Coqueteleira/i);
 assert.doesNotMatch(rows[0].seoTitle,/CQA-500/);
 assert.ok([...rows[0].seoTitle].length<=120);
});
test('com apenas uma loja a pesquisa não inventa média de concorrentes',()=>{
 const one=[{itemId:'9991',shopId:'222',
  productName:'Coqueteleira Shaker Inox 500ml',
  priceMin:34.90,priceMax:34.90,sales:900}];
 const rows=matchCurveOffers({catalog:[{supplier_sku:'CQA-500',product_data:{
  name:'Coqueteleira Shaker Inox 500ml',category:'Copos, Jarras e Servir'}}],offers:one});
 assert.equal(rows.length,1);
 assert.equal(rows[0].avgCompetitorPrice,null);
 assert.match(rows[0].priceEvidence,/Média indisponível/);
});
test('titulo SEO usa apenas fatos WeDrop, sem SKU interna nem alegações não comprovadas',()=>{
 const title=seoTitleFromEvidence('Coqueteleira Shaker Inox 500ml',[
  {term:'shaker inox',mentions:3},{term:'coqueteleira 500ml',mentions:2},
  {term:'capacidade 1 litro',mentions:9}
 ],'SKU-X5');
 assert.doesNotMatch(title,/SKU-X5|1 litro/i);
 assert.ok(title.length>0&&[...title].length<=120);
});
test('a interface oferece categoria e títulos SEO com referências dos preços',()=>{
 const html=readFileSync(new URL('../public/index.html',import.meta.url),'utf8');
 const js=readFileSync(new URL('../public/curvas-ab.js',import.meta.url),'utf8');
 assert.match(html,/id="curveCategory"/);
 assert.match(html,/id="curveFeaturedLink"/);
 assert.match(js,/api\/shopee\/kits\/catalog\?category=Todos&limit=1/);
 assert.match(js,/function appendSEO/);
 assert.match(js,/function appendPrices/);
 assert.match(js,/Média do preço de venda na Shopee/);
 const chrome=readFileSync(new URL('../public/curvas-chrome.js',import.meta.url),'utf8');
 assert.match(chrome,/verifiedOnly:true/);
 assert.match(chrome,/curve:'ALL'/);
 assert.doesNotMatch(js,/\/api\/shopee\/curvas-ab\/search\?/);
});

test('a média de concorrentes exclui a própria loja, inclusive no ranking',()=>{
 const rows=matchCurveOffers({ownShopId:'201',catalog:[{
  supplier_sku:'CQA-500',product_data:{
   name:'Coqueteleira Shaker Inox 500ml',category:'Copos, Jarras e Servir'}
 }],offers:[
  {itemId:'8881',shopId:'201',productName:'Coqueteleira Shaker Inox 500ml',
   priceMin:'10.90',priceMax:'10.90',sales:9000},
  {itemId:'8882',shopId:'202',productName:'Coqueteleira Shaker Inox 500ml',
   priceMin:'31.90',priceMax:'31.90',sales:930},
  {itemId:'8883',shopId:'203',productName:'Coqueteleira Shaker Inox 500ml',
   priceMin:'33.90',priceMax:'33.90',sales:915},
  {itemId:'8884',shopId:'204',productName:'Coqueteleira Shaker Inox 500ml',
   priceMin:'32.90',priceMax:'32.90',sales:910},
  {itemId:'8885',shopId:'202',productName:'Coqueteleira Shaker Inox 500ml',
   priceMin:'32.90',priceMax:'32.90',sales:920},
  {itemId:'8886',shopId:'202',productName:'Coqueteleira Shaker Inox 500ml',
   priceMin:'32.90',priceMax:'32.90',sales:905}
 ]});
 assert.equal(rows.length,1);
 assert.equal(rows[0].shopId,'202');
 assert.equal(rows[0].avgCompetitorPrice,32.90);
 assert.equal(rows[0].competitorOfferCount,5);
});

test('categoria WeDrop dispara buscas pelos nomes das SKUs, sem depender de palavra digitada',()=>{
 const catalog=[
  {supplier_sku:'C001',product_data:{
   name:'Coqueteleira Shaker Inox 500ml Prata',category:'Copos, Jarras e Servir',rawAvailability:'Disponível'}},
  {supplier_sku:'P001',product_data:{
   name:'Panela Antiaderente Tampa Vidro 24cm',category:'Panelas e Frigideiras',rawAvailability:'Disponível'}},
  {supplier_sku:'C002',product_data:{
   name:'Coqueteleira Shaker Inox 750ml Preto',category:'Copos, Jarras e Servir',rawAvailability:'Disponível'}},
  {supplier_sku:'X999',product_data:{
   name:'Garrafa Plástico Infantil 500ml',category:'Copos, Jarras e Servir',rawAvailability:'Indisponível'}}
 ];
 const plan=curveSkuSearchPlan(catalog);
 assert.equal(plan.length,3);
 assert.ok(plan.some(x=>x.query.includes('coqueteleira')&&x.query.includes('500ml')));
 assert.ok(plan.some(x=>x.query.includes('panela')&&x.query.includes('24cm')));
 assert.ok(plan.some(x=>x.query.includes('coqueteleira')&&x.query.includes('750ml')));
 assert.ok(plan.every(x=>!x.skus.includes('X999')));
 assert.notEqual(plan[0].category,plan[1].category,
  'as primeiras buscas alternam entre as subcategorias WeDrop');
 assert.ok(plan.every(x=>x.query.split(' ').length>=2));
});
test('seleção de palavra-chave restringe as SKUs do catálogo, mas não é obrigatória',()=>{
 const plan=curveSkuSearchPlan(fixture);
 const focus=curveSkuSearchPlan(fixture,{keyword:'lancheira'});
 assert.ok(plan.length>=2);
 assert.equal(focus.length,1);
 assert.ok(focus[0].skus.includes('LAN001'));
 assert.ok(!focus[0].skus.includes('EST002'));
});
test('consultas repetidas de variantes da WeDrop são agrupadas sem perder suas SKUs',()=>{
 const data=[
  {supplier_sku:'VA',product_data:{name:'Lixeira Inox 3L Branca',category:'Lixeiras'}},
  {supplier_sku:'VB',product_data:{name:'Lixeira Inox 3L Preta',category:'Lixeiras'}}
 ];
 const plan=curveSkuSearchPlan(data);
 assert.equal(plan.length,1);
 assert.deepEqual(plan[0].skus,['VA','VB']);
});
test('motor busca lotes de SKUs e oferece continuidade, não apenas nome da categoria',()=>{
 const source=readFileSync(new URL('../shopeeCurveAB.js',import.meta.url),'utf8');
 const ui=readFileSync(new URL('../public/curvas-ab.js',import.meta.url),'utf8');
 const page=readFileSync(new URL('../public/index.html',import.meta.url),'utf8');
 assert.match(source,/const plan=curveSkuSearchPlan\(filtered,\{keyword\}\)/);
 assert.match(source,/const jobs=state\.plan\.slice\(state\.cursor/);
 assert.match(source,/if\(pickCurveResults\(state\.matches,\{limit:desired,curve,verifiedOnly,competitiveOnly\}\)\.items\.length>=desired\)break;/);
 assert.match(source,/skuSearchesCompleted:state\.scannedSkus\.size/);
 assert.match(source,/hasMore,nextCursor:state\.cursor/);
 assert.doesNotMatch(ui,/\/api\/shopee\/curvas-ab\/search\?/);
 const bridge=readFileSync(new URL('../public/curvas-chrome.js',import.meta.url),'utf8');
 assert.match(bridge,/\/api\/shopee\/curvas-ab\/chrome-plan/);
 assert.match(bridge,/\/api\/shopee\/curvas-ab\/chrome-import/);
 assert.match(page,/id="curveContinueSearch"/);
 assert.match(page,/id="curveScannedCount"/);
 assert.match(page,/id="curveKeyword".*placeholder=/);
});

test('Curva A usa Vendido/Mês Shopee em vez das vendas acumuladas',()=>{
 const catalog=[{supplier_sku:'CQA500',product_data:{
  name:'Coqueteleira Shaker Inox 500ml',category:'Copos, Jarras e Servir'
 }}];
 const rows=matchCurveOffers({catalog,offers:[
  {itemId:'2255',shopId:'3344',
   productName:'Coqueteleira Shaker Inox 500ml',sales:11000,
   historicalSold:11000,monthlySold:950,priceMin:29.90,
   dataSource:'shopee-featured-public'}
 ]});
 assert.equal(rows.length,1);
 assert.equal(rows[0].curve,'A');
 assert.equal(rows[0].verified30,true);
 assert.equal(rows[0].sales30,950);
 assert.equal(rows[0].salesDisplayed,11000);
 assert.match(rows[0].periodSource,/Em Destaque/);
 assert.equal(rows[0].source,'shopee-featured-public');
});
test('campo mensal ausente não é inferido dos totais da Shopee',()=>{
 const catalog=[{supplier_sku:'CQA500',product_data:{
  name:'Coqueteleira Shaker Inox 500ml',category:'Copos, Jarras e Servir'
 }}];
 const rows=matchCurveOffers({catalog,offers:[{
  itemId:'2255',shopId:'3344',productName:'Coqueteleira Shaker Inox 500ml',
  sales:950,monthlySold:null,priceMin:29.90,
  dataSource:'shopee-featured-public'
 }]});
 assert.equal(rows.length,1);
 assert.equal(rows[0].verified30,false);
 assert.equal(rows[0].sales30,null);
 assert.match(rows[0].curveLabel,/não disponíveis/);
});
test('entre anúncio com vendas acumuladas e anúncio com vendas mensais para mesma SKU prioriza mensal',()=>{
 const catalog=[{supplier_sku:'CQA500',product_data:{
  name:'Coqueteleira Shaker Inox 500ml',category:'Copos, Jarras e Servir'
 }}];
 const rows=matchCurveOffers({catalog,offers:[
  {itemId:'1',shopId:'11',productName:'Coqueteleira Shaker Inox 500ml',
   sales:85000,priceMin:29.9},
  {itemId:'2',shopId:'12',productName:'Coqueteleira Shaker Inox 500ml',
   sales:2300,monthlySold:901,priceMin:30.9,dataSource:'shopee-featured-public'}
 ]});
 assert.equal(rows.length,1);
 assert.equal(rows[0].itemId,'2');
 assert.equal(rows[0].sales30,901);
 assert.equal(rows[0].curve,'A');
});

test('modo padrão só retorna Curvas com evidência mensal, candidatos potenciais são opt-in',()=>{
 const candidates=matchCurveOffers({catalog:fixture,offers});
 const strict=pickCurveResults(candidates,{limit:5,curve:'A',verifiedOnly:true});
 assert.equal(strict.items.length,0);
 assert.equal(strict.shortage,5);
 const relaxed=pickCurveResults(candidates,{limit:5,curve:'A',verifiedOnly:false});
 assert.equal(relaxed.items.length,0);
 assert.equal(pickCurveResults(candidates,{limit:5,curve:'ALL',verifiedOnly:false}).items.length,2);
 const monthly=matchCurveOffers({catalog:fixture,offers:[{
  itemId:'1001',shopId:'999',
  productName:'Lancheira Escolar Dinossauro T Rex Verde com Zíper',
  priceMin:45.9,sales:23000,monthlySold:960,
  dataSource:'shopee-featured-public'
 }]});
 assert.equal(pickCurveResults(monthly,{limit:5,curve:'A',verifiedOnly:true}).items.length,1);
});
test('rota autenticada expõe status das duas fontes sem fornecer segredos',()=>{
 const api=readFileSync(new URL('../server.js',import.meta.url),'utf8');
 const html=readFileSync(new URL('../public/index.html',import.meta.url),'utf8');
 assert.match(api,/api\/shopee\/curvas-ab\/sources',mustLogin,requireWeDropAdmin/);
 assert.match(api,/probeCurveAffiliateAccess/);
 assert.match(html,/id="curveChromeStart"/);
 assert.doesNotMatch(html,/id="curveConfirmedOnly"/);
 assert.match(html,/id="curveTestSources"/);
});

test('SKU não precisa estar publicada na loja para ganhar Curva A pelo concorrente',()=>{
 const catalog=[{supplier_sku:'WEDROP-NOVO',product_data:{name:'Coqueteleira Shaker Inox 500ml',category:'Cozinha',rawAvailability:'Disponível'}}];
 const rows=matchCurveOffers({catalog,offers:[{itemId:'9988',shopId:'8877',
  productName:'Coqueteleira Shaker Inox 500ml',sales:15000,monthlySold:1350,
  priceMin:32.9,dataSource:'shopee-featured-public'}]});
 assert.equal(rows.length,1);
 assert.equal(rows[0].sku,'WEDROP-NOVO');
 assert.equal(rows[0].curve,'A');
 assert.equal(rows[0].sales30,1350);
 assert.equal(pickCurveResults(rows,{curve:'A',limit:5,verifiedOnly:true}).items.length,1);
});
test('sem volume mensal, nem anúncio com 100 mil vendas acumuladas vira Curva A',()=>{
 const rows=matchCurveOffers({catalog:fixture,offers:[{itemId:'1001',shopId:'999',
  productName:'Lancheira Escolar Dinossauro T Rex Verde com Zíper',sales:100000,
  priceMin:35.9,dataSource:'shopee-affiliate'}]});
 assert.equal(rows[0].curve,'PENDING');
 assert.equal(pickCurveResults(rows,{curve:'A',limit:5,verifiedOnly:true}).items.length,0);
});

test('cruzamento agrupa concorrentes mensais por loja sem somar volumes e respeita SKU não publicada',()=>{
 const catalog=[{supplier_sku:'WDR-5',product_data:{
  name:'Coqueteleira Shaker Inox 500ml',category:'Cozinha',rawAvailability:'Disponível'}}];
 const offers=[['11','1',1100],['11','2',990],['12','3',850],['13','4',740]].map(([shopId,itemId,monthlySold])=>({
  shopId,itemId,monthlySold,sales:5000,priceMin:29.9,
  productName:'Coqueteleira Shaker Inox 500ml',dataSource:'shopee-featured-chrome'}));
 const rows=matchCurveOffers({catalog,offers,ownShopId:'999'});
 assert.equal(rows.length,1);
 assert.equal(rows[0].monthlyCompetitorCount,3);
 assert.deepEqual(rows[0].monthlyCompetitors.map(x=>x.monthlySold),[1100,850,740]);
 assert.equal(rows[0].curve,'A');
});

test('busca exclui prefixos genéricos e usa o nome exato da SKU WeDrop',()=>{
 const query=curveSkuSearchQuery('Cuidados Higiene Bebes - Escova Macia para Banho');
 assert.equal(query,'escova macia banho');
 assert.equal(curveSkuSearchQuery('Cuidados Higiene Bebes'),'');
 assert.match(curveSkuSearchQuery('Coqueteleira Shaker Inox 500ml'),/coqueteleira/);
});

test('seleção para Ads não conta Curva A/B com custo inviável nem pendências',()=>{
 const rows=[
  {sku:'AZUL',curve:'A',verified30:true,adsCompetitiveness:{eligible:false}},
  {sku:'APTO',curve:'B',verified30:true,monthlyCompetitorCount:3,adsCompetitiveness:{eligible:true}},
  {sku:'PENDENTE',curve:'PENDING',verified30:false,adsCompetitiveness:{eligible:true}}
 ];
 const found=pickCurveResults(rows,{curve:'ALL',limit:5,verifiedOnly:false,competitiveOnly:true});
 assert.deepEqual(found.items.map(row=>row.sku),['APTO']);
 assert.equal(found.found,1);
});

test('bicicletas Curva A não passam para Ads quando preço médio da concorrência é inferior ao custo WeDrop',()=>{
 const catalog=[
  {supplier_sku:'3284',product_data:{name:'Bicicleta de Equilíbrio Infantil Sem Pedal - Azul',
   category:'Brinquedos',rawAvailability:'Disponível'}},
  {supplier_sku:'3290',product_data:{name:'Bicicleta de Equilíbrio Infantil Sem Pedal - Bege',
   category:'Brinquedos',rawAvailability:'Disponível'}}
 ];
 const offers=['501','502','503','504'].map((shopId,i)=>({
  shopId,itemId:String(800+i),productName:'Bicicleta de Equilíbrio Infantil Sem Pedal',
  priceMin:79.99,priceMax:79.99,sales:6000,monthlySold:991,
  dataSource:'shopee-featured-chrome'
 }));
 offers.push({shopId:'501',itemId:'8888',productName:'Bicicleta de Equilíbrio Infantil Sem Pedal',
  priceMin:79.99,priceMax:79.99,sales:6000,monthlySold:991,
  dataSource:'shopee-featured-chrome'});
 const rows=matchCurveOffers({catalog,costs:[
  {supplier_sku:'3284',unit_cost:115.99},
  {supplier_sku:'3290',unit_cost:129.99}],offers,ownShopId:'999'});
 assert.equal(rows.length,2);
 for(const row of rows){
  assert.equal(row.curve,'A');
  assert.equal(row.monthlyCompetitorCount,4);
  assert.equal(row.avgCompetitorPrice,79.99);
  assert.equal(row.adsCompetitiveness.eligible,false);
  assert.equal(row.adsCompetitiveness.status,'cost_above_market');
 }
 assert.equal(pickCurveResults(rows,{limit:10,curve:'ALL',competitiveOnly:true}).found,0);
});
test('Curva B com custo baixo e três lojas de preços comparáveis recebe simulação dentro de +40%',()=>{
 const catalog=[{supplier_sku:'SHP123',product_data:{
  name:'Organizador de Gaveta Modular Plástico Grande',category:'Organizadores',
  rawAvailability:'Disponível'}}];
 const offers=['601','602','603'].map((shopId,i)=>({
  shopId,itemId:String(900+i),productName:'Organizador de Gaveta Modular Plástico Grande',
  priceMin:100,priceMax:100,sales:1500,monthlySold:780,
  dataSource:'shopee-featured-chrome'
 }));
 offers.push(...[950,951].map(itemId=>({
  shopId:'601',itemId:String(itemId),productName:'Organizador de Gaveta Modular Plástico Grande',
  priceMin:100,priceMax:100,sales:null,monthlySold:null,
  dataSource:'shopee-featured-chrome'
 })));
 const rows=matchCurveOffers({catalog,costs:[
  {supplier_sku:'SHP123',unit_cost:40}],offers,ownShopId:'999'});
 assert.equal(rows.length,1);
 assert.equal(rows[0].curve,'B');
 assert.equal(rows[0].avgCompetitorPrice,100);
 assert.equal(rows[0].monthlyCompetitorCount,3);
 assert.equal(rows[0].adsCompetitiveness.eligible,true);
 assert.ok(rows[0].adsCompetitiveness.suggestedSalePrice<=140);
 assert.equal(pickCurveResults(rows,{limit:5,competitiveOnly:true,verifiedOnly:true}).found,1);
});

test('média em Curvas aceita a partir de 2 anúncios distintos e permite lojas repetidas',()=>{
 const name='Organizador de Gaveta Modular Plástico Grande';
 const catalog=[{supplier_sku:'C123',product_data:{
  name,category:'Organizadores',rawAvailability:'Disponível'}}];
 const costs=[{supplier_sku:'C123',unit_cost:30}];
 const priceList=[90,95,100,105,110,200];
 const offers=priceList.map((price,i)=>({
  shopId:String(200+i),itemId:String(1000+i),productName:name,
  priceMin:price,priceMax:price,monthlySold:780,sales:1500,
  dataSource:'shopee-featured-chrome'
 }));
 const apply=n=>matchCurveOffers({catalog,costs,offers:offers.slice(0,n),ownShopId:'999'})[0];
 const two=apply(2);
 assert.equal(two.avgCompetitorPrice,92.5);
 assert.equal(two.adsCompetitiveness.eligible,true);
 const three=apply(3);
 assert.equal(three.avgCompetitorPrice,95);
 assert.equal(three.competitorOfferCount,3);
 assert.equal(three.adsCompetitiveness.eligible,true);
 const five=apply(5);
 assert.equal(five.avgCompetitorPrice,100);
 assert.equal(five.competitorOfferCount,5);
 const six=apply(6);
 assert.ok(six.competitorOfferCount<=10);
 assert.equal(new Set(six.competitorOffers.map(x=>x.itemId)).size,six.competitorOffers.length);
});

test('Curvas faz média com 5 anúncios da mesma loja e ignora embalagens de quantidades diferentes',()=>{
 const title='Pano Multiuso em Rolo com 600 Unidades';
 const catalog=[{supplier_sku:'P600',product_data:{
  name:title,rawAvailability:'Disponível',category:'Limpeza'}}];
 const valid=Array.from({length:5},(_,i)=>({
  shopId:'123',itemId:String(3000+i),productName:title,
  priceMin:50+i,priceMax:50+i,sales:1200,monthlySold:1000
 }));
 const different={shopId:'124',itemId:'4000',
  productName:'Pano Multiuso em Rolo com 200 Unidades',
  priceMin:5,priceMax:5,sales:3000,monthlySold:2000};
 const rows=matchCurveOffers({catalog,offers:[...valid,different],
  costs:[{supplier_sku:'P600',unit_cost:10}]});
 assert.equal(rows.length,1);
 assert.equal(rows[0].competitorOfferCount,5);
 assert.equal(rows[0].avgCompetitorPrice,52);
 assert.equal(new Set(rows[0].competitorOffers.map(x=>x.shopId)).size,1);
 assert.ok(!rows[0].competitorOffers.some(x=>x.itemId==='4000'));
});

test('Curvas calcula preço médio com só dois anúncios de uma mesma loja sem confirmar demanda',()=>{
 const name='Pano Multiuso em Rolo com 600 Unidades';
 const catalog=[{supplier_sku:'P600',product_data:{name,
  rawAvailability:'Disponível',category:'Limpeza'}}];
 const offers=[53.99,54.50].map((price,i)=>({
  shopId:'123',itemId:String(3000+i),productName:name,
  priceMin:price,priceMax:price,sales:1200,monthlySold:1000
 }));
 const rows=matchCurveOffers({catalog,offers,costs:[{supplier_sku:'P600',unit_cost:10}]});
 assert.equal(rows.length,1);
 assert.equal(rows[0].competitorOfferCount,2);
 assert.equal(rows[0].avgCompetitorPrice,54.25);
 assert.equal(new Set(rows[0].competitorOffers.map(x=>x.shopId)).size,1);
 assert.equal(rows[0].monthlyCompetitorCount,1);
});

test('Curvas protege o mini processador manual de preços e vendas do elétrico 300 watts',()=>{
 const name='Mini Processador de Alimentos Manual - Sortido';
 const catalog=[{supplier_sku:'TRC0393',product_data:{
  name,category:'Cozinha',rawAvailability:'Disponível'}}];
 const offers=[
  {shopId:'991',itemId:'111',productName:'Mini Processador de alimentos 300 watts preto Turbo Pratic Mondial',
   priceMin:161.41,priceMax:161.41,monthlySold:5000,sales:5000},
  {shopId:'992',itemId:'112',productName:'Mini Processador de Alimentos Manual Triturador',
   priceMin:13.98,priceMax:13.98,monthlySold:3000,sales:3000},
  {shopId:'993',itemId:'113',productName:'Mini Processador Manual de Alimentos 500ml',
   priceMin:14.99,priceMax:14.99,monthlySold:2000,sales:2000}
 ];
 const rows=matchCurveOffers({catalog,costs:[{supplier_sku:'TRC0393',unit_cost:5.99}],offers});
 assert.equal(rows.length,1);
 assert.equal(rows[0].curve,'A');
 assert.equal(rows[0].monthlyCompetitorCount,2);
 assert.equal(rows[0].sales30,3000);
 assert.equal(rows[0].competitorPrice,13.98);
 assert.equal(rows[0].avgCompetitorPrice,14.49);
 assert.equal(rows[0].competitorOfferCount,2);
 assert.ok(rows[0].competitorOffers.every(x=>x.price<50));
 assert.ok(!rows[0].competitorOffers.some(x=>x.itemId==='111'));
});

test('foto de referência SKU 639384: só suporte de modelo inox/esférico entra na média',()=>{
 const title='Escova Sanitária de Banheiro com Suporte - Inox';
 const catalog=[{supplier_sku:'639384',product_data:{
  name:title,rawAvailability:'Disponível',category:'Banheiro'}}];
 const plastic={shopId:'201',itemId:'801',
  productName:'Escova Sanitária Cabo Inox Suporte Plástico Polipropileno Redondo Banheiro',
  priceMin:24.87,priceMax:24.87,sales:10000,monthlySold:5000};
 const metal=[
  {shopId:'301',itemId:'901',
   productName:'Escova Sanitária com Suporte Inox Esférico Banheiro',
   priceMin:81.90,priceMax:81.90,sales:1200,monthlySold:1100},
  {shopId:'302',itemId:'902',
   productName:'Escova Sanitária com Suporte Inox Globo Banheiro',
   priceMin:85.90,priceMax:85.90,sales:1100,monthlySold:1000}
 ];
 const onlyPlastic=matchCurveOffers({catalog,offers:[plastic],
  costs:[{supplier_sku:'639384',unit_cost:37.99}]});
 assert.deepEqual(onlyPlastic,[],'produto de suporte plástico não comprova preço do modelo esférico inox');
 const incomplete=matchCurveOffers({catalog,offers:[plastic,metal[0]],
  costs:[{supplier_sku:'639384',unit_cost:37.99}]});
 assert.equal(incomplete.length,1);
 assert.equal(incomplete[0].avgCompetitorPrice,null);
 assert.equal(incomplete[0].adsCompetitiveness.status,'missing_market');
 const complete=matchCurveOffers({catalog,offers:[plastic,...metal],
  costs:[{supplier_sku:'639384',unit_cost:37.99}]});
 assert.equal(complete.length,1);
 assert.equal(complete[0].competitorOfferCount,2);
 assert.equal(complete[0].avgCompetitorPrice,83.90);
 assert.equal(complete[0].monthlyCompetitorCount,2);
 assert.equal(complete[0].curve,'A');
 assert.ok(complete[0].competitorPrice>=80);
 assert.ok(!complete[0].competitorOffers.some(x=>x.itemId==='801'));
});

test('pesquisa usa o atributo inox mesmo quando aparece no final do nome WeDrop',()=>{
 const query=curveSkuSearchQuery('Escova Sanitária de Banheiro com Suporte - Inox');
 assert.match(query,/escova sanitaria/);
 assert.match(query,/inox/);
 assert.match(query,/suporte/);
});
