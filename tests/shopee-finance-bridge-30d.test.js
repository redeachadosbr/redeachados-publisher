import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {financeRange,normalizeEscrowOrder} from '../shopeeFinance.js';
const server=readFileSync(new URL('../server.js',import.meta.url),'utf8');
test('Ponte financeira Shopee consulta 30 dias, nao apenas os ultimos 15',()=>{
 const start=server.indexOf('installFinanceBridge(app,async(req)=>{');
 const end=server.indexOf('// Relatório privado Shopee Ads',start);
 assert.ok(start>=0&&end>start);
 const bridge=server.slice(start,end);
 assert.match(bridge,/financeRange\(\{days:30\},to\)/);
 assert.match(bridge,/pedidos COMPLETED criados na janela de 30 dias/);
 assert.match(bridge,/getValidAuth\(req\)/);
 assert.match(bridge,/netReceived:o\.payout/);
 assert.doesNotMatch(bridge,/financeRange\(\{days:15\}/);
 const now=Math.floor(new Date('2026-10-18T19:00:00-03:00').getTime()/1000);
 const range=financeRange({days:30},now);
 assert.equal(range.days,30);
 assert.ok(range.to-range.from<=30*86400);
 const uncompleted=normalizeEscrowOrder(
  {order_sn:'123456789',order_status:'SHIPPED'},
  {order_status:'SHIPPED'}, {response:{order_income:{escrow_amount:45}}},new Map()
 );
 assert.equal(uncompleted.ready,false);
 assert.notEqual(uncompleted.payout,45,'nao confirmar receita de pedidos apenas enviados');
});