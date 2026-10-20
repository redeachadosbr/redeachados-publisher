import test from 'node:test';
import assert from 'node:assert/strict';
import {createImageUploadQueue,sameImageJob} from '../public/chatgptUploadQueue.js';

const sha='a'.repeat(64);
const job={nonce:'authorized-job',sku:'TUD0667',itemId:'123',modelId:'0'};
const input={...job,slot:1,sha256:sha,blob:new Blob(['original bytes']),filename:'chatgpt-auto-01.png'};
function memoryStore(rows=[]){
 const saved=new Map(rows.map(row=>[row.key,row]));
 return {get:async key=>saved.get(key),put:async row=>{saved.set(row.key,row);},
  all:async()=>[...saved.values()]};
}
const confirmed=row=>({image:{sku:row.sku,item_id:row.itemId,model_id:row.modelId,slot:row.slot,sha256:row.sha256}});
const flush=()=>new Promise(resolve=>setImmediate(resolve));

test('ACK succeeds before gallery refresh and a UI exception cannot reverse it',async()=>{
 const events=[],storage=memoryStore();
 const queue=createImageUploadQueue({storage,send:async row=>{
  assert.equal((await storage.get(row.key)).blob,row.blob);events.push('uploaded');return confirmed(row);
 },onAck:(_row,ok)=>events.push('ack:'+ok),onSaved:()=>{events.push('render');throw Error('UI unavailable');}});
 const result=await queue.enqueue(input);
 assert.equal(result.saved,true);
 assert.deepEqual(events,['uploaded','ack:true','render']);
 assert.equal((await storage.all())[0].status,'saved');
 assert.equal((await storage.all())[0].blob,null);
});

test('network failure retries the preserved bytes and never acknowledges an unsaved image',async()=>{
 const storage=memoryStore(),timers=[],acks=[],sent=[];
 let attempts=0;
 const queue=createImageUploadQueue({storage,send:async row=>{
  sent.push(row.blob);
  if(++attempts===1)throw Error('network unavailable');
  return confirmed(row);
 },setTimer:fn=>{timers.push(fn);return timers.length;},clearTimer:()=>{},onAck:(_r,ok)=>acks.push(ok)});
 assert.deepEqual(await queue.enqueue(input),{pending:true});
 assert.deepEqual(acks,[]);
 assert.equal((await storage.all())[0].blob,input.blob);
 timers.shift()();await flush();
 assert.deepEqual(acks,[true]);
 assert.equal(attempts,2);
 assert.equal(sent[0],sent[1]);
});

test('reload resumes only the authorized SKU/job and ignores another product',async()=>{
 const row={...input,key:job.nonce+':1',status:'pending'};
 const other={...row,key:'other:1',nonce:'other',sku:'TRC1525'};
 const storage=memoryStore([row,other]),sent=[];
 const queue=createImageUploadQueue({storage,send:async record=>{sent.push(record.sku);return confirmed(record);}});
 assert.equal(await queue.resume(job),1);await flush();
 assert.deepEqual(sent,['TUD0667']);
 assert.equal(await queue.pending(job),0);
 assert.equal((await storage.get('other:1')).status,'pending');
 assert.equal(sameImageJob(job,{...job,modelId:'99'}),false);
 assert.equal(sameImageJob(job,{...job,nonce:'other'}),false);
});

test('duplicate messages upload once and re-ACK the confirmed file',async()=>{
 const storage=memoryStore(),acks=[];
 let sends=0;
 const queue=createImageUploadQueue({storage,send:async row=>{sends++;return confirmed(row);},
  onAck:(_r,ok)=>acks.push(ok)});
 await Promise.all([queue.enqueue(input),queue.enqueue(input)]);
 await queue.enqueue(input);
 assert.equal(sends,1);
 assert.deepEqual(acks,[true,true]);
 await assert.rejects(queue.enqueue({...input,sha256:'b'.repeat(64)}),/outro arquivo/);
});

test('conflicting simultaneous messages cannot inherit another file acknowledgement',async()=>{
 const storage=memoryStore();
 const queue=createImageUploadQueue({storage,send:async row=>confirmed(row)});
 const first=queue.enqueue(input);
 assert.throws(()=>queue.enqueue({...input,sha256:'b'.repeat(64)}),/outro arquivo/);
 await first;
});

test('authentication failure retains the file and waits for explicit recovery',async()=>{
 const storage=memoryStore(),acks=[],timers=[];
 let authorized=false;
 const queue=createImageUploadQueue({storage,send:async row=>{
  if(!authorized){const error=Error('Faça login');error.retryable=false;throw error;}
  return confirmed(row);
 },setTimer:fn=>{timers.push(fn);},onAck:(_r,ok)=>acks.push(ok)});
 assert.equal((await queue.enqueue(input)).blocked,true);
 assert.equal((await storage.all())[0].blob,input.blob);
 assert.equal(timers.length,0);
 assert.equal(await queue.resume(job),0);
 authorized=true;
 assert.equal(await queue.resume(job,{includeBlocked:true}),1);await flush();
 assert.deepEqual(acks,[false,true]);
});

test('a response for a different image or item is never accepted as saved',async()=>{
 const storage=memoryStore(),acks=[];
 const queue=createImageUploadQueue({storage,send:async row=>({image:{...confirmed(row).image,item_id:'999'}}),
  onAck:(_r,ok)=>acks.push(ok)});
 assert.equal((await queue.enqueue(input)).blocked,true);
 assert.deepEqual(acks,[false]);
 assert.equal((await storage.all())[0].status,'blocked');
});
