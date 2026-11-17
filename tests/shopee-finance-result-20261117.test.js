import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {calculateFinanceOutcome,normalizeEscrowOrder,summarizeFinance} from '../shopeeFinance.js';
const confirmed=(received,supplierCost,verified=5)=>({
 complete:true,totals:{received,supplierCost,verified,eligible:verified,incompletePeriod:false}
});
const ads=spendTotal=>({status:'verified_campaign_period',spendTotal});
test('sinaliza lucro operacional estimado e subtrai todos Ads uma única vez',()=>{
 const x=calculateFinanceOutcome(confirmed(2421.48,1985.40),ads(422.88));
 assert.deepEqual({status:x.status,amount:x.amount,complete:x.complete},
  {status:'profit',amount:13.2,complete:true});
 assert.equal(x.received-x.supplierCost-x.adsSpend<14,true);
});
test('sinaliza prejuízo em vez de esconder valores negativos',()=>{
 const x=calculateFinanceOutcome(confirmed(300,400),ads(100.15));
 assert.equal(x.status,'loss');assert.equal(x.amount,-200.15);
});
test('não inventa lucro com Ads não verificados',()=>{
 const x=calculateFinanceOutcome(confirmed(2421.48,1985.40),{status:'unavailable'});
 assert.equal(x.status,'incomplete');assert.equal(x.amount,null);
 assert.match(x.reason,/Publicidade não confirmada/);
});
test('cinco pedidos sem bruto continuam válidos quando repasse e custo existem',()=>{
 const costs=new Map([['P1',10]]);
 const rows=Array.from({length:5},(_,i)=>normalizeEscrowOrder(
   {order_sn:'ORDER'+i,order_status:'COMPLETED'}, {order_status:'COMPLETED'},
   {response:{order_income:{escrow_amount:25,items:[{item_sku:'P1',quantity_purchased:1}]}}},
   costs));
 assert.equal(rows.every(x=>x.ready&&x.buyerTotal===null),true);
 const t=summarizeFinance(rows,{eligible:5}).totals;
 assert.equal(t.verified,5);assert.equal(t.received,125);
 assert.equal(calculateFinanceOutcome({complete:true,totals:t},ads(20)).amount,55);
});
test('127 pedidos contam integralmente sem o corte de 100',()=>{
 const rows=Array.from({length:127},(_,i)=>({orderSn:'S'+i,ready:true,sku:'P1',
   payout:25,totalCost:10,balanceBeforeAds:15,quantity:1}));
 const t=summarizeFinance(rows,{eligible:127}).totals;
 assert.equal(t.verified,127);assert.equal(t.balanceBeforeAds,1905);
 const source=readFileSync(new URL('../shopeeFinance.js',import.meta.url),'utf8');
 assert.doesNotMatch(source,/completed\.slice\(0,MAX_FINANCE_ORDERS\)/);
 assert.match(source,/const limited=completed;/);
});
test('painel destaca lucro ou prejuízo acima de gráficos e preserva detalhamento',()=>{
 const html=readFileSync(new URL('../public/index.html',import.meta.url),'utf8');
 const js=readFileSync(new URL('../public/app.js',import.meta.url),'utf8');
 const server=readFileSync(new URL('../server.js',import.meta.url),'utf8');
 assert.ok(html.indexOf('id="financeBottomline"')<html.indexOf('class="finance-kpis"'));
 assert.match(html,/id="financeBottomlineValue"/);
 assert.match(html,/class="finance-optional-details"/);
 assert.match(js,/function renderFinanceOutcome\(report\)/);
 assert.match(js,/renderFinanceOutcome\(report\)/);
 assert.match(server,/shopOutcome:calculateFinanceOutcome\(finance,adsSweep\)/);
});
