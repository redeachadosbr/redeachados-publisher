import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createChatGptPrompts} from '../public/chatgptPrompts.js';
import {imageScenePrompt} from '../public/imageSceneDiversity.js';
import {imagePrompt} from '../shopeeOpenAiImages.js';
import {confirmedSpecCard,addConfirmedSpecificationCard} from '../public/specificationCard.js';

test('imagens 04–07 exigem frases elaboradas coerentes com a cena e fonte discreta',()=>{
 const title='Colchão Inflável Piscina Verão';
 for(const slot of [4,5,6,7]){
  const chat=createChatGptPrompts({title}).prompts[slot-1];
  const api=imagePrompt({record:{sku:'WS20357',title},slot});
  const expected=slot===4||slot===6?/3 a 7 palavras/:/4 a 8 palavras/;
  assert.match(chat,expected);
  assert.match(api,expected);
  assert.match(imageScenePrompt({slot,title}),/10% da área/);
  assert.match(chat,/fotografia|foto|cena/i);
 }
});

test('imagem 04 apresenta 2 ou 3 benefícios, imagem 05 vista de cima e 06 zoom macro',()=>{
 const title='Colchão Inflável Piscina Verão';
 const scenes=createChatGptPrompts({title}).prompts;
 assert.match(scenes[3],/2 ou 3 benefícios/);
 assert.match(scenes[3],/10% da foto/);
 assert.match(scenes[4],/top-down|VISTO DE CIMA/);
 assert.match(scenes[4],/UMA frase/);
 assert.match(scenes[5],/ZOOM MACRO/);
 assert.match(scenes[5],/1 ou 2 microdescrições/);
 const api4=imagePrompt({record:{sku:'WS20357',title},slot:4});
 const api5=imagePrompt({record:{sku:'WS20357',title},slot:5});
 const api6=imagePrompt({record:{sku:'WS20357',title},slot:6});
 assert.match(api4,/2 ou 3 benefícios/);
 assert.match(api5,/VISTA SUPERIOR REAL|CIMA/);
 assert.match(api6,/ZOOM MACRO/);
});

test('imagem de objeções exige perguntas e RESPOSTAS; não apenas microetiquetas',()=>{
 const title='Colchão Inflável Piscina 183 x 69';
 const evidence='Dimensões: 12cm altura x 69cm largura x 183cm comprimento\nCapacidade: 20 litros\nCor: Azul';
 const prompts=createChatGptPrompts({title,supplierSourceText:evidence,attributes:[
  {state:'filled',name:'Cor do produto',values:[{name:'Azul'}]}
 ]});
 const objections=prompts.prompts[7];
 assert.match(objections,/perguntas de clientes/i);
 assert.match(objections,/respostas curtas/i);
 assert.match(objections,/Pergunta\? \/ Resposta/i);
 assert.match(objections,/FATOS DA SKU PARA REDAÇÃO/);
 assert.match(objections,/Cor: azul|Cor do produto: Azul/i);
 assert.match(objections,/10% da foto/);
 const api=imagePrompt({record:{sku:'WS20357',title},slot:8});
 assert.match(api,/PERGUNTAS|perguntas/);
 assert.match(api,/RESPOSTAS|respostas/);
 assert.doesNotMatch(objections,/microetiquetas de 1 a 3 palavras/);
});

test('imagem 03 manda produzir foto-base sem inventar números; camada é feita depois',()=>{
 const src='Dimensões: 40cm altura x 30cm largura x 55cm comprimento';
 const brief=createChatGptPrompts({title:'Organizador de Roupas',supplierSourceText:src});
 assert.deepEqual(brief.confirmedDimensions.measurements.map(x=>x.value),['40 cm','30 cm','55 cm']);
 assert.match(brief.prompts[2],/FOTOGRAFIA BASE SEM QUALQUER TEXTO/);
 assert.match(brief.prompts[2],/fonte bonita, moderna e discreta/);
 assert.doesNotMatch(brief.prompts[2],/ALTURA: 40 cm|LARGURA: 30 cm|COMPRIMENTO: 55 cm/);
 const api=imagePrompt({record:{sku:'AAA',title:'Organizador de Roupas'},slot:3});
 assert.match(api,/REGRA FINAL MAIS IMPORTANTE/);
 assert.match(api,/imagem SOMENTE FOTOGRÁFICA/);
});

test('cotas da imagem 03 são desenhadas só quando a SKU e a origem são exatas',async()=>{
 const src='Dimensões: 40cm altura x 30cm largura x 55cm comprimento';
 const valid=confirmedSpecCard({sku:'ABC',sourceEvidenceSku:'ABC',supplierMatchedBy:'exact-sku',sourceText:src});
 assert.deepEqual(valid.measurements.map(x=>x.value),['40 cm','30 cm','55 cm']);
 assert.equal(confirmedSpecCard({sku:'ABC',sourceEvidenceSku:'XYZ',supplierMatchedBy:'exact-sku',sourceText:src}),null);
 const names=[];
 const ctx={save(){},restore(){},measureText:(t)=>({width:t.length*16}),
  fillText:(t)=>names.push(t),beginPath(){},roundRect(){},fill(){},stroke(){},
  moveTo(){},lineTo(){},drawImage(){}};
 const oldDoc=globalThis.document,oldBitmap=globalThis.createImageBitmap;
 globalThis.document={createElement:()=>({width:0,height:0,
  getContext:()=>ctx,toBlob:(callback)=>callback(new Blob(['fake png'],{type:'image/png'}))})};
 globalThis.createImageBitmap=async()=>({close(){}});
 try{
  const output=await addConfirmedSpecificationCard(new Blob(['base'],{type:'image/png'}),valid);
  assert.equal(output.type,'image/png');
  assert.deepEqual(names.filter(x=>/^(ALTURA|LARGURA|COMPRIMENTO)/.test(x)),
   ['ALTURA 40 cm','LARGURA 30 cm','COMPRIMENTO 55 cm']);
  const script=readFileSync(new URL('../public/specificationCard.js',import.meta.url),'utf8');
  assert.match(script,/"Inter","Segoe UI"/);
  assert.match(script,/rgba\(249,251,253,0\.76\)/);
  assert.doesNotMatch(script,/rgba\(18,34,47,0\.58\)/);
 }finally{
  if(oldDoc===undefined)delete globalThis.document;else globalThis.document=oldDoc;
  if(oldBitmap===undefined)delete globalThis.createImageBitmap;else globalThis.createImageBitmap=oldBitmap;
 }
});

test('Ponte e API aplicam a mesma camada verificada antes de afirmar a revisão da foto 03',()=>{
 const app=readFileSync(new URL('../public/app.js',import.meta.url),'utf8');
 assert.match(app,/if\(Number\(m\.slot\)===3\)\{/);
 assert.match(app,/addConfirmedSpecificationCard\(prepared\.blob,spec\)/);
 assert.match(app,/if\(Number\(slot\)===3\)\{/);
 assert.match(app,/result\.dimensionOverlay=await optimizerAnnotateThirdGeneratedImage\(w,result\)/);
 assert.match(app,/sourceEvidenceSku:w\.sourceEvidence\?\.sku/);
 assert.match(app,/if\(!optimizerImagesSameSku\(w\)\)throw Error/);
});
