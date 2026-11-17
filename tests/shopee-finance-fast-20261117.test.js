import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {mapFinanceConcurrent} from '../shopeeFinance.js';

const read=path=>readFileSync(new URL(path,import.meta.url),'utf8');

test('concorrência é limitada e resultados permanecem na ordem original',async()=>{
  let inFlight=0,peak=0;
  const items=Array.from({length:37},(_,i)=>i);
  const values=await mapFinanceConcurrent(items,4,async value=>{
    inFlight++;peak=Math.max(peak,inFlight);
    await new Promise(resolve=>setTimeout(resolve,1+(value%3)));
    inFlight--;
    return value*2;
  });
  assert.ok(peak<=4&&peak>1,'Shopee não deve receber muitas chamadas em paralelo');
  assert.deepEqual(values,items.map(x=>x*2));
  assert.deepEqual(await mapFinanceConcurrent([],4,async()=>null),[]);
});

test('pagamento é consultado só uma vez por pedido, sem chamada sequencial duplicada',()=>{
  const finance=read('../shopeeFinance.js');
  assert.equal((finance.match(/path:'\\/api\\/v2\\/payment\\/get_escrow_detail'/g)||[]).length,1);
  assert.match(finance,/mapFinanceConcurrent\\(paidTargets,4/);
  assert.match(finance,/const returnsPromise=readFinanceReturns/);
  assert.match(finance,/const escrow=paymentBySn\\.get\\(sn\\)\\?\\.escrow\\|\\|null/);
  assert.match(finance,/mapFinanceConcurrent\\(detailBatches,3/);
});

test('backend reutiliza snapshot por loja e período, respeita atualização manual e preserva último dado',()=>{
  const server=read('../server.js');
  assert.match(server,/financeSnapshotKey\\(auth\\.shopId,range\\)/);
  assert.match(server,/FINANCE_SNAPSHOT_TTL_MS=120000/);
  assert.match(server,/const refresh=String\\(req\\.query\\.refresh\\|\\|''\\)==='1'/);
  assert.match(server,/financeSnapshotInflight\\.get\\(key\\)/);
  assert.match(server,/status:'stale'/);
  assert.match(server,/if\\(key\\.startsWith\\(String\\(auth\\.shopId\\)\\+'\\|'\\)\\)/);
});

test('painel abre sozinho, preserva último relatório na atualização e não quebra por miniaturas',()=>{
  const ui=read('../public/app.js');
  const html=read('../public/index.html');
  assert.match(ui,/if\\(activeAppPage==='finance'&&!financeReport&&!shopeeFinanceBusy\\)/);
  assert.match(ui,/void financeLoad\\(\\{force:false\\}\\)/);
  assert.match(ui,/if\\(force\\)params\\.set\\('refresh','1'\\)/);
  assert.match(ui,/if\\(!lastValidReport\\)\\{/);
  assert.match(ui,/void refreshWeDropCoverage\\(\\)\\.catch\\(\\(\\)=>\\{\\}\\)/);
  assert.match(html,/app\\.js\\?v=3\\.5\\.75-finance-rapid-cache/);
});
