import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';

const source=name=>readFileSync(new URL('../chrome-extension-chatgpt/'+name,import.meta.url),'utf8');
const runner=source('runner.js'),safety=source('image-safety.js');
const flush=()=>new Promise(resolve=>setImmediate(resolve));
const forever=()=>new Promise(()=>{});
function section(text,start,end){
 const a=text.indexOf(start),b=text.indexOf(end,a);
 assert.ok(a>=0&&b>a,`missing ${start}`);return text.slice(a,b);
}
function clock(){
 let id=0;const timers=new Map();
 return {timers,setTimeout:(fn,ms)=>{timers.set(++id,{fn,ms});return id;},clearTimeout:id=>timers.delete(id),
  fire(ms){const row=[...timers].find(([,t])=>t.ms===ms);assert.ok(row,`timer ${ms} must exist`);timers.delete(row[0]);row[1].fn();}};
}
const image='data:image/png;base64,'+'A'.repeat(24000);
const state={submitted:true,requestMatched:true,generating:false,imageCount:1,key:'image-A',url:'https://chatgpt.com/c/own-chat'};
function captureHarness({stage='headers',canvas=true,latest=state}={}){
 const time=clock();let signal,reader,reads=0,draws=0,resolveFetch;
 const blob={type:'image/png',size:3000};
 const response={ok:true,blob:()=>stage==='body'?forever():Promise.resolve(blob)};
 const ctx=vm.createContext({...time,AbortController,info:{...state},chosen:{img:{naturalWidth:1024,naturalHeight:1024},src:'https://chatgpt.com/image-A'},payload:{},
  dom:async()=>latest,
  fetch:(_url,options)=>{signal=options.signal;return stage==='headers'?new Promise(resolve=>{resolveFetch=resolve;}):Promise.resolve(response);},
  FileReader:class {constructor(){reader=this;this.readyState=0;}
   readAsDataURL(){reads++;this.readyState=1;if(stage!=='reader'){this.result=image;this.readyState=2;this.onload();}}
   abort(){this.readyState=2;this.onabort?.();}},
  document:{createElement:()=>({getContext:()=>({drawImage:()=>{draws++;}}),toDataURL:()=>{if(!canvas)throw Error('tainted canvas');return image;}})}
 });
 const capture=section(safety,'      const {img,src}=chosen;','    }\n    throw new Error');
 vm.runInContext('async function capture(){'+capture+'}',ctx);
 return {time,ctx,signal:()=>signal,reader:()=>reader,reads:()=>reads,draws:()=>draws,release:()=>resolveFetch(response)};
}

for(const stage of ['headers','body','reader'])test(`leitura travada em ${stage} usa pixels da mesma imagem após 12 s`,async()=>{
 const h=captureHarness({stage}),pending=h.ctx.capture();await flush();
 h.time.fire(12000);const result=await pending;
 assert.equal(result.dataUrl,image);assert.equal(result.key,'image-A');
 assert.equal(h.signal().aborted,true);assert.equal(h.draws(),1);assert.equal(h.time.timers.size,0);
 if(stage==='reader')assert.equal(h.reader().readyState,2);
});
test('fetch atrasado não inicia FileReader depois do timeout e da captura alternativa',async()=>{
 const h=captureHarness(),pending=h.ctx.capture();await flush();h.time.fire(12000);
 assert.equal((await pending).dataUrl,image);h.release();await flush();
 assert.equal(h.reads(),0);assert.equal(h.draws(),1);
});
test('CORS no canvas devolve falha para o runner tentar outra captura, sem espera infinita',async()=>{
 const h=captureHarness({canvas:false}),pending=h.ctx.capture();await flush();h.time.fire(12000);
 const result=await pending;assert.equal(result.dataUrl,'');assert.match(result.captureError,/12 s.*tainted canvas/);
});
test('download normal mantém bytes originais e limpa o temporizador',async()=>{
 const h=captureHarness({stage:'ok'}),result=await h.ctx.capture();
 assert.equal(result.dataUrl,image);assert.equal(h.draws(),0);assert.equal(h.signal().aborted,false);assert.equal(h.time.timers.size,0);
});
for(const changed of [{key:'other-image'},{url:'https://chatgpt.com/c/other-chat'},{generating:true},{submitted:false},{imageCount:2}])
 test(`recusa bytes se a resposta mudar durante leitura: ${JSON.stringify(changed)}`,async()=>{
  const h=captureHarness({stage:'ok',latest:{...state,...changed}});
  const result=await h.ctx.capture();assert.equal(result.dataUrl,'');assert.match(result.captureError,/mudou durante/);
 });

