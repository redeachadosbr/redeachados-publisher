// Descontos para Kit Formal APÓS a Shopee confirmar o kit como NORMAL.
// Usa Minha Promoção, pesquisa comparável e regra de centavos existentes.
import {callShopeeShopApi} from './shopee.js';
import {loadKitDraft} from './shopeeKitDraftStore.js';
import {kitOptimizationLinkIsCurrent} from './shopeeKitOptimization.js';
import {readShopeeExecution} from './shopeeExecutionStore.js';
import {composeKit} from './shopeeKitBuilder.js';
import {lookupShopeeCompetitors} from './shopeeMarketResearch.js';
import {REDE_ACHADOS_MARKET_RULES} from './shopeeMatrixRules.js';
import {signDiscountPreview,verifyDiscountPreview,
 readDiscountPages,promotionMember} from './shopeeDiscountPublish.js';
const locks=new Set(),validId=n=>/^[1-9]\d{0,17}$/.test(String(n))&&Number.isSafeInteger(Number(n));
const goodEnd=x=>[0,9].includes(Math.round(Number(x)*100)%10);
const money=x=>Math.round(Number(x)*100)/100;
async function context(cfg,auth,kitSku,discountId,{requireExecution=true}={}){
 if(!validId(discountId))throw Error('Informe o ID da Minha Promoção criada na Shopee.');
 const saved=await loadKitDraft(auth.shopId,kitSku);
 const existingListing=Boolean(saved?.optimization?.itemId);
 let executionVerified=!existingListing;
 if(existingListing){
  const link=saved.optimization;
  if(!kitOptimizationLinkIsCurrent(saved,link)||!validId(link.itemId))
   throw Error('Vínculo do kit com anúncio existente desatualizado.');
  const job=await readShopeeExecution(auth.shopId,link.itemId,link.modelId);
  executionVerified=Boolean(job?.state==='verified'&&job?.sku===link.sku&&
    Number.isFinite(Date.parse(link.preparedAt))&&
    Date.parse(job.updated_at)>=Date.parse(link.preparedAt));
  if(requireExecution&&!executionVerified)
   throw Error('A aplicação da Minha Promoção exige otimização do kit confirmada na Shopee. Prepare a prévia sem enviar e execute o anúncio primeiro.');
 }else if(!saved||saved.publication?.status!=='published'||!validId(saved.publication?.itemId))
  throw Error('O Kit Formal precisa estar publicado como NORMAL antes do desconto.');
 const itemId=Number(existingListing?saved.optimization.itemId:saved.publication.itemId);
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
 const liveStatus=String(live?.item_status||'').toUpperCase();
 if(!live||!['NORMAL',...(!requireExecution?['UNLIST']:[])].includes(liveStatus))
  throw Error(requireExecution?'Kit não está publicado como NORMAL na Shopee.':
   'O anúncio da SKU principal não está disponível para planejar a promoção na Shopee.');
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
  const selected=existingListing?
    list.find(m=>String(m.model_id)===String(saved.optimization.modelId)&&
      String(m.model_sku)===String(saved.optimization.sku)):
    (list.length===1&&list[0].model_sku===kitSku?list[0]:null);
   if(!selected)throw Error('Variação vinculada do kit não corresponde ao anúncio da Shopee.');
   modelId=Number(selected.model_id);
   if(!validId(modelId))throw Error('Model ID do kit não confirmado.');
   original=Number(selected.price_info?.[0]?.original_price??selected.original_price);
  }else{
   if(existingListing&&String(saved.optimization.modelId)!=='0')
    throw Error('A variação vinculada não corresponde ao anúncio sem modelos.');
   original=Number(live.price_info?.[0]?.original_price??live.original_price);
  }
  const priceAligned=Number.isFinite(original)&&Math.abs(original-gross)<=.011;
  if(requireExecution&&!priceAligned)
   throw Error('Preço bruto da Shopee diverge da calculadora. Ajuste o anúncio antes de aplicar desconto.');
 return {kit,saved,itemId,modelId,gross,promo,afterCoupon,record,existing,
  executionVerified,priceAligned,liveStatus,
  currentGross:Number.isFinite(original)?money(original):null};
}
export async function previewKitDiscount({cfg,auth,kitSku,discountId,secret}){
 const x=await context(cfg,auth,kitSku,discountId,{requireExecution:false});
 // A etapa 08 pode ser planejada antes da atualização do anúncio: ainda não
 // há token de autorização e nenhuma rota de escrita é chamada nesse modo.
 const ready=x.executionVerified&&x.priceAligned&&x.liveStatus==='NORMAL';
 if(!ready)return {status:'planning',approvalReady:false,token:null,
  kitSku,itemId:String(x.itemId),modelId:String(x.modelId),
  discountId:String(discountId),discountName:String(x.record.discount_name||''),
  action:x.existing?'update':'add',
  gross:x.gross,promo:x.promo,afterCoupon:x.afterCoupon,margin:x.kit.quote.netMarginPct,
  currentGross:x.currentGross,priceAligned:x.priceAligned,executionVerified:x.executionVerified,
  liveStatus:x.liveStatus,marketOffers:null,marketplaceUpdated:false,
  message:!x.priceAligned?
   'O preço bruto Shopee difere do calculado. Escolha Somente preço bruto + desconto para autorizar apenas a correção comercial. Nenhum envio realizado.':
   'Prévia conferida. Autorize a execução da etapa 08 após revisar os valores. Nenhum envio realizado.'};
 const market=await lookupShopeeCompetitors({
  title:x.saved.creative.title,ownShopId:auth.shopId,ownItemId:x.itemId
 });
 const min=REDE_ACHADOS_MARKET_RULES.minimumOffers;
 if(market.verified!==true||market.source!=='shopee_affiliate_product_offers'||
    market.count<min||!Number.isFinite(Date.parse(market.researchedAt))||
    Date.now()-Date.parse(market.researchedAt)>48*3600000)
  throw Error('Pesquisa de concorrentes não validou '+min+
   ' ofertas equivalentes para este kit. Desconto bloqueado, sem alterar o Kit Formal.');
 // A consulta externa é assíncrona: revalidar a execução e o preço
 // novamente antes de emitir um token que permite escrever na Shopee.
 const verified=await context(cfg,auth,kitSku,discountId);
 if(String(verified.itemId)!==String(x.itemId)||
    String(verified.modelId)!==String(x.modelId)||
    Math.abs(verified.gross-x.gross)>.011||
    Math.abs(verified.promo-x.promo)>.011)
  throw Error('O kit ou o preço mudou durante a pesquisa. Refazer a prévia.');
 const action=x.existing?'update':'add';
 const token=signDiscountPreview({shopId:String(auth.shopId),kitSku,
  itemId:String(x.itemId),modelId:String(x.modelId),discountId:String(discountId),
  gross:x.gross,promo:x.promo,afterCoupon:x.afterCoupon,action,
  marketAt:market.researchedAt,marketCount:market.count},secret);
 return {status:'ready',approvalReady:true,token,kitSku,itemId:String(x.itemId),modelId:String(x.modelId),
  executionVerified:true,priceAligned:true,liveStatus:x.liveStatus,currentGross:x.currentGross,
  discountId:String(discountId),action,discountName:String(x.record.discount_name||''),
  gross:x.gross,promo:x.promo,afterCoupon:x.afterCoupon,
  margin:x.kit.quote.netMarginPct,marketOffers:market.count,
  message:'Somente prévia. O anúncio do kit está confirmado; a campanha ainda NÃO foi alterada.'};
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


// Leitura oficial do desconto da SKU principal do kit, sem alterar a Shopee.
export async function inspectKitDiscountForExecution({cfg,auth,kitSku,discountId}){
 const x=await context(cfg,auth,kitSku,discountId,{requireExecution:false});
 const member=x.existing;
 const actual=x.modelId?Number(member?.model_list?.find(m=>Number(m.model_id)===x.modelId)?.model_promotion_price):
  Number(member?.item_promotion_price);
 return {kitSku,itemId:String(x.itemId),modelId:String(x.modelId),discountId:String(discountId),
  gross:x.gross,promo:x.promo,afterCoupon:x.afterCoupon,currentGross:x.currentGross,
  priceAligned:x.priceAligned,liveStatus:x.liveStatus,
  confirmed:x.priceAligned&&Number.isFinite(actual)&&Math.abs(actual-x.promo)<=.011,
  action:member?'update':'add'};
}
// Os custos, as regras 0/9 e a pesquisa da Shopee são revalidados antes da escrita.
export async function validateKitDiscountMarketForExecution({cfg,auth,kitSku,discountId}){
 const before=await context(cfg,auth,kitSku,discountId,{requireExecution:false});
 const market=await lookupShopeeCompetitors({
  title:before.saved.creative.title,ownShopId:auth.shopId,ownItemId:before.itemId
 });
 const minimum=REDE_ACHADOS_MARKET_RULES.minimumOffers;
 if(market.verified!==true||market.source!=='shopee_affiliate_product_offers'||
   market.count<minimum||!Number.isFinite(Date.parse(market.researchedAt))||
   Date.now()-Date.parse(market.researchedAt)>48*3600000)
  throw Error('Etapa 08: pesquisa Shopee não confirmou '+minimum+
   ' ofertas equivalentes. Nenhum desconto foi enviado.');
 const after=await context(cfg,auth,kitSku,discountId,{requireExecution:false});
 if(before.itemId!==after.itemId||before.modelId!==after.modelId||
  Math.abs(before.gross-after.gross)>.011||Math.abs(before.promo-after.promo)>.011||
  Math.abs(before.afterCoupon-after.afterCoupon)>.011)
  throw Error('Valores do kit mudaram durante a pesquisa; desconto não enviado.');
 return {researchedAt:market.researchedAt,offers:market.count};
}
