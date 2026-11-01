import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {saveKitFiscalOrigin} from '../shopeeKitDraftStore.js';
import {readKitFiscalPreset} from '../shopeeKitFiscalPreset.js';
const kitSku='KIT-126051011000-126088800001-TRC0663';
const codes=['1.26088.80.0001','1.26051.01.1000','TRC0663'];
const ncm={'1.26088.80.0001':'96039000','1.26051.01.1000':'73239300','TRC0663':'39249000'};
test('Gravar origem 2 por SKU no kit sem alterar NCM ou outros dados e recarregar',async()=>{
 const oldFetch=globalThis.fetch,oldUrl=process.env.SUPABASE_URL,oldKey=process.env.SUPABASE_SECRET_KEY;
 const originalDraft={kit:{components:codes.map(sku=>({sku,name:sku}))},creative:{
  title:'Kit banheiro completo',description:'Descrição comercial e fiscal a preservar',
  manualFacts:{TRC0663:'Dados técnicos preservados'}},
  publication:{status:'local_draft',itemId:null},optimization:null};
 let savedDraft=structuredClone(originalDraft),patches=0;
 try{
  process.env.SUPABASE_URL='https://fixture.supabase.co';
  process.env.SUPABASE_SECRET_KEY='fixture-key';
  globalThis.fetch=async(url,options={})=>{
   const u=new URL(String(url));
   if(u.pathname.endsWith('/shopee_wedrop_kit_drafts')){
    if(options.method==='PATCH'){
     const body=JSON.parse(options.body);savedDraft=body.draft;patches++;
     return Response.json([{kit_sku:kitSku,draft:savedDraft}]);
    }
    return Response.json([{kit_sku:kitSku,component_skus:codes,draft:savedDraft,
      updated_at:'2026-11-01T07:00:00Z'}]);
   }
   if(u.pathname.endsWith('/shopee_wedrop_products')){
    const sku=decodeURIComponent(u.searchParams.get('supplier_sku').replace(/^eq\./,''));
    return Response.json([{supplier_sku:sku,product_data:{ncm:ncm[sku],name:sku},source_file:'wedrop.csv'}]);
   }
   if(u.pathname.endsWith('/shopee_optimizer_workflow_reviews'))
    return Response.json([]);
   throw Error('Request inesperada: '+u.pathname);
  };
  const origins=Object.fromEntries(codes.map(sku=>[sku,'2']));
  const response=await saveKitFiscalOrigin(852701218,kitSku,origins);
  assert.equal(response.saved,true);
  assert.equal(patches,1);
  assert.deepEqual(Object.fromEntries(codes.map(sku=>[sku,savedDraft.creative.fiscalBySku[sku].origin])),origins);
  assert.equal(savedDraft.creative.title,originalDraft.creative.title);
  assert.deepEqual(savedDraft.creative.manualFacts,originalDraft.creative.manualFacts);
  const read=await readKitFiscalPreset(852701218,kitSku,codes[0]);
  assert.deepEqual(read.skuPresets.map(item=>item.taxDraft.origin),['2','2','2']);
  assert.deepEqual(read.skuPresets.map(item=>item.ncm),codes.map(sku=>ncm[sku]));
  assert.equal(read.taxDraft.origin,'2');
  assert.equal(read.marketplaceUpdated,false);
 }finally{
  globalThis.fetch=oldFetch;
  if(oldUrl===undefined)delete process.env.SUPABASE_URL;else process.env.SUPABASE_URL=oldUrl;
  if(oldKey===undefined)delete process.env.SUPABASE_SECRET_KEY;else process.env.SUPABASE_SECRET_KEY=oldKey;
 }
});
test('A Etapa 08 salva origem no banco antes de marcar conferida; a Etapa 09 reconcilia 502 sem publicar',()=>{
 const builder=readFileSync(new URL('../public/kit-builder.js',import.meta.url),'utf8');
 const opt=readFileSync(new URL('../public/kit-existing-optimization.js',import.meta.url),'utf8');
 const api=readFileSync(new URL('../server.js',import.meta.url),'utf8');
 assert.ok(builder.includes('/api/shopee/kits/fiscal-preset/origin'));
 assert.ok(builder.includes('Conferência não registrada:'));
 assert.ok(api.includes("app.post('/api/shopee/kits/fiscal-preset/origin'"));
 assert.ok(opt.includes('/api/shopee/kits/optimization/link-status?'));
 assert.ok(opt.includes('if(!retryable(error))throw error'));
 assert.ok(opt.includes('if(!verified)verified=await readLink();'));
 assert.ok(!opt.slice(opt.indexOf('async function prepareDiscountLink()'),
  opt.indexOf('function discountNotice(')).includes('/api/shopee/optimizer/execution/execute'));
});
