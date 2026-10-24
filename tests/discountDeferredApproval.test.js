import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {
 discountPreviewStatus,validateDeferredDiscountPlan,DEFERRED_DISCOUNT_FINANCIAL_FIELDS
} from '../shopeeDiscountDeferred.js';
const example={
 shopId:'100',sku:'303448',itemId:'24442',modelId:'0',discountId:'512820626272845',
 gross:135.11,promo:104.44,buyerAfterCoupon:103.40,discountPct:22.7,
 couponPct:1,quoteAt:'2026-10-24T08:00:00.000Z',
 originalPrice:119.9,action:'add',needsBasePriceUpdate:true
};
test('UNLIST somente pré-aprovação, NORMAL publicação, demais estados recusados',()=>{
 assert.equal(discountPreviewStatus('NORMAL').deferred,false);
 assert.equal(discountPreviewStatus('UNLIST',{allowDeferred:true}).deferred,true);
 assert.throws(()=>discountPreviewStatus('UNLIST'),/NORMAL/);
 assert.throws(()=>discountPreviewStatus('DELETED',{allowDeferred:true}),/NORMAL/);
 assert.throws(()=>discountPreviewStatus('BANNED',{allowDeferred:true}),/NORMAL/);
});
test('revisão diferida aceita alteração esperada de status/preço atual, não altera parâmetros da oferta',()=>{
 assert.equal(validateDeferredDiscountPlan(example,{
  ...example,originalPrice:135.11,action:'update',existingPrice:104.44,
  needsBasePriceUpdate:false
 },{priceConsent:false}),true);
 for(const key of DEFERRED_DISCOUNT_FINANCIAL_FIELDS){
  assert.throws(()=>validateDeferredDiscountPlan(example,{...example,[key]:String(example[key])+'Z'},
   {priceConsent:true}),/mudou/,'Campo '+key);
 }
});
test('mudança no preço bruto necessita checkbox específico mesmo com pré-autorização',()=>{
 assert.throws(()=>validateDeferredDiscountPlan(example,
  {...example,needsBasePriceUpdate:true},{priceConsent:false}),/Autorize/);
 assert.equal(validateDeferredDiscountPlan(example,
  {...example,needsBasePriceUpdate:true},{priceConsent:true}),true);
});
test('API de execução mantém bloqueio NORMAL; só prévia tem permissão UNLIST',()=>{
 const server=readFileSync(new URL('../server.js',import.meta.url),'utf8');
 assert.match(server,/allowDeferredPreview:req\.body\?\.allowDeferredPreview===true/);
 assert.match(server,/approvalToken:signature,\s*\n\s*deferred:data\.deferred/);
 assert.match(server,/const signature=data\.deferred\?null/);
 assert.match(server,/discountExecutionInputs\(req,approved\.sku,approved\.itemId,[\s\S]*?approved\.modelId,approved\.discountId\)/);
});
test('interface exige consentimento antecipado e reconsulta após anúncio NORMAL',()=>{
 const app=readFileSync(new URL('../public/app.js',import.meta.url),'utf8');
 const page=readFileSync(new URL('../public/index.html',import.meta.url),'utf8');
 assert.match(page,/id="optimizerExecDiscountDeferredConsent" type="checkbox"/);
 assert.match(page,/id="optimizerExecDiscountResume"/);
 assert.match(app,/if\(deferred&&!.*DeferredConsent.*checked\)return false/);
 assert.match(app,/allowDeferredPreview:true/);
 assert.match(app,/state:'deferred_pending'/);
 assert.match(app,/const keys=intent\.deferred\?fixedKeys:APPROVED_DISCOUNT_KEYS/);
 assert.match(app,/optimizerDiscountFlowSave\(\{\.\.\.intent,state:'posting'\}\)/);
});
