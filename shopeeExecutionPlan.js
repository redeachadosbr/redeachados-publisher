import crypto from 'node:crypto';
import {compileAttributes,compileTax,sameData,sameShopeeAttributes,fieldsVerified,attributeAuditForChanges} from './shopeeStructuredFields.js';
import {inspectAnatelCompliance} from './shopeeAnatel.js';
import {imagesSignature} from './shopeePreparedImages.js';
import {normalizedTitle,validateContentRules} from './shopeeOptimizationWorkflow.js';
import {isShopeeCestConfirmed} from './shopeeMatrixRules.js';

// Preparation is deterministic for one verified item/model/SKU. This module
// never calls Shopee, and never considers a reviewed checkbox a published item.
const normal=s=>String(s??'').replace(/\r\n?/g,'\n').trim();
export const SHOPEE_EXECUTION_STAGES=Object.freeze(['all','images','video','seo','technical','description','fiscal']);
export const SHOPEE_EXECUTION_STAGE_LABELS=Object.freeze({
 all:'Todas as etapas',images:'Imagens comerciais',video:'Vídeo do anúncio',
 seo:'Título SEO',technical:'Ficha técnica',description:'Descrição',fiscal:'Informações fiscais'
});
export function normalizeShopeeExecutionStage(stage='all'){
 const selected=String(stage||'all');
 if(!SHOPEE_EXECUTION_STAGES.includes(selected))throw Error('Etapa de publicação desconhecida.');
 return selected;
}
export function compileShopeeExecutionPlan({shopId,itemId,modelId,sku,record,review,live,manualVideo=null,verifiedVideoSha256=null,manualImages=[],deferUnconfirmedFiscal=false,omitFiscal=false,selectedStage='all'}){
  selectedStage=normalizeShopeeExecutionStage(selectedStage);
  const selected=name=>selectedStage==='all'||selectedStage===name;
  const state=review||{},stages=state.stages||{};
  const title=normalizedTitle(state.draftTitle||'');
  const description=normal(state.draftDescription);
  const currentTitle=normal(live?.item_name),currentDescription=normal(live?.description);
  const currentType=String(live?.description_type||'normal').toLowerCase();
  const proposed={},blocked=[],warnings=[];
  if(record?.sku!==sku||String(record?.itemId)!==String(itemId)||
     String(record?.selectedModelId||'0')!==String(modelId))
    throw Error('Anúncio, modelo ou SKU diferente da auditoria atual.');
  if(!['NORMAL','UNLIST'].includes(String(record?.status)))blocked.push('Anúncio não está em estado editável confirmado.');
  if(selected('seo')&&stages.seo?.reviewed===true){
    try{
      validateContentRules({title});
      if(title!==currentTitle)proposed.item_name=title;
    }catch(e){blocked.push(e.message);}
  }else if(selected('seo')&&title&&title!==currentTitle)blocked.push('Revisar e registrar a etapa Título SEO antes de executar.');
  if(selected('description')&&stages.description?.reviewed===true){
    if(currentType!=='normal')blocked.push('Descrição estendida da Shopee exige fluxo próprio; atualização bloqueada.');
    else try{
      validateContentRules({description});
      if(description!==currentDescription)proposed.description=description;
    }catch(e){blocked.push(e.message);}
  }else if(selected('description')&&description&&description!==currentDescription)blocked.push('Revisar e registrar Descrição e variações antes de executar.');
  if(record?.hasModel||String(modelId)!=='0')
    warnings.push('As alterações são campos do anúncio-pai; a alteração afeta TODAS as variações deste Item ID.');
  if(Number(record?.imageCount)<9)warnings.push('Imagens: '+record.imageCount+'/9; faltam arquivos aprovados, geração e upload.');
  warnings.push('Vídeo: '+String(record?.videoStatus||'não verificado')+'. É necessário confirmar/upload autorizado.');
  if((record.attributeAudit?.missingMandatory||0)>0)warnings.push('Ficha técnica: atributos obrigatórios pendentes.');
  const changing=new Set(stages.technical?.reviewed?(state.attributes||[]).map(x=>Number(x.attributeId)):[]);
  const pendingAttributes=(record.attributeAudit?.attributes||[]).filter(x=>!x.conditional&&x.state==='missing'&&!changing.has(x.id));
  if(pendingAttributes.length)warnings.push('Ficha técnica: '+pendingAttributes.map(x=>x.name).join(', ')+'. Dados sem fonte permanecem pendentes; somente os campos revisados serão alterados.');
  if(state.variationConfig?.enabled)warnings.push('Variações: somente rascunho revisado. Modelos, opções e imagens individuais NÃO serão cadastrados na Shopee nesta execução. Exigem fluxo específico de modelos e fotos confirmadas.');
  if(!stages.fiscal?.reviewed||!state.tax)warnings.push('Fiscal: informe os dados e a fonte por SKU para preparar a alteração.');
  warnings.push('Preço, frete e promoção permanecem separados; descontos não serão enviados.');
  if(selected('technical')&&stages.technical?.reviewed&&state.attributes?.length){
    try{const attributes=compileAttributes(state.attributes,record,live);
      if(!sameShopeeAttributes(attributes,live.attribute_list||[]))proposed.attribute_list=attributes;
    }catch(e){blocked.push(e.message);}
  }
  // Verifique também execuções só de título/imagem: a Shopee pode recusar
  // atualizações se o novo atributo obrigatório estiver sem resposta.
  try{
    const technicalDraft=selected('technical')&&stages.technical?.reviewed&&state.attributes?.length
      ?attributeAuditForChanges(state.attributes,record,live):record.attributeAudit;
    const anatel=inspectAnatelCompliance(technicalDraft);
    if(anatel.requiresAction)blocked.push('Anatel: '+anatel.message);
    else if(anatel.status==='registro-informado')warnings.push('Anatel: número declarado; confira a homologação correspondente ao modelo.');
  }catch(e){blocked.push('Anatel: não foi possível revalidar a ficha. '+e.message);}
  // A rejected fiscal update must not turn unrelated, already reviewed
  // content and media stages into a permanent CEST hostage.
  // The UI may display "00", but this is not a real CEST and is NEVER sent as tax_info.cest.
  // Shopee may still reject update_item; that is reported from the API.
  const fiscalDeferred=selected('fiscal')&&(
    Boolean(omitFiscal)||selectedStage!=='fiscal'&&Boolean(deferUnconfirmedFiscal)&&
    !isShopeeCestConfirmed(state.tax?.cest)&&
    !isShopeeCestConfirmed(live?.tax_info?.cest));
  // Na execução completa, o fiscal é uma segunda atualização DURÁVEL,
  // posterior à confirmação de imagens, vídeo e conteúdo. Nunca no mesmo update_item.
  let finalFiscal=null;
  if(fiscalDeferred){
    warnings.push(omitFiscal?'Fiscal omitido explicitamente nesta execução; a ficha no Motor Matriz permanece guardada.':
      'CEST sem código confirmado após recusa anterior: fiscal permanece pendente; não será enviado sem nova revisão. As demais etapas continuam independentes.');
  }else if(selected('fiscal')&&stages.fiscal?.reviewed&&state.tax){
    try{
      const tax=compileTax(state.tax,live);
      if(!sameData(tax,live.tax_info||{})){
        if(selectedStage==='all')finalFiscal=tax;
        else proposed.tax_info=tax;
      }
    }catch(e){
      // Falha fiscal não deve apagar alterações comerciais previamente aprovadas.
      if(selectedStage==='all')warnings.push('Fiscal pendente: '+e.message+' Revise o Motor Matriz.');
      else blocked.push(e.message);
    }
  }
  if(selectedStage==='all'&&finalFiscal)
    warnings.push('Fiscal será a ÚLTIMA etapa: primeiro confirmar conteúdo e mídia na Shopee; depois enviar e verificar os campos fiscais. Se recusado, mostrar pendência explícita.');
  let images=[];
  if(selected('images')&&stages.images?.reviewed&&manualImages.length){
    if(manualImages.length!==9||state.imagesSignature!==imagesSignature(manualImages))
      blocked.push('Importe e revise as nove imagens atuais antes de publicar.');
    else if(!sameData(manualImages.map(x=>x.shopee_image_id),live.image?.image_id_list||[]))images=manualImages;
  }
  let video=null;
  const savedVideoVerified=manualVideo?.publication?.sha256===manualVideo?.sha256&&videoMatches(live,manualVideo?.publication?.video);
  if(selected('video')&&manualVideo&&manualVideo.sha256!==verifiedVideoSha256&&!savedVideoVerified){
    if(stages.video?.reviewed===true&&state.videoSha256===manualVideo.sha256){
      video=manualVideo;
      warnings.splice(warnings.findIndex(x=>x.startsWith('Vídeo:')),1);
      warnings.push('Vídeo aprovado: '+manualVideo.filename+'. O vídeo do anúncio-pai será substituído após processamento.');
    }else warnings.push('Registre a revisão do vídeo importado para incluí-lo na execução.');
  }
  if(images.length){const i=warnings.findIndex(x=>x.startsWith('Imagens:'));if(i>=0)warnings.splice(i,1);}
  const canExecute=blocked.length===0&&(Object.keys(proposed).length>0||Boolean(finalFiscal)||Boolean(video)||images.length>0);
  const fingerprint=crypto.createHash('sha256').update(JSON.stringify({
    shopId:String(shopId),itemId:String(itemId),modelId:String(modelId),sku,
    selectedStage,from:{item_name:currentTitle,description:currentDescription,description_type:currentType},
    to:proposed,finalFiscal,fiscalDeferred,
    // Não invalidar publicação de imagens/conteúdo por edição fiscal que NÃO será enviada.
    // A prévia fiscal individual continua protegida por proposed.tax_info.
    deferredTaxDraft:fiscalDeferred&&!omitFiscal?state.tax||{}:null,
    video:video?.sha256||null,images:imagesSignature(images)
  })).digest('hex');
  return {planId:crypto.randomUUID(),shopId:Number(shopId),itemId:String(itemId),
    modelId:String(modelId),sku,original:{
      item_name:currentTitle,description:currentDescription,description_type:currentType,video_info:live?.video_info||[],
      item_sku:String(live?.item_sku||''),category_id:live?.category_id,
      attribute_list:live?.attribute_list||[],tax_info:live?.tax_info||{},image:live?.image||{}
    },proposed,video,images,finalFiscal,
    actions:[...Object.keys(proposed),...(images.length?['images']:[]),...(video?['video']:[]),...(finalFiscal?['tax_info']:[])],
    blocked,warnings,canExecute,
    fingerprint,fiscalDeferred,selectedStage,createdAt:new Date().toISOString(),marketplaceUpdated:false,
    requiresExplicitConfirmation:true,
    scope:selectedStage==='all'?'Conteúdo e mídia primeiro; fiscal separado na última etapa, se elegível':'Somente '+SHOPEE_EXECUTION_STAGE_LABELS[selectedStage]+'; outras etapas não serão enviadas'};
}
export function confirmShopeeExecution(plan,{sku,confirmation}={}){
  if(!plan||!plan.canExecute||(Object.keys(plan.proposed||{}).length===0&&!plan.finalFiscal&&!plan.video&&!plan.images?.length))
    throw Error('Não existem alterações aprovadas e elegíveis para executar.');
  if(String(sku)!==plan.sku||String(confirmation)!=='EXECUTAR '+plan.sku)
    throw Error('Confirmação da SKU incorreta. Digite EXECUTAR '+plan.sku);
}
export function assertLiveShopeeUnchanged(plan,base){
  if(String(base?.item_id)!==String(plan.itemId))throw Error('Item ID divergente; execução cancelada.');
  if(normal(base.item_name)!==plan.original.item_name||
     normal(base.description)!==plan.original.description||
     String(base.description_type||'normal').toLowerCase()!==plan.original.description_type)
    throw Error('Anúncio alterado após preparação. Recalcule o plano antes de executar.');
  if(plan.video&&JSON.stringify(base.video_info||[])!==JSON.stringify(plan.original.video_info||[]))
    throw Error('Vídeo do anúncio alterado após preparação. Prepare novamente.');
  if(plan.proposed.attribute_list&&!sameShopeeAttributes(base.attribute_list||[],plan.original.attribute_list||[]))
    throw Error('A ficha técnica da Shopee foi modificada após a prévia. Recalcule a prévia e confira os atributos antes de executar.');
  if((plan.proposed.tax_info||plan.finalFiscal)&&!sameData(base.tax_info||{},plan.original.tax_info||{}))
    throw Error('Os dados fiscais da Shopee mudaram após a prévia. Recalcule e confira o NCM e os demais campos fiscais.');
  if(plan.images?.length&&!sameData(base.image?.image_id_list||[],plan.original.image?.image_id_list||[]))throw Error('Imagens alteradas após preparação. Refaça a prévia.');
  if(base.category_id&&plan.original.category_id&&Number(base.category_id)!==Number(plan.original.category_id))throw Error('Categoria alterada após preparação. Refaça a auditoria.');
  if(base.item_status&&!['NORMAL','UNLIST'].includes(base.item_status))throw Error('Anúncio não está mais editável.');
}
export function verifyShopeeFiscalExecution(plan,item,result={}){
  return verifyShopeeExecution(plan,item,result)&&
    (!plan.finalFiscal||fieldsVerified({tax_info:plan.finalFiscal},item));
}
export function verifyShopeeExecution(plan,item,result={}){
  return String(item?.item_id)===String(plan.itemId)&&
    (!plan.video||videoMatches(item,result.video))&&
    (!plan.images?.length||sameData(item.image?.image_id_list||[],result.imageIds||[]))&&
    fieldsVerified(plan.proposed||{},item);
}


export function videoMatches(item,video){
  if(!video?.id||video.phase!=='ready')return false;
  const infos=Array.isArray(item?.video_info)?item.video_info:[item?.video_info].filter(Boolean);
  const paths=new Set((video.videoInfo?.video_url_list||[]).map(x=>videoPath(x.video_url)).filter(Boolean));
  return infos.some(x=>x.video_upload_id===video.id||x.video_id===video.id||
    (paths.size>0&&paths.has(videoPath(x.video_url))));
}
function videoPath(value){try{return new URL(value).pathname.replace(/\/+$/,'');}catch{return '';}}
