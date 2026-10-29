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
 assert.match(app,/else optimizerDiscountOpenReview\(\)/);
});
test('kit preserva autorizacao e nao utiliza token de promocao de SKU simples',()=>{
 assert.match(app,/if\(optimizerKitWorkflowActive\(\)\)return true;/);
 assert.match(app,/!optimizerKitWorkflowActive\(\)&&optimizerDiscountApprovalReady\(\)/);
 assert.match(app,/\['all','remaining'\]\.includes\(p\.selectedStage\)&&!optimizerKitWorkflowActive\(\)/);
 assert.match(server,/\['all','remaining'\]\.includes\(plan\.selectedStage\)&&!linkedKit/);
});
test('promocao do kit possui previa e confirmacao independentes',()=>{
 assert.match(existing,/\/api\/shopee\/kits\/discount\/preview/);
 assert.match(existing,/\/api\/shopee\/kits\/discount\/execute/);
 assert.match(existing,/RAKitDiscountConfirmed/);
 assert.match(app,/kitOptimizerDiscountConfirmedIdentity/);
});
