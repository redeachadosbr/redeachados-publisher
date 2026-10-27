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
  assert.match(prompt,/TODOS os 2 produtos reais deste kit JUNTOS/);
  assert.match(prompt,/não dividir em mosaico/);
  assert.match(prompt,/27 × 21 × 16 cm/);
  assert.match(prompt,/altura: 19 cm/);
 }
});
test('nove imagens mostram todos componentes juntos mesmo quando faltam medidas',()=>{
 const kit={components:[{sku:'A',name:'Elefante'},{sku:'B',name:'Chocalho'}]};
 const prompts=kitPrompts(kit);
 assert.equal(prompts.length,9);
 for(const p of prompts)assert.match(p,/DUPLA com os DOIS produtos juntos/);
 assert(!prompts.join('\n').includes('20 × 30'));
 assert.throws(()=>kitPrompts(kit,{manualFacts:{C:'10 cm'}}),/não pertence/);
});
