import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {validatePendingImageSnapshot,carryForwardPendingImageConfirmations,
 savePendingImageSnapshot,getPendingImageSnapshot,reconcilePendingImageVerification}
 from '../shopeePendingImageStore.js';

const row=(itemId,overrides={})=>({
 key:itemId+':0',itemId:String(itemId),modelId:'0',sku:'SKU'+itemId,
 title:'Produto '+itemId,listingStatus:'NORMAL',modelStatus:'',
 stock:6,imageCount:8,missingImages:1,imageUrl:'',category:'active_with_stock',
 reason:'',checkedAt:'2026-11-03T20:00:00.000Z',...overrides
});
test('apenas a varredura completa pode ser salva',()=>{
 const input={rows:[row('401')],scannedListings:2,totalListings:2};
 assert.equal(validatePendingImageSnapshot(input).rows[0].sku,'SKU401');
 assert.throws(()=>validatePendingImageSnapshot({...input,scannedListings:1}),/não terminou/i);
 assert.throws(()=>validatePendingImageSnapshot({...input,rows:[row('401'),row('401')]}),/duplicado/);
 assert.throws(()=>validatePendingImageSnapshot({...input,rows:[row('401',{stock:0})]}),/sem estoque/i);
 assert.throws(()=>validatePendingImageSnapshot({...input,rows:[row('401',{imageCount:9})]}),/menos de 9/);
});
test('segunda varredura conserva 9/9, salvo se a Shopee mostrar retorno a 8 imagens',()=>{
 const previous={optimized:{'401':{itemId:'401',skus:['SKU401'],
  imageCount:9,verifiedAt:'2026-11-03T20:40:00.000Z'}}};
 assert.ok(carryForwardPendingImageConfirmations(previous,[])[401]);
 assert.ok(carryForwardPendingImageConfirmations(previous,[
  row('401',{checkedAt:'2026-11-03T20:39:00.000Z'})])[401]);
 assert.ok(carryForwardPendingImageConfirmations(previous,[
  row('401',{checkedAt:'2026-11-03T20:41:00.000Z',imageCount:null,missingImages:null})])[401]);
 assert.equal(carryForwardPendingImageConfirmations(previous,[
  row('401',{checkedAt:'2026-11-03T20:41:00.000Z'})])[401],undefined);
});
test('o banco conserva a primeira fila e marca somente anúncio confirmado 9/9',async()=>{
 const oldFetch=globalThis.fetch;
 const oldUrl=process.env.SUPABASE_URL;
 const oldKey=process.env.SUPABASE_SECRET_KEY;
 process.env.SUPABASE_URL='https://mock.supabase.co';
 process.env.SUPABASE_SECRET_KEY='test-service-key';
 let current=null;
 let sequence=0;
 globalThis.fetch=async (url,options={})=>{
  assert.match(String(url),/\/rest\/v1\/shopee_pending_image_audits/);
  const method=options.method||'GET';
  if(method==='GET')
   return new Response(JSON.stringify(current?[current]:[]),{status:200});
  if(method==='POST'){
   const posted=JSON.parse(options.body)[0];
   if(current)return new Response('[]',{status:200});
   current={...posted,updated_at:'2026-11-03T21:00:00.000Z'};
   return new Response(JSON.stringify([current]),{status:200});
  }
  if(method==='PATCH'){
   const token=new URL(String(url)).searchParams.get('updated_at')?.replace(/^eq\./,'');
   if(token!==current.updated_at)return new Response('[]',{status:200});
   const update=JSON.parse(options.body);
   sequence++;
   current={...current,...update,updated_at:'2026-11-03T21:00:'+
    String(sequence).padStart(2,'0')+'.000Z'};
   return new Response(JSON.stringify([current]),{status:200});
  }
  throw Error('Unexpected '+method);
 };
 try{
  const input={rows:[row('401'),row('402')],scannedListings:5,totalListings:5};
  await savePendingImageSnapshot(123,input);
  let saved=await getPendingImageSnapshot(123);
  assert.equal(saved.rows.length,2);
  assert.equal(saved.rows[0].imageCount,8);
  assert.deepEqual(saved.optimized,{});
  const verified=await reconcilePendingImageVerification(123,{
   itemId:'401',status:'confirmed',complete:true,imageCount:9,
   verifiedAt:'2026-11-03T21:10:00.000Z'
  });
  assert.equal(verified.persisted,true);
  assert.equal(verified.optimized,true);
  saved=await getPendingImageSnapshot(123);
  assert.equal(saved.rows.length,2,'a fila de origem continua guardada');
  assert.deepEqual(saved.optimized['401'].skus,['SKU401']);
  assert.equal(saved.optimized['402'],undefined,'outras SKUs continuam pendentes');
  await savePendingImageSnapshot(123,{rows:[row('402')],scannedListings:5,totalListings:5});
  saved=await getPendingImageSnapshot(123);
  assert.ok(saved.optimized['401'],'nova varredura não apaga confirmações 9/9');
  assert.equal(saved.rows.length,1,'nova varredura substitui a lista original');
  await reconcilePendingImageVerification(123,{
   itemId:'401',status:'pending',complete:false,imageCount:8,
   verifiedAt:'2026-11-03T22:00:00.000Z'
  });
  saved=await getPendingImageSnapshot(123);
  assert.equal(saved.optimized['401'],undefined,
   'a Shopee pode reabrir uma pendência que perdeu imagens');
 }finally{
  globalThis.fetch=oldFetch;
  if(oldUrl===undefined)delete process.env.SUPABASE_URL;
  else process.env.SUPABASE_URL=oldUrl;
  if(oldKey===undefined)delete process.env.SUPABASE_SECRET_KEY;
  else process.env.SUPABASE_SECRET_KEY=oldKey;
 }
});
test('o menu mostra só ativas com estoque e só refaz varredura mediante solicitação',()=>{
 const html=readFileSync(new URL('../public/index.html',import.meta.url),'utf8');
 const ui=readFileSync(new URL('../public/pending-images.js',import.meta.url),'utf8');
 const server=readFileSync(new URL('../server.js',import.meta.url),'utf8');
 assert.match(html,/id="pendingImagesTotal"/);
 assert.match(html,/id="pendingImagesConfirmed"/);
 assert.match(html,/id="pendingImagesActive"/);
 assert.doesNotMatch(html,/value="all">Todos com menos de 9 imagens/);
 assert.doesNotMatch(html,/id="pendingImagesFilter"/);
 assert.match(ui,/rows\('active_with_stock'\)\.filter/);
 assert.match(ui,/if\(result\.exists&&result\.snapshot\)/);
 assert.match(ui,/if\(!exists\)await run\(\)/);
 assert.match(ui,/byId\('pendingImagesRefresh'\)\.addEventListener/);
 assert.match(ui,/applySnapshot\(data\.snapshot\)/);
 assert.match(ui,/\/api\/shopee\/optimizer\/pending-images\/confirm/);
 assert.match(server,/\/api\/shopee\/optimizer\/pending-images\/snapshot/);
 assert.match(server,/\/api\/shopee\/optimizer\/pending-images\/confirm/);
});
