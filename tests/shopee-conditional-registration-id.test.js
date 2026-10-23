import test from 'node:test';
import assert from 'node:assert/strict';
import {normalizeAttributeAudit} from '../productOptimizer.js';
import {attributeAuditForChanges,compileAttributes} from '../shopeeStructuredFields.js';
import {scopeTechnicalReviewChanges} from '../shopeeTechnicalReviewScope.js';

const categoryId=101010;
const parentId=100135,childId=101197,otherId=100037;
const attrValue=(id,name)=>({value_id:id,original_value_name:name});
function fixture(parentValue=2){
 const live={category_id:categoryId,item_name:'Produto teste',
  attribute_list:[
   {attribute_id:parentId,attribute_value_list:[attrValue(parentValue,parentValue===2?'No':'Yes')]},
   {attribute_id:otherId,attribute_value_list:[attrValue(6737,'Plastic')]}
  ]};
 const schema={response:{list:[{category_id:categoryId,attribute_tree:[
  {attribute_id:parentId,name:'Has BSMI No.',mandatory:false,attribute_info:{input_type:1},
   attribute_value_list:[
    {value_id:1,name:'Yes',child_attribute_list:[
     {attribute_id:childId,name:'Registration ID',mandatory:true,attribute_info:{input_type:3},
      attribute_value_list:[]}
    ]},
    {value_id:2,name:'No'}
   ]},
  {attribute_id:otherId,name:'Material',mandatory:false,attribute_info:{input_type:1},
   attribute_value_list:[{value_id:6737,name:'Plastic'},{value_id:6738,name:'Metal'}]}
 ]}]}};
 const audit=normalizeAttributeAudit(live,schema);
 return {live,record:{sku:'XYZ',categoryId,attributeAudit:audit}};
}
const change=(id,valueId,valueName='',evidence='')=>({
 attributeId:id,values:[{valueId,valueName}],evidence
});
const scope=(changes,fixture)=>scopeTechnicalReviewChanges(changes,{
 ...fixture,auditChanges:attributeAuditForChanges
});

test('inactive mandatory Registration ID is not required or submitted',()=>{
 const f=fixture(2);
 const child=f.record.attributeAudit.attributes.find(a=>a.id===childId);
 assert.equal(child.mandatory,true);
 assert.equal(child.conditional,true);
 assert.equal(f.record.attributeAudit.missingMandatory,0);
 const result=scope([
  change(parentId,2,'',''),change(otherId,6737,'',''),
  change(childId,-1,'','')
 ],f);
 assert.deepEqual(result.changes,[]);
 assert.equal(result.ignoredUnchanged,2);
 assert.equal(result.ignoredIncomplete,1);
 assert.equal(attributeAuditForChanges(result.changes,f.record,f.live).missingMandatory,0);
 assert.doesNotThrow(()=>compileAttributes(result.changes,f.record,f.live));
});

test('invisible stale child with a value is dropped if parent is set to No',()=>{
 const f=fixture(2);
 const proposed=[
  change(parentId,2,'No',''),
  change(childId,0,'REG-STALE','Old evidence')
 ];
 const result=scope(proposed,f);
 assert.equal(result.changes.length,0);
 assert.equal(result.ignoredConditional,1);
});

test('switching parent to Yes correctly activates and requires Registration ID',()=>{
 const f=fixture(2);
 const proposed=[change(parentId,1,'Yes','Official parent choice')];
 const result=scope(proposed,f);
 assert.equal(result.changes.length,1);
 const audit=attributeAuditForChanges(result.changes,f.record,f.live);
 assert.equal(audit.attributes.find(a=>a.id===childId).conditional,false);
 assert.equal(audit.missingMandatory,1);
 assert.throws(()=>compileAttributes(result.changes,f.record,f.live),/Preencha o atributo obrigatório Registration ID/);
});

test('parent Yes with valid Registration ID remains eligible for review',()=>{
 const f=fixture(2);
 const proposed=[
  change(parentId,1,'Yes','Official parent choice'),
  change(childId,0,'ABC-123','Manufacturer certificate')
 ];
 const result=scope(proposed,f);
 assert.equal(result.changes.length,2);
 const audit=attributeAuditForChanges(result.changes,f.record,f.live);
 assert.equal(audit.missingMandatory,0);
 const payload=compileAttributes(result.changes,f.record,f.live);
 assert.equal(payload.find(a=>a.attribute_id===childId).attribute_value_list[0].original_value_name,'ABC-123');
});

test('truly changed fields still require evidence and valid option IDs',()=>{
 const f=fixture(2);
 const noProof=scope([change(otherId,6738,'Metal','')],f);
 assert.equal(noProof.changes.length,1);
 assert.throws(()=>compileAttributes(noProof.changes,f.record,f.live),/fonte do atributo/i);
 const invalid=scope([change(otherId,9999,'Unknown','Supplier')],f);
 assert.throws(()=>compileAttributes(invalid.changes,f.record,f.live),/valor oficial/i);
});

test('incomplete optional fields are excluded but actual mandatory omissions still block',()=>{
 const f=fixture(2);
 const result=scope([change(otherId,-1,'','')],f);
 assert.deepEqual(result.changes,[]);
 const required=fixture(1);
 const next=scope([],required);
 assert.equal(attributeAuditForChanges(next.changes,required.record,required.live).missingMandatory,1);
});

test('client hides conditional-only cards and backend rechecks category requirements',async()=>{
 const {readFileSync}=await import('node:fs');
 const src=readFileSync(new URL('../public/app.js',import.meta.url),'utf8');
 const server=readFileSync(new URL('../server.js',import.meta.url),'utf8');
 assert.match(src,/if\(attr\.conditional\)continue;/);
 assert.match(src,/if\(same\(values,attr\.values\)\)return null;/);
 assert.match(server,/scopeTechnicalReviewChanges\(change\.attributes\|\|\[\]/);
 assert.match(server,/verifiedAttributes\?\.missingMandatory/);
});
