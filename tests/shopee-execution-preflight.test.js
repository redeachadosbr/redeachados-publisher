import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {approvedTitle,approvedDescription} from './fixtures/approved-content.js';
import {compileShopeeExecutionPlan,confirmShopeeExecution,assertLiveShopeeUnchanged,
  verifyShopeeExecution} from '../shopeeExecutionPlan.js';
const source=readFileSync(new URL('../server.js',import.meta.url),'utf8');
const html=readFileSync(new URL('../public/index.html',import.meta.url),'utf8');
const js=readFileSync(new URL('../public/app.js',import.meta.url),'utf8');
const record={itemId:'22095398152',selectedModelId:'179732416931',sku:'TRC1525',
  title:'Piscina Inflável - Azul',status:'NORMAL',imageCount:5,
  videoStatus:'Não confirmado pela API',attributeAudit:{missingMandatory:0}};
const original={item_id:22095398152,item_name:'Piscina Inflável - Azul',
  description:'Piscina atual com descrição existente da Shopee.',description_type:'normal'};
const state={stages:{seo:{reviewed:true},description:{reviewed:true}},
  draftTitle:approvedTitle,draftDescription:approvedDescription};
const inputs={shopId:991,itemId:record.itemId,modelId:record.selectedModelId,
  sku:record.sku,record,review:state,live:original};
test('generates executable, review-scoped plan for exact Shopee item and SKU',()=>{
  const p=compileShopeeExecutionPlan(inputs);
  assert.equal(p.canExecute,true);
  assert.deepEqual(p.actions,['item_name','description']);
  assert.equal(p.proposed.item_name,state.draftTitle);
  assert.equal(p.proposed.description,state.draftDescription);
  assert.ok(p.warnings.some(x=>x.includes('5/9')));
  assert.ok(p.requiresExplicitConfirmation);
  assert.equal(p.marketplaceUpdated,false);
  assert.match(p.scope,/aprovados/);
});
test('unreviewed fields and uncertain media cannot auto-publish',()=>{
  const p=compileShopeeExecutionPlan({...inputs,review:{
    stages:{seo:{reviewed:false},description:{reviewed:false}},draftTitle:state.draftTitle,
    draftDescription:state.draftDescription}});
  assert.equal(p.canExecute,false);
  assert.deepEqual(p.proposed,{});
  assert.ok(p.blocked.length>=2);
  assert.equal(p.actions.length,0);
});
test('extended descriptions are safely excluded from automatic edit',()=>{
  const p=compileShopeeExecutionPlan({...inputs,live:{...original,description_type:'extended'}});
  assert.equal('description' in p.proposed,false);
  assert.ok(p.blocked.some(x=>x.includes('estendida')));
  assert.equal(p.canExecute,false);
});
test('persisted review flags cannot bypass current title and description rules',()=>{
 for(const overrides of [
  {draftTitle:'Título antigo curto'},
  {draftDescription:'Descrição antiga '.repeat(8)},
  {draftDescription:approvedDescription.replace(/\n/g,'\\n')},
  {draftDescription:approvedDescription.replace('5. Precisa de supervisão?','-. Precisa de supervisão?')}
 ]){
  const plan=compileShopeeExecutionPlan({...inputs,review:{...state,...overrides}});
  assert.equal(plan.canExecute,false);
  assert.ok(plan.blocked.length>0);
 }
});
test('confirmation is exact, and current listing must match baseline',()=>{
  const p=compileShopeeExecutionPlan(inputs);
  assert.throws(()=>confirmShopeeExecution(p,{sku:'TRC1525',confirmation:'OK'}),/Confirmação/);
  assert.throws(()=>confirmShopeeExecution(p,{sku:'OUTRA',confirmation:'EXECUTAR TRC1525'}),/Confirmação/);
  assert.doesNotThrow(()=>confirmShopeeExecution(p,{sku:'TRC1525',confirmation:'EXECUTAR TRC1525'}));
  assert.doesNotThrow(()=>assertLiveShopeeUnchanged(p,original));
  assert.throws(()=>assertLiveShopeeUnchanged(p,{...original,item_name:'alterado'}),/alterado/);
  assert.equal(verifyShopeeExecution(p,{...original,...p.proposed}),true);
  assert.equal(verifyShopeeExecution(p,{...original,...p.proposed,description:'old'}),false);
});
test('executor keeps stock, prices and promotions out of the approved content flow',()=>{
  const begin=source.indexOf("app.post('/api/shopee/optimizer/execution/execute'");
  const end=source.indexOf("app.get('/api/shopee/optimizer/settings'",begin);
  assert.ok(begin>0&&end>begin);
  const route=source.slice(begin,end);
  assert.match(route,/method:'POST'/);
  assert.match(route,/product\/update_item/);
  assert.match(route,/acceptPartialExecution/);
  assert.match(route,/assertLiveShopeeUnchanged/);
  assert.match(route,/claimShopeePreparedExecution/);
  assert.match(route,/verifyShopeeExecution/);
  assert.doesNotMatch(route,/update_price|update_stock|update_discount|add_discount|set_video|upload_image/);
  const exec=html.slice(html.indexOf('id="optimizerExecutionPanel"'),
    html.indexOf('id="optimizerAuditPanel"'));
  for(const id of ['optimizerExecutionPrepare','optimizerExecutionStatus','optimizerExecutionSummary',
     'optimizerExecutionConfirmation','optimizerExecutionAccept','optimizerExecutionInput','optimizerExecutionRun'])
    assert.match(exec,new RegExp('id="'+id+'"'));
  assert.match(js,/optimizerExecutionPrepare\(\)/);
  assert.match(js,/optimizerExecutionAccept/);
  assert.match(js,/optimizerExecutionRun'\)\?\.addEventListener/);
});

