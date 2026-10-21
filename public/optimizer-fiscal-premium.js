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
  if(note)note.textContent=!rows.length
   ?'Informe as SKUs e prepare uma prévia antes de executar.'
   :rows.some(x=>formatStatus(x)==='running')?'Envio à Shopee em andamento · aguarde a confirmação.'
   :ready?'Prévia pronta para '+ready+' SKU(s). Clique em “2 · Executar aprovadas” para enviar.'
   :confirmed?'Confirmadas na Shopee: '+confirmed+' · pendências: '+pending
   :'Nenhum envio confirmado. Revise as pendências e gere nova prévia.';
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
  names.cest='CEST';
  const grid=make('div','ra-fiscal-field-grid');
  for(const key of ['ncm','origin','same_state_cfop','diff_state_cfop','csosn','measure_unit','cest']){
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
  if(fields.cest)body.append(make('p','',fields.cest==='00'?'CEST 00: envio literal sujeito à validação da Shopee.':'CEST cadastrado: '+fields.cest));
  if(!dedup.length&&!fields.cest)body.append(make('p','','Nenhum detalhe adicional informado.'));
  more.append(summary,body);
  actions.append(edit,preview,more);
  card.append(actions);
 }
 function sync(rows){stats(Array.isArray(rows)?rows:[]);}
 window.OptimizerFiscalPremium={renderRow,sync};
 // Migração CPF -> CNPJ: inventário de todas as páginas, somente leitura.
 // Nunca iniciar envio nem marcar revisão como feita pela consulta.
 q('optimizerFiscalMigrationDiscover')?.addEventListener('click',async()=>{
   const button=q('optimizerFiscalMigrationDiscover');
   const notice=q('optimizerFiscalMigrationStatus');
   button.disabled=true;
   const rows=[];let offset=0,pages=0;
   try{
     while(pages<200){
       if(notice)notice.textContent='Consultando anúncios ativos: '+rows.length+' SKU(s) localizadas…';
       const response=await fetch('/api/shopee/optimizer/fiscal-migration/active-skus?offset='+offset,
         {credentials:'same-origin',cache:'no-store'});
       const data=await response.json();
       if(!response.ok||!data.ok)throw Error(data.error||'Erro ao consultar anúncios.');
       rows.push(...(data.items||[]));pages++;
       if(!data.hasNext)break;
       if(!Number.isInteger(data.nextOffset)||data.nextOffset<=offset)
         throw Error('A paginação da Shopee não avançou.');
       offset=data.nextOffset;
     }
     if(pages>=200)throw Error('Limite de páginas atingido. Revise o catálogo.');
     const unique=new Map(rows.filter(x=>x.sku).map(x=>[x.itemId+':'+x.modelId,x]));
     const items=[...unique.values()];
     const reviewed=items.filter(x=>x.reviewed);
     const missing=items.length-reviewed.length;
     if(notice)notice.textContent='Anúncios ativos localizados: '+items.length+
       ' SKU(s). Fichas fiscais revisadas: '+reviewed.length+
       '. Pendentes de revisão: '+missing+
       '. Nenhuma informação fiscal foi enviada.';
     // Pré-seleção somente de fichas já revisadas; mantém o limite seguro de 12.
     if(reviewed.length){
       const input=q('optimizerFiscalBatchSkus');
       if(input){input.value=reviewed.slice(0,12).map(x=>x.sku).join('\n');
         input.dispatchEvent(new Event('input',{bubbles:true}));}
     }
     window.optimizerFiscalMigrationInventory=items;
     const prepareButton=q('optimizerFiscalMigrationPrepare');
     if(prepareButton)prepareButton.disabled=!items.some(x=>!x.reviewed);
   }catch(error){
     if(notice)notice.textContent='Consulta incompleta: '+String(error.message||error)+
       '. Nenhum dado foi enviado à Shopee.';
   }finally{button.disabled=false;}
 });
 const fiscalMigrationProgressKey='ra-shopee-fiscal-migration-v2';
 async function migrationDraftRequest(items){
   let lastError;
   for(let attempt=1;attempt<=4;attempt++){
     try{
       const response=await fetch('/api/shopee/optimizer/fiscal-migration/prepare-drafts',{
         method:'POST',credentials:'same-origin',cache:'no-store',
         headers:{'Content-Type':'application/json','Accept':'application/json'},
         body:JSON.stringify({items}),signal:AbortSignal.timeout(110000)});
       const type=response.headers.get('content-type')||'';
       if(!type.includes('application/json')){
         const error=new Error('Servidor retornou HTML ou outra resposta inesperada (HTTP '+response.status+').');
         error.retryable=[408,429,500,502,503,504].includes(response.status)||response.ok;
         throw error;
       }
       const data=await response.json();
       if(!response.ok||!data.ok){
         const error=new Error(data.error||'Falha ao preparar fichas (HTTP '+response.status+').');
         error.retryable=[408,429,500,502,503,504].includes(response.status);
         throw error;
       }
       if(!Array.isArray(data.results)||data.results.length!==items.length)
         throw Error('Resposta incompleta: lote não foi confirmado.');
       return data.results;
     }catch(error){
       lastError=error;
       if(error.retryable===false||attempt===4)break;
       await new Promise(resolve=>setTimeout(resolve,Math.min(1000*2**(attempt-1),8000)));
     }
   }
   throw lastError;
 }
 q('optimizerFiscalMigrationPrepare')?.addEventListener('click',async()=>{
   const button=q('optimizerFiscalMigrationPrepare');
   const notice=q('optimizerFiscalMigrationStatus');
   const rows=(window.optimizerFiscalMigrationInventory||[]).filter(x=>!x.reviewed);
   if(!rows.length){if(notice)notice.textContent='Nenhuma ficha pendente localizada. Localize os anúncios ativos novamente.';return;}
   button.disabled=true;
   const results=[];
   const identity=rows.map(x=>x.itemId+':'+x.modelId+':'+x.sku).join('|');
   let start=0;
   try{
     const saved=JSON.parse(sessionStorage.getItem(fiscalMigrationProgressKey)||'null');
     if(saved?.identity===identity&&Number.isSafeInteger(saved.next)&&saved.next>0&&saved.next<rows.length){
       start=saved.next;
       if(notice)notice.textContent='Retomando preparação da SKU '+(start+1)+' de '+rows.length+'. Lotes anteriores já foram processados.';
     }
   }catch{}
   try{
     for(let i=start;i<rows.length;i+=12){
       if(notice)notice.textContent='Preparando fichas fiscais: '+Math.min(i+12,rows.length)+'/'+rows.length+
         ' · envio à Shopee desativado.';
       const batch=await migrationDraftRequest(rows.slice(i,i+12));
       results.push(...batch);
       try{sessionStorage.setItem(fiscalMigrationProgressKey,JSON.stringify({
         identity,next:Math.min(i+12,rows.length)}));}catch{}
     }
     const saved=results.filter(x=>x.status==='draft_saved').length;
     const pending=results.filter(x=>x.status==='pending').length;
     if(notice)notice.textContent='Preparação concluída: '+saved+' novos rascunhos salvos, '+pending+
       ' pendências nesta execução. Fichas anteriores preservadas. Ainda exige revisão fiscal; nenhum envio à Shopee.';
     try{sessionStorage.removeItem(fiscalMigrationProgressKey);}catch{}
     window.optimizerFiscalMigrationDraftResults=results;
   }catch(error){
     if(notice)notice.textContent='Preparação pausada: '+String(error.message||error)+
       '. '+results.length+' SKUs processadas nesta tentativa. Clique novamente para retomar sem reiniciar os lotes concluídos.';
   }finally{button.disabled=false;}
 });
 q('optimizerFiscalBatchSkus')?.addEventListener('input',()=>sync([]));
 if(typeof window.optimizerFiscalBatchRender==='function')window.optimizerFiscalBatchRender();
})();
