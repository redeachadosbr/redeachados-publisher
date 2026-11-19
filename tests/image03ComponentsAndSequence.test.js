import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {confirmedProductDimensionsFromWeDrop} from '../public/productDimensions.js';
import {confirmedSpecCard} from '../public/specificationCard.js';
import {createChatGptPrompts} from '../public/chatgptPrompts.js';
import {imagePrompt} from '../shopeeOpenAiImages.js';

// Formato da ficha informada pelo vendedor, com três sujeitos na mesma linha.
const sourceText='Dimensões: Patins: 33 cm comprimento x 10 cm largura x  26 cm altura / Capacete: 26 cm diâmetro x 13 cm altura /Cotoveleiras e joelheiras: 3 cm comprimento x 12 cm largura x  12,5 cm altura';
const identity={sku:'3012',itemId:'123',modelId:'0'};
const specFor=text=>confirmedSpecCard({sourceText:text,sku:'3012',sourceEvidenceSku:'3012',sourceSaved:true});
const source=readFileSync(new URL('../public/app.js',import.meta.url),'utf8');

test('ficha de patins separa as oito cotas pelos três componentes',()=>{
 const spec=specFor(sourceText);
 assert.deepEqual(spec.measurements.map(x=>[x.subject,x.axis,x.value]),[
  ['patins','altura','26 cm'],['patins','largura','10 cm'],['patins','comprimento','33 cm'],
  ['capacete','altura','13 cm'],['capacete','diametro','26 cm'],
  ['cotoveleiras e joelheiras','altura','12,5 cm'],
  ['cotoveleiras e joelheiras','largura','12 cm'],
  ['cotoveleiras e joelheiras','comprimento','3 cm']
 ]);
 for(const separator of [' / ','; ','\n','\\n']){
  const multi=sourceText.replace('Dimensões: ','Dimensões:\n').replace(/\s*\/\s*/g,separator);
  assert.deepEqual(specFor(multi)?.measurements,spec.measurements,separator);
 }
});

test('não mistura embalagem, eixos conflitantes, componentes sem rótulo ou outra SKU',()=>{
 const measure=confirmedProductDimensionsFromWeDrop;
 assert.equal(measure(sourceText.replace('13 cm altura','13 cm altura x 15 cm altura')),null);
 assert.equal(measure(sourceText.replace('26 cm diâmetro x 13 cm altura','26 x 13 cm')),null);
 assert.equal(measure('Embalagem:\n'+sourceText),null);
 assert.equal(confirmedSpecCard({sourceText,sku:'3012',sourceEvidenceSku:'OUTRA',sourceSaved:true}),null);
 assert.deepEqual(measure(sourceText+' / Embalagem: 99cm altura x 88cm largura')?.measurements,
  measure(sourceText).measurements);
 assert.equal(measure(sourceText+' / Capacete: 40cm altura x 26cm diâmetro'),null);
});

test('ChatGPT e API incluem cada cota junto ao nome da peça, sem usar prompt antigo',()=>{
 const spec=specFor(sourceText);
 const prompts=[createChatGptPrompts({supplierSourceText:sourceText,confirmedDimensionSpec:spec}).prompts[2],
  imagePrompt({record:{sku:'3012',title:'Patins Superman'},slot:3,supplierSourceText:sourceText})];
 for(const prompt of prompts){
  for(const m of spec.measurements)assert.ok(prompt.includes(m.label+': '+m.value));
  assert.match(prompt,/COTAS POR COMPONENTE/);
  assert.doesNotMatch(prompt,/PENDENTES — NÃO GERAR|SEM MEDIDAS CONFIRMADAS/);
 }
});

function functionSource(name,next){
 return source.slice(source.indexOf('async function '+name+'('),source.indexOf(next,source.indexOf('async function '+name+'(')));
}
// Executar o handler real com a borda navegador/extensão simulada.
// O parser, a criação do roteiro e a conferência do prompt são os de produção.
async function resume({text=sourceText,stored=[1,2,4,5],validationError=null,singleSlot=null}={}){
 const spec=specFor(text);
 const ref='https://cf.shopee.com.br/file/original';
 const brief={...createChatGptPrompts({supplierSourceText:text,confirmedDimensionSpec:spec}),
  bridgeOriginal:ref,referenceCandidates:[ref]};
 const sent=[],retired=[],requests=[],elements=new Map();
 const params={
  optimizerWorkflowPlan:{...identity},
  $:id=>{if(!elements.has(id))elements.set(id,{style:{},disabled:false});return elements.get(id);},
  optimizerImagesSameSku:()=>true,optimizerChatgptContinueBusy:false,
  optimizerImagesMode:'chatgpt',optimizerImagesRenderMode:()=>{},
  optimizerChatBridgeWaitReady:async()=>true,optimizerChatgptMakeBrief:async()=>brief,
  optimizerChatBridgeReady:true,optimizerChatBridgeIdentity:()=>false,
  optimizerCommercialActionMessage:()=>{},optimizerChatBridgeRetryingSource:false,
  optimizerVerifiedDimensionSpec:async()=>{if(validationError)throw Error(validationError);return spec;},
  json:async(url,options)=>{requests.push({url,options});return {images:stored.map(slot=>({slot}))};},
  optimizerChatBridgeJob:null,optimizerChatBridgeBusy:false,
  optimizerBridgeThirdReferenceDataUrl:async()=>'',optimizerBridgeChatPauseState:()=>null,
  optimizerChatBridgeVersion:'1.0.64',optimizerChatgptCleanChatAuthorized:false,
  optimizerBridgeRetireSameSkuForNewThird:async(w,b,completed)=>retired.push(completed),
  optimizerBridgeRecoverFromExtension:async()=>({reason:'NO_RECOVERABLE_JOB'}),
  optimizerChatBridgeActiveClear:()=>{},optimizerChatBridgeNonce:'',optimizerChatBridgeSku:'',
  sessionStorage:{setItem(){},removeItem(){}},
  RA_CHAT_BRIDGE_JOB_KEY:'job',RA_CHAT_BRIDGE_SESSION_KEY:'session',
  optimizerChatBridgeRemember:()=>{},optimizerChatBridgeStartConfirmed:false,
  optimizerWaitBridgeReply:async()=>({ok:true}),
  window:{postMessage:message=>sent.push(message)},location:{origin:'https://manager.example'},
  optimizerImagesLoad:async()=>{},setTimeout:()=>{},
 };
 let body=singleSlot?functionSource('optimizerCommercialRequestChatgptSlot','async function optimizerChatgptCopyAll(')
  :functionSource('optimizerChatgptContinueFromServer','// O coordenador da extensão espera');
 body=body.replace("'/optimizer-visual-reference.js?v=20261105-shopee-source-safe-v2'",
  JSON.stringify(new URL('../public/optimizer-visual-reference.js',import.meta.url).href));
 const validate=functionSource('optimizerRequireThirdChatgptDimensions','async function optimizerChatgptRender(');
 const call=singleSlot?'optimizerCommercialRequestChatgptSlot(optimizerWorkflowPlan,'+singleSlot+')'
  :'optimizerChatgptContinueFromServer()';
 const run=new Function(...Object.keys(params),validate+'\n'+body+'\nreturn '+call+';');
 const result=await run(...Object.values(params));
 return {result,sent,retired,requests,notice:elements.get('#optimizerChatgptActionStatus')?.textContent};
}

