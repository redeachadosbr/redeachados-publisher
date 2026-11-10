import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {
 confirmedProductDimensionsFromWeDrop,
 confirmedCatalogCrossCheckedDimensionsFromWeDrop
} from '../public/productDimensions.js';

const exact={sku:'EXEMPLO',sourceEvidenceSku:'EXEMPLO',sourceSaved:true,
 supplierMatchedBy:'exact-sku',
 catalogMeasurements:{heightCm:20,widthCm:16,lengthCm:22}};

test('reconhece altura, largura e comprimento nomeados antes dos valores',()=>{
 const spec=confirmedProductDimensionsFromWeDrop(
  'Especificações:\nDimensões: Altura: 20 cm x Largura: 16 cm x Comprimento: 22 cm');
 assert.deepEqual(spec?.measurements.map(x=>[x.axis,x.value]),[
  ['altura','20 cm'],['largura','16 cm'],['comprimento','22 cm']
 ]);
});

test('cruza as medidas cadastradas na SKU mesmo que o fornecedor as escreva na ordem C x L x A',()=>{
 const spec=confirmedCatalogCrossCheckedDimensionsFromWeDrop(
  'Dimensões: 22 cm x 16 cm x 20 cm',exact);
 assert.deepEqual(spec?.measurements.map(x=>[x.axis,x.value]),[
  ['altura','20 cm'],['largura','16 cm'],['comprimento','22 cm']
 ]);
});

test('não aceita outro produto, texto divergente nem dimensão da embalagem',()=>{
 assert.equal(confirmedCatalogCrossCheckedDimensionsFromWeDrop(
  'Dimensões: 22 x 16 x 20',{...exact,sourceEvidenceSku:'OUTRA'}),null);
 assert.equal(confirmedCatalogCrossCheckedDimensionsFromWeDrop(
  'Dimensões: 22 x 16 x 19',exact),null);
 assert.equal(confirmedCatalogCrossCheckedDimensionsFromWeDrop(
  'Dimensões da embalagem: 22 x 16 x 20',exact),null);
 assert.equal(confirmedProductDimensionsFromWeDrop(
  'Dimensões da embalagem: Altura 20 cm x Largura 16 cm'),null);
});

