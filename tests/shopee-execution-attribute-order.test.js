import test from 'node:test';
import assert from 'node:assert/strict';
import {compileShopeeExecutionPlan,assertLiveShopeeUnchanged,approvedShopeeReadbackConvergence} from '../shopeeExecutionPlan.js';
import {sameShopeeAttributes} from '../shopeeStructuredFields.js';

const attributes=[
 {attribute_id:100942,original_attribute_name:'Dimension',is_mandatory:false,
  attribute_value_list:[{value_id:0,original_value_name:'88 x 49 x 28',value_unit:''}]},
 {attribute_id:100134,original_attribute_name:'Material',is_mandatory:false,
  attribute_value_list:[{value_id:1201,original_value_name:'ABS',value_unit:''},
   {value_id:1223,original_value_name:'Metal',value_unit:''}]}
];
const live={item_id:123456,item_sku:'CAR-6V',item_status:'NORMAL',
 item_name:'Carrinho azul',description:'Descrição atual',description_type:'normal',
 category_id:101010,attribute_list:attributes,tax_info:{},image:{image_id_list:[]},video_info:[]};
const record={sku:'CAR-6V',itemId:'123456',selectedModelId:'0',status:'NORMAL',
 imageCount:9,attributeAudit:{missingMandatory:0,attributes:[
  {id:100942,name:'Dimensões',inputType:2,options:[]},
  {id:100134,name:'Material',inputType:5,options:[{id:1201,name:'ABS'},{id:1223,name:'Metal'}]}
 ]}};
const review={stages:{technical:{reviewed:true}},attributes:[
 {attributeId:100942,valueId:0,valueName:'90 x 50 x 31 cm'}
]};
const inputs={shopId:1,itemId:'123456',modelId:'0',sku:'CAR-6V',record,review,live};
const reordered=()=>({...live,attribute_list:[...attributes].reverse().map(a=>({
 ...a,original_attribute_name:'Rótulo da API',is_mandatory:true,
 attribute_value_list:[...a.attribute_value_list].reverse()
}))});

test('ordem e metadados da API não mudam a prévia aprovada da ficha técnica',()=>{
 const before=compileShopeeExecutionPlan(inputs);
 const current=reordered(),after=compileShopeeExecutionPlan({...inputs,live:current});
 assert.equal(before.canExecute,true);
 assert.equal(after.canExecute,true);
 assert.equal(sameShopeeAttributes(before.proposed.attribute_list,after.proposed.attribute_list),true);
 assert.doesNotThrow(()=>assertLiveShopeeUnchanged(before,current));
 assert.equal(after.fingerprint,before.fingerprint);
});

test('prévias anteriores à correção continuam válidas somente para os mesmos valores',()=>{
 const saved=JSON.parse(JSON.stringify(compileShopeeExecutionPlan(inputs)));
 saved.fingerprint='hash-antigo-com-ordem-da-api';
 const current=reordered(),fresh=compileShopeeExecutionPlan({...inputs,live:current});
 assert.equal(approvedShopeeReadbackConvergence(saved,fresh,current),true);
 assert.deepEqual(saved.proposed.attribute_list.map(a=>a.attribute_id),[100942,100134]);
});

test('mudanças de valor, unidade, identidade, inclusão ou exclusão continuam bloqueadas',()=>{
 const saved=compileShopeeExecutionPlan(inputs),fresh=compileShopeeExecutionPlan({...inputs,live:reordered()});
 const mutations=[
  x=>{x[0].attribute_value_list[0].value_id=999;},
  x=>{x[0].attribute_value_list[0].original_value_name='Plástico diferente';},
  x=>{x[0].attribute_value_list[0].value_unit='KG';},
  x=>{x[0].attribute_id=999999;},
  x=>{x.push({attribute_id:100999,attribute_value_list:[{value_id:0,original_value_name:'2'}]});},
  x=>{x.pop();},
  x=>{x[0].attribute_value_list.pop();}
 ];
 for(const change of mutations){
  const altered=structuredClone(fresh);change(altered.proposed.attribute_list);
  assert.equal(approvedShopeeReadbackConvergence(saved,altered,live),false);
 }
 const changed=compileShopeeExecutionPlan({...inputs,review:{...review,
  attributes:[{attributeId:100942,valueId:0,valueName:'Outro tamanho'}]}});
 assert.notEqual(changed.fingerprint,saved.fingerprint);
});

test('a equivalência da ficha técnica não autoriza novas fotos, textos ou valores fiscais',()=>{
 const saved=compileShopeeExecutionPlan(inputs),fresh=compileShopeeExecutionPlan({...inputs,live:reordered()});
 for(const change of [
  x=>{x.proposed.item_name='Título diferente';},
  x=>{x.proposed.description='Descrição diferente';},
  x=>{x.finalFiscal={ncm:'95030097',cest:'00'};},
  x=>{x.images=[{slot:1,sha256:'foto-nova'}];},
  x=>{x.video={sha256:'video-novo'};},
  x=>{x.modelVariations={options:[],promotion:{promo:1}};}
 ]){
  const altered=structuredClone(fresh);change(altered);
  assert.equal(approvedShopeeReadbackConvergence(saved,altered,live),false);
 }
});
