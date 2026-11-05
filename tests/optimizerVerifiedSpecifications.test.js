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
test('WS20357 aplica medidas 183 cm comprimento e 69 cm largura cadastradas manualmente',()=>{
 const sourceText=[
  'Colchão Inflável Piscina 183x69cm Verão',
  'ESPECIFICAÇÕES:',
  '- Material: 100% PVC',
  '- Dimensões: 183cm comprimento x 69cm largura',
  '- Cor: Azul, Amarelo e Rosa',
  'PRODUTO ENVIADO COM COR SORTIDA'
 ].join('\n');
 const extracted=confirmedProductDimensionsFromWeDrop(sourceText);
 assert.deepEqual(extracted?.measurements.map(x=>[x.axis,x.value]),[
  ['largura','69 cm'],['comprimento','183 cm']
 ]);
 const data={sku:'WS20357',sourceEvidenceSku:'WS20357',sourceSaved:true,
  supplierMatchedBy:'',sourceText};
 const spec=confirmedSpecCard(data);
 assert.deepEqual(spec.measurements.map(x=>[x.label,x.value]),[
  ['LARGURA','69 cm'],['COMPRIMENTO','183 cm']
 ]);
 assert.equal(confirmedSpecCard({...data,sourceEvidenceSku:'OUTRA-SKU'}),null);
 assert.equal(confirmedSpecCard({...data,sourceSaved:false}),null,
  'Sem registro validado nem vínculo não se aceita o texto');
 const card=readFileSync(new URL('../public/specificationCard.js',import.meta.url),'utf8');
 assert.match(card,/const poolPortrait=!height&&Boolean\(length&&width\)/);
 assert.match(card,/value:length\.value,label:'Comprimento'/);
});

