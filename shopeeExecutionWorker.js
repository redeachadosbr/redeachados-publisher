import {assertLiveShopeeUnchanged,verifyShopeeExecution,verifyShopeeFiscalExecution} from './shopeeExecutionPlan.js';
import {sameData} from './shopeeStructuredFields.js';
import {advanceVideoUpload} from './shopeeMediaApi.js';
import {withExecutionEvent} from './shopeeExecutionProgress.js';
import {isDefinitiveShopeeRejection} from './shopeeExecutionIssues.js';
import {advanceVerifiedDiscount} from './shopeeExecutionDiscount.js';
import {buildVariationPayload} from './shopeeVariationMedia.js';
// One durable step per lease. No tokens or secret configuration are persisted.
export async function advanceShopeeExecution(job,io){
 const plan=job.plan,result={...(job.result||{})};
 if(!plan?.requiresExplicitConfirmation||!plan.canExecute)throw Error('Plano sem aprovação válida.');
 if(/^variation_|^model_discount_/.test(String(result.phase||'')))
  return advanceShopeeModelStages(job,io);
 if(['discount_ready','discount_price_updating','discount_price_verifying',
  'discount_updating','discount_verifying'].includes(String(result.phase||'')))
  return advanceVerifiedDiscount(job,io);
 // A segunda escrita fiscal tem checkpoint separado: depois de qualquer queda
 // retomamos SOMENTE a leitura, evitando duplicidade de update_item.
 if(['fiscal_updating','fiscal_verifying'].includes(result.phase)){
  const live=await io.read();
  if(verifyShopeeFiscalExecution(plan,live,result))
   return plan.commercialDiscount?
    {state:'running',result:withExecutionEvent({...result,phase:plan.modelVariations?'model_discount_ready':'discount_ready',primaryVerified:true,fiscal:{status:'verified'}},
     'fiscal-verified','Dados fiscais confirmados. Iniciando desconto como última etapa.','success'),delay:500}:
    {state:'verified',result:withExecutionEvent({...result,phase:'verified',verified:true,
     fiscal:{status:'verified'}},'fiscal-verified','Todas as etapas, inclusive os dados fiscais, foram confirmadas pela Shopee.','success'),lastError:null};
  if(Date.now()-Number(result.fiscalStartedAt||0)>90000)
   return {state:'uncertain',result:withExecutionEvent(result,'fiscal-timeout',
    'Conteúdo enviado; ainda não há confirmação dos dados fiscais pela Shopee.','warning'),
    lastError:'A Shopee ainda não confirmou o envio fiscal final. Não repetir o envio sem reconciliação.'};
  return {state:'running',result:{...result,phase:'fiscal_verifying'},delay:5000};
 }
 if(['updating','verifying'].includes(result.phase)){
  const live=await io.read();
  if(verifyShopeeExecution(plan,live,result)){
   if(plan.modelVariations)
    return {state:'running',result:withExecutionEvent({...result,phase:'variation_ready',
     primaryVerified:true},'commercial-verified','Conteúdo comercial conferido. Criando as variações reais antes de fiscal e desconto.','success'),delay:500};
   if(plan.finalFiscal)
    return {state:'running',result:withExecutionEvent({...result,phase:'fiscal_ready',
     primaryVerified:true},'commerce-verified',
     'Imagens, vídeo e conteúdo confirmados. Iniciando a última etapa fiscal.','success'),delay:500};
   return plan.commercialDiscount?
    {state:'running',result:withExecutionEvent({...result,phase:'discount_ready',primaryVerified:true},
      'commerce-verified','Anúncio confirmado. Dados fiscais sem alterações; iniciando desconto.','success'),delay:500}:
    {state:'verified',result:withExecutionEvent({...result,phase:'verified',verified:true},
     'verified','A Shopee confirmou as alterações no anúncio.','success'),lastError:null};
  }
  if(Date.now()-Number(result.updateStartedAt||0)>90000)
    return {state:'uncertain',result:withExecutionEvent(result,'verify-timeout','A conferência da Shopee excedeu o tempo esperado.','warning'),lastError:'A Shopee ainda não confirmou todos os campos. Use Conferir resultado.'};
  return {state:'running',result:{...result,phase:'verifying'},delay:5000};
 }
 if(result.phase==='fiscal_ready'){
  if(!plan.modelVariations)await io.validateIdentity();
  const live=await io.read();
  if(!verifyShopeeExecution(plan,live,result))
   return {state:'uncertain',result:withExecutionEvent(result,'commerce-changed',
    'A parte comercial mudou antes do envio fiscal. Não foi enviado outro dado.','warning'),
    lastError:'Conteúdo alterado entre as duas etapas. Verifique o anúncio antes de continuar.'};
  if(!sameData(live.tax_info||{},plan.original.tax_info||{})){
   if(verifyShopeeFiscalExecution(plan,live,result))
    return plan.commercialDiscount?
      {state:'running',result:withExecutionEvent({...result,phase:plan.modelVariations?'model_discount_ready':'discount_ready',primaryVerified:true,
        fiscal:{status:'verified'}},'fiscal-confirmed','Fiscal já atualizado; seguindo para desconto.','success'),delay:500}:
      {state:'verified',result:withExecutionEvent({...result,phase:'verified',
       verified:true,fiscal:{status:'verified'}},'fiscal-confirmed',
       'Dados fiscais já conferidos na Shopee; não foi necessário reenviar.','success'),lastError:null};
   return {state:'uncertain',result:withExecutionEvent(result,'fiscal-changed',
    'Os campos fiscais mudaram após a prévia. Não foi feito novo envio.','warning'),
    lastError:'Dados fiscais alterados fora do plano. Confira antes de autorizar nova prévia.'};
  }
  const checkpoint=withExecutionEvent({...result,phase:'fiscal_updating',
   fiscalStartedAt:Date.now()},'fiscal-request',
   'Etapa final: enviando SOMENTE os dados fiscais conferidos no Motor Matriz.');
  await io.beforeWrite(checkpoint);
  try{
   const response=await io.update({item_id:Number(plan.itemId),tax_info:plan.finalFiscal});
   return {state:'running',result:withExecutionEvent({...checkpoint,phase:'fiscal_verifying',
    fiscalRequestId:String(response?.request_id||'').slice(0,100)},
    'fiscal-accepted','A Shopee recebeu a atualização fiscal; verificando os campos.'),
    delay:1500};
  }catch(error){
   const reason=String(error.message||error).slice(0,240);
   if(isDefinitiveShopeeRejection(reason))
    return {state:'verified',result:withExecutionEvent({...checkpoint,phase:'verified_partial',
     primaryVerified:true,fiscal:{status:'rejected',reason}},'fiscal-rejected',
     'Parte comercial confirmada; a Shopee recusou o CEST/NCM. Fiscal pendente.','warning'),
     lastError:reason};
   return {state:'uncertain',result:withExecutionEvent(checkpoint,'fiscal-uncertain',
    'A parte comercial foi confirmada, mas o resultado da atualização fiscal está incerto.','warning'),
    lastError:'Atualização fiscal final sem confirmação: '+reason};
  }
 }
 await io.validateIdentity();
 assertLiveShopeeUnchanged(plan,await io.read());
 if(plan.images?.length&&(result.imageIds||[]).length<plan.images.length){
  const index=(result.imageIds||[]).length,asset=plan.images[index];
  const file=await io.downloadImage(asset);
  const id=await io.media.image(file,asset.mime_type);
  const current=[...(result.imageIds||[]),id];
  return {state:'running',result:withExecutionEvent({...result,phase:'images_upload',imageIds:current},
   'image-'+current.length,'Imagem '+current.length+' de '+plan.images.length+' enviada à biblioteca de mídia da Shopee.','success'),delay:500};
 }
 if(plan.video&&result.video?.phase!=='ready'){
  const file=await io.download(plan.video);
  result.video=await advanceVideoUpload({state:result.video,file,api:io.media});
  const status=result.video.phase==='processing'?'video_processing':'video_upload';
  const labeled=status==='video_processing'?'Vídeo enviado; aguardando processamento pela Shopee.':'Enviando vídeo para a Shopee.';
  return {state:'running',result:withExecutionEvent({...result,phase:status},status,labeled),
   delay:status==='video_processing'?10000:500};
 }
 // Variações incluídas seguem após a confirmação do anúncio-pai,
 // sem reexecutar update_item quando o conteúdo já está correto.
 if(plan.modelVariations&&!Object.keys(plan.proposed||{}).length&&!plan.images?.length&&!plan.video)
  return {state:'running',result:withExecutionEvent({...result,phase:'variation_ready',primaryVerified:true},
    'commercial-already','Anúncio comercial já preenchido. Preparando variações automaticamente.','success'),delay:500};
 // Se a última etapa fiscal for a ÚNICA alteração, não escrever item vazio.
 if(plan.finalFiscal&&!plan.modelVariations&&!Object.keys(plan.proposed||{}).length&&!plan.images?.length&&!plan.video)
  return {state:'running',result:withExecutionEvent({...result,phase:'fiscal_ready',
   primaryVerified:true},'fiscal-only-last','Nenhuma alteração comercial pendente; preparando dados fiscais.'),
   delay:500};
 // Se não há novos campos comerciais nem dados fiscais, executar somente
 // o desconto já conferido, sem enviar update_item vazio ou repetir a mídia.
 if(plan.commercialDiscount&&!plan.modelVariations&&!Object.keys(plan.proposed||{}).length&&!plan.images?.length&&!plan.video&&!plan.finalFiscal)
  return {state:'running',result:withExecutionEvent({...result,phase:'discount_ready',primaryVerified:true},
    'commercial-already','Anúncio já atualizado; preparando somente o desconto autorizado.','success'),delay:500};
 // Persist intent before the external write. A crash resumes readback only.
 result.phase='updating';result.updateStartedAt=Date.now();
 const checkpoint=withExecutionEvent(result,'update-request','Enviando alteração aprovada para o anúncio.');
 await io.beforeWrite(checkpoint);
 try{
  const response=await io.update({item_id:Number(plan.itemId),...plan.proposed,
    ...(plan.images?.length?{image:{image_id_list:result.imageIds}}:{}),
    ...(plan.video?{video_upload_id:[result.video.id]}:{})});
  result.requestId=String(response?.request_id||'').slice(0,100);
  result.phase='verifying';
  Object.assign(result,withExecutionEvent({...checkpoint,phase:'verifying',requestId:result.requestId},
   'update-accepted','A API recebeu a solicitação. Conferindo dados do anúncio.'));
 }catch(e){
  // Known business rejection is definitive. Unknown/network error remains uncertain.
  const reason=String(e.message||e).slice(0,240);
  if(isDefinitiveShopeeRejection(reason))
   return {state:'failed',result:withExecutionEvent(checkpoint,'fiscal-rejected',
    'A Shopee rejeitou o envio: falta corrigir o CEST correspondente ao NCM.','warning'),
    lastError:reason};
  return {state:'uncertain',result:withExecutionEvent(checkpoint,'update-uncertain','A atualização não teve confirmação conclusiva.','warning'),lastError:'Atualização sem confirmação: '+reason};
 }
 return {state:'running',result,delay:1000};
}

