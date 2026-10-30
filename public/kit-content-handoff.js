import {parseKitSeoResponse} from './kit-seo-helper.js';

// Transporte já instalado na Ponte 1.0.50–1.0.61. A descrição da resposta
// contém o anúncio inteiro (pesquisa + três títulos + descrição), sem perdas.
export function kitContentResponseText(raw){
 const text=String(raw||'').trim();
 try{
  const envelope=JSON.parse(text);
  if(envelope&&typeof envelope.description==='string')return envelope.description;
 }catch{}
 return text;
}

export function requestKitContent({kitSku,prompt},{target=window,onProgress=()=>{},signal}={}){
 const sku=String(kitSku||''),text=String(prompt||'');
 if(!/^KIT[-_][a-z0-9_-]+$/i.test(sku)||sku.length>120)
  return Promise.reject(Error('Abra um kit válido antes de gerar o anúncio.'));
 if(text.length<500||text.length>16000)
  return Promise.reject(Error('A orientação precisa ter entre 500 e 16.000 caracteres para envio pela Ponte.'));
 if(signal?.aborted)return Promise.reject(Error('Geração interrompida neste painel.'));
 // Identidade própria do kit: nunca reutilizar o cache de uma SKU individual.
 const identity={nonce:crypto.randomUUID(),sku,itemId:'0',modelId:'0'};
 const origin=target.location.origin;
 return new Promise((resolve,reject)=>{
  let done=false,started=false,accepted=false,timer;
  const finish=(error,value)=>{
   if(done)return;done=true;clearTimeout(timer);
   target.removeEventListener('message',handle);
   signal?.removeEventListener('abort',abort);
   error?reject(error):resolve(value);
  };
  const expire=(ms,message)=>{
   clearTimeout(timer);timer=setTimeout(()=>finish(Error(message)),ms);
  };
  const confirmStart=()=>{
   if(accepted)return;
   accepted=true;
   // A Ponte pode pesquisar e gerar por quase cinco minutos. O prazo começa
   // após o ACK, não no clique, e não termina aos 45 segundos.
   expire(360000,'A geração ainda não foi concluída. A conversa foi preservada; quando terminar, use o botão azul para importar.');
  };
  const abort=()=>finish(Error('O kit foi trocado durante a geração. A conversa foi preservada.'));
  const handle=event=>{
   if(event.source!==target||event.origin!==origin)return;
   const m=event.data||{};
   if(m.kind==='RA_EXTENSION_READY'&&!started){
    if(m.healthy===false)return;
    const version=String(m.version||'').split('.').map(Number);
    if(version.length!==3||version.some(n=>!Number.isInteger(n))||
      !(version[0]>1||version[0]===1&&(version[1]>0||version[2]>=50)))
     return finish(Error('Esta Ponte não oferece o envio de texto completo. Ative a versão que já foi entregue para os kits.'));
    started=true;
    expire(15000,'A Ponte não confirmou o recebimento do comando. Atualize o Manager e tente novamente.');
    target.postMessage({kind:'RA_SITE_DESC_START',payload:{...identity,prompt:text}},origin);
    return;
   }
   if(!started||m.nonce!==identity.nonce)return;
   if(m.kind==='RA_EXTENSION_DESC_START_RESULT'){
    if(m.ok!==true)return finish(Error('A Ponte recusou o envio: '+(m.error||'sem detalhes')));
    confirmStart();onProgress('Ponte recebeu a orientação completa · abrindo o ChatGPT');
    return;
   }
   if(!['RA_EXTENSION_DESC_PROGRESS','RA_EXTENSION_DESC_RESULT'].includes(m.kind)||
     String(m.sku)!==sku||String(m.itemId)!==identity.itemId||String(m.modelId)!==identity.modelId)return;
   if(m.kind==='RA_EXTENSION_DESC_PROGRESS'){
    confirmStart();
    const status=String(m.status||'').slice(0,240);
    onProgress(/^Descrição enviada\./i.test(status)?
     'Comando enviado ao ChatGPT · gerando os três títulos e a descrição':status);
    return;
   }
   // A importação continua no botão azul. ACK negativo encerra a espera da
   // extensão sem fechar a conversa, que o usuário precisa revisar/copiar.
   target.postMessage({kind:'RA_SITE_DESC_ACK',...identity,ok:false},origin);
   if(m.ok!==true)return finish(Error(m.error||'A Ponte não concluiu a geração.'));
   try{
    const rawText=kitContentResponseText(m.rawText);
    parseKitSeoResponse(rawText);
    finish(null,{kitSku:sku,rawText});
   }catch(error){finish(error);}
  };
  target.addEventListener('message',handle);
  signal?.addEventListener('abort',abort,{once:true});
  expire(8000,'A Ponte não respondeu nesta página. Atualize o Manager para reconectar a extensão já instalada.');
  target.postMessage({kind:'RA_EXTENSION_PROBE'},origin);
 });
}
