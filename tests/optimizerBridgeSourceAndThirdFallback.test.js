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
test('fallback da imagem 03 usa medidas WeDrop e só altera slot 03',()=>{
 const app=readFileSync(new URL('../public/app.js',import.meta.url),'utf8');
 const start=app.indexOf('async function optimizerThirdFromPreparedPhoto(');
 const end=app.indexOf('// Aplica apenas as cotas verificadas à foto 03 JÁ SALVA.',start);
 assert(start>0&&end>start);
 const body=app.slice(start,end);
 assert.match(body,/optimizerVerifiedDimensionSpec\(w\)/);
 assert.match(body,/stored\.has\(2\)\?2:stored\.has\(1\)\?1:0/);
 assert.match(body,/X-Expect-Empty-Slot/);
 assert.match(body,/key\.set\('slot','3'\)/);
 assert.match(body,/original\.sha256!==stored\.get\(fromSlot\)\?\.sha256/);
 assert.match(body,/addConfirmedSpecificationCard/);
 assert.doesNotMatch(body,/method:'DELETE'|RA_SITE_ABORT|images\/reorder/);
});

test('botão principal Gerar 03 cria arte final com cotas locais antes de consultar a Ponte',()=>{
 const app=readFileSync(new URL('../public/app.js',import.meta.url),'utf8');
 const clickStart=app.indexOf('generate.onclick=async()=>{',app.indexOf('async function optimizerImagesLoad()'));
 const clickEnd=app.indexOf('actions.append(generate);',clickStart);
 const click=app.slice(clickStart,clickEnd);
 assert(clickStart>0&&clickEnd>clickStart);
 assert.match(click,/if\(slot===3\)\{/);
 assert.match(click,/await optimizerThirdFromPreparedPhoto\(w,stored,\{replaceExisting:Boolean\(image\)\}\)/);
 assert.match(click,/await optimizerChatBridgeRelease\(/);
 assert(click.indexOf('if(slot===3)')<click.indexOf("if(optimizerImagesMode!=='api')"));
 const cont=app.slice(app.indexOf('async function optimizerChatgptContinueFromServer()'),
  app.indexOf('globalThis.__RA_SHOPEE_RESUME_BRIDGE'));
 assert.match(cont,/if\(firstMissing===3\)\{/);
 assert.match(cont,/await optimizerThirdFromPreparedPhoto\(w,savedThirdState\)/);
 assert(cont.indexOf('if(firstMissing===3)')<cont.indexOf('optimizerChatBridgeWaitReady()'));
 assert.doesNotMatch(cont.slice(0,cont.indexOf('optimizerChatBridgeWaitReady()')),
  /method:'DELETE'|restart:true/);
});
test('imagem 03 usa hash condicional e não substitui fotos de outras posições',()=>{
 const app=readFileSync(new URL('../public/app.js',import.meta.url),'utf8');
 const begin=app.indexOf('async function optimizerThirdFromPreparedPhoto(');
 const end=app.indexOf('// Aplica apenas as cotas verificadas à foto 03 JÁ SALVA.',begin);
 const body=app.slice(begin,end);
 assert.match(body,/optimizerVerifiedDimensionSpec\(w\)/);
 assert.match(body,/measurements\?\.length\|\|0\)<2/);
 assert.match(body,/key\.set\('slot','3'\)/);
 assert.match(body,/X-Expected-Sha256/);
 assert.match(body,/X-Expect-Empty-Slot/);
 assert.match(body,/addConfirmedSpecificationCard/);
 assert.doesNotMatch(body,/method:'DELETE'|RA_SITE_START|restart:true/);
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
