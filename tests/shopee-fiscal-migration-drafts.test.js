import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
test('migração só prepara rascunhos até 12, não envia nem aprova na Shopee',()=>{
 const s=readFileSync(new URL('../server.js',import.meta.url),'utf8');
 const start=s.indexOf("app.post('/api/shopee/optimizer/fiscal-migration/prepare-drafts'");
 const end=s.indexOf("app.get('/api/shopee/catalog/models'",start);
 assert.ok(start>0&&end>start);
 const handler=s.slice(start,end);
 assert.match(handler,/rows.length>12/);
 assert.match(handler,/readWeDropProduct/);
 assert.match(handler,/fiscalMatrixSource/);
 assert.match(handler,/compileTax/);
 assert.match(handler,/reviewed:false/);
 assert.doesNotMatch(handler,/runOptimizerJobs|update_item|update_price|update_stock/);
});
test('botão de preparação chama apenas endpoint de rascunho',()=>{
 const html=readFileSync(new URL('../public/index.html',import.meta.url),'utf8');
 const js=readFileSync(new URL('../public/optimizer-fiscal-premium.js',import.meta.url),'utf8');
 assert.match(html,/id="optimizerFiscalMigrationPrepare"/);
 assert.match(js,/fiscal-migration\/prepare-drafts/);
 assert.match(js,/rows\.slice\(i,i\+12\)/);
});
