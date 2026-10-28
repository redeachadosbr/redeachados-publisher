import {KIT_BRIDGE_SESSION_KEY,kitBridgePayload,isKitBridgeEvent} from './kit-extension-bridge.js';

const pos=n=>String(n).padStart(2,'0');
function extensionVersionOk(version){
 const parts=String(version||'').split('.').map(Number);
 return parts.length===3&&parts.every(Number.isInteger)&&
  (parts[0]>1||(parts[0]===1&&(parts[1]>0||(parts[1]===0&&parts[2]>=56))));
}
export async function kitReferenceSheet(kit,{fetcher=fetch}={}){
 const components=kit?.components||[];
 if(![2,3].includes(components.length)||components.some(x=>!x.imageUrl))
  throw Error('O kit precisa de foto WeDrop original de cada SKU para usar a Ponte.');
 const search=new URLSearchParams({skus:components.map(p=>p.sku).join(',')});
 const photos=[];
 for(let i=0;i<components.length;i++){
  const params=new URLSearchParams(search);params.set('index',String(i));
  const response=await fetcher('/api/shopee/kits/reference-photo?'+params);
  if(!response.ok){
   const error=await response.json().catch(()=>({}));
   throw Error('Não foi possível carregar a foto WeDrop de '+components[i].sku+': '+
    (error.error||'HTTP '+response.status));
  }
  const blob=await response.blob();
  if(!/^image\/(?:png|jpeg|webp)$/.test(blob.type)||blob.size>6*1024*1024)
   throw Error('Imagem de referência inválida para a SKU '+components[i].sku);
  photos.push(await createImageBitmap(blob));
 }
 try{
  const canvas=document.createElement('canvas');canvas.width=1024;canvas.height=1024;
  const ctx=canvas.getContext('2d',{alpha:false});
  if(!ctx)throw Error('Chrome não conseguiu combinar as referências dos produtos.');
  ctx.fillStyle='#ffffff';ctx.fillRect(0,0,1024,1024);
  ctx.fillStyle='#172d4d';ctx.font='bold 21px sans-serif';
  ctx.fillText('REFERÊNCIAS ORIGINAIS DO KIT — NÃO É A IMAGEM FINAL',24,38);
  const count=components.length,columnWidth=(1024-44-(count-1)*16)/count;
  for(let i=0;i<count;i++){
   const bmp=photos[i],x=22+i*(columnWidth+16),y=100,w=columnWidth,h=770;
   const factor=Math.min(w/bmp.width,h/bmp.height);
   const rw=bmp.width*factor,rh=bmp.height*factor;
   ctx.fillStyle='#f0f5fc';ctx.fillRect(x-3,y-3,w+6,h+6);
   ctx.fillStyle='#fff';ctx.fillRect(x,y,w,h);
   ctx.drawImage(bmp,x+(w-rw)/2,y+(h-rh)/2,rw,rh);
   ctx.fillStyle='#172d4d';ctx.font='bold 19px sans-serif';
   ctx.fillText('PRODUTO '+(i+1),x,920);
   ctx.font='16px sans-serif';ctx.fillText('SKU '+components[i].sku,x,948);
  }
  ctx.fillStyle='#45546b';ctx.font='16px sans-serif';
  ctx.fillText('GERAR UMA CENA ÚNICA COM TODOS OS PRODUTOS — NÃO CRIAR MOSAICO',22,992);
  const data=canvas.toDataURL('image/jpeg',0.85);
  if(data.length>5*1024*1024)throw Error('Folha de referências muito grande para a Ponte.');
  return data;
 }finally{for(const bmp of photos)bmp.close();}
}

