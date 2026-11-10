import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const source=path=>readFileSync(new URL('../'+path,import.meta.url),'utf8');
const existing=source('public/kit-existing-optimization.js');
const builder=source('public/kit-builder.js');
const app=source('public/app.js');

test('etapa 10 reabre executor completo enquanto etapa 05 permanece tecnica',()=>{
 const start=existing.indexOf('function resumeLiveVerifiedTarget(');
 const end=existing.indexOf('// Ponte de mídia',start);
 assert.ok(start>0&&end>start);
 const resume=existing.slice(start,end);
 assert.match(resume,/technicalOnly:false/);
 assert.match(resume,/redeKitOpenOptimizerTarget/);
 assert.doesNotMatch(resume,/return openTechnicalTarget\(\)\?/);
 const technical=existing.slice(existing.indexOf('function openTechnicalTarget('),start);
 assert.match(technical,/technicalOnly:true/);
});

test('erro e timeout da retomada nao encerram nem declaram publicada a SKU',()=>{
 assert.match(builder,/RAKitWizardWorkflowLoadError/);
 assert.match(builder,/kitWizardResumeTimeout=setTimeout/);
 assert.match(builder,/Nenhuma publicação foi iniciada/);
 assert.match(builder,/kitWizardExecutionIntent=false/);
 assert.match(app,/globalThis\.RAKitWizardWorkflowLoadError\?\.\(/);
 assert.match(app,/optimizerKitResumeLinkRecovering=new Set\(\)/);
});

test('etapa 10 executa TODAS as nove etapas da auditoria raiz, e nao apenas mídia/fiscal',()=>{
 const start=app.indexOf('globalThis.RAKitExecutePendingAllStages=async');
 const end=app.indexOf("$('#optimizerExecutionLaunch')",start);
 assert.ok(start>0&&end>start);
 const run=app.slice(start,end);
 assert.match(run,/scope\.value=executionScope/);
 assert.match(run,/onlyDiscount\?'discount':kitAutoSweepPreferredStage\(audit\)/);
 assert.match(run,/optimizerRootAuditRefresh\(true\)/);
 assert.match(run,/kitAutoSweepChoosePlan\(\{kitSku,sku,itemId,modelId\},audit,executionScope\)/);
 const chooser=app.slice(app.indexOf('async function kitAutoSweepChoosePlan('),
  app.indexOf('function kitAutoSweepResume('));
 assert.match(chooser,/plan\?\.selectedStage===stage/);
 assert.match(chooser,/String\(plan\.itemId\)===String\(target\.itemId\)/);
 assert.match(run,/optimizerExecuteApproved\(false\)/);
 assert.doesNotMatch(run,/scope\.value='media_fiscal'/);
});

test('kit mochila T-Rex usa o Item ID original e falha fechado sem criar duplicata',()=>{
 const server=source('server.js');
 const service=source('shopeeKitPublicationService.js');
 assert.match(existing,/'KIT-TX24505K-TX24508E':'58222633999'/);
 const find=server.slice(server.indexOf("app.get('/api/shopee/kits/optimization/find'"),
  server.indexOf("app.get('/api/shopee/optimizer/find'"));
 assert.match(find,/kitSku==='KIT-TX24505K-TX24508E'&&sku==='TX24505K'/);
 assert.match(find,/userConfirmedItemId\|\|\(/);
 assert.match(find,/if\(userConfirmedItemId\)throw Error/);
 assert.match(find,/verifiedSavedTarget:verified/);
 const execute=server.slice(server.indexOf("app.post('/api/shopee/optimizer/execution/execute'"),
  server.indexOf("app.get('/api/shopee/optimizer/execution/",server.indexOf("app.post('/api/shopee/optimizer/execution/execute'")));
 assert.match(execute,/linkedKit\?\.kitSku==='KIT-TX24505K-TX24508E'&&String\(itemId\)!=='58222633999'/);
 assert.match(service,/if\(kitSku==='KIT-TX24505K-TX24508E'\)/);
 assert.match(service,/Não criar outro anúncio/);
 assert.match(builder,/const kitWizardConfirmedItemId=kitSku=>/);
 assert.match(builder,/\(!confirmedId\|\|String\(handoff\.itemId\)===confirmedId\)/);
});
