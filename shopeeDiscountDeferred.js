// Desconto deferido: autorização comercial antes da ativação do anúncio.
// A API de escrita continua restrita a NORMAL e com prévia assinada recente.
export function discountPreviewStatus(status,{allowDeferred=false}={}){
 const value=String(status??'').trim().toUpperCase();
 if(value==='NORMAL')return {deferred:false,status:'NORMAL'};
 // Shopee pode colocar um anúncio em análise antes de ativá-lo.
 // A conferência abaixo NÃO assina uma autorização de escrita no marketplace.
 if(allowDeferred&&['UNLIST','REVIEWING'].includes(value))
  return {deferred:true,status:value};
 const readable={
  UNLIST:'inativo',
  REVIEWING:'em análise pela Shopee',
  BANNED:'banido (exige regularização)',
  SELLER_DELETE:'excluído pelo vendedor',
  SHOPEE_DELETE:'excluído pela Shopee'
 };
 const visible=value||'NÃO INFORMADO';
 const reason=readable[value]||'não reconhecido';
 throw Error('Status real na Shopee: '+visible+' ('+reason+'). '+
  (['BANNED','SELLER_DELETE','SHOPEE_DELETE'].includes(value)?
  'O anúncio precisa ser regularizado; não é possível preparar uma promoção válida.':
  'Ainda não é possível publicar desconto. Use a conferência antecipada quando o status permitir.'));
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
