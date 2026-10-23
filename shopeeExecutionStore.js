// Shopee-specific execution state with conditional CAS locking.
// This store does not call marketplace APIs.
const num=v=>{const n=Number(v);if(!Number.isSafeInteger(n)||n<=0)throw Error('Identificador da loja/anúncio inválido.');return n;};
const model=v=>{const n=Number(v);if(!Number.isSafeInteger(n)||n<0)throw Error('Modelo inválido.');return n;};
function config(){
 const u=String(process.env.SUPABASE_URL||'').replace(/\/$/,'');
 const k=String(process.env.SUPABASE_SECRET_KEY||process.env.SUPABASE_SERVICE_ROLE_KEY||'');
 if(!u||!k)throw Error('Supabase Shopee não configurado.');
 const headers={apikey:k,Accept:'application/json','Content-Type':'application/json'};
 if(/^eyJ[A-Za-z0-9_-]*\./.test(k))headers.Authorization='Bearer '+k;
 return {u,headers};
}
async function rows(query,options={}){
 const c=config(),headers={...c.headers};
 if(options.prefer)headers.Prefer=options.prefer;
 const res=await fetch(c.u+'/rest/v1/shopee_optimizer_execution_jobs'+query,{
  method:options.method||'GET',headers,
  ...(options.data?{body:JSON.stringify(options.data)}:{}),
  signal:AbortSignal.timeout(16000)
 });
 if(!res.ok)throw Error('Banco de execução Shopee retornou HTTP '+res.status+'.');
 const raw=await res.text();
 return raw?JSON.parse(raw):[];
}
const where=(shopId,itemId,modelId)=>'?shop_id=eq.'+num(shopId)+
 '&item_id=eq.'+num(itemId)+'&model_id=eq.'+model(modelId);
export async function readShopeeExecution(shopId,itemId,modelId){
 const result=await rows(where(shopId,itemId,modelId)+
   '&select=shop_id,item_id,model_id,sku,state,plan,result,run_id,last_error,updated_at,lease_until&limit=1');
 return result[0]||null;
}
export async function saveShopeePreparedExecution(shopId,itemId,modelId,sku,plan){
 const prev=await readShopeeExecution(shopId,itemId,modelId);
 if(['running','uncertain'].includes(prev?.state))
   throw Error('Execução já iniciada ou com resultado incerto. Verifique o anúncio antes de preparar novamente.');
 const state=plan.canExecute?'prepared':'blocked';
 const data={shop_id:num(shopId),item_id:num(itemId),model_id:model(modelId),
  sku:String(sku),state,plan,result:null,run_id:null,last_error:null,updated_at:new Date().toISOString()};
 // Conditional save prevents a preparation in another tab from replacing a running job.
 const result=prev?await rows(where(shopId,itemId,modelId)+
  '&updated_at=eq.'+encodeURIComponent(prev.updated_at)+'&state=in.(prepared,blocked,verified,failed)',
  {method:'PATCH',data,prefer:'return=representation'}):await rows('',{
  method:'POST',data:[data],prefer:'return=representation'});
 if(result.length!==1||result[0].sku!==sku)throw Error('Plano não foi confirmado no banco Shopee.');
 return result[0];
}
export async function claimShopeePreparedExecution(shopId,itemId,modelId,{planId,updatedAt,runId,commercialDiscount=null}){
 const query=where(shopId,itemId,modelId)+
  '&state=eq.prepared&updated_at=eq.'+encodeURIComponent(updatedAt)+
  '&plan->>planId=eq.'+encodeURIComponent(planId)+
  '&select=state,plan,run_id,updated_at';
 const saved=await readShopeeExecution(shopId,itemId,modelId);
 const reused=saved?.plan?.planId===planId?saved.plan.reusedMedia:null;
 const result=await rows(query,{method:'PATCH',
  data:{state:'running',run_id:runId,plan:commercialDiscount?{...saved.plan,commercialDiscount}:saved.plan,result:{phase:'queued',startedAt:new Date().toISOString(),
  ...(reused?.imageIds?.length?{imageIds:reused.imageIds}:{}),
  ...(reused?.video?.phase==='ready'?{video:reused.video}:{}),
  events:[{key:'queued',label:'Execução autorizada e recebida para processamento.',kind:'info',at:new Date().toISOString()},
   ...(reused?.imageIds?.length?[{key:'images-reused',label:reused.imageIds.length+' imagens já enviadas à mídia Shopee serão reaproveitadas.',kind:'success',at:new Date().toISOString()}]:[]),
   ...(reused?.video?.phase==='ready'?[{key:'video-reused',label:'Vídeo processado será reaproveitado; publicação ainda não confirmada.',kind:'success',at:new Date().toISOString()}]:[])]},
  lease_until:new Date().toISOString(),updated_at:new Date().toISOString()},
  prefer:'return=representation'});
 if(result.length!==1||result[0]?.plan?.planId!==planId)throw Error('Plano já executado, alterado ou em andamento. Recarregue a prévia.');
 return result[0];
}
export async function finishShopeeExecution(shopId,itemId,modelId,runId,{state,result=null,lastError=null}){
 if(!['verified','failed','uncertain'].includes(state))throw Error('Estado final inválido.');
 const q=where(shopId,itemId,modelId)+'&state=eq.running&run_id=eq.'+encodeURIComponent(runId)+'&select=state,updated_at';
 const rowsUpdated=await rows(q,{method:'PATCH',
  data:{state,result,last_error:lastError,updated_at:new Date().toISOString()},
  prefer:'return=representation'});
 if(rowsUpdated.length!==1)throw Error('Resultado da execução não pôde ser gravado com segurança.');
 return rowsUpdated[0];
}


export async function pendingShopeeExecutions(){
 return rows('?state=eq.running&lease_until=lte.'+encodeURIComponent(new Date().toISOString())+
  '&select=*&order=updated_at.asc&limit=3');
}
export async function leaseShopeeExecution(job,runId){
 const r=await rows(where(job.shop_id,job.item_id,job.model_id)+
  '&state=eq.running&run_id=eq.'+encodeURIComponent(job.run_id)+
  '&lease_until=lte.'+encodeURIComponent(new Date().toISOString()),{method:'PATCH',
  data:{run_id:runId,lease_until:new Date(Date.now()+300000).toISOString()},prefer:'return=representation'});
 return r[0]||null;
}
export async function checkpointShopeeExecution(job,result,delay=1000){
 const r=await rows(where(job.shop_id,job.item_id,job.model_id)+
  '&state=eq.running&run_id=eq.'+encodeURIComponent(job.run_id),{method:'PATCH',
  data:{result,lease_until:new Date(Date.now()+delay).toISOString(),updated_at:new Date().toISOString()},
  prefer:'return=representation'});
 if(r.length!==1)throw Error('Execução assumida por outra instância.');
 return r[0];
}
export async function reconcileShopeeJob(job,{state,result,lastError}){
 if(!['running','verified','failed'].includes(state))throw Error('Estado inválido na reconciliação.');
 const r=await rows(where(job.shop_id,job.item_id,job.model_id)+
  '&state=eq.uncertain&updated_at=eq.'+encodeURIComponent(job.updated_at),{method:'PATCH',
  data:{state,result,last_error:lastError,updated_at:new Date().toISOString(),
   ...(state==='running'?{lease_until:new Date().toISOString()}: {})},prefer:'return=representation'});
 if(r.length!==1)throw Error('Execução mudou durante a conferência. Atualize o status.');
 return r[0];
}
