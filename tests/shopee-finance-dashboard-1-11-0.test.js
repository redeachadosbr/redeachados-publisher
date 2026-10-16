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
 assert.match(html,/style\.css\?v=1\.13\.0/);
 assert.match(html,/app\.js\?v=1\.13\.0/);
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
