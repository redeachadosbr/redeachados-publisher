// Pesquisa de kits usa o mesmo transporte de texto da Ponte já instalado para
// títulos/descrições: não cria API paga nem abre uma aba vazia pelo Manager.
// A extensão confirma recebimento e devolve o JSON como texto para validação.
import {kitContentResponseText} from './kit-content-handoff.js';

export function requestKitResearch({prompt},{target=window,onProgress=()=>{},signal}={}){
 const text=String(prompt||'');
 if(text.length<500||text.length>16000)
  return Promise.reject(Error('Pesquisa automática exige um catálogo completo de até 16 mil caracteres. Use o TXT e a importação manual para categorias maiores.'));
 if(signal?.aborted)return Promise.reject(Error('Pesquisa cancelada.'));
 const identity={nonce:crypto.randomUUID(),sku:'KIT-RESEARCH-'+crypto.randomUUID(),itemId:'0',modelId:'0'};
 const origin=target.location.origin;
 return new Promise((resolve,reject)=>{
  let done=false,started=false,ack=false,timer;
  const finish=(error,value)=>{
   if(done)return;done=true;clearTimeout(timer);
   target.removeEventListener('message',handle);
   signal?.removeEventListener('abort',abort);
   error?reject(error):resolve(value);
  };
  const expire=(ms,message)=>{clearTimeout(timer);timer=setTimeout(()=>finish(Error(message)),ms);};
  const abort=()=>finish(Error('Pesquisa interrompida. Nenhum kit foi importado.'));
  const handle=event=>{
   if(event.source!==target||event.origin!==origin)return;
   const m=event.data||{};
   if(m.kind==='RA_EXTENSION_READY'&&!started){
    if(m.healthy===false)return;
    const numbers=String(m.version||'').split('.').map(Number);
    if(numbers.length!==3||numbers.some(n=>!Number.isInteger(n))||
      !(numbers[0]>1||numbers[0]===1&&(numbers[1]>0||numbers[2]>=50)))
     return finish(Error('A Ponte precisa da versão que suporta envio automático de texto.'));
    started=true;
    expire(15000,'A Ponte foi encontrada, mas não confirmou a pesquisa.');
    target.postMessage({kind:'RA_SITE_DESC_START',payload:{...identity,prompt:text}},origin);
    return;
   }
   if(!started||m.nonce!==identity.nonce)return;
   if(m.kind==='RA_EXTENSION_DESC_START_RESULT'){
    if(m.ok!==true)return finish(Error('A Ponte recusou a pesquisa: '+(m.error||'sem detalhes')));
    if(!ack){ack=true;onProgress('Ponte recebeu o catálogo completo. ChatGPT pesquisando combinações...');}
    expire(360000,'A pesquisa ainda não foi entregue pela Ponte. Não reenvie enquanto a conversa estiver gerando; recupere o JSON manualmente.');
    return;
   }
   if(!['RA_EXTENSION_DESC_PROGRESS','RA_EXTENSION_DESC_RESULT'].includes(m.kind)||
    String(m.sku)!==identity.sku||String(m.itemId)!=='0'||String(m.modelId)!=='0')return;
   if(m.kind==='RA_EXTENSION_DESC_PROGRESS'){
    if(!ack){ack=true;expire(360000,'A pesquisa não retornou em seis minutos; importe o JSON manualmente quando estiver pronto.');}
    onProgress(String(m.status||'Gerando kits no ChatGPT').slice(0,240));
    return;
   }
   // Preservar a conversa para recuperação manual; não reenviar nem descartar o retorno.
   target.postMessage({kind:'RA_SITE_DESC_ACK',...identity,ok:false},origin);
   if(m.ok!==true)return finish(Error('ChatGPT não devolveu os kits: '+(m.error||'sem detalhes')));
   const rawText=kitContentResponseText(m.rawText);
   if(!rawText.trim())return finish(Error('ChatGPT retornou uma resposta vazia. Confira a conversa.'));
   finish(null,{rawText,nonce:identity.nonce});
  };
  target.addEventListener('message',handle);
  signal?.addEventListener('abort',abort,{once:true});
  expire(8000,'Ponte ChatGPT não detectada. Atualize a extensão no Chrome e recarregue o Manager; a importação manual continua disponível.');
  target.postMessage({kind:'RA_EXTENSION_PROBE'},origin);
 });
}
