// Descontos para Kit Formal APÓS a Shopee confirmar o kit como NORMAL.
// Usa Minha Promoção, pesquisa comparável e regra de centavos existentes.
import {callShopeeShopApi} from './shopee.js';
import {loadKitDraft} from './shopeeKitDraftStore.js';
import {composeKit} from './shopeeKitBuilder.js';
import {lookupShopeeCompetitors} from './shopeeMarketResearch.js';
import {REDE_ACHADOS_MARKET_RULES} from './shopeeMatrixRules.js';
import {signDiscountPreview,verifyDiscountPreview,
 readDiscountPages,promotionMember} from './shopeeDiscountPublish.js';
const locks=new Set(),validId=n=>/^[1-9]\d{0,17}$/.test(String(n))&&Number.isSafeInteger(Number(n));
const goodEnd=x=>[0,9].includes(Math.round(Number(x)*100)%10);
const money=x=>Math.round(Number(x)*100)/100;
async function context(cfg,auth,kitSku,discountId){
 if(!validId(discountId))throw Error('Informe o ID da Minha Promoção criada na Shopee.');
 const saved=await loadKitDraft(auth.shopId,kitSku);
 if(!saved||saved.publication?.status!=='published'||!validId(saved.publication?.itemId))
  throw Error('O Kit Formal precisa estar confirmado como NORMAL antes do desconto.');
 const itemId=Number(saved.publication.itemId);
 const kit=await composeKit(auth.shopId,saved.skus,{
  marginPct:Number(saved.kit?.quote?.targetMarginPct),
  packing:Number(saved.kit?.packing||0),shipping:Number(saved.kit?.shipping||0)
 });
 if(kit.kitSku!==kitSku||
    Math.abs(kit.componentCost-Number(saved.kit?.componentCost))>.011||
    Math.abs(kit.quote.grossPrice-Number(saved.kit?.quote?.grossPrice))>.011)
  throw Error('Custo ou preço mudou após publicação. Revise o Kit Formal antes de oferecer desconto.');
 const quote=kit.quote;
 const gross=money(quote.grossPrice),promo=money(quote.marketplacePrice),
  afterCoupon=money(quote.afterCoupon);
 if(!(gross>promo&&promo>0&&afterCoupon>0&&goodEnd(promo)&&goodEnd(afterCoupon))||
   quote.netMarginPct+0.001<quote.targetMarginPct||
   quote.priceEndingRuleVersion!==4)
  throw Error('Preço do kit não respeita margem e regra 0/9 na Shopee e após cupom.');
 const [liveResult,discount]=await Promise.all([
  callShopeeShopApi(cfg,{path:'/api/v2/product/get_item_base_info',
   accessToken:auth.accessToken,shopId:auth.shopId,query:{item_id_list:[itemId]}}),
  readDiscountPages(callShopeeShopApi,{cfg,auth,discountId})
 ]);
 const live=(liveResult.response?.item_list||[]).find(x=>Number(x.item_id)===itemId);
 if(!live||String(live.item_status).toUpperCase()!=='NORMAL')
  throw Error('Kit não está publicado como NORMAL na Shopee.');
 const record=discount.record;
 if(!['upcoming','ongoing'].includes(String(record?.status||'').toLowerCase())||
    Number(record?.end_time)<=Math.floor(Date.now()/1000))
  throw Error('Minha Promoção não está ativa ou agendada.');
 const existing=promotionMember(discount.pages,itemId);
 let modelId=0,original;
 if(live.has_model===true){
  const models=await callShopeeShopApi(cfg,{path:'/api/v2/product/get_model_list',
   accessToken:auth.accessToken,shopId:auth.shopId,query:{item_id:itemId}});
  const list=models.response?.model||[];
  if(list.length!==1||list[0].model_sku!==kitSku)
   throw Error('Kit Formal possui modelos diferentes da variação única aprovada.');
  modelId=Number(list[0].model_id);
  if(!validId(modelId))throw Error('Model ID do kit não foi confirmado.');
  original=Number(list[0].price_info?.[0]?.original_price??list[0].original_price);
 }else original=Number(live.price_info?.[0]?.original_price??live.original_price);
 if(!Number.isFinite(original)||Math.abs(original-gross)>.011)
  throw Error('Preço bruto da Shopee diverge da calculadora. Ajuste o anúncio antes de aplicar desconto.');
 return {kit,saved,itemId,modelId,gross,promo,afterCoupon,record,existing};
}
export async function previewKitDiscount({cfg,auth,kitSku,discountId,secret}){
 const x=await context(cfg,auth,kitSku,discountId);
 const market=await lookupShopeeCompetitors({
  title:x.saved.creative.title,ownShopId:auth.shopId,ownItemId:x.itemId
 });
 const min=REDE_ACHADOS_MARKET_RULES.minimumOffers;
 if(market.verified!==true||market.source!=='shopee_affiliate_product_offers'||
    market.count<min||!Number.isFinite(Date.parse(market.researchedAt))||
    Date.now()-Date.parse(market.researchedAt)>48*3600000)
  throw Error('Pesquisa de concorrentes não validou '+min+
   ' ofertas equivalentes para este kit. Desconto bloqueado, sem alterar o Kit Formal.');
 const action=x.existing?'update':'add';
 const token=signDiscountPreview({shopId:String(auth.shopId),kitSku,
  itemId:String(x.itemId),modelId:String(x.modelId),discountId:String(discountId),
  gross:x.gross,promo:x.promo,afterCoupon:x.afterCoupon,action,
  marketAt:market.researchedAt,marketCount:market.count},secret);
 return {token,kitSku,itemId:String(x.itemId),modelId:String(x.modelId),
  discountId:String(discountId),action,discountName:String(x.record.discount_name||''),
  gross:x.gross,promo:x.promo,afterCoupon:x.afterCoupon,
  margin:x.kit.quote.netMarginPct,marketOffers:market.count,
  message:'Somente prévia. A criação do kit já está confirmada; a campanha ainda NÃO foi alterada.'};
}
export async function executeKitDiscount({cfg,auth,kitSku,discountId,token,secret}){
 const k=auth.shopId+':'+kitSku;
 if(locks.has(k))throw Error('Outra aplicação de desconto está em andamento.');
 locks.add(k);
 try{
  const approved=verifyDiscountPreview(token,secret,auth.shopId);
  if(approved.kitSku!==kitSku||String(approved.discountId)!==String(discountId))
   throw Error('Aprovação pertence a outra campanha ou kit.');
  const x=await context(cfg,auth,kitSku,discountId);
  if(String(x.itemId)!==String(approved.itemId)||
     String(x.modelId)!==String(approved.modelId)||
     Math.abs(x.gross-approved.gross)>.011||Math.abs(x.promo-approved.promo)>.011||
     Math.abs(x.afterCoupon-approved.afterCoupon)>.011||
     (x.existing?'update':'add')!==approved.action)
   throw Error('A Shopee ou o preço mudou. Refaça a prévia da promoção.');
  if(!Number.isFinite(Date.parse(approved.marketAt))||
     Date.now()-Date.parse(approved.marketAt)>48*3600000||
     approved.marketCount<REDE_ACHADOS_MARKET_RULES.minimumOffers)
   throw Error('Pesquisa de concorrentes expirou. Refaça a prévia.');
  const item={item_id:x.itemId,purchase_limit:0};
  if(x.modelId)item.model_list=[{model_id:x.modelId,model_promotion_price:x.promo}];
  else item.item_promotion_price=x.promo;
  const action=approved.action==='add'?'add_discount_item':'update_discount_item';
  const result=await callShopeeShopApi(cfg,{
   path:'/api/v2/discount/'+action,method:'POST',
   accessToken:auth.accessToken,shopId:auth.shopId,
   body:{discount_id:Number(discountId),item_list:[item]}
  });
  if(Number(result.response?.count)!==1||(result.response?.error_list||[]).length)
   throw Error('A Shopee não confirmou aplicação do desconto. Consulte a campanha antes de tentar novamente.');
  const check=await readDiscountPages(callShopeeShopApi,{cfg,auth,discountId});
  const published=promotionMember(check.pages,x.itemId);
  const actual=x.modelId?Number(published?.model_list?.find(m=>Number(m.model_id)===x.modelId)?.model_promotion_price):
   Number(published?.item_promotion_price);
  if(!Number.isFinite(actual)||Math.abs(actual-x.promo)>.011)
   return {ok:false,status:'pending_readback',kitSku,itemId:String(x.itemId),
    message:'A Shopee aceitou a atualização, mas a leitura da campanha ainda não confirmou o preço. Consulte a Minha Promoção antes de repetir.'};
  return {ok:true,status:'discount_confirmed',itemId:String(x.itemId),
   kitSku,discountId:String(discountId),promo:x.promo,afterCoupon:x.afterCoupon,
   message:'Desconto confirmado na Minha Promoção. Não altera os preços de outros anúncios.'};
 }finally{locks.delete(k);}
}
