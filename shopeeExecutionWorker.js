import {assertLiveShopeeUnchanged,verifyShopeeExecution,verifyShopeeFiscalExecution} from './shopeeExecutionPlan.js';
import {sameData} from './shopeeStructuredFields.js';
import {advanceVideoUpload} from './shopeeMediaApi.js';
import {withExecutionEvent} from './shopeeExecutionProgress.js';
import {isDefinitiveShopeeRejection} from './shopeeExecutionIssues.js';
import {advanceVerifiedDiscount} from './shopeeExecutionDiscount.js';
// One durable step per lease. No tokens or secret configuration are persisted.
export async function advanceShopeeExecution(job,io){
 const plan=job.plan,result={...(job.result||{})};
 if(!plan?.requiresExplicitConfirmation||!plan.canExecute)throw Error('Plano sem aprovação válida.');
 if(['discount_ready','discount_price_updating','discount_price_verifying',
  'discount_updating','discount_verifying'].includes(String(result.phase||'')))
  return advanceVerifiedDiscount(job,io);
 // A segunda escrita fiscal tem checkpoint separado: depois de qualquer queda
 // retomamos SOMENTE a leitura, evitando duplicidade de update_item.
 if(['fiscal_updating','fiscal_verifying'].includes(result.phase)){
  const live=await io.read();
  if(verifyShopeeFiscalExecution(plan,live,result))
   return plan.commercialDiscount?
    {state:'running',result:withExecutionEvent({...result,phase:'discount_ready',primaryVerified:true,fiscal:{status:'verified'}},
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
  await io.validateIdentity();
  const live=await io.read();
  if(!verifyShopeeExecution(plan,live,result))
   return {state:'uncertain',result:withExecutionEvent(result,'commerce-changed',
    'A parte comercial mudou antes do envio fiscal. Não foi enviado outro dado.','warning'),
    lastError:'Conteúdo alterado entre as duas etapas. Verifique o anúncio antes de continuar.'};
  if(!sameData(live.tax_info||{},plan.original.tax_info||{})){
   if(verifyShopeeFiscalExecution(plan,live,result))
    return plan.commercialDiscount?
      {state:'running',result:withExecutionEvent({...result,phase:'discount_ready',primaryVerified:true,
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
 // Se a última etapa fiscal for a ÚNICA alteração, não escrever item vazio.
 if(plan.finalFiscal&&!Object.keys(plan.proposed||{}).length&&!plan.images?.length&&!plan.video)
  return {state:'running',result:withExecutionEvent({...result,phase:'fiscal_ready',
   primaryVerified:true},'fiscal-only-last','Nenhuma alteração comercial pendente; preparando dados fiscais.'),
   delay:500};
 // Se não há novos campos comerciais nem dados fiscais, executar somente
 // o desconto já conferido, sem enviar update_item vazio ou repetir a mídia.
 if(plan.commercialDiscount&&!Object.keys(plan.proposed||{}).length&&!plan.images?.length&&!plan.video&&!plan.finalFiscal)
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
