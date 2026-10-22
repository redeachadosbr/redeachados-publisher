/* Compact Shopee SKU workspace. Visual-only adapter; marketplace writes remain
   exclusively in the existing reviewed execute endpoint and buttons. */
(()=>{
 'use strict';
 const q=id=>document.getElementById(id);
 const set=(id,value)=>{const n=q(id);if(n)n.textContent=String(value??'—');};
 const make=(tag,cls,value)=>{
  const n=document.createElement(tag);if(cls)n.className=cls;
  if(value!==undefined)n.textContent=String(value);return n;
 };
 let workflow=null,progress=null,job=null,api=null;
 function render(){
  const root=q('optimizerSkuDashboard');
  if(!root)return;
  if(!workflow?.sku){root.hidden=true;return;}
  const w=workflow,s=w.supplierProduct||null,stages=(w.stages||[]).filter(x=>x.key!=='final');
  const eligible=stages.filter(x=>!x.skipped),done=eligible.filter(x=>x.reviewed).length;
  const next=eligible.find(x=>!x.reviewed);
  root.hidden=false;
  set('optimizerDashSku',w.sku);
  set('optimizerDashTitle',w.productTitle||s?.name||'Anúncio Shopee');
  set('optimizerDashMeta','SKU '+w.sku+' · Item '+w.itemId+
   (String(w.modelId||'0')!=='0'?' · Variação '+w.modelId:'')+
   (s?.brand?' · Marca '+s.brand:''));
  set('optimizerDashSupplierTag',s?'✓ WeDrop vinculada':'WeDrop sem vínculo confirmado');
  set('optimizerDashCatalogTag','Shopee · Item '+w.itemId);
  const pic=q('optimizerDashImage'),placeholder=q('optimizerDashImageFallback');
  const src=(w.imageUrls||[]).find(x=>typeof x==='string'&&/^https:\/\//i.test(x));
  if(src){
   pic.hidden=false;placeholder.hidden=true;
   if(pic.getAttribute('src')!==src){
    pic.onload=()=>{pic.hidden=false;placeholder.hidden=true};
    pic.onerror=()=>{pic.hidden=true;placeholder.hidden=false};
    pic.src=src;
   }
  }else{pic.hidden=true;placeholder.hidden=false;pic.removeAttribute('src');}
  const count=Number(w.imageCount),valid=Number.isInteger(count)&&count>=0;
  if(progress?.hasStarted&&progress.imagesTotal){
   set('optimizerDashImages',progress.imagesUploaded+' / '+progress.imagesTotal);
   q('optimizerDashImageFill').style.width=Math.round(progress.imagesUploaded/progress.imagesTotal*100)+'%';
   set('optimizerDashImageCaption',progress.verified?
    'Imagens desta execução confirmadas no anúncio':
    progress.imagesUploaded+' na mídia; '+progress.imagesPublished+' publicadas');
  }else{
   set('optimizerDashImages',valid?count+' / 9':'— / 9');
   q('optimizerDashImageFill').style.width=valid?Math.min(100,Math.round(count/9*100))+'%':'0%';
   set('optimizerDashImageCaption','Imagens atuais na Shopee · não representam imagens geradas');
  }
  set('optimizerDashReviewed',done+' / '+eligible.length);
  q('optimizerDashStageFill').style.width=eligible.length?Math.round(done/eligible.length*100)+'%':'0%';
  set('optimizerDashStageCaption','Revisões salvas no Motor Matriz, não publicação');
  set('optimizerDashNextTitle',next?next.name:'Todas as revisões conferidas');
  set('optimizerDashNextHelp',next?(next.hint||'Abra a próxima etapa para conferir.').slice(0,115):
   'Abra a prévia e acompanhe a execução quando desejar.');
  set('optimizerDashContinue',next?'Continuar etapa →':'Abrir prévia →');
  const current=q('optimizerDashStatus');
  const messages={running:['Em andamento','running'],verified:['Confirmado na Shopee','verified'],
   failed:['Execução interrompida','attention'],uncertain:['Conferência pendente','attention'],
   prepared:['Prévia preparada','prepared'],blocked:['Há pendências','attention']};
  const status=messages[job?.state]||(next?['Em revisão','prepared']:['Etapas conferidas','verified']);
  current.textContent=status[0];current.dataset.state=status[1];
  const rail=q('optimizerDashStageRail');rail.replaceChildren();
  stages.forEach((stage,index)=>{
   const btn=make('button','optimizer-sku-dash-stage');btn.type='button';
   btn.dataset.state=stage.skipped?'skipped':stage.reviewed?'done':stage.blocking?'attention':'pending';
   btn.append(make('span','optimizer-sku-dash-stage-bullet',stage.reviewed?'✓':index+1),
    make('strong','',stage.name),make('small','',stage.skipped?'Não se aplica':stage.reviewed?'Conferido':'Pendente'));
   btn.addEventListener('click',()=>api?.openStage(stage.key));
   rail.append(btn);
  });
  const facts=q('optimizerDashFacts');facts.replaceChildren();
  const add=(name,value,note)=>{
   if(value===null||value===undefined||String(value).trim()==='')return;
   const tile=make('div','optimizer-sku-dash-fact');
   tile.append(make('small','',name),make('strong','',value));
   if(note)tile.append(make('small','',note));
   facts.append(tile);
  };
  const metrics=w.sourceFacts?.metrics||[];
  const dimension=metrics.find(x=>/dimensões do produto/i.test(x.name||''));
  const capacity=metrics.find(x=>/capacidade/i.test(x.name||''));
  if(dimension)add('Dimensões do produto · conferir',dimension.value);
  if(capacity)add('Capacidade comprovada',capacity.value);
  if(s?.brand)add('Marca WeDrop',s.brand);
  const material=(w.attributes||[]).find(x=>/material/i.test(x.name||''));
  const actualMaterial=(material?.values||[]).map(x=>x.name).filter(Boolean).join(', ');
  if(actualMaterial)add('Material na Shopee',actualMaterial);
  const m=s?.catalogMeasurements;
  if(m?.heightCm&&m?.widthCm&&m?.lengthCm)
   add('Medidas da planilha · logística',m.heightCm+' × '+m.widthCm+' × '+m.lengthCm+' cm',
    'Não confundir com produto montado');
  if(s?.name)add('Produto no catálogo WeDrop',s.name);
  if(!facts.children.length)facts.append(make('p','','Sem dados adicionais comprovados. Consulte a WeDrop.'));
  set('optimizerDashFactsNote',w.sourceEvidenceWarning||
   'Informações do produto são separadas dos dados de transporte/embalagem.');
  const technical=stages.find(x=>x.key==='technical'),fiscal=stages.find(x=>x.key==='fiscal');
  const t=q('optimizerDashTechnicalStatus');
  t.textContent=technical?.reviewed?'Conferida':'A revisar';t.dataset.state=technical?.reviewed?'verified':'pending';
  set('optimizerDashTechnicalTitle',w.productTitle||'Anúncio Shopee');
  set('optimizerDashTechnicalDetails',(w.attributes||[]).length+
   ' atributos da categoria'+(w.categoryId?' '+w.categoryId:'')+
   '. '+(w.technicalWarning||'Confira dados do fabricante e opções oficiais.'));
  const f=q('optimizerDashFiscalStatus');
  f.textContent=fiscal?.reviewed?'Salvo no Motor Matriz':'A conferir';f.dataset.state=fiscal?.reviewed?'verified':'pending';
  const chips=q('optimizerDashFiscalChips');chips.replaceChildren();
  const tax={...(w.taxCurrent||{}),...(w.taxSuggestion||{}),...(w.taxDraft||{})};
  const labels={ncm:'NCM',origin:'Origem',same_state_cfop:'CFOP interno',
   diff_state_cfop:'CFOP externo',csosn:'CSOSN',measure_unit:'Unidade'};
  Object.entries(labels).forEach(([key,label])=>{
   const value=String(tax[key]??'').trim();
   if(value)chips.append(make('span','optimizer-sku-dash-tax-chip',label+' '+value));
  });
  if(!chips.children.length)chips.append(make('small','','Sem dados fiscais confirmados para exibir.'));
  set('optimizerDashPendingState',(eligible.length-done)+' revisões abertas');
  set('optimizerDashChangesState',job?.state==='verified'?'Alterações confirmadas na Shopee':
   'Revisar campos da prévia antes de executar');
  set('optimizerDashAuditState',(w.attributes||[]).length+' atributos na categoria · Item '+w.itemId);
  set('optimizerDashExecutionNotice',progress?.hasStarted?
   progress.message+' · Envio de mídia não é confirmação de publicação.':
   'Dados salvos no Motor Matriz não significam publicação na Shopee. Confira a resposta da API.');
 }
 const reveal=(id)=>q(id)?.scrollIntoView?.({behavior:'smooth',block:'start'});
 const openStage=key=>{api?.openStage?.(key);reveal('optimizerWorkflowEditor');};
 const bind=()=>{
  const handle={
   optimizerDashBack:()=>{reveal('optimizerSku');q('optimizerSku')?.focus()},
   optimizerDashSourceOpen:()=>{const details=q('optimizerSourceCompact');if(details)details.open=true;reveal('optimizerSourceCompact');q('optimizerSourceText')?.focus({preventScroll:true});},
   optimizerDashAllStages:()=>reveal('optimizerWorkflowPanel'),
   optimizerDashContinue:()=>{
    const stages=(workflow?.stages||[]).filter(x=>x.key!=='final'&&!x.skipped&&!x.reviewed);
    if(stages.length)openStage(stages[0].key);
    else{api?.openExecution?.();reveal('optimizerExecutionPanel');}
   },
   optimizerDashTechnicalOpen:()=>openStage('technical'),
   optimizerDashFiscalOpen:()=>openStage('fiscal'),
   optimizerDashFiscalBatchOpen:()=>{api?.openExecution?.();const a=q('optimizerFiscalBatch');if(a)a.open=true;reveal('optimizerFiscalBatch');},
   optimizerDashConnection:()=>{api?.openExecution?.();const a=q('optimizerConnectionTools');if(a)a.open=true;reveal('optimizerConnectionTools');q('optimizerConnectionCheck')?.click()},
   optimizerDashChanges:()=>{api?.openExecution?.();const a=q('optimizerExecutionSummary')?.querySelector('.optimizer-exec-review');if(a)a.open=true;reveal('optimizerExecutionPanel')},
   optimizerDashPending:()=>reveal('optimizerWorkflowCards'),
   optimizerDashAudit:()=>{const a=q('optimizerAuditPanel');if(a)a.hidden=false;reveal('optimizerAuditPanel')}
  };
  for(const [id,action] of Object.entries(handle))q(id)?.addEventListener('click',action);
 };
 window.OptimizerSkuDashboard={
  bind(callbacks){api=callbacks;bind()},
  workflow(data){workflow=data;render()},
  execution(p,j){progress=p||null;job=j||null;render()},
  reset(){workflow=null;progress=null;job=null;render()}
 };
})();
