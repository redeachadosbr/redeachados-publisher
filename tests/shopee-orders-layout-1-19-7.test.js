import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';
import {mergeShopeeOrderSummaries} from '../orderView.js';
const html=readFileSync(new URL('../public/index.html',import.meta.url),'utf8');
const js=readFileSync(new URL('../public/app.js',import.meta.url),'utf8');
const css=readFileSync(new URL('../public/style.css',import.meta.url),'utf8');
const server=readFileSync(new URL('../server.js',import.meta.url),'utf8');
const page=html.slice(html.indexOf('id="tab-orders"'),html.indexOf('id="tab-alerts"'));
test('Pedidos e vendas 1.19.7 mantém seis KPIs e componentes funcionais',()=>{
 for(const id of ['ordersPeriod','ordersExportBtn','loadOrdersBtn','ordersLoadLabel',
   'ordersKpiCount','ordersKpiShipped','ordersKpiCompleted','ordersKpiRecords','ordersKpiItems','ordersKpiUpdated',
   'ordersStatusDonut','ordersDonutTotal','ordersStatusLegend','ordersPeriodSummary',
   'ordersSearch','ordersStatusFilter','ordersSort','ordersQuickFilters','ordersFoundBadge',
   'ordersPrevPage','ordersNextPage','ordersCurrentPage','ordersBody','ordersSummary',
   'ordersDetailPanel','ordersDetailTitle','ordersDetailBody','ordersDetailClose']){
  assert.equal((page.match(new RegExp('id="'+id+'"','g'))||[]).length,1,id);
 }
 assert.equal((page.match(/class="orders-v2-kpi orders-v2-kpi-/g)||[]).length,6);
 assert.match(page,/<option value="15" selected>Últimos 15 dias<\/option>/);
 assert.match(page,/id="ordersExportBtn" type="button" class="secondary" disabled/);
 assert.match(page,/colspan="7"/);
 assert.match(html,/style\.css\?v=\d+\.\d+\.\d+/);
 assert.match(html,/app\.js\?v=\d+\.\d+\.\d+/);
 assert.match(server,/version:'\d+\.\d+\.\d+'/);
});
test('O servidor solicita apenas os dados operacionais e protege PII',()=>{
 assert.match(server,/response_optional_fields:'item_list,total_amount'/);
 assert.match(server,/mergeShopeeOrderSummaries\(orderList,detailOrders\)/);
 assert.doesNotMatch(server,/response_optional_fields:'buyer_username/);
 const r=mergeShopeeOrderSummaries([{order_sn:'OR123',order_status:'SHIPPED',create_time:1720000000}],[
  {order_sn:'OR123',total_amount:149.7,recipient_address:{name:'SEGREDO'},buyer_username:'SEGREDO',
   item_list:[{item_name:'Caneca',item_sku:'SKU009',model_quantity_purchased:3,model_discounted_price:49.9}]}])[0];
 assert.equal(r.items_count,3);
 assert.equal(r.total_amount,149.7);
 assert.equal(r.primary_sku,'SKU009');
 assert.ok(!JSON.stringify(r).includes('SEGREDO'));
});
test('Cliente percorre todas as páginas do período em blocos sem inventar números',()=>{
 assert.match(js,/const blockSeconds=14\*86400/);
 assert.match(js,/for\(let to=now;to>oldest;\)/);
 assert.match(js,/new URLSearchParams\(\{time_from:String\(from\),time_to:String\(to\)/);
 assert.match(js,/if\(cursor\)qs\.set\('cursor',cursor\)/);
 assert.match(js,/response\.response\?\.next_cursor/);
 assert.match(js,/if\(!next\|\|next===cursor\)/);
 assert.match(js,/seen\.set\(String\(x\.order_sn\),x\)/);
 assert.match(js,/ordersLoadedComplete=complete/);
 assert.match(js,/const missing=ordersLoaded\.filter\(o=>o\.items_count==null\)\.length/);
 assert.match(js,/ordersKpi\('ordersKpiItems',missing\?'—':ordersNum\(known\)/);
 assert.match(js,/ordersCurrency\(order\.total_amount\)/);
 assert.match(js,/ordersCreateCell\(tr,order\.primary_sku\|\|'—'\)/);
 assert.match(js,/ordersCsvProtect/);
});
test('Consulta, filtro, gráfico e ações mantêm apresentação responsiva',()=>{
 assert.match(js,/classList\?\.toggle\?\.\('view-orders',name==='orders'\)/);
 assert.match(js,/name==='orders'\)ordersEnsureLoaded\(\)/);
 assert.match(js,/ordersStatusDonut/);
 assert.match(js,/background='conic-gradient\('/);
 assert.match(js,/ordersShowDetail\(order\)/);
 assert.match(js,/ordersExportBtn'\)\.onclick/);
 assert.match(css,/body\.view-orders \.workspace-content/);
 assert.match(css,/#tab-orders \.orders-v2-kpis\{display:grid;grid-template-columns:repeat\(6,minmax\(0,1fr\)\)/);
 assert.match(css,/#tab-orders \.orders-v2-charts\{display:grid/);
 assert.match(css,/@media\(max-width:700px\)/);
});
