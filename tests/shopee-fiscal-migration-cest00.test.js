import test from 'node:test';
import assert from 'node:assert/strict';
import {compileTax} from '../shopeeStructuredFields.js';
import {fiscalStoreDefaults} from '../shopeeMatrixRules.js';
const base={ncm:'95030099',origin:'2',same_state_cfop:'5106',diff_state_cfop:'6106',csosn:'102',measure_unit:'UN',evidence:'NCM WeDrop conferido com ficha fiscal'};
test('CEST 00 é padrão de cadastro e passa para prévia, não é confirmação na Shopee',()=>{
 assert.equal(fiscalStoreDefaults().cest,'00');
 assert.equal(compileTax({...base,cest:'00'},{tax_info:{}}).cest,'00');
});
test('CEST de sete dígitos publicado na Shopee é preservado mesmo com rascunho 00',()=>{
 assert.equal(compileTax({...base,cest:'00'},{tax_info:{cest:'1234567'}}).cest,'1234567');
});
test('unidades KIT JOGO UN são aceitas na preparação fiscal',()=>{
 for(const unit of ['KIT','JOGO','UN'])assert.equal(compileTax({...base,measure_unit:unit},{tax_info:{}}).measure_unit,unit);
});
test('NCM ausente bloqueia publicação mesmo com CEST 00',()=>{
 assert.throws(()=>compileTax({...base,ncm:'',cest:'00'},{tax_info:{}}),/NCM/);
});


test('CEST de rascunho vem do catálogo da SKU exata e não da Shopee',async()=>{
 const {wedropCestForSku,supplierWorkflowFacts}=await import('../shopeeSupplierFacts.js');
 const exact={supplier_sku:'TX24505K',matchedBy:'exact-sku',source_file:'wedrop.csv',
  product_data:{ncm:'42029200',cest:''}};
 const oldShopee={tax_info:{cest:'2806100'}};
 assert.equal(wedropCestForSku(exact),'00');
 assert.equal(supplierWorkflowFacts(exact,{title:'Mochila escolar'}).taxSuggestion.cest,'00');
 assert.equal(wedropCestForSku({...exact,product_data:{ncm:'42029200',cest:'1234567'}}),'1234567');
 assert.equal(wedropCestForSku({...exact,matchedBy:'unreviewed',
  product_data:{ncm:'42029200',cest:'2806100'}}),'00');
 assert.equal(oldShopee.tax_info.cest,'2806100','nenhuma escrita na Shopee');
 assert.equal(compileTax({...base,cest:'00'},oldShopee).cest,'2806100',
  'transmissão existente só muda com autorização fiscal específica');
});
