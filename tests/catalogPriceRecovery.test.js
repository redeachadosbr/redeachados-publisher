import test from 'node:test';
import assert from 'node:assert/strict';
import {fetchCatalogPage,fetchCatalogPrices,modelPriceRange} from '../catalog.js';
const cfg={},auth={accessToken:'test',shopId:99};
const api=async(c,o)=>{
 if(o.path.endsWith('/get_item_list'))return {response:{item:[{item_id:123,item_status:'NORMAL'}],total_count:1,has_next_page:false}};
 if(o.path.endsWith('/get_item_base_info'))return {response:{item_list:[{item_id:123,has_model:true,item_name:'Produto com variações',price_info:[],item_status:'NORMAL'}]}};
 if(o.path.endsWith('/get_model_list'))return {response:{model:[
  {model_id:1,price_info:[{original_price:300,current_price:240}]},
  {model_id:2,price_info:[{original_price:450,current_price:360}]}]}};
 throw Error('Endpoint inesperado');
};
test('catálogo de variações usa preços correntes dos modelos',async()=>{
 const page=await fetchCatalogPage(cfg,auth,api,{});
 assert.equal(page.items[0].price,240);
 assert.equal(page.items[0].priceMax,360);
 assert.equal(page.items[0].priceSource,'model_current_price');
 const recovered=await fetchCatalogPrices(cfg,auth,api,['123']);
 assert.equal(recovered.verified[0].price,240);
 assert.equal(recovered.verified[0].priceMax,360);
});
test('sem modelo e sem current_price não inventa valor',async()=>{
 const call=async(c,o)=>o.path.endsWith('/get_item_base_info')
  ?{response:{item_list:[{item_id:456,has_model:false,price_info:[{original_price:200}]}]}}:{};
 const result=await fetchCatalogPrices(cfg,auth,call,['456']);
 assert.equal(result.items[0].price,null);
 assert.equal(result.verified.length,0);
});
test('consulta de modelos indisponível preserva preço desconhecido',async()=>{
 const call=async(c,o)=>o.path.endsWith('/get_item_base_info')
  ?{response:{item_list:[{item_id:123,has_model:true,price_info:[]}]}}
  :Promise.reject(Error('Shopee indisponível'));
 const result=await fetchCatalogPrices(cfg,auth,call,['123']);
 assert.equal(result.verified.length,0);
 assert.equal(result.warnings.length,1);
 assert.equal(modelPriceRange([{price:null},{price:0}]),null);
});
