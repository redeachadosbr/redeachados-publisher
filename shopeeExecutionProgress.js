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
export function shopeeExecutionProgress(job){
 if(!job)return null;
 const plan=job.plan||{},result=job.result||{},phase=String(result.phase||'');
 const state=String(job.state||'');
 // A new preview keeps validated media from the previous attempt. Its result
 // is still null until authorization; that must not erase the saved progress.
 const media=plan.reusedMedia||{};
 const imageIds=arr(result.imageIds).length?result.imageIds:arr(media.imageIds);
 const savedVideo=result.video||media.video;
 const images=arr(plan.images).length,uploaded=Math.min(images,imageIds.length);
 const video=Boolean(plan.video),readyVideo=video&&savedVideo?.phase==='ready';
 const started=['running','failed','uncertain','verified'].includes(state);
 const hasSavedProgress=uploaded>0||readyVideo;
 const resumable=state==='prepared'&&plan.canExecute===true&&hasSavedProgress;
 const fiscalPartial=state==='verified'&&phase==='verified_partial';
 const fullWorkflow=plan.selectedStage==='all';
 const discountIncluded=Boolean(plan.commercialDiscount||plan.modelVariations?.promotion);
 const variationsIncluded=Boolean(plan.modelVariations);
 const variationsDone=variationsIncluded&&result.variation?.status==='verified';
 const variationsActive=variationsIncluded&&/^variation_/.test(phase);
 const oldPlanNoApproval=fullWorkflow&&!discountIncluded;
 const discountDone=discountIncluded&&state==='verified'&&result.discount?.status==='verified';
 const verified=state==='verified'&&!fiscalPartial&&(!discountIncluded||discountDone);
 const commercialConfirmed=state==='verified'||Boolean(result.primaryVerified);
 const fiscalActive=Boolean(plan.finalFiscal)&&/^fiscal_/.test(phase);
 const fiscalDone=Boolean(plan.finalFiscal)&&(result.fiscal?.status==='verified'||verified);
 const discountActive=discountIncluded&&/^discount_|^model_discount_/.test(phase);
 const pastImages=phase==='video_upload'||phase==='video_processing'||
   phase==='updating'||phase==='verifying'||phase==='verified';
 const pastVideo=['updating','verifying','verified'].includes(phase);
 const mediaFinished=images===0||uploaded===images||verified;
 const videoFinished=!video||Boolean(readyVideo)||verified;
 const updateAccepted=commercialConfirmed||phase==='verifying'||phase==='verified';
 const total=1+images+(video?1:0)+1+1+(variationsIncluded?1:0)+(plan.finalFiscal?1:0)+(discountIncluded?1:0);
 const completed=(started||resumable?1:0)+uploaded+(video&&readyVideo?1:0)+(updateAccepted?1:0)+
  (commercialConfirmed?1:0)+(variationsDone?1:0)+(fiscalDone?1:0)+(discountDone?1:0);
 const percent=verified?100:Math.min(fiscalPartial?95:99,Math.round(completed/total*100));
 const failure=['failed','uncertain'].includes(state)||fiscalPartial;
 const phaseNames={
  queued:'Preparando envio',images_upload:'Enviando imagens à Shopee',
  video_upload:'Enviando vídeo à Shopee',video_processing:'Aguardando processamento do vídeo',
  updating:'Aplicando alterações no anúncio',verifying:'Conferindo o anúncio na Shopee',
  verified:'Anúncio confirmado pela Shopee',verified_partial:'Comercial confirmado · fiscal pendente',
  fiscal_ready:'Preparando última etapa: dados fiscais',fiscal_updating:'Enviando dados fiscais à Shopee',
  fiscal_verifying:'Conferindo os dados fiscais na Shopee',
  discount_ready:'Preparando desconto após confirmação fiscal',
  discount_price_updating:'Atualizando preço bruto autorizado',
  discount_price_verifying:'Conferindo preço bruto na Shopee',
  discount_updating:'Enviando desconto à promoção',
  discount_verifying:'Conferindo promoção na Shopee',
  variation_ready:'Preparando automaticamente modelos e fotos individuais',
  variation_media:'Enviando fotos de variação à mídia Shopee',
  variation_updating:'Criando variações na Shopee',
  variation_verifying:'Conferindo modelos criados na Shopee',
  model_discount_ready:'Preparando descontos aprovados por modelo',
  model_discount_price_updating:'Atualizando preços brutos dos modelos',
  model_discount_price_verifying:'Conferindo preços dos modelos na Shopee',
  model_discount_updating:'Enviando desconto das variações à promoção',
  model_discount_verifying:'Conferindo descontos por modelo',
  retry_allowed:'Revisão necessária'
 };
 const title=fiscalPartial?'Comercial confirmado · Fiscal pendente':verified?'Alterações confirmadas':state==='uncertain'?'Confirmação pendente':
  state==='failed'?'Execução interrompida':state==='blocked'?'Pendências para executar':
  resumable?'Progresso recuperado · pronto para retomar':
  state==='prepared'?'Pronto para executar':phaseNames[phase]||'Execução em andamento';
 const step=(id,label,s)=>({id,label,status:s});
 const steps=[
  step('prep','Preparação',started?'done':state==='prepared'?'done':'waiting'),
  step('images','Envio de imagens',images===0?'skipped':mediaFinished?'done':
   started&&phase==='images_upload'?'active':'waiting'),
  step('video','Envio de vídeo',!video?'skipped':videoFinished?'done':
   started&&mediaFinished&&['video_upload','video_processing'].includes(phase)?'active':'waiting'),
  step('update','Atualização do anúncio',updateAccepted?'done':
   started&&phase==='updating'?'active':'waiting'),
  step('verify','Conferência comercial na Shopee',commercialConfirmed?'done':
   started&&phase==='verifying'?'active':'waiting'),
  ...(variationsIncluded?[step('variants','06 · Variações na Shopee',
    variationsDone?'done':variationsActive?'active':'waiting')]:[]),
  ...(plan.finalFiscal?[step('fiscal','07 · Dados fiscais',
      fiscalPartial?'attention':fiscalDone?'done':fiscalActive?'active':'waiting')]:
    fullWorkflow?[step('fiscal','07 · Dados fiscais (sem alteração)',commercialConfirmed?'skipped':'waiting')]:
    [step('finish','Finalização',verified?'done':'waiting')]),
  ...(fullWorkflow?[step('discount','08 · Desconto — última etapa',
    oldPlanNoApproval?'review':discountDone?'done':discountActive?'active':'waiting')]:[])
 ];
 if(failure){const current=steps.find(x=>x.status==='active');
  if(current)current.status='attention';}
 let events=arr(result.events).filter(x=>x&&typeof x.label==='string'&&typeof x.at==='string')
   .slice(-15).reverse().map(x=>({label:x.label,at:x.at,kind:x.kind||'info'}));
 if(!events.length&&started)events=[{label:title,at:job.updated_at||null,kind:failure?'warning':verified?'success':'info'}];
 const imagePercent=images?Math.round(uploaded/images*100):null;
 return {
  state,phase,title,percent,steps,events,startedAt:result.startedAt||null,
  updatedAt:job.updated_at||null,imagesTotal:images,imagesUploaded:uploaded,imagePercent,
  videoIncluded:video,videoReady:readyVideo,videoPublished:(verified||fiscalPartial)&&video,
  imagesPublished:(verified||fiscalPartial)?images:0,hasStarted:started,hasSavedProgress,resumable,verified,fiscalPartial,
  fiscalStatus:fiscalPartial?'rejected':fiscalDone?'verified':fiscalActive?'in_progress':plan.finalFiscal?'pending':'not_included',
  variationsStatus:variationsDone?'verified':variationsActive?'in_progress':variationsIncluded?'pending':'not_included',
  discountStatus:discountDone?'verified':discountActive?'in_progress':
   oldPlanNoApproval?'not_approved_for_this_run':discountIncluded?'pending':'not_included',
  attention:failure,lastError:job.last_error||null,
  // Important distinction: uploaded media is not yet attached to the listing.
  message:images&&phase==='images_upload'
   ?uploaded+' de '+images+' imagens enviadas à mídia Shopee; anúncio ainda não atualizado.'
   :fiscalPartial?'O anúncio comercial foi confirmado, mas os dados fiscais NÃO foram aceitos pela Shopee.'
   :verified?'Todas as alterações, inclusive o desconto quando aprovado, foram verificadas na Shopee.'
   :state==='uncertain'?(oldPlanNoApproval?
    'Resultado comercial não confirmado. Esta execução antiga não inclui o desconto. Confira o resultado antes de preparar outra execução.':
    'Resultado não confirmado. Confira antes de tentar novamente.')
   :state==='failed'?uploaded+' imagens na mídia Shopee, '+(verified?images:0)+
     ' aplicadas ao anúncio. A Shopee recusou a atualização; veja a pendência para corrigir.'
   :resumable?[uploaded?uploaded+' imagens já enviadas à mídia Shopee':null,
     readyVideo?'vídeo já processado':null].filter(Boolean).join(' · ')+
     '. Retome para conferir o anúncio e continuar as etapas pendentes, sem repetir esses envios.'
   :state==='prepared'?'Plano aprovado. Aguardando seu comando Executar na Shopee.'
   :state==='blocked'?'Corrija as pendências da prévia antes de executar.'
   :phaseNames[phase]||title
 };
}
