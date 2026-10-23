import test from 'node:test';
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {createServer} from 'node:net';
import {once} from 'node:events';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
import {advanceShopeeExecution,approvedShopeeModels,reconcileShopeeModelExecution,
 nextShopeePhaseAfterReadback} from '../shopeeExecutionWorker.js';
import {compileShopeeExecutionPlan} from '../shopeeExecutionPlan.js';

const options=[
 {name:'Vermelho',sku:'SKU-VERMELHO',supplierSku:'3747',cost:350,price:745.99,stock:1,gtin:'',noGtin:true},
 {name:'Rosa',sku:'SKU-ROSA',supplierSku:'3746',cost:350,price:745.99,stock:1,gtin:'',noGtin:true}
];
const basePlan={itemId:'2',modelId:'0',sku:'SKU',requiresExplicitConfirmation:true,canExecute:true,
 selectedStage:'all',proposed:{},original:{tax_info:{}},
 modelVariations:{type:'Cor',options},commercialDiscount:{allowPriceChange:true,
  snapshot:{discountId:'123',gross:740,promo:555}}};
const models=(price=740)=>options.map((o,i)=>({model_sku:o.sku,model_id:i+10,
 price_info:[{original_price:price}]}));
const job=(phase,plan=basePlan)=>({state:'uncertain',plan,result:{phase,
 variationStartedAt:Date.now(),modelDiscountStartedAt:Date.now(),modelPriceStartedAt:Date.now()}});
const denied=()=>{throw Error('Reconciliação não pode escrever na Shopee');};
const io=(liveModels=models(),member=null)=>({
 variationRead:async()=>({item:{item_id:2,has_model:liveModels.length>0},models:liveModels}),
 variationCost:async()=>({unitCost:350}),
 variationPromotionRead:async()=>({status:'ongoing',member,action:member?'update':'add'}),
 variationPublish:denied,variationImage:denied,variationLink:denied,
 variationDiscountPublish:denied,variationUpdatePrices:denied,beforeWrite:denied
});
const promotion={model_list:models().map(m=>({model_id:m.model_id,model_promotion_price:555}))};

