import test from 'node:test';
import assert from 'node:assert/strict';
import {inspectShopeeFiscalGap,fiscalFillMissingOnly} from '../shopeeFiscalGap.js';
const approved={ncm:'95030099',origin:'2',measure_unit:'UN',
 same_state_cfop:'5106',diff_state_cfop:'6106',csosn:'102',
 pis_cofins_cst:'99',operation_type:'1',cest:'00',
 evidence:'Ficha fiscal validada'};

test('sem dados, parcial e completo são calculados apenas do tax_info da Shopee',()=>{
 assert.equal(inspectShopeeFiscalGap({}).status,'empty');
 assert.deepEqual(inspectShopeeFiscalGap({ncm:'95030099'}).missing,
  ['origin','measure_unit','same_state_cfop','diff_state_cfop','csosn',
   'pis_cofins_cst','operation_type','cest']);
 assert.equal(inspectShopeeFiscalGap(approved).status,'complete');
 assert.equal(inspectShopeeFiscalGap({...approved,cest:'1234567'}).status,'complete');
 assert.equal(inspectShopeeFiscalGap({...approved,operation_type:''}).status,'partial');
 assert.deepEqual(inspectShopeeFiscalGap({...approved,operation_type:''}).missingConfigured,
  ['operation_type']);
});
test('preenche apenas campos em branco, inclusive CEST 00 e tipo de operação',()=>{
 const live={ncm:'12345678',origin:'1'};
 const r=fiscalFillMissingOnly(live,approved);
 assert.equal(r.tax.ncm,'12345678');
 assert.equal(r.tax.origin,'1');
 assert.equal(r.tax.measure_unit,'UN');
 assert.equal(r.tax.cest,'00');
 assert.equal(r.tax.operation_type,'1');
 assert.deepEqual(r.changed.sort(),['csosn','diff_state_cfop','measure_unit',
  'pis_cofins_cst','operation_type','cest','same_state_cfop'].sort());
});
test('não publica automaticamente campos sem fonte revisada',()=>{
 assert.throws(()=>fiscalFillMissingOnly({}, {ncm:'95030099'}),/Ficha fiscal incompleta/);
 assert.equal(inspectShopeeFiscalGap({ncm:'12345678',origin:'1'}).status,'partial');
});
test('NCM incorreto ou CEST realmente inválido continuam pendentes',()=>{
 const x=inspectShopeeFiscalGap({...approved,ncm:'12',cest:'0'});
 assert.deepEqual(x.invalid,['ncm','cest']);
 assert.equal(x.status,'partial');
});
test('o anúncio exemplo 1175 completo não deve aparecer como pendente por CEST 00',()=>{
 const example={ncm:'95066200',origin:'2',same_state_cfop:'5106',
  diff_state_cfop:'6106',csosn:'102',measure_unit:'UN',
  pis_cofins_cst:'99',operation_type:'1',cest:'00'};
 assert.equal(inspectShopeeFiscalGap(example).status,'complete');
 assert.deepEqual(inspectShopeeFiscalGap(example).missing,[]);
});
