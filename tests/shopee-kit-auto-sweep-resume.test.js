import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';

const read=path=>readFileSync(new URL('../'+path,import.meta.url),'utf8');
const app=read('public/app.js');
const server=read('server.js');

test('um clique autoriza varredura e retomada das nove etapas sem exigir segundo clique',()=>{
 const start=app.indexOf('function kitAutoSweepResume(');
 const end=app.indexOf('let kitAllStagesStarting=false;',start);
 assert.ok(start>0&&end>start);
 const sweep=app.slice(start,end);
 assert.match(sweep,/optimizerExecutionRefresh\(true\)/);
 assert.match(sweep,/execution\/root-audit/);
 assert.match(sweep,/scope\.value=executionScope/);
 assert.match(sweep,/onlyDiscount\?'discount':'all'/);
 assert.match(sweep,/await kitAutoSweepPreparePlan\(target\)/);
 assert.match(sweep,/await optimizerExecuteApproved\(false\)/);
 assert.match(sweep,/audit\?\.complete===true/);
 assert.match(sweep,/optimizerKitAutoFinalizeFromAudit/);
});
test('retomada evita reenvio duplicado, recupera sessao e nao modifica job incerto cegamente',()=>{
 assert.match(app,/const attempted=new Set/);
 assert.match(app,/target\.attemptedFingerprints/);
 assert.match(app,/const persist=\(\)=>kitAutoSweepStore/);
 assert.match(app,/attempted\.has\(plan\.fingerprint\)/);
 assert.match(app,/kitAutoSweepKey\(saved\)===kitAutoSweepKey\(target\)/);
 assert.match(app,/kitAutoSweepRestore\(\)/);
 assert.match(app,/execution\/reconcile/);
 assert.match(app,/reading\.recoveryReady===true/);
 assert.match(app,/Se.*Shopee|A Shopee não confirmou o resultado anterior/);
});
test('auditoria da promocao do kit verifica Shopee mesmo se historico falhou',()=>{
 const start=server.indexOf('const published=review.kitDiscountPublication;');
 const end=server.indexOf('const expected=job.plan.commercialDiscount.snapshot;',start);
 assert.ok(start>0&&end>start);
 const discount=server.slice(start,end);
 assert.match(discount,/review\.kitDiscountPreview\?\.status==='prepared'/);
 assert.match(discount,/job\?\.state==='verified'&&job\?\.plan\?\.kitDiscount/);
 assert.match(discount,/inspectKitDiscountForExecution/);
 assert.match(discount,/discountReadback=liveDiscount\.confirmed===true/);
 assert.match(discount,/liveDiscount\.itemId/);
 assert.match(discount,/liveDiscount\.promo/);
});

test('preparação lenta aguarda a prévia completa antes da primeira execução e de uma retomada',async()=>{
 assert.match(app,/const plan=await kitAutoSweepPreparePlan\(target\)/);
 assert.match(app,/const p=await kitAutoSweepPreparePlan\(\{kitSku,sku,itemId,modelId\}\)/);
 const start=app.indexOf('async function kitAutoSweepPreparePlan(target)');
 const end=app.indexOf('function kitAutoSweepResume(',start);
 assert.ok(start>0&&end>start);
 const code=app.slice(start,end);
 const scope={
  optimizerExecPreparation:{key:'kit|all'},
  optimizerExecPlan:null,
  optimizerExecutionPrepare:async()=>{},
  kitAutoSweepMatches:()=>true,
  setTimeout
 };
 setTimeout(()=>{
  scope.optimizerExecPlan={selectedStage:'all',fingerprint:'novo-plano-aprovado'};
  scope.optimizerExecPreparation=null;
 },500);
 const plan=await vm.runInNewContext(code+';kitAutoSweepPreparePlan({})',scope);
 assert.equal(plan.fingerprint,'novo-plano-aprovado');
});
