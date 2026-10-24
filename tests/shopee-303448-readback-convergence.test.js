import test from 'node:test';
import assert from 'node:assert/strict';
import {approvedShopeeReadbackConvergence} from '../shopeeExecutionPlan.js';

const title='🦖 Caminhão Dinossauro 3 Mini Carrinhos',desc='Descrição comercial aprovada';
const tech={attribute_list:[{attribute_id:100413,
 attribute_value_list:[{value_id:0,original_value_name:'NOVO'}]}]};
const plan={
 sku:'303448',itemId:'58271290960',modelId:'0',selectedStage:'all',
 proposed:{item_name:title,description:desc,...tech},
 finalFiscal:{ncm:'95030010'},images:[],video:null,
 modelVariations:null,discountOnly:false,fiscalDeferred:false
};
const fresh={...plan,proposed:{...tech},blocked:[]};
test('readback exato de título e descrição permite avançar sem reautorizar alterações novas',()=>{
 assert.equal(approvedShopeeReadbackConvergence(plan,fresh,{
  item_id:58271290960,item_name:title,description:desc
 }),true);
});
test('título não comprovado impede convergência e bloqueia repetição',()=>{
 assert.equal(approvedShopeeReadbackConvergence(plan,fresh,{
  item_id:58271290960,item_name:'Outro título',description:desc
 }),false);
});
test('ficha técnica alterada após aprovação nunca é executada sob aprovação anterior',()=>{
 const wrong={...fresh,proposed:{attribute_list:[{attribute_id:100413,
  attribute_value_list:[{value_id:0,original_value_name:'USADO'}]}]}};
 assert.equal(approvedShopeeReadbackConvergence(plan,wrong,{item_name:title,description:desc}),false);
});
test('novos campos, fiscal, desconto ou modelo exigem nova aprovação',()=>{
 assert.equal(approvedShopeeReadbackConvergence(plan,{
  ...fresh,proposed:{...tech,extra:'novo campo'}
 },{item_name:title,description:desc}),false);
 assert.equal(approvedShopeeReadbackConvergence(plan,{
  ...fresh,finalFiscal:{ncm:'00000000'}
 },{item_name:title,description:desc}),false);
 assert.equal(approvedShopeeReadbackConvergence(plan,{
  ...fresh,modelVariations:{options:[]}
 },{item_name:title,description:desc}),false);
});