test('retomada preserva variações antes do fiscal e desconto por modelo após o fiscal',()=>{
 const plan={...basePlan,finalFiscal:{ncm:'95030010'}};
 assert.equal(nextShopeePhaseAfterReadback(plan),'variation_ready');
 assert.equal(nextShopeePhaseAfterReadback(plan,{fiscalVerified:true}),'model_discount_ready');
 assert.equal(nextShopeePhaseAfterReadback({...plan,modelVariations:null}),'fiscal_ready');
 assert.equal(nextShopeePhaseAfterReadback({...plan,modelVariations:null},{fiscalVerified:true}),'discount_ready');
});
test('anúncio-pai correto sem modelos não conclui criação incerta nem repete POST',async()=>{
 const result=await reconcileShopeeModelExecution(job('variation_verifying'),io([]));
 assert.equal(result.state,'uncertain');
 assert.equal(result.result.variation?.status,undefined);
});
test('modelos encontrados retomam o vínculo WeDrop sem publicar novamente',async()=>{
 const result=await reconcileShopeeModelExecution(job('variation_updating'),io());
 assert.equal(result.state,'running');
 assert.equal(result.result.phase,'variation_verifying');
 let linked=0;
 const next=await advanceShopeeExecution({...job('variation_updating'),...result},
  {...io(),variationLink:async()=>linked++});
 assert.equal(linked,1);
 assert.equal(next.result.phase,'model_discount_ready');
});
test('modelos já existentes removidos não são recriados automaticamente',async()=>{
 const plan={...basePlan,modelVariations:{...basePlan.modelVariations,alreadyCreated:true}};
 const result=await advanceShopeeExecution({...job('variation_ready',plan),state:'running'},io([]));
 assert.equal(result.state,'uncertain');
});
test('modelos de mesma SKU com ID alterado ou IDs repetidos não passam na leitura',()=>{
 const plan={...basePlan,modelVariations:{...basePlan.modelVariations,
  options:options.map((o,i)=>({...o,modelId:String(i+10)}))}};
 assert.ok(approvedShopeeModels(plan,{item:{has_model:true},models:models().reverse()}));
 assert.equal(approvedShopeeModels(plan,{item:{has_model:true},models:models().map(m=>({...m,model_id:90}))}),null);
 assert.equal(approvedShopeeModels(plan,{item:{has_model:true},models:models().map(m=>({...m,model_id:m.model_id+2}))}),null);
});
test('reconciliação só conclui promoção se TODAS as opções e preços brutos conferirem',async()=>{
 const complete=await reconcileShopeeModelExecution(job('model_discount_verifying'),io(models(),promotion));
 assert.equal(complete.state,'verified');
 const missing=await reconcileShopeeModelExecution(job('model_discount_verifying'),io(models(),{model_list:promotion.model_list.slice(0,1)}));
 assert.equal(missing.state,'uncertain');
 const wrongBase=await reconcileShopeeModelExecution(job('model_discount_verifying'),io(models(745.99),promotion));
 assert.equal(wrongBase.state,'uncertain');
});
test('custo alterado bloqueia retomada e preço confirmado segue para promoção por modelo',async()=>{
 const price=await reconcileShopeeModelExecution(job('model_discount_price_verifying'),io());
 assert.equal(price.state,'running');
 assert.equal(price.result.phase,'model_discount_ready');
 const changed=await reconcileShopeeModelExecution(job('model_discount_ready'),
  {...io(),variationCost:async()=>({unitCost:400})});
 assert.equal(changed.state,'uncertain');
});
test('GTIN, modelo e preço de qualquer opção invalidam a prévia anterior',()=>{
 const inputs={shopId:1,itemId:'2',modelId:'0',sku:'SKU',record:{sku:'SKU',itemId:'2',status:'NORMAL'},
  review:{},live:{item_id:2,item_name:'Produto',description:'Descrição'},modelVariations:basePlan.modelVariations};
 const before=compileShopeeExecutionPlan(inputs).fingerprint;
 for(const change of [{gtin:'1234567890123',noGtin:false},{modelId:'80'},{price:799.99}]){
  const plan=compileShopeeExecutionPlan({...inputs,modelVariations:{...basePlan.modelVariations,
   options:options.map((o,i)=>i===1?{...o,...change}:o)}});
  assert.notEqual(plan.fingerprint,before);
 }
});

test('interface reconcilia modelos automaticamente uma vez e retoma acompanhamento',async()=>{
 const source=readFileSync(new URL('../public/app.js',import.meta.url),'utf8');
 const begin=source.indexOf("let optimizerAutoReadbackRecoveryKey='';");
 const end=source.indexOf('function optimizerExecutionJobView(',begin);
 const requests=[],scheduled=[],views=[];
 const w={sku:'SKU',itemId:'2',modelId:'0'};
 const pending={...job('model_discount_verifying'),sku:'SKU',item_id:2,model_id:0,
  updated_at:new Date(Date.now()-4*60000).toISOString()};
 const ctx=vm.createContext({Date,AbortSignal,optimizerWorkflowPlan:w,optimizerExecPoll:null,
  json:async(url,request)=>{requests.push({url,body:JSON.parse(request.body)});
   return {job:{...pending,state:'running',result:{phase:'model_discount_ready'}}};},
  optimizerExecutionJobView:j=>views.push(j),optimizerExecNotice:()=>{},
  optimizerExecutionRefresh:()=>{},optimizerExecutionPrepare:denied,
  setTimeout:(fn,delay)=>{scheduled.push(delay);return 1;},clearTimeout:()=>{}});
 vm.runInContext(source.slice(begin,end),ctx);
 ctx.optimizerExecutionAutoRecoverStale({...pending,model_id:77});
 assert.equal(requests.length,0);
 ctx.optimizerExecutionAutoRecoverStale(pending);
 ctx.optimizerExecutionAutoRecoverStale(pending);
 await new Promise(resolve=>setImmediate(resolve));
 assert.equal(requests.length,1);
 assert.equal(requests[0].url,'/api/shopee/optimizer/execution/reconcile');
 assert.equal(requests[0].body.recover,true);
 assert.equal(views[0].result.phase,'model_discount_ready');
 assert.deepEqual(scheduled,[500]);
});

