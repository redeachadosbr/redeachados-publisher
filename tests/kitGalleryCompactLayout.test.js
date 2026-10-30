import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const css=readFileSync(new URL('../public/kit-builder.css',import.meta.url),'utf8');
const html=readFileSync(new URL('../public/index.html',import.meta.url),'utf8');

test('kit gallery subtitle does not stretch the toolbar into a large empty region',()=>{
 assert.ok(css.includes('display:block;flex:0 0 auto;min-height:0;margin:0;'));
 assert.ok(css.includes('display:flex;align-items:center;flex-wrap:wrap;gap:8px;margin:0 0 10px;padding:0;min-height:0;'));
 assert.ok(html.includes('/kit-builder.css?v=3.6.1-gallery-no-gap'));
});

test('kit gallery keeps all photo slots and actions in the same section',()=>{
 for(const id of ['kitGallerySection','kitImages','kitGalleryCount','kitGalleryViewAll','kitGalleryOrganize',
  'kitCopyAllPrompts','kitSaveDraft','kitDownloadPack','kitImageStatus']){
  assert.equal((html.match(new RegExp('id="'+id+'"','g'))||[]).length,1,id);
 }
});

test('excluir foto já salva não depende de parar a Ponte ChatGPT em geração',()=>{
 const source=readFileSync(new URL('../public/kit-builder.js',import.meta.url),'utf8');
 const start=source.indexOf('async function kitDeleteGalleryPhoto(slot){');
 const end=source.indexOf('function renderImageSlots(){',start);
 assert.ok(start>=0&&end>start);
 const body=source.slice(start,end);
 assert.doesNotMatch(body,/kitAutoImageBusy\|\|kitGalleryImportBusy\|\|kitBridgeController\?\.activeJob\(\)/);
 assert.match(body,/await kitPhotoStore\.remove\(kitSku,slot\)/);
 assert.match(body,/await kitPhotoStore\.list\(kitSku\)/);
 assert.match(body,/images\.delete\(slot\)/);
 assert.match(body,/renderImageSlots\(\);kitAutoImageUi\(\)/);
 assert.match(body,/kitBridgeController\?\.activeJob\(\)\?'A Ponte continua gerando/);
});

test('image collapse groups generator plus all nine positions without deleting data',()=>{
 const ui=readFileSync(new URL('../public/kit-builder.js',import.meta.url),'utf8');
 const app=readFileSync(new URL('../public/app.js',import.meta.url),'utf8');
 const begin=html.indexOf('id="kitImagesContent"');
 const end=html.indexOf('</div>\n  <dialog id="kitGalleryPreview"',begin);
 assert.ok(begin>0&&end>begin);
 const group=html.slice(begin,end);
 for(const id of ['kitGenerateAll','kitStopExtension','kitResumeExtension','kitGallerySection',
  'kitImages','kitImageStatus','kitSaveDraft','kitImportImages']){
  assert.match(group,new RegExp('id="'+id+'"'));
  assert.equal(html.split('id="'+id+'"').length-1,1);
 }
 assert.match(html,/id="kitToggleImagesContent"[^>]*aria-controls="kitImagesContent"[^>]*aria-expanded="true"/);
 assert.match(ui,/function kitSetImagesCollapsed\(collapsed\)/);
 assert.match(ui,/kitSetImagesCollapsed\(!\$\('#kitImagesContent'\)\.hidden\)/);
 assert.match(css,/#tab-kits #kitDetail #kitImagesContent\[hidden\]\{display:none!important\}/);
 assert.match(app,/images:'#kitImagesCollapseToolbar'/);
});
test('stage buttons open their relevant panel and close the previously visible source',()=>{
 const ui=readFileSync(new URL('../public/kit-builder.js',import.meta.url),'utf8');
 const app=readFileSync(new URL('../public/app.js',import.meta.url),'utf8');
 assert.match(ui,/globalThis\.RAKitOpenStagePanel=stage=>/);
 assert.match(ui,/kitSetImagesCollapsed\(stage!=='images'\)/);
 assert.match(ui,/kitSetCopyContentCollapsed\(stage!=='seo'&&stage!=='description'\)/);
 assert.match(ui,/kitSetCompositionCollapsed\(true\)/);
 assert.match(ui,/facts\.open=false/);
 assert.match(app,/globalThis\.RAKitOpenStagePanel\?\.\(stage\.key\)/);
 assert.match(app,/globalThis\.RAKitOpenStagePanel\?\.\('discount'\)/);
 assert.match(app,/optimizerWorkflowOpen\(stage\.key\)/);
 assert.match(app,/optimizerWorkflowEditor'\)\?\.scrollIntoView/);
});
