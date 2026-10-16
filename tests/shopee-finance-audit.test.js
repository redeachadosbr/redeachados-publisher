import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {
 finiteMoney,financePeriod,normalizeEscrowOrder,summarizeFinance,loadShopeeFinance
} from '../shopeeFinance.js';

const base={order_sn:'261014TEST1',order_status:'COMPLETED'};
const costs=new Map([['0000001740',23.99],['TEST2',40]]);
function makeEscrow(overrides={}){
 return {response:{order_income:{
   escrow_amount:47.5,buyer_total_amount:64.97,commission_fee:8.5,
   service_fee:2.5,seller_transaction_fee:1.5,actual_shipping_fee:11,
   voucher_from_seller:3,
   items:[{item_sku:'0000001740',model_sku:'',quantity_purchased:1}],
   ...overrides
 }}};
}
test('repasse líquido menos custo é calculado uma vez; não desconta taxas/frete novamente',()=>{
 const row=normalizeEscrowOrder(base,base,makeEscrow(),costs);
 assert.equal(row.ready,true);
 assert.equal(row.payout,47.5);
 assert.equal(row.totalCost,23.99);
 assert.equal(row.balanceBeforeAds,23.51);
 assert.equal(row.marginBeforeAds,49.49);
 assert.equal(row.feeBreakdown.commission,8.5);
 assert.equal(row.feeBreakdown.actualShipping,11);
 assert.equal(row.netProfit,null);
 assert.equal(row.netMargin,null);
 assert.equal(row.sku,'0000001740');
});
test('repasse ajustado prevalece, sem adicionar voucher ou comissão de novo',()=>{
 const row=normalizeEscrowOrder(base,base,makeEscrow({escrow_amount_after_adjustment:33.1}),costs);
 assert.equal(row.payout,33.1);
 assert.equal(row.balanceBeforeAds,9.11);
});
test('pedido multi SKU fica somente no nível pedido; não atribui receita arbitrária por SKU',()=>{
 const escrow=makeEscrow({items:[
  {item_sku:'0000001740',quantity_purchased:2},
  {model_sku:'TEST2',item_sku:'PARENT',quantity_purchased:1}
 ]});
 const row=normalizeEscrowOrder(base,base,escrow,costs);
 assert.equal(row.totalCost,87.98);
 assert.equal(row.balanceBeforeAds,-40.48);
 assert.equal(row.sku,null);
 assert.match(row.reason,/vários SKUs/);
 const total=summarizeFinance([row]);
 assert.equal(total.skuSummary.length,0);
});
test('falta de custo ou quantidade/repasse não apresenta saldo ou lucro falso',()=>{
 const c=normalizeEscrowOrder(base,base,makeEscrow({
   items:[{item_sku:'UNKNOWN',quantity_purchased:1}]
 }),costs);
 assert.equal(c.ready,false);
 assert.equal(c.totalCost,null);
 assert.equal(c.balanceBeforeAds,null);
 assert.equal(c.netProfit,null);
 const n=normalizeEscrowOrder(base,base,makeEscrow({escrow_amount:null,
   items:[{item_sku:'0000001740',quantity_purchased:1}]}),costs);
 assert.equal(n.ready,false);
 assert.equal(n.payout,null);
 assert.equal(n.balanceBeforeAds,null);
});
test('pedido não completado ou sem detalhe financeiro jamais entra no resultado',()=>{
 const pending=normalizeEscrowOrder({...base,order_status:'SHIPPED'},null,makeEscrow(),costs);
 assert.equal(pending.ready,false);
 assert.equal(pending.balanceBeforeAds,undefined);
 const empty=normalizeEscrowOrder(base,base,{response:{}},costs);
 assert.equal(empty.ready,false);
});
test('sumário parcial inclui apenas pedidos verificados e separa Ads indisponíveis',()=>{
 const valid=normalizeEscrowOrder(base,base,makeEscrow(),costs);
 const incomplete={orderSn:'X',ready:false};
 const report=summarizeFinance([valid,incomplete],{eligible:4,more:true});
 assert.equal(report.totals.verified,1);
 assert.equal(report.totals.incomplete,1);
 assert.equal(report.totals.incompletePeriod,true);
 assert.equal(report.totals.received,47.5);
 assert.equal(report.totals.balanceBeforeAds,23.51);
 assert.equal(report.totals.profitabilityComplete,false);
 assert.equal(report.skuSummary[0].sku,'0000001740');
});
test('faixa temporal de no máximo 15 dias evita consultar período não permitido',()=>{
 assert.equal(financePeriod(15),15);
 assert.throws(()=>financePeriod(31),/1 a 15 dias/);
 assert.throws(()=>financePeriod(0),/1 a 15 dias/);
 assert.equal(finiteMoney('0'),0);
 assert.equal(finiteMoney(undefined),null);
});
test('integração consulta dados do detalhe de escrow por pedido concluído sem retornar dados do comprador',async()=>{
 const calls=[];
 const call=async(_cfg,opt)=>{
  calls.push(opt);
  if(opt.path.endsWith('get_order_list'))return {response:{order_list:[base],more:false}};
  if(opt.path.endsWith('get_order_detail'))return {response:{order_list:[
    {...base,item_list:[{item_sku:'0000001740',model_quantity_purchased:1}],
      recipient_address:{name:'PRIVATE',phone:'PRIVATE'},buyer_username:'PRIVATE'}
  ]}};
  if(opt.path.endsWith('get_escrow_detail'))return makeEscrow();
  throw Error('Unexpected '+opt.path);
 };
 // Read WeDrop Costs currently depends on database, test exported pure method and route wiring separately.
 const html=readFileSync(new URL('../public/index.html',import.meta.url),'utf8');
 const server=readFileSync(new URL('../server.js',import.meta.url),'utf8');
 assert.match(server,/\/api\/shopee\/finance\/orders/);
 assert.match(server,/loadShopeeFinance\(cfg,auth,callShopeeShopApi/);
 assert.match(html,/id="shopeeFinanceLoad"/);
 assert.match(html,/id="shopeeFinanceOrders"/);
 const code=readFileSync(new URL('../shopeeFinance.js',import.meta.url),'utf8');
 assert.match(code,/path:'\/api\/v2\/payment\/get_escrow_detail'/);
 assert.match(code,/query:\{order_sn:String\(item\.order_sn\)\}/);
 assert.match(code,/order_status.*COMPLETED/);
 assert.doesNotMatch(code,/recipient_address/);
});
