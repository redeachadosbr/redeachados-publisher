import assert from 'node:assert/strict';
import {readShopeeWallet,normalizeWalletTransactions} from '../shopeeWallet.js';
import {installWalletBridge} from '../financeBridge.js';
const now=Math.floor(Date.parse('2026-10-17T12:00:00Z')/1000);
let calls=[];
const client=async(_cfg,req)=>{
 calls.push(req);
 assert.equal(req.path,'/api/v2/payment/get_wallet_transaction_list');
 assert.equal(req.method,'POST');
 assert.ok(req.body.create_time_to-req.body.create_time_from<15*86400);
 return {response:{more:false,transaction_list:[
  {create_time:now-3600,transaction_type:'ESCROW_VERIFIED_ADD',amount:49.78,current_balance:312.66,order_sn:'2610ABC'},
  {create_time:now-7200,transaction_type:'WITHDRAWAL_CREATED',amount:-20,current_balance:262.88,description:'Withdrawal',buyer_name:'PII SHOULD BE OMITTED'}
 ]}};
};
const d=await readShopeeWallet({}, {accessToken:'dummy',shopId:2},client,{now});
assert.equal(calls.length,2,'30 days split in two windows');
assert.equal(d.movements.length,2,'duplicate window records deduplicated');
assert.equal(d.balance.amount,312.66);
assert.equal(d.balance.status,'last_wallet_transaction');
assert.equal(d.movements[0].amount,49.78);
assert.ok(!JSON.stringify(d).includes('PII SHOULD'));
assert.throws(()=>normalizeWalletTransactions({response:{unknown:[]}}),/INVALID_RESPONSE/);
const a=await readShopeeWallet({}, {accessToken:'dummy',shopId:2},async()=>({response:{transaction_list:[],more:false}}),{now});
assert.equal(a.balance.amount,null,'no invented zero balance');
assert.equal(a.balance.status,'unavailable');
process.env.FINANCE_BRIDGE_KEY='x'.repeat(40);
const routes=new Map();
const app={
 get:(path,...handlers)=>routes.set('GET '+path,handlers),
 options:(path,...handlers)=>routes.set('OPTIONS '+path,handlers)
};
let resolveJob,started=0;
installWalletBridge(app,async()=>{started++;return new Promise(resolve=>{resolveJob=resolve;});});
async function invoke(key='x'.repeat(40)){
 const handlers=routes.get('GET /api/finance-bridge/v1/wallet');
 let code=200,payload=null;
 const res={setHeader(){},status(x){code=x;return this},json(v){payload=v;return this}};
 let index=0;
 for(const handler of handlers){
  const prior=index;
  await handler({headers:{'x-finance-bridge-key':key}},res,()=>{index++;});
  if(index===prior)break;
 }
 return {code,payload};
}
const unauthorized=await invoke('invalid');
assert.equal(unauthorized.code,401);
const first=await invoke();assert.equal(first.code,202);
await new Promise(resolve=>setImmediate(resolve));
const second=await invoke();assert.equal(second.code,202);
assert.equal(started,1,'parallel clients do not start multiple collections');
resolveJob(d);await new Promise(resolve=>setImmediate(resolve));
const complete=await invoke();assert.equal(complete.code,200);
assert.equal(complete.payload.balance.amount,312.66);
console.log('Shopee wallet bridge: authorized, 30 days, non-PII, historical balance, async single collector OK');
