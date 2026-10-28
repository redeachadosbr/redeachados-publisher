import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
const html=fs.readFileSync(new URL('../public/index.html',import.meta.url),'utf8');
const js=fs.readFileSync(new URL('../public/kit-builder.js',import.meta.url),'utf8');
const css=fs.readFileSync(new URL('../public/kit-builder.css',import.meta.url),'utf8');
test('exibe motivo de atualização vencida e ações ligadas à importação WeDrop',()=>{
 const guide=html.indexOf('id="kitPublishGuide"');
 const recovery=html.indexOf('id="kitPublishFreshness"');
 const logistics=html.indexOf('id="kitPublishFields"',guide);
 assert.ok(guide>0&&recovery>guide&&logistics>recovery);
 for(const id of ['kitPublishFreshness','kitPublishFreshnessReason','kitPublishGoImport','kitPublishRevalidate'])
  assert.equal((html.match(new RegExp('id="'+id+'"','g'))||[]).length,1,id);
 assert.match(js,/stock\?\.reason\|\|'Atualização da WeDrop ainda não confirmada/);
 assert.match(js,/kitDateTime\(stock\?\.catalogLastImportedAt\)/);
 assert.match(js,/kitDateTime\(stock\?\.lastSuccessAt\)/);
 assert.match(js,/setKitMode\('import',\{scroll:true\}\)/);
 assert.match(css,/kit-publish-freshness\[hidden\]/);
});
test('recálculo exige confirmação e mantém kit, SKUs, textos, fotos e vídeo',()=>{
 const start=js.indexOf('async function kitRevalidateAfterImport(){');
 const end=js.indexOf('function kitPublishGuideNotice(',start);
 assert.ok(start>=0&&end>start);
 const flow=js.slice(start,end);
 for(const key of ['await categories(true)','!kitStockReady','!kitSaved',
  'kitPublishGuideNotice','/api/shopee/kits/drafts/load','review.refreshedCosts',
  'window.confirm','await saveDraft()','kitDraftNeedsRefresh=false',
  'refreshKitPrices(latest.kit)','clearKitPublishApproval()'])assert.ok(flow.includes(key),key);
 assert.doesNotMatch(flow,/images\.clear\(\)|kitVideoData=null|kitVideoStore\.remove|kitPublishExecute\(\)/);
 assert.match(flow,/prepared=\{\.\.\.prepared,kit:latest\.kit\}/);
 assert.match(js,/if\(kitDraftNeedsRefresh\|\|!kitStockReady\)/);
 assert.match(js,/kitStockLastCheck\?\.reason/);
});
test('sem estoque atual o fluxo não envia mídia nem solicita publicação',()=>{
 const routine=js.slice(js.indexOf('async function kitPublishGuideNext(){'),js.indexOf('async function kitPublishExecute(){'));
 assert.ok(routine.indexOf('if(kitDraftNeedsRefresh||!kitStockReady)')>=0);
 assert.ok(routine.indexOf('kitStockReady?')<routine.indexOf('kitSendPhotos()'));
 assert.doesNotMatch(routine,/kitPublishExecute\(\)|\/publish\/execute/);
});
