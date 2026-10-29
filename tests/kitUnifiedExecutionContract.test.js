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
test('painel simplificado mostra apenas complementos e nunca refaz conteudos',()=>{
 const css=source('public/kit-builder.css');
 assert.match(app,/const actionable=kitMode\?visible\.filter/);
 assert.match(app,/\['video','technical','fiscal'\]/);
 assert.match(app,/if\(!kitMode\)\{/);
 assert.match(app,/RAKitWorkflowSyncReview/);
 assert.match(existing,/imageSyncAttempts/);
 assert.match(existing,/stage:'images',reviewed:true/);
 assert.match(server,/validateReview\(\{stage:'seo',reviewed:true,title:link\.title\}\)/);
 assert.match(server,/validateReview\(\{stage:'description',reviewed:true,description:link\.description\}\)/);
 assert.match(html,/id="kitWorkflowDiscountLater"/);
 assert.match(css,/\.kit-reuse-summary/);
});