test('gerar/continuar permite iniciar 01 sem exigir previamente as cotas da 03',()=>{
 const app=readFileSync(new URL('../public/app.js',import.meta.url),'utf8');
 const makeBrief=app.slice(app.indexOf('async function optimizerChatgptMakeBrief('),
  app.indexOf('async function optimizerFreshSavedWeDrop('));
 assert.match(makeBrief,/const dimensionWarning=/);
 assert.doesNotMatch(makeBrief,/throw Error\('Há dimensões salvas/);
 const resume=app.slice(app.indexOf('async function optimizerChatgptContinueFromServer()'),
  app.indexOf('globalThis.__RA_SHOPEE_RESUME_BRIDGE',app.indexOf('async function optimizerChatgptContinueFromServer()')));
 assert.match(resume,/if\(allMissing\.includes\(3\)\)/);
 assert.doesNotMatch(resume,/if\(missing\.includes\(3\)\)\{/);
 assert.match(resume,/optimizerRequireThirdChatgptDimensions\(w,brief\)/);
 assert.doesNotMatch(resume,/method:'DELETE'/);
 assert.match(resume,/const bridgeCompleted=deferredThird\?/);
 assert.match(resume,/allMissing\.filter\(slot=>slot!==3\)/);
 assert.match(resume,/completed:bridgeCompleted/);
});

test('imagem 03 sem eixos não bloqueia 04–09 na geração pela API',()=>{
 const app=readFileSync(new URL('../public/app.js',import.meta.url),'utf8');
 const start=app.indexOf("$('#optimizerImagesGenerateAll')?.addEventListener?.('click'");
 const finish=app.indexOf("$('#optimizerImagesFiles')",start);
 const batch=app.slice(start,finish);
 assert.match(batch,/if\(slot===3\)\{\s*try\{\s*const verified=await optimizerVerifiedDimensionSpec\(w\)/);
 assert.match(batch,/deferredThird=true;status\.textContent=/);
 assert.match(batch,/continue;/);
 assert.match(batch,/deferredThird\?'Geração parcial:/);
 assert.doesNotMatch(batch,/method:'DELETE'/);
});

test('a ponte ignora temporariamente 03 na fila, mas mantém o status real de 8/9',()=>{
 const app=readFileSync(new URL('../public/app.js',import.meta.url),'utf8');
 const start=app.indexOf('async function optimizerChatgptContinueFromServer()');
 const finish=app.indexOf('// O coordenador da extensão espera um resultado REAL',start);
 const bridge=app.slice(start,finish);
 assert.match(bridge,/const missing=deferredThird\?allMissing\.filter\(slot=>slot!==3\):allMissing/);
 assert.match(bridge,/const bridgeCompleted=deferredThird\?\[\.\.\.stored,3\]/);
 assert.match(bridge,/optimizerChatBridgeRemember\(w,missing\)/);
 assert.match(bridge,/completed:bridgeCompleted/);
 assert.match(bridge,/restart:freshThird\|\|deferredThird/);
 assert.doesNotMatch(bridge,/method:'DELETE'/);
});

test('falhas de rede não são confundidas com cotas pendentes na Ponte',()=>{
 const app=readFileSync(new URL('../public/app.js',import.meta.url),'utf8');
 const resume=app.slice(app.indexOf('async function optimizerChatgptContinueFromServer()'),
  app.indexOf('globalThis.__RA_SHOPEE_RESUME_BRIDGE',app.indexOf('async function optimizerChatgptContinueFromServer()')));
 assert.match(resume,/const dimensionPending=\//);
 assert.match(resume,/if\(!optimizerImagesSameSku\(w\)\|\|!dimensionPending\)throw error;/);
});

test('a mensagem final do lote parcial mantém a pendência da imagem 03 visível',()=>{
 const app=readFileSync(new URL('../public/app.js',import.meta.url),'utf8');
 const batch=app.slice(app.indexOf("$('#optimizerImagesGenerateAll')?.addEventListener?.('click'"),
  app.indexOf("$('#optimizerImagesUpload')?.addEventListener?.('click'"));
 assert.match(batch,/:deferredThird\?'Lote parcial:/);
 assert.match(batch,/Imagem 03 pendente de dimensões WeDrop confirmadas/);
});

test('SKU 895332: texto real multiline confirma apenas altura e diâmetro do produto',async()=>{
 const {confirmedSpecCard}=await import('../public/specificationCard.js');
 const sourceText=[
  'Fonte Bebedouro 3 modos Para Pets 20cm',
  'Especificações:', 'Dimensões:', '',
  ' 20cm altura x 19cm diamentro/ ', '',
  'Comprimento do cabo USB: 1,40m',
  'ALTURA', '14cm', 'LARGURA', '21cm', 'COMPRIMENTO', '21cm'
 ].join('\n');
 const spec=confirmedSpecCard({
  sourceText,sku:'895332',sourceEvidenceSku:'895332',
  sourceSaved:true,supplierMatchedBy:'exact-sku',
  catalogMeasurements:{heightCm:'14',widthCm:'21',lengthCm:'21'}
 });
 assert.deepEqual(spec?.measurements.map(x=>[x.axis,x.value]),[
  ['altura','20 cm'],['diametro','19 cm']
 ]);
 assert.equal(spec.measurements.some(x=>x.value==='14 cm'||x.value==='21 cm'),false);
});

test('SKU 895332: medidas 14 x 21 x 21 são da embalagem e nunca viram cotas do produto',async()=>{
 const {confirmedSpecCard}=await import('../public/specificationCard.js');
 const base={sku:'895332',sourceEvidenceSku:'895332',sourceSaved:true,
  supplierMatchedBy:'exact-sku',
  catalogMeasurements:{heightCm:14,widthCm:21,lengthCm:21}};
 const product=confirmedSpecCard({...base,sourceText:[
  'Fonte Bebedouro 3 Modos para Pets 20 cm',
  'Especificações:', 'Dimensões:', '',
  '20cm altura x 19cm diamentro/',
  'Dimensões da embalagem: 14cm altura x 21cm largura x 21cm comprimento',
  'ALTURA', '14cm', 'LARGURA', '21cm', 'COMPRIMENTO', '21cm'
 ].join('\n')});
 assert.deepEqual(product?.measurements.map(x=>[x.label,x.value]),[
  ['ALTURA','20 cm'],['DIAMETRO','19 cm']
 ]);
 assert.doesNotMatch(JSON.stringify(product),/14 cm|21 cm/);
 assert.equal(confirmedSpecCard({...base,sourceText:
  'ALTURA\n14cm\nLARGURA\n21cm\nCOMPRIMENTO\n21cm'}),null,
  'campos logísticos isolados não validam medidas comerciais');
 assert.equal(confirmedSpecCard({...base,sourceText:
  'Dimensões da embalagem: 14cm altura x 21cm largura x 21cm comprimento'}),null,
  'dimensões explicitamente da embalagem nunca autorizam a imagem 03');
});

test('linha seguinte só pode conter cotas explícitas; não aceita dados do cabo ou embalagem',()=>{
 assert.equal(confirmedProductDimensionsFromWeDrop(
  'Dimensões:\n\nComprimento do cabo USB: 1,40m'),null);
 assert.equal(confirmedProductDimensionsFromWeDrop(
  'Dimensões da embalagem:\n20cm altura x 19cm diamentro'),null);
 assert.equal(confirmedProductDimensionsFromWeDrop(
  'Dimensões:\n20cm altura x 19cm diamentro\nDimensões: 25cm altura x 19cm diametro'),null);
});

test('arte 03 aceita duas cotas no bebedouro e preserva três cotas quando existem',async()=>{
 const card=readFileSync(new URL('../public/specificationCard.js',import.meta.url),'utf8');
 const {createChatGptPrompts}=await import('../public/chatgptPrompts.js');
 assert.match(card,/diameter=get\('diametro'\)/);
 assert.match(card,/label:'Diâmetro'/);
 const two=createChatGptPrompts({
  title:'Fonte Bebedouro 3 Modos para Pets 20cm',
  supplierSourceText:'Dimensões:\\n20cm altura x 19cm diamentro'
 });
 assert.match(two.prompts[2],/ALTURA: 20 cm; DIAMETRO: 19 cm/);
 assert.match(two.prompts[2],/TERÁ APENAS AS COTAS COMPROVADAS/);
 assert.doesNotMatch(two.prompts[2],/TERÁ AS TRÊS COTAS/);
 const three=createChatGptPrompts({
  title:'Produto com três eixos confirmados',
  confirmedDimensionSpec:{measurements:[
   {axis:'altura',label:'ALTURA',value:'40 cm'},
   {axis:'largura',label:'LARGURA',value:'30 cm'},
   {axis:'comprimento',label:'COMPRIMENTO',value:'55 cm'}
  ]}
 });
 assert.match(three.prompts[2],/TERÁ AS TRÊS COTAS VISÍVEIS/);
});

test('outras SKUs: bloco Embalagem separado não autoriza cotas comerciais',()=>{
 const fromPackage='Embalagem:\nDimensões:\n20cm altura x 16cm largura x 22cm comprimento';
 assert.equal(confirmedProductDimensionsFromWeDrop(fromPackage),null);
 assert.equal(confirmedCatalogCrossCheckedDimensionsFromWeDrop(
  'Dados logísticos:\nDimensões: 22 x 16 x 20',exact),null);
 assert.equal(confirmedCatalogCrossCheckedDimensionsFromWeDrop(
  'Embalagem:\nDimensões: 22 x 16 x 20',exact),null);
});

test('outras SKUs: dimensões físicas continuam legíveis após seção de embalagem',()=>{
 const source='Embalagem:\nDimensões: 20cm altura x 16cm largura x 22cm comprimento\n'+
  'Especificações do produto:\nDimensões:\n18cm altura x 15cm diametro';
 const spec=confirmedProductDimensionsFromWeDrop(source);
 assert.deepEqual(spec?.measurements.map(x=>[x.axis,x.value]),[
  ['altura','18 cm'],['diametro','15 cm']
 ]);
 const fallback=confirmedCatalogCrossCheckedDimensionsFromWeDrop(
  'Embalagem:\nDimensões: 22 x 16 x 20\nProduto:\nDimensões: 22 x 16 x 20',exact);
 assert.deepEqual(fallback?.measurements.map(x=>[x.axis,x.value]),[
  ['altura','20 cm'],['largura','16 cm'],['comprimento','22 cm']
 ]);
});


test('subtítulos genéricos não encerram bloco Embalagem antes das medidas',()=>{
 const nested=[
  'Embalagem:', 'Dados técnicos:', 'Observações:',
  'Dimensões:', '14cm altura x 21cm largura x 21cm comprimento'
 ].join('\n');
 assert.equal(confirmedProductDimensionsFromWeDrop(nested),null);
 const numeric='Embalagem:\nDados técnicos:\nDimensões: 14 x 21 x 21';
 assert.equal(confirmedCatalogCrossCheckedDimensionsFromWeDrop(numeric,{
  ...exact,catalogMeasurements:{heightCm:14,widthCm:21,lengthCm:21}
 }),null);
});

test('seção Produto explícita reabre medidas físicas após embalagem com subtítulos',()=>{
 const text=[
  'Embalagem:', 'Dados técnicos:', 'Dimensões:',
  '14cm altura x 21cm largura x 21cm comprimento',
  'Produto:', 'Especificações:', 'Dimensões:',
  '20cm altura x 19cm diamentro'
 ].join('\n');
 const spec=confirmedProductDimensionsFromWeDrop(text);
 assert.deepEqual(spec?.measurements.map(({axis,value})=>[axis,value]),[
  ['altura','20 cm'],['diametro','19 cm']
 ]);
});

test('renderização da arte 03 desenha só 20 cm e 19 cm, sem medidas logísticas',async()=>{
 const {confirmedSpecCard,addConfirmedSpecificationCard}=
  await import('../public/specificationCard.js');
 const spec=confirmedSpecCard({
  sku:'895332',sourceEvidenceSku:'895332',sourceSaved:true,
  supplierMatchedBy:'exact-sku',
  catalogMeasurements:{heightCm:14,widthCm:21,lengthCm:21},
  sourceText:[
   'Fonte Bebedouro 3 Modos para Pets', 'Produto:',
   'Dimensões:', '20cm altura x 19cm diamentro/',
   'Embalagem:', 'Dados técnicos:', 'Dimensões:',
   '14cm altura x 21cm largura x 21cm comprimento'
  ].join('\n')
 });
 assert.deepEqual(spec.measurements.map(({axis,value})=>[axis,value]),[
  ['altura','20 cm'],['diametro','19 cm']
 ]);
 const drawn=[];
 const ctx={
  save(){},restore(){},drawImage(){},beginPath(){},roundRect(){},
  fill(){},stroke(){},moveTo(){},lineTo(){},
  fillText(value){drawn.push(String(value));},
  measureText(value){return {width:String(value).length*12}}
 };
 const oldDocument=globalThis.document;
 const oldCreateImageBitmap=globalThis.createImageBitmap;
 try{
  globalThis.document={createElement(tag){
   assert.equal(tag,'canvas');
   return {getContext:()=>ctx,toBlob:callback=>
    callback(new Blob([new Uint8Array(2048)],{type:'image/png'}))};
  }};
  globalThis.createImageBitmap=async()=>({close(){}});
  const blob=await addConfirmedSpecificationCard(
   new Blob(['foto'],{type:'image/jpeg'}),spec);
  assert.equal(blob.type,'image/png');
  assert.deepEqual(drawn.filter(x=>/^\d+ cm$/.test(x)),['20 cm','19 cm']);
  assert.ok(drawn.includes('Altura'));
  assert.ok(drawn.includes('Diâmetro'));
  assert.equal(drawn.some(x=>/\b(?:14|21)\s*cm\b/.test(x)),false);
  drawn.length=0;
  await addConfirmedSpecificationCard(new Blob(['foto'],{type:'image/jpeg'}),{
   measurements:[
    {axis:'altura',label:'ALTURA',value:'40 cm'},
    {axis:'largura',label:'LARGURA',value:'30 cm'},
    {axis:'comprimento',label:'COMPRIMENTO',value:'55 cm'}
   ],facts:[]
  });
  assert.ok(drawn.includes('40 cm'));
  assert.ok(drawn.includes('30 cm'));
  assert.ok(drawn.some(x=>x.includes('55 cm')));
 }finally{
  if(oldDocument===undefined)delete globalThis.document;
  else globalThis.document=oldDocument;
  if(oldCreateImageBitmap===undefined)delete globalThis.createImageBitmap;
  else globalThis.createImageBitmap=oldCreateImageBitmap;
 }
});
