import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {marketFloorDiscountEligibility} from '../shopeeMarketFloorApproval.js';
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
 assert.equal(discountPreviewStatus('REVIEWING',{allowDeferred:true}).deferred,true);
 assert.equal(discountPreviewStatus('reviewing',{allowDeferred:true}).status,'REVIEWING');
 assert.throws(()=>discountPreviewStatus('UNLIST'),/Status real na Shopee: UNLIST/);
 assert.throws(()=>discountPreviewStatus('REVIEWING'),/Status real na Shopee: REVIEWING/);
 assert.throws(()=>discountPreviewStatus('SELLER_DELETE',{allowDeferred:true}),/regularizado/);
 assert.throws(()=>discountPreviewStatus('SHOPEE_DELETE',{allowDeferred:true}),/regularizado/);
 assert.throws(()=>discountPreviewStatus('BANNED',{allowDeferred:true}),/regularizado/);
 assert.throws(()=>discountPreviewStatus(null,{allowDeferred:true}),/NÃO INFORMADO/);
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
 assert.match(server,/discountExecutionInputs\(req,approved\.sku,approved\.itemId,[\s\S]*?approved\.modelId,approved\.discountId,\{allowOver25:approved\.allowOver25===true&&req\.body\?\.allowOver25===true\}\)/);
});
test('interface exige consentimento antecipado e reconsulta após anúncio NORMAL',()=>{
 const app=readFileSync(new URL('../public/app.js',import.meta.url),'utf8');
 const page=readFileSync(new URL('../public/index.html',import.meta.url),'utf8');
 assert.match(page,/id="optimizerExecDiscountDeferredConsent" type="checkbox"/);
 assert.match(page,/id="optimizerExecDiscountResume"/);
 assert.match(app,/if\(deferred&&!.*DeferredConsent.*checked\)return false/);
 assert.match(app,/allowDeferredPreview:true/);
 assert.match(app,/\?'deferred_pending':'authorized'/);
 assert.match(app,/const keys=intent\.deferred\?fixedKeys:APPROVED_DISCOUNT_KEYS/);
 assert.match(app,/optimizerDiscountFlowSave\(\{\.\.\.intent,state:'posting'\}\)/);
});

test('acima de 25% da média só libera com aprovação explícita e margem segura',()=>{
 const quote={
  status:'MERCADO_ABAIXO_DO_PISO',minMarginPct:8,netMarginPct:8.04,
  netProfit:8.72,marketResearch:{
   verified:true,source:'shopee_affiliate_product_offers',
   sourceType:'researched_affiliate_offers',count:5,reference:70.76
  },
  buyerAfterCoupon:108.49,customerPrice:108.49,priceFloor:106,
  marketGapPct:53.32,grossPrice:136.99,discountPct:20,
  discountRecommendationSource:'researched'
 };
 assert.equal(marketFloorDiscountEligibility(quote).allowed,false,
  'sem autorização a exceção não pode ser publicada');
 assert.equal(marketFloorDiscountEligibility(quote,{allowOver25:true}).allowed,true,
  'com autorização, prévia segura deixa de ser bloqueada pelos 25%');
 for(const unsafe of [
  {...quote,netMarginPct:7.99},
  {...quote,netProfit:-1},
  {...quote,priceFloor:110},
  {...quote,marketResearch:{...quote.marketResearch,verified:false}}
 ])assert.equal(marketFloorDiscountEligibility(unsafe,{allowOver25:true}).allowed,false,
  'autorização não elimina proteção de margem, lucro, piso ou pesquisa');
});
test('execução por variações tem consentimento de +25% distinto da prévia sem escrita',()=>{
 const server=readFileSync(new URL('../server.js',import.meta.url),'utf8');
 const app=readFileSync(new URL('../public/app.js',import.meta.url),'utf8');
 const html=readFileSync(new URL('../public/index.html',import.meta.url),'utf8');
 assert.match(server,/const marketOverrideRequired=financial\.quote\.status/);
 assert.match(server,/allowOver25:true\}\);/);
 assert.match(server,/if\(plan\.modelVariations\?\.promotion\?\.marketOverrideRequired&&!over25Consent\)/);
 assert.match(app,/optimizerModelMarketConsent\(plan\)/);
 assert.match(app,/allowOver25:p\.modelVariations\?/);
 assert.match(html,/id="optimizerExecutionOver25Consent" type="checkbox"/);
});
