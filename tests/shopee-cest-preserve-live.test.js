import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {compileTax} from '../shopeeStructuredFields.js';
import {cestForShopeeField,inspectShopeeFiscalGap,fiscalFillMissingOnly} from '../shopeeFiscalGap.js';
const tax={ncm:'82055100',origin:'2',measure_unit:'UN',
 same_state_cfop:'5106',diff_state_cfop:'6106',csosn:'102',
 pis_cofins_cst:'99',operation_type:'1',cest:'00',evidence:'NCM confirmado na SKU WeDrop'};
test('CEST da WeDrop prevalece sobre o CEST antigo Shopee, sem escrever durante prévia',()=>{
 for(const [cest,expected] of [['00','00'],['1234567','1234567'],['','00'],['123','00']]){
  const live={tax_info:{...tax,cest:'2806100'}};
  assert.equal(compileTax({...tax,cest},live).cest,expected);
  assert.equal(live.tax_info.cest,'2806100');
 }
 assert.equal(cestForShopeeField({cest:'2806100'}),'2806100');
});
test('CEST valido da WeDrop pode preencher CEST Shopee vazio',()=>{
 for(const value of [undefined,null,'','  ']){
  const live={tax_info:{...tax,cest:value}};
  assert.equal(compileTax({...tax,cest:'7654321'},live).cest,'7654321');
  assert.equal(cestForShopeeField(live.tax_info),'00');
 }
});
test('auditoria marca divergência e corrige só o CEST para 00',()=>{
 const live={...tax,cest:'2806100'};
 const gap=inspectShopeeFiscalGap(live,tax);
 assert.equal(gap.status,'partial');
 assert.deepEqual(gap.mismatched,['cest']);
 const out=fiscalFillMissingOnly(live,tax,{referenceOnly:true});
 assert.equal(out.tax.cest,'00');
 assert.deepEqual(out.changed,['cest']);
 assert.equal(live.cest,'2806100');
});
test('CEST invalido ou vazio e corrigido para 00 ou codigo da SKU',()=>{
 for(const current of ['','0','123456']){
  const out=fiscalFillMissingOnly({...tax,cest:current},{...tax,cest:'7654321'},{referenceOnly:true});
  assert.equal(out.tax.cest,'7654321');
  assert.deepEqual(out.changed,['cest']);
 }
});
test('motor e tela priorizam WeDrop e validam concorrencia do anuncio',()=>{
 const api=readFileSync(new URL('../server.js',import.meta.url),'utf8');
 const ui=readFileSync(new URL('../public/app.js',import.meta.url),'utf8');
 assert.match(api,/need_tax_info:true/);
 assert.match(api,/CEST mudou na Shopee desde a prévia/);
 assert.match(api,/cestForShopeeField\\(live.tax_info\\)/);
 assert.match(api,/cest:wedropCestForSku\\(supplierLinked\\?supplier:null\\)/);
 assert.match(ui,/draft.cest=catalogCest;/);
 assert.doesNotMatch(ui,/draft.cest=liveCest\\|\\|'00'/);
});
test('sem leitura oficial tax_info, nao prepara escrita',()=>{
 for(const missing of [undefined,null,false,[],''])
  assert.throws(()=>cestForShopeeField(missing),/Leitura fiscal incompleta/);
 assert.throws(()=>compileTax(tax,{}),/Leitura fiscal incompleta/);
 assert.throws(()=>compileTax(tax,{tax_info:null}),/Leitura fiscal incompleta/);
 assert.equal(compileTax(tax,{tax_info:{}}).cest,'00');
});
