import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const html=readFileSync(new URL('../public/index.html',import.meta.url),'utf8');
const js=readFileSync(new URL('../public/app.js',import.meta.url),'utf8');
const css=readFileSync(new URL('../public/optimizer-execution-progress.css',import.meta.url),'utf8');
test('CTA real aparece dentro do cartão de progresso de SKU preparada',()=>{
 const card=html.slice(html.indexOf('class="optimizer-exec-progress-card"'),html.indexOf('id="optimizerExecutionIssue"'));
 assert.match(card,/id="optimizerExecutionNextActionTitle"/);
 assert.match(card,/id="optimizerExecutionNextActionDescription"/);
 assert.match(card,/id="optimizerExecutionLaunch"/);
 assert(card.indexOf('id="optimizerExecutionLaunch"')<card.indexOf('id="optimizerExecutionBar"'));
 assert(!html.slice(html.indexOf('id="optimizerExecutionTracker"'),html.indexOf('class="optimizer-exec-product"')).includes('id="optimizerExecutionLaunch"'));
 assert.match(css,/optimizer-exec-resume-bar\[hidden\]/);
});
test('sem autorização a barra diz o motivo e não chama API automaticamente',()=>{
 assert.match(js,/0% significa aguardando sua autorização/);
 assert.match(js,/Falta conferir o desconto da etapa 08/);
 assert.match(js,/Execução bloqueada — corrigir pendências/);
 assert.match(js,/resumeBar\.hidden=!\['prepared','blocked'\]\.includes\(progress\.state\)/);
 assert.match(js,/optimizerExecutionLaunch'\)\?\.addEventListener\?\.\('click'/);
 assert.match(js,/optimizerResolveExecutionBlockers/);
 assert.match(js,/optimizerSaveChecklistReview/);
 assert.match(js,/if\(optimizerExecPlan\?\.canExecute&&optimizerDiscountReviewedForExecution\(optimizerExecPlan\)\)/);
 assert.match(js,/void optimizerExecuteApproved\(false\)/);
 assert.match(js,/confirmati[oó]n:'EXECUTAR '\+p\.sku/);
});

test('Motor Matriz: 0% preparado sempre possui ação recuperável dentro da barra',()=>{
 const area=html.slice(html.indexOf('class="optimizer-exec-progress-card"'),html.indexOf('id="optimizerExecutionIssue"'));
 for(const id of ['optimizerExecutionRecoverStart','optimizerExecutionSwitchFull','optimizerExecutionLaunch'])
  assert.match(area,new RegExp('id="'+id+'"'));
 assert.match(js,/optimizerExecutionVisibleCommands\(progress,job\)/);
 assert.match(js,/optimizerExecutionRecoverStart'\)\?\.addEventListener/);
 assert.match(js,/optimizerExecutionSwitchFull'\)\?\.addEventListener/);
 assert.match(js,/\$\('#optimizerExecutionScope'\)\.value='all'/);
 assert.match(html,/optimizer-exec-resume-bar\[hidden\]/);
 assert.doesNotMatch(html,/optimizer-exec-resume-bar:not\(:has/);
});
test('Motor Matriz: troca de SKU não herda execução parcial, escopo fica explícito',()=>{
 assert.match(js,/optimizerExecScopeOwner!==scopeIdentity/);
 assert.match(js,/optimizerExecScopeOwner=scopeIdentity/);
 assert.match(js,/nextTitle\.textContent='Prévia PARCIAL: '\+mode/);
 assert.match(js,/NÃO constam nesta prévia/);
 assert.match(js,/optimizerExecPrepareError=String\(e\.message\|\|e\)/);
 assert.match(js,/Não foi possível preparar/);
});

test('ficha técnica revisada com draft salvo não desaparece silenciosamente da prévia',()=>{
 const server=readFileSync(new URL('../server.js',import.meta.url),'utf8');
 assert.match(server,/function approvedTechnicalDraftChanges\(/);
 assert.match(server,/reviewState\._technicalRecoveredFromApprovedDraft=true/);
 assert.match(server,/reviewState\.attributes=classified\.valid/);
 assert.match(server,/Ficha técnica aprovada sem atributos elegíveis para envio/);
 assert.match(server,/approvedTechnicalDraftChanges\(source\)/);
 assert.match(server,/technicalDraft\.fields\.length/);
 assert.match(server,/draftTime|draft\?\.updatedAt|Date\.parse\(String\(draft\?\.updatedAt/);
});
test('envio mídia economiza transferências, mantém confirmação durável e impede duplicidade',()=>{
 const video=readFileSync(new URL('../shopeeManualVideo.js',import.meta.url),'utf8');
 const server=readFileSync(new URL('../server.js',import.meta.url),'utf8');
 const worker=readFileSync(new URL('../shopeeExecutionWorker.js',import.meta.url),'utf8');
 assert.match(video,/verifiedVideoDownloads=new Map\(\)/);
 assert.match(video,/asset\.storage_path,asset\.sha256,asset\.size_bytes/);
 assert.match(video,/crypto\.createHash\('sha256'\)/);
 assert.match(server,/await checkpointShopeeExecution\(job,out\.result,out\.delay\)/);
 assert.match(server,/setTimeout\(\(\)=>void runOptimizerJobs\(\)/);
 assert.match(worker,/result\.imageIds/);
});

test('técnica aprovada e não publicada mostra correção isolada sem repetir a mídia',()=>{
 assert.match(html,/id="optimizerExecutionTechnicalPending"/);
 assert.match(html,/id="optimizerExecutionTechnicalOnly"/);
 assert.match(js,/const technicalPending=Boolean\(verified&&technicalReviewed/);
 assert.match(js,/optimizerExecutionTechnicalOnly'\)\?\.addEventListener/);
 assert.match(js,/\$\('#optimizerExecutionScope'\)\.value='technical'/);
 assert.match(js,/Nenhuma imagem, vídeo, variação ou desconto será reenviado/);
});
