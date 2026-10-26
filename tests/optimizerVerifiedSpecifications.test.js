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
 const spec=confirmedSpecCard({sku:'2392',sourceText:evidence,sourceEvidenceSku:'2392',supplierMatchedBy:'exact-sku',attributes:[]});
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
 assert.match(x.prompts[2],/FOTOGRAFIA BASE SEM QUALQUER TEXTO/);
 assert.doesNotMatch(x.prompts[2],/ALTURA: 75 cm|LARGURA: 63 cm|COMPRIMENTO: 117 cm/);
 assert.deepEqual(x.confirmedDimensions.measurements.map(x=>x.value),['75 cm','63 cm','117 cm']);
 assert.doesNotMatch(x.prompts[2],/48 cm|58 cm|68 cm|72 cm|35 cm/);
});
test('imagem 03 aplica apenas medidas depois de receber a foto no Manager',()=>{
 const app=readFileSync(new URL('../public/app.js',import.meta.url),'utf8');
 const card=readFileSync(new URL('../public/specificationCard.js',import.meta.url),'utf8');
 const img=app.indexOf("if(Number(m.slot)===3)");
 const hash=app.indexOf("const sha256=await imageBlobSha256(prepared.blob)",img);
 assert(img>0&&hash>img);
 const block=app.slice(img,hash);
 assert.match(block,/confirmedSpecCard\(\{/);
 assert.match(block,/sourceEvidenceSku:w\.sourceEvidence\?\.sku/);
 assert.match(block,/supplierMatchedBy:w\.supplierProduct\?\.matchedBy/);
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

test('imagem 03 NÃO combina especificações de outra SKU ou WeDrop sem vínculo',()=>{
 const correct={sku:'684BR',sourceEvidenceSku:'684BR',supplierMatchedBy:'exact-sku',
  sourceText:'Dimensões: 18cm altura x 14cm largura x 20cm comprimento'};
 assert.equal(confirmedSpecCard({...correct,sourceEvidenceSku:'2392'}),null);
 assert.equal(confirmedSpecCard({...correct,supplierMatchedBy:''}),null);
 assert.equal(confirmedSpecCard({...correct,supplierMatchedBy:'inferred'}),null);
 assert.deepEqual(confirmedSpecCard(correct)?.measurements.map(x=>x.value),['18 cm','14 cm','20 cm']);
});
test('medidas do conjunto/pista montada não são medidas individuais do caminhão',()=>{
 const source='Dimensões da pista montada: Aproximadamente 60cm de comprimento x 52,1cm de largura x 13,4cm de altura';
 assert.equal(confirmedProductDimensionsFromWeDrop(source),null);
 const spec=confirmedSpecCard({sourceText:source,sku:'684BR',sourceEvidenceSku:'684BR',
  supplierMatchedBy:'reviewed-link'});
 assert.equal(spec?.measurements.length,0,'sem cotas sobre caminhão isolado');
 assert.equal(spec?.facts[0]?.label,'Pista montada');
});

test('A388105: dados da pista não viram medidas do carrinho e metadados logísticos não são usados',async()=>{
 const {confirmedProductSideFactsFromWeDrop,confirmedAssembledTrackDimensionsFromWeDrop}=
  await import('../public/productDimensions.js');
 const source=[
  'Dimensões da pista montada: Aproximadamente 60cm de comprimento x 52,1cm de largura x 13,4cm de altura',
  'Alimentação do carrinho: 01 pilha AA de 1,5V (Pilha Não inclusa)',
  'Idade recomendada: Acima de 3 anos',
  'Composição: Plástico',
  'Capacidade: 30 peças',
  'Cor: Multicolorido',
  'Peso:400g',
  'PESO',
  '550g',
  'ALTURA',
  '23cm',
  'LARGURA',
  '36cm',
  'COMPRIMENTO',
  '6cm'
 ].join('\\n'); // WeDrop chega muitas vezes com quebras literais
 const track=confirmedAssembledTrackDimensionsFromWeDrop(source);
 assert.equal(track?.subject,'pista montada');
 assert.equal(track?.value,'60 cm × 52,1 cm × 13,4 cm');
 const facts=confirmedProductSideFactsFromWeDrop(source);
 assert.deepEqual(facts.slice(0,3),[
  {label:'Pista montada',value:'60 cm × 52,1 cm × 13,4 cm'},
  {label:'Conjunto',value:'30 peças'},
  {label:'Peso',value:'400 g'}
 ]);
 assert.equal(confirmedProductDimensionsFromWeDrop(source),null);
 const spec=confirmedSpecCard({sku:'A388105',sourceEvidenceSku:'A388105',
  supplierMatchedBy:'exact-sku',sourceText:source});
 assert.equal(spec.measurements.length,0,'não desenhar setas de dimensão no carrinho');
 assert.deepEqual(spec.facts.slice(0,3),facts.slice(0,3));
 assert.ok(!JSON.stringify(spec).includes('272 g'));
 assert.ok(!JSON.stringify(spec).includes('550 g'));
});
