import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {lookupShopeeCompetitors,marketSearchQueries,comparableTitle,evaluateMarketOffers} from '../shopeeMarketResearch.js';

const title='Super Mochila Construtor 3 em 1 com Ferramentas e Acessórios';
const offer=(shop,id,name,price)=>({shopId:String(shop),itemId:String(id),
 productName:name,priceMin:String(price),priceMax:String(price)});

test('Pesquisa Shopee amplia termos quando título exato não encontra 2 concorrentes',async()=>{
 const originalFetch=globalThis.fetch;
 const previousId=process.env.SHOPEE_AFFILIATE_APP_ID;
 const previousSecret=process.env.SHOPEE_AFFILIATE_SECRET;
 const queries=[];
 process.env.SHOPEE_AFFILIATE_APP_ID='unit-test-credential';
 process.env.SHOPEE_AFFILIATE_SECRET='unit-test-secret';
 globalThis.fetch=async(_url,{body})=>{
  const query=JSON.parse(body).query;
  queries.push(query);
  assert.match(query,/limit:50/);
  const nodes=queries.length===1?[]:queries.length===2?
   [offer(101,201,'Mochila Construtor 3 em 1 Ferramentas Brinquedo Infantil',156.75)]:
   [offer(102,202,'Maleta Mochila Oficina Ferramentas Brinquedo Infantil 3 em 1',163.4)];
  return {ok:true,json:async()=>({data:{productOfferV2:{nodes,pageInfo:{hasNextPage:false}}}})};
 };
 try{
  const r=await lookupShopeeCompetitors({title,ownItemId:'58220952395',ownShopId:'987654321'});
  assert.equal(r.verified,true);
  assert.equal(r.count,2);
  assert.equal(r.reference,160.07);
  assert.equal(r.searchedQueries.length,3);
  assert.equal(r.rawOfferCount,2);
  assert.ok(r.sample.every(x=>x.url.startsWith('https://shopee.com.br/product/')));
 }finally{
  globalThis.fetch=originalFetch;
  if(previousId===undefined)delete process.env.SHOPEE_AFFILIATE_APP_ID;
  else process.env.SHOPEE_AFFILIATE_APP_ID=previousId;
  if(previousSecret===undefined)delete process.env.SHOPEE_AFFILIATE_SECRET;
  else process.env.SHOPEE_AFFILIATE_SECRET=previousSecret;
 }
});
test('Uma única referência aparece como parcial, nunca média pesquisada',()=>{
 const r=evaluateMarketOffers({title,offers:[
  offer(333,444,'Mochila Infantil Construtor 3 em 1 Ferramentas Brinquedo',156.75)
 ],ownShopId:'999',ownItemId:'888'});
 assert.equal(r.verified,false);
 assert.equal(r.reference,null);
 assert.equal(r.count,1);
 assert.equal(r.sample.length,1);
});
test('Mochila de ferramentas profissional não é concorrente do brinquedo infantil',()=>{
 assert.equal(comparableTitle(title,
  'Mochila profissional eletricista para ferramentas reforçada com bolsos'),false);
 assert.equal(comparableTitle(title,
  'Mochila infantil com ferramentas de brinquedo oficina 3 em 1'),true);
 assert.ok(marketSearchQueries(title).length>=3);
});
test('Interface sempre oferece acesso à busca pública da Shopee',()=>{
 const html=readFileSync(new URL('../public/index.html',import.meta.url),'utf8');
 const js=readFileSync(new URL('../public/app.js',import.meta.url),'utf8');
 assert.match(html,/id="pricingMarketSearchShopee"/);
 assert.match(js,/https:\/\/shopee.com.br\/search\?keyword=/);
 assert.match(js,/referência\(s\) parcial\(is\)/);
 assert.match(js,/for\(const offer of sample\)/);
 assert.match(js,/provisório/);
});
