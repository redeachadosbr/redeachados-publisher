import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
const html=fs.readFileSync(new URL('../public/index.html',import.meta.url),'utf8');
const js=fs.readFileSync(new URL('../public/kit-builder.js',import.meta.url),'utf8');
const css=fs.readFileSync(new URL('../public/kit-builder.css',import.meta.url),'utf8');
const start=html.indexOf('id="tab-kits"'),end=html.indexOf('id="tab-fiscal"',start);
const page=html.slice(start,end);
test('a nova página reproduz seções da referência na sequência correta',()=>{
 const markers=[
  'kit-mode-tabs','kit-overview','id="kitForm"','id="kitSuggestions"',
  'id="kitResearchDetails"','kit-drafts-panel','id="kitDetail"',
  'id="kitTitle"','id="kitDescription"','kit-chatgpt-strip',
  'id="kitImages"','id="kitPublishPanel"','kit-publish-steps'
 ];
 let offset=0;
 for(const marker of markers){
  const found=page.indexOf(marker,offset);
  assert.ok(found>=offset,'seção faltando ou fora de ordem: '+marker);
  offset=found+marker.length;
 }
});
test('cabeçalhos redundantes removidos e pesquisa avançada continua expansível',()=>{
 assert.doesNotMatch(page,/<header class="kit-hero">/);
 assert.doesNotMatch(page,/class="kit-bar kit-section-heading kit-suggestion-header"/);
 assert.doesNotMatch(page,/id="kitExpandResearch"/);
 assert.equal((page.match(/id="kitSource"/g)||[]).length,1);
 assert.match(page,/id="kitSource" hidden/);
 assert.match(page,/<details[^>]*id="kitResearchDetails"/);
 assert.match(page,/class="kit-research-summary-action">Expandir pesquisa de combinações/);
 assert.match(page,/id="kitSuggestions"/);
 assert.match(page,/id="kitDraftList"/);
});
test('IDs funcionais existentes permanecem únicos e vinculados à interface',()=>{
 const ids=[
  'kitCategory','kitSize','kitMargin','kitMarginLabel','kitMarginPlus','kitMarginMinus',
  'kitPacking','kitShipping','kitSuggest','kitStockGate','kitStockImport','kitStockReload',
  'kitPlusResearch','kitPlusImport','kitResearchPrompt','kitPlusOutput',
  'kitSuggestions','kitRefreshDrafts','kitDraftList','kitDetail','kitTitle','kitDescription',
  'kitTitleCount','kitDescriptionCount','kitPlusText','kitContentPrompt','kitImportText',
  'kitGenerateAll','kitCopyAllPrompts','kitSaveDraft','kitDownloadPack',
  'kitImages','kitPublishCheck','kitSendPhotos','kitPublishPreview','kitPublishExecute',
  'kitVerifyPublished','kitDiscountPreview','kitDiscountExecute'
 ];
 for(const id of ids){
  assert.equal((page.match(new RegExp('id="'+id+'"','g'))||[]).length,1,id+' deve existir apenas uma vez');
 }
 assert.match(js,/updateKitOverview\(/);
 assert.match(js,/updateKitTextCounters\(/);
 assert.match(js,/kitOverviewFreight/);
 assert.match(js,/kitTitleCount/);
 assert.match(js,/kitDraftImages|kit-draft-images/);
 assert.match(js,/scheduleKitMarginReprice\(/);
 assert.match(js,/renderSuggestions\(/);
 assert.match(js,/loadDrafts\(/);
 assert.match(js,/kitPreparePublishPreview\(/);
 assert.match(js,/kitDiscountApply\(/);
 assert.match(js,/kitStockReady/);
});
test('cards são derivados da API, sem produtos, margens ou preços inventados',()=>{
 assert.match(js,/suggestions=data\.results\|\|\[\]/);
 assert.match(js,/kit\.components\.forEach/);
 assert.match(js,/money\(kit\.componentCost\)/);
 assert.match(js,/money\(kit\.quote\.grossPrice\)/);
 assert.match(js,/money\(kit\.quote\.marketplacePrice\)/);
 assert.match(js,/money\(kit\.quote\.netProfit\)/);
 assert.match(js,/pct\(kit\.quote\.netMarginPct\)/);
 assert.match(js,/kit\.stockStatus|kitStockReady/);
 assert.doesNotMatch(js,/api\.openai\.com/);
});
test('layout responsivo contém cartões, nove imagens, configuração e publicação',()=>{
 assert.match(css,/kit-overview\{display:grid;grid-template-columns:repeat\(4/);
 assert.match(css,/kit-suggestions\{display:grid;grid-template-columns:repeat\(3/);
 assert.match(css,/kit-images\{grid-template-columns:repeat\(9/);
 assert.match(css,/kit-publish-steps\{grid-template-columns:repeat\(6/);
 assert.match(css,/@media\(max-width:500px\)/);
 assert.match(css,/kit-draft-metrics/);
 assert.match(css,/kit-margin-bubble/);
 assert.match(page,/id="kitSingleParcelConfirmed"/);
 assert.match(page,/id="kitStockCsv"/);
});

test('importação WeDrop do modelo contém dois cartões, aviso de bloqueio e seleção de arquivos válidos',()=>{
 const catalog=page.indexOf('id="kitCatalogCard"'),stock=page.indexOf('id="kitAvailabilityCard"');
 const gate=page.indexOf('id="kitStockGate"'),blocked=page.indexOf('id="kitStockBlocked"');
 const form=page.indexOf('id="kitForm"'),suggestions=page.indexOf('id="kitSuggestions"');
 assert.ok(gate>=0&&catalog>gate&&stock>catalog&&blocked>stock&&form>blocked&&suggestions>form);
 for(const id of ['kitCatalogFile','kitCatalogImport','kitStockCsv','kitStockImport',
  'kitCatalogDate','kitStockSubhead','kitStockStamp','kitResearchDetails','kitCatalogBadge']){
  assert.equal((page.match(new RegExp('id="'+id+'"','g'))||[]).length,1);
 }
 assert.match(page,/id="kitCatalogFile"[^>]*accept="[^"]*\.csv,\.xlsx,\.xls/);
 assert.match(page,/id="kitStockCsv"[^>]*accept="[^"]*\.csv,\.xlsx,\.xls/);
 assert.match(js,/async function readKitImportFile\(file,purpose\)/);
 assert.match(js,/async function importKitCatalogFile\(/);
 assert.match(js,/async function importKitStockCsv\(/);
 assert.match(js,/\/api\/shopee\/wedrop\/auto\/import/);
 assert.match(js,/\/api\/shopee\/kits\/availability\/import/);
 assert.match(js,/kit-stock-blocked/);
 assert.match(css,/kit-stock-gate\{display:grid;grid-template-columns:repeat\(2/);
 assert.match(css,/kit-blocked-banner/);
 assert.match(css,/kit-empty-drafts/);
});

test('duas telas: importação isolada e montagem completa preservada mesmo sem estoque',()=>{
 const importTab=page.indexOf('id="kitModeImport"'),builderTab=page.indexOf('id="kitModeBuilder"');
 const importStart=page.indexOf('id="kitViewImport"'),builderStart=page.indexOf('id="kitViewBuilder"');
 const catalog=page.indexOf('id="kitCatalogCard"');
 const stock=page.indexOf('id="kitAvailabilityCard"'),blocked=page.indexOf('id="kitStockBlocked"');
 const overview=page.indexOf('class="kit-overview"'),form=page.indexOf('id="kitForm"');
 const candidates=page.indexOf('id="kitSuggestions"'),drafts=page.indexOf('id="kitDraftList"');
 const images=page.indexOf('id="kitImages"'),publish=page.indexOf('id="kitPublishPanel"');
 assert.ok(importTab>=0&&builderTab>=0&&builderTab<importStart);
 assert.ok(importStart<catalog&&catalog<stock&&stock<blocked&&blocked<builderStart);
 assert.ok(builderStart<overview&&overview<form&&form<candidates&&candidates<drafts&&drafts<images&&images<publish);
 for(const id of ['kitModeImport','kitModeBuilder','kitViewImport','kitViewBuilder',
  'kitBuilderStockNotice','kitGoImport','kitGoBuilder']){
  assert.equal((page.match(new RegExp('id="'+id+'"','g'))||[]).length,1,id);
 }
 assert.match(page,/id="kitViewImport"[^>]*hidden/);
 assert.match(page,/id="kitViewBuilder"/);
 assert.match(js,/function setKitMode\(next/);
 assert.match(js,/setKitMode\('builder'/);
 assert.match(js,/setKitMode\('import'/);
 assert.match(js,/\$\('#kitViewImport'\)\.hidden=next!=='import'/);
 assert.match(js,/\$\('#kitViewBuilder'\)\.hidden=next!=='builder'/);
 assert.match(js,/\$\('#kitBuilderStockNotice'\)\.hidden=kitStockReady/);
 const gate=js.slice(js.indexOf('function displayKitStockGate('),js.indexOf('function kitUploadFeedback(',js.indexOf('function displayKitStockGate(')));
 assert.doesNotMatch(gate,/prepared=null/);
 assert.doesNotMatch(gate,/images\.clear\(/);
 assert.doesNotMatch(gate,/kitDetail'\)\.hidden=true/);
 assert.match(gate,/disabled=!kitStockReady/);
 assert.match(css,/kit-view-pane\[hidden\]\{display:none!important\}/);
 assert.doesNotMatch(css,/kit-stock-blocked \.kit-overview.*display:none/);
 assert.doesNotMatch(css,/kit-stock-blocked #kitSuggestions\{display:none\}/);
});

test('importação única CSV/Excel com dois cartões de status e mapeamento explícito de custo',()=>{
 const ids=['kitUnifiedFile','kitUnifiedImport','kitUnifiedStatus',
  'kitCostMappingPanel','kitCostColumn','kitCostConfirm','kitCostMappingApply'];
 for(const id of ids)assert.equal((page.match(new RegExp('id="'+id+'"','g'))||[]).length,1,id);
 assert.match(page,/id="kitUnifiedFile"[^>]*accept="[^"]*\.csv,\.xlsx,\.xls/);
 assert.ok(page.indexOf('id="kitUnifiedFile"')<page.indexOf('id="kitCatalogCard"'));
 assert.match(css,/#tab-kits #kitCatalogCard \.kit-import-card-actions,#tab-kits #kitAvailabilityCard \.kit-import-card-actions\{display:none!important\}/);
 assert.match(js,/async function analyzeAndImportWeDrop/);
 assert.match(js,/async function confirmKitMappedCost/);
 assert.match(js,/\/api\/shopee\/kits\/import\/inspect/);
 assert.match(js,/\/api\/shopee\/wedrop\/validate/);
 assert.match(js,/\/api\/shopee\/wedrop\/auto\/import/);
 assert.match(js,/\/api\/shopee\/kits\/availability\/import/);
 assert.match(js,/if\(!window\.confirm\('CONFIRMAR IMPORTAÇÃO DOS CUSTOS UNITÁRIOS WEDROP/);
 assert.match(js,/stockFresh\?\s*'Estoque WeDrop importado'/);
 assert.match(js,/!catalogFresh\?'Atualização do catálogo pendente para novos kits e publicação\.'/);
});

test('layout compacto da imagem, isolado ao resumo e ao formulário de kits',()=>{
 const page=html.slice(html.indexOf('id="tab-kits"'),html.indexOf('id="tab-fiscal"',html.indexOf('id="tab-kits"')));
 for(const cls of ['kit-category-field','kit-idea-field','kit-size-field','kit-packing-field','kit-shipping-field','kit-config-tip','kit-input-shell','kit-chat-mark','kit-search-arrow']){
  assert.ok(page.includes(cls),'Classe de interface ausente: '+cls);
 }
 for(const id of ['kitOverviewCategory','kitOverviewSize','kitOverviewMargin','kitOverviewFreight','kitCategory','kitIdea','kitSize','kitMargin','kitMarginLabel','kitMarginPlus','kitMarginMinus','kitPacking','kitShipping','kitSuggest']){
  assert.equal((page.match(new RegExp('id="'+id+'"','g'))||[]).length,1,id+' deve continuar vinculado');
 }
 assert.match(css,/#tab-kits #kitForm\.kit-form\{/);
 assert.match(css,/grid-template-columns:repeat\(12,minmax\(0,1fr\)\)/);
 assert.match(css,/#tab-kits #kitViewBuilder \.kit-overview\{/);
 assert.match(css,/#tab-kits #kitForm #kitSuggest\{/);
 assert.match(css,/@media\(max-width:720px\)/);
 assert.match(html,/kit-builder\.css\?v=[^"\s]+/);
});

test('editor do rascunho exibe fotos e indicadores do próprio kit e controles existentes',()=>{
 const section=page.slice(page.indexOf('id="kitDetail"'),page.indexOf('id="kitPublishPanel"',page.indexOf('id="kitDetail"')));
 for(const id of ['kitEditorProductPhotos','kitEditorCost','kitEditorGross','kitEditorDiscount','kitEditorMargin','kitClose','kitManualComposition','kitManualStatus','kitTitle','kitDescription','kitCopyTitle','kitCopyDescription','kitGenerateAll','kitImportImages','kitCopyAllPrompts']){
  assert.equal((section.match(new RegExp('id="'+id+'"','g'))||[]).length,1,id+' deve existir no editor');
 }
 assert.match(css,/#tab-kits #kitDetail\.kit-editor-reference/);
 assert.match(css,/#tab-kits #kitDetail \.kit-editor-summary/);
 assert.match(css,/#tab-kits #kitDetail \.kit-manual-composition/);
 assert.match(js,/function refreshKitEditorOverview\(kit\)/);
 assert.match(js,/refreshKitEditorOverview\(kit\);/);
 assert.match(js,/\$\('#kitImportImages'\)\?\.addEventListener\('click'/);
 assert.match(js,/\/api\/shopee\/kits\/modify/);
 assert.match(html,/kit-builder\.css\?v=[^"\s]+/);
});

test('contêiner externo da composição não reduz a largura dos dois cartões',()=>{
 assert.match(css,/#tab-kits #kitDetail #kitManualComposition\{[\s\S]*?display:block/);
 assert.match(css,/#tab-kits #kitDetail #kitManualComposition>\.kit-manual-composition\{[\s\S]*?grid-template-columns:repeat\(2,minmax\(0,1fr\)\)/);
});

test('galeria compacta premium é isolada no editor de kits e mantém nove posições',()=>{
 for(const id of ['kitGallerySection','kitGalleryCount','kitImages','kitGalleryViewAll',
  'kitGalleryOrganize','kitGalleryPreview','kitGalleryClosePreview','kitGalleryPreviewImages']){
  assert.equal((page.match(new RegExp('id="'+id+'"','g'))||[]).length,1,id);
 }
 assert.match(page,/class="kit-gallery-section"/);
 assert.match(page,/id="kitGallerySection"[^>]*aria-label=/);
 assert.match(css,/#tab-kits #kitDetail #kitImages\.kit-images\{/);
 assert.match(css,/grid-template-columns:repeat\(5,minmax\(0,1fr\)\)/);
 assert.match(css,/#tab-kits #kitDetail #kitGallerySection/);
 assert.match(css,/@media\(max-width:660px\)/);
 assert.match(page,/kit-builder\.css\?v=3\.5\.0-kit-gallery-compact/);
 assert.match(page,/kit-builder\.js\?v=3\.5\.0-kit-gallery-compact/);
});
test('cada ação do cartão continua funcional e visualização e organização têm eventos reais',()=>{
 assert.match(js,/for\(let slot=1;slot<=9;slot\+\+\)/);
 assert.match(js,/kitImageDragStart\(event,slot\)/);
 assert.match(js,/kitImageDrop\(event,slot\)/);
 assert.match(js,/kitRepositionImage\(slot,slot-1\)/);
 assert.match(js,/kitRepositionImage\(slot,slot\+1\)/);
 assert.match(js,/kitPhotoStore\.remove\(kitSku,slot\)/);
 assert.match(js,/kitInvalidatePhotoPositions\(\[slot\]\)/);
 assert.match(js,/kitGalleryViewAll'\)\?\.addEventListener\('click'/);
 assert.match(js,/kitGalleryOrganize'\)\?\.addEventListener\('click'/);
 assert.match(js,/openKitGalleryPreview\(slot\)/);
 assert.match(js,/kitGalleryPreview'\)\?\.addEventListener\('click'/);
 assert.match(js,/downloadData\(images\.get\(slot\)/);
 assert.match(js,/copy\(kitImagePromptAt\(slot\)\)/);
 assert.match(js,/kitGeneratePaidImages\(\{singleSlot:slot\}\)/);
 assert.match(js,/uploadPhoto\(slot,chooser\.files\?\.\[0\]\)/);
 for(const id of ['kitCopyAllPrompts','kitSaveDraft','kitDownloadPack'])
  assert.equal((page.match(new RegExp('id="'+id+'"','g'))||[]).length,1);
 assert.match(js,/kit-gallery-tips/);
});
