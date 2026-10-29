// Public, non-sensitive execution view, derived solely from the saved Shopee job.
// Media uploads precede update_item and must not be displayed as a published listing.
const arr=x=>Array.isArray(x)?x:[];
const count=x=>Number.isSafeInteger(Number(x))&&Number(x)>0?Number(x):0;
export function withExecutionEvent(result,key,label,kind='info'){
 const base=result&&typeof result==='object'?result:{};
 const events=arr(base.events);
 if(events.some(x=>x?.key===key))return {...base,events};
 return {...base,events:[...events,{key:String(key).slice(0,90),
  label:String(label).slice(0,200),kind:['success','warning','info'].includes(kind)?kind:'info',
  at:new Date().toISOString()}].slice(-30)};
}
// Uma única matriz de OITO etapas serve a qualquer SKU.
// "Não incluído" não vira aprovação ou publicação fictícia.
export const SHOPEE_MATRIX_8_STAGES=Object.freeze([
 {id:'images',label:'01 · Imagens comerciais'},
 {id:'video',label:'02 · Vídeo do anúncio'},
 {id:'seo',label:'03 · Título SEO'},
 {id:'description',label:'04 · Descrição'},
 {id:'technical',label:'05 · Ficha técnica'},
 {id:'variants',label:'06 · Variações'},
 {id:'fiscal',label:'07 · Dados fiscais'},
 {id:'discount',label:'08 · Desconto'}
]);
export function shopeeExecutionProgress(job){
 if(!job)return null;
 const plan=job.plan||{},result=job.result||{};
 const state=String(job.state||''),phase=String(result.phase||'');
 const pendingOnly=plan.selectedStage==='remaining';
 const fullWorkflow=plan.selectedStage==='all'||pendingOnly;
 const media=plan.reusedMedia||{};
 const imageIds=arr(result.imageIds).length?arr(result.imageIds):arr(media.imageIds);
 const readyVideo=(result.video||media.video)?.phase==='ready';
 const images=arr(plan.images).length;
 const uploaded=Math.min(images,imageIds.length);
 const video=Boolean(plan.video);
 const proposed=plan.proposed||{};
 const confirmedStages=plan.confirmedStages||{};
 // As fotos efetivamente lidas da Shopee na preparação também podem coincidir
 // com os IDs exatos do lote recuperado. Este fato independe da escrita fiscal.
 const imageList=arr(plan.original?.image?.image_id_list);
 const imageReadback=images>0&&imageIds.length===images&&imageList.length===images&&
  imageList.every((id,i)=>String(id)===String(imageIds[i]));
 const ready=arr(plan.original?.video_info);
 const videoRef=(result.video||media.video)?.id;
 const paths=new Set(arr((result.video||media.video)?.videoInfo?.video_url_list)
  .map(x=>{try{return new URL(x.video_url).pathname;}catch{return null;}})
  .filter(Boolean));
 const videoReadback=readyVideo&&Boolean(videoRef)&&ready.some(x=>
  String(x?.video_upload_id||'')===String(videoRef)||
  String(x?.video_id||'')===String(videoRef)||
  (paths.size>0&&(()=>{try{return paths.has(new URL(x?.video_url).pathname);}catch{return false;}})()));
 const commercialConfirmed=Boolean(result.primaryVerified)||state==='verified'||result.verified===true;
 // Recuperação após duas leituras oficiais pode confirmar a mídia mesmo
 // que título/atributos permaneçam pendentes. Não confundir com upload.
 const recovery=result.recovery||{};
 const confirmedReadback=recovery.kind==='stable_readback_no_write'&&
  recovery.stable===true&&Array.isArray(recovery.pending);
 const recoverPending=confirmedReadback?recovery.pending:[];
 const imagesConfirmed=imageReadback||commercialConfirmed||
  (confirmedReadback&&images>0&&Number(recovery.imagesInShop)===images&&
   !recoverPending.some(x=>/imagens enviadas|imagens.*vinculadas/i.test(x)));
 const videoConfirmed=videoReadback||commercialConfirmed||
  (confirmedReadback&&readyVideo&&
   !recoverPending.some(x=>/vídeo.*confirmado/i.test(x)));
 const fiscalPartial=state==='verified'&&phase==='verified_partial';
 const verified=state==='verified'&&!fiscalPartial;
 const discountIncluded=Boolean(plan.commercialDiscount||plan.modelVariations?.promotion||plan.kitDiscount||plan.discountOnly);
 const hasVariants=Boolean(plan.modelVariations);
 const variantsDone=hasVariants&&result.variation?.status==='verified';
 const fiscalIncluded=Boolean(plan.finalFiscal||proposed.tax_info);
 const fiscalDone=fiscalIncluded&&!fiscalPartial&&
  (result.fiscal?.status==='verified'||(verified&&!plan.finalFiscal));
 const discountDone=discountIncluded&&result.discount?.status==='verified';
 const activeCommercial=['updating','verifying','images_upload','video_upload','video_processing'].includes(phase);
 // Uma atualização aceita é um avanço operacional, mas NÃO comprova publicação.
 const updateAccepted=Boolean(result.requestId||arr(result.events).some(e=>e?.key==='update-accepted'));
 const activeVariants=/^variation_/.test(phase);
 const activeFiscal=/^fiscal_/.test(phase);
 const activeDiscount=/^(?:discount_|model_discount_|kit_discount_)/.test(phase);
 const attempt=['running','failed','uncertain','verified'].includes(state);
 const failure=['failed','uncertain'].includes(state)||fiscalPartial;
 const hasSavedProgress=uploaded>0||readyVideo||variantsDone||
  commercialConfirmed||imagesConfirmed||videoConfirmed;
 // Um plano preparado com zero upload e sem run_id não é uma execução
 // interrompida; ele AGUARDA o clique de autorização do vendedor.
 const resumable=state==='prepared'&&plan.canExecute===true&&hasSavedProgress;
 const awaitingAuthorization=state==='prepared'&&!hasSavedProgress;
 const needs={
  images:images>0,
  video,
  seo:Object.hasOwn(proposed,'item_name')||confirmedStages.seo===true,
  description:Object.hasOwn(proposed,'description')||confirmedStages.description===true,
  technical:Object.hasOwn(proposed,'attribute_list')||confirmedStages.technical===true,
  variants:hasVariants,
  fiscal:fiscalIncluded,
  discount:discountIncluded
 };
 const done={
  images:needs.images&&imagesConfirmed,
  video:needs.video&&videoConfirmed,
  seo:needs.seo&&(confirmedStages.seo===true||commercialConfirmed),
  description:needs.description&&(confirmedStages.description===true||commercialConfirmed),
  technical:needs.technical&&(confirmedStages.technical===true||commercialConfirmed),
  variants:variantsDone,
  fiscal:fiscalDone,
  discount:discountDone
 };
 const active={
  images:needs.images&&['images_upload','updating','verifying'].includes(phase),
  video:needs.video&&['video_upload','video_processing','updating','verifying'].includes(phase),
  seo:needs.seo&&activeCommercial,
  description:needs.description&&activeCommercial,
  technical:needs.technical&&activeCommercial,
  variants:needs.variants&&activeVariants,
  fiscal:needs.fiscal&&activeFiscal,
  discount:needs.discount&&activeDiscount
 };
 const steps=SHOPEE_MATRIX_8_STAGES.map(({id,label})=>{
  let status;
  if(id==='discount'&&fullWorkflow&&!discountIncluded)
    status=state==='prepared'?'authorization':'review';
  else if(!needs[id])status='skipped';
  else if(done[id])status='done';
  else if(id==='images'&&uploaded>0&&uploaded===images)status='staged';
  else if(id==='video'&&readyVideo)status='staged';
  else if(active[id])status=failure?'attention':'active';
  else if(updateAccepted&&['seo','description','technical'].includes(id)&&needs[id])
   status=failure?'attention':'checking';
  else status='waiting';
  if(fiscalPartial&&id==='fiscal')status='attention';
  return {id,label,status};
 });
 // A barra acompanha marcos REAIS: upload/aceite/validação. O progresso
 // operacional jamais é apresentado como percentual publicado na Shopee.
 // Cada etapa só atinge 100% após confirmação pelo readback oficial.
 const required=steps.filter(x=>!['skipped','review','authorization'].includes(x.status));
 const contribution=step=>{
  const id=step.id;
  if(done[id])return 1;
  if(id==='images'&&images>0)return Math.min(.85,uploaded/images*.85);
  if(id==='video'&&readyVideo)return .85;
  if(['seo','description','technical'].includes(id)&&updateAccepted)return .65;
  return 0;
 };
 const percent=verified&&(!discountIncluded||discountDone)?100:
  Math.min(99,required.length?Math.round(100*required.reduce((sum,s)=>sum+contribution(s),0)/required.length):0);
 const titles={
  queued:'Preparando execução',images_upload:'Enviando imagens à mídia',
  video_upload:'Enviando vídeo à mídia',video_processing:'Processando vídeo',
  updating:'Publicando campos do anúncio',verifying:'Conferindo anúncio na Shopee',
  variation_ready:'Preparando variações',variation_media:'Enviando fotos das variações',
  variation_updating:'Criando variações',variation_verifying:'Conferindo modelos',
  fiscal_ready:'Preparando dados fiscais',fiscal_updating:'Enviando dados fiscais',
  fiscal_verifying:'Conferindo dados fiscais',kit_discount_ready:'Preparando desconto do kit',kit_discount_price_updating:'Atualizando preço do kit',
  kit_discount_price_verifying:'Conferindo preço do kit',kit_discount_updating:'Enviando promoção do kit',
  kit_discount_verifying:'Conferindo promoção do kit',discount_ready:'Preparando desconto',
  discount_price_updating:'Atualizando preço bruto',discount_price_verifying:'Conferindo preço bruto',
  discount_updating:'Aplicando desconto',discount_verifying:'Conferindo promoção',
  model_discount_ready:'Preparando desconto dos modelos',
  model_discount_price_updating:'Atualizando preços por modelo',
  model_discount_price_verifying:'Conferindo preços por modelo',
  model_discount_updating:'Aplicando desconto por modelo',
  model_discount_verifying:'Conferindo desconto por modelo'
 };
 const modeLabels={images:'SOMENTE IMAGENS',video:'SOMENTE VÍDEO',seo:'SOMENTE TÍTULO',
  description:'SOMENTE DESCRIÇÃO',technical:'SOMENTE FICHA TÉCNICA',
  fiscal:'SOMENTE FISCAL',remaining:'SOMENTE VARIAÇÕES, FISCAL E DESCONTO',discount:'SOMENTE DESCONTO',variants:'SOMENTE VARIAÇÕES'};
 const partial=plan.selectedStage&&plan.selectedStage!=='all';
 const partialName=modeLabels[plan.selectedStage]||'ETAPA ISOLADA';
 const title=fiscalPartial?'Dados fiscais pendentes de correção':
  verified?'Etapas aprovadas confirmadas':state==='uncertain'?'Confirmação pendente':
  state==='failed'?'Execução interrompida':state==='blocked'?'Pendências para executar':
  state==='prepared'?(partial?'Prévia PARCIAL · '+partialName+' · aguardando autorização':
   resumable?'Mídia já enviada · confirmar retomada':'Prévia completa · aguardando autorização'):
  titles[phase]||'Execução em andamento';
 const events=arr(result.events).filter(x=>x&&typeof x.label==='string'&&typeof x.at==='string')
  .slice(-15).reverse().map(x=>({label:x.label,at:x.at,kind:x.kind||'info'}));
 if(!events.length&&attempt)
  events.push({label:title,at:job.updated_at||null,kind:failure?'warning':verified?'success':'info'});
 const message=fiscalPartial?'O anúncio e as variações foram processados, mas a Shopee recusou os dados fiscais. Confira o motivo antes de aplicar o desconto.':
  verified?'Todas as alterações incluídas nesta execução foram verificadas na Shopee. Etapas dispensadas não foram reenviadas.':
  state==='uncertain'?
   [uploaded?uploaded+' de '+images+' imagens guardadas na mídia Shopee':null,
    readyVideo?'vídeo processado na mídia':null,
    updateAccepted?'alteração recebida pela API':null,
    'publicação no anúncio ainda não confirmada. O sistema consulta o resultado sem repetir a escrita'].filter(Boolean).join(' · '):
  state==='failed'?
   (confirmedReadback?'Conferência parcial: mídia confirmada na Shopee; as demais etapas requerem nova prévia. ':'')+
   'Execução interrompida: '+String(job.last_error||'confira a ocorrência'):
  state==='prepared'&&plan.selectedStage==='variants'?
   'Somente variações preparado. Nenhum desconto ou outra etapa será enviado nesta execução.':
  state==='prepared'&&plan.selectedStage==='discount'?
   'Somente desconto preparado, sem publicação. Imagens, vídeo, título, descrição, ficha técnica, variações e fiscal serão preservados. Confira o ID da Minha Promoção antes de autorizar.':
  state==='prepared'&&partial?
   'Atenção: prévia PARCIAL — '+partialName+'. Outras etapas NÃO estão incluídas. '+
   'Nenhuma publicação foi iniciada. Para executar o anúncio inteiro, selecione “Todas as etapas aprovadas” e prepare novamente. '+
   'Para executar apenas esta etapa, clique no botão explícito de autorização.':
  state==='prepared'?
   [confirmedStages.seo?'Título SEO já confirmado na Shopee':null,
    confirmedStages.description?'Descrição já confirmada na Shopee':null,
    imagesConfirmed?'Imagens confirmadas no anúncio':uploaded?uploaded+' imagens na biblioteca da Shopee':null,
    videoConfirmed?'Vídeo confirmado no anúncio':readyVideo?'Vídeo processado na mídia':null,
    'Nenhuma publicação foi iniciada. Clique em Executar na Shopee após conferir a prévia e o desconto.'].filter(Boolean).join(' · '):
  titles[phase]||title;
 return {
  state,phase,title,percent,progressMeaning:'andamento_operacional_nao_publicacao',
  steps,events,startedAt:result.startedAt||null,
  updatedAt:job.updated_at||null,imagesTotal:images,imagesUploaded:uploaded,
  imagePercent:images?Math.round(uploaded/images*100):null,
  videoIncluded:video,videoReady:video&&readyVideo,
  imagesPublished:imagesConfirmed?images:0,
  videoPublished:video&&videoConfirmed,
  hasStarted:attempt,hasSavedProgress,resumable,awaitingAuthorization,verified:verified&&(!discountIncluded||discountDone),
  fiscalPartial,
  fiscalStatus:fiscalPartial?'rejected':fiscalDone?'verified':activeFiscal?'in_progress':fiscalIncluded?'pending':'not_included',
  variationsStatus:variantsDone?'verified':activeVariants?'in_progress':hasVariants?'pending':'not_included',
  discountStatus:discountDone?'verified':activeDiscount?'in_progress':
   fullWorkflow&&!discountIncluded?(state==='prepared'?'awaiting_execution_confirmation':'not_approved_for_this_run'):
    discountIncluded?'pending':'not_included',
  attention:failure,lastError:job.last_error||null,message
 };
}
