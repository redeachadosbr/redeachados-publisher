/* Shopee Manager v1.20.12 — reordena somente elementos existentes. */
(()=>{
 'use strict';
 const page=document.querySelector('#tab-optimizer .optimizer-v15-page');
 const columns=page?.querySelector('.optimizer-v15-columns');
 const workflow=document.getElementById('optimizerWorkflowPanel');
 const source=document.getElementById('optimizerSourcePanel');
 if(!page||!columns||!workflow||!source)return;
 // Revisão logo abaixo do bloco de busca/precificação, sem reconstruir componentes.
 columns.insertAdjacentElement('afterend',workflow);
 // Entrada WeDrop única e recolhida, preservando upload, texto e salvamento por SKU.
 if(!document.getElementById('optimizerSourceCompact')){
  const compact=document.createElement('details');
  compact.id='optimizerSourceCompact';compact.className='optimizer-panel optimizer-source-compact';
  const summary=document.createElement('summary');summary.className='optimizer-source-compact-summary';
  const name=document.createElement('strong');name.textContent='Informações da WeDrop';
  const hint=document.createElement('span');hint.textContent='Adicionar texto ou prints';
  hint.className='optimizer-source-compact-hint';
  const chevron=document.createElement('span');chevron.className='optimizer-source-compact-chevron';
  chevron.setAttribute('aria-hidden','true');chevron.textContent='⌄';
  summary.append(name,hint,chevron);compact.append(summary);
  const empty=document.createElement('p');
  empty.id='optimizerSourceCompactEmpty';
  empty.textContent='Localize uma SKU para adicionar texto ou prints da WeDrop.';
  compact.append(empty);
  workflow.insertAdjacentElement('afterend',compact);
  compact.append(source);
 }
})();