const money=n=>Math.round(Number(n)*100);
const variationStatus=(r,phase,key,label,kind='info')=>
 withExecutionEvent({...r,phase},key,label,kind);
const modelError=(r,key,label)=>({state:'uncertain',result:variationStatus(r,r.phase,key,label,'warning'),
 lastError:label});
export const approvedShopeeModels=(plan,live)=>{
 const options=plan.modelVariations?.options||[],models=live.models||[];
 if(!live.item?.has_model||models.length!==options.length)return null;
 if(new Set(models.map(m=>String(m.model_id))).size!==models.length||
    new Set(models.map(m=>String(m.model_sku))).size!==models.length)return null;
 const checked=options.map(o=>models.find(m=>String(m.model_sku)===String(o.sku)));
 if(checked.some(m=>!m||!Number.isSafeInteger(Number(m.model_id))||Number(m.model_id)<=0))
  return null;
 if(checked.some((m,i)=>options[i].modelId&&String(m.model_id)!==String(options[i].modelId)))return null;
 return checked;
};
// A confirmação do anúncio-pai nunca substitui a leitura dos modelos.
export function nextShopeePhaseAfterReadback(plan,{fiscalVerified=false}={}){
 if(!fiscalVerified&&plan.modelVariations)return 'variation_ready';
 if(!fiscalVerified&&plan.finalFiscal)return 'fiscal_ready';
 return plan.commercialDiscount?(plan.modelVariations?'model_discount_ready':'discount_ready'):'verified';
}
export async function reconcileShopeeModelExecution(job,io){
 if(job.state!=='uncertain'||!/^variation_|^model_discount_/.test(String(job.result?.phase||'')))
  throw Error('Reconciliação de modelos exige uma etapa de variações com resultado incerto.');
 return advanceShopeeModelStages(job,io,{readOnly:true});
}
const nextAfterModels=(plan,r)=>{
 if(plan.finalFiscal)return {state:'running',result:variationStatus({...r,variation:{...(r.variation||{}),status:'verified'},
    primaryVerified:true},'fiscal_ready','variation-verified',
    'Variações confirmadas pela Shopee. Avançando para dados fiscais.','success'),delay:500};
 if(plan.commercialDiscount)return {state:'running',
  result:variationStatus({...r,variation:{...(r.variation||{}),status:'verified'},
   primaryVerified:true},'model_discount_ready','variation-verified',
   'Modelos confirmados. Aplicando preço e desconto aprovado a cada variação.','success'),delay:500};
 return {state:'verified',result:variationStatus({...r,verified:true,
  variation:{...(r.variation||{}),status:'verified'}},'verified','variation-verified',
  'Variações confirmadas na Shopee.','success'),lastError:null};
};
const modelPrice=m=>Number((m.price_info||[])[0]?.original_price??m.original_price);
const confirmedPromo=(approved,list)=>approved.every(m=>
 list.some(o=>String(o.model_id)===String(m.modelId)&&money(o.model_promotion_price)===money(m.promo)));