function deadlineHarness(){
 const time=clock(),waits=new Set(),ctx=vm.createContext({...time,waits,AbortController,URL,executionContext:null});
 vm.runInContext(section(runner,'function readWithDeadline(','async function assertActive('),ctx);
 return {time,ctx,waits};
}
test('consulta suspensa do Chrome libera o runner após o prazo e ignora retorno tardio',async()=>{
 const h=deadlineHarness();let resolveRead;
 const pending=h.ctx.readWithDeadline(()=>new Promise(resolve=>{resolveRead=resolve;}),20000,'captura');
 const rejected=assert.rejects(pending,/CAPTURA_PENDENTE/);await flush();h.time.fire(20000);await rejected;
 assert.equal(h.waits.size,0);resolveRead('late');await flush();assert.equal(h.time.timers.size,0);
});
test('pausar cancela consulta pendente imediatamente',async()=>{
 const h=deadlineHarness();let cancelled=0;
 const pending=h.ctx.readWithDeadline(forever,20000,'captura',()=>cancelled++);
 const rejected=assert.rejects(pending,/Pausa solicitada/);for(const cancel of h.waits)cancel();await rejected;
 assert.equal(cancelled,1);assert.equal(h.waits.size,0);assert.equal(h.time.timers.size,0);
});
test('as duas tentativas do download externo têm prazo inclusive quando o corpo trava',async()=>{
 const h=deadlineHarness(),signals=[];
 h.ctx.fetch=async(_url,options)=>{signals.push(options.signal);return {ok:true,blob:forever};};
 vm.runInContext(section(runner,'const validImageSource=','// Último recurso automático'),h.ctx);
 const pending=h.ctx.captureFromSource('https://chatgpt.com/image-A');
 await flush();h.time.fire(10000);await flush();h.time.fire(10000);
 assert.equal(await pending,'');assert.equal(signals.length,2);assert.ok(signals.every(s=>s.aborted));
});
test('falha na leitura da página recupera a mesma imagem e preserva o recibo da posição',async()=>{
 const reports=[],operations=[];
 const request={token:'one',sent:true,chatUrl:state.url,baselineUserCount:0};
 const job={nonce:'own-job',sku:'11001',slot:1,itemId:'10',modelId:'0',current:request,status:'active'};
 const ctx=vm.createContext({job,Date,getJob:async()=>job,assertActive:async()=>{},
  evidenceFor:()=>({}),rememberResponse:async()=>{},save:async()=>{},sleep:async()=>{},
  report:async(_job,text)=>reports.push(text),captureFromSource:async()=>image,
  op:async(_tab,operation)=>{operations.push(operation);if(operation==='draft')return {text:''};
   if(operation==='capture')throw Error('CAPTURA_PENDENTE: consulta sem resposta');
   return {...state,source:'https://chatgpt.com/image-A'};}
 });
 vm.runInContext(section(runner,'function ownResponse(','async function rememberResponse(')+
  section(runner,'async function awaitImage(','async function upload('),ctx);
 assert.equal(await ctx.awaitImage(job,7,request),image);
 assert.equal(request.captureReceipt.sku,'11001');assert.equal(request.captureReceipt.slot,1);
 assert.equal(request.captureReceipt.imageKey,'image-A');
 assert.ok(reports.some(x=>x.includes('capturando o arquivo')));
 assert.ok(reports.some(x=>x.includes('outra forma')));assert.equal(operations.filter(x=>x==='send').length,0);
});

function recoveryHarness({pending=false,replace=false}={}){
 const job={nonce:'own',slot:1,sku:'11001',pending,status:'active',current:{sent:true}};
 const time=clock(),controls=[],ctx=vm.createContext({...time,job,running:true,retryTimer:null,pendingWake:null,output:{},
  getJob:async()=>replace?{...job,nonce:'other'}:job,
  BridgeState:{control:async(nonce,status)=>{controls.push([nonce,status]);job.status=status;return job;}},
  cancelWaits:()=>{ctx.running=false;}
 });
 vm.runInContext(section(runner,'async function interruptImageRead(','document.getElementById(\'manualRecovery\')'),ctx);
 return {ctx,job,controls};
}
test('Recuperar interrompe o monitor ativo antes de retomar, preservando pedido e posição',async()=>{
 const h=recoveryHarness();assert.equal(await h.ctx.interruptImageRead(h.job),true);
 assert.deepEqual(h.controls,[['own','paused']]);assert.equal(h.job.current.sent,true);assert.equal(h.job.slot,1);
});
test('Recuperar não interrompe imagem já em entrega nem a tarefa de outra SKU',async()=>{
 for(const options of [{pending:true},{replace:true}]){
  const h=recoveryHarness(options);assert.equal(await h.ctx.interruptImageRead(h.job),false);assert.deepEqual(h.controls,[]);
 }
});
