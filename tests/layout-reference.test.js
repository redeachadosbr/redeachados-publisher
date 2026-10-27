import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const html=fs.readFileSync(new URL('../public/index.html',import.meta.url),'utf8');
const css=fs.readFileSync(new URL('../public/styles.css',import.meta.url),'utf8');
const ui=fs.readFileSync(new URL('../public/ui.js',import.meta.url),'utf8');
const app=fs.readFileSync(new URL('../public/app.js',import.meta.url),'utf8');

test('layout da referência usa a mesma integração sem duplicar campos',()=>{
 const ids=[...html.matchAll(/\bid="([^"]+)"/g)].map(x=>x[1]);
 assert.equal(ids.length,new Set(ids).size,'IDs HTML únicos');
 for(const id of ['videoInput','dropzone','preview','fileName','changeBtn',
  'wedropSku','wedropSearchBtn','wedropQuery','wedropManualBtn',
  'wedropStatus','wedropResults','aiStatus','workArea','product','shopeeUrl',
  'title','description','cta','hashtags','captionPreview','instagramCaption',
  'purchaseComment','publishBtn','instagramPublishBtn','prepareStoryBtn',
  'instagramStoryPublishBtn','syncLatestReelBtn','regenerateBtn',
  'clearPublicationBtn','settingsBtn','settingsDialog','catalogStatus']){
  assert.ok(ids.includes(id),'Campo/ação preservado: '+id);
 }
});
test('três etapas reutilizam os DOM nodes existentes sem modificar os handlers',()=>{
 assert.match(ui,/applyPublisherReferenceLayout\(\)/);
 assert.match(ui,/shell\.append\(videoRow\)/);
 assert.match(ui,/sourceCard\.prepend\(shell\)/);
 assert.match(ui,/workArea\.insertBefore\(details/);
 assert.match(ui,/editor\.after\(card\)/);
 assert.match(ui,/card\.append\(publish\)/);
 assert.match(ui,/advanced\.append\(element\)/);
 assert.match(ui,/applyPublisherReferenceLayout\(\);\s*const navLinks/);
 assert.match(app,/selectedRemoteVideo/);
 assert.match(app,/publishBtn/);
});
test('nova navegação, pesquisa, modal e recursos avançados são acionáveis',()=>{
 assert.match(ui,/quick\.addEventListener\('keydown'/);
 assert.match(ui,/byId\('wedropSearchBtn'\)\.click\(\)/);
 assert.match(ui,/location\.hash = '#activity'/);
 assert.match(ui,/byId\('settingsBtn'\)\?\.click\(\)/);
 assert.match(ui,/'#publications':'Publicações'/);
 assert.match(ui,/reference-caption-details/);
 assert.match(ui,/reference-publish-extra/);
 assert.match(css,/reference-publisher-layout/);
 assert.match(css,/\.reference-sharing-card/);
 assert.match(css,/\.reference-video-preview/);
 assert.match(html,/\/ui\.js\?v=5522-reference-layout/);
});
test('estados ocultos não mostram preview e publicação sem vídeo',()=>{
 assert.match(css,/#create:has\(#workArea:not\(\.hidden\)\) \.reference-video-preview/);
 assert.match(css,/#create:has\(#workArea\.hidden\) \.reference-sharing-card\{display:none\}/);
 assert.match(css,/\.reference-video-preview\{display:none\}/);
});
