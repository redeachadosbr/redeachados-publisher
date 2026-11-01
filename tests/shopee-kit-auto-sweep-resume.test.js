import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

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
 assert.match(sweep,/scope\.value='all'/);
 assert.match(sweep,/await optimizerExecutionPrepare\(\)/);
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
 const end=server.indexOf('}else if(job?.state===\'verified\'&&job?.plan?.commercialDiscount',start);
 assert.ok(start>0&&end>start);
 const discount=server.slice(start,end);
 assert.match(discount,/review\.kitDiscountPreview\?\.status==='prepared'/);
 assert.match(discount,/job\?\.state==='verified'&&job\?\.plan\?\.kitDiscount/);
 assert.match(discount,/inspectKitDiscountForExecution/);
 assert.match(discount,/discountReadback=liveDiscount\.confirmed===true/);
 assert.match(discount,/liveDiscount\.itemId/);
 assert.match(discount,/liveDiscount\.promo/);
});
