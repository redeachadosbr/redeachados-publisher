import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {readPreparedImages} from '../shopeePreparedImages.js';
const frontend=readFileSync(new URL('../public/app.js',import.meta.url),'utf8');
const index=readFileSync(new URL('../public/index.html',import.meta.url),'utf8');

test('signs images concurrently and reuses still-valid signed URLs on subsequent refreshes',async()=>{
 const originalFetch=globalThis.fetch;
 const previousUrl=process.env.SUPABASE_URL;
 const previousKey=process.env.SUPABASE_SERVICE_ROLE_KEY;
 process.env.SUPABASE_URL='https://storage.example.test';
 process.env.SUPABASE_SERVICE_ROLE_KEY='test-secret';
 const rows=[1,2,3].map(slot=>({slot,sku:'FAST-THUMB',storage_path:'123/456/0/00000000-0000-0000-0000-00000000000'+slot+'.png'}));
 let signatures=0, active=0, maxActive=0, databaseCalls=0;
 globalThis.fetch=async url=>{
  const endpoint=String(url);
  if(endpoint.includes('/rest/v1/')){
   databaseCalls++;
   return {ok:true,status:200,json:async()=>rows.map(r=>({...r}))};
  }
  if(endpoint.includes('/storage/v1/object/sign/')){
   signatures++;active++;maxActive=Math.max(active,maxActive);
   await new Promise(resolve=>setTimeout(resolve,10));
   active--;
   return {ok:true,status:200,json:async()=>({signedURL:'/object/sign/image-'+signatures+'?token=abc'})};
  }
  throw Error('Unexpected URL '+endpoint);
 };
 try{
  const first=await readPreparedImages(123,456,0,'FAST-THUMB',{preview:true});
  const second=await readPreparedImages(123,456,0,'FAST-THUMB',{preview:true});
  assert.equal(first.length,3);
  assert.equal(signatures,3);
  assert.equal(maxActive,3,'all signatures must be requested in parallel');
  assert.equal(databaseCalls,2);
  assert.deepEqual(second.map(x=>x.previewUrl),first.map(x=>x.previewUrl));
 }finally{
  globalThis.fetch=originalFetch;
  if(previousUrl===undefined)delete process.env.SUPABASE_URL;else process.env.SUPABASE_URL=previousUrl;
  if(previousKey===undefined)delete process.env.SUPABASE_SERVICE_ROLE_KEY;else process.env.SUPABASE_SERVICE_ROLE_KEY=previousKey;
 }
});

test('reuses loaded card images and prioritizes first visible row',()=>{
 assert.match(frontend,/const existingThumbs=new Map\(\)/);
 assert.match(frontend,/existingThumbs\.get\(slot\)/);
 assert.match(frontend,/previousPhoto\?\.src===url\?previousPhoto/);
 assert.match(frontend,/photo\.loading=slot<=3\?'eager':'lazy'/);
 assert.match(frontend,/photo\.decoding='async'/);
 assert.match(index,/app\.js\?v=1\.21\.78-technical-coherence/);
});

