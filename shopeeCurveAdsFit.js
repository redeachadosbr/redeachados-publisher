// Triagem Curvas A/B: demanda real não é suficiente sem preço competitivo.
// Usa custo WeDrop e uma média observada de pelo menos duas lojas.
import {SHOPEE_PRICE_DEFAULTS,normalizeShopeePricingSettings,
 calculateShopeeSale,minimumGrossForNetMargin} from './shopeePricing.js';
export const CURVE_ADS_POLICY=Object.freeze({
 maxAboveMarketPct:40,minMonthlyCompetitors:3,minMarketStores:3,
 screeningAdsPct:10,screeningMinMarginPct:5
});
const cents=x=>Math.round(x*100);
const round2=x=>Math.round((x+Number.EPSILON)*100)/100;
const positive=n=>Number.isFinite(n)&&n>0&&n<100000;
const settings=normalizeShopeePricingSettings({
 ...SHOPEE_PRICE_DEFAULTS,discountPct:0,couponPct:0,
 adsPct:CURVE_ADS_POLICY.screeningAdsPct,
 minMarginPct:CURVE_ADS_POLICY.screeningMinMarginPct
});
function reject(status,reason,rest={}){
 return {eligible:false,status,reason,marketAverage:null,
  maxMarketPrice:null,suggestedSalePrice:null,estimatedNetProfit:null,
  estimatedMarginPct:null,...rest};
}
export function assessCurveAdsCompetitiveness({
 cost,avgCompetitorPrice,competitorOfferCount=0,inStock=true
}={}){
 const unit=cost===null||cost===undefined?NaN:Number(cost);
 const avg=avgCompetitorPrice===null||avgCompetitorPrice===undefined?
  NaN:Number(avgCompetitorPrice);
 if(inStock!==true)return reject('out_of_stock','SKU sem estoque WeDrop.');
 if(!positive(unit))return reject('missing_cost','Custo WeDrop não cadastrado.');
 if(!positive(avg)||Number(competitorOfferCount)<CURVE_ADS_POLICY.minMarketStores)
  return reject('missing_market','Média do preço de venda não confirmada: exigir 3 a 5 anúncios comparáveis de lojas diferentes.');
 const ceiling=round2(avg*1.4);
 if(unit>=avg)return reject('cost_above_market','Custo WeDrop acima ou igual à média de venda dos concorrentes.',
  {marketAverage:avg,maxMarketPrice:ceiling});
 const floor=minimumGrossForNetMargin(unit,settings,CURVE_ADS_POLICY.screeningMinMarginPct);
 if(!Number.isSafeInteger(floor)||floor<=0)return reject('unprofitable','Taxas não permitem margem mínima.',
  {marketAverage:avg,maxMarketPrice:ceiling});
 let solution=null;
 for(let price=Math.max(cents(avg),floor);price<=cents(ceiling);price++){
  if(price%10!==0&&price%10!==9)continue;
  const sale=calculateShopeeSale(price,settings,cents(unit));
  if(sale.profit>0&&sale.marginPct+1e-7>=CURVE_ADS_POLICY.screeningMinMarginPct){
   solution=sale;break;
  }
 }
 if(!solution)return reject('above_40_pct','Preço rentável em Ads excede 40% acima da média.',
  {marketAverage:avg,maxMarketPrice:ceiling});
 return {eligible:true,status:solution.finalPrice<=avg+0.009?'within_market':'within_40_pct',
  reason:'Projeção financeira aprovada para triagem; revise taxas reais antes de anunciar.',
  marketAverage:avg,maxMarketPrice:ceiling,
  suggestedSalePrice:solution.finalPrice,estimatedNetProfit:solution.profit,
  estimatedMarginPct:round2(solution.marginPct),
  priceGapPct:round2((solution.finalPrice/avg-1)*100),
  estimatedAdsPct:CURVE_ADS_POLICY.screeningAdsPct,
  minimumNetMarginPct:CURVE_ADS_POLICY.screeningMinMarginPct,
  marketPriceSampleCount:Number(competitorOfferCount)};
}
export function curveAdsRejectionStats(rows=[]){
 const excluded=rows.filter(row=>row.verified30&&['A','B'].includes(row.curve)&&
  row.adsCompetitiveness?.eligible!==true);
 const rejectedReasons={};
 for(const row of excluded){
  const k=row.adsCompetitiveness?.status||'unknown';
  rejectedReasons[k]=(rejectedReasons[k]||0)+1;
 }
 return {excludedByPrice:excluded.length,rejectedReasons};
}
