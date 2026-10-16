import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const html=readFileSync(new URL('../public/index.html',import.meta.url),'utf8');
const css=readFileSync(new URL('../public/style.css',import.meta.url),'utf8');
const js=readFileSync(new URL('../public/app.js',import.meta.url),'utf8');

test('catálogo não fica mais preso em uma tabela larga com botões fora da tela',()=>{
 const area=html.slice(html.indexOf('id="tab-products"'),html.indexOf('id="tab-orders"'));
 assert.match(area,/class="table-wrap catalog-list"/);
 assert.match(area,/class="catalog-products-table"/);
 assert.match(area,/id="productsBody"/);
 assert.match(css,/#tab-products \.catalog-products-table tbody\{/);
 assert.match(css,/grid-template-columns:repeat\(2,minmax\(0,1fr\)\)/);
 assert.match(css,/@media\(max-width:1450px\)\{/);
 assert.match(css,/#tab-products \.catalog-products-table tbody\{grid-template-columns:1fr\}/);
 assert.match(css,/#tab-products \.catalog-products-table tbody td:nth-child\(8\)/);
 assert.match(css,/grid-template-areas:[\s\S]*?"product action"[\s\S]*?"sku status"/);
 assert.match(css,/#tab-products \.catalog-list\{width:100%;min-width:0;max-width:100%;border:0/);
 assert.match(css,/#tab-products \.catalog-product-title\{width:100%;min-width:0;max-width:100%/);
});

test('detalhes ficam visíveis acima dos anúncios e o clique move foco e rolagem',()=>{
 const area=html.slice(html.indexOf('id="tab-products"'),html.indexOf('id="tab-orders"'));
 const details=area.indexOf('id="productDetailsPanel"');
 const list=area.indexOf('id="productsBody"');
 assert.ok(details>0&&list>details);
 assert.match(area,/id="productDetailsPanel"[^>]*tabindex="-1"/);
 assert.match(js,/panel\.scrollIntoView\?\.\(\{behavior:'smooth',block:'start'\}\)/);
 assert.match(js,/panel\.focus\?\.\(\{preventScroll:true\}\)/);
 assert.match(css,/#tab-products \.catalog-details\{scroll-margin-top:90px/);
 assert.match(js,/b\.onclick=\(\)=>catalogShowModels\(x\)/);
});

test('cards não escondem informações ou ações, e o layout mobile tem uma coluna',()=>{
 for(const n of [2,3,4,5,6,7,8]){
  assert.match(css,new RegExp('tbody td:nth-child\\('+n+'\\)'));
 }
 assert.match(css,/#tab-products \.catalog-products-table tbody td:nth-child\(8\) button\{/);
 assert.match(css,/white-space:nowrap;font-size:11px/);
 assert.match(css,/@media\(max-width:600px\)\{/);
 assert.match(css,/#tab-products \.catalog-products-table tbody\{grid-template-columns:1fr\}/);
 assert.match(css,/#tab-products \.catalog-controls\{grid-template-columns:1fr\}/);
 assert.match(css,/@media\(hover:none\),\(prefers-reduced-motion:reduce\)/);
});

test('mudança restrita ao catálogo Shopee, não perde APIs, estado ou áreas administrativas',()=>{
 for(const id of ['productsSearch','productsStatusFilter','productsSort','loadProductsBtn',
  'stopProductsBtn','exportProductsBtn','productsMoreBtn','productDetailsTitle',
  'productModelsBody','tab-finance','shopeeFinanceLoad','tab-orders','tab-ads',
  'tab-wedrop','wedropStoredCatalog','monitorBadge']){
   assert.equal((html.match(new RegExp('id="'+id+'"','g'))||[]).length,1,id);
 }
 assert.match(html,/style\.css\?v=1\.11\.0/);
 assert.match(html,/app\.js\?v=1\.11\.0/);
});
