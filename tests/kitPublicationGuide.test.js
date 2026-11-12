import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
const html=fs.readFileSync(new URL('../public/index.html',import.meta.url),'utf8');
const js=fs.readFileSync(new URL('../public/kit-builder.js',import.meta.url),'utf8');
const css=fs.readFileSync(new URL('../public/kit-builder.css',import.meta.url),'utf8');
test('assistente guiado fica dentro do Kit Formal e preserva etapa final manual',()=>{
 const kit=html.indexOf('id="kitPublishPanel"');
 const guide=html.indexOf('id="kitPublishGuide"',kit);
 const controls=html.indexOf('id="kitPublishCheck"',kit);
 const confirmation=html.indexOf('id="kitPublishExecute"',guide);
 assert.ok(kit>0&&guide>kit&&controls>kit&&confirmation>controls);
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
 assert.match(js,/!\$\('#kitPhotosReviewed'\)\.checked\?/);
 assert.match(js,/window\.confirm\(\(commercial\?'CRIAR UM ANÚNCIO COMERCIAL NOVO/);
 assert.match(js,/PUBLICAR NOVO KIT FORMAL NA SHOPEE/);
 assert.match(js,/token:kitPublishToken,confirm:true/);
});


test('etapa 10 nao exibe o assistente de seis passos e usa o botao unico para anuncios novos',()=>{
 const audit=js.slice(js.indexOf('function kitWizardExecutionAudit(){'),
  js.indexOf('function kitWizardUpdateProgress(){'));
 assert.match(audit,/panel\.hidden=true/);
 assert.doesNotMatch(audit,/panel\.hidden=!newListing/);
 assert.match(js,/if\(kitWizardIsNewUnpublished\(\)\)\{[\s\S]*?await kitWizardExecuteNewListingDirect\(\)/);
 const direct=js.slice(js.indexOf('async function kitWizardExecuteNewListingDirect(){'),
  js.indexOf('async function kitDiscountPrepare(){'));
 assert.ok(direct.length>1500);
 for(const required of [
  'await kitReadinessCheck({throwOnError:true})',
  'await kitSendPhotos({throwOnError:true})',
  'await kitPreparePublishPreview({throwOnError:true})',
  "/api/shopee/kits/commercial/execute",
  'kitCurrentMain(prepared.kit)',
  'kitWizardChecked()',
  'kitShopeePhotoSlots.size!==9',
  'done.itemId',
  'oldQuote!==6',
  'previousMain!==principalForDraft',
  'await saveDraft()'
 ])assert.ok(direct.includes(required),required);
 assert.ok(direct.indexOf('await kitReadinessCheck({throwOnError:true})')<direct.indexOf('await kitSendPhotos({throwOnError:true})'));
 assert.ok(direct.indexOf('await kitSendPhotos({throwOnError:true})')<direct.indexOf('await kitPreparePublishPreview({throwOnError:true})'));
 assert.ok(direct.indexOf('await kitPreparePublishPreview({throwOnError:true})')<direct.indexOf("'/api/shopee/kits/commercial/execute'"));
 assert.doesNotMatch(direct,/kitPublishGuideNext\(\)/);
 assert.doesNotMatch(direct,/window\.confirm\(/);
 assert.match(js,/!kitWizardDirectPublishing&&[\s\S]*?!window\.confirm\('O vídeo/);
 assert.match(js,/!kitWizardDirectPublishing\)\s*setTimeout/);
});

test('fluxo direto revela erro real da prévia sem abrir assistente nem duplicar anúncio',()=>{
 const start=js.indexOf('async function kitPreparePublishPreview(');
 const end=js.indexOf('let kitPublishGuideBusy=',start);
 const preview=js.slice(start,end);
 const direct=js.slice(js.indexOf('async function kitWizardExecuteNewListingDirect(){'),
  js.indexOf('async function kitDiscountPrepare(){'));
 assert.match(preview,/if\(throwOnError\)throw error/);
 assert.match(preview,/Prévia bloqueada: /);
 assert.match(direct,/await kitPreparePublishPreview\(\{throwOnError:true\}\)/);
 assert.doesNotMatch(direct,/A Shopee não aprovou a prévia/);
 assert.match(direct,/progress\('Não concluído: '\+message/);
 assert.match(direct,/oldQuote!==6/);
 assert.match(direct,/principalForDraft=kitCurrentMain\(prepared.kit\)/);
 assert.match(direct,/refreshKitPrices\(prepared.kit\)/);
});
