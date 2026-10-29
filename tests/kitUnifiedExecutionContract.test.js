import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {validateReview} from '../shopeeOptimizationWorkflow.js';
import {fiscalMatrixSource} from '../shopeeMatrixRules.js';
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
 assert.match(server,/\['all','remaining','discount'\]\.includes\(plan\.selectedStage\)&&!linkedKit/);
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
 assert.match(html,/\/app\.js\?v=3\.5\.17-kit-gross-price-consent/);
 assert.match(html,/\/kit-builder\.js\?v=3\.9\.10-kit-discount-check/);
 assert.match(html,/\/kit-builder\.css\?v=3\.8\.10-kit-discount-tracker/);
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
 const execution=source('shopeeExecutionPlan.js');
 assert.match(execution,/allowShortKitTitle:Boolean\(/);
 assert.match(execution,/state\.kitOptimization\?\.kitSku/);
 assert.match(execution,/validateContentRules\(\{title\},\{allowShortKitTitle:/);
 assert.doesNotMatch(execution,/validateContentRules\(\{title\}\);/);

 assert.match(app,/optimizerKitSourceErrors\[stage\]=String\(error\.message\|\|error\)/);
 const builder=source('public/kit-builder.js');
 assert.match(builder,/\[\.\.\.\$\('#kitTitle'\)\.value\.normalize\('NFC'\)\.replace/);
});


test('ficha tecnica do kit usa estilos completos sem blocos colados',()=>{
 const css=source('public/optimizer-technical-studio.css');
 const studio=source('public/optimizer-technical-studio.js');
 assert.match(css,/:is\(#tab-optimizer,#tab-kits\) #optimizerTechnicalPanel\.ra-tech-studio/);
 assert.match(css,/:is\(#tab-optimizer,#tab-kits\) \.ra-tech-studio \.ra-tech-main/);
 assert.match(css,/position:static!important;bottom:auto!important/);
 assert.doesNotMatch(css,/position:sticky;bottom:0;z-index:8/);
 assert.match(css,/#optimizerWorkflowEditor:has\(#optimizerTechnicalPanel/);
 assert.match(studio,/panel\.replaceChildren\(heading,metrics,review,main,shortcutRow\)/);
 assert.match(studio,/if\(regroup\)review\.open=true/);
 assert.match(studio,/filled',saved,true/);
 assert.match(studio,/required',required,true/);
 assert.match(studio,/optional',optional,true/);
 assert.match(studio,/conditional',conditional,true/);
 assert.match(studio,/textLabel\.classList\.add\('ra-tech-source-text'\)/);
 assert.match(studio,/review\.scrollIntoView\(\{behavior:'smooth',block:'start'\}\)/);
 assert.match(html,/optimizer-technical-studio\.css\?v=1\.2\.0-compact-fields/);
 assert.match(html,/optimizer-technical-studio\.js\?v=1\.2\.0-compact-fields/);
});
test('ficha tecnica continua com inputs e aprovacao originais',()=>{
 const studio=source('public/optimizer-technical-studio.js');
 assert.match(studio,/const fields=\$\('#optimizerTechnicalFields'\)/);
 assert.match(studio,/fields\.replaceChildren\(\)/);
 assert.match(studio,/const fieldsets=current/);
 assert.match(app,/body\.attributes=optimizerTechnicalValues\(\)/);
 assert.match(app,/if\(key==='technical'\)await techFlush\(\)/);
 assert.match(app,/globalThis\.RATechnicalStudio\?\.render\?\.\(data\)/);
 assert.match(html,/id="optimizerWorkflowReview"/);
 assert.match(html,/id="optimizerTechnicalFields"/);
});


test('ficha compacta exibe uma linha por atributo e edicao com um clique',()=>{
 const studio=source('public/optimizer-technical-studio.js');
 const css=source('public/optimizer-technical-studio.css');
 assert.match(studio,/function compactField\(field\)/);
 assert.match(studio,/element\('details','ra-tech-field-row'\)/);
 assert.match(studio,/element\('span','ra-tech-field-action','Editar ›'\)/);
 assert.match(studio,/row\.append\(summary,field\)/);
 assert.match(studio,/body\.append\(compactField\(item\)\)/);
 assert.match(studio,/for\(const \[label,open\] of \[\['Editar todos',true\],\['Recolher todos',false\]\]\)/);
 assert.match(studio,/if\(regroup\)groups\(data\)/);
 assert.match(css,/\.ra-tech-field-head\{/);
 assert.match(css,/grid-template-columns:minmax\(150px,1fr\) minmax\(170px,2\.2fr\) auto/);
 assert.match(css,/\.ra-tech-field-row\[open\]/);
 assert.match(css,/\.ra-tech-field-row>\.optimizer-attribute/);
 assert.match(css,/\.optimizer-attribute button,/);
 assert.match(css,/\.ra-tech-preview \.optimizer-tech-summary-stats/);
 assert.match(html,/optimizer-technical-studio\.css\?v=1\.2\.0-compact-fields/);
 assert.match(html,/optimizer-technical-studio\.js\?v=1\.2\.0-compact-fields/);
});
test('editar pela previa expande o atributo correto sem substituir os campos salvos',()=>{
 const studio=source('public/optimizer-technical-studio.js');
 assert.match(studio,/fields\.addEventListener\(type,event=>/);
 assert.match(studio,/updateFieldRow\(field\)/);
 assert.match(studio,/row\.addEventListener\('toggle'/);
 assert.match(studio,/field\.querySelector\('\[data-attribute-enabled\]'\)\?\.checked/);
 assert.match(studio,/for\(const type of \['input','change'\]\)/);
 assert.equal(app.split("const compact=field.closest('.ra-tech-field-row');if(compact)compact.open=true;").length-1,2);
 assert.match(app,/globalThis\.RATechnicalStudio\?\.render\?\.\(data\)/);
 assert.match(app,/body\.attributes=optimizerTechnicalValues\(\)/);
 assert.match(html,/id="optimizerWorkflowReview"/);
 assert.match(html,/\/app\.js\?v=3\.5\.17-kit-gross-price-consent/);
});


test('etapa 07 possui botao check distinto do salvamento fiscal',()=>{
 const fiscal=source('public/fiscal-modern-layout.js');
 const css=source('public/fiscal-modern-layout.css');
 assert.match(fiscal,/checklist=action\('✓ Registrar etapa concluída'/);
 assert.match(fiscal,/checklist\.id='raFiscalChecklistConfirm'/);
 assert.match(fiscal,/globalThis\.RAFiscalChecklistConfirm\?\.\(\)/);
 assert.match(fiscal,/actions\.insertBefore\(checklist,next\)/);
 assert.match(fiscal,/get\('raFiscalChecklistConfirm'\)\?\.remove\(\)/);
 assert.match(fiscal,/get\('optimizerWorkflowReview'\)/);
 assert.match(fiscal,/save\.textContent='Salvar dados fiscais \(rascunho\)'/);
 assert.match(fiscal,/get\('raFiscalChecklistConfirm'\)/);
 assert.match(css,/#raFiscalModernLayout \.optimizer-workflow-actions #raFiscalChecklistConfirm/);
 assert.match(html,/fiscal-modern-layout\.css\?v=1\.0\.3-compact-help/);
 assert.match(html,/fiscal-modern-layout\.js\?v=1\.0\.3-compact-help/);
 assert.match(html,/\/app\.js\?v=3\.5\.17-kit-gross-price-consent/);
});
test('salvar dados fiscais nao confirma checklist e confirmar exige resposta do servidor',()=>{
 assert.match(app,/async function optimizerWorkflowSaveReview\(\{fiscalConfirm=false\}=\{\}\)/);
 assert.match(app,/reviewed:key==='fiscal'\?fiscalReviewed/);
 assert.match(app,/const fiscalReviewed=fiscalConfirm\?\(!stage\.reviewed\|\|fiscalChanged\):false/);
 assert.match(app,/if\(key==='fiscal'&&\(result\.saved!==true\|\|/);
 assert.match(app,/result\.stages\?\.find\(x=>x\.key==='fiscal'\)\?\.reviewed!==body\.reviewed/);
 assert.match(app,/globalThis\.RAFiscalChecklistConfirm=\(\)=>optimizerWorkflowSaveReview\(\{fiscalConfirm:true\}\)/);
 assert.match(app,/if\(key==='fiscal'\)body\.tax=optimizerFiscalValues\(\)/);
 assert.match(app,/optimizerFiscalReviewBusy=true/);
 assert.match(app,/optimizerFiscalReviewBusy=false/);
 assert.match(app,/globalThis\.ShopeeFiscalStudio\?\.update\?\.\(\{\.\.\.data,\.\.\.result,stages:result\.stages\}\)/);
});


test('kit fiscal usa fonte WeDrop REAL da SKU principal na revisão',()=>{
 assert.match(server,/const fiscalSku=String\(linkedKit\?\.mainSku\|\|sku\)/);
 assert.match(server,/if\(linkedKit&&fiscalSku!==String\(sku\)\)/);
 assert.match(server,/const taxSupplier=change\.tax\?await readWeDropProduct\(auth\.shopId,\{sku,itemId,modelId\}\):null/);
 assert.match(server,/change\.matrixFiscal=fiscalMatrixSource\(\{sku,supplier:taxSupplier,tax:change\.tax\}\)/);
 assert.doesNotMatch(server,/supplier:linkedKit\?null:supplier/);
});
test('regressão: SKU 310200 do kit com NCM e fonte WeDrop comprovados aprova check',()=>{
 const tax={ncm:'95030039',evidence:'WeDrop produtos-catalogo.csv · SKU 310200 · linha 192',cest:'00'};
 const supplier={
   supplier_sku:'310200',matchedBy:'exact-sku',
   product_data:{ncm:'95030039'},source_file:'produtos-catalogo.csv'
 };
 const result=fiscalMatrixSource({sku:'310200',supplier,tax});
 assert.equal(result.sku,'310200');
 assert.equal(result.supplierSku,'310200');
 assert.equal(result.ncm,'95030039');
 assert.equal(result.source,'exact-sku');
});
test('proteções fiscais: kit não pode aprovar fonte WeDrop solta ou SKU incorreta',()=>{
 const tax={ncm:'95030039',evidence:'WeDrop produtos-catalogo.csv · SKU 310200'};
 const supplier={
   supplier_sku:'310200',matchedBy:'exact-sku',
   product_data:{ncm:'95030039'},source_file:'produtos-catalogo.csv'
 };
 assert.throws(()=>fiscalMatrixSource({sku:'310200',supplier:null,tax}),/não está vinculada/);
 assert.throws(()=>fiscalMatrixSource({sku:'310200',supplier:{...supplier,supplier_sku:'9999'},tax}),/diverge da SKU Shopee/);
 assert.throws(()=>fiscalMatrixSource({sku:'310200',supplier:{...supplier,matchedBy:'unverified'},tax}),/correspondência WeDrop não revisada/);
 assert.throws(()=>fiscalMatrixSource({sku:'310200',supplier,tax:{...tax,ncm:'95030099'}}),/diverge da ficha WeDrop/);
 assert.throws(()=>fiscalMatrixSource({sku:'310200',supplier,tax:{...tax,ncm:'1234'}}),/oito dígitos/);
});


test('descricoes fiscais e fontes sao ocultas mas acessiveis no botao ?',()=>{
 const studio=source('public/fiscal-modern-layout.js');
 const css=source('public/fiscal-modern-layout.css');
 assert.match(studio,/const help=info\('Ajuda: '\+title\.textContent/);
 assert.match(studio,/querySelectorAll\(\s*':scope > \.optimizer-fiscal-filled, :scope > \.optimizer-fiscal-cest-help, :scope > \.ra-fiscal-modern-cest-alert'/);
 assert.match(studio,/popup\?\.append\(make\('p','ra-fiscal-modern-help-detail',note\.textContent\.trim\(\)\)\)/);
 assert.match(studio,/row\.append\(title,help\)/);
 assert.match(studio,/words\.append\(make\('strong','',title\)\)/);
 assert.match(studio,/const help=info\('Sobre '\+title,subtitle\)/);
 assert.match(studio,/const notesHelp=info\('Orientações do Motor Matriz'/);
 assert.match(studio,/const popup=cestLabel\?\.querySelector\('\.ra-fiscal-modern-field-label \.ra-fiscal-modern-popover'\)/);
 assert.match(css,/\.ra-fiscal-modern-field > :is\(/);
 assert.match(css,/\.optimizer-fiscal-filled,\.optimizer-fiscal-cest-help,\.ra-fiscal-modern-cest-alert/);
 assert.match(css,/\.ra-fiscal-modern-help>summary:focus-visible/);
 assert.match(css,/\.ra-fiscal-modern-help \.ra-fiscal-modern-popover/);
 assert.match(css,/max-height:260px!important/);
 assert.match(html,/fiscal-modern-layout\.css\?v=1\.0\.3-compact-help/);
 assert.match(html,/fiscal-modern-layout\.js\?v=1\.0\.3-compact-help/);
});
test('campo fiscal, avisos criticos e check continuam intactos',()=>{
 const studio=source('public/fiscal-modern-layout.js');
 assert.match(studio,/fieldElement\.insertBefore\(row,fieldElement\.firstChild\)/);
 assert.match(studio,/input\.addEventListener\('input',markUnsaved\)/);
 assert.match(studio,/const warning=make\('div','ra-fiscal-modern-warning'/);
 assert.match(studio,/cestLabel\?\.append\(caution\)/);
 assert.match(studio,/fields\.append\(content\)/);
 assert.match(studio,/checklist\.id='raFiscalChecklistConfirm'/);
 assert.match(studio,/get\('raFiscalChecklistConfirm'\)\?\.remove\(\)/);
 assert.match(app,/globalThis\.RAFiscalChecklistConfirm=\(\)=>optimizerWorkflowSaveReview\(\{fiscalConfirm:true\}\)/);
});


test('etapa 08 do kit permite previa de planejamento antes de executar o anuncio',()=>{
 const service=source('shopeeKitDiscountService.js');
 const module=source('public/kit-builder.js');
 assert.match(service,/async function context\(cfg,auth,kitSku,discountId,\{requireExecution=true\}=\{\}\)/);
 assert.match(service,/const x=await context\(cfg,auth,kitSku,discountId,\{requireExecution:false\}\)/);
 assert.match(service,/if\(!ready\)return \{status:'planning',approvalReady:false,token:null/);
 assert.match(service,/const ready=x\.executionVerified&&x\.priceAligned&&x\.liveStatus==='NORMAL'/);
 assert.match(service,/const verified=await context\(cfg,auth,kitSku,discountId\)/);
 assert.match(service,/const x=await context\(cfg,auth,kitSku,discountId\);\s*if\(String\(x\.itemId\)/);
 assert.match(service,/if\(requireExecution&&!executionVerified\)/);
 assert.match(service,/if\(requireExecution&&!priceAligned\)/);
 assert.match(existing,/discountToken=!planned&&result\.token\?result\.token:null/);
 assert.match(existing,/apply\.hidden=planned/);
 assert.match(existing,/apply\.disabled=planned/);
 assert.match(existing,/goExecution\.hidden=!planned/);
 assert.match(existing,/globalThis\.RAKitDiscountPrepared\?\.\(/);
 assert.match(app,/globalThis\.RAKitDiscountPrepared=\(\{kitSku,itemId,discountId,reviewSaved=false,/);
 assert.match(app,/prepared\?'✓ Conferência registrada · ainda não publicado'/);
 assert.match(html,/id="kitOptimizeDiscountToExecution"/);
 assert.match(html,/id="kitOptimizeDiscountApply" disabled/);
 assert.match(module,/kit-existing-optimization\.js\?v=9-discount-check/);
 assert.match(html,/\/app\.js\?v=3\.5\.17-kit-gross-price-consent/);
 assert.match(html,/\/kit-builder\.js\?v=3\.9\.10-kit-discount-check/);
 assert.match(html,/\/kit-builder\.css\?v=3\.8\.10-kit-discount-tracker/);
});
test('etapa 08 continua sem token de desconto se falta execucao confirmada',()=>{
 const service=source('shopeeKitDiscountService.js');
 assert.match(service,/message:'Prévia de planejamento pronta/);
 assert.match(service,/approvalReady:false,token:null/);
 assert.match(service,/export async function executeKitDiscount[\s\S]*?verifyDiscountPreview\(token,secret,auth\.shopId\)/);
 assert.match(service,/if\(String\(x\.itemId\)!==String\(approved\.itemId\)/);
 assert.match(existing,/if\(!target\?\.prepared\|\|!discountToken\|\|busy\)return/);
 assert.match(existing,/if\(!window\.confirm\(/);
 assert.match(existing,/Nenhum desconto foi publicado/);
});


test('etapa 08 mostra tabela clara em vez de bloco preto e preserva dados',()=>{
 const css=source('public/kit-builder.css');
 const module=source('public/kit-builder.js');
 assert.match(html,/id="kitOptimizeDiscountSummary" class="kit-discount-summary"/);
 assert.doesNotMatch(html,/<pre id="kitOptimizeDiscountSummary">/);
 assert.match(existing,/function renderDiscountSummary\(result,planned,current\)/);
 assert.match(existing,/const grid=document\.createElement\('dl'\)/);
 assert.match(existing,/const label=document\.createElement\('dt'\)/);
 assert.match(existing,/const content=document\.createElement\('dd'\)/);
 assert.match(existing,/content\.textContent=value/);
 assert.match(existing,/renderDiscountSummary\(result,planned,current\)/);
 assert.match(css,/#tab-kits #kitDetail \.kit-existing-discount-review \.kit-discount-summary/);
 assert.match(css,/background:#fff!important;color:#18365a!important/);
 assert.match(css,/\.kit-discount-summary-row dd/);
 assert.match(module,/kit-existing-optimization\.js\?v=9-discount-check/);
});
test('previa do kit confere etapa 08 sem sinalizar aplicacao na Shopee',()=>{
 const store=source('shopeeOptimizationWorkflowStore.js');
 assert.match(server,/kitDiscountPreview:\{kitSku:code,itemId:String\(link\.itemId\)/);
 assert.match(server,/String\(link\.itemId\)===String\(preview\.itemId\)/);
 assert.match(server,/reviewSaved,marketplaceUpdated:false/);
 assert.match(store,/if\(change\.kitDiscountPreview!==undefined\)next\.kitDiscountPreview/);
 assert.match(store,/if\(change\.kitDiscountPublication!==undefined\)next\.kitDiscountPublication/);
 assert.match(store,/next\.kitDiscountPreview=null;/);
 assert.match(server,/kitDiscountPreview:review\.kitDiscountPreview\|\|null/);
 assert.match(server,/kitDiscountPublication:review\.kitDiscountPublication\|\|null/);
 assert.match(app,/function optimizerKitDiscountReviewState\(w\)/);
 assert.match(app,/const recent=Number\.isFinite\(time\)/);
 assert.match(app,/const prepared=Boolean\(same\(preview\)&&preview\.status==='prepared'/);
 assert.match(app,/kitDiscountReviewed=kitMode&&optimizerKitDiscountReviewState\(data\)\.prepared/);
 assert.match(app,/optimizerKitDiscountReviewState\(w\)\.prepared/);
 assert.match(app,/const reviewed=kit\?prepared:matching&&optimizerDiscountApprovalReady\(\)/);
 assert.match(app,/card\.classList\.toggle\('optimizer-workflow-reviewed',Boolean\(sent\|\|reviewed\)\)/);
 assert.match(app,/prepared\?'✓ Conferência registrada · ainda não publicado'/);
 assert.match(existing,/reviewSaved:result\.reviewSaved===true,preview:result/);
});
test('publicacao do desconto so altera estado apos resposta confirmada',()=>{
 assert.match(server,/if\(out\?\.status==='discount_confirmed'\)/);
 assert.match(server,/kitDiscountPublication:\{kitSku:code,itemId:String\(out\.itemId\)/);
 assert.match(app,/const confirmed=Boolean\(same\(publication\)&&publication\.status==='confirmed'\)/);
 assert.match(existing,/if\(result\.status==='discount_confirmed'\)/);
 assert.match(existing,/if\(!target\?\.prepared\|\|!discountToken\|\|busy\)return/);
 assert.match(existing,/if\(!window\.confirm\(/);
 assert.match(server,/previewKitDiscount\(\{cfg,auth,kitSku:code,/);
 assert.doesNotMatch(server,/kitDiscountPublication:\{kitSku:code,itemId:String\(preview\.itemId\)/);
});


test('falha ao salvar historico apos publicacao nao solicita reenviar promocao',()=>{
 assert.match(server,/if\(out\?\.status==='discount_confirmed'\)\{\s*try\{/);
 assert.match(server,/catch\(error\)\{\s*console\.warn\('\[kit-discount\] Shopee confirmed, local history unavailable:/);
 assert.match(server,/res\.json\(\{\.\.\.out,historySaved,/);
 assert.match(server,/historyWarning:'Desconto confirmado na Shopee, mas histórico local pendente\. Não reenviar/);
 assert.doesNotMatch(server,/if\(out\?\.status==='discount_confirmed'\)\{\s*const saved/);
});


test('execucao completa do kit usa fonte WeDrop auditada na preparação',()=>{
 const fiscalAll=/if\(plan\.finalFiscal&&\['all','remaining'\]\.includes\(selectedStage\)\)\{[\s\S]*?const supplier=await readWeDropProduct\(auth\.shopId,\{sku,itemId,modelId\}\);[\s\S]*?fiscalMatrixSource\(\{sku,supplier,tax:reviewState\.tax,reviewSource:reviewState\.matrixFiscal\}\)/;
 assert.match(server,fiscalAll);
 assert.doesNotMatch(server,/const supplier=kitLink\?null:await readWeDropProduct/);
 assert.match(server,/if\(kitLink\)\{[\s\S]*?await verifiedLinkedKitQuote\(auth,kitLink\)/);
});
test('execucao fiscal isolada do kit também usa a fonte ligada ao Item ID',()=>{
 assert.match(server,/if\(selectedStage==='fiscal'&&reviewState\.stages\?\.fiscal\?\.reviewed&&reviewState\.tax\)\{\s*\/\/ Kit e SKU simples usam o mesmo vínculo auditado\.[\s\S]*?const supplier=await readWeDropProduct\(auth\.shopId,\{sku,itemId,modelId\}\);/);
 assert.match(server,/const taxSupplier=change\.tax\?await readWeDropProduct\(auth\.shopId,\{sku,itemId,modelId\}\):null/);
 assert.match(server,/if\(\(plan\.selectedStage==='fiscal'\|\|plan\.finalFiscal\)&&reviewState\.stages\?\.fiscal\?\.reviewed&&reviewState\.tax\)\{/);
});
test('dados fiscais da SKU 310200 vinculados ainda são validados na execução',()=>{
 const tax={ncm:'95030039',evidence:'WeDrop produtos-catalogo.csv · SKU 310200 · linha 192'};
 const supplier={supplier_sku:'310200',matchedBy:'exact-sku',
   product_data:{ncm:'95030039'},source_file:'produtos-catalogo.csv',source_line:192};
 const reviewed=fiscalMatrixSource({sku:'310200',supplier,tax});
 assert.equal(reviewed.sku,'310200');
 assert.equal(reviewed.supplierSku,'310200');
 assert.equal(reviewed.ncm,'95030039');
 assert.equal(fiscalMatrixSource({sku:'310200',supplier,tax,reviewSource:reviewed}).ncm,'95030039');
 assert.throws(()=>fiscalMatrixSource({sku:'310200',supplier:null,tax,reviewSource:reviewed}),/não está vinculada/);
 assert.throws(()=>fiscalMatrixSource({sku:'310200',supplier:{...supplier,supplier_sku:'999999'},tax,reviewSource:reviewed}),/diverge da SKU Shopee/);
 assert.throws(()=>fiscalMatrixSource({sku:'310200',supplier,tax:{...tax,ncm:'95030099'},reviewSource:reviewed}),/diverge da ficha WeDrop/);
});


test('rastreador distingue check do desconto da sua publicação na Shopee',()=>{
 const css=source('public/kit-builder.css');
 assert.match(app,/const sameKitJob=Boolean\(w\.kitOptimization\?\.kitSku/);
 assert.match(app,/String\(job\?\.item_id\|\|''\)===String\(w\.itemId\)/);
 assert.match(app,/const kitDiscount=sameKitJob\?optimizerKitDiscountReviewState\(w\)/);
 assert.match(app,/const discountPending=progress\.verified&&kitDiscount\.prepared&&!kitDiscount\.confirmed/);
 assert.match(app,/'kit-prepared':'✓ Prévia conferida · promoção pendente'/);
 assert.match(app,/'kit-published':'✓ Promoção aplicada separadamente'/);
 assert.match(app,/kitDiscount\.confirmed\?'kit-published':kitDiscount\.prepared\?'kit-prepared':step\.status/);
 assert.match(app,/O 100% representa as alterações já confirmadas do anúncio/);
 assert.match(css,/\.optimizer-exec-step\.is-kit-prepared/);
 assert.match(css,/\.optimizer-exec-step\.is-kit-published/);
 assert.match(html,/\/app\.js\?v=3\.5\.17-kit-gross-price-consent/);
 assert.match(html,/\/kit-builder\.css\?v=3\.8\.10-kit-discount-tracker/);
});
test('rastreador não altera resultados verificados nem presume execução da promoção',()=>{
 const progressCode=source('shopeeExecutionProgress.js');
 assert.match(progressCode,/const discountIncluded=Boolean\(plan\.commercialDiscount\|\|plan\.modelVariations\?\.promotion\|\|plan\.kitDiscount\|\|plan\.discountOnly\)/);
 assert.match(progressCode,/const discountDone=discountIncluded&&result\.discount\?\.status==='verified'/);
 assert.match(progressCode,/if\(id==='discount'&&fullWorkflow&&!discountIncluded\)/);
 assert.match(app,/const actualStatus=step\.id==='discount'&&sameKitJob/);
 assert.match(app,/kitDiscount\.prepared\?'kit-prepared'/);
 assert.match(app,/if\(actualStatus==='kit-prepared'\)li\.title='Check da etapa 08: prévia conferida\. Desconto ainda não aplicado/);
 assert.match(app,/Boolean\(plan\?\.kitDiscount\)/);
 assert.match(progressCode,/discount:discountIncluded/);
 assert.match(app,/const pct=discountPending\?88:Math\.max\(0,Math\.min\(100,Number\(progress\.percent\)\|\|0\)\)/);
});
test('depois do anúncio confirmado exibe ação para concluir promoção separada',()=>{
 assert.match(app,/kitDiscountAction\.id='optimizerExecutionOpenKitDiscount'/);
 assert.match(app,/kitDiscountAction\.addEventListener\('click',\(\)=>optimizerDiscountOpenReview\(\)\)/);
 assert.match(app,/kitDiscountAction\.hidden=!discountPending/);
 assert.match(app,/if\(optimizerExecProgress&&optimizerExecJob\)\s*optimizerExecutionTrackerRender\(optimizerExecProgress,optimizerExecJob\)/);
 assert.match(source('public/kit-builder.css'),/#tab-kits #optimizerExecutionOpenKitDiscount\[hidden\]/);
});

test('modo exclusivo do kit aparece na interface sem reenviar etapas já preservadas',()=>{
 assert.match(html,/<option value="discount">Somente desconto \(etapa 08/);
 assert.match(app,/p\?\.selectedStage==='discount'/);
 assert.match(app,/Preservado · sem reenvio/);
 assert.match(server,/if\(selectedStage==='discount'&&kitLink&&!kitDiscountPlan\)/);
});

test('kit mostra diferença do preço atual e permite autorização separada de preço bruto + desconto',()=>{
 assert.match(html,/<option value="discount_adjust">Somente preço bruto \+ desconto do kit/);
 assert.match(app,/p\?\.selectedStage==='discount_adjust'/);
 assert.match(app,/preço ATUAL Shopee/);
 assert.match(server,/selectedStage==='discount_adjust'/);
 assert.match(existing,/result\.priceAligned/);
});
