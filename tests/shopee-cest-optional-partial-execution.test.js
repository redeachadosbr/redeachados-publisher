import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {approvedTitle,approvedDescription} from './fixtures/approved-content.js';
import {compileShopeeExecutionPlan} from '../shopeeExecutionPlan.js';
import {advanceShopeeExecution} from '../shopeeExecutionWorker.js';
import {needsCestRevalidation} from '../shopeeExecutionIssues.js';

const record={shopId:9,itemId:'22095398152',selectedModelId:'0',sku:'TRC1525',
 status:'NORMAL',imageCount:5,videoStatus:'Não confirmado pela API',
 attributeAudit:{attributes:[],missingMandatory:0}};
const live={item_id:22095398152,item_name:'Piscina antiga',description:'Descrição anterior',
 description_type:'normal',category_id:101,item_status:'NORMAL',
 tax_info:{},image:{image_id_list:['old-image-1']},attribute_list:[],video_info:[]};
const tax={ncm:'95069900',origin:'2',csosn:'102',same_state_cfop:'5106',
 diff_state_cfop:'6106',measure_unit:'UN',cest:'',
 evidence:'Catálogo fiscal WeDrop conferido para a SKU TRC1525'};
const review={stages:{seo:{reviewed:true},description:{reviewed:true},fiscal:{reviewed:true}},
 draftTitle:approvedTitle,draftDescription:approvedDescription,tax};
const input={shopId:9,itemId:record.itemId,modelId:'0',sku:record.sku,record,review,live};
const oldError='product.error_busi: Please upload the corresponding CEST of NCM';

test('CEST em branco nunca recebe valor inventado e fiscal pode ficar de fora da otimização',()=>{
 const ordinary=compileShopeeExecutionPlan(input);
 assert.equal(ordinary.proposed.tax_info.ncm,'95069900');
 assert.equal(ordinary.proposed.tax_info.cest,undefined);
 const deferred=compileShopeeExecutionPlan({...input,deferUnconfirmedFiscal:true});
 assert.equal(deferred.fiscalDeferred,true);
 assert.equal(deferred.canExecute,true);
 assert.ok(deferred.actions.includes('item_name'));
 assert.ok(deferred.actions.includes('description'));
 assert.equal(deferred.actions.includes('tax_info'),false);
 assert.equal(Object.hasOwn(deferred.proposed,'tax_info'),false);
 assert.ok(deferred.warnings.some(x=>/CEST em branco.*não serão enviados/i.test(x)));
 const prior={proposed:{tax_info:{ncm:'95069900'}},original:{tax_info:{}}};
 assert.equal(needsCestRevalidation(oldError,prior,ordinary),true);
});
test('se só havia alteração fiscal e CEST está em branco, não simula sucesso',()=>{
 const onlyTax={...review,stages:{fiscal:{reviewed:true}},draftTitle:'',
   draftDescription:''};
 const quiet={...input,review:onlyTax};
 const deferred=compileShopeeExecutionPlan({...quiet,deferUnconfirmedFiscal:true});
 assert.equal(deferred.canExecute,false);
 assert.deepEqual(deferred.actions,[]);
 assert.equal(deferred.fiscalDeferred,true);
});
test('CEST validado restaura o processamento fiscal habitual sem enviar 00 automaticamente',()=>{
 const withCest={...input,review:{...review,tax:{...tax,cest:'1234567'}}};
 const result=compileShopeeExecutionPlan({...withCest,deferUnconfirmedFiscal:true});
 assert.equal(result.fiscalDeferred,false);
 assert.equal(result.proposed.tax_info.cest,'1234567');
 assert.ok(result.actions.includes('tax_info'));
});
test('rascunho fiscal alterado depois do pré-voo invalida a assinatura do plano',()=>{
 const first=compileShopeeExecutionPlan({...input,deferUnconfirmedFiscal:true});
 const changed=compileShopeeExecutionPlan({...input,deferUnconfirmedFiscal:true,
  review:{...review,tax:{...tax,same_state_cfop:'5102'}}});
 assert.notEqual(first.fingerprint,changed.fingerprint);
});
test('worker realmente omite tax_info no update_item, continua verificando Shopee após resposta',async()=>{
 const deferred=compileShopeeExecutionPlan({...input,deferUnconfirmedFiscal:true});
 const job={state:'running',plan:deferred,result:{phase:'queued'}};
 let body=null;
 const next=await advanceShopeeExecution(job,{
  validateIdentity:async()=>{},read:async()=>live,beforeWrite:async()=>{},
  update:async b=>{body=b;return {request_id:'r1'};}
 });
 assert.ok(body);
 assert.equal(Object.hasOwn(body,'tax_info'),false);
 assert.equal(body.item_name,approvedTitle);
 assert.equal(next.state,'running');
 assert.equal(next.result.phase,'verifying');
});
test('erro de validação vindo da Shopee continua explícito; não gera êxito falso',async()=>{
 const deferred=compileShopeeExecutionPlan({...input,deferUnconfirmedFiscal:true});
 const job={state:'running',plan:deferred,result:{phase:'queued'}};
 const out=await advanceShopeeExecution(job,{
  validateIdentity:async()=>{},read:async()=>live,beforeWrite:async()=>{},
  update:async()=>{throw Error(oldError)}
 });
 assert.equal(out.state,'failed');
 assert.match(out.lastError,/CEST/);
});
test('backend ignora a regra histórica que bloqueava cada publicação por CEST ausente',()=>{
 const server=readFileSync(new URL('../server.js',import.meta.url),'utf8');
 assert.match(server,/deferUnconfirmedFiscal:true/);
 assert.match(server,/deferUnconfirmedFiscal:plan\.fiscalDeferred===true/);
 assert.doesNotMatch(server,/plan\.blocked\.push\('Informações fiscais: a Shopee já exigiu CEST/);
 assert.match(server,/issue:deferFiscal&&!plan\.canExecute\?/);
 assert.match(server,/priorFiscalDeferred=previous\?\.sku===sku&&previous\?\.plan\?\.fiscalDeferred===true/);
 const app=readFileSync(new URL('../public/app.js',import.meta.url),'utf8');
 assert.match(app,/CEST mantido em branco\. Dados fiscais NÃO serão enviados/);
});
