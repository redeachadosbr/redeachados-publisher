import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {aboveMarketMarginProtected,marketFloorDiscountEligibility} from '../shopeeMarketFloorApproval.js';

const quote2392={
 sku:'2392',status:'MERCADO_ABAIXO_DO_PISO',
 unitCost:569.99,grossPrice:1123.24,discountPct:20,
 buyerAfterCoupon:889.6,customerPrice:889.6,priceFloor:805.39,
 netMarginPct:12.005,minMarginPct:5,netProfit:106.8,marketGapPct:10.9,
 discountRecommendationSource:'researched',
 marketResearch:{verified:true,count:5,reference:802.2,
  source:'shopee_affiliate_product_offers',sourceType:'researched_affiliate_offers',
  researchedAt:'2026-10-25T04:47:17.307Z'}
};
test('SKU2392: pesquisa com cinco ofertas verificada continua valida apesar da média abaixo do piso',()=>{
 assert.equal(aboveMarketMarginProtected(quote2392),true);
 const d=marketFloorDiscountEligibility(quote2392);
 assert.equal(d.allowed,true);assert.equal(d.aboveMarket,true);
 assert.match(d.message,/ACIMA da média/);
 assert.equal(quote2392.netProfit,106.8);assert.equal(quote2392.discountPct,20);
});
test('bloquear preço abaixo do piso, margem insuficiente, dados fictícios e diferença excessiva',()=>{
 for(const change of [
  {netMarginPct:4.99},{netProfit:-1},{buyerAfterCoupon:795,customerPrice:795},
  {marketGapPct:26},{marketResearch:{...quote2392.marketResearch,verified:false}},
  {marketResearch:{...quote2392.marketResearch,count:1}},
  {marketResearch:{...quote2392.marketResearch,source:'manual'}},
  {discountRecommendationSource:'base_not_researched'},
  {discountPct:0}
 ]){
  const candidate={...quote2392,...change};
  assert.equal(aboveMarketMarginProtected(candidate),false,JSON.stringify(change));
  assert.equal(marketFloorDiscountEligibility(candidate).allowed,false);
 }
});
test('status competitivo convencional permanece apto sem depender da exceção',()=>{
 assert.deepEqual(marketFloorDiscountEligibility({...quote2392,status:'COMPETITIVO'}),
  {allowed:true,aboveMarket:false,message:null});
});
test('interface e servidor usam os mesmos limites e nunca publicam desconto durante conferência',()=>{
 const client=readFileSync(new URL('../public/app.js',import.meta.url),'utf8');
 const server=readFileSync(new URL('../server.js',import.meta.url),'utf8');
 assert.match(client,/function optimizerDiscountMarketFloorProtected/);
 assert.match(client,/n\(q\.marketGapPct\)/);
 assert.match(client,/above<=25/);
 assert.match(client,/optimizerDiscountFinalEligible\(q\)/);
 assert.match(client,/A pesquisa possui/);
 assert.match(client,/Ao clicar em Conferir desconto/);
 assert.match(server,/marketFloorDiscountEligibility\(quote\)/);
 assert.match(server,/if\(!marketFloor\.allowed\)throw Error/);
 assert.match(server,/marketFloorNotice:marketFloor\.message/);
 assert.match(client,/allowDeferredPreview:true/);
 assert.match(server,/readOnly:true,preview:data\.snapshot/);
});
