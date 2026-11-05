import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {compileTax} from '../shopeeStructuredFields.js';
import {cestForShopeeField,inspectShopeeFiscalGap,fiscalFillMissingOnly} from '../shopeeFiscalGap.js';

const tax={ncm:'82055100',origin:'2',measure_unit:'UN',
 same_state_cfop:'5106',diff_state_cfop:'6106',csosn:'102',
 pis_cofins_cst:'99',operation_type:'1',cest:'00',
 evidence:'NCM conferido na fonte da propria SKU'};
test('CEST Shopee preenchido jamais vira 00 nem outro valor WeDrop',()=>{
 for(const draftCest of ['00','1234567','']){
  const live={tax_info:{...tax,cest:'2806100'}};
  const out=compileTax({...tax,cest:draftCest},live);
  assert.equal(out.cest,'2806100');
  assert.equal(live.tax_info.cest,'2806100');
 }
 assert.equal(cestForShopeeField({cest:'2806100'}),'2806100');
});
test('CEST efetivamente vazio na Shopee vira 00 na previa, sem envio automatico',()=>{
 for(const value of [undefined,null,'','  ']){
  const live={tax_info:{...tax,cest:value}};
  assert.equal(compileTax({...tax,cest:'7654321'},live).cest,'00');
  assert.equal(cestForShopeeField(live.tax_info),'00');
 }
});
test('auditoria nao considera CEST existente divergente de 00 como pendencia',()=>{
 const reference={...tax,cest:'00'};
 const live={...tax,cest:'2806100'};
 const gap=inspectShopeeFiscalGap(live,reference);
 assert.equal(gap.status,'complete');
 assert.deepEqual(gap.mismatched,[]);
 const result=fiscalFillMissingOnly(live,reference,{referenceOnly:true});
 assert.equal(result.tax.cest,'2806100');
 assert.deepEqual(result.changed,[]);
});
test('varredura fiscal preenche apenas CEST vazio e nao mexe nos demais campos',()=>{
 const source={...tax,cest:''};
 const result=fiscalFillMissingOnly(source,{...tax,cest:'7654321'},{referenceOnly:true});
 assert.equal(result.tax.cest,'00');
 assert.deepEqual(result.changed,['cest']);
});
test('o motor e a tela usam Shopee em vez da planilha para conferir CEST',()=>{
 const api=readFileSync(new URL('../server.js',import.meta.url),'utf8');
 const ui=readFileSync(new URL('../public/app.js',import.meta.url),'utf8');
 assert.match(api,/need_tax_info:true/);
 assert.match(api,/CEST mudou na Shopee desde a prévia|CEST mudou na Shopee desde a prévia/);
 assert.match(api,/cestForShopeeField\(live.tax_info\)/);
 assert.match(ui,/draft.cest=liveCest\|\|'00'/);
 assert.match(ui,/CEST já preenchido na Shopee/);
});

test('resposta fiscal ausente bloqueia envio sem confundir com CEST vazio',()=>{
 for(const missing of [undefined,null,false,[],'']){
  assert.throws(()=>cestForShopeeField(missing),/Leitura fiscal incompleta/);
 }
 assert.throws(()=>compileTax(tax,{}),/Leitura fiscal incompleta/);
 assert.throws(()=>compileTax(tax,{tax_info:null}),/Leitura fiscal incompleta/);
 assert.equal(compileTax(tax,{tax_info:{}}).cest,'00');
 const api=readFileSync(new URL('../server.js',import.meta.url),'utf8');
 assert.match(api,/cestForShopeeField\(row\.tax_info\)/);
 assert.match(api,/cestForShopeeField\(live\.tax_info\)/);
});
