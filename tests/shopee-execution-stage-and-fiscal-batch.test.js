import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {approvedTitle,approvedDescription} from './fixtures/approved-content.js';
import {compileShopeeExecutionPlan,confirmShopeeExecution,
 normalizeShopeeExecutionStage,SHOPEE_EXECUTION_STAGES,verifyShopeeExecution} from '../shopeeExecutionPlan.js';
import {advanceShopeeExecution} from '../shopeeExecutionWorker.js';
import {normalizedShopeeFiscalBatchSkus,checkedShopeeFiscalBatchEntries} from '../shopeeExecutionBatch.js';
const record={itemId:'22095398152',selectedModelId:'0',sku:'TRC1525',
 status:'NORMAL',imageCount:5,videoStatus:'Indisponível',
 attributeAudit:{missingMandatory:0,attributes:[]}};
const live={item_id:22095398152,item_name:'Piscina Inflável anterior',description:'Descrição anterior',
 description_type:'normal',category_id:123,item_status:'NORMAL',attribute_list:[],
 tax_info:{},image:{image_id_list:['old']},video_info:[]};
const tax={ncm:'95069900',origin:'2',same_state_cfop:'5106',
 diff_state_cfop:'6106',csosn:'102',measure_unit:'UN',cest:'',
 evidence:'NCM da WeDrop, CSV linha 5306, dados fiscais aprovados pelo vendedor.'};
const review={stages:{fiscal:{reviewed:true},seo:{reviewed:true},description:{reviewed:true}},
 tax,draftTitle:approvedTitle,draftDescription:approvedDescription};
const input={shopId:1,itemId:record.itemId,modelId:'0',sku:record.sku,record,live,review};
test('etapas permitidas são fechadas e não aceitam opção arbitrária',()=>{
 assert.deepEqual(SHOPEE_EXECUTION_STAGES,['all','images','video','seo','technical','description','fiscal']);
 assert.equal(normalizeShopeeExecutionStage(), 'all');
 assert.throws(()=>normalizeShopeeExecutionStage('stock'),/Etapa/);
});
test('fiscal isolado envia exclusivamente tax_info (CEST opcional continua vazio) sem título nem descrição',()=>{
 const plan=compileShopeeExecutionPlan({...input,selectedStage:'fiscal'});
 assert.deepEqual(plan.actions,['tax_info']);
 assert.deepEqual(Object.keys(plan.proposed),['tax_info']);
 assert.equal(plan.proposed.tax_info.ncm,'95069900');
 assert.equal(Object.hasOwn(plan.proposed.tax_info,'cest'),false);
 assert.equal(plan.selectedStage,'fiscal');
 assert.equal(plan.canExecute,true);
 assert.doesNotThrow(()=>confirmShopeeExecution(plan,{sku:'TRC1525',confirmation:'EXECUTAR TRC1525'}));
});
test('modo SEO não envia dados fiscais mesmo que ficha fiscal tenha sido aprovada',()=>{
 const plan=compileShopeeExecutionPlan({...input,selectedStage:'seo'});
 assert.deepEqual(plan.actions,['item_name']);
 assert.equal(Object.hasOwn(plan.proposed,'tax_info'),false);
 assert.equal(Object.hasOwn(plan.proposed,'description'),false);
 assert.equal(plan.canExecute,true);
 const changed=compileShopeeExecutionPlan({...input,selectedStage:'description'});
 assert.deepEqual(changed.actions,['description']);
 assert.notEqual(changed.fingerprint,plan.fingerprint);
});
test('selecionar fiscal sem revisão não envia nada e não simula execução concluída',()=>{
 const plan=compileShopeeExecutionPlan({...input,selectedStage:'fiscal',
  review:{...review,stages:{seo:{reviewed:true}},tax}});
 assert.equal(plan.canExecute,false);
 assert.deepEqual(plan.proposed,{});
});
test('com o seletor fiscal, o worker confirma apenas tax_info e não envia fotos, vídeo ou preços',async()=>{
 const plan=compileShopeeExecutionPlan({...input,selectedStage:'fiscal'});
 let sent=null;
 const out=await advanceShopeeExecution({plan,result:{phase:'queued'},state:'running'},{
  validateIdentity:async()=>{},read:async()=>live,beforeWrite:async()=>{},
  update:async body=>{sent=body;return {request_id:'t1'};}
 });
 assert.equal(out.state,'running');
 assert.ok(sent.tax_info);
 assert.deepEqual(Object.keys(sent).sort(),['item_id','tax_info']);
 assert.equal(verifyShopeeExecution(plan,{...live,tax_info:plan.proposed.tax_info}),true);
 assert.equal(verifyShopeeExecution(plan,live),false);
});
test('batch fiscal rejeita duplicatas, SKUs inválidas, planos repetidos para o mesmo item e acima de 12',()=>{
 assert.deepEqual(normalizedShopeeFiscalBatchSkus('TRC1525, TRC0809\nTRC1525'),['TRC1525','TRC0809']);
 assert.throws(()=>normalizedShopeeFiscalBatchSkus(Array.from({length:13},(_,i)=>'SKU'+i)),/12/);
 assert.throws(()=>normalizedShopeeFiscalBatchSkus(['ABC/TEST']),/inválida/);
 const item=(sku,itemId)=>({sku,itemId,modelId:'0',
  planId:'def1a000-1234-4000-b000-123456789abc',updatedAt:'2026-10-20T00:00:00Z'});
 assert.equal(checkedShopeeFiscalBatchEntries([item('TRC1525','22095398152')]).length,1);
 assert.throws(()=>checkedShopeeFiscalBatchEntries([item('TRC1525','22095398152'),item('TRC0809','22095398152')]),/duas vezes/);
});
test('endpoints de lote fazem prévia e confirmação, cada item com CAS, replay sem automático',()=>{
 const server=readFileSync(new URL('../server.js',import.meta.url),'utf8');
 const a=server.indexOf("app.post('/api/shopee/optimizer/batch/fiscal/prepare'");
 const b=server.indexOf("app.get('/api/shopee/optimizer/execution/status'",a);
 assert.ok(a>0&&b>a);
 const src=server.slice(a,b);
 assert.match(src,/selectedStage:'fiscal'/);
 assert.match(src,/fiscalMatrixSource/);
 assert.match(src,/saveShopeePreparedExecution/);
 assert.match(src,/plan\.selectedStage!=='fiscal'/);
 assert.match(src,/Object\.keys\(job\.plan\.proposed\|\|\{\}\)\.some\(k=>k!=='tax_info'\)/);
 assert.match(src,/confirmShopeeExecution/);
 assert.match(src,/assertLiveShopeeUnchanged/);
 assert.match(src,/claimShopeePreparedExecution/);
 assert.match(src,/runOptimizerJobs/);
 assert.doesNotMatch(src,/\/product\/update_item|update_stock|update_price/);
 const js=readFileSync(new URL('../public/app.js',import.meta.url),'utf8');
 const html=readFileSync(new URL('../public/index.html',import.meta.url),'utf8');
 assert.match(html,/id="optimizerExecutionScope"/);
 assert.match(html,/id="optimizerFiscalBatchPrepare"/);
 assert.match(html,/id="optimizerFiscalBatchExecute"/);
 assert.match(js,/stage:p\.selectedStage\|\|'all'/);
 assert.match(js,/confirmation:'EXECUTAR LOTE FISCAL'/);
});