async function advanceShopeeModelStages(job,io,{readOnly=false}={}){
 const plan=job.plan,r={...(job.result||{})},phase=String(r.phase||'');
 const specs=plan.modelVariations;
 if(!specs?.options?.length)throw Error('Plano de variações não confirmado.');
 if(phase==='variation_ready'||phase==='variation_media'||
    phase==='variation_updating'||phase==='variation_verifying'){
  const shop=await io.variationRead();
  const found=approvedShopeeModels(plan,shop);
  if(found){
   if(readOnly)return {state:'running',result:variationStatus(r,'variation_verifying',
    'variant-readback','Modelos localizados. Retomando a conferência e o vínculo WeDrop sem recriar variações.'),delay:500};
   // Persistir SKUs WeDrop pelos model IDs oficiais é idempotente e
   // não modifica o marketplace.
   await io.variationLink(plan,found);
   return nextAfterModels(plan,r);
  }
  if(shop.item?.has_model||specs.alreadyCreated)
   return modelError(r,'models-mismatch','A Shopee possui modelos diferentes da prévia. Nenhum modelo foi sobrescrito.');
  if(['variation_updating','variation_verifying'].includes(phase)){
   if(Date.now()-Number(r.variationStartedAt||0)>120000)
    return modelError(r,'variation-timeout','A Shopee ainda não confirmou as variações. A solicitação NÃO será repetida.');
   if(readOnly)return modelError(r,'variation-awaiting','A criação das variações ainda não foi confirmada pela Shopee. Nenhum envio foi repetido.');
   return {state:'running',result:{...r,phase:'variation_verifying'},delay:7000};
  }
  if(readOnly)return {state:'running',result:r,delay:500};
  const ids=r.variationImageIds||[];
  if(ids.length<specs.options.length){
   const option=specs.options[ids.length];
   const imageId=await io.variationImage(option.asset);
   const next=[...ids,imageId];
   return {state:'running',result:variationStatus({...r,variationImageIds:next},
    'variation_media','variant-photo-'+next.length,
    'Foto '+next.length+'/'+specs.options.length+' de variação enviada à biblioteca de mídia Shopee.','success'),delay:500};
  }
  await io.validateIdentity();
  const checkpoint=variationStatus({...r,variationStartedAt:Date.now()},'variation_updating',
   'variant-write','Publicando uma única vez as variações aprovadas.');
  await io.beforeWrite(checkpoint);
  try{
   await io.variationPublish(buildVariationPayload(plan.itemId,specs,ids));
   return {state:'running',result:variationStatus(checkpoint,'variation_verifying',
    'variant-accepted','Shopee recebeu as variações. Conferindo os SKUs dos modelos.'),delay:3000};
  }catch(e){
   return modelError(checkpoint,'variant-unknown','Variações enviadas com resultado incerto: '+
    String(e.message||e).slice(0,160)+'. Não repetir o envio.');
  }
 }
 const approved=plan.commercialDiscount?.snapshot;
 if(!approved)throw Error('Desconto do anúncio não foi autorizado na prévia.');
 const consent=plan.commercialDiscount?.allowPriceChange===true;
 const shop=await io.variationRead(),models=approvedShopeeModels(plan,shop);
 if(!models)return modelError(r,'models-gone','Os modelos mudaram antes da promoção. Nenhuma alteração foi enviada.');
 const rows=specs.options.map((o,i)=>({
  name:o.name,sku:o.sku,modelId:String(models[i].model_id),supplierSku:o.supplierSku,
  base:modelPrice(models[i]),expectedBase:Number(o.price),cost:Number(o.cost),promo:Number(approved.promo)
 }));
 if(rows.some(x=>!Number.isFinite(x.base)||x.base<=0||!Number.isFinite(x.promo)||
    x.promo<=0||x.promo>=Number(approved.gross)||
    x.cost<=0||x.promo<=x.cost))
  return modelError(r,'model-price-invalid','O preço atual de uma variação diverge do custo e da promoção aprovada.');
 for(const row of rows){
  const source=await io.variationCost(row.supplierSku);
  if(!source||money(source.unitCost)!==money(row.cost))
   return modelError(r,'variant-cost-changed','O custo WeDrop mudou para '+row.name+'. A promoção exige nova prévia.');
 }
 if(['model_discount_price_updating','model_discount_price_verifying'].includes(phase)){
  if(rows.every(x=>money(x.base)===money(approved.gross)))
   return {state:'running',result:variationStatus(r,'model_discount_ready',
    'model-price-verified','Preços brutos das variações confirmados.'),delay:500};
  if(Date.now()-Number(r.modelPriceStartedAt||0)>90000)
   return modelError(r,'model-price-uncertain','Preço bruto ainda não confirmado. Não repetir alteração.');
  if(readOnly)return modelError(r,'model-price-awaiting','A Shopee ainda não confirmou o preço bruto de todas as variações. Nenhum preço foi reenviado.');
  return {state:'running',result:{...r,phase:'model_discount_price_verifying'},delay:7000};
 }
 const promo=await io.variationPromotionRead(approved.discountId,plan.itemId);
 if(promo.status!=='ongoing'&&promo.status!=='upcoming')
  return modelError(r,'campaign-inactive','Campanha Minha Promoção não está válida.');
 const promoRows=promo.member?.model_list||[];
 if(confirmedPromo(rows,promoRows)&&rows.every(x=>money(x.base)===money(approved.gross)))
  return {state:'verified',result:variationStatus({...r,verified:true,
   discount:{status:'verified'},variation:{status:'verified'}},'verified',
   'models-discount-verified','Desconto confirmado em todas as variações pela Shopee.','success'),
   lastError:null};
 if(['model_discount_updating','model_discount_verifying'].includes(phase)){
  if(Date.now()-Number(r.modelDiscountStartedAt||0)>90000)
   return modelError(r,'model-discount-uncertain','A Shopee ainda não confirmou o desconto por modelo. Não repetir a promoção.');
  if(readOnly)return modelError(r,'model-discount-awaiting','A Shopee ainda não confirmou preço e desconto em todas as variações. Nenhuma promoção foi reenviada.');
  return {state:'running',result:{...r,phase:'model_discount_verifying'},delay:7000};
 }
 if(rows.some(x=>money(x.base)!==money(approved.gross))){
  if(!consent||rows.some(x=>money(x.base)!==money(x.expectedBase)))
   return modelError(r,'variant-base-changed','Os preços das variações mudaram desde a prévia. Não aplicar promoção.');
  if(readOnly)return {state:'running',result:r,delay:500};
  const checkpoint=variationStatus({...r,modelPriceStartedAt:Date.now()},
   'model_discount_price_updating','model-price-write','Enviando preço bruto autorizado aos modelos.');
  await io.beforeWrite(checkpoint);
  try{
   await io.variationUpdatePrices(rows,approved.gross);
   return {state:'running',result:variationStatus(checkpoint,
    'model_discount_price_verifying','model-price-accepted',
    'Preços enviados; aguardando confirmação por modelo.'),delay:3000};
  }catch(e){return modelError(checkpoint,'model-price-unknown',
   'Preço enviado sem confirmação: '+String(e.message||e).slice(0,160));}
 }
 if(!['add','update'].includes(promo.action))
  return modelError(r,'promotion-state-unknown','A promoção não permite inclusão/atualização segura de modelos.');
 if(readOnly)return {state:'running',result:r,delay:500};
 const checkpoint=variationStatus({...r,modelDiscountStartedAt:Date.now()},
  'model_discount_updating','model-promotion-write','Aplicando promoção autorizada para todos os modelos.');
 await io.beforeWrite(checkpoint);
 try{
  await io.variationDiscountPublish(approved,rows,promo.action);
  return {state:'running',result:variationStatus(checkpoint,'model_discount_verifying',
   'model-promotion-accepted','Promoção enviada; conferindo os preços na Shopee.'),delay:4000};
 }catch(e){return modelError(checkpoint,'model-discount-unknown',
  'Promoção enviada sem confirmação: '+String(e.message||e).slice(0,160));}
}
