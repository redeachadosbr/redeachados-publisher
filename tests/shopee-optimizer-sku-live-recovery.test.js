import test from 'node:test';
import assert from 'node:assert/strict';
import {findExactCatalogSku} from '../catalogStore.js';
import {findLiveShopeeSku} from '../shopeeSkuFinder.js';
import {validateSkuLookup} from '../productOptimizer.js';

const cfg={},auth={shopId:111,accessToken:'test-token'};
const sampleBase={item_id:22095398152,item_sku:'TRC1525',
  item_name:'Piscina Inflável - Azul',item_status:'NORMAL',category_id:1,
  has_model:true,image:{image_url_list:[]},price_info:[{current_price:280.99}]};
test('regression: alphanumeric TRC1525 is accepted by both product and cache validators',async()=>{
  assert.equal(validateSkuLookup('TRC1525'),'TRC1525');
  const oldUrl=process.env.SUPABASE_URL,oldKey=process.env.SUPABASE_SECRET_KEY;
  const oldFetch=globalThis.fetch;
  process.env.SUPABASE_URL='https://example.test';
  process.env.SUPABASE_SECRET_KEY='mock-service-role';
  let calls=0;
  globalThis.fetch=async()=>{calls++;return {ok:true,json:async()=>[]};};
  try{
    assert.deepEqual(await findExactCatalogSku(111,'TRC1525'),[]);
    assert.equal(calls,2);
    await assert.rejects(findExactCatalogSku(111,'TRC15\x00'),/SKU válido/);
  }finally{
    globalThis.fetch=oldFetch;
    if(oldUrl===undefined)delete process.env.SUPABASE_URL;else process.env.SUPABASE_URL=oldUrl;
    if(oldKey===undefined)delete process.env.SUPABASE_SECRET_KEY;else process.env.SUPABASE_SECRET_KEY=oldKey;
  }
});
test('search_item retrieves item missing in Supabase; saves exact SKU+item ID',async()=>{
  const saved=[];
  const paths=[];
  const mock=async(_cfg,req)=>{
    paths.push(req.path);
    if(req.path.endsWith('/search_item'))return {response:{item_id_list:[22095398152]}};
    if(req.path.endsWith('/get_item_base_info'))return {response:{item_list:[sampleBase]}};
    throw Error('Unexpected endpoint '+req.path);
  };
  const result=await findLiveShopeeSku(cfg,auth,mock,'TRC1525',{
    saveItems:async(_shop,items)=>saved.push(...items),
    saveModels:async()=>{throw Error('No variations required when parent matches')}
  });
  assert.equal(result.matches.length,1);
  assert.equal(result.matches[0].itemId,'22095398152');
  assert.equal(result.matches[0].modelId,'0');
  assert.equal(result.matches[0].sku,'TRC1525');
  assert.equal(saved[0].sku,'TRC1525');
  assert.equal(result.source,'live_search');
  assert.deepEqual(paths,['/api/v2/product/search_item','/api/v2/product/get_item_base_info']);
});
test('model SKU matched by exact variation, not incorrectly attributed to parent',async()=>{
  const mock=async(_cfg,req)=>{
    if(req.path.endsWith('/search_item'))return {response:{item_id_list:[22095398152]}};
    if(req.path.endsWith('/get_item_base_info'))return {response:{item_list:[{...sampleBase,item_sku:'PARENT'}]}};
    if(req.path.endsWith('/get_model_list'))return {response:{model:[{
      model_id:179732416931,model_sku:'TRC1525',model_status:'NORMAL',price_info:[{current_price:280.99}]
    }]}};
    throw Error('unexpected endpoint');
  };
  const savedModels=[];
  const result=await findLiveShopeeSku(cfg,auth,mock,'TRC1525',{
    saveItems:async()=>{},saveModels:async(_shop,_item,models)=>savedModels.push(...models)});
  assert.equal(result.matches[0].modelId,'179732416931');
  assert.equal(result.matches[0].source,'shopee_model_live');
  assert.equal(savedModels[0].sku,'TRC1525');
});
test('when cache is missing and targeted endpoint is empty, refreshes live catalog pages',async()=>{
  const calls=[];
  const finder=async(_cfg,req)=>{
    calls.push(req.path);
    if(req.path.endsWith('/search_item'))return {response:{item_id_list:[]}};
    throw Error('No other API calls expected');
  };
  const pages=[];
  const pageFetcher=async(_cfg,_auth,_call,options)=>{
    pages.push(options);
    return {items:[{
      itemId:'22095398152',sku:'TRC1525',title:'Piscina Inflável - Azul',
      status:'NORMAL',baseLoaded:true,hasModel:false,imageUrl:''
    }],hasNext:false,nextOffset:null};
  };
  const saved=[];
  const result=await findLiveShopeeSku(cfg,auth,finder,'TRC1525',{
    pageFetcher,saveItems:async(_id,rows)=>saved.push(...rows),saveModels:async()=>{}
  });
  assert.equal(result.matches[0].sku,'TRC1525');
  assert.equal(result.matches[0].source,'shopee_catalog_refresh');
  assert.equal(saved.length,1);
  assert.equal(pages[0].status,'NORMAL');
});
test('a similar SKU does not match and invalid characters are rejected',async()=>{
  const mock=async(_cfg,req)=>{
    if(req.path.endsWith('/search_item'))return {response:{item_id_list:[]}};
    throw Error('not used');
  };
  const r=await findLiveShopeeSku(cfg,auth,mock,'TRC152',{
    pageFetcher:async()=>({items:[{
      itemId:'22095398152',sku:'TRC1525',title:'Outra SKU',
      status:'NORMAL',hasModel:false,baseLoaded:true
    }],hasNext:false,nextOffset:null}),
    saveItems:async()=>{},saveModels:async()=>{},maxPages:1
  });
  assert.deepEqual(r.matches,[]);
  await assert.rejects(findLiveShopeeSku(cfg,auth,mock,'TRC1525\n'),/SKU válido/);
});
