import test from 'node:test';
import assert from 'node:assert/strict';
import {inspectShopeeFiscalGap,fiscalFillMissingOnly} from '../shopeeFiscalGap.js';
const approved={ncm:'95030099',origin:'2',measure_unit:'UN',
 same_state_cfop:'5106',diff_state_cfop:'6106',csosn:'102',
 pis_cofins_cst:'99',cest:'00',evidence:'Ficha fiscal validada'};
test('sem dados, parcial e completo são calculados apenas de tax_info oficial',()=>{
 assert.equal(inspectShopeeFiscalGap({}).status,'empty');
 assert.deepEqual(inspectShopeeFiscalGap({ncm:'95030099'}).missing,
  ['origin','measure_unit','same_state_cfop','diff_state_cfop','csosn']);
 assert.equal(inspectShopeeFiscalGap(approved).status,'partial'); // CEST 00 is invalid
 assert.equal(inspectShopeeFiscalGap({...approved,cest:'1234567'}).status,'complete');
});
test('preenchimento completa apenas campos ausentes sem substituir dados existentes',()=>{
 const live={ncm:'12345678',origin:'1'};
 const r=fiscalFillMissingOnly(live,approved);
 assert.equal(r.tax.ncm,'12345678');
 assert.equal(r.tax.origin,'1');
 assert.equal(r.tax.measure_unit,'UN');
 assert.equal(r.tax.cest,undefined); // 00 never sent
 assert.deepEqual(r.changed.sort(),['csosn','diff_state_cfop','measure_unit','pis_cofins_cst','same_state_cfop'].sort());
});
test('não publica automaticamente campos que não estão na ficha',()=>{
 assert.throws(()=>fiscalFillMissingOnly({}, {ncm:'95030099'}),/Ficha fiscal incompleta/);
 assert.equal(inspectShopeeFiscalGap({ncm:'12345678',origin:'1'}).status,'partial');
});

test('dados fiscais inválidos continuam pendentes e não são considerados confirmados',()=>{
 const x=inspectShopeeFiscalGap({...approved,ncm:'12',cest:'00'});
 assert.deepEqual(x.invalid,['ncm','cest']);
 assert.equal(x.status,'partial');
});
