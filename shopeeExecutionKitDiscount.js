import {withExecutionEvent} from './shopeeExecutionProgress.js';
const cents=value=>Math.round(Number(value)*100);
const event=(r,key,label,kind='info')=>withExecutionEvent(r,key,label,kind);
const uncertain=(r,key,msg)=>({state:'uncertain',result:event(r,key,msg,'warning'),lastError:msg});
const failed=(r,key,msg)=>({state:'failed',result:event(r,key,msg,'warning'),lastError:msg});
const done=r=>({state:'verified',result:event({...r,phase:'verified',verified:true,
 discount:{status:'verified'}},'kit-discount-verified',
 'Etapa 08/08: preço e Minha Promoção confirmados pela Shopee.','success'),lastError:null});
export async function advanceShopeeKitDiscount(job,io){
 const plan=job.plan||{},approved=plan.kitDiscount,r={...(job.result||{})};
 if(!approved||plan.selectedStage!=='all')throw Error('Desconto do kit sem plano completo aprovado.');
 const phase=String(r.phase||'');
 const fresh=await io.kitDiscountRead(approved);
 if(['kitSku','itemId','modelId','discountId'].some(k=>String(fresh[k])!==String(approved[k]))||
  ['gross','promo','afterCoupon'].some(k=>cents(fresh[k])!==cents(approved[k])))
  return uncertain(r,'kit-discount-diverged',
   'Campanha, custo ou valores do kit mudaram. Desconto não será reenviado.');
 if(fresh.liveStatus!=='NORMAL')return uncertain(r,'kit-not-normal',
  'Anúncio ainda não NORMAL na Shopee. Desconto não enviado.');
 if(fresh.confirmed)return done(r);
 if(['kit_discount_updating','kit_discount_verifying'].includes(phase)){
  if(Date.now()-Number(r.kitDiscountStartedAt||0)>90000)
   return uncertain(r,'kit-discount-readback',
    'Desconto enviado, mas não confirmado. Não repetir automaticamente.');
  return {state:'running',result:{...r,phase:'kit_discount_verifying'},delay:5000};
 }
 if(['kit_discount_price_updating','kit_discount_price_verifying'].includes(phase)){
  if(fresh.priceAligned)return {state:'running',result:event({...r,phase:'kit_discount_ready'},
   'kit-price-verified','Preço bruto do kit confirmado na Shopee.','success'),delay:500};
  if(Date.now()-Number(r.kitPriceStartedAt||0)>90000)
   return uncertain(r,'kit-price-readback','Preço bruto não confirmado; não repetir atualização.');
  return {state:'running',result:{...r,phase:'kit_discount_price_verifying'},delay:5000};
 }
 if(phase!=='kit_discount_ready')throw Error('Fase do desconto do kit desconhecida.');
 if(!Number(r.kitMarketCheckedAt)||Date.now()-Number(r.kitMarketCheckedAt)>15*60000){
  try{await io.kitDiscountMarket(approved);}
  catch(e){return failed(r,'kit-discount-market',String(e.message||e).slice(0,250));}
  return {state:'running',result:event({...r,kitMarketCheckedAt:Date.now()},
   'kit-market-reviewed','Pesquisa de mercado confirmada para desconto do kit.','success'),delay:500};
 }
 await io.validateIdentity();
 if(!fresh.priceAligned){
  const checkpoint=event({...r,phase:'kit_discount_price_updating',kitPriceStartedAt:Date.now()},
   'kit-price-write','Atualizando preço bruto do kit conforme prévia autorizada.');
  await io.beforeWrite(checkpoint);
  try{
   await io.kitDiscountPrice(approved);
   return {state:'running',result:event({...checkpoint,phase:'kit_discount_price_verifying'},
    'kit-price-accepted','Preço enviado; aguardando leitura da Shopee.'),delay:3000};
  }catch(e){return uncertain(checkpoint,'kit-price-uncertain',
   'Preço sem confirmação: '+String(e.message||e).slice(0,180));}
 }
 if(!['add','update'].includes(fresh.action))
  return failed(r,'kit-campaign-invalid','Campanha não permite atualização segura.');
 const checkpoint=event({...r,phase:'kit_discount_updating',kitDiscountStartedAt:Date.now()},
  'kit-discount-write','Aplicando Minha Promoção do kit na etapa 08.');
 await io.beforeWrite(checkpoint);
 try{
  await io.kitDiscountPublish(approved,fresh.action);
  return {state:'running',result:event({...checkpoint,phase:'kit_discount_verifying'},
   'kit-discount-accepted','Desconto enviado; conferindo campanha na Shopee.'),delay:4000};
 }catch(e){return uncertain(checkpoint,'kit-discount-uncertain',
  'Promoção sem confirmação: '+String(e.message||e).slice(0,180));}
}
