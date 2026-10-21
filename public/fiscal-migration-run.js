(function(){
'use strict';
const $=id=>document.getElementById(id);
const KEY='ra-fiscal-migration-run-v3';
const nap=ms=>new Promise(r=>setTimeout(r,ms));
async function request(url,options={}){
 const res=await fetch(url,{credentials:'same-origin',cache:'no-store',...options});
 if(!(res.headers.get('content-type')||'').includes('application/json'))
  throw Error('Resposta não JSON do servidor HTTP '+res.status);
 const data=await res.json();
 if(!res.ok||!data.ok)throw Error(data.error||'Falha HTTP '+res.status);
 return data;
}
const post=(url,data)=>request(url,{method:'POST',headers:{'Content-Type':'application/json'},
 body:JSON.stringify(data)});
function save(p){p.updatedAt=new Date().toISOString();localStorage.setItem(KEY,JSON.stringify(p));}
function read(){try{return JSON.parse(localStorage.getItem(KEY)||'null');}catch{return null;}}
function showSaved(){const p=read(),label=$('optimizerFiscalMigrationStatus');if(!label||label.dataset.liveRun==='true'||!p?.inventory?.length)return;const values=Object.values(p.done||{});label.textContent='Migração salva neste navegador: '+p.inventory.length+' SKUs localizadas · '+values.filter(v=>v==='verified').length+' confirmadas · '+values.filter(v=>v==='blocked').length+' pendentes · '+values.filter(v=>v==='failed').length+' falhas'+(p.pending?' · aguardando confirmação de '+p.pending:'')+'. Retomar não exige nova prévia.';}
const identity=x=>x.itemId+':'+x.modelId+':'+x.sku;
const panel=()=>{let p=$('raFiscalRunProgress');if(p)return p;
 p=document.createElement('div');p.id='raFiscalRunProgress';p.className='ra-fiscal-progress';
 p.innerHTML='<div class="ra-fiscal-progress-head"><strong id="raFiscalRunPhase">Aguardando execução</strong><span id="raFiscalRunPercent">0%</span></div><div class="ra-fiscal-progress-track" role="progressbar" aria-label="Execução fiscal na Shopee" aria-valuemin="0" aria-valuemax="100" aria-valuenow="0"><div id="raFiscalRunFill"></div></div><p id="raFiscalRunCounts" aria-live="polite">Nenhuma atualização iniciada.</p>';
 $('optimizerFiscalMigrationRun')?.insertAdjacentElement('afterend',p);return p;};
function progress(run,phase='',sku=''){
 const p=panel();if(!p)return;
 const all=run?.inventory?.length||0,v=Object.values(run?.done||{});
 const confirmed=v.filter(x=>x==='verified').length,failed=v.filter(x=>x==='failed').length,blocked=v.filter(x=>x==='blocked').length;
 const processed=confirmed+failed+blocked,pct=all?Math.min(100,Math.round(processed/all*100)):0;
 $('raFiscalRunPhase').textContent=phase||'Progresso salvo'+(sku?' · '+sku:'');
 $('raFiscalRunPercent').textContent=pct+'%';
 $('raFiscalRunFill').style.width=pct+'%';
 p.querySelector('[role=progressbar]').setAttribute('aria-valuenow',String(pct));
 $('raFiscalRunCounts').textContent='Processadas '+processed+'/'+all+' · Confirmadas na Shopee '+confirmed+' · Pendentes '+blocked+' · Falhas '+failed+(sku?' · SKU '+sku:'');
}

async function status(x){
 const params=new URLSearchParams({items:JSON.stringify([{sku:x.sku,itemId:x.itemId,modelId:x.modelId}])});
 const d=await request('/api/shopee/optimizer/batch/fiscal/status?'+params);
 return (d.results||[]).find(v=>v.sku===x.sku);
}
async function run(){
 const btn=$('optimizerFiscalMigrationRun'),label=$('optimizerFiscalMigrationStatus');
 if(btn.disabled)return;btn.disabled=true;
 const info=t=>{if(label){label.textContent=t;label.dataset.liveRun='true';}btn.title=t;};
 info('Iniciando consulta dos anúncios ativos...');
 try{
  let run=read();
  if(!run)run={done:{},pending:null};
  // Sempre conferir o catálogo completo: o inventário antigo de 38 SKUs veio de uma página parcial.
  // Manter resultados já confirmados; nunca os descartar ao atualizar o inventário.
  let all=[],offset=0,complete=false;
  for(let page=0;page<200;page++){
   info('Consultando catálogo completo da Shopee: '+all.length+' SKUs encontradas...');
   const d=await request('/api/shopee/optimizer/fiscal-migration/active-skus?offset='+offset);
   if(!Array.isArray(d.items))throw Error('Resposta do catálogo sem lista de SKUs.');
   all.push(...d.items);
   if(!d.hasNext){complete=true;break;}
   if(!Number.isSafeInteger(d.nextOffset)||d.nextOffset<=offset)
    throw Error('Paginação inválida no offset '+offset+'. Inventário anterior preservado.');
   offset=d.nextOffset;
  }
  if(!complete)throw Error('Consulta do catálogo não terminou; inventário anterior preservado.');
  all=[...new Map(all.filter(x=>x.sku).map(x=>[identity(x),x])).values()];
  if(!all.length)throw Error('Nenhuma SKU ativa retornada; inventário anterior preservado.');
  // Só gravar após a última página, para não salvar uma lista parcial.
  run.inventory=all;
  run.inventoryComplete=true;
  save(run);
  progress(run,'Catálogo completo localizado · validando informações fiscais');
  info('Catálogo completo: '+all.length+' SKUs. Prosseguindo sem repetir as confirmadas.');
  if(run.pending){
   const item=all.find(x=>identity(x)===run.pending);
   if(!item)throw Error('SKU anteriormente enviada não está no catálogo atual; revisar antes de retomar.');
   let state=await status(item);
   for(let i=0;i<25&&state?.status==='running';i++){
    await nap(4000);state=await status(item);
   }
   if(state?.status!=='verified'&&state?.status!=='failed')
    throw Error('SKU '+item.sku+' sem confirmação definitiva: reenvio bloqueado.');
   run.done[identity(item)]=state.status;run.pending=null;save(run);
  }
  let completed=0,blocked=0,failed=0;
  for(const [i,x] of all.entries()){
   const id=identity(x);
   if(run.done[id])continue;
   info('SKU '+(i+1)+'/'+all.length+': '+x.sku+' | Confirmadas '+completed+' | Pendentes '+blocked);
   progress(run,'Validando SKU '+(i+1)+' de '+all.length,x.sku);
   try{
    await post('/api/shopee/optimizer/fiscal-migration/validate-one',{
     confirmation:'VALIDAR FISCAL MIGRACAO',sku:x.sku,itemId:x.itemId,modelId:x.modelId
    });
    const p=await post('/api/shopee/optimizer/batch/fiscal/prepare',{skus:[x.sku]});
    const row=(p.results||[]).find(y=>y.sku===x.sku);
    if(!row?.ready||!row.planId){run.done[id]='blocked';blocked++;save(run);progress(run,'Ficha fiscal pendente',x.sku);continue;}
    run.pending=id;save(run);
    info('Atualizando informações fiscais na Shopee: SKU '+x.sku+' ('+(i+1)+'/'+all.length+'). Aguardando confirmação...');
    progress(run,'Enviando à Shopee · aguardando confirmação',x.sku);
    const a=await post('/api/shopee/optimizer/batch/fiscal/execute',{
     confirmation:'EXECUTAR LOTE FISCAL',acceptPartialExecution:true,
     items:[{sku:x.sku,itemId:x.itemId,modelId:x.modelId,planId:row.planId,updatedAt:row.updatedAt}]
    });
    const sent=(a.results||[]).find(y=>y.sku===x.sku);
    if(sent?.status==='failed'){run.done[id]='failed';run.pending=null;failed++;save(run);continue;}
    let state;
    for(let j=0;j<25;j++){
     state=await status(x);
     if(state?.status==='verified'||state?.status==='failed')break;
     if(state?.status!=='running')break;
     await nap(4000);
    }
    if(state?.status!=='verified'&&state?.status!=='failed')
     throw Error('Envio de '+x.sku+' sem confirmação. Execução pausada; não reenviar.');
    run.done[id]=state.status;run.pending=null;save(run);
    if(state.status==='verified')completed++;else failed++;
    progress(run,'Atualização da SKU concluída',x.sku);
   }catch(e){
    if(run.pending)throw e;
    run.done[id]='blocked';blocked++;save(run);progress(run,'Ficha fiscal bloqueada',x.sku);
   }
  }
  progress(run,'Passagem encerrada');
  info('Execução concluída nesta passagem. Confirmadas '+completed+
   ', falhas '+failed+', pendentes '+blocked+'. Consulte a Shopee para confirmar o total consolidado.');
 }catch(e){info('Pausado: '+e.message+'. Progresso salvo. Para retomar, use o mesmo botão.');progress(read(),'Pausado · resultado preservado');}
 finally{btn.disabled=false;btn.title='Validar e executar na Shopee';}
}
$('optimizerFiscalMigrationRun')?.addEventListener('click',()=>void run());
showSaved();if(read()?.inventory?.length)progress(read(),'Progresso recuperado');
})();