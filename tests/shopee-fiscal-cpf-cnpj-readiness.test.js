import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {fiscalPreviewDisposition} from '../shopeeFiscalReadiness.js';
import {compileShopeeExecutionPlan} from '../shopeeExecutionPlan.js';
import {approvedTitle} from './fixtures/approved-content.js';
const record={itemId:'22095398152',sku:'TRC1525',selectedModelId:'0',status:'NORMAL',
 attributeAudit:{missingMandatory:0,attributes:[]},imageCount:5,videoStatus:'Indisponível'};
const live={item_id:22095398152,item_name:'Piscina anterior',description:'Texto anterior',
 description_type:'normal',category_id:123,item_status:'NORMAL',attribute_list:[],
 tax_info:{},image:{image_id_list:['old-image']},video_info:[]};
const review={stages:{fiscal:{reviewed:true},seo:{reviewed:true}},
 tax:{ncm:'95069900',origin:'2',same_state_cfop:'5106',diff_state_cfop:'6106',
  csosn:'102',measure_unit:'UN',cest:'',evidence:'WeDrop e contabilidade'},
 draftTitle:approvedTitle};
const args={shopId:852701218,itemId:'22095398152',modelId:'0',sku:'TRC1525',record,review,live};
test('a conta CPF ou CNPJ não condiciona salvar o rascunho fiscal, e não emite NF-e',()=>{
 const server=readFileSync(new URL('../server.js',import.meta.url),'utf8');
 const a=server.indexOf("app.post('/api/shopee/optimizer/workflow/review'");
 const b=server.indexOf('// Execution uses reviewed content',a);
 const reviewRoute=server.slice(a,b);
 assert.match(reviewRoute,/saveWorkflowReview\(auth\.shopId,itemId,modelId,sku,change\)/);
 assert.match(reviewRoute,/compileTax\(change\.tax,\{tax_info:\{\}\}\)/);
 assert.match(reviewRoute,/marketplaceUpdated:false/);
 assert.doesNotMatch(reviewRoute,/readShopeeFiscalReadiness|fiscalCanPublish|emitirNota|issueInvoice/);
});
test('todas as etapas deixa o fiscal cadastrado intacto e executa conteúdo sem tax_info',()=>{
 const plan=compileShopeeExecutionPlan({...args,selectedStage:'all',omitFiscal:true});
 assert.equal(Object.hasOwn(plan.proposed,'tax_info'),false);
 assert.equal(plan.fiscalDeferred,true);
 assert.equal(plan.canExecute,true);
 assert.ok(plan.actions.includes('item_name'));
 assert.match(plan.warnings.join(' '),/Dados fiscais permanecem salvos no Motor Matriz/);
});
test('execução explicitamente fiscal continua separada e depende da resposta Shopee',()=>{
 const plan=compileShopeeExecutionPlan({...args,selectedStage:'fiscal'});
 assert.deepEqual(Object.keys(plan.proposed),['tax_info']);
 assert.equal(plan.proposed.tax_info.cest,undefined);
 assert.equal(fiscalPreviewDisposition({plan}).allowed,true);
 const oldError='product.error_busi: Please upload the corresponding CEST of NCM';
 const prior={proposed:{tax_info:{ncm:'95069900'}}};
 const issue=fiscalPreviewDisposition({plan,previousError:oldError,previousPlan:prior});
 assert.equal(issue.allowed,false);
 assert.equal(issue.knownCest,true);
 assert.match(issue.issues.join(' '),/Motor Matriz permanece salvo/);
 const corrected=compileShopeeExecutionPlan({...args,selectedStage:'fiscal',
  review:{...review,tax:{...review.tax,cest:'1234567'}}});
 assert.equal(fiscalPreviewDisposition({plan:corrected,
  previousError:oldError,previousPlan:prior}).allowed,true);
});
test('backend removeu gate CPF/CNPJ e mantém execução fiscal opt-in',()=>{
 const server=readFileSync(new URL('../server.js',import.meta.url),'utf8');
 assert.doesNotMatch(server,/readShopeeFiscalReadiness|saveShopeeFiscalReadiness|fiscalCanPublish|pendingFiscalReason/);
 assert.doesNotMatch(server,/app\.(?:get|post)\('\/api\/shopee\/optimizer\/fiscal\/readiness'/);
 assert.match(server,/omitFiscal:false/);
 assert.match(server,/finalFiscal/);
 assert.match(server,/plan\.selectedStage!=='fiscal'/);
 const begin=server.indexOf("app.post('/api/shopee/optimizer/batch/fiscal/prepare'");
 const finish=server.indexOf("app.post('/api/shopee/optimizer/batch/fiscal/execute'",begin);
 const prepare=server.slice(begin,finish);
 assert.match(prepare,/const disposition=fiscalPreviewDisposition/);
 assert.match(prepare,/state:'draft_only'/);
 assert.match(prepare,/saveShopeePreparedExecution\(auth\.shopId,itemId,modelId,sku,plan\)/);
});
test('painel CPF/CNPJ e suas confirmações foram removidos do layout',()=>{
 const js=readFileSync(new URL('../public/app.js',import.meta.url),'utf8');
 const html=readFileSync(new URL('../public/index.html',import.meta.url),'utf8');
 assert.doesNotMatch(html,/optimizerFiscalReadinessMode|optimizerFiscalMigrationConfirmed|optimizerFiscalAccountantConfirmed|optimizer-fiscal-readiness/);
 assert.doesNotMatch(js,/optimizerFiscalReadinessLoad|optimizerFiscalReadinessSave|optimizerFiscalReadinessMode/);
 assert.match(html,/id="optimizerFiscalBatch"/);
 assert.match(js,/draft_only:'Cadastrado no Motor Matriz'/);
});
