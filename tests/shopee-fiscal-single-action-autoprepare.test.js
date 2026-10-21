import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const read=path=>readFileSync(new URL('../'+path,import.meta.url),'utf8');

test('ação única cria rascunho antes de validar, preparar e executar a SKU',()=>{
 const source=read('public/fiscal-migration-run.js');
 const flow=source.slice(source.indexOf('async function run(){'));
 const draft=flow.indexOf("'/api/shopee/optimizer/fiscal-migration/prepare-drafts'");
 const validate=flow.indexOf("'/api/shopee/optimizer/fiscal-migration/validate-one'");
 const prepare=flow.indexOf("'/api/shopee/optimizer/batch/fiscal/prepare'");
 const execute=flow.indexOf("'/api/shopee/optimizer/batch/fiscal/execute'");
 assert.ok(draft>=0&&validate>draft&&prepare>validate&&execute>prepare);
 assert.match(flow,/if\(state\.done\[key\]==='verified'\|\|state\.done\[key\]==='uncertain'\)continue/);
 assert.match(flow,/state\.pending=key;save\(state\)/);
 assert.match(flow,/updatedAt:plan\.updatedAt/);
 assert.match(flow,/},0\); \/\/ POST de execução NUNCA recebe retry automático/);
 assert.match(flow,/await awaitConfirmation\(state,item\)/);
});

test('inventário completo: consulta sem modelos extras e paralelo limitado, não aceita página incompleta',()=>{
 const code=read('server.js');
 const begin=code.indexOf("app.get('/api/shopee/optimizer/fiscal-migration/active-skus'");
 const end=code.indexOf("app.post('/api/shopee/optimizer/fiscal-migration/prepare-drafts'",begin);
 const route=code.slice(begin,end);
 assert.match(route,/pageSize:50/);
 assert.match(route,/some\(item=>!item\.baseLoaded\)/);
 assert.match(route,/at\+=5/);
 assert.match(route,/if\(item\.hasModel\)/);
 assert.match(route,/Promise\.all/);
 assert.match(route,/getWorkflowReview/);
});

test('tela exibe somente um controle principal e CSS oculta prévias legadas',()=>{
 const html=read('public/index.html');
 const css=read('public/fiscal-single-action.css');
 assert.match(html,/id="optimizerFiscalMigrationRun"[^>]*>▶ Executar informações fiscais na Shopee/);
 assert.match(html,/Catálogo completo/);
 assert.match(css,/\.ra-fiscal-advanced,/);
 assert.match(css,/#optimizerFiscalBatchList,/);
 assert.match(css,/#optimizerFiscalBatchStatus,/);
 assert.match(html,/\/fiscal-migration-run\.js\?v=6-autoprepare-send/);
});
