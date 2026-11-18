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

test('imagem 03 envia valores WeDrop no briefing e termina com renderização verificada',()=>{
 const src='Dimensões: 40cm altura x 30cm largura x 55cm comprimento';
 const brief=createChatGptPrompts({title:'Organizador de Roupas',supplierSourceText:src});
 assert.deepEqual(brief.confirmedDimensions.measurements.map(x=>x.value),['40 cm','30 cm','55 cm']);
 assert.match(brief.prompts[2],/RESULTADO FINAL NA GALERIA DA SHOPEE TERÁ AS TRÊS COTAS/);
 assert.match(brief.prompts[2],/ALTURA: 40 cm; LARGURA: 30 cm; COMPRIMENTO: 55 cm/);
 assert.match(brief.prompts[2],/ARTE FINAL CRIADA NO CHATGPT/);
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
  assert.deepEqual(names.filter(x=>/^(?:40 cm|30 cm|55 cm|Altura|Largura|Comprimento)/.test(x)),
   ['40 cm','Altura','30 cm','Largura','55 cm','Comprimento']);
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

test('Ponte, API e importação manual aplicam exatamente a fonte WeDrop',()=>{
 const app=readFileSync(new URL('../public/app.js',import.meta.url),'utf8');
 const start=app.indexOf("if(m.kind!=='RA_EXTENSION_IMAGE')return;");
 const bridge=app.slice(start,app.indexOf('const existing=await json(',start));
 assert.doesNotMatch(bridge,/addConfirmedSpecificationCard\(prepared.blob,spec\)/);
 assert.match(bridge,/chatgpt-auto-03-arte-final-com-cotas.png/);
 assert.match(bridge,/optimizerVerifiedDimensionSpec\(w\)/);
 const api=app.slice(app.indexOf('async function optimizerImagesGenerateSlot('),
  app.indexOf("$('#optimizerOpenAiSave')",app.indexOf('async function optimizerImagesGenerateSlot(')));
 assert.match(api,/optimizerAnnotateThirdGeneratedImage\(w,result\)/);
 const manual=app.slice(app.indexOf('async function optimizerImageCorrectionImportFile(file)'),
  app.indexOf("$('#optimizerImageCorrectionChoose')?.addEventListener",app.indexOf('async function optimizerImageCorrectionImportFile(file)')));
 assert.doesNotMatch(manual,/addConfirmedSpecificationCard\(imageBlob,spec\)/);
 assert.match(manual,/await optimizerVerifiedDimensionSpec\(w\)/);
 assert.match(manual,/X-Expected-Sha256/);
 assert.doesNotMatch(manual,/method:'DELETE'|RA_SITE_ABORT|restart:true/);
 assert.match(app,/sourceEvidenceSku:source\.sku/);
 assert.match(app,/sourceSaved:true/);
 assert.match(app,/X-Expected-Sha256/);
 assert.match(app,/Aplicar medidas WeDrop/);
 const server=readFileSync(new URL('../server.js',import.meta.url),'utf8');
 assert.match(server,/x-expect-empty-slot/);
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


test('WS20357 mantém apenas dimensões do colchão, sem eixo de altura inventado',()=>{
 const evidence=[
  'Colchão Inflável Piscina 183x69cm Verão','ESPECIFICAÇÕES:',
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
  assert.doesNotMatch(prompt,/ALTURA: 183 cm|ALTURA: 69 cm/);
 }
 assert.match(chat,/ARTE FINAL CRIADA NO CHATGPT/);
 assert.match(api,/FOTO-BASE TOTALMENTE LIMPA/);
});

test('TW888-4: imagem 03 recebe 20 cm de altura, 22 cm de largura e 29 cm de comprimento',async()=>{
 const source=['Especificações:','Dimensões: 20cm altura x 22cm Largura x 29cm comprimento',
  'Composição: Plástico com componentes eletrônicos','Tipo: Cachorro Robô Inteligente'].join('\n');
 const spec=confirmedSpecCard({sku:'TW888-4',sourceEvidenceSku:'TW888-4',
  sourceSaved:true,sourceText:source});
 assert.deepEqual(spec.measurements.map(x=>[x.axis,x.value]),[
  ['altura','20 cm'],['largura','22 cm'],['comprimento','29 cm']
 ]);
 const prompt=createChatGptPrompts({title:'Cachorro Robô Inteligente',
  supplierSourceText:source,confirmedDimensionSpec:spec}).prompts[2];
 assert.match(prompt,/ALTURA: 20 cm; LARGURA: 22 cm; COMPRIMENTO: 29 cm/);
 assert.match(prompt,/NÃO ENTREGAR FOTO LIMPA SEM MEDIDAS/);
 const names=[],ctx={save(){},restore(){},beginPath(){},roundRect(){},
  fill(){},stroke(){},moveTo(){},lineTo(){},drawImage(){},
  measureText:t=>({width:t.length*16}),fillText:t=>names.push(t)};
 const prevDoc=globalThis.document,prevBitmap=globalThis.createImageBitmap;
 globalThis.document={createElement:()=>({getContext:()=>ctx,
  toBlob:cb=>cb(new Blob(['test image'],{type:'image/png'}))})};
 globalThis.createImageBitmap=async()=>({close(){}});
 try{
  await addConfirmedSpecificationCard(new Blob(['base'],{type:'image/png'}),spec);
  for(const token of ['20 cm','22 cm','29 cm','Altura','Largura','Comprimento'])
   assert(names.includes(token),'Ausente na imagem 03: '+token);
 }finally{
  if(prevDoc===undefined)delete globalThis.document;else globalThis.document=prevDoc;
  if(prevBitmap===undefined)delete globalThis.createImageBitmap;else globalThis.createImageBitmap=prevBitmap;
 }
});
