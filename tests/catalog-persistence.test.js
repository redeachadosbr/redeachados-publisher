import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {
 validatePublisherCatalog,readPublisherCatalog,savePublisherCatalog
} from '../publisherShopeeCatalogStore.js';

const sample=()=>({
 schemaVersion:2,shopId:'852701218',importedAt:'2026-10-27T16:00:00Z',
 sourceFile:'catalogo.xlsx',manualSkuAliases:[{productId:'10',sku:'050'}],
 products:[
  {id:'10',sku:'050',name:'Produto com SKU 050',description:'',skus:['050','050-A'],variations:[{sku:'050-A',name:'Azul'}]},
  {id:'20',sku:'2300',name:'Segundo anúncio',skus:['2300'],variations:[]}
 ]
});
test('backup preserva SKU com zeros, variações e vínculos manuais',()=>{
 const cat=sample();assert.strictEqual(validatePublisherCatalog(cat),cat);
 assert.equal(cat.products[0].sku,'050');assert.equal(cat.manualSkuAliases[0].sku,'050');
 assert.equal(cat.products[0].variations[0].sku,'050-A');
});
test('backup rejeita catálogo vazio, ID duplicado e outra loja',()=>{
 assert.throws(()=>validatePublisherCatalog({...sample(),products:[]}),/Catálogo vazio/);
 assert.throws(()=>validatePublisherCatalog({...sample(),shopId:'999'}),/não corresponde/);
 const wrong=sample();wrong.products.push({...wrong.products[0]});
 assert.throws(()=>validatePublisherCatalog(wrong),/duplicado/);
});
test('Supabase armazena e recupera o mesmo catálogo sem nova planilha',async()=>{
 const oldFetch=globalThis.fetch,backup={
  SUPABASE_URL:process.env.SUPABASE_URL,
  SUPABASE_SECRET_KEY:process.env.SUPABASE_SECRET_KEY,
  SUPABASE_SERVICE_ROLE_KEY:process.env.SUPABASE_SERVICE_ROLE_KEY
 };
 process.env.SUPABASE_URL='https://example.supabase.co';
 process.env.SUPABASE_SECRET_KEY='sb_secret_teste';
 delete process.env.SUPABASE_SERVICE_ROLE_KEY;
 const catalog=sample();let calls=0;
 try{
  globalThis.fetch=async(url,options={})=>{
   calls++;assert.match(String(url),/publisher_shopee_catalog_snapshots/);
   assert.equal(options.headers.apikey,'sb_secret_teste');
   assert.equal(options.headers.Authorization,undefined);
   if(options.method==='POST'){
    const rows=JSON.parse(options.body);
    assert.equal(rows.length,1);
    assert.equal(rows[0].catalog.products[0].sku,'050');
    assert.equal(rows[0].catalog.manualSkuAliases[0].sku,'050');
    return new Response('',{status:201});
   }
   assert.match(String(url),/shop_id=eq\.852701218/);
   return new Response(JSON.stringify([{
    catalog,source:'shopee_excel',updated_at:'2026-10-27T16:00:00Z'
   }]),{status:200});
  };
  const saved=await savePublisherCatalog(catalog,{source:'shopee_excel'});
  assert.equal(saved.saved,true);
  const recovered=await readPublisherCatalog();
  assert.deepEqual(recovered.catalog,catalog);
  assert.equal(recovered.source,'shopee_excel');
  assert.equal(calls,2);
 }finally{
  globalThis.fetch=oldFetch;
  for(const [k,value] of Object.entries(backup))
   if(value===undefined)delete process.env[k];else process.env[k]=value;
 }
});
test('importação evita troca da cópia local se backup remoto falhar',()=>{
 const server=fs.readFileSync(new URL('../server.js',import.meta.url),'utf8');
 const begin=server.indexOf("app.post('/api/catalog/import'");
 const end=server.indexOf("app.post('/api/catalog/sku-alias'",begin);
 assert.ok(begin>=0&&end>begin);
 const route=server.slice(begin,end);
 assert.ok(route.indexOf('await savePublisherCatalog(c')<route.indexOf('saveCatalog(c);'));
 assert.match(server,/await restorePublisherCatalog\(\)/);
 assert.match(server,/app\.post\('\/api\/catalog\/recover'/);
});
test('tela informa backup permanente e permite recuperar sem baixar planilha',()=>{
 const app=fs.readFileSync(new URL('../public/app.js',import.meta.url),'utf8');
 const html=fs.readFileSync(new URL('../public/index.html',import.meta.url),'utf8');
 assert.match(app,/Catálogo salvo permanentemente no Supabase/);
 assert.match(app,/\/api\/catalog\/recover/);
 assert.match(html,/id="recoverCatalogBtn"/);
});
