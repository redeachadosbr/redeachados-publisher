/* Rede Achados BR: uma autorização, preparação automática e execução fiscal real. */
(function(){
'use strict';
const $=id=>document.getElementById(id);
const KEY='ra-fiscal-migration-run-v3';
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
 const done=values.filter(v=>v==='verified').length;
 const failed=values.filter(v=>v==='failed').length;
 const blocked=values.filter(v=>v==='blocked'||v==='uncertain').length;
 const total=items.length,processed=done+failed+blocked;
 const pct=total?Math.min(100,Math.round(100*processed/total)):0;
 $('raFiscalRunPhase').textContent=phase+(sku?' · SKU '+sku:'');
 $('raFiscalRunPercent').textContent=pct+'%';
 $('raFiscalRunFill').style.width=pct+'%';
 box.querySelector('[role=progressbar]').setAttribute('aria-valuenow',String(pct));
 $('raFiscalRunCounts').textContent='Catálogo '+total+' SKUs · Verificadas '+processed+'/'+total+
  ' · Confirmadas na Shopee '+done+' · Pendentes '+blocked+' · Falhas '+failed;
 const totals={optimizerFiscalBatchTotal:total,optimizerFiscalBatchReady:0,
  optimizerFiscalBatchPending:Math.max(0,total-done-failed),optimizerFiscalBatchVerified:done};
 for(const [key,value] of Object.entries(totals))if($(key))$(key).textContent=String(value);
 const issues=$('raFiscalRunIssues');issues.replaceChildren();
 const problem=Object.entries(state?.errors||{}).filter(([key])=>ids.has(key)&&
  ['failed','blocked','uncertain'].includes(state.done?.[key]));
 if(problem.length){
  const head=document.createElement('strong');
  head.textContent='Pendências que precisam de atenção ('+problem.length+')';
  issues.append(head);
  for(const [key,message] of problem.slice(0,8)){
   const line=document.createElement('p');
   const item=items.find(x=>idOf(x)===key);
   line.textContent=(item?.sku||'SKU')+' — '+message;
   issues.append(line);
  }
  if(problem.length>8){
   const more=document.createElement('small');
   more.textContent='Exibindo 8 de '+problem.length+' pendências. As demais ficam registradas para consulta.';
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
  let all=[],offset=0,finished=false;
  for(let page=0;page<200;page++){
   report(state,'Consultando todos os anúncios ativos na Shopee · '+all.length+' SKUs encontradas');
   const data=await request('/api/shopee/optimizer/fiscal-migration/active-skus?offset='+offset);
   if(!Array.isArray(data.items))throw Error('Catálogo sem lista de SKUs');
   all.push(...data.items);
   if(!data.hasNext){finished=true;break;}
   if(!Number.isSafeInteger(data.nextOffset)||data.nextOffset<=offset)
    throw Error('A paginação Shopee não avançou; inventário anterior preservado.');
   offset=data.nextOffset;
  }
  if(!finished||!all.length)throw Error('Não foi possível confirmar o catálogo completo. Resultado anterior preservado.');
  all=[...new Map(all.filter(x=>x.sku).map(x=>[idOf(x),x])).values()];
  state.inventory=all;state.inventoryComplete=true;save(state);
  report(state,'Catálogo completo confirmado. Preparando e enviando somente dados fiscais.');
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
    // A versão anterior chamava validate-one sem prepare-drafts:
    // todas as SKUs ainda sem ficha falhavam e NADA era enviado.
    const draft=await post('/api/shopee/optimizer/fiscal-migration/prepare-drafts',{items:[{
     sku:item.sku,itemId:item.itemId,modelId:item.modelId,title:item.title||''
    }]});
    const d=(draft.results||[]).find(x=>x.sku===item.sku);
    if(!d||!['draft_saved','already_reviewed'].includes(d.status)){
     mark(state,item,'blocked',d?.message||'Fonte fiscal/NCM WeDrop pendente; não é seguro inventar os dados.');
     continue;
    }
    await post('/api/shopee/optimizer/fiscal-migration/validate-one',{
     confirmation:'VALIDAR FISCAL MIGRACAO',
     sku:item.sku,itemId:item.itemId,modelId:item.modelId
    });
    const prepared=await post('/api/shopee/optimizer/batch/fiscal/prepare',{skus:[item.sku]});
    const plan=(prepared.results||[]).find(x=>x.sku===item.sku);
    if(!plan?.ready||!plan.planId){
     const reason=plan?.error||plan?.publicationPending?.join('; ')||
      plan?.blocked?.join('; ')||plan?.message||'Dados fiscais não aptos para atualização.';
     mark(state,item,'blocked',reason);
     continue;
    }
    // Persistir a intenção ANTES do HTTP POST, para nunca duplicar após HTTP 502.
    state.pending=key;save(state);
    report(state,'Enviando informações fiscais para a Shopee · aguardando confirmação',item.sku);
    let response=null;
    try{
     response=await post('/api/shopee/optimizer/batch/fiscal/execute',{
      confirmation:'EXECUTAR LOTE FISCAL',acceptPartialExecution:true,
      items:[{sku:item.sku,itemId:item.itemId,modelId:item.modelId,
       planId:plan.planId,updatedAt:plan.updatedAt}]
     },0); // POST de execução NUNCA recebe retry automático
    }catch(error){
     report(state,'Resposta de envio indisponível. Consultando o estado real sem repetir a operação.',item.sku);
    }
    const receipt=(response?.results||[]).find(x=>x.sku===item.sku);
    if(receipt?.status==='failed'){
     mark(state,item,'failed',receipt.message||'Shopee recusou a autorização da atualização.');
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
  report(state,'Passagem concluída · somente SKUs confirmadas são consideradas atualizadas.');
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
if(previous?.inventory?.length)progress(previous,previous.active?'Recuperando execução anterior':'Progresso preservado');
else panel();
if(previous?.active&&previous?.inventory?.length){
 // O usuário já havia autorizado a execução antes do F5.
 void run();
}
})();