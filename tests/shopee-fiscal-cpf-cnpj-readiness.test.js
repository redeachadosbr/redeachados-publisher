import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {fiscalCanPublish,fiscalPreviewDisposition,pendingFiscalReason} from '../shopeeFiscalReadiness.js';
import {compileShopeeExecutionPlan} from '../shopeeExecutionPlan.js';
import {approvedTitle} from './fixtures/approved-content.js';
const preparing={mode:'cnpj_preparacao',migrationConfirmed:false,accountantConfirmed:false};
const active={mode:'cnpj_ativo',migrationConfirmed:true,accountantConfirmed:true};
const record={itemId:'22095398152',sku:'TRC1525',selectedModelId:'0',status:'NORMAL',
 attributeAudit:{missingMandatory:0,attributes:[]},imageCount:5,videoStatus:'Indisponível'};
const live={item_id:22095398152,item_name:'Piscina anterior',description:'Texto anterior',
 description_type:'normal',category_id:123,item_status:'NORMAL',attribute_list:[],tax_info:{},
 image:{image_id_list:['old-image']},video_info:[]};
const review={stages:{fiscal:{reviewed:true},seo:{reviewed:true}},
 tax:{ncm:'95069900',origin:'2',same_state_cfop:'5106',diff_state_cfop:'6106',
  csosn:'102',measure_unit:'UN',cest:'',evidence:'WeDrop nota fiscal conferida'},
 draftTitle:approvedTitle};
const args={shopId:852701218,itemId:'22095398152',modelId:'0',sku:'TRC1525',record,review,live};
test('CPF e CNPJ em preparação nunca autorizam um envio fiscal',()=>{
 for(const state of [{mode:'cpf_atual'},preparing,
  {mode:'cnpj_ativo',migrationConfirmed:true,accountantConfirmed:false}]){
  assert.equal(fiscalCanPublish(state),false);
  assert.equal(fiscalPreviewDisposition({readiness:state,stage:'fiscal',plan:{
   proposed:{tax_info:{ncm:'95069900'}},original:{tax_info:{}}}}).allowed,false);
 }
 assert.match(pendingFiscalReason,/sem envio/i);
 assert.equal(fiscalCanPublish(active),true);
});
test('modo CPF-CNPJ futuro permite mídia/conteúdo sem enviar tax_info no fluxo completo',()=>{
 const plan=compileShopeeExecutionPlan({...args,omitFiscal:true,selectedStage:'all'});
 assert.equal(Object.hasOwn(plan.proposed,'tax_info'),false);
 assert.equal(plan.fiscalDeferred,true);
 assert.ok(plan.actions.includes('item_name'));
 assert.match(plan.warnings.join(' '),/migração CPF/);
 assert.equal(plan.canExecute,true);
});
test('fiscal somente para perfil ativado e revisão individual, sem liberar CEST rejeitado',()=>{
 const plan=compileShopeeExecutionPlan({...args,selectedStage:'fiscal'});
 assert.ok(Object.hasOwn(plan.proposed,'tax_info'));
 assert.equal(fiscalPreviewDisposition({readiness:active,stage:'fiscal',plan}).allowed,true);
 const refused=fiscalPreviewDisposition({readiness:active,stage:'fiscal',plan,
  previousError:'product.error_busi: Please upload the corresponding CEST of NCM',
  previousPlan:{proposed:{tax_info:{ncm:'95069900'}}}});
 assert.equal(refused.allowed,false);
 assert.equal(refused.knownCest,true);
 assert.match(refused.issues.join(' '),/A Shopee já exigiu o CEST/);
 const cleared=compileShopeeExecutionPlan({...args,selectedStage:'fiscal',
  review:{...review,tax:{...review.tax,cest:'1234567'}}});
 assert.equal(fiscalPreviewDisposition({readiness:active,stage:'fiscal',plan:cleared,
  previousError:'product.error_busi: Please upload the corresponding CEST of NCM',
  previousPlan:{proposed:{tax_info:{ncm:'95069900'}}}}).allowed,true);
});
test('endpoints fiscais e executores não aceitam plano legado quando conta ainda é CPF',()=>{
 const server=readFileSync(new URL('../server.js',import.meta.url),'utf8');
 assert.match(server,/app\.get\('\/api\/shopee\/optimizer\/fiscal\/readiness'/);
 assert.match(server,/app\.post\('\/api\/shopee\/optimizer\/fiscal\/readiness'/);
 assert.match(server,/if\(Object\.hasOwn\(plan\.proposed\|\|\{\},'tax_info'\)&&!fiscalCanPublish\(readiness\)\)/);
 assert.match(server,/omitFiscal:!fiscalCanPublish\(readiness\)/);
 const begin=server.indexOf("app.post('/api/shopee/optimizer/batch/fiscal/prepare'");
 const finish=server.indexOf("app.post('/api/shopee/optimizer/batch/fiscal/execute'",begin);
 const preview=server.slice(begin,finish);
 assert.match(preview,/const disposition=fiscalPreviewDisposition/);
 assert.match(preview,/state:'draft_only'/);
 assert.ok(preview.indexOf('if(!disposition.allowed)')<preview.indexOf('saveShopeePreparedExecution(auth.shopId,itemId,modelId,sku,plan)'));
 const execute=server.slice(finish,server.indexOf("app.get('/api/shopee/optimizer/batch/fiscal/status'",finish));
 assert.match(execute,/if\(!fiscalCanPublish\(readiness\)\)throw Error/);
});
test('interface permite somente prévia até confirmação real CPF->CNPJ e contabilidade',()=>{
 const js=readFileSync(new URL('../public/app.js',import.meta.url),'utf8');
 const html=readFileSync(new URL('../public/index.html',import.meta.url),'utf8');
 assert.match(html,/id="optimizerFiscalReadinessMode"/);
 assert.match(html,/id="optimizerFiscalMigrationConfirmed"/);
 assert.match(html,/id="optimizerFiscalAccountantConfirmed"/);
 assert.match(js,/mode==='cnpj_ativo'&&\(!migrationConfirmed\|\|!accountantConfirmed\)/);
 assert.match(js,/draft_only:'Cadastrado no Motor Matriz'/);
});
