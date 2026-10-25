import test from 'node:test';
import assert from 'node:assert/strict';
import {compileTax} from '../shopeeStructuredFields.js';
import {fiscalStoreDefaults} from '../shopeeMatrixRules.js';
const base={ncm:'95030099',origin:'2',same_state_cfop:'5106',diff_state_cfop:'6106',csosn:'102',measure_unit:'UN',evidence:'NCM WeDrop conferido com ficha fiscal'};
test('CEST 00 é padrão de cadastro e passa para prévia, não é confirmação na Shopee',()=>{
 assert.equal(fiscalStoreDefaults().cest,'00');
 assert.equal(compileTax({...base,cest:'00'},{tax_info:{}}).cest,'00');
});
test('CEST de sete dígitos publicado sem prova WeDrop não substitui marcador 00 da SKU',()=>{
 assert.equal(compileTax({...base,cest:'00'},{tax_info:{cest:'1234567'}}).cest,'00');
});
test('unidades KIT JOGO UN são aceitas na preparação fiscal',()=>{
 for(const unit of ['KIT','JOGO','UN'])assert.equal(compileTax({...base,measure_unit:unit},{tax_info:{}}).measure_unit,unit);
});
test('NCM ausente bloqueia publicação mesmo com CEST 00',()=>{
 assert.throws(()=>compileTax({...base,ncm:'',cest:'00'},{tax_info:{}}),/NCM/);
});
