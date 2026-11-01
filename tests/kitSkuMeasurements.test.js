import test from 'node:test';
import assert from 'node:assert/strict';
import {detectSkuMeasurements,dimensionsFromSkuText} from '../public/kit-measurements.js';
import {kitPrompts,kitContentBrief} from '../shopeeKitBuilder.js';
test('medidas em texto livre são extraídas sem confundir idade, peças ou SKUs',()=>{
 const found=detectSkuMeasurements('Bebê a partir de 12 meses; kit 06 peças. Dimensões: 20 x 30 x 40 cm. Altura: 35 cm; largura de 12,5 cm; peso 1,2 kg.');
 assert.deepEqual(found.map(x=>x.value),['20 × 30 × 40 cm','altura: 35 cm','largura: 12,5 cm','peso: 1,2 kg']);
 assert.equal(dimensionsFromSkuText('12 meses e 6 peças'), '');
 assert.equal(dimensionsFromSkuText('20 x 30'), '');
});
test('briefing reconhece medidas do vendedor por SKU e não pede medidas já informadas',()=>{
 const components=[{sku:'310200',name:'Elefante Brincalhão Musical'},
   {sku:'278CHOCALHO',name:'Conjunto Torre e Bola Chocalho'}];
 const manualFacts={'310200':'Descrição de produto. Medidas: 27 x 21 x 16 cm; peso 700 g.',
  '278CHOCALHO':'Torre com bola. Altura: 19 cm. 12 meses são faixa etária.'};
 const kit={kitSku:'KIT-278CHOCALHO-310200',components};
 const result=kitContentBrief(kit,{manualFacts});
 assert.equal(result.missingDetails.length,0);
 assert.match(result.prompt,/SKU 310200[\s\S]*27 × 21 × 16 cm/);
 assert.match(result.prompt,/SKU 278CHOCALHO[\s\S]*altura: 19 cm/);
 assert(!result.components[1].detectedMeasurements.some(x=>x.value.includes('27 ×')));
 assert.equal(result.imagePrompts.length,9);
 for(const prompt of result.imagePrompts){
  assert.match(prompt,/SKU 310200/);
  assert.match(prompt,/SKU 278CHOCALHO/);
  assert.match(prompt,/TODOS OS 2 SKUS.*JUNTOS na MESMA CENA/);
  assert.match(prompt,/Nunca separar em duas fotos, quadros ou mosaico/);
  assert.match(prompt,/27 × 21 × 16 cm/);
  assert.match(prompt,/altura: 19 cm/);
 }
});
test('nove imagens mostram todos componentes juntos mesmo quando faltam medidas',()=>{
 const kit={components:[{sku:'A',name:'Elefante'},{sku:'B',name:'Chocalho'}]};
 const prompts=kitPrompts(kit);
 assert.equal(prompts.length,9);
 for(const p of prompts)assert.match(p,/Kit de 2 = UMA DUPLA visível/);
 assert(!prompts.join('\n').includes('20 × 30'));
 assert.throws(()=>kitPrompts(kit,{manualFacts:{C:'10 cm'}}),/fora deste kit/);
});

test('dimensões com unidade após cada eixo também são lidas sem inventar',()=>{
 const measures=detectSkuMeasurements('Medidas: 20cm x 30cm x 40cm. Peso: 1,5kg.');
 assert.deepEqual(measures.map(x=>x.value),['20 × 30 × 40 cm','peso: 1,5 kg']);
 assert.equal(dimensionsFromSkuText('Idade 12 meses, 5 peças.'),'');
});


test('KTE022BCF: medidas dos dois componentes com eixo depois do número',()=>{
 const facts='Dimensões: Porta Escova: 21,5cm altura x 6,7cm largura x 5cm comprimento / Saboneteira: 4cm altura x 10cm largura x 7,5cm comprimento';
 const values=detectSkuMeasurements(facts).map(x=>x.value);
 assert.deepEqual(values,[
  'Porta Escova — altura: 21,5 cm',
  'Porta Escova — largura: 6,7 cm',
  'Porta Escova — comprimento: 5 cm',
  'Saboneteira — altura: 4 cm',
  'Saboneteira — largura: 10 cm',
  'Saboneteira — comprimento: 7,5 cm'
 ]);
 assert.equal(dimensionsFromSkuText('Kit 6 peças para idade 12 meses'), '');
 assert.deepEqual(detectSkuMeasurements('22 cm de altura × 8,5 cm de diâmetro').map(x=>x.value),
  ['altura: 22 cm','diâmetro: 8,5 cm']);
});
