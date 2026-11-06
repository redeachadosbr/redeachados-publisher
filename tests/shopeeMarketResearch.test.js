import test from 'node:test';
import assert from 'node:assert/strict';
import {marketSearchKeywords,comparableTitle,evaluateMarketOffers,
 lookupShopeeCompetitors,marketResearchConfigured} from '../shopeeMarketResearch.js';
import {quoteShopeePrice} from '../shopeePricing.js';

const original='Piscina Inflável Infantil Quadrada 210 Litros Azul Top Rio';
const offer=(n,id,shop,price,title=original)=>({
 itemId:String(id),shopId:String(shop),priceMin:String(price),priceMax:String(price),
 productName:title
});

test('Pesquisa traduz capacidade e tipo do item em palavras-chave, não SKU interna',()=>{
 const keywords=marketSearchKeywords(original);
 assert.match(keywords,/piscina/);
 assert.match(keywords,/210 litros/);
 assert.doesNotMatch(keywords,/TRC1525/);
});
test('Semelhança exige capacidade e formato, ignora capa, bomba e variações',()=>{
 assert.equal(comparableTitle(original,'Piscina Inflável Quadrada 210 Litros Infantil'),true);
 assert.equal(comparableTitle(original,'Piscina Inflável Redonda 400 Litros'),false);
 assert.equal(comparableTitle(original,'Capa para Piscina Inflável Quadrada 210 Litros'),false);
 assert.equal(comparableTitle(original,'Piscina Inflável Quadrada 500 Litros'),false);
 assert.equal(comparableTitle(original,'Piscina Inflável Quadrada Infantil 210 Litros'),true);
});
test('Três vendedores válidos geram mediana com URLs rastreáveis',()=>{
 const offers=[offer(1,1,11,174),offer(2,2,12,177),offer(3,3,13,176),
  offer(4,4,14,900),offer(5,5,15,20),
  offer(6,6,17,170,'Inflador Piscina Inflável Quadrada 210 Litros')];
 const result=evaluateMarketOffers({title:original,offers,ownShopId:100,ownItemId:999});
 assert.equal(result.verified,true);
 assert.equal(result.reference,176);
 assert.equal(result.count,3);
 assert.ok(result.sample.every(x=>x.url.startsWith('https://shopee.com.br/product/')));
});
test('Nunca confundir uma oferta única ou produtos próprios com pesquisa validada',()=>{
 const offers=[offer(1,1,11,175),offer(2,2,11,176),offer(3,3,99,170)];
 const result=evaluateMarketOffers({title:original,offers,ownShopId:99,ownItemId:123});
 assert.equal(result.verified,false);
 assert.equal(result.reference,null);
 assert.equal(result.count,2);
});
test('Não simular concorrência ou usar preços inventados se não há fonte válida',async()=>{
 if(!marketResearchConfigured()){
  const result=await lookupShopeeCompetitors({title:original,ownShopId:10,ownItemId:30});
  assert.equal(result.verified,false);
  assert.equal(result.reference,null);
  assert.equal(result.status,'provider_not_configured');
  assert.equal(result.sample.length,0);
 }
});
test('Com referência válida desconto variável protege margem e não conserva 20% por padrão',()=>{
 const settings={marginPct:10,minMarginPct:5,discountPct:20,couponPct:1,taxPct:4,
  flashPct:3,adsPct:0,shipping:0,packing:0,sellerType:'cpf',
  highVolumeCpf:false,commissionRates:[20,14,14,14],fixedFees:[4.5,16,20,26]};
 const baseline=quoteShopeePrice({unitCost:99.99,settings});
 const market=quoteShopeePrice({unitCost:99.99,settings,marketAverage:195});
 assert.equal(baseline.discountPct,20);
 assert.ok(market.discountPct<20);
 assert.ok(market.customerPrice<=195.01);
 assert.ok(market.netMarginPct>=5);
 const tight=quoteShopeePrice({unitCost:99.99,settings,marketAverage:170});
 assert.ok(tight.discountPct>20);
 assert.ok(tight.netMarginPct>=5);
 const below=quoteShopeePrice({unitCost:99.99,settings,marketAverage:80});
 assert.equal(below.status,'MERCADO_ABAIXO_DO_PISO');
});

test('amostra dedicada à Curvas aceita até 10 anúncios sem alterar a regra geral',()=>{
 const offers=Array.from({length:12},(_,i)=>offer(i,i+100,i+200,170+i));
 const standard=evaluateMarketOffers({title:original,offers});
 const curves=evaluateMarketOffers({title:original,offers,minOffers:2,maxOffers:10});
 assert.equal(standard.count,5);
 assert.equal(curves.count,10);
 assert.equal(curves.sample.length,10);
});

test('Curvas calcula média com 5 anúncios distintos de uma única loja, sem duplicar Item ID',()=>{
 const sample=[170,175,180,185,190].map((price,i)=>offer(i,i+900,700,price));
 const incomplete=evaluateMarketOffers({title:original,offers:sample.slice(0,4),
  minOffers:5,maxOffers:10,allowSameShop:true});
 assert.equal(incomplete.verified,false);
 assert.equal(incomplete.count,4);
 const complete=evaluateMarketOffers({title:original,offers:[...sample,sample[0]],
  minOffers:5,maxOffers:10,allowSameShop:true});
 assert.equal(complete.verified,true);
 assert.equal(complete.count,5);
 assert.equal(complete.average,180);
 assert.equal(new Set(complete.sample.map(x=>x.itemId)).size,5);
 assert.equal(new Set(complete.sample.map(x=>x.shopId)).size,1);
});

test('Curvas calcula media com dois anúncios da mesma loja e Item IDs distintos',()=>{
 const pair=[170,190].map((price,i)=>offer(i,i+850,700,price));
 const result=evaluateMarketOffers({title:original,offers:[...pair,pair[0]],
  minOffers:2,maxOffers:10,allowSameShop:true});
 assert.equal(result.verified,true);
 assert.equal(result.count,2);
 assert.equal(result.average,180);
 assert.equal(new Set(result.sample.map(x=>x.shopId)).size,1);
});

test('mini processador manual nunca herda preço de processador elétrico 300 watts',()=>{
 const source='Mini Processador de Alimentos Manual - Sortido';
 const electric='Mini Processador de alimentos 300 watts preto Turbo Pratic MP-16-B Mondial';
 const manual='Mini Processador de Alimentos Manual Triturador de Cebola';
 assert.equal(comparableTitle(source,electric),false);
 assert.equal(comparableTitle(source,manual),true);
 const offered=[
  offer(1,1,201,161.41,electric),
  offer(2,2,202,13.98,manual),
  offer(3,3,203,14.99,'Mini Processador Manual de Alimentos Puxador')
 ];
 const result=evaluateMarketOffers({title:source,offers:offered,
  minOffers:2,maxOffers:10,allowSameShop:true});
 assert.equal(result.verified,true);
 assert.equal(result.count,2);
 assert.equal(result.average,14.49);
 assert.ok(result.sample.every(x=>x.price<50));
});
