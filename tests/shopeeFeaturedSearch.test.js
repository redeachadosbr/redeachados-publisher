import test from 'node:test';
import assert from 'node:assert/strict';
import {featuredSearchUrl,parseFeaturedSearch,searchFeaturedPublic} from '../shopeeFeaturedSearch.js';

const payload={data:{items:[
 {item_basic:{itemid:9876,shopid:7654,name:'Coqueteleira Inox 500ml',
  sold:950,historical_sold:12000,price:2690000,image:'mock-image'}},
 {item_basic:{itemid:9877,shopid:7655,name:'Coqueteleira de Plástico 700ml',
  historical_sold:5000,price:1950000}},
 {item_basic:{itemid:9878,shopid:7656,name:'Estojo Escolar',
  sold:null,historical_sold:null,price:1950000}}
]}};
test('Em Destaque usa by=sales e origem fixa Shopee brasileira',()=>{
 const url=new URL(featuredSearchUrl('coqueteleira'));
 assert.equal(url.origin,'https://shopee.com.br');
 assert.equal(url.pathname,'/api/v4/search/search_items');
 assert.equal(url.searchParams.get('by'),'sales');
 assert.equal(url.searchParams.get('keyword'),'coqueteleira');
 assert.equal(url.searchParams.get('newest'),'0');
});
test('vitrine informa sold mensal separado do histórico, nunca inventa sold ausente',()=>{
 const out=parseFeaturedSearch(payload);
 assert.equal(out.length,2);
 assert.equal(out[0].monthlySold,950);
 assert.equal(out[0].historicalSold,12000);
 assert.equal(out[0].sales,12000);
 assert.equal(out[0].priceMin,26.9);
 assert.equal(out[0].dataSource,'shopee-featured-public');
 assert.equal(out[1].monthlySold,null);
 assert.equal(out[1].historicalSold,5000);
 assert.equal(out[1].priceMin,19.5);
});
test('não confunde preço, vendedor, SKU e nem contagem não existente',()=>{
 assert.deepEqual(parseFeaturedSearch({items:[{item_basic:{
  name:'Anúncio sem Item ID',sold:900,price:1200000
 }}]}),[]);
 assert.throws(()=>parseFeaturedSearch({data:{}}),/não forneceu itens/);
});
test('bloqueio por 403 é comunicado sem tentar bypass ou retorno fictício',async()=>{
 let n=0;
 const result=await searchFeaturedPublic('coqueteleira',{fetchImpl:async()=>{
  n++;return {status:403,ok:false};
 }});
 assert.equal(n,1);
 assert.equal(result.ok,false);
 assert.equal(result.blocked,true);
 assert.equal(result.status,403);
 assert.deepEqual(result.offers,[]);
});
test('HTML de verificação da Shopee não vira anúncio ou venda mensal',async()=>{
 const response=await searchFeaturedPublic('coqueteleira',{fetchImpl:async()=>({
  status:200,ok:true,headers:{get:()=> 'text/html'}
 })});
 assert.equal(response.ok,false);
 assert.equal(response.blocked,true);
 assert.deepEqual(response.offers,[]);
});
test('fonte pública retorna dados quando resposta JSON é válida',async()=>{
 const response=await searchFeaturedPublic('coqueteleira',{fetchImpl:async()=>({
  status:200,ok:true,
  headers:{get:()=> 'application/json;charset=utf-8'},
  json:async()=>payload
 })});
 assert.equal(response.ok,true);
 assert.equal(response.offers.length,2);
 assert.equal(response.offers[0].monthlySold,950);
});
