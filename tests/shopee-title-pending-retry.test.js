import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import {validateReview} from '../shopeeOptimizationWorkflow.js';
import {compileShopeeExecutionPlan,normalizeShopeeExecutionStage,shopeeMatrixPendingSnapshot,
 shouldAttachCommercialDiscount,confirmShopeeExecution,assertLiveShopeeUnchanged,
 approvedShopeeReadbackConvergence,videoMatches} from '../shopeeExecutionPlan.js';
import crypto from 'node:crypto';
import {advanceShopeeExecution} from '../shopeeExecutionWorker.js';
import {auditRootShopeeExecution} from '../shopeeExecutionHealth.js';
import {shopeeExecutionProgress} from '../shopeeExecutionProgress.js';

// Regressão do anúncio que manteve o título de 39 caracteres apesar da revisão.
const title='🛟 Boia Colchão Inflável 183x69cm para Piscina e Praia, 100% PVC com Apoio para Cabeça, Gomos e Cor Sortida 🌊';
const supplierName='Colchão Inflável Piscina 183x69cm Verão';
const context=()=>({shopId:1,itemId:'58271518811',modelId:'0',sku:'WS20357',
 singleProductName:supplierName,
 record:{itemId:'58271518811',selectedModelId:'0',sku:'WS20357',status:'NORMAL',
  imageCount:9,attributeAudit:{attributes:[],missingMandatory:0}},
 live:{item_id:58271518811,item_sku:'WS20357',item_name:supplierName,item_status:'NORMAL',
  description:'Descrição já publicada',description_type:'normal',image:{image_id_list:['foto-existente']},
  video_info:[{video_id:'video-existente'}],tax_info:{}},
 review:{stages:{seo:{reviewed:true},description:{reviewed:true}},
  draftTitle:title,draftDescription:'Descrição já publicada'}});
const visualScope={document:{getElementById:()=>null}};
vm.runInNewContext(readFileSync(new URL('../public/optimizer-execution-visual.js',import.meta.url),'utf8'),visualScope);
const derive=visualScope.RAExecutionVisual.derive;

test('título aprovado com medida comprovada chega ao envio, confirma no anúncio e não é repetido',async()=>{
 const input=context();
 const checked=validateReview({stage:'seo',reviewed:true,title},{singleProductName:supplierName});
 assert.equal(checked.title,title);
 for(const selectedStage of ['all','seo']){
  const plan=compileShopeeExecutionPlan({...input,selectedStage});
  assert.equal(plan.canExecute,true);
  assert.deepEqual(plan.actions,['item_name']);
  assert.deepEqual(plan.proposed,{item_name:title});
  let live=structuredClone(input.live),writes=[];
  const io={read:async()=>live,validateIdentity:async()=>{},beforeWrite:async()=>{},
   update:async payload=>{writes.push(payload);live={...live,item_name:payload.item_name};return {request_id:'test'};}};
  let job={state:'running',plan,result:{phase:'queued'}};
  let next=await advanceShopeeExecution(job,io);
  assert.equal(next.state,'running');
  assert.deepEqual(writes,[{item_id:58271518811,item_name:title}]);
  job={...job,...next};
  next=await advanceShopeeExecution(job,io);
  assert.equal(next.state,'verified');
  const audit=auditRootShopeeExecution({...input,live,job:{...job,...next}});
  assert.equal(audit.stages.find(s=>s.id==='seo').status,'confirmed');
  const refreshed=compileShopeeExecutionPlan({...input,live,selectedStage});
  assert.deepEqual(refreshed.actions,[]);
  assert.equal(refreshed.confirmedStages.seo,true);
  await advanceShopeeExecution({...job,result:{phase:'queued'}},io);
  assert.equal(writes.length,1,'mesmo job relido não repete título nem mídia');
 }
});

