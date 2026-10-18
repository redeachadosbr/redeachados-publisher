import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {normalizeEscrowOrder,summarizeFinance} from '../shopeeFinance.js';

const read=p=>readFileSync(new URL(p,import.meta.url),'utf8');
const html=read('../public/index.html');
const js=read('../public/app.js');
const css=read('../public/style.css');
const backend=read('../shopeeFinance.js');
const wedrop=read('../wedropCosts.js');

function escrow(items,payout=50){
 return {response:{order_income:{
  escrow_amount:payout,commission_fee:9,service_fee:3,
  actual_shipping_fee:8,items
 }}};
}
const completed={order_sn:'261016TEST',order_status:'COMPLETED'};
test('lucro líquido só existe quando custos externos e Ads estão conciliados',()=>{
 const row=normalizeEscrowOrder(completed,completed,
  escrow([{item_id:111,model_id:0,item_sku:'A',quantity_purchased:2}]),new Map([['A',12]]));
 assert.equal(row.payout,50);
 assert.equal(row.totalCost,24);
 assert.equal(row.balanceBeforeAds,26);
 assert.equal(row.netProfit,null);
 assert.equal(row.netMargin,null);
 assert.equal(row.quantity,2);
 assert.equal(row.feeBreakdown.commission,9);
 // Comissão, serviço e frete já incluídos no repasse; NÃO descontar novamente.
 assert.notEqual(row.balanceBeforeAds,6);
 const aggregate=summarizeFinance([row]);
 assert.equal(aggregate.skuSummary[0].quantity,2);
 assert.equal(aggregate.skuSummary[0].balanceBeforeAds,26);
 assert.equal(aggregate.totals.units,2);
 assert.equal(aggregate.totals.profitabilityComplete,false);
});
test('SKU WeDrop vinculado manualmente é usado somente com item, modelo e código imutável',()=>{
 const item={item_id:12345,model_id:22,model_sku:'123-XX',quantity_purchased:1};
 const costs=new Map([['WEDROP-123',16]]);
 const links=new Map([['12345:22',{shopee_sku:'123-XX',supplier_sku:'WEDROP-123'}]]);
 const valid=normalizeEscrowOrder(completed,completed,escrow([item]),costs,links);
 assert.equal(valid.ready,true);
 assert.equal(valid.totalCost,16);
 assert.equal(valid.balanceBeforeAds,34);
 const wrong=normalizeEscrowOrder(completed,completed,
  escrow([{...item,model_sku:'123-XY'}]),costs,links);
 assert.equal(wrong.ready,false);
 assert.equal(wrong.totalCost,null);
 assert.deepEqual(wrong.skuList,['123-XY']);
 assert.equal(wrong.netProfit,null);
});
test('receita de pedido multi-SKU não é atribuída incorretamente a um só SKU',()=>{
 const result=normalizeEscrowOrder(completed,completed,escrow([
  {item_sku:'A',quantity_purchased:1},
  {item_sku:'B',quantity_purchased:1}
 ]),new Map([['A',10],['B',11]]));
 assert.equal(result.ready,true);
 assert.equal(result.sku,null);
 assert.equal(summarizeFinance([result]).skuSummary.length,0);
 assert.equal(summarizeFinance([result]).totals.multiSkuOrders,1);
});
test('Financeiro mantém filtros e miniaturas de catálogo com indicadores sem números inventados',()=>{
 for(const id of ['shopeeFinanceLoad','shopeeFinanceDays','shopeeFinanceStatus',
  'shopeeFinanceVerified','shopeeFinancePayout','shopeeFinanceCosts',
  'shopeeFinanceBalance','financeSkuAdsKpi','financeSkuNetKpi','financeSkuBody',
  'financeSkuMore','financeSkuSearch','financeSkuPageInfo','financeOrdersDetails',
  'shopeeFinanceOrders','wedropFinancialResults','wedropCoverageBody']){
  assert.equal((html.match(new RegExp('id="'+id+'"','g'))||[]).length,1,id);
 }
 assert.match(html,/class="finance-sku-table"/);
 assert.match(html,/data-finance-filter="sold"/);
 assert.match(html,/data-finance-filter="pending"/);
 assert.match(html,/não é lucro fiscal final/i);
 assert.match(html,/saldo antes Ads/i);
 assert.match(js,/financeCatalogImage/);
 assert.match(js,/financeSkuEntries/);
 assert.match(js,/renderFinanceSkuList/);
 assert.match(js,/financeReport=report/);
 assert.match(js,/x\.imageUrl/);
 assert.match(js,/Nenhuma venda concluída verificada/);
 assert.match(css,/\.finance-thumbnail/);
 assert.match(css,/@media\(max-width:650px\)/);
 assert.match(html,/style\.css\?v=\d+\.\d+\.\d+/);
 assert.match(html,/app\.js\?v=\d+\.\d+\.\d+/);
});
test('não transforma custo de catálogo em custo vendido, nem inventa Ads',()=>{
 assert.match(backend,/get_escrow_detail/);
 assert.match(backend,/readFinanceCatalogProfiles/);
 assert.match(backend,/skuList:presentSkuList/);
 assert.match(backend,/netProfit:null,netMargin:null/);
 assert.match(backend,/const supplierSku=linked&&linked.shopee_sku===sku/);
 assert.match(wedrop,/image_url/);
 assert.match(wedrop,/export async function readFinanceCatalogProfiles/);
 assert.match(js,/const result=valid\?/);
});

