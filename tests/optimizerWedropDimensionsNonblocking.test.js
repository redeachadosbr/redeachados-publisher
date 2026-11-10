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
 assert.match(resume,/if\(Number\(missing\[0\]\)===3\)/);
 assert.doesNotMatch(resume,/if\(missing\.includes\(3\)\)\{/);
 assert.match(resume,/optimizerRequireThirdChatgptDimensions\(w,brief\)/);
 assert.doesNotMatch(resume,/method:'DELETE'|restart:true/);
});
