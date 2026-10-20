/* Rede Achados BR — fiscal em lote: apresentação e atalhos, sem writes Shopee. */
(()=>{
 'use strict';
 const q=id=>document.getElementById(id);
 const icon=(name)=>({ready:'✓',pending:'◷',verified:'✓',batch:'▣'})[name]||'•';
 const formatStatus=row=>String(row.status||row.state||(row.ready?'prepared':'blocked'));
 const hasCestIssue=row=>{
   const evidence=[row.issue?.code,row.error,row.message,...(row.publicationPending||[]),...(row.blocked||[])].filter(Boolean).join(' ');
   return row.issue?.code==='CEST_REQUIRED'||/\bCEST\b|corresponding CEST|substitui[cç][aã]o tribut[aá]ria/i.test(evidence);
 };
 const names={ncm:'NCM',origin:'Origem',same_state_cfop:'CFOP interno',
  diff_state_cfop:'CFOP externo',csosn:'CSOSN',measure_unit:'Unidade',cest:'CEST'};
 const make=(tag,cls,txt)=>{const el=document.createElement(tag);
  if(cls)el.className=cls;if(txt!==undefined)el.textContent=String(txt);return el;};
 const listSkus=()=>[...new Set(String(q('optimizerFiscalBatchSkus')?.value||'').split(/[\s,;]+/).map(x=>x.trim().toUpperCase()).filter(Boolean))].slice(0,12);
 function stats(rows){
  const total=rows.length||listSkus().length;
  const ready=rows.filter(x=>x.ready&&x.planId&&formatStatus(x)==='prepared').length;
  const confirmed=rows.filter(x=>formatStatus(x)==='verified').length;
  const pending=rows.filter(x=>!x.ready||!x.planId||['failed','uncertain','blocked','failed_preview','draft_only'].includes(formatStatus(x))).length;
  const values={optimizerFiscalBatchTotal:total,optimizerFiscalBatchReady:ready,
   optimizerFiscalBatchPending:pending,optimizerFiscalBatchVerified:confirmed};
  for(const [id,value] of Object.entries(values))if(q(id))q(id).textContent=String(value);
  const note=q('optimizerFiscalBatchSynopsis');
  if(note)note.textContent=rows.length
   ?'Lote processado · '+confirmed+' SKU(s) confirmada(s) · '+pending+' pendência(s).'
   :'Informe as SKUs e prepare uma prévia antes de executar.';
 }
 function focusCest(sku){
  const active=String(q('optimizerSku')?.value||'').trim().toUpperCase();
  if(active!==String(sku).toUpperCase()){
   const search=q('optimizerSku');
   if(search){search.value=sku;q('optimizerFind')?.click();search.scrollIntoView({behavior:'smooth',block:'center'});}
   const notice=q('optimizerFiscalBatchStatus');
   if(notice){notice.textContent='Buscando '+sku+'. Depois abra Informações fiscais e confira o CEST antes de salvar.';
    notice.dataset.state='info';}
   return;
  }
  const card=q('optimizerWorkflowPanel');
  if(card)card.hidden=false;
  if(typeof window.optimizerWorkflowOpen==='function')window.optimizerWorkflowOpen('fiscal');
  else q('optimizerWorkflowCards')?.querySelector('[data-stage="fiscal"]')?.click();
  const input=q('optimizerFiscalFields')?.querySelector('[data-tax-field="cest"]');
  const label=input?.closest('label');
  if(label)label.scrollIntoView({behavior:'smooth',block:'center'});
  if(input)input.focus({preventScroll:true});
 }
 function renderRow({row,card,chip,status,message}){
  if(!card||!row)return;
  const cest=hasCestIssue(row);
  const registered=Boolean(row.registered || row.ready);
  const label=cest?'Pendente de CEST':({
   prepared:'Prévia pronta',running:'Em execução',verified:'Confirmada pela Shopee',
   draft_only:'Salvo no Motor Matriz',blocked:'Revisar dados',failed:'Falha no envio',
   uncertain:'Confirmação pendente',failed_preview:'Revisar prévia'
  }[status]||status);
  chip.textContent=label;
  chip.classList.toggle('is-cest',cest);
  card.dataset.status=cest?'cest':status;
  // Mantemos a mensagem original em detalhes, não como bloco técnico na frente.
  const diagnostics=[];
  for(const child of [...card.children]){
   if(child.classList.contains('optimizer-fiscal-batch-item-head'))continue;
   diagnostics.push((child.textContent||'').trim());
   child.remove();
  }
  const fields={...row.current,...row.proposed};
  const grid=make('div','ra-fiscal-field-grid');
  for(const key of ['ncm','origin','same_state_cfop','diff_state_cfop','csosn','measure_unit']){
   const item=make('div','ra-fiscal-field');
   item.append(make('span','',names[key]),make('strong','',String(fields[key]||'—')));
   grid.append(item);
  }
  card.append(grid);
  if(cest){
   const alert=make('div','ra-fiscal-alert');
   const originalFailed=['failed','uncertain'].includes(status);
   alert.append(make('strong','','⚠ '+(originalFailed
     ?'A Shopee recusou ou não confirmou o envio fiscal por exigência de CEST.'
     :'A Shopee exige CEST para este NCM. A prévia fiscal não está apta para envio.')));
   alert.append(make('span','',registered
     ?'A ficha da SKU está cadastrada no Motor Matriz. Confira o CEST com o fornecedor ou a contabilidade.'
     :'Confira e salve a ficha fiscal desta SKU antes de gerar nova prévia.'));
   card.append(alert);
  }else if(message){
   const text=make('p','ra-fiscal-card-note',
    status==='verified'?'A Shopee confirmou a atualização fiscal.'
    :status==='prepared'?'Prévia preparada. O anúncio não foi alterado.'
    :status==='running'?'Execução autorizada. Aguarde a confirmação da Shopee.'
    :status==='draft_only'?'Cadastro fiscal salvo no Motor Matriz. Envio separado e opcional.'
    :status==='failed_preview'?'Não foi possível preparar a prévia. Confira os dados da SKU.'
    :status==='uncertain'?'Não reenvie antes de conferir a confirmação da Shopee.'
    :message);
   card.append(text);
  }
  const actions=make('div','ra-fiscal-item-actions');
  const edit=make('button','ra-fiscal-edit',cest?'Preencher CEST':'Revisar ficha fiscal');
  edit.type='button';edit.addEventListener('click',()=>focusCest(row.sku));
  const preview=make('button','secondary','Gerar nova prévia');
  preview.type='button';preview.addEventListener('click',()=>q('optimizerFiscalBatchPrepare')?.click());
  const more=make('details','ra-fiscal-details');
  const summary=make('summary','', 'Ver detalhes');
  const body=make('div','ra-fiscal-raw');
  const dedup=[...new Set(diagnostics.concat([message||'']).filter(Boolean))];
  for(const item of dedup)body.append(make('p','',item));
  if(fields.cest)body.append(make('p','','CEST cadastrado: '+fields.cest));
  if(!dedup.length&&!fields.cest)body.append(make('p','','Nenhum detalhe adicional informado.'));
  more.append(summary,body);
  actions.append(edit,preview,more);
  card.append(actions);
 }
 function sync(rows){stats(Array.isArray(rows)?rows:[]);}
 window.OptimizerFiscalPremium={renderRow,sync};
 q('optimizerFiscalBatchSkus')?.addEventListener('input',()=>sync([]));
})();
