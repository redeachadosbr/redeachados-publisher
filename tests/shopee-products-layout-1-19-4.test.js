import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const html=readFileSync(new URL('../public/index.html',import.meta.url),'utf8');
const css=readFileSync(new URL('../public/style.css',import.meta.url),'utf8');
const js=readFileSync(new URL('../public/app.js',import.meta.url),'utf8');
const fragment=html.slice(html.indexOf('id="tab-products"'),html.indexOf('id="tab-orders"'));
test('layout 1.19.4 preserva campo de busca, filtros, sincronização, tabela e rotas reais',()=>{
 for(const id of ['productsSearch','productsStatusFilter','productsSort','loadProductsBtn',
   'stopProductsBtn','exportProductsBtn','productsBody','catalogTotal','catalogActive',
   'catalogUnlisted','catalogNoSku','catalogStockZero','productsSummary',
   'catalogPageSize','catalogPrevPage','catalogNextPage','catalogPages',
   'catalogAdvancedFilters','catalogHistoryToggle','catalogSyncHistory','catalogSyncLastSaved',
   'productDetailsPanel','productModelsBody']){
   assert.equal((fragment.match(new RegExp('id="'+id+'"','g'))||[]).length,1,id);
 }
 assert.match(fragment,/class="catalog-products-table"/);
 assert.match(fragment,/Situação/);
 assert.match(fragment,/Promoção/);
 assert.equal((fragment.match(/data-catalog-filter="/g)||[]).length,6);
 assert.match(js,/classList\?\.toggle\?\.\('view-products',name==='products'\)/);
 assert.match(js,/await json\('\/api\/shopee\/catalog\/page\?'/);
 assert.match(js,/await json\('\/api\/shopee\/catalog\/cache'/);
 assert.match(js,/await json\('\/api\/shopee\/catalog\/models\?item_id='/);
});
test('paginação acessível inicia em dez por página e mantém filtros em toda a listagem',()=>{
 assert.match(fragment,/<option value="10" selected>10<\/option>/);
 for(const name of ['all','active','inactive','noSku','stockZero','promotion']){
   assert.match(fragment,new RegExp('data-catalog-filter="'+name+'"'));
 }
 assert.match(js,/catalogPageSize=10/);
 assert.match(js,/catalogCurrentPage=1/);
 assert.match(js,/catalogFiltered\(\)/);
 assert.match(js,/catalogPageButtons\(totalPages\)/);
 assert.match(js,/catalogCurrentPage>=totalPages/);
 assert.match(js,/if\(!catalogScannedIds\.has\(id\)\)catalogMap\.delete\(id\)/);
 assert.match(js,/catalogCachedAt=data\.lastSavedAt\|\|null/);
});
test('estoque, promoções e SKUs não assumem valores quando detalhes não chegaram',()=>{
 assert.match(js,/x\.baseLoaded&&x\.stock===0/);
 assert.match(js,/x\.baseLoaded&&!String\(x\.sku\|\|'\'\)\.trim\(\)/);
 assert.match(js,/x\.baseLoaded&&x\.promotion===true/);
 assert.match(js,/x\.stock===null\|\|x\.stock===undefined\?'Não informado'/);
 assert.match(js,/!x\.baseLoaded\?'Não confirmado':x\.promotion\?'Sim':'Não'/);
 assert.match(js,/catalogDone\?'Sincronizar novamente':'Continuar sincronização'/);
 assert.match(fragment,/id="catalogHistorySummary"/);
 assert.match(fragment,/id="catalogHistoryIssues"/);
});
test('tabela moderna em desktop e cards no celular, sem alterar layouts de outras áreas',()=>{
 assert.match(css,/#tab-products \.catalog-products-table\{display:table/);
 assert.match(css,/#tab-products \.catalog-products-table thead\{display:table-header-group/);
 assert.match(css,/#tab-products \.catalog-products-table tbody\{display:table-row-group/);
 assert.match(css,/@media\(max-width:850px\)/);
 assert.match(css,/#tab-products \.catalog-products-table tbody tr\{display:grid/);
 assert.match(css,/#tab-products \.catalog-quick-filters/);
 assert.match(css,/#tab-products \.catalog-metrics/);
 assert.match(js,/b\.onclick=\(\)=>catalogShowModels\(x\)/);
 assert.match(js,/catalogOpenSeller\(x\)/);
 assert.match(js,/setTab\('optimizer'\)/);
});
