import test from 'node:test';
import assert from 'node:assert/strict';
import {createImageUploadQueue} from '../public/chatgptUploadQueue.js';

const base={nonce:'job-1',sku:'3747',itemId:'58221125342',modelId:'0',slot:3,
 sha256:'a'.repeat(64),blob:new Blob(['image']),filename:'03.png'};
const makeStore=()=>{const rows=new Map();return {get:async k=>rows.get(k),
 put:async r=>{rows.set(r.key,r);},all:async()=>[...rows.values()]};};

test('cancelling retry loops stops timer, keeps the file, and refuses a stale extension resend',async()=>{
 const store=makeStore(),timers=[],cancelled=[],acks=[];
 const queue=createImageUploadQueue({
  storage:store,
  send:async()=>{throw Error('network failure');},
  setTimer:fn=>{timers.push(fn);return 1;},clearTimer:id=>cancelled.push(id),
  onAck:(row,ok)=>acks.push(ok)
 });
 assert.deepEqual(await queue.enqueue(base),{pending:true});
 assert.equal(timers.length,1);
 await queue.cancel(base);
 assert.deepEqual(cancelled,[1]);
 assert.equal((await store.get('job-1:3')).status,'paused');
 assert.equal((await store.get('job-1:3')).blob,base.blob);
 assert.equal(await queue.resume(base,{includeBlocked:true}),0);
 assert.throws(()=>queue.enqueue(base),/encerrado/);
 assert.deepEqual(acks,[]);
});

test('cancelling an in-progress request aborts the active controller',async()=>{
 const store=makeStore();
 let started,finish;
 const opened=new Promise(resolve=>started=resolve);
 const pending=new Promise(resolve=>finish=resolve);
 const queue=createImageUploadQueue({storage:store,send:async(row,{signal})=>{
  started(signal);await pending;throw Error('cancelled');
 }});
 const job=queue.enqueue(base);
 const signal=await opened;
 assert.equal(signal.aborted,false);
 await queue.cancel(base);
 assert.equal(signal.aborted,true);
 finish();
 assert.equal((await job).stopped,true);
});
