import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {evaluateMarketOffers,marketSearchKeywords} from '../shopeeMarketResearch.js';
import {quoteShopeePrice} from '../shopeePricing.js';
const title='Super Mochila Construtor 3 em 1 com Ferramentas e Acessórios';
const offer=(i,price,name=title)=>({shopId:String(1000+i),itemId:String(2000+i),
 productName:name,priceMin:String(price),priceMax:String(price)});
const market=offers=>evaluateMarketOffers({title,ownShopId:9999,ownItemId:8888,offers,
 queriedAt:'2026-10-21T03:00:00Z'});
const settings={marginPct:10,minMarginPct:5,discountPct:20,couponPct:1,taxPct:4,
 flashPct:3,adsPct:0,shipping:0,packing:0,sellerType:'cpf',highVolumeCpf:false,
 commissionRates:[20,14,14,14],fixedFees:[4.5,16,20,26]};
test('exige ao menos dois anúncios comparáveis, não inventa média com um',()=>{
 const r=market([offer(1,156.75)]);
 assert.equal(r.verified,false);
 assert.equal(r.reference,null);
 assert.equal(r.count,1);
});
test('média aritmética de dois anúncios e links auditáveis',()=>{
 const r=market([offer(1,156.75),offer(2,163.4)]);
 assert.equal(r.verified,true);
 assert.equal(r.count,2);
 assert.equal(r.reference,160.07);
 assert.equal(r.method,'arithmetic_mean');
 assert.ok(r.sample.every(x=>x.url.includes('shopee.com.br/product/')));
});
test('três ofertas da TUD0667 dão média de R$ 168,44, não mediana',()=>{
 const r=market([offer(1,156.75),offer(2,163.4),offer(3,185.16)]);
 assert.equal(r.verified,true);
 assert.equal(r.reference,168.44);
 assert.equal(r.count,3);
});
test('cinco anúncios no máximo, excluindo loja própria e ofertas repetidas',()=>{
 const r=market([offer(1,156.75),offer(2,163.4),offer(3,185.16),offer(4,167.7),
  offer(5,175.25),offer(6,170),offer(7,168),
  {...offer(8,101),shopId:'9999'},offer(2,163.4)]);
 assert.equal(r.verified,true);
 assert.equal(r.count,5);
 assert.equal(r.sample.length,5);
 assert.equal(new Set(r.sample.map(x=>x.shopId)).size,5);
});
test('não compara acessório avulso com a mochila completa',()=>{
 const r=market([offer(1,156.75),
  offer(2,15,'Capa protetora para Mochila Construtor Ferramentas'),offer(3,163.4)]);
 assert.equal(r.count,2);
 assert.equal(r.verified,true);
});
test('preço ligeiramente acima da média preserva margem desejada de 10%',()=>{
 const q=quoteShopeePrice({unitCost:96.99,settings,marketAverage:168.44});
 assert.equal(q.status,'COMPETITIVO');
 assert.equal(q.customerPrice,169.56);
 assert.equal(q.targetMarginPreserved,true);
 assert.ok(q.netMarginPct>=10);
 assert.ok(q.customerPrice<=168.44*1.02);
});
test('mercado muito abaixo do piso não autoriza desconto que cause prejuízo',()=>{
 const q=quoteShopeePrice({unitCost:96.99,settings,marketAverage:90});
 assert.equal(q.status,'MERCADO_ABAIXO_DO_PISO');
 assert.ok(q.netMarginPct>=5);
});
test('interface exige fonte e mostra 2 a 5 anúncios antes da memória de cálculo',()=>{
 const html=readFileSync(new URL('../public/index.html',import.meta.url),'utf8');
 const app=readFileSync(new URL('../public/app.js',import.meta.url),'utf8');
 assert.match(html,/Pesquisa de mercado Shopee · 2 a 5 anúncios/);
 assert.ok(html.indexOf('id="pricingResearchAverage"')<html.indexOf('id="optimizerPricingPanel"'));
 assert.match(app,/research\.sample\)\?research\.sample:\[\]\)\.slice\(0,5\)/);
 assert.match(app,/API Shopee Afiliados/);
 assert.ok(marketSearchKeywords(title).length>10);
});
