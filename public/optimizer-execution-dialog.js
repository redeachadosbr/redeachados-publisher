/* Rede Achados BR — somente apresentação, nunca faz POST Shopee diretamente. */
(function(root){
 'use strict';
 const doc=document,byId=id=>doc.getElementById(id);
 let visible=false,dismissed=false,popup=null,overlay=null,action=null,label=null;
 const open=()=>{
  if(!popup)return;
  dismissed=false;visible=true;
  popup.hidden=false;overlay.hidden=false;
  doc.body.classList.add('ra-exec-dialog-open');
  if(byId('optimizerExecutionPanel'))byId('optimizerExecutionPanel').hidden=false;
  const b=byId('raExecutionDialogClose');b?.focus({preventScroll:true});
  refresh();
 };
 const close=()=>{
  if(!popup)return;
  visible=false;dismissed=true;popup.hidden=true;overlay.hidden=true;
  doc.body.classList.remove('ra-exec-dialog-open');
  byId('optimizerShowExecution')?.focus({preventScroll:true});
 };
 const refresh=(state=null)=>{
  if(!action)return;
  const data=state||root.RAExecutionCurrentStatus?.()||{};
  const phase=data.state||'prepared';
  const busy=Boolean(data.busy);
  action.disabled=busy||phase==='running'||phase==='verified';
  action.textContent=busy?'◷ Conferindo Shopee e preparando pendências…':
   phase==='running'?'◷ Execução em andamento — acompanhando Shopee':
   phase==='verified'?'✓ Etapas deste envio confirmadas':
   phase==='uncertain'?'↻ Conferir resultado e continuar':
   phase==='failed'?'▶ Retomar apenas as pendências':
   '▶ EXECUTAR NA SHOPEE';
  if(label){
   const notice=byId('optimizerExecutionStatus');
   const warning=notice&&['error','warning'].includes(notice.dataset.state)?
    String(notice.textContent||'').slice(0,250):'';
   const q=data.quote||null;
   const money=n=>Number.isFinite(n)?n.toLocaleString('pt-BR',{style:'currency',currency:'BRL'}):'—';
   const price=q&&Number.isFinite(q.gross)&&Number.isFinite(q.promo)?
    'Preço bruto '+money(q.gross)+' · Promocional '+money(q.promo)+
    (Number.isFinite(q.margin)?' · Margem '+q.margin.toFixed(1)+'%':''):'';
   const hint=phase==='uncertain'?
    'Consulta primeiro a tentativa anterior, sem repetir envios.':
    phase==='failed'?'Preserva as etapas já publicadas.':
    phase==='verified'?'Somente as etapas deste envio foram confirmadas.':
    'Acompanhe as confirmações reais da Shopee.';
   label.textContent=(warning||hint)+(price?'  |  '+price:'');
  }
 };
 const init=()=>{
  const panel=byId('optimizerExecutionPanel');
  if(!panel||byId('raExecutionDialogRoot'))return;
  overlay=doc.createElement('div');overlay.id='raExecutionDialogBackdrop';overlay.hidden=true;
  popup=doc.createElement('section');popup.id='raExecutionDialogRoot';popup.hidden=true;
  popup.setAttribute('role','dialog');popup.setAttribute('aria-modal','true');popup.setAttribute('aria-label','Execução Shopee');
  const header=doc.createElement('header');header.className='ra-exec-dialog-header';
  const title=doc.createElement('div');title.innerHTML='<h2>⚙ Execução na Shopee</h2><p>Acompanhe cada etapa real. Fechar a janela não interrompe o servidor.</p>';
  const exit=doc.createElement('button');exit.id='raExecutionDialogClose';exit.type='button';exit.textContent='✕ Fechar';
  exit.addEventListener('click',close);header.append(title,exit);
  const footer=doc.createElement('footer');footer.className='ra-exec-dialog-footer';
  label=doc.createElement('p');label.id='raExecutionDialogHint';
  action=doc.createElement('button');action.type='button';action.id='raExecutionDialogRun';
  action.addEventListener('click',()=>{
   if(action.disabled)return;
   const run=root.RAExecutionPrimaryAction;
   if(typeof run!=='function')return;
   action.disabled=true;action.textContent='◷ Conferindo Shopee…';
   Promise.resolve(run()).catch(err=>{label.textContent='Falha: '+String(err?.message||err);})
    .finally(()=>refresh());
  });
  footer.append(label,action);popup.append(header,panel,footer);
  doc.body.append(overlay,popup);
  overlay.addEventListener('click',close);
  byId('optimizerShowExecution')?.addEventListener('click',()=>{
   if(byId('optimizerWorkflowPanel')?.hidden)return;
   open();
  });
  doc.addEventListener('keydown',event=>{
   if(!visible)return;
   if(event.key==='Escape'){event.preventDefault();close();}
   if(event.key==='Tab'){
    const buttons=[byId('raExecutionDialogClose'),action].filter(x=>x&&!x.disabled);
    if(!buttons.length)return;
    if(event.shiftKey&&doc.activeElement===buttons[0]){event.preventDefault();buttons.at(-1).focus();}
    else if(!event.shiftKey&&doc.activeElement===buttons.at(-1)){event.preventDefault();buttons[0].focus();}
   }
  });
  refresh();
 };
 root.RAExecutionDialog={
  open,close,refresh,
  setActive(active){
   if(!popup)return;
   if(!active){if(visible)close();return;}
   if(!dismissed)open();
  }
 };
 if(doc.readyState==='loading')doc.addEventListener('DOMContentLoaded',init,{once:true});else init();
})(globalThis);
