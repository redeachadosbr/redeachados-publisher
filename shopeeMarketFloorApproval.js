// Exceção comercial SEGURA: concorrentes abaixo do piso não obrigam vender
// com prejuízo. Aprovação acontece SOMENTE mediante prévia e clique do lojista.
// Isto NÃO muda a cotação, margem, preço bruto, campanha ou desconto calculados.
const num=x=>Number(x);
export function aboveMarketMarginProtected(quote,{allowOver25=false}={}){
 if(!quote||quote.status!=='MERCADO_ABAIXO_DO_PISO')return false;
 const min=num(quote.minMarginPct),margin=num(quote.netMarginPct),
  profit=num(quote.netProfit),market=num(quote.marketResearch?.reference),
  effective=num(quote.buyerAfterCoupon??quote.customerPrice),
  floor=num(quote.priceFloor),gap=num(quote.marketGapPct),
  gross=num(quote.grossPrice),discount=num(quote.discountPct);
 const research=quote.marketResearch;
 return Boolean(
  research?.verified===true&&research?.source==='shopee_affiliate_product_offers'&&
  research?.sourceType==='researched_affiliate_offers'&&
  Number.isInteger(research.count)&&research.count>=2&&research.count<=5&&
  Number.isFinite(min)&&min>=0&&Number.isFinite(margin)&&margin+0.0001>=min&&
  Number.isFinite(profit)&&profit>0&&
  Number.isFinite(market)&&market>0&&Number.isFinite(floor)&&floor>0&&market<floor&&
  Number.isFinite(effective)&&effective>=floor-0.01&&
  Number.isFinite(gap)&&gap>=0&&(gap<=25||allowOver25===true)&&
  Number.isFinite(gross)&&gross>0&&Number.isFinite(discount)&&discount>0&&discount<90&&
  quote.discountRecommendationSource==='researched'
 );
}
export function marketFloorDiscountEligibility(quote,{allowOver25=false}={}){
 if(!quote||quote.status==='MERCADO_ABAIXO_DO_PISO'&&!aboveMarketMarginProtected(quote,{allowOver25}))
  return {allowed:false,aboveMarket:false,
   message:'Concorrentes abaixo do preço mínimo seguro. Revise custo e margem; preço abaixo do piso continua bloqueado.'};
 if(quote?.status==='MERCADO_ABAIXO_DO_PISO')
  return {allowed:true,aboveMarket:true,message:
   'Pesquisa verificada. Concorrentes abaixo do piso: o preço promocional permanece ACIMA da média e protege a margem mínima. Exige aprovação do lojista e validação da campanha Shopee.'};
 return {allowed:true,aboveMarket:false,message:null};
}
