import test from 'node:test';
import assert from 'node:assert/strict';
import {CHATGPT_IMAGE_SCENES,createChatGptPrompts} from '../public/chatgptPrompts.js';

const approvedStages=[
 'CAPA PREMIUM','USO REAL','DIMENSÕES','BENEFÍCIOS',
 'DETALHES DO PRODUTO','MOCKUP DA EMBALAGEM','INFORMAÇÕES TÉCNICAS',
 'QUEBRA DE OBJEÇÕES','CONFIANÇA'
];
test('nove comandos usam o padrão comercial premium aprovado com etapas distintas',()=>{
 assert.equal(CHATGPT_IMAGE_SCENES.length,9);
 for(let i=0;i<9;i++){
  assert.match(CHATGPT_IMAGE_SCENES[i].guide,new RegExp(approvedStages[i],'i'));
  assert.match(CHATGPT_IMAGE_SCENES[i].guide,/WeDrop/);
 }
});
test('Motor Matriz aplica as regras novas e mantém dimensões reais da WeDrop',()=>{
 const supplierSourceText=['ALTURA','66cm','LARGURA','100cm','COMPRIMENTO','27cm',
  'Especificações:', 'Dimensões: 75cm altura x 63cm largura x 117cm comprimento'].join('\\n');
 const result=createChatGptPrompts({
  sku:'2392',title:'Bicicleta Infantil Moto Cross Rosa',
  imageUrls:['https://cf.shopee.com.br/file/reference'],
  imageNotes:{3:'INJETAR_NOTA'},imagePrompts:{1:'INJETAR_CUSTOM'},
  masterPrompt:'INJETAR_PROMPT_MESTRE',supplierSourceText
 });
 assert.equal(result.original,'https://cf.shopee.com.br/file/reference');
 assert.equal(result.prompts.length,9);
 for(let i=0;i<9;i++){
  assert.ok(result.prompts[i].startsWith('ETAPA ATUAL EXCLUSIVA — IMAGEM '+String(i+1).padStart(2,'0')+'/09'));
  assert.match(result.prompts[i],/DIVERSIDADE OBRIGATÓRIA — CENA ÚNICA/);
  assert.match(result.prompts[i],/ÂNGULO E ENQUADRAMENTO:/);
  assert.match(result.prompts[i],/A FOTO DE REFERÊNCIA serve apenas para preservar o PRODUTO EXATO/);
 }
 assert.equal(result.batch,result.prompts[0]);
 const environments=result.prompts.map(p=>p.match(/AMBIENTE EXCLUSIVO: ([^\\n]+)/)?.[1]);
 assert.equal(new Set(environments).size,9);
 assert.match(result.prompts[1],/criança A|Criança A/);
 const p03=result.prompts[2];
 assert.deepEqual(result.confirmedDimensions.measurements.map(x=>x.value),['75 cm','63 cm','117 cm']);
 assert.match(p03,/ARTE FINAL PRONTA/);
 assert.match(p03,/ALTURA: 75 cm; LARGURA: 63 cm; COMPRIMENTO: 117 cm/);
 for(const forbidden of ['66 cm','100 cm','27 cm'])assert(!p03.includes(forbidden));
 assert.match(p03,/SEM ALTERAR ALGARISMOS/);
 assert.match(result.prompts[0],/INJETAR_PROMPT_MESTRE/);
 assert.doesNotMatch(result.prompts[2],/INJETAR_NOTA/);
});

test('sem medidas confirmadas a foto 03 não pode inferir dimensões',()=>{
 const {prompts,confirmedDimensions}=createChatGptPrompts({
  sku:'2392',supplierSourceText:'ALTURA\n66cm\nLARGURA\n100cm\nCOMPRIMENTO\n27cm'
 });
 assert.equal(confirmedDimensions,null);
 assert.match(prompts[2],/SEM DIMENSÕES CONFIRMADAS/);
 assert(!prompts[2].includes('66 cm'));
});

test('Imagem 03 mantém profundidade, capacidade e peso distintos e apenas se confirmados na WeDrop',async()=>{
 const {confirmedProductDimensionsFromWeDrop,confirmedProductSideFactsFromWeDrop}=
  await import('../public/productDimensions.js');
 const source=[
  'Dimensões: 50cm altura x 20cm largura x 26cm profundidade',
  'Capacidade Litros: 20 Litros',
  'Capacidade Peso: 5kg',
  'Peso: 1,550kg'
 ].join('\n');
 const measurements=confirmedProductDimensionsFromWeDrop(source)?.measurements||[];
 assert.deepEqual(measurements.map(x=>[x.label,x.value]),[
  ['ALTURA','50 cm'],['LARGURA','20 cm'],['PROFUNDIDADE','26 cm']
 ]);
 const facts=confirmedProductSideFactsFromWeDrop(source);
 assert.deepEqual(facts.map(x=>[x.label,x.value]),[
  ['Capacidade','20 L'],['Suporta','5 kg'],['Peso','1,550 kg']
 ]);
 const p=createChatGptPrompts({supplierSourceText:source}).prompts[2];
 assert.match(p,/PROFUNDIDADE: 26 cm/);
 assert.doesNotMatch(p,/Capacidade: 20 L|Peso: 1,550 kg/);
 assert(!p.includes('COMPRIMENTO: 26 cm'));
});
