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
 const images=arr(plan.images).length,uploaded=Math.min(images,arr(result.imageIds).length);
 const video=Boolean(plan.video),readyVideo=result.video?.phase==='ready';
 const started=['running','failed','uncertain','verified'].includes(state);
 const verified=state==='verified',pastImages=phase==='video_upload'||phase==='video_processing'||
   phase==='updating'||phase==='verifying'||phase==='verified';
 const pastVideo=['updating','verifying','verified'].includes(phase);
 const mediaFinished=images===0||uploaded===images&&pastImages||verified;
 const videoFinished=!video||Boolean(readyVideo)&&pastVideo||verified;
 const updateAccepted=verified||phase==='verifying'||phase==='verified';
 const total=1+images+(video?1:0)+1+1;
 const completed=(started?1:0)+uploaded+(video&&readyVideo?1:0)+(updateAccepted?1:0)+(verified?1:0);
 const percent=verified?100:Math.min(99,Math.round(completed/total*100));
 const failure=['failed','uncertain'].includes(state);
 const phaseNames={
  queued:'Preparando envio',images_upload:'Enviando imagens à Shopee',
  video_upload:'Enviando vídeo à Shopee',video_processing:'Aguardando processamento do vídeo',
  updating:'Aplicando alterações no anúncio',verifying:'Conferindo o anúncio na Shopee',
  verified:'Anúncio confirmado pela Shopee',retry_allowed:'Revisão necessária'
 };
 const title=verified?'Alterações confirmadas':state==='uncertain'?'Confirmação pendente':
  state==='failed'?'Execução interrompida':state==='blocked'?'Pendências para executar':
  state==='prepared'?'Pronto para executar':phaseNames[phase]||'Execução em andamento';
 const step=(id,label,s)=>({id,label,status:s});
 const doneIf=x=>x?'done':'waiting';
 const steps=[
  step('prep','Preparação',started?'done':state==='prepared'?'done':'waiting'),
  step('images','Envio de imagens',images===0?'skipped':mediaFinished?'done':
   started&&(!pastImages||phase==='images_upload')?'active':'waiting'),
  step('video','Envio de vídeo',!video?'skipped':videoFinished?'done':
   started&&mediaFinished&&['video_upload','video_processing'].includes(phase)?'active':'waiting'),
  step('update','Atualização do anúncio',updateAccepted?'done':
   started&&phase==='updating'?'active':'waiting'),
  step('verify','Conferência na Shopee',verified?'done':
   started&&phase==='verifying'?'active':'waiting'),
  step('finish','Finalização',verified?'done':'waiting')
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
  videoIncluded:video,hasStarted:started,verified,
  attention:failure,lastError:job.last_error||null,
  // Important distinction: uploaded media is not yet attached to the listing.
  message:images&&phase==='images_upload'
   ?uploaded+' de '+images+' imagens enviadas à mídia Shopee; anúncio ainda não atualizado.'
   :verified?'Alterações verificadas no anúncio pela API da Shopee.'
   :state==='uncertain'?'Resultado não confirmado. Confira antes de tentar novamente.'
   :state==='failed'?'A execução foi interrompida. Verifique o motivo antes de reexecutar.'
   :state==='prepared'?'Plano aprovado. Aguardando seu comando Executar na Shopee.'
   :state==='blocked'?'Corrija as pendências da prévia antes de executar.'
   :phaseNames[phase]||title
 };
}
