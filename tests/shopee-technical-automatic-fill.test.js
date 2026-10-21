import test from 'node:test';
import assert from 'node:assert/strict';
import {supplierAttributeSuggestions} from '../shopeeSupplierEvidenceFacts.js';
import {mergeWorkflowTechnicalAutofill} from '../shopeeOptimizationWorkflowStore.js';

test('atributos da categoria são preenchidos automaticamente a partir de fatos da SKU',()=>{
 const attrs=[
  {id:1,name:'Material',inputType:3,values:[]},
  {id:2,name:'Ball Size',inputType:1,options:[{id:22,name:'Nº 2'}],values:[]},
  {id:3,name:'Height',inputType:3,formatType:2,allowedUnits:['cm'],values:[]},
  {id:4,name:'Custom Product',inputType:1,options:[{id:10,name:'Yes'},{id:11,name:'No'}],values:[]},
  {id:5,name:'Bluetooth',inputType:1,options:[{id:12,name:'Yes'},{id:13,name:'No'}],values:[]}
 ];
 const src=supplierAttributeSuggestions({attributes:attrs,
  supplier:{source_file:'produtos-catalogo.csv',supplier_sku:'1175',
    product_data:{name:'Bola Futebol Infantil Nº 2',material:'Vinil'}},
  sourceText:'ALTURA\n8cm\nPRODUTO PERSONALIZADO\nNão'});
 const byId=id=>src.suggestions.find(x=>Number(x.attributeId)===id)?.values[0];
 assert.equal(byId(1)?.valueName,'Vinil');
 assert.equal(byId(2)?.valueId,22);
 assert.equal(byId(3)?.valueName,'8');
 assert.equal(byId(3)?.unit,'cm');
 assert.equal(byId(4)?.valueId,11);
 assert.equal(byId(5),undefined,'Sem prova não inventar atributo sem fio');
});

test('rascunho manual vence sugestão e automático é persistente sem aprovação/publicação',async()=>{
 const env={...process.env};const prevFetch=globalThis.fetch;
 let writes=0,row={shop_id:7,item_id:1175,model_id:0,sku:'1175',
  review_state:{stages:{technical:{reviewed:false}},technicalDraft:{
   updatedAt:'2026-10-20T08:00:00Z',fields:[{attributeId:1,enabled:true,
    evidence:'Edição manual',values:[{valueId:0,valueName:'Algodão',unit:''}]}]}}};
 try{
  process.env.SUPABASE_URL='https://example.supabase.co';
  process.env.SUPABASE_SECRET_KEY='mock-service-role-key';
  globalThis.fetch=async(_url,opts={})=>{
   if(opts.method==='POST'){row=JSON.parse(opts.body)[0];writes++;return {ok:true};}
   return {ok:true,json:async()=>[row]};
  };
  const attributes=[{id:1,values:[]},{id:2,values:[]}];
  const suggestions=[{attributeId:1,values:[{valueId:0,valueName:'Vinil'}],evidence:'WeDrop'},
   {attributeId:2,values:[{valueId:22,valueName:'Nº 2'}],evidence:'SKU 1175'}];
  await mergeWorkflowTechnicalAutofill(7,1175,0,'1175',attributes,suggestions);
  assert.equal(row.review_state.technicalDraft.fields.find(x=>x.attributeId===1).values[0].valueName,'Algodão');
  assert.equal(row.review_state.technicalDraft.fields.find(x=>x.attributeId===2).values[0].valueName,'Nº 2');
  assert.equal(row.review_state.stages.technical.reviewed,false);
  await mergeWorkflowTechnicalAutofill(7,1175,0,'1175',attributes,suggestions);
  assert.equal(writes,1,'reabrir ficha não faz nova gravação desnecessária');
 }finally{
  globalThis.fetch=prevFetch;
  for(const key of ['SUPABASE_URL','SUPABASE_SECRET_KEY']){
   if(env[key]===undefined)delete process.env[key];else process.env[key]=env[key];
  }
 }
});
