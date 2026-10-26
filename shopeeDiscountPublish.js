// Shopee-only: add/update ONE product in an existing discount activity.
// Never infer a publication from a price quote, and never combine coupon
// deductions with the discount activity's promotion price.
import crypto from 'node:crypto';

const brl=x=>Math.round(Number(x)*100)/100;
const validMoney=n=>Number.isFinite(Number(n))&&Number(n)>0&&Number(n)<=100000;
const integer=x=>/^\d{1,18}$/.test(String(x))&&Number.isSafeInteger(Number(x));
export function promotionFromQuote(q){
 if(!q||!validMoney(q.grossPrice)||!validMoney(q.unitCost)||
   !Number.isFinite(Number(q.discountPct))||Number(q.discountPct)<=0||Number(q.discountPct)>=90||
   !Number.isFinite(Number(q.netMarginPct))||Number(q.netMarginPct)+0.0001<Number(q.minMarginPct)||
   q.readyForManualReview!==true||q.appliedInShopee!==false)
  throw Error('Plano salvo inválido para promoção. Recalcule na Precificação.');
 const gross=brl(q.grossPrice);
 const promo=brl(gross*(1-Number(q.discountPct)/100));
 const couponPct=Number(q.couponPct||0);
 if(!Number.isFinite(couponPct)||couponPct<0||couponPct>=90)throw Error('Cupom da loja inválido.');
 const buyerAfterCoupon=brl(promo*(1-couponPct/100));
 if(Math.abs(buyerAfterCoupon-Number(q.customerPrice))>0.011)
  throw Error('Preço após cupom não confere com o plano salvo. Recalcule antes de publicar.');
 // Preço da Minha Promoção (vitrine) e preço com cupom seguem a MESMA
 // regra 0/9. Rejeitar planos v3 gerados pelo algoritmo antigo, nos quais
 // o cupom ficou com centavos inválidos. Recalcular sem enviar nada à Shopee.
 const allowed=x=>Math.round(x*100)%10===0||Math.round(x*100)%10===9;
 if(!Number.isFinite(Number(q.marketplaceDisplayPrice))||
    Math.abs(promo-Number(q.marketplaceDisplayPrice))>0.011)
  throw Error('Preço promocional visível divergente do plano salvo. Recalcule a SKU.');
 if(!allowed(promo)||!allowed(buyerAfterCoupon))
  throw Error('Preço na Shopee ou após cupom fora da regra de centavos 0/9. Recalcule a SKU em Otimização para obter os dois valores corretos.');
 if(q.priceEndingRuleVersion!==4||q.priceEndingPolicy!=='both_checkout_and_visible')
  throw Error('Plano calculado pela versão anterior da regra de centavos. Recalcule a SKU em Otimização antes de concluir o desconto.');
 if(q.marginOverride===true&&Number(q.netMarginPct)+0.001<Number(q.targetMarginPct))
  throw Error('A margem escolhida na barra não foi preservada. Recalcule a SKU.');
 if(promo<=0||promo>=gross)throw Error('Desconto inválido para publicação.');
 return {gross,promo,buyerAfterCoupon,couponPct,discountPct:Number(q.discountPct)};
}
export function promotionBasePrice(item){
 if(item?.has_model===true||item?.has_model===1)throw Error('Este anúncio possui variações. A execução inicial segura exige modelo único; não altere modelos em lote.');
 const info=(item?.price_info||[])[0]||{};
 const base=Number(info.original_price??item?.original_price);
 if(!validMoney(base))throw Error('Não foi possível confirmar o preço original na API da Shopee.');
 if(info.currency&&String(info.currency).toUpperCase()!=='BRL')
  throw Error('A moeda retornada pela Shopee não é BRL.');
 return brl(base);
}
export function promotionMember(pages,itemId){
 return pages.flatMap(p=>Array.isArray(p.item_list)?p.item_list:[]).find(x=>String(x.item_id)===String(itemId))||null;
}
// has_promotion from get_item_base_info is an ALL-promotions flag, not
// proof of membership in any other shop-discount activity. Never reject
// a SKU based only on this generic signal. Only the selected discount's
// get_discount.item_list establishes membership in that activity.
export function shopDiscountMembershipSignal(live,existing){
 if(existing)return {kind:'included_in_selected_discount',warning:null};
 if(live?.has_promotion===true)
  return {kind:'unclassified_promotion',
   warning:'A Shopee informa alguma atividade promocional neste anúncio, mas isso não comprova participação em outra Minha Promoção. A SKU não foi encontrada na promoção escolhida. A API validará possíveis conflitos no envio.'};
 return {kind:'not_in_selected_discount',
  warning:'A SKU não consta na promoção escolhida. Nenhuma outra promoção de desconto foi confirmada por esta consulta.'};
}
export function discountPlanSnapshot({shopId,sku,itemId,modelId,discountId,quote,record,existing,originalPrice}){
 if(!integer(shopId)||!integer(itemId)||!integer(modelId)||!integer(discountId)||!sku)
  throw Error('Identificação de loja, SKU ou promoção inválida.');
 const values=promotionFromQuote(quote);
 if(String(quote.sku)!==String(sku)||String(quote.itemId)!==String(itemId)||
    String(quote.modelId)!==String(modelId))
  throw Error('O plano salvo não corresponde ao anúncio escolhido.');
 if(!['ongoing','upcoming'].includes(String(record.status||'').toLowerCase()))
  throw Error('A promoção não está em andamento nem programada. Escolha uma promoção válida.');
 const now=Math.floor(Date.now()/1000);
 if(Number(record.end_time)<=now)throw Error('A promoção terminou.');
 // Somente incluir ou atualizar UMA SKU, nunca alterar as demais da campanha.
 const existingPrice=existing?Number(existing.item_promotion_price):null;
 const act=!existing?'add':validMoney(existingPrice)&&Math.abs(brl(existingPrice)-values.promo)<0.011&&Math.abs(originalPrice-values.gross)<0.011?'already':'update';
 return {...values,shopId:String(shopId),sku:String(sku),itemId:String(itemId),
   modelId:String(modelId),discountId:String(discountId),promotionName:String(record.discount_name||''),
   status:String(record.status),promotionEnd:Number(record.end_time),originalPrice,
   action:act,existingPrice:validMoney(existingPrice)?brl(existingPrice):null,
   needsBasePriceUpdate:Math.abs(originalPrice-values.gross)>.011,
   quoteAt:String(quote.calculatedAt||'')};
}
const seal=(raw,secret)=>crypto.createHmac('sha256',secret).update(raw).digest('base64url');
export function signDiscountPreview(data,secret){
 if(!secret||secret.length<8)throw Error('Sessão segura indisponível.');
 const payload={...data,expiresAt:Date.now()+10*60*1000,nonce:crypto.randomBytes(16).toString('hex')};
 const part=Buffer.from(JSON.stringify(payload)).toString('base64url');
 return part+'.'+seal(part,secret);
}
export function verifyDiscountPreview(token,secret,shopId){
 if(!secret||!token||token.length>5000)throw Error('Prévia não autorizada.');
 const [part,sig,...extra]=String(token).split('.');
 if(!part||!sig||extra.length)throw Error('Prévia de execução inválida.');
 const expected=Buffer.from(seal(part,secret)),got=Buffer.from(sig);
 if(expected.length!==got.length||!crypto.timingSafeEqual(expected,got))
  throw Error('Prévia foi alterada. Prepare novamente.');
 let data;
 try{data=JSON.parse(Buffer.from(part,'base64url').toString('utf8'));}catch{throw Error('Prévia ilegível. Prepare novamente.');}
 if(data.shopId!==String(shopId)||Date.now()>data.expiresAt||
    data.expiresAt>Date.now()+10*60*1000)throw Error('Prévia expirada ou pertencente a outra loja.');
 return data;
}
export async function readDiscountPages(call,{cfg,auth,discountId,maxPages=30}){
 if(!integer(discountId))throw Error('ID da promoção inválido.');
 const pages=[];let details=null;
 for(let page=1;page<=maxPages;page++){
  const d=await call(cfg,{path:'/api/v2/discount/get_discount',
   accessToken:auth.accessToken,shopId:auth.shopId,
   query:{discount_id:discountId,page_no:page,page_size:50}});
  const current=d.response;
  if(!current||String(current.discount_id)!==String(discountId))
   throw Error('A Shopee não confirmou a identificação dessa promoção na loja.');
  if(!details)details=current;
  else if(String(current.discount_id)!==String(details.discount_id)||
   String(current.status)!==String(details.status))
   throw Error('Os dados da promoção mudaram durante a consulta. Tente novamente.');
  pages.push(current);
  if(current.more===false)return {record:details,pages,complete:true};
  if(!Array.isArray(current.item_list)||!current.item_list.length)
   throw Error('A consulta paginada da promoção retornou dados incompletos.');
 }
 throw Error('Não foi possível conferir todos os produtos da promoção. Nada foi alterado.');
}
