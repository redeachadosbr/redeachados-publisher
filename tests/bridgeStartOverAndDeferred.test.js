import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
const app=readFileSync(new URL('../public/app.js',import.meta.url),'utf8');
const bridgeFile=name=>readFileSync(new URL('../chrome-extension-chatgpt/'+name,import.meta.url),'utf8');
const old={nonce:'old-session-123456',sku:'OLD',itemId:'12',modelId:'0',status:'active',schema:14,completed:[1,2],slot:3,controlEpoch:0};
const request=(overrides={})=>({nonce:'new-session-123456',sku:'NEW',itemId:'34',modelId:'0',prompts:Array(9).fill('Fotografia comercial real do produto exato, somente uma cena por imagem.'),imageUrl:'https://cf.shopee.com.br/file/original',completed:[],deferredSlots:[3],restart:true,...overrides});
function extension(job=old){
 const key='redeAchadosChatGptBridgeJobV1',media='redeAchadosBridgeMediaV14_'+old.nonce+'_pending_3';
 const storage={[key]:structuredClone(job),[media]:'preserved-image'};
 const area={get:async key=>typeof key==='string'?{[key]:structuredClone(storage[key])}:structuredClone(storage),set:async rows=>Object.assign(storage,structuredClone(rows)),remove:async keys=>{for(const key of Array.isArray(keys)?keys:[keys])delete storage[key];}};
 let listener;
 const chrome={storage:{local:area,session:area},runtime:{id:'test',getURL:path=>'chrome-extension://test/'+path,getManifest:()=>({version:'1.0.65'}),sendMessage:async()=>({ok:true}),onMessage:{addListener:fn=>listener=fn}},tabs:{query:async()=>[{id:2,url:'chrome-extension://test/runner.html'}],get:async id=>({id,url:'chrome-extension://test/runner.html'}),update:async()=>{},onUpdated:{addListener(){}}},webNavigation:{onHistoryStateUpdated:{addListener(){}}}};
 const ctx=vm.createContext({chrome,URL,Date,console,importScripts(){},navigator:{locks:{request:async(name,options,fn)=>typeof options==='function'?options():fn({})}},setTimeout});
 for(const name of ['state.js','flow-policy.js','background.js'])vm.runInContext(bridgeFile(name),ctx);
 return {ctx,storage,key,media,send:message=>new Promise(resolve=>listener(message,{tab:{id:7,url:'https://redeachados-shopee.onrender.com/app/otimizacao'}},resolve))};
}
test('novo produto substitui sessão travada ou concluída sem apagar a mídia anterior',async()=>{
 for(const status of ['active','paused','done']){
  const h=extension({...old,status});
  await h.ctx.start(h.ctx.validateRequest(request()),{tab:{id:7}});
  assert.equal(h.storage[h.key].sku,'NEW');
  assert.equal(h.storage[h.key].slot,1);
  assert.equal(h.storage[h.key].previousOwnedChat,null);
  assert.equal(h.storage[h.media],'preserved-image');
  assert.equal(h.storage['redeAchadosChatGptBridgeReplaced_'+old.nonce].sku,'OLD');
  assert.deepEqual(Array.from(h.storage[h.key].completed),[]);
  assert.deepEqual(Array.from(h.storage[h.key].deferredSlots),[3]);
 }
});
test('reinício explícito substitui sessão da mesma SKU e rejeita payload parcial',async()=>{
 const h=extension();
 await h.ctx.start(h.ctx.validateRequest(request({sku:'OLD',itemId:'12'})),{tab:{id:7}});
 assert.equal(h.storage[h.key].nonce,'new-session-123456');
 assert.throws(()=>h.ctx.validateRequest(request({completed:[1]})),/Reinício total/);
 assert.throws(()=>h.ctx.validateRequest(request({deferredSlots:[2]})),/pendente inválida/);
 assert.throws(()=>h.ctx.validateRequest(request({completed:[3]})),/pendente inválida/);
});
test('reconciliação mantém 03 pendente, avança para 04 e volta para 03 após correção',async()=>{
 const h=extension();
 const payload={sku:'OLD',itemId:'12',modelId:'0',completed:[1,2],deferredSlots:[3]};
 const next=await h.send({kind:'RA_CONTINUE_SITE',payload});
 assert.equal(next.ok,true);assert.equal(next.slot,4);
 assert.deepEqual(Array.from(h.storage[h.key].completed),[1,2]);
 const resumed=await h.send({kind:'RA_CONTINUE_SITE',payload:{...payload,completed:[1,2,4,5,6,7,8,9],deferredSlots:[]}});
 assert.equal(resumed.slot,3);
 assert.deepEqual(Array.from(h.storage[h.key].deferredSlots),[]);
});
test('o runner termina a sequência disponível com 8/9 e não anuncia conclusão de 03',async()=>{
 const h=extension({...old,completed:[1,2,4,5,6,7,8,9],deferredSlots:[3],slot:9});
 assert.equal(h.ctx.BridgeFlowPolicy.done(h.storage[h.key]),false);
 assert.equal(h.ctx.BridgeFlowPolicy.availableDone(h.storage[h.key]),true);
 const runner=bridgeFile('runner.js');
 const body=runner.slice(runner.indexOf('async function run(){'),runner.indexOf('function updatePendingButton('));
 const reports=[];
 const ctx={running:false,startedNonce:null,startedEpoch:null,myTabId:2,executionContext:null,pendingWake:null,
  chrome:{runtime:{sendMessage:async()=>({ok:true})}},BridgeState:{lock:async(n,fn)=>fn({}),halted:h.ctx.BridgeState.halted},
  getJob:async()=>h.storage[h.key],save:async job=>{h.storage[h.key]=job;},assertActive:async()=>{},
  BridgeFlowPolicy:h.ctx.BridgeFlowPolicy,report:async(job,message)=>reports.push(message),output:{},queueMicrotask,
 };
 vm.createContext(ctx);vm.runInContext(body,ctx);await ctx.run();
 assert.equal(h.storage[h.key].status,'paused');
 assert.equal(h.storage[h.key].completed.length,8);
 assert.match(reports.at(-1),/8\/9 imagens salvas/);
 assert.doesNotMatch(reports.join('\n'),/9\/9 imagens armazenadas/);
});
function managerReset({saved=[1,2],confirm=true,ack=true,version='1.0.65'}={}){
 const elements=new Map(),sent=[],deleted=[],messages=[];let rows=saved.map(slot=>({slot}));
 const w={sku:'NEW',itemId:'34',modelId:'0',stages:[{key:'images',reviewed:true}]};
 const ctx={optimizerWorkflowPlan:w,$:id=>{if(!elements.has(id))elements.set(id,{disabled:false});return elements.get(id);},
  optimizerChatBridgeNotice:m=>messages.push(m),optimizerCommercialActionMessage:()=>{},optimizerImagesSameSku:x=>x===w,
  optimizerChatgptCommandEpoch:0,optimizerChatgptResetBusy:false,optimizerChatgptContinueBusy:true,
  optimizerChatBridgeWaitReady:async()=>true,optimizerChatgptMakeBrief:async()=>({bridgeOriginal:'https://cf.shopee.com.br/file/original',prompts:Array(9).fill('valid prompt')}),
  optimizerRequireThirdChatgptDimensions:async()=>{throw Error('sem medidas');},optimizerChatBridgeVersion:version,
  json:async(url,options)=>{if(options?.method==='DELETE'){const q=new URL(url,'https://manager.example').searchParams;deleted.push(Object.fromEntries(q));rows=rows.filter(r=>r.slot!==Number(q.get('slot')));return {deleted:true};}return {images:rows};},
  confirm:()=>confirm,optimizerChatBridgeSwitchSku:async()=>{},optimizerChatBridgeRelease:async()=>{},optimizerChatBridgeActiveClear:()=>{},
  optimizerChatBridgeNonce:'old-session-123456',optimizerChatBridgeJob:{...old},optimizerChatBridgeSku:'OLD',optimizerChatBridgeBusy:true,optimizerChatBridgeUploading:false,
  sessionStorage:{removeItem(){},setItem(){}},RA_CHAT_BRIDGE_JOB_KEY:'job',RA_CHAT_BRIDGE_SESSION_KEY:'session',
  optimizerImagesSavedSlots:new Set(saved),optimizerChatgptBrief:null,optimizerChatgptBriefSku:'',optimizerImagesMode:'',optimizerImagesRenderMode:()=>{},optimizerExecReset:()=>{},
  crypto:{randomUUID:()=> 'new-session-123456'},optimizerChatBridgeRemember:(w,slots)=>{ctx.remembered=slots;},optimizerChatBridgeStartConfirmed:false,
  optimizerWaitBridgeReply:async()=>({ok:ack,error:ack?'':'timeout'}),window:{postMessage:m=>sent.push(m)},location:{origin:'https://manager.example'},optimizerImagesLoad:async()=>{},URLSearchParams,
 };
 vm.createContext(ctx);
 vm.runInContext(app.slice(app.indexOf('async function optimizerChatgptDeferredSlots('),app.indexOf('let optimizerChatgptCommandEpoch=')),ctx);
 vm.runInContext(app.slice(app.indexOf('async function optimizerChatgptStartOver('),app.indexOf('// Recuperação não destrutiva: posições já confirmadas')),ctx);
 return {ctx,sent,deleted,messages,w};
}
test('Começar do zero funciona com outra SKU ativa, sem medidas, e limpa apenas a SKU escolhida',async()=>{
 const h=managerReset();const result=await h.ctx.optimizerChatgptStartOver();
 assert.equal(result.ok,true);
 assert.equal(h.ctx.optimizerChatgptCommandEpoch,1);
 assert.equal(h.deleted.length,2);
 for(const row of h.deleted)assert.deepEqual([row.sku,row.item_id,row.model_id],['NEW','34','0']);
 assert.deepEqual(Array.from(h.ctx.remembered),[1,2,4,5,6,7,8,9]);
 const start=h.sent.find(m=>m.kind==='RA_SITE_START').payload;
 assert.equal(start.restart,true);assert.equal(start.completed.length,0);
 assert.deepEqual(Array.from(start.deferredSlots),[3]);
 assert.equal(h.w.stages[0].reviewed,false);
});
test('cancelar ou Ponte incompatível não remove fotos; falta de ACK não é sucesso',async()=>{
 for(const options of [{confirm:false},{version:'1.0.59'}]){
  const h=managerReset(options),result=await h.ctx.optimizerChatgptStartOver();
  assert.equal(result.ok,false);assert.equal(h.deleted.length,0);assert.equal(h.sent.length,0);
 }
 const h=managerReset({saved:[],ack:false});
 assert.equal((await h.ctx.optimizerChatgptStartOver()).ok,false);
 assert.match(h.messages.at(-1),/timeout/);
});
