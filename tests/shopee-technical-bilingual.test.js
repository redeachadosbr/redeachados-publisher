import test from 'node:test';
import assert from 'node:assert/strict';
import {supplierAttributeSuggestions} from '../shopeeSupplierEvidenceFacts.js';

const supplier={source_file:'produtos-catalogo.csv',supplier_sku:'1175',
 product_data:{name:'Bola Futebol Infantil N2',material:'Vinil',
 description:'Material: Vinil\nDimensões do produto: 12cm de altura x 10cm de largura x 9cm de comprimento'}};
const attrs=[
 {id:1,name:'Material',inputType:3,values:[]},
 {id:2,name:'Ball Size',inputType:1,options:[{id:22,name:'Nº 2'}],values:[]},
 {id:3,name:'Length',inputType:3,formatType:2,allowedUnits:['cm'],values:[]},
 {id:4,name:'Custom Product',inputType:1,options:[{id:10,name:'Yes'},{id:11,name:'No'}],values:[]},
 {id:5,name:'Warranty Duration',inputType:3,values:[]}
];
test('facts WeDrop correspondem a atributos Shopee em inglês com proveniência',()=>{
 const result=supplierAttributeSuggestions({supplier,attributes:attrs});
 assert.equal(result.suggestions.find(x=>x.attributeId===1)?.values[0].valueName,'Vinil');
 assert.equal(result.suggestions.find(x=>x.attributeId===2)?.values[0].valueId,22);
 const length=result.suggestions.find(x=>x.attributeId===3)?.values[0];
 assert.equal(length?.valueName,'9');
 assert.equal(length?.unit,'cm');
 assert.equal(result.suggestions.some(x=>x.attributeId===4),false);
 assert.equal(result.suggestions.some(x=>x.attributeId===5),false);
});
test('texto de print em linhas separadas reconhece modelo e não inventa atributos',()=>{
 const result=supplierAttributeSuggestions({attributes:[{id:8,name:'Model',inputType:3,values:[]}],
  sourceText:'MODELO\nDDG5102',supplier:null});
 assert.equal(result.suggestions.find(x=>x.attributeId===8)?.values[0].valueName,'DDG5102');
});
test('não substitui atributo já cadastrado',()=>{
 const result=supplierAttributeSuggestions({supplier,attributes:[{
  id:1,name:'Material',inputType:3,values:[{name:'Vinil',valueId:1}]
 }]});
 assert.equal(result.suggestions.length,0);
});
