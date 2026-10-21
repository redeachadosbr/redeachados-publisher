import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {fetchCatalogPage} from '../catalog.js';

const auth={accessToken:'test-token',shopId:123};
const base={};

test('status sem anúncios: Shopee pode omitir item; aceitar apenas total_count zero confirmado',async()=>{
 const calls=[];
 const api=async(_cfg,req)=>{
  calls.push(req.path);
  return {response:{total_count:0,has_next_page:false,next_offset:0}};
 };
 const page=await fetchCatalogPage(base,auth,api,{status:'UNLIST',offset:0,pageSize:50});
 assert.deepEqual(page.items,[]);
 assert.equal(page.totalCount,0);
 assert.equal(page.hasNext,false);
 assert.deepEqual(calls,['/api/v2/product/get_item_list']);
});

test('lista omitida com total positivo nunca vira página vazia silenciosa',async()=>{
 const api=async()=>({response:{total_count:524,has_next_page:true,next_offset:50}});
 await assert.rejects(
  fetchCatalogPage(base,auth,api,{status:'NORMAL',offset:0,pageSize:50}),
  /Listagem Shopee incompleta \(NORMAL, página 0\)/
 );
});

test('lista explicitamente vazia enquanto ainda há anúncios é erro bloqueante',async()=>{
 const api=async()=>({response:{item:[],total_count:524,has_next_page:true,next_offset:50}});
 await assert.rejects(
  fetchCatalogPage(base,auth,api,{status:'NORMAL',offset:0,pageSize:50}),
  /nenhum anúncio retornado de 524 esperados/
 );
});

test('página com itens reais mantém paginação e metadados oficiais',async()=>{
 const api=async(_cfg,req)=>{
  if(req.path==='/api/v2/product/get_item_list')
   return {response:{item:[{item_id:456,item_status:'NORMAL'}],total_count:1,has_next_page:false}};
  return {response:{item_list:[{item_id:456,item_name:'Produto A',item_sku:'SKU-A',item_status:'NORMAL',has_model:false}]}};
 };
 const page=await fetchCatalogPage(base,auth,api,{status:'NORMAL',offset:0,pageSize:50});
 assert.equal(page.totalCount,1);
 assert.equal(page.items.length,1);
 assert.equal(page.items[0].sku,'SKU-A');
});

test('variações oficiais MODEL_NORMAL e MODEL_UNAVAILABLE não desaparecem do inventário',()=>{
 const server=readFileSync(new URL('../server.js',import.meta.url),'utf8');
 const a=server.indexOf("app.get('/api/shopee/optimizer/fiscal-migration/active-skus'");
 const b=server.indexOf("app.post('/api/shopee/optimizer/fiscal-migration/prepare-drafts'",a);
 const route=server.slice(a,b);
 assert.match(route,/MODEL_NORMAL/);
 assert.match(route,/MODEL_UNAVAILABLE/);
 assert.match(route,/normalizeShopeeModels/);
});