test('prompt 03 informa somente medidas confirmadas pela SKU e fotografa sem numeros inventados',()=>{
 const x=createChatGptPrompts({sku:'2392',title:'Bicicleta Infantil Moto Cross Rosa',
  supplierSourceText:evidence});
 assert.match(x.prompts[2],/ARTE FINAL PRONTA/);
 assert.match(x.prompts[2],/ALTURA: 75 cm; LARGURA: 63 cm; COMPRIMENTO: 117 cm/);
 assert.deepEqual(x.confirmedDimensions.measurements.map(x=>x.value),['75 cm','63 cm','117 cm']);
 assert.doesNotMatch(x.prompts[2],/48 cm|58 cm|68 cm|72 cm|35 cm/);
});
test('imagem 03 importa arte pronta sem sobrepor outra camada de medidas',()=>{
 const app=readFileSync(new URL('../public/app.js',import.meta.url),'utf8');
 const card=readFileSync(new URL('../public/specificationCard.js',import.meta.url),'utf8');
 const img=app.indexOf("if(Number(m.slot)===3)");
 const hash=app.indexOf("const sha256=await imageBlobSha256(prepared.blob)",img);
 assert(img>0&&hash>img);
 const block=app.slice(img,hash);
 assert.match(block,/optimizerVerifiedDimensionSpec\(w\)/);
 assert.doesNotMatch(block,/addConfirmedSpecificationCard/);
 assert.match(block,/SEM sobrepor novas etiquetas/);
 const fresh=app.slice(app.indexOf('async function optimizerFreshSavedWeDrop(w)'),app.indexOf('async function optimizerChatgptRender(w)'));
 assert.match(fresh,/api\/shopee\/optimizer\/workflow\/source\?/);
 assert.match(fresh,/sourceEvidenceSku:source\.sku/);
 assert.match(fresh,/sourceSaved:true/);
 assert.match(fresh,/supplierMatchedBy:w\.verifiedWeDropMatchedBy\|\|w\.supplierProduct\?\.matchedBy/);
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

test('SKU 1736: texto WeDrop 10 x 10 x 14 + catálogo da MESMA SKU comprova altura/largura/comprimento',()=>{
 const sourceText=[
  'Processador de Alimentos Manual 500ml 3 Lâminas',
  'Especificações:',
  'Dimensões: 10 x 10 x 14',
  'Peso: 222',
  'Capacidade: 500 ml'
 ].join('\n');
 assert.equal(confirmedProductDimensionsFromWeDrop(sourceText),null,
  'sem confirmação não inferir as dimensões pelo triplo solto');
 const exact={sku:'1736',sourceEvidenceSku:'1736',sourceSaved:true,
  supplierMatchedBy:'exact-sku',
  catalogMeasurements:{heightCm:'10',widthCm:'10',lengthCm:'14'},
  sourceText};
 const confirmed=confirmedSpecCard(exact);
 assert.deepEqual(confirmed?.measurements.map(x=>[x.label,x.value]),[
  ['ALTURA','10 cm'],['LARGURA','10 cm'],['COMPRIMENTO','14 cm']
 ]);
 const prompt=createChatGptPrompts({title:'Processador de Alimentos Manual 500ml',
  supplierSourceText:sourceText,confirmedDimensionSpec:confirmed});
 assert.match(prompt.prompts[2],/ALTURA: 10 cm; LARGURA: 10 cm; COMPRIMENTO: 14 cm/);
 assert.equal(prompt.confirmedDimensions?.measurements.length,3);
 assert.doesNotMatch(prompt.prompts[2],/222 cm|500 cm/);
});
test('dimensões triplas sem confirmação, outra SKU ou valores divergentes não entram na Imagem 03',()=>{
 const base={sku:'1736',sourceEvidenceSku:'1736',sourceSaved:true,
  supplierMatchedBy:'exact-sku',
  catalogMeasurements:{heightCm:10,widthCm:10,lengthCm:14},
  sourceText:'Dimensões: 10 x 10 x 14'};
 assert.equal(confirmedSpecCard({...base,sourceEvidenceSku:'OUTRA-SKU'}),null);
 assert.equal(confirmedSpecCard({...base,sourceSaved:false}),null);
 assert.equal(confirmedSpecCard({...base,supplierMatchedBy:'inferred'}),null);
 assert.equal(confirmedSpecCard({...base,catalogMeasurements:{
  heightCm:10,widthCm:12,lengthCm:14}}),null);
 assert.equal(confirmedSpecCard({...base,sourceText:'Dimensões da embalagem: 10 x 10 x 14'}),null);
 assert.equal(confirmedSpecCard({...base,sourceText:'Dimensões: 10 x 10 x 12'}),null);
});
test('o editor da posição 03 consulta sempre a fonte salva do item individual e injeta dimensões comprovadas',()=>{
 const app=readFileSync(new URL('../public/app.js',import.meta.url),'utf8');
 const start=app.indexOf('async function optimizerChatgptMakeBrief(');
 const end=app.indexOf('// O campo "Informações da WeDrop"',start);
 const body=app.slice(start,end);
 assert.match(body,/api\/shopee\/optimizer\/workflow\/source\?/);
 assert.match(body,/const confirmedDimensionSpec=trustedText\?confirmedSpecCard\(/);
 assert.match(body,/catalogMeasurements:measures\|\|/);
 assert.match(body,/confirmedDimensionSpec,/);
 const check=app.slice(app.indexOf('async function optimizerVerifiedDimensionSpec(w)'),
  app.indexOf('async function optimizerChatgptRender(w)'));
 assert.match(check,/catalogMeasurements:w\.verifiedWeDropMeasurements/);
});

test('Imagem 03 da SKU 1736 recupera dimensões catalogadas sem depender da ficha pré-carregada',()=>{
 const sourceText=[
  'Processador de alimentos com 3 lâminas',
  'Especificações:',
  'Dimensões: 10 x 10 x 14',
  'Peso: 222',
  'Capacidade: 500 ml'
 ].join('\\n');
 const catalogMeasurements={widthCm:'10',heightCm:'10',lengthCm:'14',weightKg:'222'};
 const spec=confirmedSpecCard({
  sourceText,sku:'1736',sourceEvidenceSku:'1736',
  sourceSaved:true,supplierMatchedBy:'exact-sku',catalogMeasurements
 });
 assert.deepEqual(spec?.measurements?.map(x=>[x.axis,x.value]),[
  ['altura','10 cm'],['largura','10 cm'],['comprimento','14 cm']
 ]);
 const prompt=createChatGptPrompts({title:'Processador de Alimentos Manual 500ml',
  supplierSourceText:sourceText,confirmedDimensionSpec:spec});
 assert.match(prompt.prompts[2],/ALTURA: 10 cm; LARGURA: 10 cm; COMPRIMENTO: 14 cm/);
 assert.doesNotMatch(prompt.prompts[2],/222 cm|500 cm/);
 const app=readFileSync(new URL('../public/app.js',import.meta.url),'utf8');
 const server=readFileSync(new URL('../server.js',import.meta.url),'utf8');
 assert.match(server,/supplierMeasurements:matched\?supplier\.product_data\?\.catalogMeasurements/);
 assert.match(app,/const measures=verifiedCatalog\?source\.supplierMeasurements:null/);
 assert.match(app,/w\.verifiedWeDropMeasurements/);
 assert.match(app,/confirmedDimensionSpec,/);
});

test('imagem 03 coloca os números WeDrop no começo do prompt, antes da descrição da cena',()=>{
 const confirmed=confirmedSpecCard({sku:'1736',sourceEvidenceSku:'1736',
  sourceSaved:true,supplierMatchedBy:'exact-sku',
  catalogMeasurements:{heightCm:10,widthCm:10,lengthCm:14},
  sourceText:'Dimensões: 10 x 10 x 14'});
 const result=createChatGptPrompts({title:'Processador de Alimentos Manual 500ml',
  supplierSourceText:'Dimensões: 10 x 10 x 14',confirmedDimensionSpec:confirmed});
 const first=result.prompts[2].split('\\n\\n')[0];
 assert.match(first,/IMAGEM 03\/09 — MEDIDAS EXATAS WEDROP/);
 assert.match(first,/ALTURA: 10 cm; LARGURA: 10 cm; COMPRIMENTO: 14 cm/);
 assert.match(result.prompts[2],/OBRIGATÓRIO: ENTREGAR A IMAGEM 03 PRONTA/);
 assert.doesNotMatch(result.prompts[2],/\\\\n\\\\n/,'prompt não deve conter barra+n literal');
});

test('geração do slot 03 verifica as cotas da SKU antes de enviar comando à Ponte',()=>{
 const app=readFileSync(new URL('../public/app.js',import.meta.url),'utf8');
 const make=app.slice(app.indexOf('async function optimizerChatgptMakeBrief('),
  app.indexOf('async function optimizerFreshSavedWeDrop('));
 assert.match(make,/const trustedText=String\(evidence\?\.sku/);
 assert.doesNotMatch(make,/Boolean\(evidence\?\.updatedAt\)\?String\(evidence\.sourceText/);
 const assertPrompt=app.slice(app.indexOf('async function optimizerRequireThirdChatgptDimensions('),
  app.indexOf('async function optimizerChatgptRender('));
 assert.match(assertPrompt,/optimizerVerifiedDimensionSpec\(w\)/);
 assert.match(assertPrompt,/measures\.length<2/);
 assert.match(assertPrompt,/expected!==embedded/);
 assert.match(assertPrompt,/brief\?\.prompts\?\.\[2\]/);
 assert.match(assertPrompt,/Nenhuma imagem sem cotas será gerada/);
 const single=app.slice(app.indexOf('async function optimizerCommercialRequestChatgptSlot('),
  app.indexOf('async function optimizerChatgptCopyAll('));
 assert.match(single,/if\(slot===3\)\{\s*const measurements=await optimizerRequireThirdChatgptDimensions\(w,brief\)/);
 const continu=app.slice(app.indexOf('async function optimizerChatgptContinueFromServer('),
  app.indexOf('globalThis.__RA_SHOPEE_RESUME_BRIDGE'));
 assert.match(continu,/if\(missing\.includes\(3\)\)/);
 assert.match(continu,/await optimizerRequireThirdChatgptDimensions\(w,brief\)/);
 const card=app.slice(app.indexOf('let importThirdButton=null,thirdFallbackButton=null'),
  app.indexOf('let measureButton=null',app.indexOf('let importThirdButton=null,thirdFallbackButton=null')));
 assert.match(card,/thirdFallbackButton=fallback/);
 assert.doesNotMatch(card,/actions\.append\(fallback\)/);
});
