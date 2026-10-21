/* Rede Achados BR: uma autorização, preparação automática e execução fiscal real. */
(function(){
'use strict';
const $=id=>document.getElementById(id);
const KEY='ra-fiscal-migration-run-v3';
let liveCensus=null;
let inventoryVerifiedThisSession=false;
let censusLoading=null;
function editableCount(){return Number(liveCensus?.statuses?.NORMAL??0)+Number(liveCensus?.statuses?.UNLIST??0);}
function updateCensusBadge(){
 const badge=$('optimizerFiscalBatch')?.querySelector('.optimizer-fiscal-batch-pill');
 if(badge)badge.textContent=liveCensus?'Contagem oficial da Shopee':'Contagem não verificada';
}
async function fetchCensus(){
 const result=await request('/api/shopee/optimizer/fiscal-migration/catalog-census');
 const totals=result.statuses||{};
 if(result.source!=='shopee-api-live'||result.unit!=='anuncios-pai-sem-contar-variacoes'||
    !['NORMAL','UNLIST','REVIEWING','BANNED'].every(status=>
      Number.isSafeInteger(totals[status])&&totals[status]>=0)||
    result.totalListings!==Object.values(totals).reduce((sum,n)=>sum+n,0))
   throw Error('Contagem oficial da Shopee não pôde ser validada.');
 liveCensus=result;updateCensusBadge();
 progress(read(),'Contagem oficial recebida; inventário de SKUs ainda não foi conferido.');
 return result;
}
async function ensureCensus(force=false){
 if(!force&&liveCensus)return liveCensus;
 if(censusLoading)return censusLoading;
 censusLoading=fetchCensus();
 try{return await censusLoading;}finally{censusLoading=null;}
}
const nap=ms=>new Promise(resolve=>setTimeout(resolve,ms));
const idOf=x=>String(x.itemId)+':'+String(x.modelId)+':'+String(x.sku);
const read=()=>{try{return JSON.parse(localStorage.getItem(KEY)||'null');}catch{return null;}};
function save(s){s.updatedAt=new Date().toISOString();localStorage.setItem(KEY,JSON.stringify(s));}
async function request(url,options={},retries=2){
 let last;
 for(let attempt=0;attempt<=retries;attempt++){
  try{
   const response=await fetch(url,{credentials:'same-origin',cache:'no-store',
    signal:AbortSignal.timeout(85000),...options});
   const type=response.headers.get('content-type')||'';
   if(!type.includes('application/json')){
    const error=Error('Servidor retornou HTTP '+response.status+' sem resposta JSON');
    error.retryable=response.status>=500||response.status===429;
    throw error;
   }
   const data=await response.json();
   if(!response.ok||!data.ok){
    const error=Error(data.error||'HTTP '+response.status);
    error.retryable=response.status>=500||response.status===429;
    throw error;
   }
   return data;
  }catch(e){
   last=e;
   if(e.retryable===false||attempt===retries)break;
   await nap(Math.min(1000*2**attempt,6000));
  }
 }
 throw last;
}
const post=(path,data,retries=2)=>request(path,{method:'POST',
 headers:{'Content-Type':'application/json'},body:JSON.stringify(data)},retries);
function panel(){
 let p=$('raFiscalRunProgress');
 if(p)return p;
 const button=$('optimizerFiscalMigrationRun');
 if(!button)return null;
 p=document.createElement('section');p.id='raFiscalRunProgress';p.className='ra-fiscal-progress';
 p.innerHTML='<div class="ra-fiscal-progress-head"><strong id="raFiscalRunPhase">Pronto para executar</strong><span id="raFiscalRunPercent">0%</span></div><div class="ra-fiscal-progress-track" role="progressbar" aria-label="Execução fiscal na Shopee" aria-valuemin="0" aria-valuemax="100" aria-valuenow="0"><div id="raFiscalRunFill"></div></div><p id="raFiscalRunCounts" aria-live="polite">Nenhuma atualização iniciada.</p><div id="raFiscalRunIssues" class="ra-fiscal-run-issues" aria-live="polite"></div>';
 button.insertAdjacentElement('afterend',p);return p;
}
function progress(state,phase='Pronto para executar',sku=''){
 const box=panel();if(!box)return;
 const items=state?.inventory||[],ids=new Set(items.map(idOf));
 const values=Object.entries(state?.done||{}).filter(([key])=>ids.has(key)).map(([,v])=>v);
 const verified=values.filter(v=>v==='verified').length;
 const alreadyCurrent=values.filter(v=>v==='already_current').length;
 const failed=values.filter(v=>v==='failed').length;
 const blocked=values.filter(v=>v==='blocked'||v==='uncertain').length;
 const trustworthy=Boolean(inventoryVerifiedThisSession&&state?.catalogValidatedAt);
 const total=trustworthy?items.length:0,processed=trustworthy?verified+alreadyCurrent+failed+blocked:0;
 const pct=total?Math.min(100,Math.round(100*processed/total)):0;
 $('raFiscalRunPhase').textContent=phase+(sku?' · SKU '+sku:'');
 $('raFiscalRunPercent').textContent=trustworthy?pct+'%':'—';
 $('raFiscalRunFill').style.width=trustworthy?pct+'%':'0%';
 box.querySelector('[role=progressbar]').setAttribute('aria-valuenow',String(trustworthy?pct:0));
 const official=liveCensus?
  'Shopee: '+liveCensus.totalListings+' anúncios (sem variações) · '+editableCount()+
  ' editáveis (ativos e inativos) · '+(liveCensus.totalListings-editableCount())+' em análise/bloqueados. ':
  'Contagem oficial da Shopee ainda não consultada. ';
 $('raFiscalRunCounts').textContent=official+(trustworthy?
  'SKUs editáveis identificadas '+total+' · Verificadas '+processed+'/'+total+
  ' · Enviadas e confirmadas '+verified+' · Já preenchidas '+alreadyCurrent+' · Pendentes '+blocked+' · Falhas '+failed:
  'Histórico antigo: '+items.length+' SKUs. Não representa o catálogo completo nem confirmação atual de envio.');
 const numbers={
  optimizerFiscalBatchTotal:liveCensus?liveCensus.totalListings:'—',
  optimizerFiscalBatchReady:liveCensus?editableCount():'—',
  optimizerFiscalBatchPending:liveCensus?liveCensus.totalListings-editableCount():'—',
  optimizerFiscalBatchVerified:trustworthy?verified+alreadyCurrent:'—'
 };
 for(const [key,value] of Object.entries(numbers))if($(key))$(key).textContent=String(value);
 const issues=$('raFiscalRunIssues');issues.replaceChildren();
 if(!trustworthy)return;
 const problem=Object.entries(state?.errors||{}).filter(([key])=>ids.has(key)&&
  ['failed','blocked','uncertain'].includes(state.done?.[key]));
 if(problem.length){
  const head=document.createElement('strong');
  head.textContent='Pendências reais ('+problem.length+')';issues.append(head);
  for(const [key,message] of problem.slice(0,8)){
   const line=document.createElement('p'),item=items.find(x=>idOf(x)===key);
   line.textContent=(item?.sku||'SKU')+' — '+message;issues.append(line);
  }
  if(problem.length>8){
   const more=document.createElement('small');
   more.textContent='Exibindo 8 de '+problem.length+' pendências; demais informações permanecem salvas.';
   issues.append(more);
  }
 }
}
function report(state,text,sku=''){
 const label=$('optimizerFiscalMigrationStatus');
 if(label){label.textContent=text;label.dataset.liveRun='true';}
 progress(state,text,sku);
}
function mark(state,item,value,message=''){
 const id=idOf(item);
 state.done[id]=value;
 state.errors=state.errors||{};
 if(message)state.errors[id]=message;
 else delete state.errors[id];
 if(state.pending===id)state.pending=null;
 save(state);
}
async function jobStatus(item){
 const params=new URLSearchParams({items:JSON.stringify([{
  sku:item.sku,itemId:item.itemId,modelId:item.modelId}])});
 const data=await request('/api/shopee/optimizer/batch/fiscal/status?'+params);
 return (data.results||[]).find(x=>x.sku===item.sku);
}
async function awaitConfirmation(state,item){
 // O servidor executa de forma durável e a consulta é somente leitura.
 // Nunca repetir update_item após resposta perdida/erro 502.
 for(let n=0;n<32;n++){
  const result=await jobStatus(item);
  if(result?.status==='verified'||result?.status==='failed'){
   mark(state,item,result.status,result.status==='failed'?result.message:'');
   return result.status;
  }
  if(result?.status==='uncertain'||result?.status==='not_found'||result?.status==='blocked'){
   mark(state,item,'uncertain','Envio sem confirmação conclusiva ('+result.status+'). Conferir a Shopee antes de reenviar.');
   return 'uncertain';
  }
  if(result?.status==='prepared'){
   // Preparado NÃO significa enviado; um 502 pode ter ocorrido antes da autorização.
   mark(state,item,'uncertain','Servidor não confirmou o início do envio. Nenhum reenvio automático será feito.');
   return 'uncertain';
  }
  report(state,'Aguardando confirmação da Shopee',item.sku);
  await nap(3500);
 }
 mark(state,item,'uncertain','A Shopee ainda não confirmou a atualização. Nenhum reenvio automático será feito.');
 return 'uncertain';
}
let busy=false;
async function run(){
 if(busy)return;
 busy=true;
 const button=$('optimizerFiscalMigrationRun');
 if(button){button.disabled=true;button.textContent='⏳ Executando informações fiscais na Shopee...';}
 let state=read()||{done:{},errors:{},inventory:[],pending:null};
 state.done=state.done||{};state.errors=state.errors||{};
 state.active=true;save(state);
 try{
  // Nenhuma escrita começa sem uma contagem atual e íntegra da API da Shopee.
  const census=await ensureCensus(true);
  inventoryVerifiedThisSession=false;
  let all=[],scannedParents=0;
  const uniqueParents=new Set();
  for(const status of ['NORMAL','UNLIST']){
   let offset=0,finished=false;let checkedStatus=0;
   for(let page=0;page<200;page++){
   report(state,'Consultando anúncios '+status+' na Shopee · '+all.length+' SKUs encontradas');
   const data=await request('/api/shopee/optimizer/fiscal-migration/active-skus?fast=1&status='+status+'&offset='+offset);
   if(!Array.isArray(data.items)||!Array.isArray(data.pageItemIds)||
      !Number.isSafeInteger(data.pageItemCount)||data.pageItemCount!==data.pageItemIds.length)
     throw Error('Shopee retornou uma página de anúncios incompleta.');
   if(data.status!==status||!Number.isSafeInteger(data.totalCount)||data.totalCount!==census.statuses[status])
     throw Error('A quantidade de anúncios ativos mudou durante a conferência; nenhuma escrita foi autorizada.');
   for(const itemId of data.pageItemIds){
    if(uniqueParents.has(itemId))
     throw Error('A Shopee retornou o mesmo anúncio em mais de uma página. Refazer a conferência.');
    uniqueParents.add(itemId);
   }
   scannedParents+=data.pageItemCount;checkedStatus+=data.pageItemCount;
   all.push(...data.items);
   if(!data.hasNext){finished=true;break;}
   if(!Number.isSafeInteger(data.nextOffset)||data.nextOffset<=offset)
    throw Error('A paginação Shopee não avançou; inventário anterior preservado.');
   offset=data.nextOffset;
  }
   if(!finished||checkedStatus!==census.statuses[status])
    throw Error('Consulta '+status+' incompleta: '+checkedStatus+' de '+census.statuses[status]+'. Nenhum envio será iniciado.');
  }
  if(scannedParents!==editableCount()||uniqueParents.size!==editableCount())
   throw Error('Consulta incompleta: '+scannedParents+' de '+editableCount()+' anúncios editáveis. Nenhum envio será iniciado.');
  all=[...new Map(all.filter(x=>x.sku).map(x=>[idOf(x),x])).values()];
  if(!all.length)throw Error('Nenhuma SKU ativa identificada; não há envio permitido.');
  // O histórico local é somente memória de trabalho. Conferir estados anteriores no servidor.
  for(const item of all){
   const key=idOf(item);
   if(state.done[key]==='already_current'){
    // Sem job de envio persistido, reconfirmar a informação na API em cada nova execução.
    delete state.done[key];
   }
   if(state.done[key]==='verified'){
    const last=await jobStatus(item);
    if(last?.status!=='verified'){delete state.done[key];delete state.errors[key];}
   }
  }
  state.inventory=all;
  state.inventoryComplete=true;
  state.catalogValidatedAt=new Date().toISOString();
  state.parentCount=scannedParents;
  state.census=census.statuses;
  save(state);
  inventoryVerifiedThisSession=true;
  report(state,'Conferidos anúncios ativos e inativos editáveis. Em análise/bloqueados foram contabilizados e não serão alterados.');

  if(state.pending){
   const item=all.find(x=>idOf(x)===state.pending);
   if(!item)throw Error('Envio anterior não localizado no catálogo atual. Nenhum reenvio automático.');
   report(state,'Recuperando envio anterior sem duplicar',item.sku);
   await awaitConfirmation(state,item);
  }
  for(let i=0;i<all.length;i++){
   const item=all[i],key=idOf(item);
   if(state.done[key]==='verified'||state.done[key]==='uncertain')continue;
   report(state,'SKU '+(i+1)+'/'+all.length+' · Preparando dados fiscais',item.sku);
   try{
    // Uma única chamada: o backend aproveita os dados já salvos, preenche
    // somente os campos fiscais ausentes, valida a fonte e agenda o envio.
    // Checkpoint antes do POST: nunca duplicar uma escrita após erro HTTP.
    state.pending=key;save(state);
    let response=null;
    try{
     response=await post('/api/shopee/optimizer/fiscal-migration/execute-one',{
      confirmation:'EXECUTAR FISCAL SKU',
      sku:item.sku,itemId:item.itemId,modelId:item.modelId
     },0); // Sem retry de POST que pode publicar tax_info.
    }catch(error){
     report(state,'Resposta do servidor indisponível; verificando envio sem repetir chamada.',item.sku);
     // Uma falha HTTP não comprova que a operação chegou à Shopee.
     // jobStatus realiza somente leitura e não pode reexecutar o update.
     const result=await awaitConfirmation(state,item);
     report(state,result==='verified'?'Confirmação recebida da Shopee':
       'Operação sem confirmação; SKU preservada para revisão',item.sku);
     continue;
    }
    if(response.status==='already_current'){
     mark(state,item,'already_current');
     report(state,'Dados fiscais já cadastrados na Shopee; nenhuma atualização necessária.',item.sku);
     continue;
    }
    if(response.status==='blocked'||response.status==='failed'){
     mark(state,item,'blocked',response.message||'Dados fiscais exigem revisão específica.');
     continue;
    }
    if(response.status==='uncertain'){
     mark(state,item,'uncertain',response.message||'Envio anterior sem confirmação.');
     continue;
    }
    if(response.status!=='running'){
     mark(state,item,'uncertain','Resposta de execução desconhecida. Nenhum reenvio automático.');
     continue;
    }
    const result=await awaitConfirmation(state,item);
    report(state,result==='verified'?'Confirmação recebida da Shopee':'SKU com pendência; avançando para a próxima',item.sku);
   }catch(error){
    if(state.pending===key){
     // Incerteza após POST: não repetir a escrita.
     mark(state,item,'uncertain','Falha na consulta após o envio: '+String(error.message||error));
    }else mark(state,item,'blocked',String(error.message||error));
    report(state,'Pendência na SKU, continuando o restante do catálogo',item.sku);
   }
  }
  state.active=false;save(state);
  report(state,'Passagem concluída para anúncios ativos e inativos editáveis. Somente as SKUs confirmadas pela Shopee são consideradas atualizadas.');
 }catch(error){
  state.active=false;save(state);
  report(state,'Execução pausada: '+String(error.message||error)+'. Progresso preservado; use o mesmo botão para retomar.');
 }finally{
  busy=false;
  if(button){button.disabled=false;button.textContent='▶ Executar informações fiscais na Shopee';}
 }
}
$('optimizerFiscalMigrationRun')?.addEventListener('click',()=>void run());
const previous=read();
panel();updateCensusBadge();
progress(previous,previous?.inventory?.length?
 'Histórico parcial encontrado; verificando catálogo oficial':'Conferindo catálogo oficial da Shopee');
// Abertura é SOMENTE leitura, sem executar alterações fiscais.
let censusRetries=0;
async function loadReadOnlyCensus(){
 try{
  await ensureCensus(true);
  const state=read();
  report(state,'Contagem de anúncios conferida na Shopee. Para atualizar dados fiscais, execute a ação única.');
 }catch(error){
  if(($('app')?.classList.contains('hidden')||$('login')?.classList.contains('hidden')===false)&&censusRetries++<12){
   setTimeout(()=>void loadReadOnlyCensus(),2500);return;
  }
  report(read(),'Não foi possível consultar a contagem oficial: '+String(error.message||error)+
   '. Os 38 registros antigos, se existentes, NÃO são o total da loja.');
 }
}
void loadReadOnlyCensus();
})();