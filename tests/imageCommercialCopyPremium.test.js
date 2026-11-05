import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createChatGptPrompts} from '../public/chatgptPrompts.js';
import {imageScenePrompt} from '../public/imageSceneDiversity.js';
import {imagePrompt} from '../shopeeOpenAiImages.js';
import {confirmedSpecCard,addConfirmedSpecificationCard} from '../public/specificationCard.js';

test('sequência nova usa benefícios, macro, mockup e ficha técnica sem informações inventadas',()=>{
 const title='Recipiente de Vidro com Travas Azul';
 const prompts=createChatGptPrompts({title}).prompts;
 const api=n=>imagePrompt({record:{sku:'VID-1',title},slot:n});
 for(const n of [4,5,6,7]){
  assert.match(prompts[n-1],/1200×1200|1200 x 1200/);
  assert.match(api(n),/WeDrop|WE DROP/);
  assert.match(imageScenePrompt({slot:n,title}),/10% da área/);
 }
 assert.match(prompts[3],/3 benefícios|benefícios específicos/i);
 assert.match(api(5),/macro/i);
 assert.match(prompts[5],/Mockup ilustrativo/);
 assert.match(api(6),/EMBALAGEM|embalagem/i);
 assert.match(prompts[6],/até 6 dados técnicos|até seis dados/i);
 assert.match(api(7),/INFORMAÇÕES TÉCNICAS/i);
});

test('imagem de objeções exige perguntas e RESPOSTAS; não apenas microetiquetas',()=>{
 const title='Colchão Inflável Piscina 183 x 69';
 const evidence='Dimensões: 12cm altura x 69cm largura x 183cm comprimento\nCapacidade: 20 litros\nCor: Azul';
 const prompts=createChatGptPrompts({title,supplierSourceText:evidence,attributes:[
  {state:'filled',name:'Cor do produto',values:[{name:'Azul'}]}
 ]});
 const objections=prompts.prompts[7];
 assert.match(objections,/perguntas de compradores|3 perguntas/i);
 assert.match(objections,/respostas/i);
 assert.match(objections,/3 perguntas|3 pares/i);
 assert.match(objections,/FATOS DA SKU PARA REDAÇÃO/);
 assert.match(objections,/Cor: azul|Cor do produto: Azul/i);
 assert.match(objections,/10% da composição|10% da área/);
 const api=imagePrompt({record:{sku:'WS20357',title},slot:8});
 assert.match(api,/PERGUNTAS|perguntas/);
 assert.match(api,/RESPOSTAS|respostas/);
 assert.doesNotMatch(objections,/microetiquetas de 1 a 3 palavras/);
});

