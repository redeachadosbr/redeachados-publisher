/* Retentativas somente para falhas transitórias identificáveis, sem repetir geração. */
(function(root){
 'use strict';
 function retryPlan(message,attempt=0){
  const reason=String(message||'');
  const transient=/^(?:NETWORK_TRANSIENT:|RESPOSTA_EM_RECONCILIACAO:|CAPTURA_PENDENTE:|Failed to fetch$|NetworkError:|The message port closed before a response was received\.?$)/i;
  if(!transient.test(reason))return {retry:false,reason:'revisão necessária'};
  if(attempt>=2)return {retry:false,reason:'limite de duas reconexões'};
  return {retry:true,delay:[15000,30000][Math.max(0,attempt)]};
 }
 function sameJob(a,b){return Boolean(a&&b&&a.nonce===b.nonce&&a.sku===b.sku&&a.itemId===b.itemId&&a.modelId===b.modelId);}
 function done(j){return Boolean(j&&Array.isArray(j.completed)&&j.completed.length===9&&[1,2,3,4,5,6,7,8,9].every(x=>j.completed.includes(x)));}
 function next(j){return [1,2,3,4,5,6,7,8,9].find(slot=>!j.completed.includes(slot)&&!(j.deferredSlots||[]).includes(slot));}
 function availableDone(j){return Boolean(j&&Array.isArray(j.completed)&&!next(j));}
 root.BridgeFlowPolicy={retryPlan,sameJob,done,next,availableDone};
 if(typeof module!=='undefined'&&module.exports)module.exports=root.BridgeFlowPolicy;
})(globalThis);
