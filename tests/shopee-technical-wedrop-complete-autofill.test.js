import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {supplierConfirmedTextFacts,supplierAttributeSuggestions} from '../shopeeSupplierEvidenceFacts.js';

const sourceText=[
 'MARCA','UNITOYS','PESO','12500g','ALTURA','66cm','LARGURA','100cm','COMPRIMENTO','27cm',
 'Indicado para crianças acima de 3 anos.',
 'Características do Produto:','-Freio traseiro e dianteiro','-Rodinhas de apoio removíveis',
 'Especificações:',
 'Dimensões: 75cm altura x 63cm largura x 117cm comprimento',
 'Composição: Aço carbono e borracha','Peso Suportado: Até 50kg','Cor: Rosa',
 'Peso Aprox.: 11kg','REGISTRO INMETRO: CE-BIC/INNAC - 02582-01A',
 'Contém:','01 Bicicleta Infantil Moto Cross Aro 16 - Rosa'
].join('\n');
const supplier={source_file:'produtos-catalogo.csv',supplier_sku:'2392',product_data:{
 name:'Bicicleta Infantil Moto Cross Aro 16 - Rosa',brand:'UNITOYS',
 catalogMeasurements:{heightCm:'66',widthCm:'100',lengthCm:'27',weightKg:'12500'}
}};
const attr=(id,name,inputType=3,opts=[])=>({
 id,name,inputType,options:opts.map(([id,name])=>({id,name})),values:[],allowedUnits:[]
});
const fields=[
 attr(100999,'Quantidade'),
 attr(101306,'Quantidade por embalagem',1,[[11855,'1'],[11856,'2']]),
 attr(100135,'Idade recomendada',1,[[1228,'4 - 6 years']]),
 attr(100942,'Dimension (L x W x H)'),
 attr(100134,'Material'),
 attr(1900,'Peso do produto'),
 attr(1901,'Peso suportado'),
 attr(1902,'Aro'),
 attr(1903,'Tipo de freio'),
 attr(1904,'Rodinhas de apoio',1,[[100,'Sim'],[101,'Não']]),
 attr(102292,'Inmetro Certification'),
 attr(100370,'Prazo de garantia',1,[[5576,'No Warranty']]),
 attr(100526,'Bateria integrada',1,[[2930,'No']]),
 attr(106664,'Contém Bluetooth, Wi-Fi ou tecnologia RF',1,[[20997,'No']]),
 attr(1910,'Product Type')
];
function run(proposed=[]){return supplierAttributeSuggestions({
 attributes:fields,proposed,supplier,sourceText,productDescription:''
});}
const choice=(result,id)=>result.suggestions.find(x=>Number(x.attributeId)===id)?.values?.[0]?.valueName;
test('texto WeDrop SKU2392 interpreta 01 Bicicleta como quantidade 1 e separa peso de embalagem',()=>{
 const facts=supplierConfirmedTextFacts(sourceText);
 assert.equal(facts.quantity,'1');
 assert.equal(facts.age,'3');
 assert.equal(facts.material,'aco carbono e borracha');
 assert.equal(facts.weight,'11kg');
 assert.equal(facts.supportedWeight,'50kg');
 assert.equal(facts.rim,'16');
 assert.match(facts.inmetroReference,/ce-bic\/innac/);
});
test('atributos Shopee usam valores concretos, eixo LxWxH e nao nome inteiro na Quantidade',()=>{
 const result=run();
 assert.equal(choice(result,100999),'1');
 assert.equal(choice(result,101306),'1');
 assert.equal(choice(result,100942),'117 x 63 x 75 cm');
 assert.equal(choice(result,100134),'aco carbono e borracha');
 assert.equal(choice(result,1900),'11kg');
 assert.equal(choice(result,1901),'Até 50kg');
 assert.equal(choice(result,1902),'16');
 assert.equal(choice(result,1903),'Dianteiro e traseiro');
 assert.equal(choice(result,1904),'Sim');
 const serialized=JSON.stringify(result.suggestions);
 assert(!serialized.includes('12500'));
 assert(!serialized.includes('01 Bicicleta Infantil'));
});
test('valores antigos incorretos ficam em divergencia para conferencia, nunca sobrescritos sozinhos',()=>{
 const existing=[
  {attributeId:100999,values:[{valueId:0,valueName:'01 Bicicleta Infantil Moto Cross Aro 16 - Rosa'}]},
  {attributeId:100135,values:[{valueId:1228,valueName:'4 - 6 years'}]}
 ];
 const result=run(existing);
 assert(result.conflicts.some(x=>x.attributeId===100999&&x.recommended==='1'));
 assert(result.conflicts.some(x=>x.attributeId===100135&&/3 anos/.test(x.recommended)));
 assert(result.unresolved.some(x=>x.attributeId===100135&&/opção oficial/.test(x.reason)));
 assert.equal(choice(result,100999),'1');
 assert.equal(choice(result,100135),undefined,'nao selecionar faixa 4-6 a partir de 3+');
});
test('dados sem comprovacao no texto NUNCA viram supostas garantias, wireless ou certificacao validada',()=>{
 const result=run();
 for(const id of [100370,100526,106664,102292,1910])
  assert.equal(choice(result,id),undefined,'atributo '+id+' deve permanecer sem autocompletar');
 const inmetro=result.metrics.find(x=>x.name.includes('INMETRO'));
 assert(inmetro);
 assert.match(inmetro.note,/validar/i);
});
test('a UI sinaliza divergencias e deixa editar sem publicar automaticamente',()=>{
 const src=readFileSync(new URL('../public/app.js',import.meta.url),'utf8');
 const server=readFileSync(new URL('../server.js',import.meta.url),'utf8');
 assert.match(src,/Divergências WeDrop/);
 assert.match(src,/Conferir e corrigir/);
 assert.match(src,/Aplicar dado WeDrop:/);
 assert.match(server,/mergeWorkflowTechnicalAutofill/);
 assert.match(server,/sourceText:sourceEvidence\.sourceText/);
});
