import test from 'node:test';
import assert from 'node:assert/strict';
import {fiscalMatrixSource,technicalMatrixSource} from '../shopeeMatrixRules.js';

const sku='ABC-001',supplier={
 supplier_sku:sku,matchedBy:'exact-sku',source_file:'catalogo.csv',
 product_data:{ncm:'95069900'}
};
const tax={ncm:'95069900',evidence:'Catálogo WeDrop ABC-001'};
const record={sku,categoryId:1234,attributeAudit:{attributes:[
 {id:100,mandatory:true,inputType:2},{id:101,mandatory:false,inputType:3}
]}};
const attributes=[{attributeId:100,values:[{valueId:0,valueName:'Novo'}],evidence:'Ficha do fabricante'}];

test('Motor Matriz usa a mesma regra fiscal e técnica em qualquer SKU',()=>{
 const result=fiscalMatrixSource({sku,supplier,tax});
 assert.deepEqual({sku:result.sku,ncm:result.ncm,source:result.source},{sku,ncm:'95069900',source:'exact-sku'});
 assert.deepEqual(technicalMatrixSource({sku,record,attributes}),{sku,categoryId:1234});
 assert.equal(fiscalMatrixSource({
  sku:'OUTRA-SKU',supplier:{supplier_sku:'OUTRA-SKU',matchedBy:'exact-sku',product_data:{ncm:'12345678'}},
  tax:{ncm:'12345678',evidence:'NF 777'}}).ncm,'12345678');
});
test('Motor Matriz bloqueia NCM divergente, fonte perdida e vínculo trocado',()=>{
 assert.throws(()=>fiscalMatrixSource({sku,supplier,tax:{...tax,ncm:'00000000'}}),/diverge/);
 assert.throws(()=>fiscalMatrixSource({sku,supplier:null,tax}),/não está vinculada/);
 assert.throws(()=>fiscalMatrixSource({sku,supplier:{...supplier,supplier_sku:'OUTRA'} ,tax}),/diverge da SKU/);
 assert.throws(()=>fiscalMatrixSource({sku,supplier,tax,reviewSource:{sku:'OUTRA',ncm:tax.ncm}}),/outra SKU/);
 assert.throws(()=>fiscalMatrixSource({sku,supplier,tax,reviewSource:{sku,ncm:tax.ncm,supplierSku:'ANTIGO'}}),/vínculo WeDrop/);
 assert.throws(()=>fiscalMatrixSource({sku,supplier,tax:{ncm:'95',evidence:'nota'}}),/oito dígitos/);
 assert.doesNotThrow(()=>fiscalMatrixSource({sku:'ABC',supplier:null,tax:{ncm:'95069900',evidence:'Nota fiscal validada pelo contador'}}));
});
test('Motor Matriz rejeita atributos fora da categoria e revisões reaproveitadas',()=>{
 assert.throws(()=>technicalMatrixSource({sku,record,attributes:[{attributeId:999,evidence:'Fonte'}]}),/não pertence/);
 assert.throws(()=>technicalMatrixSource({sku,record,attributes:[{attributeId:100,evidence:' '}]}),/informe a fonte/);
 assert.throws(()=>technicalMatrixSource({sku,record,attributes,reviewSource:{sku,categoryId:222}}),/categoria técnica mudou/);
 assert.throws(()=>technicalMatrixSource({sku,record:{...record,sku:'DIFERENTE'},attributes}),/outra SKU/);
 assert.doesNotThrow(()=>technicalMatrixSource({sku,record,attributes,reviewSource:{sku,categoryId:1234}}));
});
