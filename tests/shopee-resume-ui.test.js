import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
import {shopeeExecutionProgress} from '../shopeeExecutionProgress.js';

const source=readFileSync(new URL('../public/app.js',import.meta.url),'utf8');
const html=readFileSync(new URL('../public/index.html',import.meta.url),'utf8');
const piece=(start,end)=>source.slice(source.indexOf(start),source.indexOf(end,source.indexOf(start)));
class Element{
 hidden=true;disabled=false;children=[];style={};dataset={};value='';checked=false;listeners={};
 classList={remove(){}};
 append(...nodes){this.children.push(...nodes);} appendChild(node){this.append(node);}
 prepend(...nodes){this.children.unshift(...nodes);} replaceChildren(...nodes){this.children=[...nodes];}
 setAttribute(name,value){this[name]=value;} removeAttribute(name){delete this[name];}
 scrollIntoView(){this.scrolled=true;} querySelectorAll(){return [];}
 addEventListener(name,fn){this.listeners[name]=fn;}
}
function setup(){
 const elements=new Map([...html.matchAll(/id="([^"]+)"/g)].map(x=>['#'+x[1],new Element()]));
 const $=id=>elements.get(id)||null;
 $('#optimizerExecutionScope').value='all';
 $('#optimizerExecDiscountCampaign').value='123';
 const w={sku:'SKU',itemId:'2',modelId:'0',productTitle:'Produto',imageUrls:[],variationConfig:{enabled:true}};
 const plan={shopId:1,sku:'SKU',itemId:'2',modelId:'0',planId:'prepared-id',selectedStage:'all',
  canExecute:true,proposed:{description:'Descrição revisada'},original:{item_name:'Produto'},
  images:Array.from({length:9},(_,i)=>({slot:i+1})),video:{filename:'Vídeo aprovado.mp4'},
  modelVariations:{type:'Cor',options:[{name:'Vermelho'},{name:'Rosa'}],promotion:{discountId:'123'}},
  reusedMedia:{imageIds:Array.from({length:9},(_,i)=>'media-'+i),video:{id:'ready',phase:'ready'}},
  actions:['description','images','video','model_variations'],blocked:[],warnings:[]};
 const job={sku:'SKU',item_id:2,model_id:0,state:'prepared',plan,result:null,updated_at:'2026-10-23T11:00:00Z'};
 const progress=shopeeExecutionProgress(job);
 const prepared={ready:true,plan,progress,executionStatus:'prepared',updatedAt:job.updated_at,
  autoModelDiscountToken:'fixture-signed-token',autoModelDiscountPreview:{discountId:'123',gross:740,promo:555,modelPriceChange:true}};
 const timers=[],requests=[];
 const ctx=vm.createContext({$,Date,AbortSignal,URLSearchParams,
  optimizerWorkflowPlan:w,optimizerWorkflowStage:null,optimizerExecContext:{...w},
  optimizerExecPlan:null,optimizerExecJob:null,optimizerExecProgress:null,
  optimizerExecBusy:false,optimizerExecSerial:0,optimizerExecPreparation:null,
  optimizerExecPoll:null,optimizerExecPolling:false,optimizerExecStartError:'',
  optimizerExecAutoModelToken:null,optimizerExecAutoModelPreview:null,
  optimizerExecSafeRecoveryKey:'',optimizerExecSafeRecovering:false,
  optimizerDiscountFinalPreviewData:null,
  optimizerMake:(tag,cls,text)=>Object.assign(new Element(),{textContent:text||''}),
  optimizerExecFiscalLast(){},optimizerExecRow(){},optimizerExecDiff(){},
  optimizerExecutionIssueRender(){},optimizerDiscountFinalLoad:async()=>{},
  optimizerDiscountFinalPaint(){},optimizerDiscountApprovalReady:()=>false,
  optimizerDiscountAuthorizedIntent:()=>null,optimizerDiscountOpenReview:()=>{throw Error('Must open saved execution');},
  optimizerFinalPendingRefresh:async()=>{},optimizerExecutionAutoRecoverStale(){},
  optimizerWorkflowNotice(){},shPriceMoney:String,shPricePercent:String,
  json:async(url,options)=>{requests.push({url,body:options?.body&&JSON.parse(options.body)});
   if(url.endsWith('/prepare'))return prepared;
   if(url.endsWith('/execute'))return {ok:true,status:'running'};
   return {job,progress};},
  setTimeout:(fn,delay)=>{timers.push({fn,delay});return timers.length;},clearTimeout(){}
 });
 const functions=[
  ['function optimizerExecNotice(', '// Acompanhamento em tempo real'],
  ['function optimizerExecutionTrackerRender(', 'function optimizerExecutionIssueRender('],
  ['function optimizerExecRender(', 'async function optimizerConnectionCheck('],
  ['async function optimizerExecutionPrepare(', "$('#optimizerExecutionPrepare')?.addEventListener"],
  ['function optimizerExecutionNeedsFreshPreview(', '// A fiscal batch'],
  ['function optimizerExecutionJobView(', '// One readback-only reconciliation'],
  ['async function optimizerExecutionRefresh(', "$('#optimizerExecutionRefresh')?.addEventListener"]
 ];
 for(const [begin,end] of functions)vm.runInContext(piece(begin,end),ctx);
 vm.runInContext(piece("$('#optimizerShowExecution')?.addEventListener", "$('#optimizerWorkflowNext')?.addEventListener"),ctx);
 return {ctx,$,job,progress,prepared,requests,timers};
}
test('reopen restores the tracker and saved media before a new preparation finishes',async()=>{
 const {ctx,$,job,progress,prepared}=setup();
 ctx.optimizerExecutionJobView(job,progress);
 assert.equal($('#optimizerExecutionPanel').hidden,false);
 assert.equal($('#optimizerExecutionTracker').hidden,false);
 assert.match($('#optimizerExecutionMediaCount').textContent,/9 \/ 9/);
 assert.match($('#optimizerExecutionLiveBadge').textContent,/Pronto para retomar/);
 ctx.optimizerExecRender(prepared);
 assert.equal($('#optimizerExecutionLaunch').hidden,false);
 assert.equal($('#optimizerExecutionLaunch').disabled,false);
 assert.match($('#optimizerExecutionLaunch').textContent,/Retomar de onde parou/);
 ctx.optimizerExecReset();
 assert.equal($('#optimizerExecutionTracker').hidden,false);
 assert.equal(ctx.optimizerExecPlan,null);
 ctx.optimizerWorkflowPlan={...ctx.optimizerWorkflowPlan,sku:'OTHER',itemId:'3'};
 ctx.optimizerExecReset();
 assert.equal($('#optimizerExecutionTracker').hidden,true);
});
test('repeated prepare clicks use one request and keep progress visible while waiting',async()=>{
 const {ctx,$,job,progress,prepared,requests}=setup();
 let release;
 const wait=new Promise(resolve=>release=resolve);
 ctx.json=async url=>{requests.push(url);if(url.endsWith('/prepare')){await wait;return prepared;}return {job,progress};};
 const first=ctx.optimizerExecutionPrepare();
 await new Promise(resolve=>setImmediate(resolve));
 assert.equal($('#optimizerExecutionTracker').hidden,false);
 await ctx.optimizerExecutionPrepare();
 assert.equal(requests.filter(x=>x.endsWith('/prepare')).length,1);
 release();await first;
 assert.equal($('#optimizerExecutionLaunch').hidden,false);
 assert.equal($('#optimizerExecutionPrepare').disabled,false);
});
test('opening saved execution does not require the parent discount preview',async()=>{
 const {ctx,$,job,progress}=setup();
 ctx.optimizerExecutionJobView(job,progress);
 $('#optimizerShowExecution').listeners.click();
 await new Promise(resolve=>setImmediate(resolve));
 assert.equal($('#optimizerExecutionPanel').hidden,false);
 assert.equal($('#optimizerExecutionTracker').hidden,false);
 assert.equal($('#optimizerExecutionLaunch').disabled,false);
});
test('a draft changed during preparation schedules one fresh preview and preserves the tracker',async()=>{
 const {ctx,$,job,progress,prepared,timers}=setup();
 let release;
 const wait=new Promise(resolve=>release=resolve);
 ctx.json=async url=>{if(url.endsWith('/prepare')){await wait;return prepared;}return {job,progress};};
 const first=ctx.optimizerExecutionPrepare();
 await new Promise(resolve=>setImmediate(resolve));
 ctx.optimizerExecReset();
 await ctx.optimizerExecutionPrepare();
 release();await first;
 assert.equal($('#optimizerExecutionTracker').hidden,false);
 assert.equal(ctx.optimizerExecPlan,null);
 assert.equal(timers.filter(x=>x.delay===100).length,1);
 await timers.find(x=>x.delay===100).fn();
 await new Promise(resolve=>setImmediate(resolve));
 assert.equal($('#optimizerExecutionLaunch').hidden,false);
});
test('resume keeps the tracker open and sends one approved execute request',async()=>{
 const {ctx,$,prepared,requests}=setup();
 ctx.optimizerExecRender(prepared);
 await ctx.optimizerExecuteApproved();
 const sent=requests.filter(x=>x.url.endsWith('/execute'));
 assert.equal(sent.length,1);
 assert.equal(sent[0].body.planId,prepared.plan.planId);
 assert.equal(sent[0].body.discountApprovalToken,'fixture-signed-token');
 assert.equal(sent[0].body.allowPriceChange,true);
 assert.equal($('#optimizerExecutionTracker').hidden,false);
 assert.equal($('#optimizerExecutionTracker').scrolled,true);
});
test('reloading an active job opens its saved phase without preparing another plan',async()=>{
 const {ctx,$,job,requests}=setup();
 const active={...job,state:'running',result:{phase:'variation_verifying',primaryVerified:true,
  ...job.plan.reusedMedia}};
 ctx.json=async url=>{requests.push(url);return {job:active,progress:shopeeExecutionProgress(active)};};
 await ctx.optimizerExecutionPrepare();
 assert.equal(requests.filter(x=>x.endsWith('/prepare')).length,0);
 assert.equal($('#optimizerExecutionTracker').hidden,false);
 assert.match($('#optimizerExecutionPhaseTitle').textContent,/Conferindo modelos/);
});
