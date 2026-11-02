import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const app=readFileSync(new URL('../public/app.js',import.meta.url),'utf8');
test('o botão azul usa um fluxo único de prévia assinada e execução',()=>{
 const index=app.indexOf('async function optimizerOneClickExecute()');
 const end=app.indexOf("$('#optimizerExecutionLaunch')?.addEventListener?.('click',",index);
 assert.ok(index>0&&end>index);
 const flow=app.slice(index,end);
 assert.match(flow,/await optimizerExecutionPrepare\(\)/);
 assert.match(flow,/await optimizerDiscountFinalPrepare\(\)/);
 assert.match(flow,/optimizerManualDiscountIdentity\(q\)/);
 assert.match(flow,/optimizerDiscountFinalPreviewData\?\.preview/);
 assert.match(flow,/preview\?\.needsBasePriceUpdate/);
 assert.match(flow,/Number\(preview\.gross\)===Number\(q\.grossPrice\)/);
 assert.match(flow,/Number\(preview\.promo\)===Number\(q\.marketplaceDisplayPrice\)/);
 assert.match(flow,/await optimizerExecuteApproved\(false\)/);
 assert.match(flow,/\['running','uncertain'\]\.includes\(optimizerExecJob\?\.state\)/);
 assert.match(flow,/optimizerOneClickConsentKey=''/);
});
test('auditoria de sete pendências é leitura sem botões duplicados',()=>{
 const audit=app.slice(app.indexOf('function optimizerRootAuditRender(audit)'),
  app.indexOf('async function optimizerKitAutoFinalizeFromAudit'));
 assert.ok(audit.length>500);
 assert.doesNotMatch(audit,/retry\.textContent='Preparar pendência'/);
 assert.doesNotMatch(audit,/panel\.append\(actions\)/);
 assert.match(audit,/panel\.append\(guidance\)/);
 const tracker=app.slice(app.indexOf('function optimizerExecutionTrackerRender(progress,job)'),
  app.indexOf('function optimizerExecutionIssueRender(issue)'));
 assert.doesNotMatch(tracker,/button\.textContent=step\.id==='discount'/);
 assert.match(tracker,/pendingActions\.append\(instructions\)/);
});
test('autorização manual é limitada ao mesmo preço e à cotação visível',()=>{
 assert.match(app,/optimizerOneClickConsentKey===optimizerManualDiscountIdentity\(q\)/);
 assert.match(app,/optimizerOneClickConsentKey=optimizerManualDiscountIdentity\(q\)/);
 assert.match(app,/Ao clicar, autorizo esta prévia: preço bruto/);
 assert.ok(app.includes("$('#optimizerExecutionLaunch').textContent='▶ EXECUTAR NA SHOPEE"));
});

test('recusa anterior não esconde executar nem oferece preparar autorização',()=>{
 const cmd=app.slice(app.indexOf('function optimizerExecutionVisibleCommands(progress,job)'),
   app.indexOf('function optimizerExecutionTrackerRender(progress,job)'));
 assert.match(cmd,/const single=Boolean\(current&&!optimizerKitWorkflowActive\(\)\)/);
 assert.match(cmd,/recover\.hidden=true;full\.hidden=true/);
 assert.match(cmd,/launch\.hidden=!ready/);
 assert.match(cmd,/launch\.textContent='▶ EXECUTAR NA SHOPEE'/);
 const css=readFileSync(new URL('../public/optimizer-execution-progress.css',import.meta.url),'utf8');
 assert.match(css,/optimizer-one-button-mode #optimizerRootAuditPanel/);
 assert.match(css,/optimizer-one-button-mode #optimizerExecutionPendingActions/);
 assert.match(css,/optimizer-one-button-mode #optimizerExecutionSteps/);
 assert.match(css,/optimizer-one-button-mode #optimizerExecutionActivity/);
 assert.match(css,/optimizer-one-button-mode #optimizerExecutionRecoverStart/);
 assert.match(app,/document\.body\.classList\.toggle\('optimizer-one-button-mode',!optimizerKitWorkflowActive\(\)\)/);
});
