import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {readKitFiscalPreset} from '../shopeeKitFiscalPreset.js';

const kitSku='KIT-126051011000-126088800001-TRC0663';
const codes=['1.26088.80.0001','1.26051.01.1000','TRC0663'];
const ncm={'1.26088.80.0001':'96039000','1.26051.01.1000':'73239300','TRC0663':'39249000'};
test('etapa 08 lê rascunho persistido e mostra NCM diferente para cada SKU',async()=>{
 const fetchOld=globalThis.fetch,oldUrl=process.env.SUPABASE_URL,oldKey=process.env.SUPABASE_SECRET_KEY;
 const requests=[];
 try{
  process.env.SUPABASE_URL='https://fixture.supabase.co';
  process.env.SUPABASE_SECRET_KEY='fixture-key';
  globalThis.fetch=async(url)=>{
   const u=new URL(String(url));requests.push(u.pathname+u.search);
   if(u.pathname.endsWith('/shopee_wedrop_kit_drafts'))return Response.json([{
    kit_sku:kitSku,component_skus:codes,
    draft:{kit:{components:codes.map(sku=>({sku,name:'Produto '+sku}))},
     creative:{},publication:{status:'local_draft',itemId:null}},
    updated_at:'2026-11-01T06:47:48Z'}]);
   if(u.pathname.endsWith('/shopee_wedrop_products')){
    const sku=decodeURIComponent(u.searchParams.get('supplier_sku').replace(/^eq\./,''));
    return Response.json([{supplier_sku:sku,source_file:'catalogo.csv',source_line:4,
     product_data:{name:'Produto '+sku,ncm:ncm[sku]}}]);
   }
   if(u.pathname.endsWith('/shopee_optimizer_workflow_reviews'))
    return Response.json([{sku:'1.26051.01.1000',
     review_state:{kitOptimization:{kitSku},tax:{
      ncm:'73239300',origin:'2',same_state_cfop:'5106',
      diff_state_cfop:'6106',csosn:'102',measure_unit:'UN',
      operation_type:'1',pis_cofins_cst:'99',cest:'00'}}}]);
   throw Error('Unrecognized endpoint '+u.pathname);
  };
  const result=await readKitFiscalPreset(852701218,kitSku,'1.26088.80.0001');
  assert.equal(result.sku,'1.26088.80.0001');
  assert.deepEqual(result.skuPresets.map(x=>x.sku),codes);
  assert.deepEqual(result.skuPresets.map(x=>x.ncm),codes.map(x=>ncm[x]));
  assert.equal(result.taxSuggestion.ncm,'96039000');
  assert.equal(result.taxSuggestion.origin,undefined,'não herdar origem fiscal de outra SKU');
  assert.equal(result.taxSuggestion.same_state_cfop,'5106');
  assert.equal(result.skuPresets[2].taxDraft.origin,undefined);
  assert.equal(result.skuPresets[1].taxDraft.origin,'2','revisão exata da lixeira preservada');
  assert.equal(result.skuPresets.every(x=>x.marketplaceUpdated===false),true);
  assert.equal(requests.filter(x=>x.includes('shopee_wedrop_products')).length,3);
 }finally{
  globalThis.fetch=fetchOld;
  if(oldUrl===undefined)delete process.env.SUPABASE_URL;else process.env.SUPABASE_URL=oldUrl;
  if(oldKey===undefined)delete process.env.SUPABASE_SECRET_KEY;else process.env.SUPABASE_SECRET_KEY=oldKey;
 }
});
test('o flag local de edição não bloqueia consulta fiscal de rascunho salvo',()=>{
 const js=readFileSync(new URL('../public/kit-builder.js',import.meta.url),'utf8');
 const start=js.indexOf('async function kitWizardRequestFiscal(');
 const end=js.indexOf('let kitWizardDiscountPending',start);
 assert.ok(start>0&&end>start);
 const code=js.slice(start,end);
 assert.doesNotMatch(code,/if\(!kitSaved\)/);
 assert.match(code,/api\('\/api\/shopee\/kits\/fiscal-preset\?/);
 assert.match(code,/kitWizardRenderFiscalSkuPresets\(data\)/);
 assert.match(js,/kitWizardFiscalSkuSummary/);
});
