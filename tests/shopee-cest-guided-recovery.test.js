import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {detectShopeeExecutionIssue,isDefinitiveShopeeRejection,needsCestRevalidation} from '../shopeeExecutionIssues.js';
import {advanceShopeeExecution} from '../shopeeExecutionWorker.js';
const msg='product.error_busi: Please upload the corresponding CEST of NCM · request_id: test-123';
const plan={sku:'TRC1525',itemId:'22095398152',requiresExplicitConfirmation:true,canExecute:true,
 original:{item_name:'Piscina teste',description:'Descrição',description_type:'normal',category_id:4,
 image:{image_id_list:[]}},proposed:{tax_info:{ncm:'95069900',origin:'2'}},images:[],video:null};
test('erro Shopee CEST vira diagnóstico fiscal do NCM realmente usado, sem inventar CEST',()=>{
 const issue=detectShopeeExecutionIssue('Atualização sem confirmação: '+msg,plan);
 assert.equal(issue.code,'CEST_REQUIRED');
 assert.equal(issue.field,'cest');
 assert.equal(issue.section,'fiscal');
 assert.equal(issue.ncm,'95069900');
 assert.equal(issue.suppliedCest,null);
 assert.match(issue.guidance,/não.*(código|00)/i);
 assert.equal(isDefinitiveShopeeRejection(msg),true);
 assert.equal(isDefinitiveShopeeRejection('fetch timeout'),false);
 assert.equal(detectShopeeExecutionIssue('Rate limit exceeded',plan),null);
});
test('pré-voo de mesma SKU e NCM não reenvia erro CEST enquanto não for preenchido',()=>{
 assert.equal(needsCestRevalidation(msg,plan,plan),true);
 assert.equal(needsCestRevalidation(msg,plan,{...plan,proposed:{tax_info:{ncm:'95069900',cest:'1234567'}}}),false);
 assert.equal(needsCestRevalidation(msg,plan,{...plan,proposed:{tax_info:{ncm:'95060000'}}}),false);
 assert.equal(needsCestRevalidation('timeout',plan,plan),false);
});
const live={item_id:22095398152,item_name:'Piscina teste',description:'Descrição',description_type:'normal',
 category_id:4,item_status:'NORMAL',tax_info:{},image:{image_id_list:[]}};
test('rejeição fiscal reconhecida como business HTTP recusa a gravação e não fica incerta',async()=>{
 const job={plan,result:{phase:'queued'},state:'running'};
 const result=await advanceShopeeExecution(job,{
  validateIdentity:async()=>{},read:async()=>live,beforeWrite:async()=>{},
  update:async()=>{throw Error(msg)}
 });
 assert.equal(result.state,'failed');
 assert.equal(result.result.phase,'updating');
 assert.match(result.lastError,/corresponding CEST of NCM/);
 assert.ok(result.result.events.some(e=>e.key==='fiscal-rejected'));
});
test('timeouts permanecem incertos, sem reenvio automático',async()=>{
 const job={plan,result:{phase:'queued'},state:'running'};
 const result=await advanceShopeeExecution(job,{
  validateIdentity:async()=>{},read:async()=>live,beforeWrite:async()=>{},
  update:async()=>{throw Error('fetch timeout')}
 });
 assert.equal(result.state,'uncertain');
});
test('tela usa retorno da API, destaca campo e preserva bloqueio de reenvio',()=>{
 const html=readFileSync(new URL('../public/index.html',import.meta.url),'utf8');
 const app=readFileSync(new URL('../public/app.js',import.meta.url),'utf8');
 const server=readFileSync(new URL('../server.js',import.meta.url),'utf8');
 assert.match(html,/id="optimizerExecutionIssue"/);
 assert.match(html,/id="optimizerExecutionFix"/);
 assert.match(app,/optimizerExecutionIssueRender\(issue\)/);
 assert.match(app,/optimizerWorkflowOpen\('fiscal'\)/);
 assert.match(app,/\[data-tax-field="cest"\]/);
 assert.match(server,/needsCestRevalidation\(previous\.last_error,previous\.plan,plan\)/);
 assert.match(server,/issue:owned\?detectShopeeExecutionIssue/);
});
