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

test('não executa escrita para dados já existentes mas inválidos',()=>{
 assert.throws(()=>fiscalFillMissingOnly({...approved,ncm:'12'},approved),
  /Dados fiscais existentes inválidos.*ncm/);
 assert.throws(()=>fiscalFillMissingOnly({...approved,cest:'0'},approved),
  /Dados fiscais existentes inválidos.*cest/);
});
test('rejeita a ficha aprovada se a origem contém valores fiscais inválidos',()=>{
 assert.throws(()=>fiscalFillMissingOnly({}, {...approved,ncm:'9503'}),
  /Ficha fiscal com valores ausentes ou inválidos.*ncm/);
 assert.throws(()=>fiscalFillMissingOnly({}, {...approved,origin:'9'}),
  /Ficha fiscal com valores ausentes ou inválidos.*origin/);
 assert.throws(()=>fiscalFillMissingOnly({}, {...approved,cest:'0'}),
  /Ficha fiscal com valores ausentes ou inválidos.*cest/);
});
test('mantém aprovação de CEST 00 e NCM válido sem alterar campos preenchidos',()=>{
 const existing={...approved,ncm:'95066200',cest:'00'};
 const result=fiscalFillMissingOnly(existing,{...approved,ncm:'95030099'});
 assert.deepEqual(result.changed,[]);
 assert.equal(result.tax.ncm,'95066200');
 assert.equal(result.tax.cest,'00');
});

test('diferencia valores preenchidos divergentes da tabela fiscal aprovada',()=>{
 const live={...approved,origin:'1',same_state_cfop:'5102',ncm:'95066200'};
 const result=inspectShopeeFiscalGap(live,approved);
 assert.equal(result.status,'partial');
 assert.deepEqual(result.missing,[]);
 assert.deepEqual(result.invalid,[]);
 assert.deepEqual(result.mismatched.sort(),['origin','same_state_cfop','ncm'].sort());
 assert.deepEqual(result.unverified,[]);
 const semNcm=inspectShopeeFiscalGap(approved,{...approved,ncm:''});
 assert.equal(semNcm.status,'partial');
 assert.deepEqual(semNcm.unverified,['ncm']);
});

test('campos vazios fora da tabela aprovada não tornam o anúncio pendente',()=>{
 const ref={ncm:'95030099',origin:'2',csosn:'102'};
 const live={ncm:'95030099',origin:'2',csosn:'102',
  cest:'',operation_type:'',measure_unit:'',same_state_cfop:'',diff_state_cfop:''};
 const result=inspectShopeeFiscalGap(live,ref);
 assert.equal(result.status,'complete');
 assert.deepEqual(result.missing,[]);
 assert.deepEqual(result.invalid,[]);
 assert.deepEqual(result.mismatched,[]);
 assert.deepEqual(result.unverified,[]);
 const incorrect=inspectShopeeFiscalGap({...live,origin:'1'},ref);
 assert.equal(incorrect.status,'partial');
 assert.deepEqual(incorrect.mismatched,['origin']);
});

test('executor não exige campos fora da tabela de referência',()=>{
 const reference={ncm:'95030099',origin:'2',csosn:'102'};
 const live={ncm:'95030099',origin:'2',csosn:'102',
  cest:'',operation_type:'',measure_unit:''};
 const unchanged=fiscalFillMissingOnly(live,reference,{referenceOnly:true});
 assert.deepEqual(unchanged.changed,[]);
 assert.equal(unchanged.tax.cest,'');
 const missing=fiscalFillMissingOnly({...live,origin:''},reference,{referenceOnly:true});
 assert.deepEqual(missing.changed,['origin']);
 assert.equal(missing.tax.origin,'2');
 assert.equal(missing.tax.operation_type,'');
});
test('executor não sobrescreve campo já preenchido fora do padrão da referência',()=>{
 const reference={ncm:'95030099',origin:'2',csosn:'102'};
 assert.throws(()=>fiscalFillMissingOnly(
  {ncm:'95030099',origin:'1',csosn:'102'},reference,{referenceOnly:true}),
  /Dados fiscais diferentes da tabela aprovada.*origin/);
 assert.throws(()=>fiscalFillMissingOnly(
  {ncm:'95030099',origin:'',csosn:'102'},
  {origin:'2',csosn:'102'},{referenceOnly:true}),
  /Ficha fiscal sem referência confirmada.*ncm/);
});
