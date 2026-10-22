import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const read=p=>readFileSync(new URL(p,import.meta.url),'utf8');

test('approved SEO layout loads after title studio and before original app workflow',()=>{
 const html=read('../public/index.html');
 const a=html.indexOf('title-studio.js?v='),b=html.indexOf('seo-modern-layout.js?v='),c=html.indexOf('app.js?v=');
 assert.ok(a>0&&b>a&&c>b,'script execution order must preserve title studio before app');
 assert.match(html,/seo-modern-layout\.css\?v=/);
 for(const id of ['optimizerTitleVariants','optimizerWorkflowDraftWrap','optimizerWorkflowDraft',
  'optimizerCopyCount','optimizerWorkflowReview','optimizerWorkflowNext','optimizerWorkflowClose',
  'optimizerWorkflowShopee']){
  assert.equal((html.match(new RegExp('id="'+id+'"','g'))||[]).length,1,'shared control '+id+' must not be duplicated');
 }
});
test('compact layout maintains SEO draft, server AI generator, per-SKU facts and working quick links',()=>{
 const modern=read('../public/seo-modern-layout.js');
 const original=read('../public/title-studio.js');
 const app=read('../public/app.js');
 const css=read('../public/seo-modern-layout.css');
 assert.match(modern,/original\.open\(data,onChoose\)/);
 assert.match(modern,/if\(mount&&draft&&mount\.contains\(draft\)/);
 assert.match(modern,/mount\.parentNode\.insertBefore\(draft,mount\)/);
 assert.match(modern,/field\.dispatchEvent\(new Event\('input',\{bubbles:true\}\)\)/);
 assert.match(modern,/draftHandler=/);
 assert.match(modern,/field\.addEventListener\('input',draftHandler\)/);
 assert.match(modern,/field\.removeEventListener\('input',draftHandler\)/);
 assert.match(modern,/seo-modern-product-image|seo-modern-photo/);
 assert.match(modern,/sku=clean\(data\.sku/);
 assert.match(modern,/data\.supplierProduct/);
 assert.match(modern,/showPanel|function jump\(/);
 for(const id of ['optimizerRulesDetails','optimizerAuditPanel','optimizerSourcePanel','optimizerWorkflowShopee'])
  assert.ok(modern.includes(id),id);
 assert.match(original,/\/api\/shopee\/optimizer\/workflow\/title-ai/);
 assert.match(original,/btn\.addEventListener\('click'/);
 assert.match(app,/ShopeeTitleStudio\?\.close\?\.\(\)/);
 assert.match(app,/ShopeeTitleStudio\?\.open\(data,title=>/);
 assert.match(app,/optimizerContentRemember\(\)/);
 assert.match(css,/grid-template-columns:repeat\(4,minmax\(0,1fr\)\)/);
 assert.match(css,/seo-modern-editor\[hidden\]\{display:none!important\}/);
});
