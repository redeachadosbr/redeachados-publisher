import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const source=path=>readFileSync(new URL('../'+path,import.meta.url),'utf8');
const store=source('shopeeKitDraftStore.js');
const server=source('server.js');
const app=source('public/app.js');
const builder=source('public/kit-builder.js');

test('rascunho de anuncio otimizado vira Publicados sem fingir criacao de Kit Formal',()=>{
 assert.match(store,/optimizationFinalization:x\.draft\?\.optimizationFinalization\|\|null/);
 assert.match(store,/isFinishedOptimization\(x\.optimizationFinalization\)/);
 assert.match(store,/const drafts=all\.filter\(x=>!isFinished\(x\)/);
 assert.match(store,/\['verified','manual_confirmed'\]\.includes/);
 assert.match(builder,/optimized\?'✓ ANÚNCIO OTIMIZADO NA SHOPEE'/);
 assert.match(builder,/RAKitOptimizationFinalized=/);
 assert.match(store,/shopeePublished:false,[\s\S]*?optimizationFinalization:finalization/);
});

test('finalizacao recusa progresso local, escopo parcial incompleto e outra SKU',()=>{
 assert.match(store,/audit\?\.complete!==true/);
 assert.match(store,/audit\.stages\.length!==9/);
 assert.match(store,/audit\.stages\.some\(x=>!\['confirmed','not_applicable'\]\.includes\(x\.status\)\)/);
 assert.match(store,/job\?\.state!=='verified'/);
 assert.match(store,/String\(link\.itemId\)!==String\(itemId\)/);
 assert.match(store,/updated_at=eq\./);
 assert.match(server,/\/api\/shopee\/kits\/drafts\/finalize-optimization/);
 assert.match(server,/const \{audit,discountDiagnostic,job,auth,itemId,modelId,sku\}=await readLiveRootExecution\(req\)/);
 assert.match(server,/recordKitOptimizationFinalization\(auth\.shopId,kitSku/);
 assert.match(app,/if\(result\.audit\?\.complete===true\)void optimizerKitAutoFinalizeFromAudit\(current,result\.audit\)/);
 assert.match(app,/optimizerKitFinalizeRunning=new Set/);
});

test('finalizado mantém dados e impede reabrir para edicao acidental',()=>{
 assert.match(store,/isFinishedOptimization\(previous\?\.optimizationFinalization\)/);
 assert.match(store,/isFinishedOptimization\(current\.optimizationFinalization\)/);
 assert.match(builder,/if\(activeConfirmed\)\{/);
 assert.match(builder,/kitCloseInlineEditor\(\)/);
});
