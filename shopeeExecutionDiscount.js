// Última etapa durável, somente após conferência comercial e fiscal.
// O checkpoint é persistido ANTES de qualquer escrita. Nunca reenviar automaticamente
// uma alteração de preço/promoção com resultado incerto.
import {withExecutionEvent} from './shopeeExecutionProgress.js';
const staticKeys=['shopId','sku','itemId','modelId','discountId','gross','promo',
 'buyerAfterCoupon','couponPct','discountPct','quoteAt'];
const cents=n=>Math.round(Number(n)*100);
export function discountSnapshotCompatible(approved,live){
 if(!approved||!live)return false;
 return staticKeys.every(k=>String(approved[k]??'')===String(live[k]??''));
}
export function discountAlreadyConfirmed(approved,live){
 return discountSnapshotCompatible(approved,live)&&live.action==='already'&&
   cents(live.originalPrice)===cents(approved.gross);
}
const event=(result,phase,key,message,kind='info')=>withExecutionEvent(
 {...result,phase},key,message,kind);
const uncertain=(result,key,message)=>({state:'uncertain',
 result:event(result,result.phase,key,message,'warning'),lastError:message});
const completed=result=>({state:'verified',result:withExecutionEvent(
 {...result,phase:'verified',verified:true,discount:{status:'verified'}},
 'discount-verified','O desconto também foi confirmado na Shopee.','success'),lastError:null});
export async function advanceVerifiedDiscount(job,io){
 const approved=job.plan?.commercialDiscount?.snapshot;
 const consent=job.plan?.commercialDiscount?.allowPriceChange===true;
 const result={...(job.result||{})},phase=String(result.phase||'');
 if(!approved)throw Error('Aprovação de desconto ausente da execução.');
 if(!['discount_ready','discount_price_updating','discount_price_verifying',
  'discount_updating','discount_verifying'].includes(phase))
  throw Error('Estado da promoção inválido.');
 // O histórico de conferência e envio será gravado no MESMO job da SKU.
 const live=await io.discountRead(approved);
 if(!discountSnapshotCompatible(approved,live))
  return uncertain(result,'discount-changed','Preço, custo, pesquisa ou campanha mudaram após a conferência. Não publicar desconto sem nova autorização.');
 if(discountAlreadyConfirmed(approved,live))return completed(result);
 if(['discount_price_updating','discount_price_verifying'].includes(phase)){
  if(cents(live.originalPrice)===cents(approved.gross))
   return {state:'running',result:event(result,'discount_ready','discount-price-verified',
    'Preço bruto confirmado na Shopee; preparando promoção.'),delay:1000};
  if(Date.now()-Number(result.discountPriceStartedAt||0)>90000)
   return uncertain(result,'discount-price-timeout','O novo preço bruto ainda não foi confirmado. Não repetir a atualização automaticamente.');
  return {state:'running',result:{...result,phase:'discount_price_verifying'},delay:5000};
 }
 if(['discount_updating','discount_verifying'].includes(phase)){
  if(Date.now()-Number(result.discountStartedAt||0)>90000)
   return uncertain(result,'discount-timeout','A Shopee ainda não confirmou a promoção. Não repetir o envio automaticamente.');
  return {state:'running',result:{...result,phase:'discount_verifying'},delay:5000};
 }
 if(cents(live.originalPrice)!==cents(approved.gross)){
  // O preço atual só pode ser o preço observado na prévia inicial ou o preço aprovado.
  if(!consent||cents(live.originalPrice)!==cents(approved.originalPrice))
   return uncertain(result,'discount-price-changed','Preço bruto diferente da prévia; nenhuma alteração foi enviada.');
  const checkpoint=event({...result,discountPriceStartedAt:Date.now()},'discount_price_updating',
    'discount-price-request','Atualizando preço bruto autorizado antes da promoção.');
  await io.beforeWrite(checkpoint);
  try{
   await io.discountUpdatePrice(approved);
   return {state:'running',result:event(checkpoint,'discount_price_verifying',
     'discount-price-accepted','Shopee recebeu o preço; conferindo atualização.'),delay:1500};
  }catch(e){return uncertain(checkpoint,'discount-price-unknown',
     'Preço bruto sem confirmação conclusiva: '+String(e.message||e).slice(0,130));}
 }
 if(!['add','update'].includes(live.action))
  return uncertain(result,'discount-action-unknown','A campanha retornou um estado não confirmado; desconto não reenviado.');
 const checkpoint=event({...result,discountStartedAt:Date.now()},'discount_updating',
   'discount-request','Adicionando ou atualizando a SKU na campanha aprovada.');
 await io.beforeWrite(checkpoint);
 try{
  await io.discountPublish(approved,live);
  return {state:'running',result:event(checkpoint,'discount_verifying',
   'discount-accepted','Operação de desconto recebida; aguardando confirmação da Shopee.'),delay:1500};
 }catch(e){return uncertain(checkpoint,'discount-unknown',
  'Resultado da promoção incerto: '+String(e.message||e).slice(0,150));}
}
