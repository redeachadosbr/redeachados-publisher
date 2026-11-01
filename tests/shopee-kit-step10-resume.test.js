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

test('execucao pela etapa 10 limita alteracoes a imagens video fiscal',()=>{
 const start=app.indexOf('globalThis.RAKitExecutePendingMediaFiscal=async');
 const end=app.indexOf("$('#optimizerExecutionLaunch')",start);
 assert.ok(start>0&&end>start);
 const run=app.slice(start,end);
 assert.match(run,/scope\.value='media_fiscal'/);
 assert.match(run,/Object\.keys\(p\.proposed\|\|\{\}\)\.length\|\|p\.modelVariations\|\|p\.kitDiscount/);
 assert.match(run,/optimizerExecuteApproved\(false\)/);
});