test('imagem 03 gera arte final com valores verificados no próprio prompt',()=>{
 const src='Dimensões: 40cm altura x 30cm largura x 55cm comprimento';
 const brief=createChatGptPrompts({title:'Organizador de Roupas',supplierSourceText:src});
 assert.deepEqual(brief.confirmedDimensions.measurements.map(x=>x.value),['40 cm','30 cm','55 cm']);
 assert.match(brief.prompts[2],/ARTE FINAL PRONTA/);
 assert.match(brief.prompts[2],/ALTURA: 40 cm; LARGURA: 30 cm; COMPRIMENTO: 55 cm/);
 assert.match(brief.prompts[2],/BORDA AMARELA/);
 const api=imagePrompt({record:{sku:'AAA',title:'Organizador de Roupas'},slot:3,supplierSourceText:src});
 assert.match(api,/ARTE COMERCIAL FINAL PREMIUM/);
 assert.match(api,/ALTURA: 40 cm; LARGURA: 30 cm; COMPRIMENTO: 55 cm/);
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
  assert.deepEqual(names.filter(x=>/^(?:40 cm|30 cm|Altura|Largura|Comprimento)/.test(x)),
   ['40 cm','Altura','30 cm','Largura','Comprimento 55 cm']);
  const script=readFileSync(new URL('../public/specificationCard.js',import.meta.url),'utf8');
  assert.match(script,/"Inter","Segoe UI"/);
  assert.match(script,/#ffcb0b/);
  assert.match(script,/#103764/);
  assert.match(script,/sortedColorBanner/);
  assert.doesNotMatch(script,/rgba\(18,34,47,0\.58\)/);
 }finally{
  if(oldDoc===undefined)delete globalThis.document;else globalThis.document=oldDoc;
  if(oldBitmap===undefined)delete globalThis.createImageBitmap;else globalThis.createImageBitmap=oldBitmap;
 }
});

test('Ponte e API preservam a arte 03 pronta sem desenhar outra camada',()=>{
 const app=readFileSync(new URL('../public/app.js',import.meta.url),'utf8');
 assert.match(app,/if\(Number\(m\.slot\)===3\)\{/);
 const bridgeStart=app.indexOf('if(Number(m.slot)===3)');
 const bridge=app.slice(bridgeStart,app.indexOf('const {imageBlobSha256}',bridgeStart));
 assert.doesNotMatch(bridge,/addConfirmedSpecificationCard/);
 assert.match(bridge,/SEM sobrepor novas etiquetas/);
 const apiStart=app.indexOf('async function optimizerImagesGenerateSlot(');
 const apiPath=app.slice(apiStart,app.indexOf("$('#optimizerOpenAiSave')",apiStart));
 assert.doesNotMatch(apiPath,/optimizerAnnotateThirdGeneratedImage\(w,result\)/);
 assert.match(apiPath,/nenhuma etiqueta adicional foi desenhada/);
 assert.match(app,/sourceEvidenceSku:source\.sku/);
 assert.match(app,/sourceSaved:true/);
 assert.match(app,/optimizerRepairThirdImageDimensions\(w,image\)/);
 assert.match(app,/X-Expected-Sha256/);
 assert.match(app,/if\(!optimizerImagesSameSku\(w\)\)throw Error/);
});

test('imagem 03 vazia oferece importação da arte pronta ou foto-base limpa com cotas opcionais',()=>{
 const app=readFileSync(new URL('../public/app.js',import.meta.url),'utf8');
 const manual=app.slice(app.indexOf('async function optimizerImageCorrectionImportFile(file)'),
  app.indexOf("$('#optimizerImageCorrectionChoose')?.addEventListener",app.indexOf('async function optimizerImageCorrectionImportFile(file)')));
 assert.match(manual,/if\(slot===3\)/);
 assert.match(manual,/await optimizerVerifiedDimensionSpec\(w\)/);
 assert.match(manual,/if\(optimizerManualThirdBaseMode&&dimensionCount\)/);
 assert.match(manual,/addConfirmedSpecificationCard\(imageBlob,spec\)/);
 assert.match(manual,/arte FINAL/);
 assert.match(manual,/X-Expect-Empty-Slot/);
 assert.match(manual,/X-Expected-Sha256/);
 assert.doesNotMatch(manual,/method:'DELETE'|RA_SITE_ABORT|restart:true/);
 const ui=app.slice(app.indexOf('const generate=optimizerMake(',app.indexOf('async function optimizerImagesLoad()')),
  app.indexOf('const adjust=optimizerMake(',app.indexOf('async function optimizerImagesLoad()')));
 assert.match(ui,/if\(slot===3&&!image\)/);
 assert.match(ui,/Importar foto-base sem cotas/);
 assert.match(ui,/optimizerImageCorrectionFile/);
 assert.match(ui,/if\(slot===3&&image\)/);
 assert.match(ui,/Aplicar medidas WeDrop/);
 const server=readFileSync(new URL('../server.js',import.meta.url),'utf8');
 assert.match(server,/x-expect-empty-slot/);
 assert.match(server,/A posição foi preenchida por outra aba/);
});


test('WS20357 exibe 183 cm vertical, 69 cm horizontal e selo de cores sortidas na arte final',async()=>{
 const source=[
  'Colchão Inflável Piscina 183x69cm Verão',
  'ESPECIFICAÇÕES:',
  '- Material: 100% PVC',
  '- Dimensões: 183cm comprimento x 69cm largura',
  '- Cor: Azul, Amarelo e Rosa',
  '**PRODUTO ENVIADO COM COR SORTIDA**'
 ].join('\n');
 const spec=confirmedSpecCard({sku:'WS20357',sourceEvidenceSku:'WS20357',
  sourceSaved:true,sourceText:source});
 assert.equal(spec?.sortedColors,true,'Banner só aparece se a WeDrop confirmar cor sortida e as três cores');
 assert.deepEqual(spec.measurements.map(x=>x.value),['69 cm','183 cm']);
 spec.productTitle='Colchão Inflável Piscina Verão';
 const words=[],arrows=[];
 const context={save(){},restore(){},beginPath(){},roundRect(){},fill(){},stroke(){},
  moveTo:(x,y)=>arrows.push([x,y]),lineTo(){},drawImage(){},
  measureText:t=>({width:t.length*15}),
  fillText:t=>words.push(t)};
 const prevDoc=globalThis.document,prevBitmap=globalThis.createImageBitmap;
 globalThis.document={createElement:()=>({getContext:()=>context,
  toBlob:cb=>cb(new Blob(['png'],{type:'image/png'}))})};
 globalThis.createImageBitmap=async()=>({close(){}});
 try{
  await addConfirmedSpecificationCard(new Blob(['base'],{type:'image/png'}),spec);
  assert.deepEqual(words.filter(x=>['183 cm','69 cm','Comprimento','Largura','Envio em','cores sortidas'].includes(x)),
   ['183 cm','Comprimento','69 cm','Largura','Envio em','cores sortidas']);
  assert(arrows.some(([x,y])=>x===1091&&y===85),'Cota vertical à direita do produto azul');
  assert(arrows.some(([x,y])=>x===786&&y===969),'Cota horizontal na base do azul');
 }finally{
  if(prevDoc===undefined)delete globalThis.document;else globalThis.document=prevDoc;
  if(prevBitmap===undefined)delete globalThis.createImageBitmap;else globalThis.createImageBitmap=prevBitmap;
 }
 const notSorted=confirmedSpecCard({sku:'WS20357',sourceEvidenceSku:'WS20357',
  sourceSaved:true,sourceText:source.replace('COR SORTIDA','COR DEFINIDA')});
 assert.equal(notSorted.sortedColors,false);
 assert.equal(confirmedSpecCard({sku:'WS20357',sourceEvidenceSku:'SKU-ERRADA',sourceSaved:true,sourceText:source}),null);
});


test('WS20357 gera comando final com 183cm x 69cm, três cores e selo sem overlay automático',()=>{
 const evidence=[
  'Colchão Inflável Piscina 183x69cm Verão',
  'ESPECIFICAÇÕES:',
  '- Material: 100% PVC',
  '- Dimensões: 183cm comprimento x 69cm largura',
  '- Cor: Azul, Amarelo e Rosa',
  '**PRODUTO ENVIADO COM COR SORTIDA**'
 ].join('\n');
 const title='Colchão Inflável Piscina 183x69cm Verão';
 const chat=createChatGptPrompts({title,supplierSourceText:evidence}).prompts[2];
 const api=imagePrompt({record:{title,sku:'WS20357'},slot:3,supplierSourceText:evidence});
 for(const prompt of [chat,api]){
  assert.match(prompt,/183 cm/);
  assert.match(prompt,/69 cm/);
  assert.match(prompt,/ROSA, AMARELO e AZUL/);
  assert.match(prompt,/Envio em cores sortidas/);
  assert.match(prompt,/BORDA AMARELA/);
  assert.match(prompt,/AZUL-MARINHO/);
  assert.match(prompt,/não.*(?:um kit|três unidades)/i);
  assert.doesNotMatch(prompt,/ALTURA: 183 cm|ALTURA: 69 cm/);
 }
 const app=readFileSync(new URL('../public/app.js',import.meta.url),'utf8');
 const bridge=app.slice(app.indexOf('if(Number(m.slot)===3)'),app.indexOf('const {imageBlobSha256}',app.indexOf('if(Number(m.slot)===3)')));
 assert.doesNotMatch(bridge,/addConfirmedSpecificationCard/);
 assert.match(bridge,/Importando SEM sobrepor novas etiquetas/);
 const manual=app.slice(app.indexOf('async function optimizerImageCorrectionImportFile(file)'),
  app.indexOf("$('#optimizerImageCorrectionChoose')?.addEventListener",app.indexOf('async function optimizerImageCorrectionImportFile(file)')));
 assert.match(manual,/if\(optimizerManualThirdBaseMode&&dimensionCount\)/);
 assert.match(manual,/imagem-03-arte-pronta-com-medidas/);
});
