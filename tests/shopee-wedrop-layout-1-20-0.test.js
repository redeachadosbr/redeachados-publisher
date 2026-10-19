import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const html=readFileSync(new URL('../public/index.html',import.meta.url),'utf8');
const js=readFileSync(new URL('../public/app.js',import.meta.url),'utf8');
const css=readFileSync(new URL('../public/style.css',import.meta.url),'utf8');
const server=readFileSync(new URL('../server.js',import.meta.url),'utf8');
const section=html.slice(html.indexOf('id="tab-wedrop"'),html.indexOf('id="tab-finance"'));
test('Fornecedor WeDrop 1.20.0 mantém os cinco indicadores e quatro setores visíveis',()=>{
 const ids=['wedropCompared','wedropPendingModels','wedropImported','wedropMatched','wedropMissingCost',
  'wedropGotoPending','wedropRefreshBtn','wedropReviewCount','wedropReviewSummary',
  'wedropReviewMessage','wedropReviewCards','wedropReviewedLinks','wedropReviewedCount',
  'wedropReviewedList','wedropReviewOverall','wedropReviewRefreshBtn',
  'wedropStoredCatalog','wedropStoredName','wedropStoredSummary','wedropStoredBadge',
  'wedropUseStoredBtn','wedropMoveRefresh','wedropStoredCountDetail','wedropStoredLastSync',
  'wedropStoredLastCheck','wedropUploadDetails','wedropFile','wedropPreviewBtn',
  'wedropValidateBtn','wedropImportBtn','wedropSourceStatus','wedropCheckFeedBtn',
  'wedropSyncModelsBtn','wedropStopModelsBtn','wedropModelsStatus','wedropVariantsNotice',
  'wedropCoverageStatus','wedropNoCosts'];
 for(const id of ids)
  assert.equal((section.match(new RegExp('id="'+id+'"','g'))||[]).length,1,id);
 assert.equal((section.match(/class="wd-v2-metric wd-v2-/g)||[]).length,5);
 assert.match(section,/class="card sku-review-panel wd-v2-section wd-v2-review"/);
 assert.match(section,/class="card wedrop-panel wd-v2-section wd-v2-catalog"/);
 assert.match(section,/class="card wedrop-variants wd-v2-section wd-v2-variants"/);
 assert.match(section,/id="wedropStoredCatalog"[^>]*hidden/);
 assert.match(section,/id="wedropImportBtn" type="button" disabled/);
 assert.match(html,/style\.css\?v=1\.20\.[01]/);
 assert.match(html,/app\.js\?v=1\.20\.[01]/);
 assert.match(server,/version:'1\.20\.[01]'/);
});
test('WeDrop continua no Supabase com ações reais, sem substituir o fornecedor nem publicar preços',()=>{
 for(const route of ['/api/shopee/wedrop/auto/status','/api/shopee/wedrop/auto/import',
  '/api/shopee/wedrop/coverage','/api/shopee/wedrop/sku-review',
  '/api/shopee/wedrop/sku-link','/api/shopee/wedrop/sku-unlink',
  '/api/shopee/wedrop/models/pending','/api/shopee/wedrop/models/sync']){
  assert.ok(server.includes(route),'Missing '+route);
 }
 assert.match(js,/status\.catalogStored===true&&Number\(status\.storedCosts\)>0/);
 assert.match(js,/const costsAvailable=data\.hasImportedCosts===true/);
 assert.match(js,/const clear=total===0&&extra===0&&Number\(data\.summary\?\.compared\|\|0\)>0/);
 assert.match(js,/wdNum\(t\.matched\)/);
 assert.match(js,/wdNum\(t\.missingCost\)/);
 assert.match(js,/wdNum\(status\.storedCosts\)/);
 assert.ok(js.includes("$('#wedropMoveRefresh')"));
 assert.ok(js.includes("await $('#wedropUseStoredBtn').onclick()"));
 assert.match(js,/function reviewCandidateControl/);
 assert.match(js,/function refreshWeDropCoverage/);
 assert.match(js,/function loadWeDropSkuReview/);
 assert.match(js,/function loadWeDropSourceState/);
 assert.match(js,/classList\?\.toggle\?\.\('view-wedrop',name==='wedrop'\)/);
});
test('Novo layout é compacto, mostra ajuda e adapta as cinco métricas para celular',()=>{
 assert.match(css,/body\.view-wedrop \.workspace-content/);
 assert.match(css,/#tab-wedrop \.wd-v2-metrics\{display:grid;grid-template-columns:repeat\(5,minmax\(0,1fr\)\)/);
 assert.match(css,/#tab-wedrop \.wd-v2-section/);
 assert.match(css,/#tab-wedrop \.wd-v2-head-actions/);
 assert.match(css,/@media\(max-width:700px\)/);
 assert.match(section,/data-help="[^"]*"/);
 assert.match(section,/Vínculos de custo confirmados manualmente/);
 assert.ok(section.indexOf('id="wedropStoredCatalog"')<section.indexOf('id="wedropFile"'));
});