test('aceite da API sem título alterado continua pendente, sem reenvio cego',async()=>{
 const input=context(),plan=compileShopeeExecutionPlan({...input,selectedStage:'seo'});
 let writes=0;
 const io={read:async()=>input.live,validateIdentity:async()=>{},beforeWrite:async()=>{},
  update:async()=>{writes++;return {request_id:'accepted-without-change'};}};
 let job={state:'running',plan,result:{phase:'queued'}};
 const accepted=await advanceShopeeExecution(job,io);
 job={...job,...accepted};
 const readback=await advanceShopeeExecution(job,io);
 assert.equal(readback.state,'running');
 assert.equal(readback.result.phase,'verifying');
 const audit=auditRootShopeeExecution({...input,job:{...job,...readback}});
 const seo=audit.stages.find(s=>s.id==='seo');
 assert.equal(seo.status,'pending');
 assert.equal(seo.currentValue,supplierName);
 assert.equal(seo.expectedValue,title);
 assert.equal(audit.complete,false);
 assert.equal(writes,1);
});

test('medidas sem fonte e título sem revisão ficam pendentes com o motivo visível',()=>{
 for(const singleProductName of ['', 'Outro produto 180x60cm']){
  const input={...context(),singleProductName};
  const plan=compileShopeeExecutionPlan(input);
  assert.equal(plan.canExecute,false);
  assert.deepEqual(plan.actions,[]);
  assert.equal(plan.deferredStages[0].stage,'seo');
  const job={state:'blocked',plan};
  const progress=shopeeExecutionProgress(job);
  assert.equal(progress.steps.find(s=>s.id==='seo').status,'attention');
  assert.match(progress.message,/Título SEO.*dimensões/);
  const ui=derive({job,progress,rootAudit:auditRootShopeeExecution({...input,job})});
  assert.match(ui.title,/Título SEO.*pendente/);
  assert.match(ui.detail,/dimensões/);
  assert.equal(ui.states[2],'error');
  assert.notEqual(ui.states[8],'done');
 }
 const input=context();input.review.stages.seo.reviewed=false;
 assert.equal(compileShopeeExecutionPlan(input).canExecute,false);
 assert.throws(()=>compileShopeeExecutionPlan({...context(),sku:'OUTRA'}),/SKU diferente/);
});

test('etapas já confirmadas na preparação continuam visíveis mesmo com título bloqueado',()=>{
 const plan=compileShopeeExecutionPlan({...context(),singleProductName:''});
 plan.confirmedStages={images:true,video:true,seo:false,description:true,technical:true,fiscal:true};
 const job={state:'blocked',plan},progress=shopeeExecutionProgress(job);
 for(const id of ['images','video','description','technical','fiscal'])
  assert.equal(progress.steps.find(s=>s.id===id).status,'done',id);
 assert.equal(progress.steps.find(s=>s.id==='seo').status,'attention');
 const ui=derive({job,progress});
 assert.equal(ui.completed,5);
 assert.equal(ui.percent,0,'percentual técnico não inventa uma tentativa');
});

test('auditoria atual prevalece sobre check antigo e job parcial não conclui anúncio',()=>{
 const input=context();
 const job={state:'verified',plan:{selectedStage:'description'},result:{phase:'verified'}};
 const rootAudit=auditRootShopeeExecution({...input,job});
 const ui=derive({job,rootAudit,progress:{hasStarted:true,percent:100,
  steps:[{id:'seo',status:'done'},{id:'description',status:'done'}]}});
 assert.equal(ui.states[2],'pending');
 assert.notEqual(ui.states[8],'done');
 assert.match(ui.detail,/Título SEO.*não corresponde/);
 assert.equal(derive({job,rootAudit:{complete:true,stages:[]}}).states[8],'done');
});

test('retomada aguarda auditoria em curso e descarta cache quando a leitura falha',async()=>{
 const source=readFileSync(new URL('../public/app.js',import.meta.url),'utf8');
 const code=source.slice(source.indexOf('async function optimizerRootAuditRefresh('),
  source.indexOf('let optimizerVideoAutoReadbackKey='));
 const key='WS20357|58271518811|0';let resolve,calls=0;
 const scope={optimizerWorkflowPlan:{sku:'WS20357',itemId:'58271518811',modelId:'0'},
  optimizerRootAuditCache:new Map([[key,{audit:{complete:true},at:0}]]),
  optimizerRootAuditPending:null,optimizerRootAuditRender:()=>{},
  optimizerExecutionVisualPaint:()=>{},optimizerExecProgress:null,optimizerExecJob:null,
  URLSearchParams,AbortSignal,$:()=>null,json:()=>{calls++;return new Promise(r=>{resolve=r;});}};
 vm.runInNewContext(code,scope);
 const a=scope.optimizerRootAuditRefresh(true),b=scope.optimizerRootAuditRefresh(true);
 let finished=false;b.then(()=>{finished=true;});
 await Promise.resolve();
 assert.equal(calls,1);assert.equal(finished,false);
 assert.equal(scope.optimizerRootAuditCache.has(key),false);
 resolve({audit:{complete:false,stages:[{id:'seo',status:'pending'}]}});
 await Promise.all([a,b]);
 assert.equal(scope.optimizerRootAuditCache.get(key).audit.complete,false);
 scope.json=async()=>{throw Error('Falha Shopee');};
 await scope.optimizerRootAuditRefresh(true);
 assert.equal(scope.optimizerRootAuditCache.has(key),false);
});

