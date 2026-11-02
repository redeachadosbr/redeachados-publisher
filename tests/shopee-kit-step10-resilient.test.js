import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const file=p=>readFileSync(new URL('../'+p,import.meta.url),'utf8');
const builder=file('public/kit-builder.js');
const image=file('public/kit-existing-optimization.js');
const app=file('public/app.js');
const draft=file('shopeeKitDraftStore.js');

test('etapa 10 sempre confere vinculo duplo antes de importar imagens, video ou fiscal',()=>{
 const start=builder.indexOf('async function kitWizardOpenExecutionFlow()');
 const finish=builder.indexOf('function kitWizardUpdateProgress()',start);
 const run=builder.slice(start,finish);
 assert.ok(start>0&&finish>start);
 assert.ok(run.includes('kitWizardEnsureExecutionLink({kitSku,sku,itemId:id,modelId})'));
 assert.ok(run.indexOf('kitWizardEnsureExecutionLink({kitSku,sku,itemId:id,modelId})')<
    run.indexOf('RAKitTransferImagesToWorkflow'));
 assert.ok(builder.includes('/api/shopee/kits/optimization/link-status?'));
 assert.ok(builder.includes('/api/shopee/kits/optimization/prepare'));
 assert.ok(builder.includes('confirmedItemId:itemId'));
 assert.ok(builder.includes('O motor completo avaliará as outras etapas aprovadas'));
});
test('falha de fiscal por editor stale recarrega identidade e tenta sincronizar sem apagar',()=>{
 assert.ok(app.includes('globalThis.RAKitRefreshOptimizerWorkflow=async'));
 assert.ok(app.includes("String(data?.kitOptimization?.kitSku)!==String(kitSku)"));
 assert.ok(builder.includes('await kitWizardAwaitBounded(globalThis.RAKitRefreshOptimizerWorkflow'));
 assert.ok(builder.includes('const retried=await kitWizardAwaitBounded(globalThis.RAKitSyncApprovedFiscal'));
 assert.ok(builder.includes('As imagens e o vídeo já recuperados permanecem preparados.'));
});
test('importação de galeria privada é retomável por posição, SHA e SKU',()=>{
 const start=image.indexOf('async function transferImages(');
 const end=image.indexOf('async function startKitOptimization()',start);
 const run=image.slice(start,end);
 assert.ok(run.includes('/api/shopee/optimizer/images/manual?'));
 assert.ok(run.includes("globalThis.crypto.subtle.digest('SHA-256'"));
 assert.ok(run.includes('if(digest===confirmed.get(slot))'));
 assert.ok(run.includes('continue;'));
 assert.ok(run.includes('stage:\'images\',reviewed:true'));
 assert.ok(!run.includes('update_item'));
});
test('preparacao resiste a autosave concorrente sem ignorar identidade',()=>{
 const start=draft.indexOf('export async function recordKitOptimization(');
 const end=draft.indexOf('/**\n * Arquiva um anúncio otimizado EXISTENTE',start);
 const func=draft.slice(start,end);
 assert.ok(func.includes('attempt<3'));
 assert.ok(func.includes("String(current.creative?.title||'').trim()!==String(link.title||'').trim()"));
 assert.ok(func.includes('current.skus.map(String).join'));
 assert.ok(func.includes("String(current.optimization.itemId)!==String(link.itemId)"));
 assert.ok(func.includes('&updated_at=eq.'));
 assert.ok(func.includes('creative:current.creative'));
});

test('motor raiz mostra progresso historico e abre pendencias reais sem preparar plano vazio',()=>{
 const helper=app.slice(app.indexOf('async function optimizerRootOpenFiscalPreset()'),
  app.indexOf('// Auditoria independente do último job:'));
 assert.match(helper,/optimizerWorkflowOpen\('fiscal'\)/);
 assert.match(helper,/\/api\/shopee\/kits\/fiscal-preset\?/);
 assert.match(helper,/String\(preset\?\.kitSku\)!==kitSku/);
 assert.match(helper,/optimizerFiscalRender\(\{\.\.\.preset,taxCurrent:/);
 assert.doesNotMatch(helper,/\/api\/shopee\/optimizer\/execution\/execute/);
 const audit=app.slice(app.indexOf('function optimizerRootAuditRender(audit)'),
  app.indexOf('async function optimizerKitAutoFinalizeFromAudit'));
 assert.match(audit,/x\.id!=='final'&&x\.status==='confirmed'/);
 assert.match(audit,/A barra de 0% acima é da última tentativa/);
 assert.doesNotMatch(audit,/retry\.textContent='Preparar pendência'/);
 assert.match(audit,/panel\.append\(guidance\)/);
 assert.match(audit,/Conferência somente leitura/);
 assert.match(app,/async function optimizerOneClickExecute\(\)/);
 assert.match(app,/await optimizerDiscountFinalPrepare\(\)/);
 assert.match(app,/await optimizerExecuteApproved\(false\)/);
});
