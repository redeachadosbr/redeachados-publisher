import test from 'node:test';
import assert from 'node:assert/strict';
import {prepareGmsDraft,checkGmsEligibility,ADS_GMS_ELIGIBILITY_PATH} from '../shopeeAdsGmsIntegration.js';

test('prévia da campanha GMS não publica nem ativa Ads',()=>{
 const result=prepareGmsDraft({daily_budget:20,start_date:'23-10-2026',roas_target:5},{today:new Date('2026-10-22T12:00:00Z')});
 assert.equal(result.publicationEnabled,false);
 assert.equal(result.requiresExplicitApproval,true);
 assert.equal(result.campaign.daily_budget,20);
 assert.equal(result.campaign.roas_target,5);
});
test('bloqueia orçamento inválido e período retroativo',()=>{
 assert.throws(()=>prepareGmsDraft({daily_budget:-2,start_date:'23-10-2026'},{today:new Date('2026-10-22T00:00:00Z')}),/Orçamento/);
 assert.throws(()=>prepareGmsDraft({daily_budget:20,start_date:'20-10-2026'},{today:new Date('2026-10-22T00:00:00Z')}),/anterior/);
 assert.throws(()=>prepareGmsDraft({daily_budget:20,start_date:'23-10-2026',end_date:'22-10-2026'},{today:new Date('2026-10-22T00:00:00Z')}),/Término/);
});
test('elegibilidade usa apenas leitura de API da loja autorizada',async()=>{
 let calls=0;
 const result=await checkGmsEligibility({}, {accessToken:'fake',shopId:123},async(_cfg,args)=>{
  calls++;assert.equal(args.method,'GET');assert.equal(args.path,ADS_GMS_ELIGIBILITY_PATH);
  return {response:{eligible:true}};
 });
 assert.equal(calls,1);
 assert.equal(result.creationEnabled,false);
 assert.equal(result.result.eligible,true);
});
