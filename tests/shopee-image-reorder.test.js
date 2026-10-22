import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {reorderPreparedImage} from '../shopeePreparedImages.js';

const read=path=>readFileSync(new URL(path,import.meta.url),'utf8');
test('prepared image reorder accepts two distinct slots and uses a single transactional RPC',async()=>{
 const old={fetch:globalThis.fetch,url:process.env.SUPABASE_URL,key:process.env.SUPABASE_SECRET_KEY};
 const imageA='a'.repeat(64),imageB='b'.repeat(64),seen=[];
 try{
  process.env.SUPABASE_URL='https://fixture.supabase.co';
  process.env.SUPABASE_SECRET_KEY='service-test-key';
  globalThis.fetch=async(url,opts)=>{
   seen.push({url:String(url),opts});
   return Response.json({fromSlot:2,toSlot:9,mode:'swap'});
  };
  const result=await reorderPreparedImage(55,100,0,'SKU3747',2,9,imageA,imageB);
  assert.equal(result.mode,'swap');
  assert.equal(seen.length,1);
  assert.match(seen[0].url,/\/rest\/v1\/rpc\/swap_shopee_optimizer_images$/);
  assert.equal(seen[0].opts.method,'POST');
  assert.deepEqual(JSON.parse(seen[0].opts.body),{
   p_shop_id:55,p_item_id:100,p_model_id:0,p_sku:'SKU3747',
   p_from_slot:2,p_to_slot:9,p_from_sha256:imageA,p_to_sha256:imageB
  });
  await assert.rejects(()=>reorderPreparedImage(55,100,0,'SKU3747',2,2,imageA,imageB),/outra posição/);
  assert.equal(seen.length,1);
 }finally{
  globalThis.fetch=old.fetch;
  if(old.url===undefined)delete process.env.SUPABASE_URL;else process.env.SUPABASE_URL=old.url;
  if(old.key===undefined)delete process.env.SUPABASE_SECRET_KEY;else process.env.SUPABASE_SECRET_KEY=old.key;
 }
});
test('UI supports mouse drag and a keyboard/mobile destination selector',()=>{
 const app=read('../public/app.js'),html=read('../public/index.html'),css=read('../public/style.css'),server=read('../server.js');
 assert.match(app,/card\.draggable=Boolean\(image\)/);
 assert.match(app,/card\.ondragstart=/);
 assert.match(app,/card\.ondrop=/);
 assert.match(app,/moveSelect\.onchange=/);
 assert.match(app,/optimizerImagesMove\(w,from,slot,stored\)/);
 assert.match(app,/optimizerImagesMove\(w,slot,destination,stored\)/);
 assert.match(app,/fromSha256:source\.sha256,toSha256:target\?\.sha256\|\|null/);
 assert.match(app,/stage\.reviewed=false;stage\.status='pending'/);
 assert.match(html,/Arraste uma foto pronta para outra posição/);
 assert.match(html,/app\.js\?v=1\.21\.9-gallery-reorder/);
 assert.match(css,/optimizer-image-drag-target/);
 assert.match(server,/app\.post\('\/api\/shopee\/optimizer\/images\/reorder',mustLogin,requireWeDropAdmin/);
 assert.match(server,/verifiedSameOrigin\(req\)/);
 assert.match(server,/reorderPreparedImage\(/);
 assert.match(server,/marketplaceUpdated:false/);
});
