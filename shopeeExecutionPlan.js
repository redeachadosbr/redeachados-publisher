import crypto from 'node:crypto';
import {compileAttributes,compileTax,sameData,stableDataJson,sameShopeeAttributes,canonicalShopeeAttributes,fieldsVerified,attributeAuditForChanges} from './shopeeStructuredFields.js';
import {inspectAnatelCompliance} from './shopeeAnatel.js';
import {imagesSignature} from './shopeePreparedImages.js';
import {normalizedTitle,validateContentRules} from './shopeeOptimizationWorkflow.js';
import {isShopeeCestConfirmed} from './shopeeMatrixRules.js';

// Preparation is deterministic for one verified item/model/SKU. This module
// never calls Shopee, and never considers a reviewed checkbox a published item.
const normal=s=>String(s??'').replace(/\r\n?/g,'\n').trim();
export const SHOPEE_EXECUTION_STAGES=Object.freeze(['all','discount','variants','images','video','seo','technical','description','fiscal','remaining']);
export const SHOPEE_EXECUTION_STAGE_LABELS=Object.freeze({
 all:'Todas as etapas',remaining:'Somente variações, fiscal e desconto',discount:'Somente desconto aprovado',variants:'Somente variações',images:'Imagens comerciais',video:'Vídeo do anúncio',
 seo:'Título SEO',technical:'Ficha técnica',description:'Descrição',fiscal:'Informações fiscais'
});
export function normalizeShopeeExecutionStage(stage='all'){
 const selected=String(stage||'all');
 if(!SHOPEE_EXECUTION_STAGES.includes(selected))throw Error('Etapa de publicação desconhecida.');
 return selected;
}
export function compileShopeeExecutionPlan({shopId,itemId,modelId,sku,record,review,live,manualVideo=null,verifiedVideoSha256=null,manualImages=[],deferUnconfirmedFiscal=false,omitFiscal=false,selectedStage='all',allowDiscountOnly=false,modelVariations=null,kitDiscount=null}){
  selectedStage=normalizeShopeeExecutionStage(selectedStage);
  const selected=name=>selectedStage==='all'||selectedStage===name||selectedStage==='remaining'&&name==='fiscal';
  const wholeWorkflow=selectedStage==='all'||selectedStage==='remaining';
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
      validateContentRules({title},{allowShortKitTitle:Boolean(
       state.kitOptimization?.kitSku&&String(state.kitOptimization.mainSku)===String(sku)
      )});
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
  if(!['remaining','discount','variants'].includes(selectedStage)){
   if(Number(record?.imageCount)<9)warnings.push('Imagens: '+record.imageCount+'/9; faltam arquivos aprovados, geração e upload.');
   warnings.push('Vídeo: '+String(record?.videoStatus||'não verificado')+'. É necessário confirmar/upload autorizado.');
  }else if(selectedStage==='remaining')warnings.push('Título, descrição, ficha técnica, imagens e vídeo não serão alterados nesta execução.');
  else if(selectedStage==='variants')warnings.push('Somente variações: conteúdo, mídia do anúncio-pai, dados fiscais e desconto serão preservados. As fotos próprias das variações poderão ser enviadas.');
  else warnings.push('Somente desconto: imagens, vídeo, conteúdo, atributos, variações e dados fiscais não serão enviados.');
  if(!['discount','variants'].includes(selectedStage)&&(record.attributeAudit?.missingMandatory||0)>0)warnings.push('Ficha técnica: atributos obrigatórios pendentes.');
  const changing=new Set(stages.technical?.reviewed?(state.attributes||[]).map(x=>Number(x.attributeId)):[]);
  const pendingAttributes=(record.attributeAudit?.attributes||[]).filter(x=>!x.conditional&&x.state==='missing'&&!changing.has(x.id));
  if(pendingAttributes.length)warnings.push('Ficha técnica · campos opcionais não preenchidos: '+
    pendingAttributes.map(x=>x.name).join(', ')+
    '. Opcionais ausentes não são falha de execução nem impedem avançar.');
  if(state.variationConfig?.enabled&&(wholeWorkflow||selectedStage==='variants'))warnings.push(modelVariations?
   'Variações reais incluídas no processamento automático antes dos dados fiscais e do desconto.':
   'Variações já publicadas ou sem rascunho confirmado: o sistema verifica os modelos reais antes de concluir.');
  if(!['discount','variants'].includes(selectedStage)&&(!stages.fiscal?.reviewed||!state.tax))warnings.push('Fiscal: informe os dados e a fonte por SKU para preparar a alteração.');
  warnings.push(selectedStage==='variants'?'Etapa 06 exclusiva: variações aprovadas serão verificadas na Shopee sem aplicar descontos.':
   selectedStage==='discount'?'Etapa 08 exclusiva: Minha Promoção conferida, com autorização expressa e leitura oficial da Shopee.':wholeWorkflow?'Desconto conferido será enviado como última etapa, somente após a confirmação comercial e fiscal.':'Preço e desconto não serão alterados nesta execução de etapa individual.');
  if(selected('technical')&&stages.technical?.reviewed&&state.attributes?.length){
    try{const attributes=compileAttributes(state.attributes,record,live);
      // A API pode devolver o atributo "Condição: NOVO" em condition="NEW".
      // Se TODOS os atributos revisados já corresponderem ao anúncio,
      // nunca reenviar a ficha técnica.
      if(!fieldsVerified({attribute_list:attributes},live))proposed.attribute_list=attributes;
    }catch(e){blocked.push(e.message);}
  }
  // Não bloquear uma alteração EXCLUSIVAMENTE fiscal por atributos técnicos
  // que NÃO serão modificados: Anatel continua obrigatório para conteúdo,
  // imagem, vídeo ou ficha técnica quando a árvore de atributos o exigir.
  if(!['fiscal','remaining','discount','variants'].includes(selectedStage)){
    try{
      const technicalDraft=selected('technical')&&stages.technical?.reviewed&&state.attributes?.length
        ?attributeAuditForChanges(state.attributes,record,live):record.attributeAudit;
      const anatel=inspectAnatelCompliance(technicalDraft);
      if(anatel.requiresAction)blocked.push('Anatel: '+anatel.message);
      else if(anatel.status==='registro-informado')warnings.push('Anatel: número declarado; confira a homologação correspondente ao modelo.');
    }catch(e){blocked.push('Anatel: não foi possível revalidar a ficha. '+e.message);}
  }
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
        if(wholeWorkflow)finalFiscal=tax;
        else proposed.tax_info=tax;
      }
    }catch(e){
      // Falha fiscal não deve apagar alterações comerciais previamente aprovadas.
      if(wholeWorkflow)warnings.push('Fiscal pendente: '+e.message+' Revise o Motor Matriz.');
      else blocked.push(e.message);
    }
  }
  if(wholeWorkflow&&finalFiscal)
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
  const noOtherChange=Object.keys(proposed).length===0&&!finalFiscal&&!video&&images.length===0&&!modelVariations;
  const discountOnly=((selectedStage==='all'&&Boolean(allowDiscountOnly||kitDiscount))||
    (selectedStage==='discount'&&Boolean(kitDiscount||allowDiscountOnly)))&&noOtherChange;
  const canExecute=blocked.length===0&&(!noOtherChange||discountOnly);
  // A prévia consulta a Shopee. Conteúdo que já coincide EXATAMENTE com
  // o rascunho aprovado não integra o payload de alteração e deve aparecer
  // como "confirmado no anúncio", não "não incluído".
  const confirmedStages={
    seo:selected('seo')&&stages.seo?.reviewed===true&&Boolean(title)&&title===currentTitle,
    description:selected('description')&&stages.description?.reviewed===true&&
      Boolean(description)&&description===currentDescription,
    technical:selected('technical')&&stages.technical?.reviewed===true&&
      !Object.hasOwn(proposed,'attribute_list')&&
      Boolean(state.attributes?.length)&&
      !blocked.some(x=>/atributo|ficha técnica|anatel/i.test(x))
  };
  const fingerprint=crypto.createHash('sha256').update(stableDataJson({
    shopId:String(shopId),itemId:String(itemId),modelId:String(modelId),sku,
    selectedStage,discountOnly,kitDiscount:kitDiscount||null,modelVariations:modelVariations?{
     type:modelVariations.type,alreadyCreated:modelVariations.alreadyCreated===true,
     options:modelVariations.options.map(x=>({name:x.name,sku:x.sku,
      supplierSku:x.supplierSku,modelId:x.modelId||null,cost:x.cost,price:x.price,stock:x.stock,
      gtin:x.gtin||'',noGtin:x.noGtin===true,sha256:x.asset?.sha256})),
     promotion:modelVariations.promotion||null}:null,
    from:{item_name:currentTitle,description:currentDescription,description_type:currentType},
    // A ordem dos atributos/valores e os metadados de leitura da API não
    // alteram a ficha aprovada. Usar a mesma equivalência do readback,
    // sem ordenar imagens, variações ou modificar o payload a publicar.
    to:{...proposed,...(Object.hasOwn(proposed,'attribute_list')?
      {attribute_list:canonicalShopeeAttributes(proposed.attribute_list)}:{})},finalFiscal,fiscalDeferred,
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
    },proposed,video,images,finalFiscal,modelVariations,kitDiscount,confirmedStages,
    actions:[...Object.keys(proposed),...(images.length?['images']:[]),...(video?['video']:[]),...(modelVariations?['model_variations']:[]),...(finalFiscal?['tax_info']:[]),...(discountOnly&&!kitDiscount?['discount']:[]),...(kitDiscount?['kit_discount']:[])],
    blocked,warnings,canExecute,
    fingerprint,fiscalDeferred,selectedStage,discountOnly,createdAt:new Date().toISOString(),marketplaceUpdated:false,
    requiresExplicitConfirmation:true,
    scope:selectedStage==='all'?'Conteúdo e mídia → modelos → fiscal → desconto aprovado':
     selectedStage==='remaining'?'Apenas modelos → fiscal → desconto (sem edição de conteúdo ou mídia)':
     selectedStage==='discount'?'Somente desconto autorizado, sem alteração das outras sete etapas':
     selectedStage==='variants'?'Somente variações aprovadas, com as demais etapas preservadas':
     'Somente '+SHOPEE_EXECUTION_STAGE_LABELS[selectedStage]+'; outras etapas não serão enviadas'};
}
// Readback-only monotonic resume: a stored authorization may safely continue
// when the marketplace has ALREADY applied one or more of its exact approved
// fields between preview and execute. No new or modified value is authorized.
// This function itself performs no Shopee writes and never changes the saved plan.
export function approvedShopeeReadbackConvergence(plan,fresh,live){
 if(!plan||!fresh||!live||fresh.blocked?.length)return false;
 if(plan.selectedStage!==fresh.selectedStage||plan.sku!==fresh.sku||
  String(plan.itemId)!==String(fresh.itemId)||String(plan.modelId)!==String(fresh.modelId)||
  Boolean(plan.fiscalDeferred)!==Boolean(fresh.fiscalDeferred)||
  Boolean(plan.discountOnly)!==Boolean(fresh.discountOnly)||
  !sameData(plan.finalFiscal||null,fresh.finalFiscal||null)||
  !sameData(plan.modelVariations||null,fresh.modelVariations||null))return false;
 const previous=plan.proposed||{},current=fresh.proposed||{};
 // A fresh preview cannot add or change ANY proposed modification.
 for(const [key,value] of Object.entries(current)){
  if(!Object.hasOwn(previous,key)||!(key==='attribute_list'?
   sameShopeeAttributes(previous[key],value):sameData(previous[key],value)))return false;
 }
 for(const [key,value] of Object.entries(previous)){
  // Only an approved field that now matches Shopee exactly may disappear.
  if(!Object.hasOwn(current,key)&&!fieldsVerified({[key]:value},live))return false;
 }
 const mediaKey=x=>(x||[]).map(a=>({
  slot:Number(a.slot),sha256:String(a.sha256||'')
 }));
 const oldImages=mediaKey(plan.images),newImages=mediaKey(fresh.images);
 if(!sameData(oldImages,newImages)){
  if(newImages.length>0||!oldImages.length||
   !sameData(live.image?.image_id_list||[],plan.reusedMedia?.imageIds||[]))return false;
 }
 if(String(plan.video?.sha256||'')!==String(fresh.video?.sha256||'')){
  if(fresh.video||!plan.video||!videoMatches(live,plan.reusedMedia?.video))return false;
 }
 return true;
}
export function confirmShopeeExecution(plan,{sku,confirmation}={}){
  if(!plan||!plan.canExecute||(Object.keys(plan.proposed||{}).length===0&&!plan.finalFiscal&&!plan.video&&!plan.images?.length&&!plan.discountOnly&&!plan.modelVariations))
    throw Error('Não existem alterações aprovadas e elegíveis para executar.');
  if(String(sku)!==plan.sku||String(confirmation)!=='EXECUTAR '+plan.sku)
    throw Error('Confirmação da SKU incorreta. Digite EXECUTAR '+plan.sku);
}
export function assertLiveShopeeUnchanged(plan,base,result={}){
  if(String(base?.item_id)!==String(plan.itemId))throw Error('Item ID divergente; execução cancelada.');
  // Alterações já publicadas com os valores EXATOS aprovados não significam
  // alteração indevida. Elas não podem forçar um segundo update_item.
  const matchesApproved=(key)=>Object.hasOwn(plan.proposed||{},key)&&
   fieldsVerified({[key]:plan.proposed[key]},base);
  if(normal(base.item_name)!==plan.original.item_name&&!matchesApproved('item_name')||
     normal(base.description)!==plan.original.description&&!matchesApproved('description')||
     String(base.description_type||'normal').toLowerCase()!==plan.original.description_type)
    throw Error('Anúncio alterado após preparação. Recalcule o plano antes de executar.');
  if(plan.video&&!sameData(base.video_info||[],plan.original.video_info||[])&&
     !videoMatches(base,result.video||plan.reusedMedia?.video||plan.video?.publication?.video))
    throw Error('Vídeo do anúncio alterado após preparação. Prepare novamente.');
  if(plan.proposed.attribute_list&&!sameShopeeAttributes(base.attribute_list||[],plan.original.attribute_list||[])&&
     !matchesApproved('attribute_list'))
    throw Error('A ficha técnica da Shopee foi modificada após a prévia. Recalcule a prévia e confira os atributos antes de executar.');
  if((plan.proposed.tax_info||plan.finalFiscal)&&!sameData(base.tax_info||{},plan.original.tax_info||{})&&
     !fieldsVerified({tax_info:plan.proposed.tax_info||plan.finalFiscal},base))
    throw Error('Os dados fiscais da Shopee mudaram após a prévia. Recalcule e confira o NCM e os demais campos fiscais.');
  if(plan.images?.length&&!sameData(base.image?.image_id_list||[],plan.original.image?.image_id_list||[])){
   const expected=arr=>Array.isArray(arr)?arr:[];
   const known=expected(result.imageIds).length?result.imageIds:
    expected(plan.reusedMedia?.imageIds).length?plan.reusedMedia.imageIds:
    expected(plan.images).map(x=>x.shopee_image_id);
   if(!known.length||!sameData(base.image?.image_id_list||[],known))
    throw Error('Imagens alteradas após preparação. Refaça a prévia.');
  }
  if(plan.modelVariations&&Boolean(base.has_model)!==Boolean(plan.modelVariations.alreadyCreated))
    throw Error('Variações do anúncio mudaram após a prévia. Refaça a preparação, sem repetir envios.');
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

export function shopeeExecutionUnconfirmedFields(plan,item,result={}){
 if(!plan||!item)return ['Anúncio não pôde ser consultado na Shopee'];
 const out=[];
 if(String(item.item_id)!==String(plan.itemId))out.push('Identificação do anúncio diverge');
 if(plan.images?.length&&!sameData(item.image?.image_id_list||[],result.imageIds||[]))
  out.push('Imagens enviadas à mídia ainda não vinculadas ao anúncio');
 if(plan.video&&!videoMatches(item,result.video))
  out.push('Vídeo ainda não confirmado no anúncio');
 // Diagnóstico por campo: a ausência de UM atributo nunca deve fazer
 // título/descrição já confirmados parecerem não publicados.
 const proposed=plan.proposed||{};
 if(Object.hasOwn(proposed,'item_name')&&
   !fieldsVerified({item_name:proposed.item_name},item))
   out.push('Título SEO ainda diferente do valor aprovado');
 if(Object.hasOwn(proposed,'description')&&
   !fieldsVerified({description:proposed.description},item))
   out.push('Descrição ainda diferente do texto aprovado');
 if(Array.isArray(proposed.attribute_list)&&proposed.attribute_list.length){
   const missing=proposed.attribute_list.filter(value=>
     !fieldsVerified({attribute_list:[value]},item));
   if(missing.length)out.push('Ficha técnica: '+missing.length+' atributo(s) ainda não confirmados (ID '+
     missing.slice(0,8).map(x=>String(x.attribute_id)).join(', ')+').');
 }
 if(plan.finalFiscal&&!fieldsVerified({tax_info:plan.finalFiscal},item))
  out.push('Dados fiscais ainda não confirmados');
 return out;
}

/**
 * Reconcilia uma execução com resposta incerta por DUAS leituras estáveis.
 * Não conclui publicação, não escreve na Shopee e não recicla aprovação antiga.
 * A próxima preparação usará os campos atuais como linha de base e exigirá
 * nova prévia/aprovação para apenas as alterações ainda pendentes.
 */
export function assessShopeeStableCommercialRecovery(job,first,second,at=Date.now()){
 if(job?.state!=='uncertain')throw Error('Somente execuções sem confirmação podem ser recuperadas.');
 if(!['updating','verifying'].includes(String(job.result?.phase||'')))
  throw Error('Esta execução exige reconciliação específica de dados fiscais ou desconto.');
 const lastSeen=Math.max(Date.parse(job.updated_at||'')||0,
  Number(job.result?.updateStartedAt||0));
 if(!lastSeen||at-lastSeen<180000)
  throw Error('Aguardando a janela de consolidação Shopee de 3 minutos, sem repetir envios.');
 const snapshot=item=>({
  item_id:String(item?.item_id||''),item_status:String(item?.item_status||''),
  item_name:String(item?.item_name||''),description:String(item?.description||''),
  description_type:String(item?.description_type||'normal'),
  category_id:Number(item?.category_id||0),
  attribute_list:item?.attribute_list||[],tax_info:item?.tax_info||{},
  image_ids:item?.image?.image_id_list||[],video_info:item?.video_info||[]
 });
 const before=snapshot(first),after=snapshot(second);
 if(before.item_id!==String(job.plan?.itemId)||after.item_id!==String(job.plan?.itemId))
  throw Error('Item ID divergente. Nenhuma recuperação realizada.');
 if(!['NORMAL','UNLIST'].includes(before.item_status)||
    !['NORMAL','UNLIST'].includes(after.item_status))
  throw Error('O anúncio deixou de estar editável; nenhuma recuperação realizada.');
 // Mídia e descrições podem mudar entre duas leituras durante a propagação.
 // Uma recuperação SEM escrita precisa confirmar identidade, categoria e estado,
 // não uma igualdade byte-a-byte de todos os campos. A nova prévia consulta
 // novamente o anúncio e revalida o fingerprint antes de QUALQUER envio.
 if(before.category_id!==after.category_id)
  throw Error('A categoria da Shopee mudou entre as consultas. Refaça a auditoria da SKU.');
 const changed=Object.keys(before).filter(k=>!sameData(before[k],after[k]));
 return {
  stable:true,
  readbacksDiffer:changed.length>0,
  changedFields:changed,
  pending:shopeeExecutionUnconfirmedFields(job.plan,second,job.result||{}),
  observedAt:new Date(at).toISOString(),
  imagesInShop:(second?.image?.image_id_list||[]).length,
  previouslyUploaded:(job.result?.imageIds||[]).length,
  previewRequired:true
 };
}

