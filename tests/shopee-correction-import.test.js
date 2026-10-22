import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {importPreparedImage} from '../shopeePreparedImages.js';
const code=path=>readFileSync(new URL(path,import.meta.url),'utf8');
test('image correction supports importing a copied or chosen photo',()=>{
 const js=code('../public/app.js'),html=code('../public/index.html');
 for(const id of ['optimizerImageCorrectionPaste','optimizerImageCorrectionChoose','optimizerImageCorrectionFile'])
  assert.match(html,new RegExp('id="'+id+'"'));
 assert.match(js,/navigator\.clipboard\.read\(\)/);
 assert.match(js,/optimizerImageCorrectionImportFile\(file\)/);
 assert.match(js,/optimizerChatgptScaleFile\(file\)/);
 assert.match(js,/optimizerImageCorrectionPreviewMap\.get\(slot\)\?\.sha256!==result\.image\.sha256/);
 assert.match(html,/app\.js\?v=1\.21\.13-queue-cancel/);
});
test('duplicate image in another slot is not imported',async()=>{
 const originalFetch=globalThis.fetch,oldUrl=process.env.SUPABASE_URL,oldKey=process.env.SUPABASE_SECRET_KEY;
 const file=Buffer.alloc(120);Buffer.from('89504e470d0a1a0a0000000d49484452000004b0000004b0','hex').copy(file);
 const crypto=await import('node:crypto'),sha=crypto.createHash('sha256').update(file).digest('hex');
 const methods=[];
 try{
  process.env.SUPABASE_URL='https://fixture.supabase.co';process.env.SUPABASE_SECRET_KEY='test-key';
  globalThis.fetch=async(u,o={})=>{methods.push(o.method||'GET');return Response.json([{slot:1,sha256:sha,sku:'3747'}]);};
  await assert.rejects(()=>importPreparedImage({shopId:852701218,itemId:58221125342,modelId:0,
   sku:'3747',slot:2,file,mime:'image/png',filename:'02.png'}),/idêntica à imagem 01/);
  assert.deepEqual(methods,['GET']);
 }finally{
  globalThis.fetch=originalFetch;
  if(oldUrl===undefined)delete process.env.SUPABASE_URL;else process.env.SUPABASE_URL=oldUrl;
  if(oldKey===undefined)delete process.env.SUPABASE_SECRET_KEY;else process.env.SUPABASE_SECRET_KEY=oldKey;
 }
});