async function httpReconcile(phase,{exists=false,fiscal=false}={}){
 const listener=createServer();listener.listen(0,'127.0.0.1');await once(listener,'listening');
 const port=listener.address().port;await new Promise(r=>listener.close(r));
 const base='http://127.0.0.1:'+port;
 const plan={...basePlan,...(fiscal?{finalFiscal:{ncm:'95030010'}}:{})};
 const saved={...job(phase,plan),shop_id:1,item_id:2,model_id:0,sku:'SKU',
  run_id:'00000000-0000-4000-8000-000000000001',updated_at:new Date().toISOString()};
 const child=spawn(process.execPath,['tests/fixtures/optimizer-server.mjs'],{
  cwd:new URL('..',import.meta.url),env:{PATH:process.env.PATH,PORT:String(port),
   APP_PASSWORD:'fixture-password',SESSION_SECRET:'fixture-session',PUBLIC_BASE_URL:base,
   SHOPEE_ENV:'live',SHOPEE_PARTNER_ID:'12',SHOPEE_PARTNER_KEY:'fixture-key',
   SHOPEE_REDIRECT_URI:'https://fixture.invalid/auth/shopee/callback',
   SUPABASE_URL:'https://fixture.supabase.co',SUPABASE_SECRET_KEY:'fixture-service',
   SHOPEE_MONITOR_ENABLED:'false',FIXTURE_RECOVERY_JOB:JSON.stringify(saved),
   FIXTURE_MODELS:JSON.stringify(exists?models():[]),FIXTURE_TAX:JSON.stringify(fiscal?plan.finalFiscal:{})}});
 let errors='';child.stderr.on('data',x=>errors+=x);
 try{
  await new Promise((resolve,reject)=>{
   const timer=setTimeout(()=>reject(Error('Fixture startup: '+errors)),10000);
   child.stdout.on('data',x=>{if(String(x).includes('Shopee API em')){clearTimeout(timer);resolve();}});
   child.once('error',reject);child.once('exit',c=>{clearTimeout(timer);reject(Error('Fixture exit '+c+errors));});
  });
  const login=await fetch(base+'/api/login',{method:'POST',headers:{'Content-Type':'application/json'},
   body:JSON.stringify({password:'fixture-password'})});
  const cookie=login.headers.get('set-cookie').split(';')[0];
  const response=await fetch(base+'/api/shopee/optimizer/execution/reconcile',{method:'POST',
   headers:{'Content-Type':'application/json',Cookie:cookie,Origin:base},
   body:JSON.stringify({sku:'SKU',itemId:'2',modelId:'0',recover:true})});
  const body=await response.json();assert.equal(response.status,200,JSON.stringify(body));return body;
 }finally{if(child.exitCode===null){const end=once(child,'exit');child.kill();await end;}}
}
test('HTTP real: consultar resultado sem modelos mantém pendência específica',async()=>{
 const body=await httpReconcile('variation_verifying');
 assert.equal(body.job.state,'uncertain');assert.equal(body.verified,false);
 assert.match(body.pendingChecks.join(' '),/variaç/);
});
test('HTTP real: criação confirmada retoma verificação dos modelos e não desconto do pai',async()=>{
 const body=await httpReconcile('variation_verifying',{exists:true});
 assert.equal(body.job.state,'running');assert.equal(body.job.result.phase,'variation_verifying');
});
test('HTTP real: fiscal confirmado retoma desconto por modelo',async()=>{
 const body=await httpReconcile('fiscal_verifying',{exists:true,fiscal:true});
 assert.equal(body.job.state,'running');assert.equal(body.job.result.phase,'model_discount_ready');
});
