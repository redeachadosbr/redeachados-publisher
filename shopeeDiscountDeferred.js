// Desconto deferido: autorização comercial antes da ativação do anúncio.
// A API de escrita continua restrita a NORMAL e com prévia assinada recente.
export function discountPreviewStatus(status,{allowDeferred=false}={}){
 const value=String(status||'').trim().toUpperCase();
 if(value==='NORMAL')return {deferred:false,status:'NORMAL'};
 if(value==='UNLIST'&&allowDeferred)return {deferred:true,status:'UNLIST'};
 throw Error('O anúncio não está em situação NORMAL na Shopee; a promoção não será alterada.');
}
// Campos comerciais imutáveis pela execução normal do anúncio.
// originalPrice/action/needsBasePriceUpdate podem variar quando a Shopee ativa
// o produto; o checkbox de preço bruto cobre eventual ajuste, se explicitamente marcado.
export const DEFERRED_DISCOUNT_FINANCIAL_FIELDS=Object.freeze([
 'shopId','sku','itemId','modelId','discountId','gross','promo',
 'buyerAfterCoupon','discountPct','couponPct','quoteAt'
]);
export function validateDeferredDiscountPlan(expected,fresh,{priceConsent=false}={}){
 if(!expected||!fresh)throw Error('Não foi possível confirmar o plano do desconto.');
 for(const key of DEFERRED_DISCOUNT_FINANCIAL_FIELDS){
  if(String(expected[key]??'')!==String(fresh[key]??''))
   throw Error('Desconto mudou após sua aprovação ('+key+'). Refaça a conferência; nada foi enviado.');
 }
 if(fresh.needsBasePriceUpdate&&!priceConsent)
  throw Error('O preço bruto mudou. Autorize sua atualização antes de executar o desconto.');
 return true;
}
