import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {curveGroup,curveSearchTerms,matchCurveOffers,pickCurveResults,
 officialFeaturedSearchUrl,seoTitleFromEvidence} from '../shopeeCurveAB.js';
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
 assert.match(js,/new URLSearchParams\(\{limit:amount,curve,category,keyword\}\)/);
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
