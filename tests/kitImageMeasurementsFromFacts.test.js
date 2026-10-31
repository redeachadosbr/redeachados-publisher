import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {kitImageMeasurementsBySku,detectSkuMeasurements} from '../public/kit-measurements.js';
import {buildKitPlusImageBrief} from '../public/kit-plus-image-brief.js';
import {kitPrompts} from '../shopeeKitBuilder.js';

const kit={kitSku:'KIT-107500-GH643-TRC0366',components:[
 {sku:'107500',name:'Coqueteleira Drinks Inox 500 ml',description:'Coqueteleira em inox'},
 {sku:'GH643',name:'Conjunto 2 Copos Vidro Parede Dupla 350 ml',dimensions:'12 cm de altura × 8,3 cm de diâmetro'},
 {sku:'TRC0366',name:'Forma de Gelo Smoothie Copo Com Tampa'}
]};
const facts={
 '107500':'22 cm de altura × 8,5 cm de diâmetro; peso: 210 g.',
 'GH643':'350 ml por copo; 12 cm de altura × 8,3 cm de diâmetro.',
 'TRC0366':'14,5 cm de altura × 9,5 cm de largura; capacidade: 150 ml.'
};

test('medidas cadastradas em Informações por SKU permanecem associadas ao produto correto',()=>{
 const rows=kitImageMeasurementsBySku(kit.components,facts);
 assert.equal(rows.length,3);
 assert.deepEqual(rows[0].dimensions,['altura: 22 cm','diâmetro: 8,5 cm']);
 assert.deepEqual(rows[1].dimensions,['altura: 12 cm','diâmetro: 8,3 cm']);
 assert.deepEqual(rows[2].dimensions,['altura: 14,5 cm','largura: 9,5 cm']);
 assert(rows.every(row=>row.source==='Informações por SKU (vendedor)'));
 assert(!rows[0].dimensions.join(' ').includes('14,5'));
 assert(!rows[2].dimensions.join(' ').includes('22 cm'));
 assert.equal(rows[2].other[0],'capacidade: 150 ml');
});

test('imagem 03 especifica dimensões reais cadastradas sem transferir entre SKUs',()=>{
 const imagePrompts=kitPrompts(kit,{manualFacts:facts});
 assert.equal(imagePrompts.length,9);
 const third=imagePrompts[2];
 for(const expected of ['altura: 22 cm','diâmetro: 8,5 cm','altura: 12 cm','diâmetro: 8,3 cm','altura: 14,5 cm','largura: 9,5 cm'])
  assert(third.includes(expected),expected);
 assert.match(third,/Informações por SKU do vendedor/);
 assert.match(third,/NÃO somar ou transferir dimensões/i);
 assert.match(third,/NOME COMERCIAL/);
 assert.match(third,/NÃO imprimir código SKU/);
});

test('prompt curto do ChatGPT mantém medidas mesmo depois de 300 caracteres de texto',()=>{
 const long={...facts,'107500':'Descrição comercial: '+('Produto premium e robusto. '.repeat(20))+
  'Medidas: 22 cm de altura × 8,5 cm de diâmetro.'};
 const prompt=buildKitPlusImageBrief(kit,{manualFacts:long});
 assert.match(prompt,/DIMENSÕES PARA A FOTO DESTE PRODUTO/);
 assert.match(prompt,/altura: 22 cm/);
 assert.match(prompt,/diâmetro: 8,5 cm/);
 assert.match(prompt,/largura: 9,5 cm/);
 assert.match(prompt,/IMAGEM 03/);
 assert.match(prompt,/sem escrever SKU/i);
});

test('ficha sem medida explícita não recebe números de outra SKU',()=>{
 const two={components:[
  {sku:'A',name:'Produto A'},
  {sku:'B',name:'Produto B'}
 ]};
 const rows=kitImageMeasurementsBySku(two.components,{A:'Medidas: 12 x 13 x 14 cm',B:'12 meses; kit 6 peças'});
 assert.deepEqual(rows[0].dimensions,['12 × 13 × 14 cm']);
 assert.deepEqual(rows[1].dimensions,[]);
 assert.equal(rows[1].hasDimensions,false);
 const prompt=buildKitPlusImageBrief(two,{manualFacts:{A:'Medidas: 12 x 13 x 14 cm',B:'12 meses; kit 6 peças'}});
 assert.match(prompt,/não informadas/);
 assert.match(prompt,/Nunca transferir/i);
});

test('dimensão única etiquetada é reconhecida sem confundir idade e quantidade',()=>{
 assert.deepEqual(detectSkuMeasurements('Medida: 19 cm; idade 12 meses, kit 6 peças').map(x=>x.value),['medida: 19 cm']);
});

test('editor recarrega fichas e lê alterações antes de imagens na Ponte e no Plus',()=>{
 const code=fs.readFileSync(new URL('../public/kit-builder.js',import.meta.url),'utf8');
 assert.match(code,/kitContentSku=''; \/\/ Reabrir o mesmo kit/);
 assert.match(code,/function openChatGPTImages\(\)\{[\s\S]{0,160}kitContentReadManual\(\)/);
 assert.match(code,/async function kitStartExtensionImages\(\)\{[\s\S]{0,100}kitContentReadManual\(\)/);
 assert.match(code,/kitImageMeasurementsBySku\(components,Object\.fromEntries\(kitContentManualFacts\.entries\(\)\)\)/);
});
