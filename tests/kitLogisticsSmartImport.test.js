import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {parseKitLogisticsText} from '../public/kit-logistics-parser.js';

test('preenche peso, dimensões, SKU e prazo em português com vírgula decimal',()=>{
 const r=parseKitLogisticsText(
  'SKU principal: 310200\nPeso total embalado: 1,55 kg\nComprimento pacote: 30 cm\nLargura pacote: 25 cm\nAltura pacote: 20 cm\nKit sob encomenda: sim\nDias para enviar (sob encomenda): 7\nSincronizar dias de envio: não');
 assert.deepEqual(r.values,{
  weightKg:1.55,lengthCm:30,widthCm:25,heightCm:20,mainSku:'310200',
  preOrder:true,autoSyncDts:false,daysToShip:7
 });
});
test('converte g para kg, dimensões mm para centímetros e aceita C x L x A explícito',()=>{
 const r=parseKitLogisticsText('Peso da embalagem: 1.550 g\nDimensões do pacote (C x L x A): 300 x 250 x 200 mm');
 assert.equal(r.values.weightKg,1.55);
 assert.equal(r.values.lengthCm,30);
 assert.equal(r.values.widthCm,25);
 assert.equal(r.values.heightCm,20);
});
test('não adivinha medidas sem ordem C x L x A ou campos nomeados',()=>{
 const r=parseKitLogisticsText('Medidas do brinquedo: 30 x 20 x 10 cm\nPeso líquido: 700 g\nSKU: 310200');
 assert.equal(Object.keys(r.values).length,0);
});
test('rejeita valores conflitantes, medidas fracionadas e limites inválidos',()=>{
 const r=parseKitLogisticsText('Peso embalado: 2 kg\nPeso embalado: 3 kg\nAltura: 20,5 cm\nComprimento: 0 cm\nLargura: 400 cm');
 assert.equal(r.values.weightKg,undefined);
 assert.equal(r.values.heightCm,undefined);
 assert.equal(r.values.lengthCm,undefined);
 assert.equal(r.values.widthCm,undefined);
 assert.ok(r.warnings.length>=2);
});
test('somente explicitamente assinalados mudam booleanos e dias',()=>{
 assert.deepEqual(parseKitLogisticsText('Kit sob encomenda\nSincronizar dias de envio\nDias para enviar: 45').values,{});
 assert.equal(parseKitLogisticsText('Kit sob encomenda: não\nSincronizar dias de envio: sim\nDias para enviar: 10').values.preOrder,false);
 assert.equal(parseKitLogisticsText('Kit sob encomenda: não\nSincronizar dias de envio: sim\nDias para enviar: 10').values.autoSyncDts,true);
});
test('lê campos de prints quando nome e valor ficam em linhas consecutivas',()=>{
 const r=parseKitLogisticsText('Peso total embalado (kg)\n1,25\nComprimento pacote (cm)\n35\nLargura pacote (cm)\n25\nAltura pacote (cm)\n15');
 assert.deepEqual([r.values.weightKg,r.values.lengthCm,r.values.widthCm,r.values.heightCm],[1.25,35,25,15]);
});
test('os controles do assistente estão ligados à seção logística e não à publicação automática',()=>{
 const html=fs.readFileSync(new URL('../public/index.html',import.meta.url),'utf8');
 const js=fs.readFileSync(new URL('../public/kit-builder.js',import.meta.url),'utf8');
 const css=fs.readFileSync(new URL('../public/kit-builder.css',import.meta.url),'utf8');
 const begin=html.indexOf('id="kitLogisticsSmartImport"'),fields=html.indexOf('class="kit-publish-fields"',begin);
 assert.ok(begin>0&&fields>begin&&html.indexOf('id="kitPublishPanel"')<begin);
 for(const id of ['kitLogisticsSourceText','kitLogisticsSourceImage','kitLogisticsPasteImage',
  'kitLogisticsAutofill','kitLogisticsUndo','kitLogisticsClear','kitLogisticsSmartStatus'])
  assert.equal((html.match(new RegExp('id="'+id+'"','g'))||[]).length,1,id);
 assert.match(js,/parseKitLogisticsText\(typed\+'\\n'\+extracted\)/);
 assert.match(js,/recognizeKitLogisticsPrint\(file,/);
 assert.match(js,/clearKitPublishApproval\(\)/);
 assert.match(js,/kitLogisticsUndoSnapshot/);
 assert.match(js,/kitResolveLogisticOption\(/);
 assert.match(js,/kitApplyPendingLogisticName\(\)/);
 assert.match(css,/kit-logistics-smart-import/);
 assert.match(html,/kit-builder\.js\?v=3\.6\.3-ocr-columns/);
});
test('OCR de imagem é opcional, no navegador e não envia print ao servidor',()=>{
 const ocr=fs.readFileSync(new URL('../public/kit-logistics-ocr.js',import.meta.url),'utf8');
 assert.match(ocr,/createWorker\('por',1/);
 assert.match(ocr,/worker\.recognize\(file\)/);
 assert.match(ocr,/12\*1024\*1024/);
 assert.doesNotMatch(ocr,/fetch\s*\(/);
});

test('sob encomenda permanece desativado mesmo que texto ou print solicite SIM',()=>{
 const html=fs.readFileSync(new URL('../public/index.html',import.meta.url),'utf8');
 const js=fs.readFileSync(new URL('../public/kit-builder.js',import.meta.url),'utf8');
 const css=fs.readFileSync(new URL('../public/kit-builder.css',import.meta.url),'utf8');
 assert.match(html,/<label hidden class="kit-inline-checkbox kit-preorder-hidden"><input id="kitPreOrder" type="checkbox" disabled/);
 assert.match(html,/<label hidden class="kit-preorder-hidden">Dias para enviar/);
 assert.match(css,/\.kit-preorder-hidden\[hidden\][\s\S]*?display:none!important/);
 assert.match(js,/function kitDisablePreOrder\(\)/);
 assert.match(js,/input\.checked=false;input\.disabled=true/);
 assert.match(js,/autoSyncDts:\$\('#kitAutoSyncDts'\)\.checked,preOrder:false/);
 assert.match(js,/daysToShip:0/);
 assert.match(js,/for\(const key of \['weightKg','lengthCm','widthCm','heightCm','autoSyncDts'\]\)/);
 assert.match(js,/Prazo sob encomenda ignorado/);
 assert.doesNotMatch(html,/Sob encomenda: sim \| Dias para enviar: 7/);
 assert.match(html,/id="kitAutoSyncDts"/);
});

test('corrige print WeDrop com Total e números embaixo de cada rótulo',()=>{
 const r=parseKitLogisticsText(
  'Nome do Kit\nKit Brinquedos para Bebê 12 Meses\nCusto Total: R$ 60,98\nLargura Total (Em cm)\n28\nAltura Total (Em cm)\n36\nComprimento Total (Em cm)\n16\nPeso Total (em gramas)\n353,26');
 assert.deepEqual(
  [r.values.lengthCm,r.values.widthCm,r.values.heightCm,r.values.weightKg],
  [16,28,36,0.354]
 );
 assert.equal(Object.hasOwn(r.values,'cost'),false);
 assert.match(r.warnings.join(' '),/kit completo embalado/);
});
test('corrige imagem em colunas: cabeçalhos agrupados e valores na linha seguinte',()=>{
 const r=parseKitLogisticsText(
  'Nome do Kit\nKit Brinquedos para Bebê 12 Meses Elefante Musical\nCusto Total Largura Total (Em cm) Altura Total (Em cm) Comprimento Total (Em cm) Peso Total (em gramas)\nR$ 60,98 28 36 16 353,26');
 assert.deepEqual(
  [r.values.lengthCm,r.values.widthCm,r.values.heightCm,r.values.weightKg],
  [16,28,36,0.354]
 );
});
test('captura Peso Total em gramas e centímetro sem palavras pacote ou embalagem',()=>{
 const r=parseKitLogisticsText(
  'Largura Total (Em cm): 28\nAltura Total (Em cm): 36\nComprimento Total (Em cm): 16\nPeso Total (em gramas): 353,26');
 assert.equal(r.values.weightKg,0.354);
 assert.equal(r.values.lengthCm,16);
 assert.equal(r.values.widthCm,28);
 assert.equal(r.values.heightCm,36);
});
test('não copia custo total do fornecedor como peso ou medida',()=>{
 const r=parseKitLogisticsText(
  'Custo Total R$ 60,98\nNome do Kit 12 meses\nSKU: 310200');
 assert.equal(r.values.weightKg,undefined);
 assert.equal(r.values.lengthCm,undefined);
 assert.equal(r.values.widthCm,undefined);
 assert.equal(r.values.heightCm,undefined);
});
test('OCR reforça prints escuros com ampliação e mantém leitura local',()=>{
 const ocr=fs.readFileSync(new URL('../public/kit-logistics-ocr.js',import.meta.url),'utf8');
 assert.match(ocr,/enhancePrintForOCR/);
 assert.match(ocr,/createImageBitmap\(file\)/);
 assert.match(ocr,/worker\.recognize\(improved\)/);
 assert.match(ocr,/logisticsScore\(/);
 assert.doesNotMatch(ocr,/fetch\s*\(/);
});

test('OCR com unidade gramas dividida por quebra de linha e tabela repartida',()=>{
 const r=parseKitLogisticsText(
  'Custo Total Largura Total (Em cm) Altura Total (Em cm)\n'+
  'Comprimento Total (Em cm) Peso Total (em gramas)\n'+
  'R$ 60,98 28 36 16 353,26');
 assert.deepEqual(
  [r.values.lengthCm,r.values.widthCm,r.values.heightCm,r.values.weightKg],
  [16,28,36,0.354]
 );
 const fragmented=parseKitLogisticsText('Peso Total (em\ngramas)\n353,26');
 assert.equal(fragmented.values.weightKg,0.354);
});