test('rotas de preparo e execução revalidam a fonte da SKU, ignorando nome informado pelo cliente',async()=>{
 const source=readFileSync(new URL('../server.js',import.meta.url),'utf8');
 const routeCode=path=>{
  const start=source.indexOf("app.post('"+path+"'");
  return source.slice(start,source.indexOf('\n});',start)+4);
 };
 for(const selectedStage of ['all','seo'])for(const matchedBy of ['exact-sku','reviewed-link','unverified']){
  const input=context(),handlers={},lookups=[];let saved,claimed=0;
  const scope={app:{post:(path,...args)=>{handlers[path]=args.at(-1);}},mustLogin:()=>{},requireWeDropAdmin:()=>{},
   crypto,console:{warn:()=>{}},verifiedSameOrigin:()=>true,
   checkedWorkflowAudit:async()=>({...input,auth:{shopId:1},cfg:{}}),
   getWorkflowReview:async()=>({sku:input.sku,review_state:input.review}),
   shopeeLiveEditableItem:async()=>input.live,getShopeeManualVideo:async()=>null,
   readPreparedImages:async()=>[],readShopeeExecution:async()=>saved,
   readWeDropProduct:async(shop,identity)=>{lookups.push({shop,...identity});
    return {matchedBy,product_data:{name:supplierName}};},
   assertShopeeSupplierBrand:()=>{},normalizeShopeeExecutionStage,compileShopeeExecutionPlan,
   shopeeExecutionProgress,shopeeMatrixPendingSnapshot,shouldAttachCommercialDiscount,
   confirmShopeeExecution,assertLiveShopeeUnchanged,approvedShopeeReadbackConvergence,videoMatches,
   recyclableShopeeMedia:()=>({}),archiveShopeeMedia:()=>({}),
   saveShopeePreparedExecution:async(shop,item,model,sku,plan)=>
    (saved={sku,plan,state:plan.canExecute?'prepared':'blocked',updated_at:'2026-11-05T00:00:00Z'}),
   claimShopeePreparedExecution:async()=>{claimed++;},runOptimizerJobs:()=>{}};
  const prepare='/api/shopee/optimizer/execution/prepare',execute='/api/shopee/optimizer/execution/execute';
  vm.runInNewContext(routeCode(prepare)+'\n'+routeCode(execute),scope);
  const response=()=>({code:200,body:null,setHeader(){},status(code){this.code=code;return this;},json(body){this.body=body;return this;}});
  let res=response();
  await handlers[prepare]({body:{...input,stage:selectedStage,singleProductName:supplierName}},res);
  assert.equal(res.code,200,JSON.stringify(res.body));
  assert.equal(saved.plan.canExecute,matchedBy!=='unverified');
  assert.equal(lookups.length,1);
  assert.equal(lookups[0].sku,input.sku);
  assert.equal(lookups[0].itemId,input.itemId);
  if(matchedBy==='unverified')continue;
  res=response();
  await handlers[execute]({body:{sku:input.sku,itemId:input.itemId,modelId:'0',stage:selectedStage,
   acceptPartialExecution:true,confirmation:'EXECUTAR WS20357',planId:saved.plan.planId,
   updatedAt:saved.updated_at,singleProductName:'Nome adulterado 999x999cm'}},res);
  assert.equal(res.code,202,JSON.stringify(res.body));
  assert.equal(claimed,1);
  assert.equal(lookups.length,2,'a fonte é consultada novamente antes de autorizar o worker');
 }
});
