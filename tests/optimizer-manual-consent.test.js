import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {unresearchedMarginApprovalEligible} from '../shopeeMarketFloorApproval.js';

const q={
 sku:'305350',itemId:'58222065786',modelId:'0',
 unitCost:91.99,grossPrice:275.79,discountPct:38.76,couponPct:1,
 marketplaceDisplayPrice:168.89,customerPrice:167.20,
 netProfit:20.09,netMarginPct:12.016,minMarginPct:5,targetMarginPct:12,
 discountRecommendationSource:'base_not_researched',marketResearch:{verified:false,count:0},
 variableDiscount:true,readyForManualReview:true,appliedInShopee:false,
 priceEndingRuleVersion:4,priceEndingPolicy:'both_checkout_and_visible',
 breakdown:{shipping:0,packing:0}
};
test('SKU 305350: custo + margem permitem apenas prévia aprovada MANUALMENTE',()=>{
 assert.equal(unresearchedMarginApprovalEligible(q),false);
 assert.equal(unresearchedMarginApprovalEligible(q,{sellerApproved:true}),true);
});
test('sem margem, consentimento ou preço consistente nunca habilitar',()=>{
 const bad=[
  {variableDiscount:false},{discountRecommendationSource:'researched'},
  {marketResearch:{verified:true,count:0}},
  {grossPrice:500},{discountPct:50.01},{discountPct:0},
  {marketplaceDisplayPrice:168.88},{customerPrice:167.21},
  {netMarginPct:11.99},{targetMarginPct:20},{minMarginPct:15},
  {netProfit:-1},{priceEndingRuleVersion:3},
  {priceEndingPolicy:'checkout_only'},{appliedInShopee:true},
  {readyForManualReview:false},{unitCost:0}
 ];
 for(const delta of bad)assert.equal(unresearchedMarginApprovalEligible({...q,...delta},{sellerApproved:true}),false,
  'Deveria bloquear '+JSON.stringify(delta));
});
test('Motor Matriz exige consentimento tanto na consulta quanto na execução da mesma prévia',()=>{
 const server=readFileSync(new URL('../server.js',import.meta.url),'utf8');
 const app=readFileSync(new URL('../public/app.js',import.meta.url),'utf8');
 assert.match(server,/unresearchedMarginApprovalEligible\(quote,/);
 assert.match(server,/sellerApproved:allowUnresearched===true/);
 assert.match(server,/allowUnresearched:req\.body\?\.allowUnresearched===true/);
 assert.match(server,/allowUnresearched:approved\.allowUnresearched===true&&req\.body\?\.allowUnresearched===true/);
 assert.match(server,/'promotionSignal','allowUnresearched'/);
 assert.match(server,/signDiscountPreview\(data\.snapshot,envText\('SESSION_SECRET'\)\)/);
 assert.match(app,/optimizerManualDiscountConsent\(q\)/);
 assert.match(app,/checkbox\.type='checkbox'/);
 assert.match(app,/check\.checked=false;check\.dataset\.quoteKey=key/);
 assert.match(app,/allowUnresearched:optimizerManualDiscountConsent\(q\)/);
 assert.match(app,/allowUnresearched:intent\.expected\.allowUnresearched===true/);
 // O POST do MOTOR RAIZ (anúncio + desconto) precisa repassar o mesmo
 // consentimento ao segundo readback do servidor, não só à prévia da campanha.
 const full=server.slice(server.indexOf("'/api/shopee/optimizer/execution/execute'"),
  server.indexOf("'/api/shopee/optimizer/execution/status'"));
 assert.match(full,/allowUnresearched:!plan\.modelVariations&&approved\.allowUnresearched===true&&/);
 assert.match(full,/req\.body\?\.allowUnresearched===true/);
 assert.match(full,/,'allowUnresearched'\]/);
 assert.match(app,/allowUnresearched:!p\.modelVariations&&/);
 assert.match(app,/optimizerManualDiscountConsent\(optimizerDiscountFinalQuote\)/);

});
