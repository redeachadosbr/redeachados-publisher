import test from 'node:test';
import assert from 'node:assert/strict';
import {compileAttributes} from '../shopeeStructuredFields.js';
import {technicalMatrixSource} from '../shopeeMatrixRules.js';

const meta=(id,name,{mandatory=false,option=false}={})=>({
 id,name,legacy:false,conditional:false,mandatory,
 inputType:option?1:3,validationType:0,formatType:0,allowedUnits:[],
 options:option?[{id:777,name:'Brasil'}]:[],state:mandatory?'missing':'empty'
});
const record=(attributes)=>({
 sku:'3747',categoryId:101010,attributeAudit:{schema:null,attributes}
});
const change=(attributeId,valueName,{valueId=0,evidence=''}={})=>({
 attributeId,evidence,values:[{valueId,valueName,unit:''}]
});

test('confirma Indicação de uso, Quantidade e região Brasil sem campo Fonte',()=>{
 const attrs=[
  meta(1,'Indicação de uso'),meta(2,'Quantidade'),
  meta(3,'País ou região de origem',{option:true})
 ];
 const changes=[
  change(1,'A PARTIR DE 3 ANOS'),
  change(2,'1'),
  change(3,'Brasil',{valueId:777})
 ];
 const product=record(attrs);
 const merged=compileAttributes(changes,product,{attribute_list:[]});
 assert.equal(merged.length,3);
 assert.equal(merged[2].attribute_value_list[0].original_value_name,'Brasil');
 assert.deepEqual(technicalMatrixSource({sku:'3747',record:product,attributes:changes}),
  {sku:'3747',categoryId:101010});
});

test('nenhuma fonte é exigida para registrar ficha sem alterações',()=>{
 const product=record([meta(1,'Indicação de uso')]);
 assert.deepEqual(technicalMatrixSource({sku:'3747',record:product,attributes:[]}),
  {sku:'3747',categoryId:101010});
 assert.deepEqual(compileAttributes([],product,{attribute_list:[]}),[]);
});

test('continua proibido aprovar valor em branco',()=>{
 const product=record([meta(1,'Indicação de uso')]);
 assert.throws(()=>compileAttributes([change(1,'')],product,{attribute_list:[]}),
  /valor válido/i);
});

test('continua proibido aprovar valor não oficial da categoria',()=>{
 const product=record([meta(3,'País ou região de origem',{option:true})]);
 assert.throws(()=>compileAttributes([change(3,'Brasil',{valueId:888})],product,{attribute_list:[]}),
  /opção oficial/i);
});

test('continua obrigatória a presença de atributos exigidos pela Shopee',()=>{
 const product=record([meta(1,'Indicação de uso'),meta(4,'Campo obrigatório',{mandatory:true})]);
 assert.throws(()=>compileAttributes([change(1,'Brincadeira')],product,{attribute_list:[]}),
  /atributo obrigatório/i);
});
