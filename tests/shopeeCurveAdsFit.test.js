import test from 'node:test';
import assert from 'node:assert/strict';
import {assessCurveAdsCompetitiveness as fit,curveAdsRejectionStats,CURVE_ADS_POLICY} from '../shopeeCurveAdsFit.js';
test('bikes acima de R$79,99 não são aptas para Ads mesmo com Curva A',()=>{
 for(const cost of [115.99,129.99,79.99]){
  const result=fit({cost,avgCompetitorPrice:79.99,competitorOfferCount:5,inStock:true});
  assert.equal(result.eligible,false);
  assert.equal(result.status,'cost_above_market');
 }
});
test('sem custo, sem amostra de preço e sem estoque bloqueia indicação',()=>{
 for(const tweak of [{cost:null},{cost:0},{competitorOfferCount:1},{inStock:false},{cost:100}]){
  const result=fit({cost:40,avgCompetitorPrice:100,competitorOfferCount:5,inStock:true,...tweak});
  assert.equal(result.eligible,false,JSON.stringify(tweak));
 }
});
test('só aprova preço real na média ou até 60% acima com lucro líquido simulado',()=>{
 const q=fit({cost:40,avgCompetitorPrice:100,competitorOfferCount:5});
 assert.equal(q.eligible,true);
 assert.ok(q.suggestedSalePrice>=100&&q.suggestedSalePrice<=160);
 assert.equal(q.maxMarketPrice,160);
 assert.ok(q.estimatedNetProfit>0&&q.estimatedMarginPct>=5);
 assert.equal(CURVE_ADS_POLICY.maxAboveMarketPct,60);
});
test('não aprova custo abaixo da média se a receita no teto ainda dá prejuízo',()=>{
 const q=fit({cost:99.50,avgCompetitorPrice:100,competitorOfferCount:5});
 assert.equal(q.eligible,false);
 assert.equal(q.status,'above_60_pct');
});
test('produto rentável entre 40% e 60% acima da média passa na nova triagem',()=>{
 const q=fit({cost:80,avgCompetitorPrice:100,competitorOfferCount:5});
 assert.equal(q.eligible,true);
 assert.equal(q.status,'within_60_pct');
 assert.ok(q.suggestedSalePrice>140&&q.suggestedSalePrice<=160);
 assert.ok(q.estimatedNetProfit>0&&q.estimatedMarginPct>=5);
 assert.equal(q.estimatedAdsPct,10);
});
test('aceita exatamente +60% com margem mínima, mas rejeita quando precisa ultrapassar o teto',()=>{
 const atLimit=fit({cost:82.4,avgCompetitorPrice:100,competitorOfferCount:5});
 assert.equal(atLimit.eligible,true);
 assert.equal(atLimit.suggestedSalePrice,160);
 assert.equal(atLimit.priceGapPct,60);
 assert.equal(atLimit.estimatedMarginPct,5);
 const overLimit=fit({cost:82.41,avgCompetitorPrice:100,competitorOfferCount:5});
 assert.equal(overLimit.eligible,false);
 assert.equal(overLimit.status,'above_60_pct');
 assert.equal(overLimit.maxMarketPrice,160);
 assert.equal(overLimit.suggestedSalePrice,null);
});
test('teto de +60% é truncado aos centavos sem permitir arredondamento para cima',()=>{
 const marketAverage=100.06;
 const q=fit({cost:82.47,avgCompetitorPrice:marketAverage,competitorOfferCount:5});
 assert.equal(q.maxMarketPrice,160.09);
 assert.ok(q.maxMarketPrice<=marketAverage*1.6);
 assert.equal(q.eligible,false);
 assert.equal(q.status,'above_60_pct');
});
test('não aprova médias com contagens inválidas de anúncios comparáveis',()=>{
 for(const count of [NaN,Infinity,'incerto',2.5,-1]){
  const q=fit({cost:40,avgCompetitorPrice:100,competitorOfferCount:count});
  assert.equal(q.eligible,false,String(count));
  assert.equal(q.status,'missing_market');
 }
});
test('estatística conta apenas rejeições de Curvas A/B confirmadas',()=>{
 const rows=[
  {curve:'A',verified30:true,adsCompetitiveness:{eligible:false,status:'cost_above_market'}},
  {curve:'B',verified30:true,adsCompetitiveness:{eligible:false,status:'missing_market'}},
  {curve:'B',verified30:true,adsCompetitiveness:{eligible:true}},
  {curve:'PENDING',verified30:false,adsCompetitiveness:{eligible:false}}
 ];
 const q=curveAdsRejectionStats(rows);
 assert.equal(q.excludedByPrice,2);
 assert.equal(q.rejectedReasons.missing_market,1);
});

test('média Curvas admite dois anúncios distintos do mesmo produto, não cinco',()=>{
 assert.equal(fit({cost:40,avgCompetitorPrice:100,competitorOfferCount:1}).eligible,false);
 for(const count of [2,3,4,5,10]){
  assert.equal(fit({cost:40,avgCompetitorPrice:100,competitorOfferCount:count}).eligible,true);
 }
 assert.equal(CURVE_ADS_POLICY.minMonthlyCompetitors,2);
 assert.equal(CURVE_ADS_POLICY.minPriceOffers,2);
});

