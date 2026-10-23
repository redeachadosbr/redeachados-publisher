import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {REDE_ACHADOS_MARKET_RULES} from '../shopeeMatrixRules.js';
import {quoteShopeePrice} from '../shopeePricing.js';

const app=readFileSync(new URL('../public/app.js',import.meta.url),'utf8');
const html=readFileSync(new URL('../public/index.html',import.meta.url),'utf8');
const server=readFileSync(new URL('../server.js',import.meta.url),'utf8');
const progress=readFileSync(new URL('../shopeeExecutionProgress.js',import.meta.url),'utf8');
const worker=readFileSync(new URL('../shopeeExecutionWorker.js',import.meta.url),'utf8');
const liveQuote={
 sku:'TUD0667',itemId:'58220952395',modelId:'0',netMarginPct:10,minMarginPct:5,
 discountRecommendationSource:'researched',status:'COMPETITIVO',
 marketResearch:{verified:true,count:2,sourceType:'researched_affiliate_offers',researchedAt:new Date().toISOString()}
};
test('Motor Matriz ativa precificação e pesquisa na localização de todas as SKUs',()=>{
 assert.equal(REDE_ACHADOS_MARKET_RULES.autoPriceAndResearchOnSku,true);
 assert.equal(REDE_ACHADOS_MARKET_RULES.prepareDiscountDuringOptimization,true);
 assert.equal(REDE_ACHADOS_MARKET_RULES.publishDiscountOnlyAfterApproval,true);
 assert.match(app,/async function optimizerRunAudit\([\s\S]*?void shPriceLoadDefaults\(\)\.then\(\(\)=>shPricePrepare\(\)\)/);
 assert.match(app,/shPriceCurrentQuote=q;[\s\S]*?optimizerDiscountFinalSavedQuote\(q\)/);
 assert.match(app,/void optimizerDiscountFinalLoad\(\)/);
});
test('Etapa 08 fica acima da prévia para revisão e o envio vem depois da etapa fiscal',()=>{
 const cards=html.indexOf('id="optimizerWorkflowCards"');
 const discount=html.indexOf('id="optimizerDiscountReviewInline"');
 const execute=html.indexOf('id="optimizerExecutionPanel"');
 assert.ok(cards>0&&discount>cards&&execute>discount);
 assert.match(app,/discountCard\.onclick=\(\)=>optimizerDiscountOpenReview\(\)/);
 assert.match(app,/optimizerDiscountApprovalReady\(\)/);
 assert.match(app,/discountApprovalToken:optimizerDiscountFinalPreviewData\?\.approvalToken/);
 assert.match(server,/commercialDiscount=\{snapshot:approved,allowPriceChange:/);
 assert.match(worker,/advanceVerifiedDiscount\(job,io\)/);
 assert.ok(progress.indexOf("step('discount'")>progress.indexOf("step('fiscal'"));
 assert.doesNotMatch(html,/id="optimizerExecDiscountApply"/);
});
test('Campanha precisa de pesquisa, autorização assinada e confirmação fiscal',()=>{
 assert.match(server,/research\.count<REDE_ACHADOS_MARKET_RULES\.minimumOffers/);
 assert.match(app,/q\.marketResearch\?\.count>=2&&q\.marketResearch\?\.count<=5/);
 assert.match(app,/q\.marketResearch\?\.sourceType==='researched_affiliate_offers'/);
 assert.match(server,/verifyDiscountPreview\(req\.body\?\.discountApprovalToken/);
 assert.match(server,/if\(plan\.fiscalDeferred\)throw Error/);
 assert.match(app,/allowPriceChange:discountIntent\?\.consent===true/);
 assert.doesNotMatch(app,/if\(verified\)void optimizerDiscountFinishTogether\(job\)/);
});
test('Falhas 502 na consulta de desconto são recuperadas sem reenviar promoção',()=>{
 assert.match(app,/async function optimizerDiscountReadOnlyPreview\(request\)/);
 assert.match(app,/attempt<=3/);
 assert.match(app,/\[502,503,504\]/);
 assert.match(app,/AbortSignal\.timeout\(22000\)/);
 assert.match(server,/discountPublish:async\(approved,live\)/);
});
test('Preço calculado mantém margem mínima caso mercado seja inviável',()=>{
 const config={marginPct:10,minMarginPct:5,discountPct:20,couponPct:1,taxPct:4,
  flashPct:3,adsPct:0,shipping:0,packing:0,sellerType:'cpf',highVolumeCpf:false,
  commissionRates:[20,14,14,14],fixedFees:[4.5,16,20,26]};
 const planned=quoteShopeePrice({unitCost:96.99,settings:config,marketAverage:168.44});
 const poor=quoteShopeePrice({unitCost:96.99,settings:config,marketAverage:90});
 assert.ok(planned.netMarginPct>=10);
 assert.ok(poor.netMarginPct>=5);
 assert.equal(poor.status,'MERCADO_ABAIXO_DO_PISO');
});

test('fechamento de variações e desconto usa os SKUs de fornecedor por modelo',()=>{
 const variantJs=readFileSync(new URL('../public/optimizer-variations.js',import.meta.url),'utf8');
 const media=readFileSync(new URL('../shopeeVariationMedia.js',import.meta.url),'utf8');
 assert.match(html,/id="optimizerFinalPending"/);
 assert.match(html,/id="optimizerFinalVariantsOpen"/);
 assert.match(html,/id="optimizerFinalDiscountOpen"/);
 assert.match(html,/id="optimizerFinalModelDiscountApply"/);
 assert.match(variantJs,/supplierSku:String\(take\('supplierSku'\)/);
 assert.match(media,/supplierSku,gtin:noGtin/);
 assert.match(server,/async function verifiedVariationSupplierCosts\(x,details\)/);
 assert.match(server,/await upsertWeDropSkuLink\(x\.auth\.shopId/);
 assert.match(server,/allModelsConfirmed=details\.options\.length>=2/);
});
test('a promoção por modelos requer prévia assinada, custos por cor e confirmação explícita',()=>{
 assert.match(server,/app\.post\('\/api\/shopee\/optimizer\/variants-discount\/preview'/);
 assert.match(server,/app\.post\('\/api\/shopee\/optimizer\/variants-discount\/execute'/);
 assert.match(server,/verifyDiscountPreview\(req\.body\.approvalToken/);
 assert.match(server,/quote\.marketResearch\?\.verified!==true/);
 assert.match(server,/shopeePricingSupplierCost\(x\.auth\.shopId/);
 assert.match(server,/Math\.abs\(link\.unitCost-Number\(quote\.unitCost\)\)/);
 assert.match(server,/model_list:approved\.models\.map/);
 assert.match(server,/attempted=true/);
 assert.match(app,/body:JSON\.stringify\(\{sku:w\.sku,itemId:w\.itemId,modelId:w\.modelId,/);
 assert.match(app,/optimizerModelDiscountApproval=null/);
 assert.match(app,/confirm\('PUBLICAÇÃO REAL:/);
});
