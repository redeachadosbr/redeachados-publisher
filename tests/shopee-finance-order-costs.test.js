import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {normalizeFinanceOrderCostInput} from '../shopeeFinanceOrderCosts.js';
import {applyActualFinanceCost,orderMerchandiseSubtotal} from '../shopeeFinance.js';
import {buildPaidOrderProfitLedger} from '../shopeeFinancePaid.js';

test('detalhes Shopee solicitam explicitamente itens, valor e momento do pagamento',()=>{
 const src=readFileSync(new URL('../shopeeFinance.js',import.meta.url),'utf8');
 assert.match(src,/response_optional_fields:'item_list,total_amount,pay_time'/);
 assert.equal(orderMerchandiseSubtotal({item_list:[
  {model_discounted_price:29.99,model_quantity_purchased:2},
  {model_discounted_price:17.3,model_quantity_purchased:1}
 ]}),77.28);
 assert.equal(orderMerchandiseSubtotal({total_amount:100}),null,
  'total_amount inclui frete; não pode ser vendido como subtotal de mercadorias');
});
test('custo efetivo por pedido substitui somente estimativa por SKU e traz créditos e despesas',()=>{
 const row={orderSn:'261106ABC01234',status:'COMPLETED',payout:70,
  ready:true,totalCost:20,balanceBeforeAds:50,costSource:'wedrop_catalog_estimate'};
 const updated=applyActualFinanceCost(row,{
  supplier_cost:35,supplier_credit:10,external_expense:3.50,
  source_reference:'WD-98765',updated_at:'2026-11-07T01:00:00Z'});
 assert.equal(updated.catalogCost,20);
 assert.equal(updated.totalCost,35);
 assert.equal(updated.supplierCredit,10);
 assert.equal(updated.externalExpense,3.5);
 assert.equal(updated.balanceBeforeAds,41.5);
 assert.equal(updated.costSource,'wedrop_order_recorded');
 assert.equal(updated.marginBeforeAds,59.29);
 assert.equal(row.totalCost,20);
});
test('devolução ainda sem ajuste impede considerar lucro concluído',()=>{
 const updated=applyActualFinanceCost({payout:70,refundPending:true,totalCost:20,ready:false}, {
  supplier_cost:30,supplier_credit:0,external_expense:0,
  source_reference:'WEDROP-TEST'});
 assert.equal(updated.ready,false);
 assert.equal(updated.balanceBeforeAds,null);
});
test('razão paga não desconta taxas duas vezes e aplica Ads somente uma vez',()=>{
 const finance={
  paidOrders:[{orderSn:'261106ABC01234',status:'COMPLETED',paidAt:1794000000,
    grossProductSales:100,payout:70,totalCost:35,
    supplierCredit:10,externalExpense:3.5,
    costSource:'wedrop_order_recorded',payoutConfirmed:true,
    refundStatus:'sem devolução'}],
  paidOrderCoverage:{complete:true},returnsCoverage:{complete:true}
 };
 const ads={status:'verified_campaign_period',spendTotal:8};
 const report=buildPaidOrderProfitLedger(finance,ads);
 assert.equal(report.rows[0].afterAds,33.5);
 assert.equal(report.rows[0].margin,33.5);
 assert.equal(report.finalizedResultKnown,33.5);
 assert.equal(report.operatingProfit,33.5);
 assert.equal(report.costEstimatedOrders,0);
 const catalog=buildPaidOrderProfitLedger({
   ...finance,paidOrders:finance.paidOrders.map(x=>({...x,costSource:'wedrop_catalog_estimate'}))
 },ads);
 assert.equal(catalog.rows[0].afterAds,33.5);
 assert.equal(catalog.costEstimatedOrders,1);
 assert.equal(catalog.complete,false);
 assert.equal(catalog.operatingProfit,null);
});
test('custo declarado exige referência, centavos válidos e campos não negativos',()=>{
 const valid=normalizeFinanceOrderCostInput({orderSn:'261106ABC01234',
  supplierCost:'20.90',supplierCredit:'0',externalExpense:'5.10',
  sourceReference:'Compra WeDrop 1234'});
 assert.equal(valid.supplierCost,20.9);
 assert.equal(valid.externalExpense,5.1);
 assert.throws(()=>normalizeFinanceOrderCostInput({...valid,supplierCost:'-10'}),/inválido/);
 assert.throws(()=>normalizeFinanceOrderCostInput({...valid,supplierCost:'10.777'}),/inválido/);
 assert.throws(()=>normalizeFinanceOrderCostInput({...valid,sourceReference:''}),/referência/);
});
test('tela e backend permitem registrar custo por loja com autenticação e revisão',()=>{
 const server=readFileSync(new URL('../server.js',import.meta.url),'utf8');
 const ui=readFileSync(new URL('../public/app.js',import.meta.url),'utf8');
 const html=readFileSync(new URL('../public/index.html',import.meta.url),'utf8');
 assert.match(server,/app.post\('\/api\/shopee\/finance\/order-cost',mustLogin,requireWeDropAdmin/);
 assert.match(server,/verifiedSameOrigin\(req\)/);
 assert.match(server,/get_order_detail/);
 assert.match(ui,/financeEditOrderCost/);
 assert.match(ui,/Salvar e recalcular/);
 assert.match(html,/id="financeFinalizedNet"/);
 assert.match(html,/id="financeFinalizedMargin"/);
});
