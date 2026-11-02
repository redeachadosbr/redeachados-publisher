/* Rede Achados BR — painel visual de execução. Somente UI; nenhuma operação Shopee. */
(function(root){
 'use strict';
 const DEFINITIONS=[
  {id:'images',label:'Imagens',icon:'image',short:'Enviando imagens'},
  {id:'video',label:'Vídeo',icon:'video',short:'Enviando vídeo'},
  {id:'seo',label:'Título SEO',icon:'tag',short:'Atualizando título'},
  {id:'description',label:'Descrição',icon:'text',short:'Atualizando descrição'},
  {id:'technical',label:'Ficha técnica',icon:'settings',short:'Atualizando ficha técnica'},
  {id:'variants',label:'Variações',icon:'shop',short:'Atualizando variações'},
  {id:'fiscal',label:'Dados fiscais',icon:'file',short:'Atualizando dados fiscais'},
  {id:'discount',label:'Desconto',icon:'tag',short:'Conferindo desconto'},
  {id:'final',label:'Confirmação Shopee',icon:'shield',short:'Conferindo resultado'}
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
  const byId={images:0,video:1,seo:2,description:3,technical:4,variants:5,fiscal:6,discount:7};
  if(phase.includes('discount')||phase.includes('promotion'))return 7;
  if(phase.includes('variation')||phase.includes('model_'))return 5;
  if(phase.includes('image'))return 0;
  if(phase.includes('video'))return 1;
  if(phase.includes('fiscal'))return 6;
  if(phase==='verified'||phase==='verifying'||phase.includes('confirm'))return 8;
  const active=(progress?.steps||[]).find(x=>['active','checking'].includes(x.status));
  if(active&&Object.hasOwn(byId,active.id))return byId[active.id];
  if(job?.state==='verified')return 8;
  return -1;
 }
 function phaseFromEvent(title){
  const s=String(title||'').toLowerCase();
  if(/imagem|foto/.test(s))return 0;
  if(/vídeo|video/.test(s))return 1;
  if(/título|titulo|seo/.test(s))return 2;
  if(/descrição|descricao/.test(s))return 3;
  if(/ficha técnica|atributo/.test(s))return 4;
  if(/variaç|variac|modelo/.test(s))return 5;
  if(/fiscal|ncm|cest/.test(s))return 6;
  if(/desconto|promoç|promoc|margem|concorrentes/.test(s))return 7;
  if(/confirmação|confirmad|resultado final|execução interrompida/.test(s))return 8;
  return -1;
 }
 function normalizedPercent(progress,job){
  const n=Number(progress?.percent);
  if(!progress?.hasStarted&&!progress?.hasSavedProgress&&job?.state!=='verified')return 0;
  if(!Number.isFinite(n))return 0;
  return Math.min(100,Math.max(0,Math.round(n)));
 }
 function derive({progress={},job=null,eventTitle='',eventState='',history=[]}={}){
  const steps=Array.isArray(progress?.steps)?progress.steps:[];
  const byId=id=>steps.find(x=>x.id===id);
  const states=DEFINITIONS.map(d=>{
    if(d.id==='final')return job?.state==='verified'?'done':
      job?.state==='uncertain'?'checking':'waiting';
    const step=byId(d.id);
    if(!step)return 'waiting';
    if(step.status==='done')return 'done';
    if(step.status==='staged')return 'staged';
    if(step.status==='checking')return 'checking';
    if(step.status==='active')return 'active';
    if(step.status==='attention')return 'error';
    return 'waiting';
  });
  let active=phaseFromServer(job,progress);
  if(active<0&&job?.state==='running')active=phaseFromEvent(eventTitle);
  const failed=job?.state==='failed';
  if(failed){
    const error=String(job?.last_error||progress?.lastError||'');
    const errorPhase=phaseFromEvent(error);
    if(errorPhase>=0)active=errorPhase;
  }
  if(job?.state==='running'&&active>=0&&states[active]==='waiting')
    states[active]='active';
  if(failed&&active>=0&&states[active]!=='done')states[active]='error';
  if(job?.state==='uncertain'&&active>=0&&states[active]!=='done')states[active]='checking';
  if(job?.state==='verified')active=8;
  const completed=states.filter(x=>x==='done').length;
  const title=job?.state==='verified'?'Execução deste plano confirmada':
    job?.state==='failed'?'Execução interrompida — pendências preservadas':
    job?.state==='uncertain'?'Aguardando confirmação da Shopee':
    active>=0?DEFINITIONS[active].short:
    job?.state==='prepared'?'Prévia pronta para executar':
    eventTitle||'Aguardando status da Shopee';
  const serverMessage=String(progress?.message||'').trim();
  const lastError=String(job?.last_error||'').trim();
  return {active,title,detail:failed?(lastError||serverMessage||'Consulte a pendência e continue sem repetir envios.'):
    serverMessage||String(select('optimizerExecutionLiveDetail')?.textContent||'').trim()||'Aguardando confirmação oficial.',
   states,completed,percent:normalizedPercent(progress,job),history,
   state:job?.state||'prepared',
   mediaInfo:progress?.imagesTotal>0?
    String(progress.imagesUploaded||0)+'/'+progress.imagesTotal+' imagens na mídia · '+
    String(progress.imagesPublished||0)+' publicadas no anúncio':
    'Confirmação de cada etapa baseada na resposta da Shopee'};
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
  val('optimizerVisualCount',state.completed+' de 9 etapas confirmadas');
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
   const text=st==='done'?'Etapa verificada':st==='staged'?'Enviado à mídia, ainda não publicado':
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
