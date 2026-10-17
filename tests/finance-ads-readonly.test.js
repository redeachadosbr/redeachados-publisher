import assert from 'node:assert/strict';
import {adsMonthWindows,buildAdsFinanceSnapshot} from '../financeAdsBridge.js';
const now=new Date('2026-10-17T11:00:00.000Z');
assert.deepEqual(adsMonthWindows('2026-10',now),[{start:'2026-10-01',end:'2026-10-17'}]);
assert.deepEqual(adsMonthWindows('2026-08',now),[
 {start:'2026-08-01',end:'2026-08-29'},
 {start:'2026-08-30',end:'2026-08-31'}
]);
assert.deepEqual(adsMonthWindows('2026-10',new Date('2026-10-01T10:00:00Z')),[]);
assert.throws(()=>adsMonthWindows('2026-12',now),/FUTURE/);
let calls=0;
const fake=async range=>{
 calls++;
 return {total:{expense:calls===1?66.31:10,broadGmv:calls===1?100:20,broadOrders:1},
  campaigns:[{campaignId:'123456',name:'Produto 123456',expense:calls===1?66.31:10,broadGmv:calls===1?100:20,broadOrders:1}]};
};
const oct=await buildAdsFinanceSnapshot('2026-10',fake,{now});
assert.equal(calls,1);
assert.equal(oct.expense,66.31);
assert.equal(oct.gmv,100);
assert.equal(oct.campaigns.length,1);
assert.equal(oct.coverage.to,'2026-10-17');
const august=await buildAdsFinanceSnapshot('2026-08',fake,{now});
assert.equal(august.status,'confirmed');
assert.equal(august.expense,76.31);
assert.equal(august.coverage.to,'2026-08-31');
assert.equal(august.campaigns[0].expense,76.31);
assert.ok(!JSON.stringify(august).includes('buyer_email'));
await assert.rejects(()=>buildAdsFinanceSnapshot('2026-09',async()=>{throw Error('403 forbidden')},{now}),/403/);
console.log('Shopee Ads financial: month split, campaigns, expense and partial month without duplicate date OK');
