import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
const source=path=>fs.readFileSync(new URL('../'+path,import.meta.url),'utf8');
const app=source('public/app.js'),html=source('public/index.html');
const server=source('server.js'),existing=source('public/kit-existing-optimization.js');
test('kit usa a etapa 08 do otimizador real com desconto proprio',()=>{
 assert.match(html,/id="kitOptimizerWorkspace"/);
 assert.match(html,/Etapa 08 · Desconto do kit/);
 assert.match(app,/function kitOptimizerDiscountMount\(/);
 assert.match(app,/review\.append\(specific\)/);
 assert.match(app,/RAKitOpenDiscountReview/);
});
test('kit preserva autorizacao e nao utiliza token de promocao de SKU simples',()=>{
 assert.match(app,/typeof optimizerKitWorkflowActive==='function'/);
 assert.match(app,/optimizerDiscountApprovalReady\(\)/);
 assert.match(app,/discountApprovalToken:p\.modelVariations/);
 assert.match(server,/\['all','remaining'\]\.includes\(plan\.selectedStage\)&&!linkedKit/);
});
test('promocao do kit possui previa e confirmacao independentes',()=>{
 assert.match(existing,/\/api\/shopee\/kits\/discount\/preview/);
 assert.match(existing,/\/api\/shopee\/kits\/discount\/execute/);
 assert.match(existing,/RAKitDiscountConfirmed/);
 assert.match(app,/kitOptimizerDiscountConfirmedIdentity/);
});

test('painel do kit vem logo apos composicao e antes de titulo e galeria',()=>{
 const c=html.indexOf('class="kit-detail-facts"');
 const o=html.indexOf('id="kitOptimizeExistingPanel"');
 const t=html.indexOf('class="kit-copy-grid"');
 const g=html.indexOf('id="kitGallerySection"');
 assert(c>=0&&c<o&&o<t&&t<g);
 assert.equal(html.split('id="kitOptimizeExistingPanel"').length-1,1);
 assert.equal(html.split('id="kitOptimizerWorkspace"').length-1,1);
});
test('oito etapas visiveis sem duplicar geracao de conteudos prontos',()=>{
 assert.match(app,/for\(const \[i,stage\] of visible\.entries\(\)\)/);
 assert.match(app,/const total=visible\.length\+1/);
 assert.match(app,/discountCard\.onclick=\(\)=>optimizerDiscountOpenReview\(\)/);
 assert.match(app,/selector=\{images:'#kitGallerySection',seo:'#kitTitle',description:'#kitDescription'\}/);
 assert.match(existing,/imageSyncAttempts/);
 assert.match(existing,/stage:'images',reviewed:true/);
 assert.match(server,/validateReview\(\{stage:'seo',reviewed:true,title:link\.title\}\)/);
 assert.match(server,/validateReview\(\{stage:'description',reviewed:true,description:link\.description\}\)/);
});
test('oito etapas ocupam lugar da barra de acompanhamento substituta',()=>{
 const a=html.indexOf('id="kitOptimizeStart"');
 const b=html.indexOf('id="kitOptimizerWorkspace"');
 const c=html.indexOf('id="kitOptimizeAdvanced"');
 assert(a>=0&&a<b&&b<c);
 assert.doesNotMatch(html,/id="kitOptimizeJourney"|id="kitOptimizeLiveProgress"|id="kitOptimizeStageSteps"/);
 assert.equal(html.split('id="kitOptimizerWorkspace"').length-1,1);
});
test('acompanhamento tecnico original permanece abaixo das oito etapas',()=>{
 const cards=html.indexOf('id="optimizerWorkflowCards"');
 const exec=html.indexOf('id="optimizerExecutionPanel"');
 const tracker=html.indexOf('id="optimizerExecutionTracker"');
 const editor=html.indexOf('id="optimizerWorkflowEditor"');
 assert(cards>=0&&cards<exec&&exec<tracker&&tracker<editor);
 assert.match(html,/Acompanhamento da execução/);
 assert.match(html,/id="optimizerExecutionPercent"/);
 assert.match(html,/id="optimizerExecutionNextActionTitle"/);
 assert.match(html,/id="optimizerExecutionEvents"/);
 assert.match(app,/function optimizerExecutionTrackerRender\(progress,job\)/);
});
