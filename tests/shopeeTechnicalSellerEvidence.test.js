import test from 'node:test';
import assert from 'node:assert/strict';
import {applySellerDeclarations,sellerDeclarationEvidence} from '../shopeeTechnicalSellerEvidence.js';

const schema=[
 {id:101,name:'País ou região de origem'},
 {id:102,name:'Quantidade'},
 {id:103,name:'Registro INMETRO'},
 {id:104,name:'Material'}
];
test('país Brasil escolhido pelo vendedor recebe fonte declarada sem trocar valor',()=>{
 const [result]=applySellerDeclarations([
  {attributeId:101,evidence:'',values:[{valueId:12,valueName:'Brasil'}]}],schema);
 assert.equal(result.evidence,'Informado e confirmado pelo vendedor');
 assert.equal(result.values[0].valueName,'Brasil');
});
test('quantidade 1 recebe fonte padrão e dispensa preenchimento repetitivo',()=>{
 const [result]=applySellerDeclarations([
  {attributeId:102,evidence:'',values:[{valueId:0,valueName:'1'}]}],schema);
 assert.equal(result.evidence,'Informado e confirmado pelo vendedor');
});
test('campos sensíveis continuam exigindo documento ou indicação manual',()=>{
 const result=applySellerDeclarations([
  {attributeId:103,evidence:'',values:[{valueId:0,valueName:'014015/2025'}]},
  {attributeId:104,evidence:'',values:[{valueId:0,valueName:'Plástico'}]}
 ],schema);
 assert.equal(result[0].evidence,'');assert.equal(result[1].evidence,'');
});
test('campo de país vazio nunca é preenchido automaticamente',()=>{
 assert.equal(sellerDeclarationEvidence({evidence:'',values:[]},schema[0]),'');
 assert.equal(sellerDeclarationEvidence({evidence:'',values:[{valueId:-1,valueName:''}]},schema[0]),'');
});
test('fonte específica informada pelo vendedor prevalece sobre o padrão',()=>{
 const [result]=applySellerDeclarations([{attributeId:102,
  evidence:'Nota do fornecedor',values:[{valueId:0,valueName:'1'}]}],schema);
 assert.equal(result.evidence,'Nota do fornecedor');
});
