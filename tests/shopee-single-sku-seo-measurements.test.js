import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {validateReview,singleProductTitleDimensionsVerified,kitTitleDimensionsVerified} from '../shopeeOptimizationWorkflow.js';

const title='🏊 Colchão Inflável para Piscina 183x69cm em PVC com Encosto para Cabeça e Gomos, para Praia e Verão, Cor Sortida ☀️';
const wedrop='Colchão Inflável Piscina 183x69cm Verão';

test('WS20357: conferir título SEO individual com 183x69cm confirmado pela WeDrop',()=>{
 assert([...title].length>=100&&[...title].length<=120);
 const checked=validateReview({stage:'seo',reviewed:true,title},{singleProductName:wedrop});
 assert.equal(checked.reviewed,true);
 assert.equal(checked.title,title);
 assert.equal(singleProductTitleDimensionsVerified(title,wedrop),true);
 assert.equal(singleProductTitleDimensionsVerified(title.replace('183x69cm','183 × 69 cm'),wedrop),true);
});

test('SKU individual não herda medidas de outro produto ou de fornecedor sem vínculo',()=>{
 assert.throws(()=>validateReview({stage:'seo',reviewed:true,title}),/nome comercial WeDrop confirmado/);
 assert.throws(()=>validateReview({stage:'seo',reviewed:true,title},
  {singleProductName:'Colchão Inflável Piscina 180x69cm'}),/nome comercial WeDrop confirmado/);
 assert.throws(()=>validateReview({stage:'seo',reviewed:true,title},
  {singleProductName:'Outro produto 200x69cm'}),/nome comercial WeDrop confirmado/);
 assert.equal(singleProductTitleDimensionsVerified(title,''),false);
});

test('kits continuam exigindo medidas presentes em um de seus nomes reais',()=>{
 assert.equal(kitTitleDimensionsVerified(title,['Produto A','Produto B']),false);
 assert.equal(kitTitleDimensionsVerified(title,['Produto A',wedrop]),true);
 assert.throws(()=>validateReview({stage:'seo',reviewed:true,title},
  {kitProductNames:['Produto A','Produto B'],singleProductName:wedrop}),/um dos produtos deste kit/);
});

test('rota de revisão usa vínculo WeDrop exato da SKU e nunca aprova sozinha',()=>{
 const server=readFileSync(new URL('../server.js',import.meta.url),'utf8');
 const start=server.indexOf("app.post('/api/shopee/optimizer/workflow/review'");
 const end=server.indexOf("app.post('/api/shopee/optimizer/execution/prepare'",start);
 const route=server.slice(start,end);
 assert(start>=0&&end>start);
 assert.match(route,/readWeDropProduct\(auth\.shopId,\{sku,itemId,modelId\}\)/);
 assert.match(route,/\['exact-sku','reviewed-link'\]/);
 assert.match(route,/supplier\.product_data\?\.name/);
 assert.match(route,/validateReview\(req\.body,\{allowShortKitTitle,kitProductNames,singleProductName\}\)/);
 assert.match(route,/marketplaceUpdated:false/);
});
