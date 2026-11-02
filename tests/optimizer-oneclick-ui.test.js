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
 assert.match(cmd,/launch\.hidden=!active/);
 assert.match(cmd,/optimizerExecPlan\?\.canExecute===true/);
 assert.match(cmd,/launch\.disabled=!active\|\|running/);
 assert.match(cmd,/launch\.textContent=running\?/);
 assert.ok(cmd.includes("'▶ EXECUTAR NA SHOPEE'"));
 const css=readFileSync(new URL('../public/optimizer-execution-progress.css',import.meta.url),'utf8');
 assert.match(css,/optimizer-one-button-mode #optimizerRootAuditPanel/);
 assert.match(css,/optimizer-one-button-mode #optimizerExecutionPendingActions/);
 assert.match(css,/optimizer-one-button-mode #optimizerExecutionSteps/);
 assert.match(css,/optimizer-one-button-mode #optimizerExecutionActivity/);
 assert.match(css,/optimizer-one-button-mode #optimizerExecutionRecoverStart/);
 assert.match(app,/document\.body\.classList\.toggle\('optimizer-one-button-mode',!optimizerKitWorkflowActive\(\)\)/);
});

test('um clique aceita ID numérico da campanha e não a regex de duas barras',()=>{
 const start=app.indexOf('async function optimizerOneClickExecute()');
 const end=app.indexOf("$('#optimizerExecutionLaunch')?.addEventListener?.('click',",start);
 const flow=app.slice(start,end);
 const digits='\\\\d'; // representação com dois caracteres de barra no texto-fonte
 const pattern='if(!/^'+String.fromCharCode(92)+'d{1,18}$/.test(campaign))';
 assert.ok(flow.includes(pattern),'Deve validar campanha numérica de 1 a 18 dígitos');
 assert.ok(!flow.includes('if(!/^'+String.fromCharCode(92).repeat(2)+'d{1,18}$/.test(campaign))'),
   'Barra dupla em literal RegExp rejeita todos os IDs válidos');
});

test('execução avulsa exibe etapas reais, erros e readback no mesmo painel',()=>{
 const html=readFileSync(new URL('../public/index.html',import.meta.url),'utf8');
 assert.match(html,/id="optimizerExecutionLivePhase"/);
 assert.match(html,/id="optimizerExecutionLiveTitle"/);
 assert.match(html,/id="optimizerExecutionLiveDetail"/);
 assert.match(html,/id="optimizerExecutionLiveHistory"/);
 const css=readFileSync(new URL('../public/optimizer-execution-progress.css',import.meta.url),'utf8');
 assert.match(css,/optimizer-execution-live-phase:not\(\[hidden\]\)/);
 const job=app.slice(app.indexOf('function optimizerExecutionJobView(job,progress=null,issue=null)'),
  app.indexOf('// One readback-only reconciliation',app.indexOf('function optimizerExecutionJobView(job,progress=null,issue=null)')));
 assert.match(job,/job\.state==='running'/);
 assert.match(job,/job\.state==='uncertain'/);
 assert.match(job,/job\.state==='verified'/);
 assert.match(job,/job\.state==='failed'/);
 assert.match(job,/optimizerExecutionLiveStep\(/);
 const execution=app.slice(app.indexOf('async function optimizerOneClickExecute()'),
  app.indexOf("$('#optimizerExecutionLaunch')?.addEventListener?.('click',",app.indexOf('async function optimizerOneClickExecute()')));
 for(const label of ['1. Conferindo a prévia salva','2. Verificando preço e desconto','3. Consultando Minha Promoção',
   '4. Solicitando execução à Shopee','5. Execução aceita pelo servidor','Execução não iniciada'])
  assert.ok(execution.includes(label),label);
 assert.match(execution,/const start=await optimizerExecuteApproved\(false\)/);
 assert.match(execution,/if\(start\?\.started\)/);
});

test('não girar em loop quando preparação da mesma SKU já está pendente',()=>{
 const begin=app.indexOf('async function optimizerExecutionPrepare({preserveStartError=false}={})');
 const end=app.indexOf("$('#optimizerExecutionKitDiscountOnly')?.addEventListener?.('click'",begin);
 const prep=app.slice(begin,end);
 assert.ok(begin>=0&&end>begin);
 assert.match(prep,/if\(optimizerExecPreparation\.key===key&&optimizerExecPreparation\.serial===optimizerExecSerial\)/);
 assert.doesNotMatch(prep,/optimizerExecPreparation\.again=true/);
 assert.doesNotMatch(prep,/if\(preparation\.again/);
 assert.match(prep,/optimizerExecutionVisibleCommands\(optimizerExecProgress,optimizerExecJob\)/);
});
test('botão não confunde preparação de prévia com execução na Shopee',()=>{
 const begin=app.indexOf('function optimizerExecutionVisibleCommands(progress,job)');
 const end=app.indexOf('function optimizerExecutionTrackerRender(progress,job)',begin);
 const code=app.slice(begin,end);
 assert.doesNotMatch(code,/optimizerExecPreparation\|\|\['running','uncertain'/);
 assert.match(code,/const running=Boolean\(optimizerExecBusy\|\|optimizerOneClickBusy\|\|/);
 assert.match(code,/launch\.disabled=!active\|\|running/);
});
test('clicar EXECUTAR recupera primeiro o job preparado por consulta somente-leitura',()=>{
 const begin=app.indexOf('async function optimizerOneClickExecute()');
 const end=app.indexOf("$('#optimizerExecutionLaunch')?.addEventListener?.('click',",begin);
 const code=app.slice(begin,end);
 assert.match(code,/Recuperando prévia já salva/);
 assert.match(code,/\/api\/shopee\/optimizer\/execution\/status\?/);
 assert.match(code,/job\.state==='prepared'&&job\.plan\?\.canExecute===true/);
 assert.match(code,/optimizerExecRender\(\{plan:job\.plan/);
 assert.match(code,/if\(equal&&\['running','uncertain'\]\.includes\(job\.state\)\)/);
 assert.ok(code.indexOf("'/api/shopee/optimizer/execution/status?'")<
  code.indexOf('await optimizerExecutionPrepare()'),'recuperar antes de preparar novamente');
});
