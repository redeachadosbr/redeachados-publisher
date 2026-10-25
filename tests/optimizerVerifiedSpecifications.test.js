import test from 'node:test';
import assert from 'node:assert/strict';
import {confirmedSpecCard} from '../public/specificationCard.js';
import {confirmedProductDimensionsFromWeDrop} from '../public/productDimensions.js';
import {createChatGptPrompts} from '../public/chatgptPrompts.js';
import {readFileSync} from 'node:fs';

const evidence=[
 'MARCA','UNITOYS','NCM','87120010','PESO','12500g',
 'ALTURA','66cm','LARGURA','100cm','COMPRIMENTO','27cm',
 'Perfeita para passeios ao ar livre.',
 'Especificações:',
 'Dimensões: 75cm altura x 63cm largura x 117cm comprimento',
 'Peso suportado: Até 50kg','Cor: Rosa','Aro 16'
].join('\n');

test('SKU 2392: usa somente dimensoes declaradas na secao Especificacoes do texto WeDrop',()=>{
 const spec=confirmedSpecCard({sku:'2392',sourceText:evidence,attributes:[]});
 assert.deepEqual(spec.measurements.map(x=>x.value),['75 cm','63 cm','117 cm']);
 assert.deepEqual(spec.measurements.map(x=>x.label),['ALTURA','LARGURA','COMPRIMENTO']);
 assert.equal(spec.details,undefined);
 const raw=JSON.stringify(spec);
 for(const forbidden of ['66 cm','100 cm','27 cm','48 cm','72 cm','95 cm','35 cm','50 kg'])
  assert(!raw.includes(forbidden),'nao utilizar '+forbidden);
});
test('prompt 03 informa somente medidas confirmadas pela SKU e fotografa sem numeros inventados',()=>{
 const x=createChatGptPrompts({sku:'2392',title:'Bicicleta Infantil Moto Cross Rosa',
  supplierSourceText:evidence});
 assert.match(x.prompts[2],/ALTURA: 75 cm/);
 assert.match(x.prompts[2],/LARGURA: 63 cm/);
 assert.match(x.prompts[2],/COMPRIMENTO: 117 cm/);
 assert.match(x.prompts[2],/NÃO escreva nenhuma palavra, número, unidade/);
 assert.doesNotMatch(x.prompts[2],/48 cm|58 cm|68 cm|72 cm|35 cm/);
});
test('imagem 03 aplica apenas medidas depois de receber a foto no Manager',()=>{
 const app=readFileSync(new URL('../public/app.js',import.meta.url),'utf8');
 const card=readFileSync(new URL('../public/specificationCard.js',import.meta.url),'utf8');
 const img=app.indexOf("if(Number(m.slot)===3)");
 const hash=app.indexOf("const sha256=await imageBlobSha256(prepared.blob)",img);
 assert(img>0&&hash>img);
 const block=app.slice(img,hash);
 assert.match(block,/confirmedSpecCard\(\{sourceText:w\.sourceEvidence\?\.sourceText\|\|''\}\)/);
 assert.match(block,/addConfirmedSpecificationCard/);
 assert.match(card,/confirmedProductDimensionsFromWeDrop\(sourceText\)/);
 assert.doesNotMatch(card,/MEDIDAS DO CAMINHÃO|CARACTERÍSTICAS CONFIRMADAS|Material: plástico/);
});
test('rejeita peso, medidas soltas, medida da embalagem e conflitos',()=>{
 const isolated='ALTURA\n66cm\nLARGURA\n100cm\nCOMPRIMENTO\n27cm';
 assert.equal(confirmedProductDimensionsFromWeDrop(isolated),null);
 assert.equal(confirmedSpecCard({sku:'2392',sourceText:isolated}),null);
 assert.equal(confirmedProductDimensionsFromWeDrop('Dimensões da embalagem: 40cm altura x 50cm largura x 60cm comprimento'),null);
 const conflicts='Dimensões: 75cm altura x 63cm largura x 117cm comprimento\nDimensões: 90cm altura x 63cm largura x 117cm comprimento';
 assert.equal(confirmedProductDimensionsFromWeDrop(conflicts),null);
});
