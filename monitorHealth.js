// Estado operacional do monitor. Não depende da memória do processo ou do navegador.
export function deriveMonitorHealth(run,{now=Date.now(),expectedIntervalMinutes=5}={}){
  const lastSuccess=run?.last_success_at||null;
  const lastAttempt=run?.last_started_at||null;
  const lastError=run?.last_error||null;
  const result={state:'never',lastSuccessAt:lastSuccess,lastAttemptAt:lastAttempt,
    minutesSinceSuccess:null,reason:'Nenhuma verificação completa foi registrada no banco.'};
  if(!lastSuccess){
    if(lastError){result.state='failed';result.reason='Falha antes da primeira verificação: '+lastError;}
    return result;
  }
  const ts=Date.parse(lastSuccess);
  if(!Number.isFinite(ts)){result.state='failed';result.reason='A última data registrada no banco é inválida.';return result;}
  const elapsed=Math.max(0,(now-ts)/60000);
  result.minutesSinceSuccess=Math.round(elapsed);
  const threshold=Math.max(12,expectedIntervalMinutes*2+2);
  if(elapsed>threshold){
    result.state='stale';
    result.reason='Monitor sem atualização há '+Math.round(elapsed)+' min. O Render pode ter suspendido ou a Shopee pode estar indisponível. Verifique os pedidos manualmente.';
  }else if(lastError&&lastAttempt&&Date.parse(lastAttempt)>ts){
    result.state='failed';
    result.reason='Última tentativa falhou: '+lastError;
  }else{
    result.state='healthy';
    result.reason='Monitor sincronizou recentemente. O painel continua dependente de o Render estar ativo.';
  }
  return result;
}
