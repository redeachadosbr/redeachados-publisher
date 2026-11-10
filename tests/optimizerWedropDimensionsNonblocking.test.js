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
