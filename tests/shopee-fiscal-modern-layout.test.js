import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const read=file=>readFileSync(new URL(file,import.meta.url),'utf8');

test('Fiscal stage loads the approved layout before main app and preserves original tax controls',()=>{
 const html=read('../public/index.html');
 const layout=read('../public/fiscal-modern-layout.js');
 const script=html.indexOf('/fiscal-modern-layout.js?v=');
 const main=html.indexOf('/app.js?v=1.21.26-fiscal-modern');
 assert.ok(script>0&&main>script,'Layout must load before the app.');
 assert.match(html,/fiscal-modern-layout\.css\?v=1\.0\.1-fiscal-cards/);
 assert.match(layout,/globalThis\.ShopeeFiscalStudio=\{open,close,update\}/);
 assert.match(layout,/const originalLabels=\[\.\.\.fields\.querySelectorAll\('label'\)\]/);
 assert.match(layout,/fields\.append\(content\)/);
 assert.doesNotMatch(layout,/fields\.append\(make\('input'/);
 for(const id of ['optimizerFiscalFields','optimizerFiscalPanel','optimizerWorkflowReview',
  'optimizerWorkflowNext','optimizerWorkflowShopee','optimizerSourcePanel','optimizerRulesDetails','optimizerAuditPanel']){
  const hits=(html.match(new RegExp('id="'+id+'"','g'))||[]);
  assert.equal(hits.length,1,'Control '+id+' should only be defined once.');
 }
});

test('all existing fiscal fields are moved to three panels, not duplicated',()=>{
 const js=read('../public/fiscal-modern-layout.js');
 const names=[
  'ncm','origin','measure_unit','cest','same_state_cfop','diff_state_cfop',
  'csosn','pis_cofins_cst','operation_type','evidence'
 ];
 names.forEach(name=>assert.match(js,new RegExp('\\b'+name+':(?:classification|operation|provenance)\\.fields')));
 assert.match(js,/const slots=\{/);
 assert.match(js,/slots\[k\]\.append\(field\(label,k\)\)/);
 assert.match(js,/fields\.querySelectorAll\('label\[data-fiscal-key\]'\)/);
 assert.match(js,/editor\.append\(actions\)/);
 assert.match(js,/editor\.append\(disclaimer\)/);
 assert.match(js,/fiscal\?\.querySelector\(':scope > strong'\)\?\.removeAttribute\('hidden'\)/);
});

test('only persisted fiscal review can make the saved banner green',()=>{
 const js=read('../public/fiscal-modern-layout.js'),app=read('../public/app.js');
 assert.match(js,/const reviewed=stage\?\.reviewed===true/);
 assert.match(js,/pill\.classList\.toggle\('is-saved',reviewed\)/);
 assert.match(js,/reviewed\?'✓ Dados fiscais salvos':'◷ Dados fiscais em revisão'/);
 assert.doesNotMatch(js,/hoje às \d{1,2}:\d{2}/i);
 assert.match(app,/ShopeeFiscalStudio\?\.close\?\.\(\)/);
 assert.match(app,/if\(key==='fiscal'\)globalThis\.ShopeeFiscalStudio\?\.open\?\.\(data\)/);
 assert.match(app,/if\(key==='fiscal'\)globalThis\.ShopeeFiscalStudio\?\.update\?\.\(/);
 assert.match(app,/if\(key==='fiscal'\)body\.tax=optimizerFiscalValues\(\)/);
});

test('responsive design keeps real input serializer within fiscal fields',()=>{
 const css=read('../public/fiscal-modern-layout.css');
 const js=read('../public/fiscal-modern-layout.js');
 assert.match(css,/#raFiscalModernLayout \.ra-fiscal-modern-content\{\s*display:grid;grid-template-columns:minmax\(0,1fr\) minmax\(0,1fr\) minmax\(0,1\.04fr\)/);
 assert.match(css,/@media\(max-width:850px\)/);
 assert.match(css,/ra-fiscal-modern-card\.operation \.ra-fiscal-modern-card-body/);
 assert.match(js,/\/\/ Keep the cards inside #optimizerFiscalFields/);
 assert.match(js,/editor\.insertBefore\(fiscal,video\)/);
 assert.match(js,/root\.append\(actions\)/);
});


test('CEST 00 salvo tem prioridade sobre CEST real devolvido pela Shopee, sem alterar valor publicado',()=>{
 const app=read('../public/app.js');
 assert.match(app,/const sellerCest=String\(saved\.cest\?\?''\)\.trim\(\)/);
 assert.match(app,/const liveCest=String\(data\.taxCurrent\?\.cest\?\?''\)\.trim\(\)/);
 assert.match(app,/draft\.cest=sellerCest\|\|liveCest\|\|suggestedCest\|\|'00'/);
 assert.match(app,/Shopee \(API do anúncio; conferência fiscal necessária\)/);
 assert.match(app,/esse valor publicado NÃO foi alterado/);
 assert.doesNotMatch(app,/cestEntries\.find\(v=>\/\^\\d\{7\}\$\//);
});
