import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {prepareSquareImage} from '../public/imageSquare.js';

async function fixture(width,height,assertGeometry,{outputSize=128,maxBytes=10*1024*1024}={}){
 const saved={bitmap:globalThis.createImageBitmap,document:globalThis.document};
 const drawings=[],encodings=[];
 let closes=0,canvas;
 try{
  globalThis.createImageBitmap=async()=>({width,height,close(){closes++;}});
  globalThis.document={createElement(tag){
   assert.equal(tag,'canvas');
   const ctx={
    fillStyle:'',imageSmoothingEnabled:false,imageSmoothingQuality:'',
    fillRect(...args){drawings.push({operation:'fill',args});},
    drawImage(...args){drawings.push({operation:'image',args:args.slice(1)});}
   };
   canvas={width:0,height:0,getContext:()=>ctx,
    toBlob(callback,type){encodings.push(type);callback(new Blob([Buffer.alloc(outputSize)],{type}));}};
   return canvas;
  }};
  const result=await prepareSquareImage(new Blob([Buffer.from('fixture')]),{maxBytes});
  assert.equal(canvas.width,1200);assert.equal(canvas.height,1200);
  assert.equal(drawings[0].operation,'fill');
  assert.deepEqual(drawings[0].args,[0,0,1200,1200]);
  assertGeometry(drawings[1].args,result);
  assert.equal(closes,1);
  return {result,encodings};
 }finally{
  if(saved.bitmap===undefined)delete globalThis.createImageBitmap;else globalThis.createImageBitmap=saved.bitmap;
  if(saved.document===undefined)delete globalThis.document;else globalThis.document=saved.document;
 }
}

test('imagem horizontal recebe margens sem crop ou distorção',async()=>{
 const {result}=await fixture(1600,900,(coords,output)=>{
  assert.deepEqual(coords,[0,262.5,1200,675]);
  assert.equal(output.wasPadded,true);
 });
 assert.equal(result.blob.type,'image/png');
});
test('imagem vertical recebe margens laterais sem crop',async()=>{
 await fixture(600,1200,(coords,output)=>{
  assert.deepEqual(coords,[300,0,600,1200]);
  assert.equal(output.wasPadded,true);
 });
});
test('imagem quadrada continua ocupando todo o canvas',async()=>{
 await fixture(1024,1024,(coords,output)=>{
  assert.deepEqual(coords,[0,0,1200,1200]);
  assert.equal(output.wasPadded,false);
 });
});
test('conversão rejeita arquivo que continua acima do limite sem armazená-lo',async()=>{
 await assert.rejects(()=>fixture(1200,800,()=>{}, {outputSize:600,maxBytes:512}),/excede 10 MB/);
});
test('a ponte salva o MIME e a extensão correspondentes ao resultado da conversão',()=>{
 const app=readFileSync(new URL('../public/app.js',import.meta.url),'utf8');
 assert.match(app,/import\('\/imageSquare\.js\?v=1\.20\.10'\)/);
 assert.match(app,/body:prepared\.blob/);
 assert.match(app,/const outputType=prepared\.blob\.type==='image\/jpeg'/);
 assert.match(app,/Formato ajustado para 1:1 com margens, sem cortes/);
 assert.doesNotMatch(app,/Peça uma versão 1:1 ao ChatGPT para evitar cortes/);
});
