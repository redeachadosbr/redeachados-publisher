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
 assert.match(route,/\['NORMAL','UNLIST'\]\.includes\(status\)/);
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
 assert.match(html,/Contagem não verificada/);
 assert.match(html,/Anúncios na loja/);
 assert.doesNotMatch(html,/Catálogo completo/);
 assert.match(css,/\.ra-fiscal-advanced,/);
 assert.match(css,/#optimizerFiscalBatchList,/);
 assert.match(css,/#optimizerFiscalBatchStatus,/);
 assert.match(html,/\/fiscal-migration-run\.js\?v=8-complete-status-audit/);
});

test('não tratar inventário antigo como total nem enviar antes do censo e paginação oficial',()=>{
 const src=read('public/fiscal-migration-run.js');
 const start=src.indexOf('async function run(){');
 const route=src.slice(start);
 assert.match(src,/inventoryVerifiedThisSession=false/);
 assert.match(src,/const trustworthy=Boolean\(inventoryVerifiedThisSession&&state\?\.catalogValidatedAt\)/);
 assert.match(src,/Histórico antigo:/);
 assert.match(route,/const census=await ensureCensus\(true\)/);
 assert.match(route,/data\.pageItemIds/);
 assert.match(route,/uniqueParents\.size!==editableCount\(\)/);
 assert.match(route,/state\.catalogValidatedAt=new Date\(\)\.toISOString\(\)/);
 assert.ok(route.indexOf('uniqueParents.size!==editableCount()') <
           route.indexOf("'/api/shopee/optimizer/batch/fiscal/execute'"));
 assert.doesNotMatch(src,/if\(previous\?\.active&&previous\?\.inventory\?\.length\)/);
});
test('censo oficial inclui status Shopee e deixa explícito anúncio versus SKU',()=>{
 const server=read('server.js');
 const a=server.indexOf("app.get('/api/shopee/optimizer/fiscal-migration/catalog-census'");
 const b=server.indexOf("app.get('/api/shopee/optimizer/fiscal-migration/active-skus'",a);
 const route=server.slice(a,b);
 assert.ok(a>0&&b>a);
 for(const status of ['NORMAL','UNLIST','REVIEWING','BANNED'])
  assert.ok(route.includes(status));
 assert.match(route,/get_item_list/);
 assert.match(route,/total_count/);
 assert.match(route,/anuncios-pai-sem-contar-variacoes/);
 assert.doesNotMatch(route,/update_item|update_price|runOptimizerJobs/);
});
