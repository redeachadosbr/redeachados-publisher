import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {compileTax,SHOPEE_OPTIONAL_TAX_FIELDS} from '../shopeeStructuredFields.js';
import {supplierWorkflowFacts} from '../shopeeSupplierFacts.js';
import {fiscalMatrixSource} from '../shopeeMatrixRules.js';
import {needsCestRevalidation} from '../shopeeExecutionIssues.js';

const reviewed={ncm:'95069900',origin:'2',same_state_cfop:'5106',
 diff_state_cfop:'6106',csosn:'102',measure_unit:'UN',
 pis_cofins_cst:'',cest:'',evidence:'WeDrop SKU TRC1525: NCM confirmado pela ficha fiscal'};
const supplier={supplier_sku:'TRC1525',matchedBy:'exact-sku',
 product_data:{ncm:'95069900'},source_file:'catalogo.csv',source_line:5306};
test('CST PIS/COFINS em branco é opcional na otimização, com NCM e fonte aprovados',()=>{
 assert.ok(SHOPEE_OPTIONAL_TAX_FIELDS.includes('pis_cofins_cst'));
 assert.doesNotThrow(()=>compileTax(reviewed,{tax_info:{}}));
 const info=compileTax(reviewed,{tax_info:{}});
 assert.equal(info.ncm,'95069900');
 assert.equal(Object.hasOwn(info,'pis_cofins_cst'),false);
 assert.equal(Object.hasOwn(info,'cest'),false);
 assert.equal(info.csosn,'102');
 assert.deepEqual(fiscalMatrixSource({sku:'TRC1525',supplier,tax:reviewed}).ncm,'95069900');
});
test('CST informado explicitamente é aceito se válido, mas não é preenchido automaticamente',()=>{
 assert.equal(compileTax({...reviewed,pis_cofins_cst:'99'},{tax_info:{}}).pis_cofins_cst,'99');
 assert.throws(()=>compileTax({...reviewed,pis_cofins_cst:'inválido'},{tax_info:{}}),/pis_cofins_cst/);
 assert.equal(compileTax({...reviewed,pis_cofins_cst:''},{tax_info:{pis_cofins_cst:'99'}}).pis_cofins_cst,'99',
  'CST existente da Shopee não deve ser apagado silenciosamente');
});
test('notas de emissão fiscal não autopreenchem CST na otimização Shopee',()=>{
 const info=supplierWorkflowFacts({...supplier,source_file:'catalogo.csv'},
   {attributeAudit:{attributes:[]},description:'Piscina infantil'},
   {fiscal_notes:'Origem: 2\nCSOSN: 102\nPISCOFIS: 99\nCFOP Mesmo Estado: 5106'});
 assert.equal(Object.hasOwn(info.taxSuggestion,'pis_cofins_cst'),false);
 assert.equal(info.taxSuggestion.csosn,'102');
 assert.equal(info.taxSuggestion.origin,'2');
 assert.equal(info.taxSuggestion.ncm,'95069900');
});
test('deixar CST em branco não dispensa CEST já exigido pela Shopee',()=>{
 const oldPlan={original:{tax_info:{}},proposed:{tax_info:{ncm:'95069900',pis_cofins_cst:'99'}}};
 const newPlan={original:{tax_info:{}},proposed:{tax_info:{ncm:'95069900'}}};
 const error='product.error_busi: Please upload the corresponding CEST of NCM';
 assert.equal(needsCestRevalidation(error,oldPlan,newPlan),true);
});
test('interface marca CST opcional e explica obrigação fiscal separada da NF-e',()=>{
 const js=readFileSync(new URL('../public/app.js',import.meta.url),'utf8');
 assert.match(js,/CST PIS\/COFINS \(opcional no anúncio\)/);
 assert.match(js,/Pode ficar em branco no cadastro do anúncio/);
 assert.match(js,/CST de PIS\/COFINS da NF-e continua sujeito/);
});
