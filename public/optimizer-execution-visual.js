/* Rede Achados BR — painel visual de execução. Somente UI; nenhuma operação Shopee. */
(function(root){
 'use strict';
 const DEFINITIONS=[
  {label:'Prévia salva',icon:'file',short:'Conferindo prévia'},
  {label:'Solicitação',icon:'shop',short:'Solicitando à Shopee'},
  {label:'Aceite',icon:'server',short:'Aceite do servidor'},
  {label:'Preparação',icon:'settings',short:'Preparando execução'},
  {label:'Imagens',icon:'image',short:'Enviando imagens'},
  {label:'Vídeo',icon:'video',short:'Enviando vídeo'},
  {label:'Título SEO',icon:'tag',short:'Atualizando título'},
  {label:'Descrição',icon:'text',short:'Atualizando descrição'},
  {label:'Conferência final',icon:'shield',short:'Ficha, fiscal e conferência'}
 ];
 const PATHS={
  file:'<rect x="5" y="3" width="14" height="18" rx="2"/><path d="M9 8h6M9 12h6M9 16h4"/>',
  shop:'<path d="M3 9l2-5h14l2 5-1 3H4L3 9Z"/><path d="M5 12v8h14v-8M9 20v-5h6v5"/>',
  server:'<rect x="3" y="4" width="18" height="7" rx="2"/><rect x="3" y="13" width="18" height="7" rx="2"/><circle cx="7" cy="7.5" r=".75"/><circle cx="7" cy="16.5" r=".75"/>',
  settings:'<circle cx="12" cy="12" r="3"/><path d="m10 2-.4 2.1-2 .9-1.8-1.1L3 7l1.1 1.8-.8 2L1 11v3l2.3.4.8 2L3 18l2.8 3 1.8-1.1 2 .9.4 2.2h4l.4-2.2 2-.9 1.8 1.1 2.8-3-1.1-1.7.8-2L23 14v-3l-2.3-.3-.8-2L21 7l-2.8-3-1.8 1.1-2-.9L14 2z"/>',
  image:'<rect x="3" y="4" width="18" height="16" rx="2"/><circle cx="8" cy="9" r="1.5"/><path d="m4 17 5-5 3.5 3.5L16 12l5 5"/>',
  video:'<rect x="3" y="4" width="18" height="16" rx="3"/><path d="m10 8 6 4-6 4z"/>',
  tag:'<path d="M3 12V4h8l10 8-9 9L3 12Z"/><circle cx="8" cy="8" r="1"/>',
  text:'<path d="M4 6h16M4 10h16M4 14h13M4 18h10"/>',
  shield:'<path d="m12 2 8 4v6c0 5-3.2 8-8 10-4.8-2-8-5-8-10V6z"/><path d="m8 12 3 3 5-6"/>'
 };
 function icon(name){
  return '<svg viewBox="0 0 24 24" width="25" height="25" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">'+(PATHS[name]||PATHS.file)+'</svg>';
 }
 const select=(id)=>document.getElementById(id);
 function phaseFromServer(job,progress){
  const phase=String(job?.result?.phase||'').toLowerCase();
  if(phase.includes('image'))return 4;
  if(phase.includes('video'))return 5;
  if(phase==='verifying'||phase==='verified'||phase.includes('confirm'))return 8;
  if(phase==='updating'){
   const names=(progress?.steps||[]).filter(s=>s.status==='active'||s.status==='checking').map(s=>s.id);
   if(names.includes('seo'))return 6;
   if(names.includes('description'))return 7;
   if(names.includes('technical')||names.includes('fiscal')||names.includes('discount'))return 8;
   return 3;
  }
  if(job?.state==='running')return 3;
  if(job?.state==='verified')return 8;
  return -1;
 }
 function phaseFromEvent(title){
  const s=String(title||'').toLowerCase();
  if(/conferindo a prévia salva|recuperando prévia|prévia recuperada/.test(s))return 0;
  if(/solicitando execução|solicitando execução à shopee/.test(s))return 1;
  if(/execução aceita pelo servidor/.test(s))return 2;
  if(/preparando execução|execução em andamento/.test(s))return 3;
  if(/enviando imagens/.test(s))return 4;
  if(/enviando vídeo|processamento de vídeo/.test(s))return 5;
  if(/título seo|atualizando título/.test(s))return 6;
  if(/atualizando descrição/.test(s))return 7;
  if(/conferindo confirmação|confirmad[ao] na shopee|execução confirmada/.test(s))return 8;
  return -1;
 }
 function normalizedPercent(progress,job){
  const n=Number(progress?.percent);
  if(!progress?.hasStarted&&!progress?.hasSavedProgress&&job?.state!=='verified')return 0;
  if(!Number.isFinite(n))return 0;
  return Math.min(100,Math.max(0,Math.round(n)));
 }
 function derive({progress={},job=null,eventTitle='',eventState='',history=[]}={}){
  const currentEvent=phaseFromEvent(eventTitle);
  const currentServer=phaseFromServer(job,progress);
  let active=currentServer>=0?currentServer:currentEvent;
  if(job?.state==='prepared'&&!progress?.hasStarted)active=currentEvent===0?0:-1;
  const steps=Array.isArray(progress?.steps)?progress.steps:[];
  const byId=id=>steps.find(x=>x.id===id);
  const states=DEFINITIONS.map(()=> 'waiting');
  const accepted=['running','verified','uncertain','failed'].includes(job?.state);
  const hasAttempt=accepted||progress?.hasStarted;
  if(hasAttempt){
   states[0]='done';
   states[1]='done';
   states[2]='done';
  }else if(currentEvent>=0){
   if(currentEvent===0)states[0]='active';
   else if(currentEvent===1){states[0]='done';states[1]='active';}
  }
  if(hasAttempt){
   const running=job?.state==='running';
   states[3]=running&&currentServer===3?'active':'done';
   for(const [idx,id] of [[4,'images'],[5,'video'],[6,'seo'],[7,'description']]){
    const step=byId(id);
    if(step?.status==='done')states[idx]='done';
    else if(step?.status==='staged')states[idx]='staged';
    else if(step?.status==='checking')states[idx]='checking';
    else if(step?.status==='active')states[idx]='active';
   }
   const images=byId('images');
   if(images&&['staged','done'].includes(images.status)&&states[4]==='waiting')states[4]='staged';
   if(progress?.imagesTotal>0&&progress.imagesUploaded>=progress.imagesTotal&&states[4]==='waiting')states[4]='staged';
   if(job?.state==='verified')states[8]='done';
   else if(currentServer===8)states[8]='active';
  }
  if(job?.state==='blocked'||job?.state==='failed'||job?.state==='uncertain'||eventState==='error'||eventState==='warning'){
   const n=active>=0?active:(hasAttempt?3:0);
   if(states[n]!=='done')states[n]=job?.state==='uncertain'?'checking':'error';
  }else if(active>=0&&states[active]==='waiting')states[active]='active';
  if(job?.state==='verified')active=8;
  if(job?.state==='prepared'&&!hasAttempt&&active===-1)active=0;
  const msg=String(progress?.message||'').trim(),detail=String(select('optimizerExecutionLiveDetail')?.textContent||'').trim();
  const title=job?.state==='verified'?'Execução confirmada pela Shopee':
   job?.state==='uncertain'?'Aguardando confirmação da Shopee':
   job?.state==='failed'?'Execução interrompida':
   job?.state==='prepared'&&!hasAttempt?'Prévia pronta para executar':
   job?.state==='running'&&currentServer>=0?DEFINITIONS[currentServer].short:
   eventTitle&&currentEvent>=0?eventTitle:
   active>=0?DEFINITIONS[active].short:'Aguardando status';
  const confirm=states.filter(s=>s==='done').length;
  return {active,title,detail:msg||detail||'Aguardando atualização oficial da execução.',
   states,completed:confirm,percent:normalizedPercent(progress,job),history,
   state:job?.state||'prepared',
   mediaInfo:progress?.imagesTotal>0?
    String(progress.imagesUploaded||0)+'/'+progress.imagesTotal+' imagens na mídia · '+
    String(progress.imagesPublished||0)+' publicadas no anúncio':'Confirmar cada atualização pela API Shopee'};
 }
 let nodesMade=false,identity='';
 function createNodes(){
  const main=select('optimizerExecutionVisual');if(!main)return false;
  if(nodesMade&&main.querySelector('[data-visual-steps]'))return true;
  const track=main.querySelector('[data-visual-steps]');
  if(!track)return false;
  track.replaceChildren();
  DEFINITIONS.forEach((d,i)=>{
   const node=document.createElement('div');node.className='ra-phase is-waiting';
   node.dataset.index=String(i);
   const pict=document.createElement('span');pict.className='ra-phase-icon';pict.innerHTML=icon(d.icon);
   const check=document.createElement('span');check.className='ra-phase-check';check.textContent='✓';
   const label=document.createElement('span');label.className='ra-phase-label';label.textContent=(i+1)+'. '+d.label;
   node.append(pict,check,label);track.append(node);
  });
  nodesMade=true;return true;
 }
 function render(data={}){
  if(!createNodes())return null;
  const panel=select('optimizerExecutionVisual');
  const key=String(data.identity||'');
  if(!key){panel.hidden=true;return null;}
  if(key!==identity){identity=key;select('optimizerExecutionVisualHistory')?.replaceChildren();}
  const state=derive(data);
  panel.hidden=false;
  const val=(id,value)=>{const el=select(id);if(el)el.textContent=value;};
  val('optimizerVisualPercent',state.percent+'%');
  val('optimizerVisualCount',state.completed+' de 9 fases verificadas');
  val('optimizerVisualSummary',state.mediaInfo);
  val('optimizerVisualCurrentTitle',state.title);
  val('optimizerVisualCurrentDetail',state.detail);
  const fill=select('optimizerVisualBarFill');if(fill)fill.style.width=state.percent+'%';
  const bar=select('optimizerVisualBar');if(bar)bar.setAttribute('aria-valuenow',String(state.percent));
  const pict=select('optimizerVisualCurrentIcon');
  if(pict)pict.innerHTML=icon(DEFINITIONS[Math.max(0,state.active)]?.icon||'file');
  const nodes=panel.querySelectorAll('.ra-phase');
  nodes.forEach((node,i)=>{
   const st=state.states[i];
   node.className='ra-phase is-'+st+(i===state.active?' is-current':'');
   const text=st==='done'?'Fase verificada':st==='staged'?'Enviado à mídia, ainda não publicado':
    st==='checking'?'Aguardando confirmação':st==='error'?'Verificar erro':st==='active'?'Em andamento':'Ainda não iniciado';
   node.setAttribute('aria-label',(i+1)+'. '+DEFINITIONS[i].label+' — '+text);
   node.title=text;
  });
  const history=select('optimizerExecutionVisualHistory');
  if(history){
   history.replaceChildren();
   const list=(data.history||[]).filter(Boolean).slice(-5);
   for(const entry of list){
    const li=document.createElement('li');
    const idx=phaseFromEvent(entry.title||entry);
    const phase=idx>=0?state.states[idx]:'waiting';
    li.className='ra-history-entry';
    const symbol=document.createElement('span');symbol.className='ra-history-indicator is-'+phase;
    symbol.textContent=phase==='done'?'✓':phase==='error'?'!':phase==='active'?'●':'·';
    const caption=document.createElement('span');caption.className='ra-history-text';
    caption.textContent=String(entry.title||entry).replace(new RegExp('^[0-9]+[.] +'),'');
    const tag=document.createElement('small');
    tag.textContent=phase==='done'?'Verificado':phase==='error'?'Atenção':phase==='active'?'Atual':'Registro';
    li.append(symbol,caption,tag);history.append(li);
   }
   if(!history.children.length){
    const li=document.createElement('li');li.className='ra-history-empty';
    li.textContent='Os eventos reais aparecerão aqui ao executar.';
    history.append(li);
   }
  }
  panel.dataset.state=state.state;
  return state;
 }
 root.RAExecutionVisual={render,derive,phaseFromServer,phaseFromEvent};
})(globalThis);
