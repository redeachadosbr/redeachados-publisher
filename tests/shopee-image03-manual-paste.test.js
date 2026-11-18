import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const app=readFileSync(new URL('../public/app.js',import.meta.url),'utf8');
const html=readFileSync(new URL('../public/index.html',import.meta.url),'utf8');

test('colagem manual da imagem 03 preserva cotas da foto e não exige consulta WeDrop para gravar',()=>{
 const begin=app.indexOf('async function optimizerImageCorrectionImportFile(file)');
 const end=app.indexOf("$('#optimizerImageCorrectionChoose')",begin);
 assert.ok(begin>0&&end>begin);
 const code=app.slice(begin,end);
 assert.match(code,/optimizerChatgptScaleFile\(file\)/);
 assert.match(code,/optimizerVerifiedDimensionSpec\(w\)\.catch\(\(\)=>null\)/);
 assert.doesNotMatch(code,/dimensionCount<2\)throw/);
 assert.doesNotMatch(code,/addConfirmedSpecificationCard/);
 assert.match(code,/imagem-03-arte-chatgpt-com-cotas/);
 assert.match(code,/X-Expect-Empty-Slot/);
 assert.match(code,/X-Expected-Sha256/);
 assert.match(code,/optimizerImagesLoad\(\)/);
});
test('botão, clique no retângulo, Ctrl+V no painel e arquivo selecionado usam a mesma importação',()=>{
 assert.match(app,/correctionDrop\.addEventListener\('click',\(\)=>correctionDrop\.focus\(\)\)/);
 assert.match(app,/document\.addEventListener\('paste'/);
 assert.match(app,/ready\?\.open/);
 assert.match(app,/optimizerCorrectionHandlePaste\(e\)/);
 assert.match(app,/navigator\.clipboard\.read\(\)/);
 assert.match(app,/optimizerImageCorrectionImportFile\(file\)/);
 assert.match(app,/optimizerCorrectionPastedFile\(e\)/);
 assert.match(html,/id="optimizerImageCorrectionFile"/);
 assert.match(html,/paste03=20261118-paste-ready-v1/);
});
test('importação em lote não recusa a posição 03 apenas por indisponibilidade da consulta WeDrop',()=>{
 const begin=app.indexOf("$('#optimizerChatgptImport')?.addEventListener");
 const end=app.indexOf('function optimizerImagesSameSku(',begin);
 const code=app.slice(begin,end);
 assert.match(code,/optimizerVerifiedDimensionSpec\(w\)\.catch\(\(\)=>null\)/);
 assert.doesNotMatch(code,/Imagem 03 exige medidas WeDrop da SKU confirmadas/);
 assert.match(code,/confira os números da imagem/);
});
