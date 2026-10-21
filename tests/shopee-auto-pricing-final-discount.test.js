import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {REDE_ACHADOS_MARKET_RULES} from '../shopeeMatrixRules.js';
import {quoteShopeePrice} from '../shopeePricing.js';

const app=readFileSync(new URL('../public/app.js',import.meta.url),'utf8');
const html=readFileSync(new URL('../public/index.html',import.meta.url),'utf8');
const server=readFileSync(new URL('../server.js',import.meta.url),'utf8');
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
test('Desconto no fluxo aparece depois da etapa fiscal e sem trocar SKU/modelo',()=>{
 const fiscal=html.indexOf('id="optimizerExecFiscalLast"');
 const discount=html.indexOf('id="optimizerExecDiscountFinal"');
 assert.ok(fiscal>0&&discount>fiscal);
 assert.ok(html.includes('id="optimizerExecDiscountValues"'));
 assert.ok(html.includes('id="optimizerExecDiscountCampaign"'));
 assert.ok(html.includes('id="optimizerExecDiscountApply"'));
 assert.match(app,/optimizerDiscountFinalIdentityOf\(optimizerWorkflowPlan\)/);
 assert.match(app,/optimizerDiscountFinalPreviewData=null;optimizerDiscountFinalPreviewKey='';/);
});
test('Promoção requer pelo menos 2 anúncios válidos e autenticação da prévia',()=>{
 assert.match(server,/research\.count<REDE_ACHADOS_MARKET_RULES\.minimumOffers/);
 assert.match(app,/q\.marketResearch\?\.count>=2&&q\.marketResearch\?\.count<=5/);
 assert.match(app,/q\.marketResearch\?\.sourceType==='researched_affiliate_offers'/);
 assert.match(app,/optimizerExecJob\?\.state==='verified'/);
 assert.match(app,/optimizerExecJob\?\.result\?\.phase==='verified_partial'/);
 assert.match(app,/approvalToken:data\.approvalToken,confirm:true/);
 assert.match(app,/allowPriceChange:\$\('#optimizerExecDiscountPriceConsent'\)\.checked/);
 assert.match(app,/optimizerDiscountFinalSent=true/);
});
test('Consulta de mercado demorada não estoura timeout antigo de 35 segundos',()=>{
 assert.match(app,/signal:AbortSignal\.timeout\(75000\)/);
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