export function createKitExtensionController({
 getKit,getPrompts,getImages,onPhoto,onStatus=()=>{},onProgress=()=>{}
}){
 let ready=false,version='',busy=false,started=false;
 let job=null,timeout=null,imageStallTimer=null;
 try{const v=JSON.parse(sessionStorage.getItem(KIT_BRIDGE_SESSION_KEY)||'null');
  if(v?.nonce&&v?.kitSku)job=v;}catch{}
 const post=message=>window.postMessage(message,location.origin);
 const feedback=(s,type='info')=>{try{onStatus(s,type);}catch{}};
 const saveJob=value=>{
  job=value;
  try{if(value)sessionStorage.setItem(KIT_BRIDGE_SESSION_KEY,JSON.stringify(value));
   else sessionStorage.removeItem(KIT_BRIDGE_SESSION_KEY);}catch{}
 };
 const ack=(nonce,slot,ok,error='')=>post({kind:'RA_SITE_UPLOAD_RESULT',nonce,slot,ok,error});
 const clearImageStall=()=>{if(imageStallTimer!==null){clearTimeout(imageStallTimer);imageStallTimer=null;}};
 // Confirmação de início da extensão não prova que o ChatGPT gerou uma imagem.
 // Avisa sem abortar automaticamente: imagens podem levar mais tempo para renderizar.
 const watchImage=slot=>{
  clearImageStall();
  const nonce=job?.nonce;
  if(!nonce)return;
  imageStallTimer=setTimeout(()=>{
   if(job?.nonce!==nonce)return;
   feedback('A Ponte recebeu o pedido, mas nenhuma imagem nova foi importada para a posição '+
    pos(slot)+'. Apenas abrir o ChatGPT NÃO inicia a geração. Confira se a extensão envia o prompt, anexa as referências, aciona a geração de imagem e devolve o arquivo. Use o modo manual se necessário.','error');
  },150000);
 };
 function stop(reason='Geração interrompida.',{notice=true}={}){
  if(timeout){clearTimeout(timeout);timeout=null;}
  clearImageStall();
  const last=job;
  if(last?.nonce)post({kind:'RA_SITE_ABORT',nonce:last.nonce,sku:last.kitSku,reason});
  busy=false;started=false;saveJob(null);
  if(notice)feedback(reason,'info');
 }
 const onMessage=async event=>{
  if(event.source!==window||event.origin!==location.origin)return;
  const m=event.data;
  if(!m||typeof m!=='object')return;
  if(m.kind==='RA_EXTENSION_READY'){
   version=String(m.version||'');ready=extensionVersionOk(version);
   feedback(ready?'Ponte ChatGPT '+version+' detectada · pronta para kits.':
    'Para recuperar fotos de kits, atualize a Ponte ChatGPT para v1.0.56 ou superior e recarregue o Chrome.','info');
   return;
  }
  if(!job||!['RA_EXTENSION_START_RESULT','RA_EXTENSION_PROGRESS','RA_EXTENSION_IMAGE','RA_EXTENSION_WAKE_RESULT'].includes(m.kind)||
     !isKitBridgeEvent(m,job))return;
  const snapshot=job;
  if(m.kind==='RA_EXTENSION_START_RESULT'){
   if(timeout){clearTimeout(timeout);timeout=null;}
   started=m.ok===true;
   if(!started){busy=false;clearImageStall();saveJob(null);feedback('A Ponte recusou este kit: '+
    (m.error||'formato de kit não aceito pela versão instalada')+
    '. Atualize a extensão para suportar referências de múltiplas SKUs.','error');}
   else {
    const first=Array.from({length:9},(_,i)=>i+1).find(slot=>!getImages().has(slot));
    if(first)watchImage(first);
    feedback('Ponte confirmou o recebimento dos prompts do kit. Aguardando a primeira imagem gerada e importada; abrir a aba do ChatGPT não comprova geração.','info');
   }
   return;
  }
  if(m.kind==='RA_EXTENSION_WAKE_RESULT'){
   if(!m.ok)feedback('A Ponte não conseguiu retomar a geração: '+(m.error||'erro desconhecido'),'error');
   return;
  }
  if(m.kind==='RA_EXTENSION_PROGRESS'){
   const slot=Number(m.slot);
   if(Number.isInteger(slot)&&slot>=1&&slot<=9)onProgress(slot);
   feedback('Ponte ChatGPT · '+String(m.status||'Gerando imagens')+
    (Number.isInteger(slot)?' · '+pos(slot)+'/09':'')+
    (m.error?' · '+m.error:''),m.error?'error':'info');
   return;
  }
  if(m.kind!=='RA_EXTENSION_IMAGE')return;
  try{
   const slot=Number(m.slot);
   if(!Number.isInteger(slot)||slot<1||slot>9)throw Error('Posição fora da galeria de nove imagens.');
   if(!m.dataUrl||typeof m.dataUrl!=='string'||m.dataUrl.length>28*1024*1024||
      !/^data:image\/(?:png|jpeg|webp);base64,/i.test(m.dataUrl))
    throw Error('A extensão não devolveu um arquivo de imagem válido.');
   const current=getKit();
   if(!current||current.kitSku!==snapshot.kitSku||job?.nonce!==snapshot.nonce)
    throw Error('O kit em edição mudou; imagem recusada para evitar misturar SKUs.');
   if(getImages().has(slot)){
    ack(snapshot.nonce,slot,true);
    const next=Array.from({length:9},(_,i)=>i+1).find(n=>!getImages().has(n));
    if(next)watchImage(next);else clearImageStall();
    feedback('Posição '+pos(slot)+' já estava salva. Confirmada sem duplicar.','info');
    return;
   }
   // onPhoto normaliza 1200x1200 e confirma IndexedDB antes de sinalizar sucesso.
   const accepted=await onPhoto({slot,dataUrl:m.dataUrl,kitSku:snapshot.kitSku});
   if(accepted!==true)throw Error('A imagem não foi armazenada; não é seguro avançar.');
   ack(snapshot.nonce,slot,true);
   if(job?.nonce===snapshot.nonce){
    const next=Array.from({length:9},(_,i)=>i+1).find(n=>!getImages().has(n));
    if(next)watchImage(next);else clearImageStall();
   }
   onProgress(slot);
   const count=getImages().size;
   feedback('✓ Imagem '+pos(slot)+' recebida e preservada no kit ('+count+'/9). '+
    (count<9?'Ponte liberada para próxima posição.':'Nove imagens recebidas; revise antes de publicar.'),
    'success');
   if(count>=9){busy=false;started=false;clearImageStall();saveJob(null);}
  }catch(error){
   ack(snapshot.nonce,Number(m.slot)||0,false,String(error.message||error).slice(0,240));
   feedback('Falha na imagem '+pos(Number(m.slot)||0)+': '+String(error.message||error),'error');
  }
 };
 window.addEventListener('message',onMessage);
 function probe(){post({kind:'RA_EXTENSION_PROBE'});return ready;}
 async function waitReady(){
  if(ready)return true;
  probe();
  for(let i=0;i<7&&!ready;i++){await new Promise(r=>setTimeout(r,550));probe();}
  return ready;
 }
 async function start(){
  if(busy)return feedback('A Ponte já está gerando este kit. Use Parar ou aguarde a próxima imagem.','info');
  const kit=getKit();
  if(!kit)throw Error('Abra o rascunho de kit antes de iniciar as nove imagens.');
  if(!await waitReady())throw Error('A extensão Rede Achados BR — Ponte ChatGPT v1.0.56+ não foi detectada. Ative a extensão e atualize esta página.');
  const other=localStorage.getItem('redeAchadosBridgeActiveV3');
  try{if(JSON.parse(other||'null')?.nonce)
   throw Error('Há geração de uma SKU individual na Ponte. Finalize ou pause esse trabalho primeiro.');}
  catch(error){if(error.message?.includes('SKU individual'))throw error;}
  const prompts=getPrompts();
  const referenceDataUrl=await kitReferenceSheet(kit);
  if(getKit()?.kitSku!==kit.kitSku)throw Error('O kit mudou enquanto carregava as fotos.');
  const nonce=crypto.randomUUID();
  const payload=kitBridgePayload({kit,nonce,referenceDataUrl,prompts,completed:[...getImages().keys()]});
  busy=true;started=false;
  saveJob({nonce,kitSku:kit.kitSku,itemId:'0',modelId:'0',createdAt:Date.now()});
  feedback('Enviando kit com '+kit.components.length+' SKUs e nove prompts para a Ponte ChatGPT...','info');
  post({kind:'RA_SITE_START',payload});
  timeout=setTimeout(()=>{
   if(job?.nonce===nonce&&!started){
    stop('A extensão não confirmou o início do kit. Confira sua versão e se ela aceita geração com 2–3 produtos.',{notice:true});
   }
  },16000);
 }

 // A Ponte já conferiu a sessão real e recebeu confirmação do background.
 // Vincular o nonce local é necessário para aceitar RA_EXTENSION_IMAGE após F5.
 function adoptRunnerSession(identity){
  const current=getKit(),nonce=String(identity?.nonce||'');
  if(!current||current.kitSku!==String(identity?.sku||'')||
     String(identity?.itemId)!=='0'||String(identity?.modelId)!=='0'||
     !/^[a-z0-9_-]{12,90}$/i.test(nonce))
   return {ok:false,error:'Identidade do kit inválida para recuperar imagem.'};
  if(job&&job.kitSku!==current.kitSku)
   return {ok:false,error:'Outra composição já está ativa. Abra o kit correto.'};
  // Uma aba pode conter nonce expirado da extensão anterior; somente a
  // confirmação da extensão autorizada pode substituí-lo neste mesmo kit.
  saveJob({nonce,kitSku:current.kitSku,itemId:'0',modelId:'0',createdAt:Date.now()});
  busy=true;started=true;
  const slot=Array.from({length:9},(_,i)=>i+1).find(n=>!getImages().has(n));
  if(slot)watchImage(slot);else clearImageStall();
  feedback('Sessão da Ponte vinculada ao kit. Buscando a imagem '+pos(slot||9)+'/09 já gerada; nenhuma nova geração foi solicitada.','info');
  return {ok:true,nonce,sku:current.kitSku,itemId:'0',modelId:'0',slot:slot||9};
 }
 // Retomada diretamente pelo Manager quando atualizar a extensão fecha o runner.
 // Consulta a tarefa que a extensão realmente preservou antes de qualquer nova geração.
 async function resumeFromManager(){
  const kit=getKit();
  if(!kit)return {ok:false,error:'Abra o rascunho do kit antes de recuperar a Ponte.'};
  if(!await waitReady())return {ok:false,error:'Ponte v1.0.56+ não detectada. Recarregue a extensão e o Manager.'};
  const completed=[...getImages().keys()].filter(n=>Number.isInteger(n)&&n>=1&&n<=9)
   .sort((a,b)=>a-b);
  const prompts=getPrompts();
  if(!Array.isArray(prompts)||prompts.length!==9||prompts.some(p=>typeof p!=='string'||p.length<40))
   return {ok:false,error:'Os nove prompts deste kit não estão disponíveis.'};
  if(completed.length===9)return {ok:false,error:'As nove imagens já estão salvas. Confira a galeria.'};
  feedback('Consultando a sessão que a extensão preservou. Não será repetido nenhum prompt até confirmar a recuperação.','info');
  const requestId=crypto.randomUUID();
  const result=await new Promise(resolve=>{
   const done=value=>{clearTimeout(timer);window.removeEventListener('message',listener);resolve(value);};
   const timer=setTimeout(()=>done({ok:false,error:'A extensão não respondeu à recuperação. Atualize o Manager e confira a Ponte.'}),18000);
   const listener=event=>{
    if(event.source!==window||event.origin!==location.origin||
       event.data?.kind!=='RA_EXTENSION_CONTINUE_RESULT'||
       event.data.requestId!==requestId)return;
    done(event.data);
   };
   window.addEventListener('message',listener);
   post({kind:'RA_SITE_CONTINUE',requestId,payload:{
    sku:kit.kitSku,itemId:'0',modelId:'0',completed,prompts
   }});
  });
  if(!result?.ok){
   const missing=String(result?.reason||'');
   const message=missing==='NO_RECOVERABLE_JOB'?
    'A extensão não encontrou a sessão anterior após a atualização. A imagem 01 está preservada. Importe manualmente a imagem 02 já pronta antes de iniciar uma nova geração para evitar duplicar.':
    String(result?.error||missing||'A Ponte não confirmou a sessão.').slice(0,320);
   feedback(message,'error');
   return {ok:false,error:message};
  }
  const nonce=String(result.nonce||'');
  if(!/^[a-z0-9_-]{12,90}$/i.test(nonce))
   return {ok:false,error:'A extensão não devolveu identificador válido de sessão.'};
  // A identidade vem da extensão: uma sessão antiga na aba não pode bloquear
  // a sessão verdadeira do mesmo kit após o fechamento do runner.
  if(job&&job.kitSku!==kit.kitSku)
   return {ok:false,error:'Outra composição de kit ainda está selecionada. Confira a galeria.'};
  if(!job||job.nonce!==nonce)saveJob({nonce,kitSku:kit.kitSku,itemId:'0',modelId:'0',createdAt:Date.now()});
  return resumeFromExtension({nonce,sku:kit.kitSku,itemId:'0',modelId:'0'});
 }
 // Exclusivo de kits: o botão verde da Ponte solicita ao Manager a posição
 // efetivamente salva antes de tentar recuperar a imagem já pronta.
 async function resumeFromExtension(identity){
  const current=getKit(),nonce=String(identity?.nonce||'');
  if(!current||current.kitSku!==String(identity?.sku||'')||
     String(identity?.itemId)!=='0'||String(identity?.modelId)!=='0')
   return {ok:false,error:'Abra o mesmo kit no editor de rascunhos para recuperar a foto.'};
  if(!/^[a-z0-9_-]{12,90}$/i.test(nonce))
   return {ok:false,error:'Sessão da Ponte inválida; nenhum prompt foi reenviado.'};
  if(job&&(job.nonce!==nonce||job.kitSku!==current.kitSku))
   return {ok:false,error:'Existe outra sessão ativa. Confira o kit e a Ponte antes de retomar.'};
  const completed=[...getImages().keys()].filter(n=>Number.isInteger(n)&&n>=1&&n<=9)
   .sort((a,b)=>a-b);
  const prompts=getPrompts();
  if(!Array.isArray(prompts)||prompts.length!==9||prompts.some(p=>typeof p!=='string'||p.length<40))
   return {ok:false,error:'Os nove prompts do kit não estão prontos.'};
  const requestId=crypto.randomUUID();
  const continued=await new Promise(resolve=>{
   const finish=data=>{clearTimeout(timer);window.removeEventListener('message',listener);resolve(data);};
   const timer=setTimeout(()=>finish({ok:false,error:'A Ponte não confirmou a reconciliação deste kit.'}),18000);
   const listener=event=>{
    if(event.source!==window||event.origin!==location.origin||
       event.data?.kind!=='RA_EXTENSION_CONTINUE_RESULT'||
       event.data.requestId!==requestId)return;
    finish(event.data);
   };
   window.addEventListener('message',listener);
   post({kind:'RA_SITE_CONTINUE',requestId,payload:{
    sku:current.kitSku,itemId:'0',modelId:'0',completed,prompts
   }});
  });
  if(!continued?.ok||continued.nonce!==nonce)
   return {ok:false,error:String(continued?.error||'Sessão de kit não confirmada pela Ponte.').slice(0,320)};
  if(!job)saveJob({nonce,kitSku:current.kitSku,itemId:'0',modelId:'0',createdAt:Date.now()});
  const wake=await new Promise(resolve=>{
   const finish=data=>{clearTimeout(timer);window.removeEventListener('message',listener);resolve(data);};
   const timer=setTimeout(()=>finish({ok:false,error:'Ponte não confirmou a retomada.'}),18000);
   const listener=event=>{
    if(event.source!==window||event.origin!==location.origin||
       event.data?.kind!=='RA_EXTENSION_WAKE_RESULT'||event.data.nonce!==nonce)return;
    finish(event.data);
   };
   window.addEventListener('message',listener);
   post({kind:'RA_SITE_WAKE',nonce});
  });
  if(!wake?.ok)return {ok:false,error:String(wake?.error||'A Ponte não conseguiu retomar o kit.').slice(0,320)};
  busy=true;started=true;
  const slot=Number(continued.slot);
  if(Number.isInteger(slot)&&slot>=1&&slot<=9)watchImage(slot);
  feedback('✓ Recuperação confirmada para o kit '+current.kitSku+
   ', imagem '+pos(slot)+'/09. A Ponte buscará a foto já gerada SEM repetir o prompt.','success');
  return {ok:true,nonce,sku:current.kitSku,itemId:'0',modelId:'0',slot};
 }
 return {start,stop,adoptRunnerSession,resumeFromExtension,resumeFromManager,probe,ready:()=>ready,busy:()=>busy,version:()=>version,
  activeJob:()=>job,dispose:()=>{stop('Encerrando sessão do kit.',{notice:false});window.removeEventListener('message',onMessage);}};
}
