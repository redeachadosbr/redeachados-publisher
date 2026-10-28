import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
const html=fs.readFileSync(new URL('../public/index.html',import.meta.url),'utf8');
const js=fs.readFileSync(new URL('../public/kit-builder.js',import.meta.url),'utf8');
const css=fs.readFileSync(new URL('../public/kit-builder.css',import.meta.url),'utf8');
test('assistente guiado fica dentro do Kit Formal e preserva etapa final manual',()=>{
 const kit=html.indexOf('id="kitPublishPanel"');
 const guide=html.indexOf('id="kitPublishGuide"',kit);
 const controls=html.indexOf('id="kitPublishCheck"',guide);
 const confirmation=html.indexOf('id="kitPublishExecute"',guide);
 assert.ok(kit>0&&guide>kit&&controls>guide&&confirmation>controls);
 for(const id of ['kitPublishGuide','kitPublishGuideInfo','kitPublishGuideNext'])
  assert.equal((html.match(new RegExp('id="'+id+'"','g'))||[]).length,1,id);
 assert.match(css,/#tab-kits #kitDetail \.kit-publish-guide/);
});
test('continuação guiada verifica em ordem as condições de segurança e mídia',()=>{
 assert.match(js,/async function kitPublishGuideNext\(\)/);
 const start=js.indexOf('async function kitPublishGuideNext(){');
 const end=js.indexOf('async function kitPublishExecute(){',start);
 assert.ok(end>start);
 const routine=js.slice(start,end);
 for(const snippet of ['saveDraft()','kitDraftNeedsRefresh','kitReadinessCheck()',
  "kitMainSku","kitLogisticId","kitContentsReviewed","kitPhotosReviewed",
  "kitSingleParcelConfirmed","images.size!==9","kitSendPhotos()",
  "kitVideoData","kitPreparePublishPreview()"])
  assert.ok(routine.includes(snippet),snippet);
 assert.ok(routine.indexOf('kitReadinessCheck()')<routine.indexOf('kitSendPhotos()'));
 assert.ok(routine.indexOf('kitSendPhotos()')<routine.indexOf('kitPreparePublishPreview()'));
 assert.doesNotMatch(routine,/kitPublishExecute\(\)|\/publish\/execute|callShopeeShopApi/);
 assert.match(js,/kitPublishGuideNext'\)\?\.addEventListener\('click'/);
});
test('envio de fotos e prévia ainda exigem validação; publicar exige confirmação',()=>{
 assert.match(js,/if\(!kitReadiness\|\|kitReadiness\.blockers\?\.length\)/);
 assert.match(js,/if\(!\$\('#kitPhotosReviewed'\)\.checked\)/);
 assert.match(js,/window\.confirm\('PUBLICAR NOVO KIT FORMAL NA SHOPEE\?/);
 assert.match(js,/token:kitPublishToken,confirm:true/);
});
