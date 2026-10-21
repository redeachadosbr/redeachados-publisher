import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const read=path=>readFileSync(new URL('../'+path,import.meta.url),'utf8');

test('ação única usa somente uma chamada por SKU, mantém CAS e não repete POST de escrita',()=>{
 const frontend=read('public/fiscal-migration-run.js');
 const client=frontend.slice(frontend.indexOf('async function run(){'));
 assert.match(client,/\/fiscal-migration\/execute-one/);
 assert.match(client,/confirmation:'EXECUTAR FISCAL SKU'/);
 assert.match(client,/},0\); \/\/ Sem retry de POST/);
 assert.match(client,/state\.pending=key;save\(state\)/);
 assert.match(client,/response\.status==='already_current'/);
 assert.match(client,/response\.status==='blocked'/);
 assert.match(client,/await awaitConfirmation\(state,item\)/);
 assert.doesNotMatch(client,/\/fiscal-migration\/prepare-drafts/);
 assert.doesNotMatch(client,/\/fiscal-migration\/validate-one/);
 assert.doesNotMatch(client,/\/batch\/fiscal\/prepare/);
 const server=read('server.js');
 const a=server.indexOf("app.post('/api/shopee/optimizer/fiscal-migration/execute-one'");
 const b=server.indexOf('// BATCH: prepare and execute ONLY fiscal',a);
 const route=server.slice(a,b);
 assert.ok(a>0&&b>a);
 assert.match(route,/auditFiscalSkuLight/);
 assert.doesNotMatch(route,/auditShopeeItem/);
 const helper=server.slice(server.indexOf('async function auditFiscalSkuLight('),a);
 assert.match(helper,/shopeeLiveEditableItem/);
 assert.match(helper,/get_model_list/);
 assert.doesNotMatch(helper,/get_attribute_tree|get_item_extra_info/);
 assert.match(route,/readWeDropProduct/);
 assert.match(route,/compileTax/);
 assert.match(route,/fiscalMatrixSource/);
 assert.match(route,/saveWorkflowReview/);
 assert.match(route,/saveShopeePreparedExecution/);
 assert.match(route,/claimShopeePreparedExecution/);
 assert.match(route,/runOptimizerJobs/);
 assert.match(route,/previousJob\?\.sku/);
 assert.match(route,/already_current/);
 assert.doesNotMatch(route,/update_price|update_stock|update_discount|emitirNota/);
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
 assert.match(route,/const fast=String\(req.query.fast/);
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
 assert.match(html,/\/fiscal-migration-run\.js\?v=9-fiscal-direct/);
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
           route.indexOf("'/api/shopee/optimizer/fiscal-migration/execute-one'"));
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
