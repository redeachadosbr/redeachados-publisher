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
  let all=Array.isArray(run.inventory)&&run.inventory.length?run.inventory.slice():[],offset=0;
  for(let page=0;!all.length&&page<200;page++){
   const d=await request('/api/shopee/optimizer/fiscal-migration/active-skus?offset='+offset);
   all.push(...(d.items||[]));
   info('Localizando anúncios ativos: '+all.length+' encontrados...');
   if(!d.hasNext)break;
   if(!Number.isSafeInteger(d.nextOffset)||d.nextOffset<=offset)throw Error('Paginação interrompida');
   offset=d.nextOffset;
   // Continuar a paginação mesmo depois de receber a primeira página.
   if(all.length){
    for(let follow=page+1;follow<200;follow++){
     const next=await request('/api/shopee/optimizer/fiscal-migration/active-skus?offset='+offset);
     all.push(...(next.items||[]));
     info('Localizando anúncios ativos: '+all.length+' encontrados...');
     if(!next.hasNext)break;
     if(!Number.isSafeInteger(next.nextOffset)||next.nextOffset<=offset)throw Error('Paginação interrompida');
     offset=next.nextOffset;
     if(follow===199)throw Error('Limite de páginas atingido');
    }
    break;
   }
  }
  all=[...new Map(all.filter(x=>x.sku).map(x=>[identity(x),x])).values()];
  run.inventory=all;save(run);
  info('Localizadas '+all.length+' SKUs. Validando e executando individualmente.');
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
   try{
    await post('/api/shopee/optimizer/fiscal-migration/validate-one',{
     confirmation:'VALIDAR FISCAL MIGRACAO',sku:x.sku,itemId:x.itemId,modelId:x.modelId
    });
    const p=await post('/api/shopee/optimizer/batch/fiscal/prepare',{skus:[x.sku]});
    const row=(p.results||[]).find(y=>y.sku===x.sku);
    if(!row?.ready||!row.planId){run.done[id]='blocked';blocked++;save(run);continue;}
    run.pending=id;save(run);
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
   }catch(e){
    if(run.pending)throw e;
    run.done[id]='blocked';blocked++;save(run);
   }
  }
  info('Execução concluída nesta passagem. Confirmadas '+completed+
   ', falhas '+failed+', pendentes '+blocked+'. Consulte a Shopee para confirmar o total consolidado.');
 }catch(e){info('Pausado: '+e.message+'. Progresso salvo. Para retomar, use o mesmo botão.');}
 finally{btn.disabled=false;btn.title='Validar e executar na Shopee';}
}
$('optimizerFiscalMigrationRun')?.addEventListener('click',()=>void run());
showSaved();
})();