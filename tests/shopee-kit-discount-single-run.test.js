import test from 'node:test';
import assert from 'node:assert/strict';
import {advanceShopeeKitDiscount} from '../shopeeExecutionKitDiscount.js';
import {shopeeExecutionProgress} from '../shopeeExecutionProgress.js';

const approved={kitSku:'KIT-TEST',itemId:'101',modelId:'0',discountId:'202',
 gross:99.90,promo:79.99,afterCoupon:79.99};
const base={...approved,liveStatus:'NORMAL',priceAligned:true,action:'add',confirmed:false};
const job=(phase,result={})=>({state:'running',plan:{selectedStage:'all',kitDiscount:approved},
 result:{phase,...result}});
test('desconto do kit entra na matriz de 8 etapas e nunca marca 100% antecipado',()=>{
 const pending=shopeeExecutionProgress({...job('kit_discount_ready'),state:'running'});
 assert.equal(pending.steps.length,8);
 assert.equal(pending.steps[7].id,'discount');
 assert.notEqual(pending.steps[7].status,'skipped');
 assert.ok(pending.percent<100);
 const done=shopeeExecutionProgress({...job('verified',{discount:{status:'verified'}}),state:'verified'});
 assert.equal(done.percent,100);
 assert.equal(done.steps[7].status,'done');
});
test('promoção tem checkpoint antes da escrita e aguarda leitura oficial',async()=>{
 const calls=[];
 const io={
  kitDiscountRead:async()=>base,
  kitDiscountMarket:async()=>{calls.push('market')},
  validateIdentity:async()=>{calls.push('identity')},
  beforeWrite:async()=>{calls.push('checkpoint')},
  kitDiscountPublish:async()=>{calls.push('publish')},
  kitDiscountPrice:async()=>{calls.push('price')}
 };
 const first=await advanceShopeeKitDiscount(job('kit_discount_ready'),io);
 assert.equal(first.state,'running');
 assert.deepEqual(calls,['market']);
 const next=await advanceShopeeKitDiscount(job('kit_discount_ready',first.result),io);
 assert.equal(next.result.phase,'kit_discount_verifying');
 assert.deepEqual(calls,['market','identity','checkpoint','publish']);
 const polling=await advanceShopeeKitDiscount(job('kit_discount_verifying',next.result),io);
 assert.equal(polling.state,'running');
 assert.deepEqual(calls,['market','identity','checkpoint','publish'],'nunca repetir promoção');
 const verified=await advanceShopeeKitDiscount(job('kit_discount_verifying',next.result),{
  ...io,kitDiscountRead:async()=>({...base,confirmed:true})
 });
 assert.equal(verified.state,'verified');
 assert.equal(verified.result.discount.status,'verified');
 assert.equal(calls.filter(c=>c==='publish').length,1);
});
test('sem pesquisa validada, não altera preço nem promoção',async()=>{
 const calls=[];
 const io={
  kitDiscountRead:async()=>({...base,priceAligned:false}),
  kitDiscountMarket:async()=>{throw Error('Concorrentes insuficientes')},
  validateIdentity:async()=>calls.push('identity'),
  beforeWrite:async()=>calls.push('checkpoint'),
  kitDiscountPrice:async()=>calls.push('price'),
  kitDiscountPublish:async()=>calls.push('publish')
 };
 const out=await advanceShopeeKitDiscount(job('kit_discount_ready'),io);
 assert.equal(out.state,'failed');
 assert.deepEqual(calls,[]);
});
