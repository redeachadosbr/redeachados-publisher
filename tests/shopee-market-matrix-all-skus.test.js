import test from 'node:test';
import assert from 'node:assert/strict';
import {REDE_ACHADOS_MARKET_RULES,marketMatrixProfile,marketMatrixSearchQueries,
 marketMatrixFamilyCompatible} from '../shopeeMatrixRules.js';
import {marketSearchQueries,comparableTitle,evaluateMarketOffers} from '../shopeeMarketResearch.js';

const cases=[
 ['mochila construtor','Super Mochila Construtor 3 em 1 com Ferramentas e Acessórios',
  'Mochila Infantil 3 em 1 Construtor Ferramentas Brinquedo',
  'Mochila profissional eletricista ferramentas impermeável'],
 ['vaporizador','Passadeira a Vapor Portátil 800W 127V 200ml',
  'Vaporizador Passadeira a Vapor Roupas 800 W 127V 200ml',
  'Passadeira a Vapor 1500W 220V 200ml'],
 ['piscina','Piscina Inflável Infantil Quadrada 210 Litros Azul',
  'Piscina Inflável Infantil Quadrada 210L',
  'Piscina Inflável Infantil Quadrada 300L'],
 ['banheiro','Porta Shampoo de Canto 2 Andares',
  'Suporte Shampoo Canto Banheiro 2 Andares',
  'Porta Shampoo Canto 3 Andares'],
 ['térmica','Garrafa Térmica 900ml para Bebidas',
  'Garrafa Térmica 900 ml Inox','Garrafa Térmica 750 ml'],
 ['cafeteira','Cafeteira Italiana 300ml',
  'Cafeteira Moka Italiana 300ml',
  'Cafeteira Moka 150 ml'],
 ['ferramentas','Jogo Chaves 40 Peças com Maleta',
  'Kit Jogo Chaves Ferramentas 40 Peças',
  'Kit Jogo Chaves Ferramentas 32 Peças'],
 ['natal','Árvore Natal 2,10m 1100 Galhos',
  'Árvore Natal 2.10m 1100 Galhos',
  'Árvore Natal 1.80m 611 Galhos'],
 ['genérico','Caneca de Cerâmica Branca 300ml',
  'Caneca Cerâmica 300ml Branca',
  'Caneca Cerâmica 250 ml']
];

test('Motor Matriz único e permanente é aplicado à busca de qualquer SKU',()=>{
 assert.equal(REDE_ACHADOS_MARKET_RULES.minimumOffers,2);
 assert.equal(REDE_ACHADOS_MARKET_RULES.maximumOffers,5);
 assert.equal(REDE_ACHADOS_MARKET_RULES.maxQueries,5);
 assert.equal(REDE_ACHADOS_MARKET_RULES.apiPageLimit,50);
 assert.equal(REDE_ACHADOS_MARKET_RULES.distinctShops,true);
 assert.equal(REDE_ACHADOS_MARKET_RULES.excludeAccessories,true);
});
for(const [name,title,similar,other] of cases){
 test('Motor Matriz na categoria '+name+': busca e comparabilidade sem variante incorreta',()=>{
  const matrixQueries=marketMatrixSearchQueries(title);
  const searchQueries=marketSearchQueries(title);
  assert.ok(searchQueries.length>=2&&searchQueries.length<=5);
  assert.deepEqual(matrixQueries,searchQueries);
  assert.equal(comparableTitle(title,similar),true,'Deveria reconhecer equivalente: '+similar);
  assert.equal(comparableTitle(title,other),false,'Não deve misturar variante: '+other);
  assert.ok(marketMatrixProfile(title).family);
 });
}
test('Motor Matriz usa modelo e características para árvore, kits e eletrônicos',()=>{
 assert.ok(marketSearchQueries('Árvore Natal 2,10m 1100 Galhos').some(q=>q.includes('2.10m')));
 assert.ok(marketSearchQueries('Jogo Chaves 40 Peças com Maleta').some(q=>q.includes('40 pecas')));
 assert.ok(marketSearchQueries('Passadeira a Vapor Portátil 800W 127V 200ml').some(q=>q.includes('800w 127v')));
});
test('Categorias reconhecidas distintas nunca são comparadas diretamente',()=>{
 assert.equal(marketMatrixFamilyCompatible('Garrafa Térmica 900ml','Piscina Inflável 900 Litros'),false);
 assert.equal(marketMatrixFamilyCompatible('Porta Shampoo de Canto 2 Andares','Pote Hermético 2 Litros'),false);
});
test('Média exige 2 lojas e não confunde itens duplicados',()=>{
 const title='Garrafa Térmica 900ml';
 const offers=[
  {shopId:'100',itemId:'222',productName:'Garrafa Térmica 900 ml Inox',priceMin:'79',priceMax:'79'},
  {shopId:'100',itemId:'223',productName:'Garrafa Térmica 900 ml Para Café',priceMin:'83',priceMax:'83'},
  {shopId:'101',itemId:'224',productName:'Garrafa Térmica 900 ml Bebidas',priceMin:'85',priceMax:'85'}
 ];
 const sample=evaluateMarketOffers({title,offers});
 assert.equal(sample.verified,true);
 assert.equal(sample.count,2);
 assert.equal(sample.reference,82);
 assert.equal(new Set(sample.sample.map(x=>x.shopId)).size,2);
});
