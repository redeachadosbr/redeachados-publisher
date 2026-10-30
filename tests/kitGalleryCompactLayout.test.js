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
