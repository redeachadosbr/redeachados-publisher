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
  'kit-hero','kit-overview','id="kitForm"','id="kitSuggestions"',
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
  'kitCatalogDate','kitStockSubhead','kitStockStamp','kitExpandResearch','kitCatalogBadge']){
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
