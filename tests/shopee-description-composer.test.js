import test from 'node:test';
import assert from 'node:assert/strict';
import {composeShopeeDescription,isCommercialDescription} from '../shopeeDescriptionComposer.js';
import {validateContentRules,codePointCount} from '../shopeeOptimizationWorkflow.js';

const tests=[
 {name:'Mochila construtor TUD0667',title:'Super Mochila Construtor 3 em 1 com Ferramentas e Acessórios',
  desc:'A mochila se transforma em uma oficina de brincadeiras. Indicada para crianças a partir de 3 anos. Produto fabricado em PP e certificado pelo Inmetro. Itens inclusos: 01 Super Mochila Construtor 3 em 1; 01 Conjunto de ferramentas, brinquedos, miniaturas e acessórios. Dimensões da mochila: 30cm de altura x 25cm de largura x 15cm de comprimento.'},
 {name:'Passadeira',title:'Passadeira a Vapor Portátil 800W 127V 200ml',desc:'Potência: 800W, voltagem 127V, reservatório 200ml.'},
 {name:'Banheiro',title:'Porta Shampoo de Canto 2 Andares',desc:'Suporte de canto para box.'},
 {name:'Piscina',title:'Piscina Inflável Infantil Quadrada 210 Litros Azul',desc:'Capacidade: 210 litros.'},
 {name:'Garrafa',title:'Garrafa Térmica 900ml para Bebidas',desc:'Garrafa térmica capacidade 900ml.'},
 {name:'Produto genérico',title:'Cesto Organizador para Casa',desc:'Cesto organizador.'}
];

for(const product of tests){
 test('Descrição pronta ao ler SKU: '+product.name,()=>{
  const record={title:product.title,description:product.desc};
  const result=composeShopeeDescription({record});
  assert.equal(result.valid,true,product.name+' não atingiu as regras');
  assert.ok(codePointCount(result.description)>=1400);
  assert.ok(codePointCount(result.description)<=1440);
  assert.ok((result.description.match(/\p{Extended_Pictographic}/gu)||[]).length>=10);
  validateContentRules({description:result.description});
  assert.ok(isCommercialDescription(result.description));
  assert.notEqual(result.description,product.desc);
  assert.ok(result.description.indexOf('Descrição do produto')<result.description.indexOf('Especificações do produto'));
 });
}
test('Não inventar certificação ou número INMETRO na mochila',()=>{
 const result=composeShopeeDescription({record:{
  title:tests[0].title,description:tests[0].desc
 }});
 assert.doesNotMatch(result.description,/certificad[oa]\s+pelo\s+inmetro|003131\/2025/i);
 assert.match(result.description,/PP/);
 assert.match(result.description,/30 x 25 x 15 cm/);
});
