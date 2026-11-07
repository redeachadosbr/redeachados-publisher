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


// A falta de comparacao de mercado nao pode ser mascarada como pesquisa.
// Um desconto calculado pelo custo WeDrop pode receber aprovacao MANUAL
// especifica do vendedor, desde que preserve as regras de lucro e centavos.
// A aprovacao so vale para a SKU/Item ID, valor e previa assinada.
export function unresearchedMarginApprovalEligible(q,{sellerApproved=false}={}){
 if(sellerApproved!==true||q?.variableDiscount!==true||
   q.discountRecommendationSource!=='base_not_researched'||
   q.marketResearch?.verified===true||q.readyForManualReview!==true||
   q.appliedInShopee!==false||
   !(q.priceEndingRuleVersion===4&&q.priceEndingPolicy==='both_checkout_and_visible'||
     q.priceEndingRuleVersion===6&&q.priceEndingPolicy==='listed_price_coupon_conditional'&&q.marginOverride===true))
   return false;
 const n=x=>Number(x),cost=n(q.unitCost),gross=n(q.grossPrice),
  discount=n(q.discountPct),coupon=n(q.couponPct),
  promo=n(q.marketplaceDisplayPrice),checkout=n(q.customerPrice),
  minimum=n(q.minMarginPct),desired=n(q.targetMarginPct),
  margin=n(q.netMarginPct),profit=n(q.netProfit),
  shipping=n(q.breakdown?.shipping||0),packing=n(q.breakdown?.packing||0);
 const finite=[cost,gross,discount,coupon,promo,checkout,minimum,desired,margin,profit,
  shipping,packing].every(Number.isFinite);
 if(!finite||cost<=0||gross<=0||discount<=0||discount>50||
    coupon<0||coupon>=90||promo<=0||checkout<=0||
    minimum<0||margin+0.002<Math.max(desired,minimum)||
    profit<=0||gross>3*(cost+shipping+packing)+0.031||
    Math.abs(promo-Math.round(gross*(1-discount/100)*100)/100)>0.011||
    Math.abs(checkout-Math.round(promo*(1-coupon/100)*100)/100)>0.011)return false;
 const ending=value=>[0,9].includes(((Math.round(value*100)%10)+10)%10);
 return (q.priceEndingRuleVersion===6?[gross,promo]:[gross,promo,checkout]).every(ending);
}
