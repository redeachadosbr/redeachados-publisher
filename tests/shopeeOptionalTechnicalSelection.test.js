import test from 'node:test';
import assert from 'node:assert/strict';
import {selectValidTechnicalChanges,compileAttributes} from '../shopeeStructuredFields.js';

const meta=(id,name,opts={})=>({
 id,name,legacy:false,conditional:false,mandatory:Boolean(opts.mandatory),
 inputType:3,validationType:opts.numeric?3:0,formatType:0,
 allowedUnits:[],options:[],maxValues:1,state:'filled'
});
const change=(attributeId,valueName)=>({
 attributeId,evidence:'',values:[{valueId:0,valueName,unit:''}]
});

test('SKU 3747: text in optional numeric indication is skipped without blocking review',()=>{
 const audit={attributes:[
  meta(11,'indication',{numeric:true}),
  meta(12,'Quantidade',{numeric:true})
 ]};
 const proposed=[change(11,'A PARTIR DE 3 ANOS'),change(12,'1')];
 const {valid,skipped}=selectValidTechnicalChanges(proposed,audit);
 assert.deepEqual(valid.map(x=>x.attributeId),[12]);
 assert.equal(skipped.length,1);
 assert.equal(skipped[0].name,'indication');
 assert.match(skipped[0].reason,/exige um número/);
 const record={attributeAudit:{schema:null,attributes:audit.attributes}};
 assert.equal(compileAttributes(valid,record,{attribute_list:[]}).length,1);
});

test('optional invalid field remains in original draft, without mutation',()=>{
 const proposed=[change(11,'A PARTIR DE 3 ANOS')];
 const snapshot=JSON.stringify(proposed);
 const result=selectValidTechnicalChanges(proposed,{attributes:[meta(11,'indication',{numeric:true})]});
 assert.equal(result.valid.length,0);
 assert.equal(result.skipped.length,1);
 assert.equal(JSON.stringify(proposed),snapshot);
});

test('required numeric attribute continues to reject incompatible text',()=>{
 const audit={attributes:[meta(11,'indication',{numeric:true,mandatory:true})]};
 assert.throws(()=>selectValidTechnicalChanges([change(11,'A PARTIR DE 3 ANOS')],audit),
  /Atributo obrigatório indication/);
});

test('valid numeric optional and valid text keep their values',()=>{
 const audit={attributes:[meta(12,'Quantidade',{numeric:true}),meta(13,'Material')]};
 const changes=[change(12,'1'),change(13,'Plástico')];
 const result=selectValidTechnicalChanges(changes,audit);
 assert.equal(result.skipped.length,0);
 assert.deepEqual(result.valid,changes);
});

test('unknown category attribute cannot be silently skipped',()=>{
 const audit={attributes:[meta(12,'Quantidade',{numeric:true})]};
 assert.throws(()=>selectValidTechnicalChanges([change(1011,'123')],audit),/categoria oficial/);
});
