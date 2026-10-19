import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {recyclableShopeeMedia} from '../shopeeExecutionMediaReuse.js';
import {supplierAttributeSuggestions} from '../shopeeSupplierEvidenceFacts.js';
import {assertShopeeSupplierBrand} from '../shopeeMatrixRules.js';
import {supplierWorkflowFacts} from '../shopeeSupplierFacts.js';

const sha=n=>String(n).repeat(64);
const asset=i=>({slot:i+1,sha256:sha(i%2?'a':'b')});
const old={sku:'TRC1525',shop_id:9,item_id:22095398152,model_id:0,state:'failed',
 plan:{images:Array.from({length:9},(_,i)=>asset(i)),video:{sha256:sha('c')}},
 result:{imageIds:Array.from({length:9},(_,i)=>'sg-image-'+i),
  video:{id:'sg-video-12345',phase:'ready',videoInfo:{video_url_list:[]}}}};
const newPlan={sku:'TRC1525',shopId:9,itemId:'22095398152',modelId:'0',
 images:Array.from({length:9},(_,i)=>asset(i)),video:{sha256:sha('c')}};
test('reaproveita 9 uploads e vídeo após rejeição fiscal, sem considerar anúncio publicado',()=>{
 const reused=recyclableShopeeMedia(old,newPlan);
 assert.equal(reused.imageIds.length,9);
 assert.equal(reused.video.id,'sg-video-12345');
});
test('troca de uma imagem, vídeo, shop ou SKU invalida reaproveitamento indevido',()=>{
 const changed={...newPlan,images:newPlan.images.map((x,i)=>i===4?{...x,sha256:sha('d')}:x)};
 assert.equal(recyclableShopeeMedia(old,changed)?.imageIds?.length||0,0);
 assert.equal(recyclableShopeeMedia(old,{...newPlan,video:{sha256:sha('e')}}).video,null);
 assert.equal(recyclableShopeeMedia(old,{...newPlan,sku:'OUTRA'}),null);
 assert.equal(recyclableShopeeMedia(old,{...newPlan,shopId:8}),null);
 assert.equal(recyclableShopeeMedia({...old,state:'uncertain'},newPlan),null);
});
const supplier={supplier_sku:'TRC1525',source_file:'catalogo.csv',product_data:{
 brand:'Top Rio',catalogMeasurements:{heightCm:'13',widthCm:'33',lengthCm:'36',weightKg:'2600'}}};
const brand={id:100413,name:'Marca',inputType:3,values:[{name:'Novo'}],options:[]};
const stamp={id:100162,name:'Estampa',inputType:3,values:[],options:[]};
const inmetro={id:1013,name:'Número de registro INMETRO',inputType:1,values:[],
 options:[{id:7,name:'N/A – NBR não aplicável'}]};
const attrs=[brand,stamp,inmetro,{id:1014,name:'Idade recomendada',inputType:3,values:[]},
 {id:1015,name:'Quantidade por embalagem',inputType:3,values:[]}];
test('marca vem da WeDrop, nunca da condição NEW; estampa e quantidade usam texto explícito',()=>{
 const facts=supplierAttributeSuggestions({attributes:attrs,proposed:[{
  attributeId:100413,values:[{valueId:0,valueName:'Novo'}]}],supplier,
 sourceText:'Marca: Top Rio\nEstampa: Estampado\nQuantidade por embalagem: 1\nIdade recomendada: não informada'});
 assert.ok(facts.conflicts.some(x=>x.name==='Marca'&&x.current==='Novo'&&x.recommended==='Top Rio'));
 assert.ok(facts.suggestions.some(x=>x.attributeId===100413&&x.values[0].valueName==='Top Rio'));
 assert.ok(facts.suggestions.some(x=>x.attributeId===100162&&x.values[0].valueName==='Estampado'));
 assert.ok(facts.suggestions.some(x=>x.attributeId===1015&&x.values[0].valueName==='1'));
 assert.equal(facts.suggestions.some(x=>x.attributeId===1014),false);
 assert.equal(facts.suggestions.some(x=>x.attributeId===1013),false);
 assert.match(facts.metrics[0].note,/não são necessariamente medidas da piscina/);
});
test('INMETRO N/A requer declaração expressa e opção oficial da categoria',()=>{
 const no=supplierAttributeSuggestions({attributes:[inmetro],sourceText:'Registro INMETRO: não informado'});
 assert.equal(no.suggestions.length,0);
 const yes=supplierAttributeSuggestions({attributes:[inmetro],sourceText:'Registro INMETRO: não se aplica'});
 assert.equal(yes.suggestions[0]?.values?.[0]?.valueId,7);
 const noOption=supplierAttributeSuggestions({attributes:[{...inmetro,options:[]}],sourceText:'Registro INMETRO: não se aplica'});
 assert.equal(noOption.suggestions.length,0);
});
test('bloqueia Marca Novo divergente da Top Rio em todas as SKUs sem adivinhar marca',()=>{
 const record={attributeAudit:{attributes:[brand]},condition:'NEW'};
 assert.throws(()=>assertShopeeSupplierBrand({record,supplier,attributes:[{
  attributeId:100413,values:[{valueId:0,valueName:'Novo'}]}]}),/Marca.*Novo.*Top Rio/);
 assert.doesNotThrow(()=>assertShopeeSupplierBrand({record,supplier,attributes:[{
  attributeId:100413,values:[{valueId:0,valueName:'Top Rio'}]}]}));
 assert.equal(supplierWorkflowFacts(supplier,record).attributeSuggestions.some(x=>x.attributeId===100413),false);
});
test('API mantém upload privado e autorização por SKU',()=>{
 const source=readFileSync(new URL('../server.js',import.meta.url),'utf8');
 const code=readFileSync(new URL('../public/app.js',import.meta.url),'utf8');
 const html=readFileSync(new URL('../public/index.html',import.meta.url),'utf8');
 assert.match(source,/workflow\/source',mustLogin,requireWeDropAdmin/);
 assert.match(source,/importShopeeEvidenceImage\(auth\.shopId,itemId,modelId,sku/);
 assert.match(source,/readShopeeSourceEvidence\(auth\.shopId,itemId,modelId,sku/);
 assert.match(html,/id="optimizerSourceText"/);
 assert.match(html,/id="optimizerSourceImage"/);
 assert.match(code,/optimizerSourceRender\(data\)/);
 assert.match(source,/plan\.reusedMedia=recyclableShopeeMedia\(previous,plan\)/);
});
