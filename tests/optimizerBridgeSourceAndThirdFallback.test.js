import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {
 visualReferenceCandidates,
 bridgeShopeeReferenceCandidates
} from '../public/optimizer-visual-reference.js';

test('Ponte testa a origem canônica cf antes do CDN down-br para a MESMA foto Shopee',()=>{
 const id='sg-11134201-82581-mtd7pp9lecjk8c';
 const down='https://down-br.img.susercontent.com/file/'+id;
 const candidates=bridgeShopeeReferenceCandidates([down]);
 assert.deepEqual(candidates,[
  'https://cf.shopee.com.br/file/'+id,
  down
 ]);
});
test('fotografia WeDrop e host falso não entram na ponte Shopee',()=>{
 const candidates=bridgeShopeeReferenceCandidates([
  'https://wedrop-products-images.nyc3.cdn.digitaloceanspaces.com/product.png',
  'https://cf.shopee.com.br.atacante.example/file/sg-11134201-82581-mtd7pp9lecjk8c'
 ]);
 assert.deepEqual(candidates,[]);
});
test('variantes visuais continuam distintas e sem repetição',()=>{
 const id='sg-11134201-82581-mtd7pp9lecjk8c';
 const refs=visualReferenceCandidates(['https://cf.shopee.com.br/file/'+id]);
 assert.equal(new Set(refs).size,refs.length);
 assert(refs.some(x=>x==='https://down-br.img.susercontent.com/file/'+id));
});
test('fallback de imagem 03 sem ChatGPT está desativado',()=>{
 const app=readFileSync(new URL('../public/app.js',import.meta.url),'utf8');
 const start=app.indexOf('async function optimizerThirdFromPreparedPhoto(');
 const end=app.indexOf('// Aplica apenas as cotas verificadas à foto 03 JÁ SALVA.',start);
 assert(start>0&&end>start);
 const body=app.slice(start,end);
 assert.match(body,/deve ser gerada com medidas diretamente no ChatGPT/);
 assert.doesNotMatch(app.slice(app.indexOf('let importThirdButton=null'),app.indexOf('const adjust=optimizerMake')),/Criar com foto|Importar foto-base|Aplicar medidas/);
});

test('motor raiz: botão Gerar 03 usa a Ponte ChatGPT e não copia a imagem 02',()=>{
 const app=readFileSync(new URL('../public/app.js',import.meta.url),'utf8');
 const a=app.indexOf('generate.onclick=async()=>{',app.indexOf('async function optimizerImagesLoad()'));
 const b=app.indexOf('actions.append(generate);',a);
 const click=app.slice(a,b);
 assert.match(click,/await optimizerCommercialRequestChatgptSlot\(w,slot\)/);
 assert.doesNotMatch(click,/await optimizerThirdFromPreparedPhoto/);
 assert.match(click,/if\(optimizerImagesMode!=='api'\)/);
 const cont=app.slice(app.indexOf('async function optimizerChatgptContinueFromServer()'),
  app.indexOf('globalThis.__RA_SHOPEE_RESUME_BRIDGE'));
 assert.match(cont,/optimizerBridgeThirdReferenceDataUrl\(w,data.images\|\|\[\]\)/);
 assert.doesNotMatch(cont,/localRendered:true/);
 assert.doesNotMatch(cont,/await optimizerThirdFromPreparedPhoto/);
});
test('motor raiz: importa imagem 03 gerada no ChatGPT sem overlay de cotas',()=>{
 const app=readFileSync(new URL('../public/app.js',import.meta.url),'utf8');
 const start=app.indexOf("if(m.kind!=='RA_EXTENSION_IMAGE')return;");
 const end=app.indexOf('const existing=await json(',start);
 const received=app.slice(start,end);
 assert.match(received,/await optimizerVerifiedDimensionSpec\(w\)/);
 assert.doesNotMatch(received,/addConfirmedSpecificationCard\(prepared.blob,spec\)/);
 assert.match(received,/sceneSha256/);
 assert.match(received,/chatgpt-auto-03-arte-final.png/);
 assert.match(received,/Medidas solicitadas/);
 const click=app.slice(app.indexOf('async function optimizerCommercialRequestChatgptSlot('),
  app.indexOf('async function optimizerChatgptCopyAll('));
 assert.match(click,/referenceDataUrl=await optimizerBridgeThirdReferenceDataUrl/);
 assert.match(click,/imageUrl:refs\[i\],prompts,referenceDataUrl/);
});
test('modo alternativo com overlay é proibido e não apaga imagens',()=>{
 const app=readFileSync(new URL('../public/app.js',import.meta.url),'utf8');
 const begin=app.indexOf('async function optimizerThirdFromPreparedPhoto(');
 const end=app.indexOf('// Aplica apenas as cotas verificadas à foto 03 JÁ SALVA.',begin);
 const body=app.slice(begin,end);
 assert.match(body,/deve ser gerada com medidas diretamente no ChatGPT/);
 assert.doesNotMatch(body,/method:'DELETE'|RA_SITE_ABORT|images\/reorder/);
});
test('renderer insere 10 cm, 10 cm e comprimento 14 cm confirmados da SKU 1736',async()=>{
 const {confirmedSpecCard,addConfirmedSpecificationCard}=await import('../public/specificationCard.js');
 const spec=confirmedSpecCard({sku:'1736',sourceEvidenceSku:'1736',
  sourceSaved:true,supplierMatchedBy:'exact-sku',
  catalogMeasurements:{heightCm:'10',widthCm:'10',lengthCm:'14'},
  sourceText:'Dimensões: 10 x 10 x 14'});
 assert.deepEqual(spec?.measurements?.map(x=>x.value),['10 cm','10 cm','14 cm']);
 const words=[];
 const ctx={
  save(){},restore(){},beginPath(){},roundRect(){},fill(){},stroke(){},
  moveTo(){},lineTo(){},drawImage(){},measureText:x=>({width:x.length*14}),
  fillText:x=>words.push(x)
 };
 const origDoc=globalThis.document,origBitmap=globalThis.createImageBitmap;
 globalThis.document={createElement:()=>({getContext:()=>ctx,
  toBlob:cb=>cb(new Blob(['png'],{type:'image/png'}))})};
 globalThis.createImageBitmap=async()=>({close(){}});
 try{
  const out=await addConfirmedSpecificationCard(new Blob(['base'],{type:'image/png'}),spec);
  assert.equal(out.type,'image/png');
  assert(words.filter(x=>x==='10 cm').length>=2);
  assert(words.includes('Altura'));
  assert(words.includes('Largura'));
  assert(words.includes('Comprimento 14 cm'));
 }finally{
  if(origDoc===undefined)delete globalThis.document;else globalThis.document=origDoc;
  if(origBitmap===undefined)delete globalThis.createImageBitmap;else globalThis.createImageBitmap=origBitmap;
 }
});
