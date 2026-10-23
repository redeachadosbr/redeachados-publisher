import test from 'node:test';
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {createServer} from 'node:net';
import {once} from 'node:events';
import {compileShopeeExecutionPlan,assertLiveShopeeUnchanged} from '../shopeeExecutionPlan.js';

// Simulate a storage/API round-trip with identical values and different key order.
const reorder=value=>Array.isArray(value)?value.map(reorder):value&&typeof value==='object'
 ?Object.fromEntries(Object.keys(value).reverse().map(k=>[k,reorder(value[k])])):value;
const inputs={shopId:1,itemId:'2',modelId:'0',sku:'SKU',
 record:{sku:'SKU',itemId:'2',status:'NORMAL'},review:{},
 live:{item_id:2,item_name:'Produto',description:'Descrição'},
 modelVariations:{type:'Cor',alreadyCreated:false,options:[
  {name:'Vermelho',sku:'SKU-VERMELHO',supplierSku:'SKU',cost:350,price:745.99,stock:1,noGtin:true,
   asset:{sha256:'a'.repeat(64)}},
  {name:'Rosa',sku:'SKU-ROSA',supplierSku:'SOURCE-PINK',cost:350,price:745.99,stock:1,noGtin:true,
   asset:{sha256:'b'.repeat(64)}}],
  promotion:{discountId:'123',gross:740,promo:555,discountPct:25,couponPct:1,
   buyerAfterCoupon:549.45,quoteAt:'2026-10-23T11:00:00Z',modelPriceChange:true}}};

test('unchanged variation promotion keeps its fingerprint after database key reordering',()=>{
 const prepared=compileShopeeExecutionPlan(inputs);
 const restored=compileShopeeExecutionPlan(reorder(inputs));
 assert.equal(restored.fingerprint,prepared.fingerprint);
 for(const change of [{gross:750},{promo:550},{discountId:'456'},{couponPct:2},{modelPriceChange:false}]){
  const changed=structuredClone(inputs);Object.assign(changed.modelVariations.promotion,change);
  assert.notEqual(compileShopeeExecutionPlan(changed).fingerprint,prepared.fingerprint);
 }
 const reversed=structuredClone(inputs);reversed.modelVariations.options.reverse();
 assert.notEqual(compileShopeeExecutionPlan(reversed).fingerprint,prepared.fingerprint);
});

test('persisted video metadata accepts reordered keys but rejects a changed video',()=>{
 const video={video_url:'https://fixture.invalid/original.mp4',duration:10,
  thumbnail_url:'https://fixture.invalid/thumbnail.png'};
 const live={...inputs.live,video_info:[video]};
 const plan=compileShopeeExecutionPlan({...inputs,live});
 plan.video={sha256:'approved'};
 const saved=reorder(plan);
 assert.doesNotThrow(()=>assertLiveShopeeUnchanged(saved,live));
 assert.throws(()=>assertLiveShopeeUnchanged(saved,{...live,
  video_info:[{...video,video_url:'https://fixture.invalid/changed.mp4'}]}),/Vídeo do anúncio alterado/);
});

async function executionFlow({withVideo=false,changedStock=false}={}){
 const listener=createServer();listener.listen(0,'127.0.0.1');await once(listener,'listening');
 const port=listener.address().port;await new Promise(r=>listener.close(r));
 const base='http://127.0.0.1:'+port;
 const child=spawn(process.execPath,['tests/fixtures/optimizer-server.mjs'],{
  cwd:new URL('..',import.meta.url),env:{PATH:process.env.PATH,PORT:String(port),
   APP_PASSWORD:'fixture-password',SESSION_SECRET:'fixture-session',PUBLIC_BASE_URL:base,
   SHOPEE_ENV:'live',SHOPEE_PARTNER_ID:'12',SHOPEE_PARTNER_KEY:'fixture-key',
   SHOPEE_REDIRECT_URI:'https://fixture.invalid/auth/shopee/callback',
   SUPABASE_URL:'https://fixture.supabase.co',SUPABASE_SECRET_KEY:'fixture-service',
   SHOPEE_MONITOR_ENABLED:'false',FIXTURE_VARIATION_FLOW:'true',
   FIXTURE_WITH_VIDEO:String(withVideo),FIXTURE_CHANGE_STOCK_AFTER_PREPARE:String(changedStock)}});
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
  const headers={'Content-Type':'application/json',Cookie:cookie,Origin:base};
  const post=async(path,data)=>{
   const response=await fetch(base+'/api/shopee/optimizer/execution/'+path,
    {method:'POST',headers,body:JSON.stringify(data)});
   return {status:response.status,body:await response.json()};
  };
  const identity={sku:'SKU',itemId:'2',modelId:'0'};
  const prepared=await post('prepare',identity);
  assert.equal(prepared.status,200,JSON.stringify(prepared.body));
  assert.equal(prepared.body.ready,true);
  assert.equal(prepared.body.plan.modelVariations.options.length,2);
  if(withVideo)assert.ok(prepared.body.plan.video);
  const approval={...identity,planId:prepared.body.plan.planId,updatedAt:prepared.body.updatedAt,
   stage:'all',confirmation:'EXECUTAR SKU',acceptPartialExecution:true,
   discountApprovalToken:prepared.body.autoModelDiscountToken,allowPriceChange:true};
  const executed=await post('execute',approval);
  if(changedStock){
   assert.equal(executed.status,409,JSON.stringify(executed.body));
   assert.match(executed.body.error,/Conteúdo ou aprovação mudou/);
  }else{
   assert.equal(executed.status,202,JSON.stringify(executed.body));
   assert.equal(executed.body.status,'running');
   const duplicate=await post('execute',approval);
   assert.equal(duplicate.status,409,JSON.stringify(duplicate.body));
   assert.match(duplicate.body.error,/já iniciado/);
  }
  const status=await fetch(base+'/api/shopee/optimizer/execution/status?sku=SKU&item_id=2&model_id=0',{headers});
  const saved=await status.json();
  assert.equal(saved.job.state,changedStock?'prepared':'running');
  if(!changedStock){
   assert.equal(saved.job.result.phase,'queued');
   assert.equal(saved.job.plan.commercialDiscount.snapshot.promo,555);
   assert.equal(saved.job.plan.commercialDiscount.allowPriceChange,true);
  }
 }finally{if(child.exitCode===null){const end=once(child,'exit');child.kill();await end;}}
}
test('HTTP: prepared variations start once after JSONB persistence',()=>executionFlow());
test('HTTP: video and variations start after JSONB persistence',()=>executionFlow({withVideo:true}));
test('HTTP: changed variant stock still blocks the old approval',()=>executionFlow({changedStock:true}));
