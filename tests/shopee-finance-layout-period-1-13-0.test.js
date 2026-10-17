import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {financeRange,financePeriod,MAX_FINANCE_ORDERS} from '../shopeeFinance.js';
import {financeAdsDates} from '../financeAdsSweep.js';

const html=readFileSync(new URL('../public/index.html',import.meta.url),'utf8');
const js=readFileSync(new URL('../public/app.js',import.meta.url),'utf8');
const css=readFileSync(new URL('../public/style.css',import.meta.url),'utf8');
const backend=readFileSync(new URL('../shopeeFinance.js',import.meta.url),'utf8');
const server=readFileSync(new URL('../server.js',import.meta.url),'utf8');

test('7, 15, 30 dias usam calendário Brasil e a mesma janela dos Ads',()=>{
 const now=Date.parse('2026-10-16T15:00:00-03:00')/1000;
 for(const n of [7,15,30]){
  assert.equal(financePeriod(n),n);
  const range=financeRange({days:n},now);
  assert.equal(range.days,n);
  assert.equal(range.to,now);
  const ads=financeAdsDates(range);
  assert.equal(ads.end,'2026-10-16');
  const startTime=Date.parse(ads.start+'T00:00:00-03:00')/1000;
  assert.equal(startTime,range.from);
  assert.equal((Date.parse(ads.end+'T00:00:00-03:00')/1000-startTime)/86400,n-1);
 }
 assert.throws(()=>financePeriod(31),/1 a 30/);
});
test('datas personalizadas nunca passam de 30 dias nem misturam períodos',()=>{
 const now=Date.parse('2026-10-16T18:00:00-03:00')/1000;
 const range=financeRange({start:'2026-10-01',end:'2026-10-16'},now);
 assert.deepEqual(financeAdsDates(range),{start:'2026-10-01',end:'2026-10-16'});
 assert.equal(range.mode,'custom');
 assert.equal(range.days,16);
 assert.throws(()=>financeRange({start:'2026-10-16',end:'2026-10-01'},now),/inválido/i);
 assert.throws(()=>financeRange({start:'2026-09-01',end:'2026-10-16'},now),/30 dias/);
 assert.throws(()=>financeRange({start:'2026-10-01',end:'2026-11-01'},now),/inválido/i);
 assert.throws(()=>financeRange({start:'2026-02-31',end:'2026-10-16'},now),/Data inválida/);
});
test('todos os endpoints usam o mesmo range e listagem paginada de pedidos',()=>{
 assert.match(server,/const range=financeRange\(/);
 assert.match(server,/const dates=financeAdsDates\(range\)/);
 assert.match(server,/timeRange:range/);
 assert.match(backend,/for\(let chunkFrom=periodFrom;chunkFrom<=periodTo;chunkFrom\+=CHUNK\)/);
 assert.match(backend,/time_range_field:'create_time'/);
 assert.match(backend,/String\(x\.order_status\|\|''\)\.toUpperCase\(\)==='COMPLETED'/);
 assert.equal(MAX_FINANCE_ORDERS,100);
});
test('somente SKUs vendidos e pendências estão na lista financeira',()=>{
 assert.match(js,/const wanted=new Set\(\[\.\.\.sold\.keys\(\),\.\.\.pending\]\)/);
 assert.match(js,/financeSkuFilter='sold'/);
 assert.match(js,/financeSkuEntries\(financeReport\)/);
 assert.doesNotMatch(html,/data-finance-filter="unsold"/);
 assert.match(html,/data-finance-filter="sold" aria-pressed="true"/);
 for(const id of ['financeSkuBody','financeSkuSearch','financePeriodStart','financePeriodEnd',
  'financeCustomDates','financePeriodCaption','financeTaxNetKpi','financeResultCompleteness']){
  assert.equal((html.match(new RegExp('id="'+id+'"','g'))||[]).length,1,id);
 }
});
test('prejuízo aparece negativo após TODOS os Ads; lucro fiscal não é inventado',()=>{
 assert.match(js,/const result=valid\?Math\.round\(\(total-Number\(sweep\.spendTotal\)\)\*100\)\/100:null/);
 assert.match(js,/net\.classList\.toggle\('negative',result!==null&&result<0\)/);
 assert.match(js,/net\.textContent=result===null\?'—':wdMoney\(result\)/);
 assert.match(html,/Resultado após Ads · loja/);
 assert.match(html,/Impostos e despesas externas pendentes/);
 assert.match(js,/financeTaxNetKpi'\)\.textContent='Em apuração'/);
});
test('tabela tem 8 colunas, espaço para valores e detalhamento do pedido',()=>{
 assert.match(html,/class="finance-sku-table"/);
 assert.match(html,/Resultado após Ads\*/);
 assert.match(js,/td\.colSpan=8/);
 assert.match(js,/function financeSkuDetail/);
 assert.match(js,/financeSkuDetail\(tr,x\)/);
 assert.match(css,/\.finance-sku-table\{width:100%;min-width:935px/);
 assert.match(css,/\.finance-sku-table \.finance-number/);
 assert.match(css,/white-space:nowrap;text-align:right/);
 assert.match(css,/\.finance-expanded-content/);
 assert.match(html,/app\.js\?v=1\.14\.1/);
 assert.match(html,/style\.css\?v=1\.14\.1/);
});
