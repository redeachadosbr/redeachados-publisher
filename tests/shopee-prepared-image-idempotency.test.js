import test from 'node:test';
import assert from 'node:assert/strict';
import {importPreparedImage} from '../shopeePreparedImages.js';

test('resending after a lost response reuses the existing image without a second storage object',async()=>{
 const originalFetch=globalThis.fetch;
 const originalUrl=process.env.SUPABASE_URL,originalKey=process.env.SUPABASE_SECRET_KEY;
 process.env.SUPABASE_URL='https://example.supabase.co';process.env.SUPABASE_SECRET_KEY='test-key';
 let rows=[],uploads=0;
 globalThis.fetch=async(url,options={})=>{
  if(url.includes('/storage/v1/object/')){uploads++;return new Response('{}',{status:200});}
  if(options.method==='POST'){rows=JSON.parse(options.body);return new Response(JSON.stringify(rows),{status:201});}
  return new Response(JSON.stringify(rows),{status:200});
 };
 try{
  const file=Buffer.alloc(24);
  Buffer.from([137,80,78,71,13,10,26,10]).copy(file);
  file.writeUInt32BE(1200,16);file.writeUInt32BE(1200,20);
  const input={shopId:1,itemId:2,modelId:0,sku:'TUD0667',slot:1,file,mime:'image/png',filename:'01.png'};
  const first=await importPreparedImage(input),second=await importPreparedImage(input);
  assert.equal(uploads,1);assert.equal(first.storage_path,second.storage_path);
  assert.equal(first.sha256,second.sha256);
 }finally{
  globalThis.fetch=originalFetch;
  if(originalUrl===undefined)delete process.env.SUPABASE_URL;else process.env.SUPABASE_URL=originalUrl;
  if(originalKey===undefined)delete process.env.SUPABASE_SECRET_KEY;else process.env.SUPABASE_SECRET_KEY=originalKey;
 }
});
