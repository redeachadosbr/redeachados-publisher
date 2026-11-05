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
test('curva A exige 900 a 1.000 em 30 dias observados e B abaixo de 900',()=>{
 assert.equal(curveGroup(900,7000).curve,'A');
 assert.equal(curveGroup(1000,7000).curve,'A');
 assert.equal(curveGroup(899,7000).curve,'B');
 assert.equal(curveGroup(1001,7000).curve,'HIGH');
});
test('vendas acumuladas geram apenas potencial e nunca 30 dias inventados',()=>{
 const x=curveGroup(null,950),y=curveGroup(null,400);
 assert.equal(x.curve,'A');assert.equal(x.verified30,false);
 assert.match(x.label,/acumulado/);
 assert.equal(y.curve,'B');assert.equal(y.verified30,false);
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
 assert.equal(rows[1].curve,'B');
});
test('histórico de 30 dias observa delta verdadeiro e nao total acumulado',()=>{
 const rows=matchCurveOffers({catalog:fixture,offers,baseline:new Map([
  ['1001',{day:'2026-10-06',sales:0}],
  ['1002',{day:'2026-10-06',sales:120}]
 ]),today:'2026-11-05'});
 assert.equal(rows[0].sales30,950);
 assert.equal(rows[0].verified30,true);
 assert.equal(rows[1].sales30,530);
 assert.equal(rows[1].verified30,true);
});
test('quantidades 5, 10, 15, 20 retornam menos sem bloquear',()=>{
 const rows=matchCurveOffers({catalog:fixture,offers,today:'2026-11-05'});
 for(const limit of [5,10,15,20]){
  const result=pickCurveResults(rows,{limit});
  assert.equal(result.items.length,2);
  assert.equal(result.shortage,limit-2);
 }
 assert.equal(pickCurveResults(rows,{limit:10,curve:'A'}).items.length,1);
 assert.equal(pickCurveResults(rows,{limit:10,curve:'B'}).items.length,1);
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
test('média de preços usa 2 a 5 concorrentes comparáveis em lojas diferentes',()=>{
 const catalog=[{supplier_sku:'CQA-500',source_file:'wedrop.xlsx',product_data:{
  name:'Coqueteleira Shaker Inox 500ml',category:'Copos, Jarras e Servir',
  imageUrl:photo,rawAvailability:'Disponível'}}];
 const competitors=[
  {itemId:'8881',shopId:'201',productName:'Coqueteleira Shaker Inox 500ml',
   priceMin:'29.90',priceMax:'29.90',sales:950},
  {itemId:'8882',shopId:'202',productName:'Coqueteleira Shaker Inox 500ml com Tampa',
   priceMin:'31.90',priceMax:'31.90',sales:930},
  {itemId:'8883',shopId:'203',productName:'Coqueteleira Shaker Inox 500ml',
   priceMin:'33.90',priceMax:'33.90',sales:915}
 ];
 const rows=matchCurveOffers({catalog,offers:competitors});
 assert.equal(rows.length,1);
 assert.equal(rows[0].avgCompetitorPrice,31.90);
 assert.equal(rows[0].competitorOfferCount,3);
 assert.equal(rows[0].competitorOffers.length,3);
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
 assert.match(js,/Média dos concorrentes/);
 assert.match(js,/verifiedOnly:verifiedOnly\?'1':'0'/);
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
   priceMin:'33.90',priceMax:'33.90',sales:915}
 ]});
 assert.equal(rows.length,1);
 assert.equal(rows[0].shopId,'202');
 assert.equal(rows[0].avgCompetitorPrice,32.90);
 assert.equal(rows[0].competitorOfferCount,2);
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
 assert.match(source,/if\(pickCurveResults\(state\.matches,\{limit:desired,curve\}\)\.items\.length>=desired\)break;/);
 assert.match(source,/skuSearchesCompleted:state\.scannedSkus\.size/);
 assert.match(source,/hasMore,nextCursor:state\.cursor/);
 assert.match(ui,/params\.set\('advance','1'\)/);
 assert.match(ui,/q\('curveContinueSearch'\)\?\.addEventListener/);
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
 assert.match(rows[0].curveLabel,/Potencial/);
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
 assert.equal(relaxed.items.length,1);
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
 assert.match(html,/id="curveConfirmedOnly" checked/);
 assert.match(html,/id="curveTestSources"/);
});