test('painel financeiro mantém o layout funcional com gráficos sem números demonstrativos',()=>{
 for(const id of ['financeTrendSvg','financePeriodCaption','financeTrendNote','financeAdsDonut',
  'financeDonutCenter','financeDonutLegend','financeGlobalSearch','financeExportCsv','financeAdsScanAccordion']){
  assert.equal((html.match(new RegExp('id="'+id+'"','g'))||[]).length,1,id);
 }
 assert.match(html,/Distribuição dos Ads no período/);
 assert.match(html,/finance-products-card/);
 assert.match(html,/finance-insight-status/);
 assert.match(backend,/export function summarizeFinanceDaily/);
 assert.match(backend,/dailySeries:summarizeFinanceDaily\(rows\)/);
});

test('gráficos usam dados confirmados e exportação respeita filtro real e CSV seguro',()=>{
 for(const signature of ['function renderFinanceTrend(report)','function renderFinanceDistribution(report)',
   'function financeExportRows(report)','function financeCsvSafe(value)']){
   assert.ok(js.includes(signature),signature);
 }
 assert.match(js,/report\?\.dailySeries/);
 assert.match(js,/report\.adsSweep\|\|\{\}/);
 assert.match(js,/sw\.status==='verified_campaign_period'/);
 assert.match(js,/financeCsvSafe\)\.join\(';'/);
 assert.match(js,/financeReport=report;financeSkuShown=24/);
 assert.match(js,/renderFinanceTrend\(report\);renderFinanceDistribution\(report\)/);
 assert.match(js,/financeExportCsv'\)\.disabled=false/);
 assert.match(js,/financeGlobalSearch'\)\.oninput=/);
});

test('o menu financeiro é direto sob Gestão e o relatório CSV protege fórmulas sem invalidar saldos negativos',()=>{
 assert.match(html,/<span class="nav-name">Financeiro Shopee<\/span>/);
 assert.equal((html.match(/data-tab="finance"/g)||[]).length,1);
 assert.match(js,/classList\?\.toggle\?\.\('view-finance',name==='finance'\)/);
 assert.match(js,/typeof value==='number'&&Number\.isFinite\(value\)/);
 assert.match(js,/toLocaleString\('pt-BR',\{useGrouping:false,maximumFractionDigits:2\}\)/);
});
