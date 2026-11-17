import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {mapFinanceConcurrent} from '../shopeeFinance.js';

const read=path=>readFileSync(new URL(path,import.meta.url),'utf8');
const mustInclude=(text,fragment)=>assert.ok(text.includes(fragment),'Ausente: '+fragment);

test('concorrência limitada preserva a ordem original',async()=>{
  let inFlight=0,peak=0;
  const items=Array.from({length:37},(_,i)=>i);
  const values=await mapFinanceConcurrent(items,4,async value=>{
    inFlight++;peak=Math.max(peak,inFlight);
    await new Promise(resolve=>setTimeout(resolve,1+(value%3)));
    inFlight--;
    return value*2;
  });
  assert.ok(peak<=4&&peak>1,'Shopee não deve receber requisições excessivas');
  assert.deepEqual(values,items.map(x=>x*2));
  assert.deepEqual(await mapFinanceConcurrent([],4,async()=>null),[]);
});

test('pagamento é consultado uma vez por pedido e os detalhes são paralelizados',()=>{
  const finance=read('../shopeeFinance.js');
  assert.equal(finance.split("path:'/api/v2/payment/get_escrow_detail'").length-1,1);
  mustInclude(finance,'mapFinanceConcurrent(paidTargets,4');
  mustInclude(finance,'const returnsPromise=readFinanceReturns');
  mustInclude(finance,'const escrow=paymentBySn.get(sn)?.escrow||null');
  mustInclude(finance,'mapFinanceConcurrent(detailBatches,3');
});

test('backend reutiliza snapshot da loja e período e preserva último resultado',()=>{
  const server=read('../server.js');
  mustInclude(server,'financeSnapshotKey(auth.shopId,range)');
  mustInclude(server,'FINANCE_SNAPSHOT_TTL_MS=120000');
  mustInclude(server,"const refresh=String(req.query.refresh||'')==='1'");
  mustInclude(server,'financeSnapshotInflight.get(key)');
  mustInclude(server,"status:'stale'");
  mustInclude(server,"key.startsWith(String(auth.shopId)+'|')");
});

test('painel atualiza sozinho e mantém último relatório durante atualização',()=>{
  const ui=read('../public/app.js'),html=read('../public/index.html');
  mustInclude(ui,"if(activeAppPage==='finance'&&!financeReport&&!shopeeFinanceBusy)");
  mustInclude(ui,'void financeLoad({force:false})');
  mustInclude(ui,"if(force)params.set('refresh','1')");
  mustInclude(ui,'if(!lastValidReport){');
  mustInclude(ui,'void refreshWeDropCoverage().catch(()=>{})');
  mustInclude(html,'app.js?v=3.5.75-finance-rapid-cache');
});
