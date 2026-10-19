import test from 'node:test';
import assert from 'node:assert/strict';
import {readWeDropProduct} from '../wedropCosts.js';

test('supplier lookup retrieves the exact stored SKU, including punctuation, without adding quotes',async()=>{
 const previousFetch=globalThis.fetch;
 const previousEnv={url:process.env.SUPABASE_URL,key:process.env.SUPABASE_SECRET_KEY};
 process.env.SUPABASE_URL='https://fixture.supabase.co';
 process.env.SUPABASE_SECRET_KEY='fixture';
 const rows=['TRC1525','0007','KIT.A,(B):C','SKU"X\\Y','A&B#?=Z'].map(sku=>({
  supplier_sku:sku,product_data:{ncm:'95069900'},source_file:'catalogo.csv',source_line:5306
 }));
 let links=[];
 globalThis.fetch=async(url,options={})=>{
  const u=new URL(url);
  assert.equal(options.method,'GET');
  assert.equal(u.origin,'https://fixture.supabase.co');
  assert.equal(u.searchParams.get('shop_id'),'eq.852701218');
  if(u.pathname.endsWith('/shopee_wedrop_sku_links'))return Response.json(links);
  assert.equal(u.pathname,'/rest/v1/shopee_wedrop_products');
  assert.deepEqual([...u.searchParams.keys()],['shop_id','supplier_sku','select','limit']);
  // A top-level PostgREST eq operand is literal, including any quotes.
  const operand=u.searchParams.get('supplier_sku').slice(3);
  return Response.json(rows.filter(row=>row.supplier_sku===operand));
 };
 try{
  for(const row of rows){
   const found=await readWeDropProduct(852701218,{sku:row.supplier_sku,itemId:22095398152});
   assert.equal(found?.supplier_sku,row.supplier_sku);
   assert.equal(found?.product_data.ncm,'95069900');
   assert.equal(found?.matchedBy,'exact-sku');
  }
  links=[{item_id:22095398152,model_id:0,shopee_sku:'OUTRO',supplier_sku:'TRC1525'}];
  assert.equal((await readWeDropProduct(852701218,{sku:'OUTRO',itemId:22095398152})).matchedBy,'reviewed-link');
  assert.equal(await readWeDropProduct(852701218,{sku:'MUDOU',itemId:22095398152}),null);
 }finally{
  globalThis.fetch=previousFetch;
  for(const [key,value] of [['SUPABASE_URL',previousEnv.url],['SUPABASE_SECRET_KEY',previousEnv.key]]){
   if(value===undefined)delete process.env[key];else process.env[key]=value;
  }
 }
});
