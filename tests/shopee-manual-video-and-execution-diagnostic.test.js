import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {MAX_VIDEO_BYTES,importShopeeManualVideo,getShopeeManualVideo,
 signedShopeeManualVideoPreview,manualVideoPublicInfo} from '../shopeeManualVideo.js';
const read=f=>readFileSync(new URL('../'+f,import.meta.url),'utf8');
const mp4=Buffer.alloc(256,0);
mp4.write('ftyp',4,'ascii');
async function withMockStorage(fn){
 const keys=['SUPABASE_URL','SUPABASE_SECRET_KEY'],old=keys.map(k=>process.env[k]),orig=globalThis.fetch;
 process.env.SUPABASE_URL='https://private-example.supabase.co';
 process.env.SUPABASE_SECRET_KEY='test-private-server-key';
 const calls=[];
 globalThis.fetch=async (url,request={})=>{
  const target=String(url);calls.push({target,request});
  if(target.includes('/storage/v1/object/sign/'))
   return {ok:true,json:async()=>({signedURL:'/object/sign/shopee-optimizer-videos/1/2/0/a.mp4?token=mock'})};
  if(target.includes('/storage/v1/object/'))
   return {ok:true,json:async()=>({Key:'private'})};
  if(target.includes('/rest/v1/shopee_optimizer_manual_videos')){
   const record= request.method==='POST'?JSON.parse(request.body)[0]:
     {shop_id:1,item_id:2,model_id:0,sku:'TRC1525',
      filename:'piscina.mp4',mime_type:'video/mp4',size_bytes:256,sha256:'a'.repeat(64),
      status:'manual_imported',imported_at:'2026-10-17',storage_path:'1/2/0/a.mp4'};
   return {ok:true,json:async()=>[record]};
  }
  throw Error('Unexpected URL '+target);
 };
 try{await fn(calls)}finally{
  globalThis.fetch=orig;
  keys.forEach((k,i)=>old[i]===undefined?delete process.env[k]:process.env[k]=old[i]);
 }
}
test('private video import persists exact shop/item/model/SKU and never calls Shopee',async()=>{
 await withMockStorage(async(calls)=>{
  const saved=await importShopeeManualVideo(1,2,0,'TRC1525',mp4,
    {mime:'video/mp4',filename:'piscina.mp4'});
  assert.equal(saved.sku,'TRC1525');
  assert.equal(saved.filename,'piscina.mp4');
  assert.equal(saved.sizeBytes,256);
  assert.equal(saved.uploadedToShopee,false);
  assert.ok(calls.some(x=>x.target.includes('/storage/v1/object/shopee-optimizer-videos/1/2/0/')));
  assert.ok(calls.some(x=>x.target.includes('/rest/v1/shopee_optimizer_manual_videos')));
  assert.ok(!calls.some(x=>x.target.includes('partner.shopeemobile.com')));
 });
});
test('video readback returns signed ten-minute private URL, not public bucket',async()=>{
 await withMockStorage(async()=>{
  const row=await getShopeeManualVideo(1,2,0,'TRC1525');
  assert.equal(row.status,'manual_imported');
  assert.equal(manualVideoPublicInfo(row).uploadedToShopee,false);
  assert.ok((await signedShopeeManualVideoPreview(1,2,0,'TRC1525')).startsWith(
    'https://private-example.supabase.co/storage/v1/object/sign/'));
  assert.equal(await getShopeeManualVideo(1,2,0,'different-sku'),null);
 });
});
test('video rejects unsupported, too-large and inconsistent contents',async()=>{
 await assert.rejects(importShopeeManualVideo(1,2,0,'TRC1525',mp4,
   {mime:'application/pdf',filename:'x.pdf'}),/Formato/);
 await assert.rejects(importShopeeManualVideo(1,2,0,'TRC1525',Buffer.alloc(257),
   {mime:'video/mp4',filename:'x.mp4'}),/Conteúdo/);
 await assert.rejects(importShopeeManualVideo(1,2,0,'TRC1525',Buffer.alloc(MAX_VIDEO_BYTES+1),
   {mime:'video/mp4',filename:'x.mp4'}),/30 MB/);
});
test('manual upload is restricted, staged, and has no video publication endpoint',()=>{
 const srv=read('server.js'),html=read('public/index.html'),js=read('public/app.js');
 const b=srv.indexOf("app.get('/api/shopee/optimizer/execution/diagnostic'");
 const e=srv.indexOf("app.get('/api/shopee/optimizer/settings'",b);
 assert.ok(b>0&&e>b);
 const route=srv.slice(b,e);
 assert.match(route,/checkedManualVideoIdentity/);
 assert.match(route,/findExactCatalogSku/);
 assert.match(route,/verifiedSameOrigin/);
 assert.match(route,/express\.raw/);
 assert.match(route,/publishedInShopee:false/);
 assert.doesNotMatch(route,/media_space\/upload_video_part|media_space\/complete_video_upload|product\/update_item/);
 for(const id of ['optimizerVideoManualPanel','optimizerVideoFile','optimizerVideoUpload',
 'optimizerVideoRefresh','optimizerVideoPreview','optimizerVideoStatus',
 'optimizerConnectionCheck','optimizerConnectionStatus']){
  assert.equal((html.match(new RegExp('id="'+id+'"','g'))||[]).length,1,id);
 }
 assert.match(js,/video\/manual\?'/);
 assert.match(js,/optimizerConnectionCheck\(\)/);
 assert.match(js,/Vídeo importado · não publicado/);
});
