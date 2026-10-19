import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {deletePreparedImage} from '../shopeePreparedImages.js';

const html=readFileSync(new URL('../public/index.html',import.meta.url),'utf8');
const app=readFileSync(new URL('../public/app.js',import.meta.url),'utf8');
const server=readFileSync(new URL('../server.js',import.meta.url),'utf8');

test('commercial image workspace matches the provided layout while preserving its existing controls',()=>{
 for(const id of [
  'optimizerImagesGallery','optimizerCommercialRules','optimizerCommercialShowRules',
  'optimizerCommercialOriginalCount','optimizerCommercialPreparedCount','optimizerCommercialGallerySummary',
  'optimizerCommercialGalleryProgress','optimizerImagesFilterAll','optimizerImagesFilterPending','optimizerImagesFilterSaved',
  'optimizerImageCorrectionSlot','optimizerImageCorrection','optimizerImageCorrectionCount',
  'optimizerImageCorrectionSave','optimizerImageCorrectionCopy','optimizerModeChatgpt','optimizerModeApi',
  'optimizerImagesGenerateAll','optimizerChatgptAuto','optimizerChatgptImport','optimizerWorkflowReview',
  'optimizerWorkflowShopee','optimizerWorkflowNext'
 ]){
  assert.equal((html.match(new RegExp('id="'+id+'"','g'))||[]).length,1,id);
 }
 assert.match(html,/Imagens comerciais/);
 assert.match(html,/Sem substituir automaticamente/);
 assert.match(html,/Solicitar ajuste da imagem/);
 assert.match(html,/Imagens do produto/);
 assert.match(html,/\/app\.js\?v=1\.20\.9/);
 assert.match(html,/\/style\.css\?v=1\.20\.9/);
});
test('gallery actions are wired to real API routes for a matching SKU and image slot',()=>{
 assert.match(app,/optimizerCommercialSetFilter/);
 assert.match(app,/optimizerImagesSavedSlots=new Set\(stored\.keys\(\)\)/);
 assert.match(app,/image\?\.previewUrl\|\|originalUrl/);
 assert.match(app,/optimizerCommercialRequestChatgptSlot\(w,slot\)/);
 assert.match(app,/optimizerImagesGenerateSlot\(w,slot,Boolean\(image\)\)/);
 assert.match(app,/optimizerImageCorrectionLoad\(\)/);
 assert.match(app,/method:'DELETE',signal:AbortSignal\.timeout/);
 assert.match(app,/Não foi possível excluir/);
 assert.match(server,/app\.delete\('\/api\/shopee\/optimizer\/images\/manual'/);
 assert.match(server,/verifiedSameOrigin\(req\)/);
 assert.match(server,/await checkedManualVideoIdentity\(req\)/);
 assert.match(server,/Aguarde terminar para excluir/);
 assert.match(server,/marketplaceUpdated:false/);
});
test('delete prepared image uses exact shop/item/model/slot/SKU/hash; never calls Shopee',async()=>{
 const old={fetch:globalThis.fetch,url:process.env.SUPABASE_URL,key:process.env.SUPABASE_SECRET_KEY};
 const row={shop_id:55,item_id:100,model_id:0,sku:'TRC1525',slot:1,
  storage_path:'55/100/0/00000000-0000-4000-8000-000000000000.png',sha256:'deadbeef',filename:'foto.png'};
 const calls=[];
 try{
  process.env.SUPABASE_URL='https://fixture.supabase.co';
  process.env.SUPABASE_SECRET_KEY='service-test-key';
  globalThis.fetch=async(url,opts={})=>{
   calls.push({url:String(url),method:opts.method||'GET'});
   assert.ok(String(url).startsWith('https://fixture.supabase.co/'));
   if(!opts.method)return Response.json([row]);
   if(opts.method==='DELETE'&&String(url).includes('/rest/v1/')){
    assert.match(String(url),/shop_id=eq\.55/);
    assert.match(String(url),/item_id=eq\.100/);
    assert.match(String(url),/model_id=eq\.0/);
    assert.match(String(url),/slot=eq\.1/);
    assert.match(String(url),/sku=eq\.TRC1525/);
    assert.match(String(url),/sha256=eq\.deadbeef/);
    return Response.json([row]);
   }
   if(opts.method==='DELETE'&&String(url).includes('/storage/v1/object/'))return Response.json({});
   throw Error('Unexpected operation');
  };
  const deleted=await deletePreparedImage(55,100,0,'TRC1525',1);
  assert.deepEqual(deleted,{deleted:true,slot:1,marketplaceUpdated:false});
  assert.deepEqual(calls.map(x=>x.method),['GET','DELETE','DELETE']);
  assert.ok(calls.every(x=>!x.url.includes('shopee.com')));
 }finally{
  globalThis.fetch=old.fetch;
  if(old.url===undefined)delete process.env.SUPABASE_URL;else process.env.SUPABASE_URL=old.url;
  if(old.key===undefined)delete process.env.SUPABASE_SECRET_KEY;else process.env.SUPABASE_SECRET_KEY=old.key;
 }
});
test('empty slot deletion does not remove existing Shopee photos or access storage delete',async()=>{
 const old={fetch:globalThis.fetch,url:process.env.SUPABASE_URL,key:process.env.SUPABASE_SECRET_KEY};
 let calls=0;
 try{
  process.env.SUPABASE_URL='https://fixture.supabase.co';
  process.env.SUPABASE_SECRET_KEY='service-test-key';
  globalThis.fetch=async()=>{calls++;return Response.json([])};
  assert.deepEqual(await deletePreparedImage(55,100,0,'TRC1525',5),{
   deleted:false,slot:5,marketplaceUpdated:false
  });
  assert.equal(calls,1);
  await assert.rejects(()=>deletePreparedImage(55,100,0,'TRC1525',10),/Posição inválida/);
 }finally{
  globalThis.fetch=old.fetch;
  if(old.url===undefined)delete process.env.SUPABASE_URL;else process.env.SUPABASE_URL=old.url;
  if(old.key===undefined)delete process.env.SUPABASE_SECRET_KEY;else process.env.SUPABASE_SECRET_KEY=old.key;
 }
});
