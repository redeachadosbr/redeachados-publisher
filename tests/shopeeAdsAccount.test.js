import test from 'node:test';
import assert from 'node:assert/strict';
import {normalizeShopeeAdsAccount,readShopeeAdsAccount} from '../shopeeAdsAccount.js';

test('official Ads balance and automatic top-up are independent, noncash observations',()=>{
 const x=normalizeShopeeAdsAccount(
  {response:{total_balance:87.35,data_timestamp:1792447200}},
  {response:{auto_top_up:true,data_timestamp:1792447200}});
 assert.equal(x.balance.status,'confirmed');
 assert.equal(x.balance.amount,87.35);
 assert.equal(x.automaticRecharge.status,'confirmed');
 assert.equal(x.automaticRecharge.enabled,true);
 assert.match(x.limitation,/not merchant cash/);
 assert.ok(x.balance.observedAt);
});
test('refused or unknown API response never becomes false zero or inferred recharge',()=>{
 const x=normalizeShopeeAdsAccount(null,{response:{auto_top_up:false,data_timestamp:1792447200}});
 assert.equal(x.balance.amount,null);
 assert.equal(x.balance.status,'unavailable');
 assert.equal(x.automaticRecharge.enabled,false);
 assert.equal(x.automaticRecharge.status,'confirmed');
 assert.equal(normalizeShopeeAdsAccount({response:{total_balance:-3,data_timestamp:1792447200}},{}).balance.amount,null);
 assert.equal(normalizeShopeeAdsAccount({response:{total_balance:100,data_timestamp:0}},{}).balance.status,'unavailable');
});
test('official Shopee APIs are read only and independently fail safe',async()=>{
 const calls=[];
 const api=async(_cfg,req)=>{
  calls.push({path:req.path,method:req.method,shopId:req.shopId});
  if(req.path==='/api/v2/ads/get_shop_toggle_info')throw Error('Permission denied');
  return {response:{total_balance:16.55,data_timestamp:1792447200}};
 };
 const x=await readShopeeAdsAccount({}, {shopId:123,accessToken:'private'},api);
 assert.deepEqual(calls.map(x=>x.path).sort(),[
  '/api/v2/ads/get_shop_toggle_info','/api/v2/ads/get_total_balance'
 ]);
 assert.ok(calls.every(x=>x.method==='GET'));
 assert.equal(x.balance.amount,16.55);
 assert.equal(x.automaticRecharge.status,'permission_required');
 assert.equal(x.automaticRecharge.enabled,null);
 assert.ok(Number.isFinite(Date.parse(x.checkedAt)));
 assert.ok(!JSON.stringify(x).includes('private'));
});

test('auth failures and generic errors stay separate from missing balance',async()=>{
 const fail=async (_cfg,r)=>{
  if(r.path.endsWith('get_total_balance'))throw Error('expired token');
  throw Error('service temporarily unavailable');
 };
 const x=await readShopeeAdsAccount({}, {shopId:123,accessToken:'secret'},fail);
 assert.equal(x.balance.status,'authorization_required');
 assert.equal(x.automaticRecharge.status,'unavailable');
 assert.equal(x.balance.amount,null);
 assert.equal(x.automaticRecharge.enabled,null);
});
