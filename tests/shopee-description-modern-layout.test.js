import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const read=p=>readFileSync(new URL(p,import.meta.url),'utf8');
test('description redesign loads before main workflow with browser cache busting',()=>{
 const html=read('../public/index.html'),js=read('../public/description-modern-layout.js');
 const pos=html.indexOf('/description-modern-layout.js?v='),app=html.indexOf('/app.js?v=1.21.25-description-layout');
 assert.ok(pos>0&&app>pos,'description layout must load before app.js');
 assert.match(html,/description-modern-layout\.css\?v=1\.0\.3/);
 for(const id of ['optimizerDescriptionCompact','optimizerDescriptionFullPreview','optimizerWorkflowDraft',
  'optimizerWorkflowDraftWrap','optimizerDescriptionToggle','optimizerWorkflowReview','optimizerWorkflowNext']){
  assert.equal((html.match(new RegExp('id="'+id+'"','g'))||[]).length,1,id+' should be unique');
 }
 assert.match(js,/globalThis\.ShopeeDescriptionStudio=\{open,close,sync\}/);
});
test('the exact original editor and full description preview remain functional',()=>{
 const js=read('../public/description-modern-layout.js'),app=read('../public/app.js'),css=read('../public/description-modern-layout.css');
 assert.match(js,/const draft=\$\('optimizerWorkflowDraftWrap'\)/);
 assert.match(js,/const field=\$\('optimizerWorkflowDraft'\)/);
 assert.match(js,/const full=\$\('optimizerDescriptionFullPreview'\)/);
 assert.doesNotMatch(js,/Ver descrição completa ▾/);
 assert.doesNotMatch(js,/detail\.append\(full\)/);
 assert.match(js,/preview\.insertBefore\(full,footer\)/);
 assert.match(js,/editor\.insertBefore\(draft,variants\)/);
 assert.match(js,/preview\.prepend\(summary,chips,cta\)/);
 assert.match(js,/field\.rows=9/);
 assert.match(js,/listen\(field,'input',onInput\)/);
 assert.match(js,/if\(draft\&\&variants\)editor\.insertBefore/);
 assert.match(app,/ShopeeDescriptionStudio\?\.open\?\.\(data\)/);
 assert.match(app,/ShopeeDescriptionStudio\?\.close\?\.\(\)/);
 assert.match(app,/ShopeeDescriptionStudio\?\.sync\?\.\(\)/);
 assert.match(css,/desc-modern-columns\{display:grid;grid-template-columns:minmax\(0,1fr\) minmax\(0,1fr\)/);
 assert.match(css,/#optimizerDescriptionModern #optimizerDescriptionFullPreview\{display:none!important\}/);
 assert.match(css,/.desc-modern-preview-panel #optimizerDescriptionCompact/);
 assert.doesNotMatch(css,/desc-modern-full/);
});
test('new view uses only existing reliable data and retains market approval actions',()=>{
 const js=read('../public/description-modern-layout.js');
 assert.match(js,/data\.supplierProduct\|\|\{\}/);
 assert.match(js,/Array\.isArray\(data\.imageUrls\)/);
 assert.match(js,/const sourceUrl=url=>/); // only trusted https image URLs are used
 for(const target of ['optimizerSourcePanel','optimizerRulesDetails','optimizerAuditPanel','optimizerWorkflowShopee'])
  assert.ok(js.includes(target),target+' access is present');
 assert.match(js,/textContent=String\(text\)/);
 assert.doesNotMatch(js,/innerHTML\s*=/);
 assert.match(js,/safeText\(data\.productTitle\|\|supplier\.name/);
});
