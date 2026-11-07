import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {isFinancePaid,allocateAdsBySale,buildPaidOrderProfitLedger} from '../shopeeFinancePaid.js';
import {normalizeEscrowOrder} from '../shopeeFinance.js';

test('só pedidos pagos entram; cancelados e não pagos não entram',()=>{
 assert.equal(isFinancePaid('READY_TO_SHIP',null),true);
 assert.equal(isFinancePaid('SHIPPED',null),true);
 assert.equal(isFinancePaid('COMPLETED',null),true);
 assert.equal(isFinancePaid('UNPAID',null),false);
 assert.equal(isFinancePaid('CANCELLED',1760000000),false);
 assert.equal(isFinancePaid('PENDING',null),false);
 assert.equal(isFinancePaid('PENDING',1760000000),true);
});
test('Ads do período é rateado em centavos sem somar duas vezes',()=>{
 const allocated=allocateAdsBySale([
  {orderSn:'B',grossProductSales:100},{orderSn:'A',grossProductSales:50}
 ],15);
 assert.deepEqual(allocated,[10,5]);
 const cents=allocateAdsBySale([
  {orderSn:'1',grossProductSales:10},{orderSn:'2',grossProductSales:10},
  {orderSn:'3',grossProductSales:10}
 ],0.01);
 assert.equal(cents.reduce((a,b)=>a+b,0),0.01);
 assert.equal(allocateAdsBySale([{orderSn:'A',grossProductSales:null}],15),null);
});
const financial={
 paidOrders:[
  {orderSn:'A',status:'COMPLETED',paidAt:1760000000,
   skuList:['SKU1'],grossProductSales:100,payout:75,totalCost:50,
   payoutConfirmed:true,refundStatus:'sem devolução',items:[]},
  {orderSn:'B',status:'SHIPPED',paidAt:1760000001,
   skuList:['SKU2'],grossProductSales:50,payout:35,totalCost:20,
   payoutConfirmed:false,refundStatus:'sem devolução',items:[]}
 ],
 paidOrderCoverage:{complete:true},
 returnsCoverage:{complete:true}
};
const ads={status:'verified_campaign_period',spendTotal:15};
test('lucro operacional e margem das vendas pagas: 2 pedidos, um previsto',()=>{
 const result=buildPaidOrderProfitLedger(financial,ads);
 assert.equal(result.paidOrders,2);
 assert.equal(result.paidGross,150);
 assert.equal(result.escrowKnown,110);
 assert.equal(result.costKnown,70);
 assert.equal(result.adsAllocated,15);
 assert.equal(result.operatingProfit,25);
 assert.equal(result.operatingMargin,16.67);
 assert.deepEqual(result.rows.map(r=>r.adsAllocated),[10,5]);
 assert.deepEqual(result.rows.map(r=>r.afterAds),[15,10]);
 assert.equal(result.rows[0].provisional,false);
 assert.equal(result.rows[1].provisional,true);
 assert.equal(result.complete,true);
 assert.match(result.rows[0].adsMethod,/rateio gerencial/);
});
test('prejuízo ou margem abaixo de 5% alerta e sugere preço de equilíbrio simulado',()=>{
 const result=buildPaidOrderProfitLedger({
  ...financial,paidOrders:[{...financial.paidOrders[0],
   grossProductSales:30,payout:20,totalCost:24}]
 },{status:'verified_campaign_period',spendTotal:3});
 assert.equal(result.rows[0].afterAds,-7);
 assert.equal(result.rows[0].risk,'loss');
 assert.ok(result.rows[0].breakEvenPrice>30);
 assert.equal(result.operatingMargin,-23.33);
});
test('estorno já ajustado no Payment não é descontado em duplicidade',()=>{
 const normalized=normalizeEscrowOrder(
  {order_sn:'RETURN',order_status:'COMPLETED'},
  {order_status:'COMPLETED'},
  {response:{return_order_sn_list:['RT-1'],order_income:{
    escrow_amount:80,escrow_amount_after_adjustment:40,items:[{
      item_sku:'SKU-RET',quantity_purchased:1}]
  }}},new Map([['SKU-RET',30]]));
 assert.equal(normalized.ready,true);
 assert.equal(normalized.payout,40);
 assert.equal(normalized.totalCost,30);
 assert.equal(normalized.balanceBeforeAds,10);
 assert.equal(normalized.refundEscrowDelta,40);
 assert.equal(normalized.adjustedEscrow,true);
});
test('devolução sem ajuste confirmado bloqueia fechamento como lucro',()=>{
 const row=normalizeEscrowOrder(
  {order_sn:'RETURN',order_status:'COMPLETED'},
  {order_status:'COMPLETED'},
  {response:{return_order_sn_list:['RT-1'],order_income:{
    escrow_amount:80,items:[{item_sku:'SKU-RET',quantity_purchased:1}]
  }}},new Map([['SKU-RET',30]]));
 assert.equal(row.ready,false);
 assert.equal(row.refundPending,true);
 assert.equal(row.balanceBeforeAds,null);
 const ledger=buildPaidOrderProfitLedger({...financial,paidOrders:[
  {...financial.paidOrders[0],refundPending:true,refundStatus:'PROCESSING'}
 ]},ads);
 assert.equal(ledger.complete,false);
 assert.equal(ledger.operatingProfit,null);
 assert.equal(ledger.rows[0].provisional,true);
});
test('não inventar lucro total se algum repasse, custo, Ads ou devolução é desconhecido',()=>{
 const unknown=buildPaidOrderProfitLedger({
  ...financial,paidOrders:[
   financial.paidOrders[0],{...financial.paidOrders[1],payout:null}]
 },ads);
 assert.equal(unknown.operatingProfit,null);
 assert.equal(unknown.operationalCoverage,1);
 assert.equal(unknown.escrowCoverage,1);
 assert.equal(unknown.paidGrossKnown,150);
 assert.equal(unknown.rows[1].afterAds,null);
 assert.ok(unknown.warnings.length>0);
 const noAds=buildPaidOrderProfitLedger(financial,{status:'unavailable'});
 assert.equal(noAds.operatingProfit,null);
 assert.equal(noAds.rows[0].risk,'unverified');
});
test('API financeira publica razão dos pagos, consulta devoluções e não transmite PII',()=>{
 const server=readFileSync(new URL('../server.js',import.meta.url),'utf8');
 const backend=readFileSync(new URL('../shopeeFinance.js',import.meta.url),'utf8');
 const html=readFileSync(new URL('../public/index.html',import.meta.url),'utf8');
 const ui=readFileSync(new URL('../public/app.js',import.meta.url),'utf8');
 assert.match(server,/buildPaidOrderProfitLedger\(finance,adsSweep\)/);
 assert.match(backend,/\/api\/v2\/returns\/get_return_list/);
 assert.match(backend,/returnRefs/);
 assert.match(backend,/paidOrders/);
 assert.doesNotMatch(backend,/recipient_address/);
 for(const id of ['financePaidGross','financePaidNet','financePaidMargin',
  'financePaidOrdersBody','financePaidWarning'])
  assert.match(html,new RegExp('id="'+id+'"'));
 assert.match(ui,/function financePaidLedgerRender\(report\)/);
});
