import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {SHOPEE_OFFER_PAGE_LIMIT,lookupShopeeCompetitors,marketSearchKeywords} from '../shopeeMarketResearch.js';

test('API Shopee Afiliados nunca usa limit acima de 50, evitando erro 11001',async()=>{
 const oldId=process.env.SHOPEE_AFFILIATE_APP_ID,oldSecret=process.env.SHOPEE_AFFILIATE_SECRET;
 const oldFetch=globalThis.fetch,requests=[];
 process.env.SHOPEE_AFFILIATE_APP_ID='test-id-not-secret';
 process.env.SHOPEE_AFFILIATE_SECRET='test-secret-not-secret';
 globalThis.fetch=async(_url,config)=>{
  const query=JSON.parse(config.body).query;
  requests.push(query);
  if(/limit:(5[1-9]|[6-9]\d|\d{3,})\b/.test(query))
   return {ok:true,json:async()=>({errors:[{message:'[11001]: Exceeded the maximum number of page limit, the maximum limit is 50'}]})};
  return {ok:true,json:async()=>({data:{productOfferV2:{nodes:[
   {shopId:'1001',itemId:'2001',productName:'Super Mochila Construtor 3 em 1 com Ferramentas e Acessórios',priceMin:'165',priceMax:'165'},
   {shopId:'1002',itemId:'2002',productName:'Super Mochila Construtor 3 em 1 com Ferramentas e Acessórios',priceMin:'175',priceMax:'175'}
  ],pageInfo:{hasNextPage:false}}}})};
 };
 try{
  assert.equal(SHOPEE_OFFER_PAGE_LIMIT,50);
  assert.ok(marketSearchKeywords('Super Mochila Construtor 3 em 1 com Ferramentas e Acessórios').length>=10);
  const result=await lookupShopeeCompetitors({title:'Super Mochila Construtor 3 em 1 com Ferramentas e Acessórios',
   ownShopId:'999',ownItemId:'58220952395'});
  assert.equal(result.status,'verified');
  assert.equal(result.reference,170);
  assert.equal(result.count,2);
  assert.ok(requests.length>=1);
  assert.ok(requests.every(q=>q.includes('limit:50')));
 }finally{
  globalThis.fetch=oldFetch;
  if(oldId===undefined)delete process.env.SHOPEE_AFFILIATE_APP_ID;
  else process.env.SHOPEE_AFFILIATE_APP_ID=oldId;
  if(oldSecret===undefined)delete process.env.SHOPEE_AFFILIATE_SECRET;
  else process.env.SHOPEE_AFFILIATE_SECRET=oldSecret;
 }
});

test('Código da pesquisa não volta a solicitar 60 ofertas',()=>{
 const src=readFileSync(new URL('../shopeeMarketResearch.js',import.meta.url),'utf8');
 assert.doesNotMatch(src,/page:1,\s*limit:60/);
 assert.match(src,/SHOPEE_OFFER_PAGE_LIMIT=50/);
});
