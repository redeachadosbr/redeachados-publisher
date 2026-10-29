import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {validateReview} from '../shopeeOptimizationWorkflow.js';
const source=path=>fs.readFileSync(new URL('../'+path,import.meta.url),'utf8');
const app=source('public/app.js'),html=source('public/index.html');
const server=source('server.js'),existing=source('public/kit-existing-optimization.js');
test('kit usa a etapa 08 do otimizador real com desconto proprio',()=>{
 assert.match(html,/id="kitOptimizerWorkspace"/);
 assert.match(html,/Etapa 08 · Desconto do kit/);
 assert.match(app,/function kitOptimizerDiscountMount\(/);
 assert.match(app,/review\.append\(specific\)/);
 assert.match(app,/RAKitOpenDiscountReview/);
});
test('kit preserva autorizacao e nao utiliza token de promocao de SKU simples',()=>{
 assert.match(app,/typeof optimizerKitWorkflowActive==='function'/);
 assert.match(app,/optimizerDiscountApprovalReady\(\)/);
 assert.match(app,/discountApprovalToken:p\.modelVariations/);
 assert.match(server,/\['all','remaining'\]\.includes\(plan\.selectedStage\)&&!linkedKit/);
});
test('promocao do kit possui previa e confirmacao independentes',()=>{
 assert.match(existing,/\/api\/shopee\/kits\/discount\/preview/);
 assert.match(existing,/\/api\/shopee\/kits\/discount\/execute/);
 assert.match(existing,/RAKitDiscountConfirmed/);
 assert.match(app,/kitOptimizerDiscountConfirmedIdentity/);
});

test('painel do kit vem logo apos composicao e antes de titulo e galeria',()=>{
 const c=html.indexOf('class="kit-detail-facts"');
 const o=html.indexOf('id="kitOptimizeExistingPanel"');
 const t=html.indexOf('class="kit-copy-grid"');
 const g=html.indexOf('id="kitGallerySection"');
 assert(c>=0&&c<o&&o<t&&t<g);
 assert.equal(html.split('id="kitOptimizeExistingPanel"').length-1,1);
 assert.equal(html.split('id="kitOptimizerWorkspace"').length-1,1);
});
test('oito etapas visiveis sem duplicar geracao de conteudos prontos',()=>{
 assert.match(app,/for\(const \[i,stage\] of visible\.entries\(\)\)/);
 assert.match(app,/const total=visible\.length\+1/);
 assert.match(app,/discountCard\.onclick=\(\)=>optimizerDiscountOpenReview\(\)/);
 assert.match(app,/selector=\{images:'#kitGallerySection',seo:'#kitTitle',description:'#kitDescription'\}/);
 assert.match(existing,/imageSyncAttempts/);
 assert.match(existing,/stage:'images',reviewed:true/);
 assert.match(server,/validateReview\(\{stage:'seo',reviewed:true,title:link\.title\}\)/);
 assert.match(server,/validateReview\(\{stage:'description',reviewed:true,description:link\.description\}\)/);
});
test('oito etapas ocupam lugar da barra de acompanhamento substituta',()=>{
 const a=html.indexOf('id="kitOptimizeStart"');
 const b=html.indexOf('id="kitOptimizerWorkspace"');
 const c=html.indexOf('id="kitOptimizeAdvanced"');
 assert(a>=0&&a<b&&b<c);
 assert.doesNotMatch(html,/id="kitOptimizeJourney"|id="kitOptimizeLiveProgress"|id="kitOptimizeStageSteps"/);
 assert.equal(html.split('id="kitOptimizerWorkspace"').length-1,1);
});
test('acompanhamento tecnico original permanece abaixo das oito etapas',()=>{
 const cards=html.indexOf('id="optimizerWorkflowCards"');
 const exec=html.indexOf('id="optimizerExecutionPanel"');
 const tracker=html.indexOf('id="optimizerExecutionTracker"');
 const editor=html.indexOf('id="optimizerWorkflowEditor"');
 assert(cards>=0&&cards<exec&&exec<tracker&&tracker<editor);
 assert.match(html,/Acompanhamento da execução/);
 assert.match(html,/id="optimizerExecutionPercent"/);
 assert.match(html,/id="optimizerExecutionNextActionTitle"/);
 assert.match(html,/id="optimizerExecutionEvents"/);
 assert.match(app,/function optimizerExecutionTrackerRender\(progress,job\)/);
});

test('cada clique mostra somente a etapa escolhida e oculta as anteriores',()=>{
 assert.match(app,/function optimizerWorkflowActivateOnly\(view,sourceStage=null\)/);
 for(const token of [
  "editor.hidden=view!=='editor'",
  "discount.hidden=view!=='discount'",
  "execution.hidden=view!=='execution'",
  "card.classList.toggle('is-current',selected)",
  "optimizerWorkflowActivateOnly('editor')",
  "optimizerWorkflowActivateOnly('discount')",
  "optimizerWorkflowActivateOnly('execution')",
  "optimizerWorkflowActivateOnly('source',stage.key)",
  "optimizerWorkflowActivateOnly('closed')"
 ])assert(app.includes(token),'Faltou exclusividade: '+token);
 // A revisao anterior pode ser ocultada mas o rascunho nao e descartado.
 assert.match(app,/optimizerContentRemember\(\);[\s\S]*?optimizerWorkflowActivateOnly\('discount'\)/);
});
test('atualizacoes da Shopee nao reabrem a previa sobre uma revisao escolhida',()=>{
 assert.match(app,/optimizerWorkflowActiveView===null\|\|optimizerWorkflowActiveView==='execution'/);
 assert.match(app,/if\(data\.progress\?\.hasSavedProgress&&/);
 assert.match(app,/if\(job&&\(\['running','uncertain'\]\.includes\(job\.state\)\|\|progress\?\.hasSavedProgress\)&&/);
 for(const id of ['optimizerExecutionPanel','optimizerExecutionTracker',
  'optimizerExecutionPercent','optimizerExecutionEvents','optimizerExecutionNextActionTitle'])
  assert.equal(html.split('id="'+id+'"').length-1,1);
});


test('titulo e descricao do kit possuem botoes de conferencia ao lado dos textos preparados',()=>{
 for(const [container,button,status] of [
  ['kitReviewSeo','kitReviewSeoButton','kitReviewSeoStatus'],
  ['kitReviewDescription','kitReviewDescriptionButton','kitReviewDescriptionStatus']
 ]){
  for(const id of [container,button,status])
   assert.equal(html.split('id="'+id+'"').length-1,1);
 }
 assert.match(html,/\/app\.js\?v=3\.5\.9-kit-seo-confirm/);
 assert.match(html,/\/kit-builder\.js\?v=3\.9\.8-kit-seo-confirm/);
 assert.match(html,/\/kit-builder\.css\?v=3\.8\.7-kit-source-checklist/);
 assert.match(app,/globalThis\.RAKitSourceChanged=optimizerKitSourceChanged/);
 assert.match(app,/function optimizerKitSourceConfirm\(stage\)/);
 assert.match(app,/await optimizerKitSourceFlush\(stage\)/);
 assert.match(app,/stage,reviewed:!reviewed/);
 assert.match(app,/if\(result\.saved!==true\|\|result\.stages\?\.find\(x=>x\.key===stage\)\?\.reviewed!==!reviewed\)/);
 assert.match(app,/optimizerWorkflowActivateOnly\('source',stage\)/);
});
test('alteracao de texto ou titulo importado reabre a etapa e nao publica sem autorizacao',()=>{
 const builder=source('public/kit-builder.js');
 assert.match(builder,/function onKitContentEdit\(\)[\s\S]*?globalThis\.RAKitSourceChanged\?\.\(\)/);
 assert.match(app,/if\(row\)\{row\.reviewed=false;row\.reviewedAt=null;row\.status='pending';\}/);
 assert.match(app,/const optimizerKitSourcePending=\{seo:null,description:null\}/);
 assert.match(app,/optimizerContentQueue=optimizerContentQueue\.catch\(\(\)=>\{\}\)\.then\(\(\)=>\s*optimizerSaveChecklistReview\(body\)\)/);
 assert.match(app,/optimizerKitSourceChanged\(\);\n \/\/ A pesquisa/);
 assert.match(app,/if\(length<10\|\|length>120\)/);
});
test('as outras seis etapas continuam com sua aprovacao propria antes da execucao',()=>{
 assert.match(html,/id="kitWorkflowImportImages"/);
 assert.match(existing,/stage:'images',reviewed:true/);
 assert.match(app,/body\.attributes=optimizerTechnicalValues\(\)/);
 assert.match(app,/if\(key==='fiscal'\)body\.tax=optimizerFiscalValues\(\)/);
 assert.match(app,/if\(key==='variants'\)/);
 assert.match(app,/if\(key==='seo'\|\|key==='description'\)/);
 assert.match(server,/if\(change\.stage==='video'&&change\.reviewed\)/);
 assert.match(server,/if\(change\.stage==='images'&&change\.reviewed\)/);
 assert.match(html,/id="optimizerExecDiscountPreview"/);
 assert.match(app,/optimizerDiscountOpenReview\(\)/);
});

test('check do titulo curto do kit funciona sem enfraquecer titulo SEO comum',()=>{
 const short='Kit Brinquedos para Bebê 12 Meses Elefante Musical com Luzes + Torre e Bola Chocalho 🐘🎶';
 assert([...short.normalize('NFC').replace(/\s+/g,' ').trim()].length<100);
 const reviewed={stage:'seo',reviewed:true,title:short};
 assert.throws(()=>validateReview(reviewed),/100 e 120/);
 assert.equal(validateReview(reviewed,{allowShortKitTitle:true}).title,
  short.normalize('NFC').replace(/\s+/g,' ').trim());
 assert.throws(()=>validateReview({...reviewed,title:'curto'},{allowShortKitTitle:true}),/10 a 120/);
 assert.throws(()=>validateReview({...reviewed,title:'A'.repeat(121)},{allowShortKitTitle:true}),/10 a 120/);
 assert.match(server,/req\.body\?\.kitPreparedTitle===true/);
 assert.match(server,/String\(linkedKit\.mainSku\)===String\(sku\)/);
 assert.match(server,/validateReview\(req\.body,\{allowShortKitTitle\}\)/);
 assert.match(app,/stage==='seo'\?\{kitPreparedTitle:true\}/);
 assert.match(app,/optimizerKitSourceErrors\[stage\]=String\(error\.message\|\|error\)/);
 const builder=source('public/kit-builder.js');
 assert.match(builder,/\[\.\.\.\$\('#kitTitle'\)\.value\.normalize\('NFC'\)\.replace/);
});
