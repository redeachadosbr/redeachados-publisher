import test from 'node:test';
import assert from 'node:assert/strict';
import {conditionAttributeVerified,fieldsVerified} from '../shopeeStructuredFields.js';
import {compileShopeeExecutionPlan,shopeeExecutionUnconfirmedFields} from '../shopeeExecutionPlan.js';
import {shopeeExecutionProgress} from '../shopeeExecutionProgress.js';

const condition={attribute_id:100413,attribute_value_list:[{value_id:0,original_value_name:'NOVO'}]};
const sku='303448',itemId='58271290960';
const record={itemId,selectedModelId:'0',sku,status:'NORMAL',imageCount:9,videoStatus:'Publicado',
 attributeAudit:{attributes:[{id:100413,name:'Condition',mandatory:false,conditional:false,inputType:2,
  validationType:2,options:[],values:[]}],missingMandatory:0}};
const review={stages:{technical:{reviewed:true},fiscal:{reviewed:true}},
 attributes:[{attributeId:100413,values:[{valueId:0,valueName:'NOVO'}],evidence:'Estado informado pelo vendedor'}],
 tax:{ncm:'95030010',origin:'2',same_state_cfop:'5106',diff_state_cfop:'6106',csosn:'102',
 evidence:'Ficha fiscal consultada na WeDrop'}};
const live={item_id:Number(itemId),item_status:'NORMAL',condition:'NEW',item_name:'Dinossauro',
 description:'Descrição',description_type:'normal',category_id:12345,
 image:{image_id_list:[]},attribute_list:[],video_info:[],tax_info:{}};
const ctx={shopId:852701218,itemId,modelId:'0',sku,record,review,live,selectedStage:'all'};

test('Shopee condition=NEW comprova Condição=NOVO sem attribute_list[100413]',()=>{
 assert.equal(conditionAttributeVerified(condition,live),true);
 assert.equal(fieldsVerified({attribute_list:[condition]},live),true);
 assert.deepEqual(shopeeExecutionUnconfirmedFields({itemId,images:[],video:null,
  proposed:{attribute_list:[condition]}},live),[]);
});
test('SKU 303448 ficha técnica completa permite seguir à próxima etapa fiscal sem update_item de atributos',()=>{
 const plan=compileShopeeExecutionPlan(ctx);
 assert.equal(plan.confirmedStages.technical,true);
 assert.equal(Object.hasOwn(plan.proposed,'attribute_list'),false);
 assert.equal(plan.finalFiscal?.ncm,'95030010');
 assert.equal(plan.canExecute,true);
 const progress=shopeeExecutionProgress({plan,state:'prepared',result:null});
 assert.equal(progress.steps.find(x=>x.id==='technical').status,'done');
 assert.equal(progress.steps.find(x=>x.id==='fiscal').status,'waiting');
});
test('Condição realmente diferente ou API omissa não pode ser marcada como aprovada',()=>{
 for(const conditionValue of ['USED',null,'']) {
  const current={...live,condition:conditionValue};
  assert.equal(conditionAttributeVerified(condition,current),false);
  assert.equal(fieldsVerified({attribute_list:[condition]},current),false);
  const plan=compileShopeeExecutionPlan({...ctx,live:current});
  assert.equal(plan.confirmedStages.technical,false);
  assert.equal(Object.hasOwn(plan.proposed,'attribute_list'),true);
 }
});
test('Sem reclassificar atributos opcionais não relacionados como aprovados',()=>{
 const extra={attribute_id:102292,attribute_value_list:[{value_id:0,original_value_name:'80 cm'}]};
 assert.equal(fieldsVerified({attribute_list:[condition,extra]},live),false);
 assert.equal(conditionAttributeVerified({...condition,attribute_id:102292},live),false);
 assert.equal(conditionAttributeVerified({...condition,
  attribute_value_list:[{value_id:123,original_value_name:'NOVO'}]},live),false);
});
