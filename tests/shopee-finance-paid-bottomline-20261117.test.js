import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {buildPaidOrderProfitLedger} from '../shopeeFinancePaid.js';
import {MAX_FINANCE_ORDERS} from '../shopeeFinance.js';

const paid=(orderSn,status,payout,totalCost,grossProductSales)=>({
 orderSn,status,payout,totalCost,grossProductSales,
 paidAt:1794000000,payoutConfirmed:status==='COMPLETED',
 costSource:'wedrop_catalog_estimate',refundStatus:'sem devolução'
});
const coverage={paidOrderCoverage:{complete:true},returnsCoverage:{complete:true}};

test('calcula R$ 12,34 no consolidado com vendas brutas faltantes, sem inventar rateio',()=>{
 const finance={...coverage,paidOrders:[
  paid('FINALIZADO','COMPLETED',1200,900,1900),
  paid('A_ENVIAR','SHIPPED',1221.48,1085.4,null)
 ]};
 const report=buildPaidOrderProfitLedger(finance,{status:'verified_campaign_period',spendTotal:423.74});
 assert.equal(report.adsAllocated,null,'sem valor bruto não há rateio por pedido');
 assert.equal(report.operationalCoverage,0,'nenhum pedido tem resultado individual após Ads');
 assert.equal(report.periodRevenue,2421.48);
 assert.equal(report.periodSupplierCost,1985.4);
 assert.equal(report.periodOperatingResult,12.34,'repasse - WeDrop - todos os Ads');
 assert.equal(report.projectedOperatingProfit,12.34);
 assert.equal(report.periodCoverageComplete,true);
 assert.equal(report.complete,false,'custos do catálogo e pedidos a finalizar');
 assert.equal(report.finalizedOrdersAnalyzed,1);
 assert.equal(report.finalizedResultKnown,-123.74,
  'finalizados descontam todos os Ads já incorridos no período, uma única vez');
 assert.equal(report.finalizedBeforeAds,300);
 assert.match(report.warnings.join(' '),/rateio individual/);
});
test('5 de 100 sem valor bruto não impedem resultado consolidado e 127 pedidos não são truncados',()=>{
 const orders=Array.from({length:127},(_,i)=>paid(
  'PEDIDO_'+i,i<45?'COMPLETED':'SHIPPED',10,6,i<122?20:null
 ));
 const report=buildPaidOrderProfitLedger({...coverage,paidOrders:orders},
  {status:'verified_campaign_period',spendTotal:270});
 assert.equal(MAX_FINANCE_ORDERS,null);
 assert.equal(report.paidOrders,127);
 assert.equal(report.paidGrossCoverage,122);
 assert.equal(report.adsAllocationComplete,false);
 assert.equal(report.periodOperatingResult,238);
 assert.equal(report.finalizedOrdersAnalyzed,45);
 assert.equal(report.finalizedResultKnown,-90);
 assert.equal(report.finalizedMarginKnown,-20);
});
test('não simula resultado com Ads, repasse ou custo ausente',()=>{
 const orders=[paid('A','COMPLETED',100,60,120)];
 const base={...coverage,paidOrders:orders};
 assert.equal(buildPaidOrderProfitLedger(base,{status:'unavailable'}).periodOperatingResult,null);
 assert.equal(buildPaidOrderProfitLedger(base,{status:'unavailable'}).finalizedResultKnown,null);
 assert.equal(buildPaidOrderProfitLedger({...base,paidOrders:[{...orders[0],payout:null}]},
  {status:'verified_campaign_period',spendTotal:3}).periodOperatingResult,null);
 assert.equal(buildPaidOrderProfitLedger({...base,paidOrders:[{...orders[0],totalCost:null}]},
  {status:'verified_campaign_period',spendTotal:3}).finalizedResultKnown,null);
 assert.equal(buildPaidOrderProfitLedger({...base,paidOrderCoverage:{complete:false}},
  {status:'verified_campaign_period',spendTotal:3}).periodOperatingResult,null);
});
test('devolução pendente não entra como repasse finalizado',()=>{
 const report=buildPaidOrderProfitLedger({...coverage,paidOrders:[
  {...paid('R','COMPLETED',100,60,120),refundPending:true,refundStatus:'PROCESSING'}
 ]},{status:'verified_campaign_period',spendTotal:8});
 assert.equal(report.finalizedResultKnown,null);
 assert.equal(report.finalizedOrdersAnalyzed,0);
 assert.equal(report.complete,false);
});
test('painel destaca resultado e fórmula acima dos demais números',()=>{
 const html=readFileSync(new URL('../public/index.html',import.meta.url),'utf8');
 const ui=readFileSync(new URL('../public/app.js',import.meta.url),'utf8');
 const backend=readFileSync(new URL('../shopeeFinance.js',import.meta.url),'utf8');
 const grid=html.indexOf('class="finance-paid-metrics"');
 assert.ok(grid>=0);
 assert.ok(html.indexOf('id="financePaidNet"',grid)<html.indexOf('id="financePaidGross"',grid));
 assert.ok(html.indexOf('id="financeFinalizedNet"',grid)<html.indexOf('id="financePaidGross"',grid));
 assert.match(html,/id="financePaidEquation"/);
 assert.match(ui,/ledger\.periodOperatingResult/);
 assert.match(ui,/ledger\.finalizedResultKnown/);
 assert.doesNotMatch(backend,/completed\.slice\(0,MAX_FINANCE_ORDERS\)/);
});
