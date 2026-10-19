import test from 'node:test';
import assert from 'node:assert/strict';
import {sameShopeeAttributes} from '../shopeeStructuredFields.js';
import {assertLiveShopeeUnchanged} from '../shopeeExecutionPlan.js';

const original=[
 {attribute_id:100162,attribute_value_list:[{value_id:0,original_value_name:'Estampado',value_unit:''}]},
 {attribute_id:100413,attribute_value_list:[{value_id:0,original_value_name:'Novo',value_unit:''}]},
 {attribute_id:100942,attribute_value_list:[{value_id:0,original_value_name:'88 x 135 x 43 cm',value_unit:''}]}
];
const current={
 item_id:22095398152,item_name:'Título anterior',description:'Descrição anterior',description_type:'normal',
 category_id:15,item_status:'NORMAL',
 attribute_list:original,tax_info:{ncm:'95069900',origin:'2'},image:{image_id_list:[123]}
};
const plan={
 itemId:'22095398152',proposed:{attribute_list:original,tax_info:{ncm:'95069900',origin:'2'}},
 images:[],
 original:{
  item_name:current.item_name,description:current.description,description_type:'normal',
  category_id:15,attribute_list:original,tax_info:{...current.tax_info},image:{image_id_list:[123]}
 }
};
test('reordenação da resposta Shopee não altera a ficha técnica',()=>{
 const reordered=structuredClone(original).reverse();
 assert.equal(sameShopeeAttributes(original,reordered),true);
 assert.equal(sameShopeeAttributes(original,reordered.map(x=>({...x,source:'extra metadata'}))),true);
 assert.doesNotThrow(()=>assertLiveShopeeUnchanged(plan,{...current,attribute_list:reordered}));
});
test('alterações verdadeiras nos atributos ainda bloqueiam execução',()=>{
 const changed=structuredClone(original);
 changed[0].attribute_value_list[0].original_value_name='Liso';
 assert.equal(sameShopeeAttributes(original,changed),false);
 assert.throws(()=>assertLiveShopeeUnchanged(plan,{...current,attribute_list:changed}),/ficha técnica.*modificada/);
 const added=[...original,{attribute_id:99999,attribute_value_list:[{value_id:0,original_value_name:'Outra característica'}]}];
 assert.throws(()=>assertLiveShopeeUnchanged(plan,{...current,attribute_list:added}),/ficha técnica.*modificada/);
});
test('divergência fiscal, título e descrição continuam impedindo execução',()=>{
 assert.throws(()=>assertLiveShopeeUnchanged(plan,{...current,tax_info:{ncm:'00000000',origin:'2'}}),/dados fiscais.*mudaram/i);
 assert.throws(()=>assertLiveShopeeUnchanged(plan,{...current,item_name:'Novo título externo'}),/Anúncio alterado após preparação/);
 assert.throws(()=>assertLiveShopeeUnchanged(plan,{...current,description:'Mudança externa'}),/Anúncio alterado após preparação/);
});
