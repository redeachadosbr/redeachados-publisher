import test from 'node:test';
import assert from 'node:assert/strict';
import {REDE_ACHADOS_FISCAL_DEFAULTS,fiscalStoreDefaults} from '../shopeeMatrixRules.js';
import {supplierWorkflowFacts} from '../shopeeSupplierFacts.js';
import {compileTax} from '../shopeeStructuredFields.js';

test('Motor Matriz apresenta CST 99 e marcador CEST 00 sem inventar código fiscal',()=>{
 assert.equal(REDE_ACHADOS_FISCAL_DEFAULTS.pis_cofins_cst,'99');
 for(const sku of ['TRC1525','TRC0809','SKU-TESTE']){
  const result=supplierWorkflowFacts(null,{title:sku,description:'',attributeAudit:{attributes:[]}},{});
  assert.equal(result.taxSuggestion.pis_cofins_cst,'99');
  assert.equal(result.taxSuggestion.cest,'00');
  assert.match(result.taxSuggestionSources.pis_cofins_cst,/Motor Matriz/);
 }
});

test('Regra da loja permite exceção expressa pela contabilidade',()=>{
 assert.deepEqual(fiscalStoreDefaults('PISCOFIS: 49'),{pis_cofins_cst:'49',cest:'00'});
 assert.deepEqual(fiscalStoreDefaults('PIS e COFINS CST: 99'),{pis_cofins_cst:'99',cest:'00'});
 assert.equal(fiscalStoreDefaults('Origem: 2').pis_cofins_cst,'99');
});

test('Catálogo vinculado fornece NCM e CEST comprovados; regra CST mantém 99',()=>{
 const supplier={
  supplier_sku:'TRC1525',source_file:'catalogo.csv',source_line:1,
  product_data:{name:'Piscina 210L',ncm:'95069900',cest:'1234567',measure_unit:'UN'}
 };
 const out=supplierWorkflowFacts(supplier,{description:'',attributeAudit:{attributes:[]}},{});
 assert.equal(out.taxSuggestion.pis_cofins_cst,'99');
 assert.equal(out.taxSuggestion.ncm,'95069900');
 assert.equal(out.taxSuggestion.cest,'1234567');
});

test('Compilação fiscal mantém valor CST explícito e não cria CEST automaticamente',()=>{
 const fiscal=compileTax({
  ncm:'95069900',pis_cofins_cst:'99',evidence:'Contabilidade: cadastro Shopee autorizado'
 },{tax_info:{}});
 assert.equal(fiscal.pis_cofins_cst,'99');
 assert.equal(fiscal.cest,undefined);
 const corrected=compileTax({
  ncm:'95069900',pis_cofins_cst:'49',cest:'00',
  evidence:'Contabilidade: exceção específica conferida'
 },{tax_info:{}});
 assert.equal(corrected.pis_cofins_cst,'49');
 assert.equal(corrected.cest,'00');
});