test('retomada com 01/02/04/05 salvas inicia 03, sem marcar a lacuna como concluída',async()=>{
 const actual=await resume();
 assert.equal(actual.result.ok,true);
 assert.equal(actual.result.slot,3);
 const start=actual.sent.find(x=>x.kind==='RA_SITE_START').payload;
 assert.deepEqual(start.completed,[1,2,4,5]);
 assert.equal(start.restart,false);
 assert.ok(start.prompts[2].includes('PATINS — COMPRIMENTO: 33 cm'));
 assert.deepEqual(actual.retired,[[1,2,4,5]]);
 assert.ok(actual.requests.every(x=>!x.options?.method),'nenhum arquivo alterado ou excluído');
});

test('sequência nova usa os nove slots e somente autoriza restart sem fotos salvas',async()=>{
 const actual=await resume({stored:[]});
 assert.equal(actual.result.slot,1);
 const start=actual.sent.find(x=>x.kind==='RA_SITE_START').payload;
 assert.deepEqual(start.completed,[]);
 assert.equal(start.restart,true);
 assert.equal(start.prompts.length,9);
});

test('Gerar 03 envia só essa imagem sem comando de reinício total recusado pela Ponte',async()=>{
 const actual=await resume({singleSlot:3});
 const start=actual.sent.find(x=>x.kind==='RA_SITE_START')?.payload;
 assert.ok(start,'Ponte deve receber o comando de geração');
 assert.equal(start.restart,false);
 assert.deepEqual(start.completed,[1,2,4,5,6,7,8,9]);
 assert.match(start.prompts[2],/CAPACETE — ALTURA: 13 cm/);
 assert.ok(actual.requests.every(x=>!x.options?.method));
});

test('medidas ausentes, ambíguas ou falha de rede interrompem sem iniciar 04',async()=>{
 for(const input of [{text:''},{text:'Dimensões: 33 x 10 x 26 cm'},
  {validationError:'Falha ao consultar WeDrop (HTTP 503)'}]){
  const actual=await resume(input);
  assert.equal(actual.result.ok,false);
  assert.equal(actual.sent.length,0);
  assert.equal(actual.retired.length,0);
  assert.match(actual.notice,/Não foi possível continuar a sequência/);
  assert.ok(actual.requests.every(x=>!x.options?.method));
 }
});

test('API interrompe na 03 sem gerar as posteriores quando faltam medidas',async()=>{
 const start=source.indexOf("$('#optimizerImagesGenerateAll')?.addEventListener?.('click',async()=>{");
 const end=source.indexOf("$('#optimizerImagesUpload')?.addEventListener",start);
 const handler=source.slice(start,end);
 const generated=[],elements=new Map();let listener;
 const params={
  $:id=>{if(!elements.has(id))elements.set(id,{addEventListener:(event,fn)=>{listener=fn;}});return elements.get(id);},
  optimizerWorkflowPlan:identity,optimizerImagesSameSku:()=>true,optimizerImagesAutoBusy:false,
  optimizerImagesApiConfigured:true,optimizerImagesStopRequested:false,
  optimizerImagesSetProgress:()=>{},optimizerExecReset:()=>{},optimizerImagesSavedSlots:new Set([1,2]),
  optimizerVerifiedDimensionSpec:async()=>null,optimizerImagesLoad:async()=>{},
  optimizerImagesGenerateSlot:async(w,slot)=>generated.push(slot),
 };
 new Function(...Object.keys(params),handler)(...Object.values(params));
 await listener();
 assert.deepEqual(generated,[]);
 assert.match(elements.get('#optimizerImagesStatus').textContent,/Imagem 03 pendente/);
});
