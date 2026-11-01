import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const builder=readFileSync(new URL('../public/kit-builder.js',import.meta.url),'utf8');
const html=readFileSync(new URL('../public/index.html',import.meta.url),'utf8');

test('editar detalhes de uma SKU nao invalida um rascunho de kit ja salvo',()=>{
 const start=builder.indexOf('const refresh=(edited=false)=>{');
 const end=builder.indexOf("box.addEventListener('input',()=>refresh(true));",start);
 assert.ok(start>=0&&end>start,'handler de edicao por SKU deve existir');
 const edit=builder.slice(start,end);
 assert.match(edit,/if\(edited\)\{[\s\S]*?clearKitPublishApproval\(\);[\s\S]*?kitPersistSkuFacts\(\);/);
 assert.doesNotMatch(edit,/kitSaved\s*=\s*false/,'rascunho ja salvo nao deve ser bloqueado por dados por SKU');
});

test('a referencia em memoria so avanca apos confirmacao do salvamento por SKU',()=>{
 const start=builder.indexOf('function kitPersistSkuFacts(){');
 const end=builder.indexOf('let kitContentSku=',start);
 assert.ok(start>=0&&end>start);
 const save=builder.slice(start,end);
 assert.match(save,/await api\('\/api\/shopee\/kits\/drafts\/manual-facts'/);
 assert.match(save,/if\(prepared\?\.kit\?\.kitSku===kitSku&&serial===kitFactsSaveSerial\)/);
 assert.match(save,/prepared\.creative=\{\.\.\.prepared\.creative,manualFacts:\{\.\.\.reply\.manualFacts\}\}/);
});

test('etapa 05 usa editor original sem depender da preparacao comercial do kit',()=>{
 const existing=readFileSync(new URL('../public/kit-existing-optimization.js',import.meta.url),'utf8');
 const app=readFileSync(new URL('../public/app.js',import.meta.url),'utf8');
 const server=readFileSync(new URL('../server.js',import.meta.url),'utf8');
 assert.match(builder,/globalThis\.RAKitOpenTechnicalEditor\?\.\(\{kitSku:prepared\.kit\.kitSku,sku\}\)/);
 assert.match(builder,/const factsChanged=\[\.\.\.allowed\]\.some/);
 assert.match(builder,/if\(factsChanged\)\{/);
 assert.match(builder,/const open=kitExistingOptimizer\.openTechnical/);
 assert.doesNotMatch(builder.slice(builder.indexOf('async function kitWizardRequestTechnical'),builder.indexOf('globalThis.RAKitTechnicalRequested=')),/button\.click\(\)/);
 assert.match(builder,/if\(advanced\.parentElement!==mount\)mount\.append\(advanced\)/);
 assert.match(existing,/async function openTechnical\(\)/);
 assert.match(existing,/technicalOnly:true/);
 assert.match(existing,/return \{restore,openTechnical,openDiscount\}/);
 assert.match(app,/technicalOnly=matchedTarget&&kitHandoff\?\.technicalOnly===true/);
 assert.match(app,/optimizerWorkflowOpen\('technical'\)/);
 assert.match(app,/RAKitTechnicalLoadReady\?\.\(/);
 assert.match(server,/const requestedKitSku=String\(req\.query\.kit_sku\|\|''\)\.trim\(\)/);
 assert.match(server,/requestedDraft\.creative\?\.manualFacts\?\.\[sku\]/);
 assert.match(html,/kit-builder\.js\?v=20261101-(?:sku-facts-save-feedback-v\d+|bridge-capture-recovery-v\d+|seo-canonical-recovery-v\d+)/);
});
