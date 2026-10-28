import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {kitImagesLookDuplicated} from '../public/kit-image-guard.js';
const sample=(fn)=>Uint8ClampedArray.from({length:20*20*4},(_,i)=>i%4===3?255:fn(Math.floor(i/4),i%4));
test('imagem igual e compressão leve são detectadas em kits',()=>{
 const a=sample((p)=>((p%20)*11+Math.floor(p/20)*3)%255);
 const b=Uint8ClampedArray.from(a);
 const compressed=Uint8ClampedArray.from(a,(v,i)=>i%4===3?v:Math.min(255,v+3));
 assert.equal(kitImagesLookDuplicated(a,b),true);
 assert.equal(kitImagesLookDuplicated(a,compressed),true);
});
test('cena visualmente diferente não é recusada por duplicidade',()=>{
 const a=sample((p)=>p%20<10?40:230);
 const b=sample((p)=>Math.floor(p/20)<10?220:35);
 assert.equal(kitImagesLookDuplicated(a,b),false);
 assert.equal(kitImagesLookDuplicated(null,b),false);
});
test('o bloqueio de repetição é exclusivo das imagens importadas pela extensão de kits',()=>{
 const js=fs.readFileSync(new URL('../public/kit-builder.js',import.meta.url),'utf8');
 assert.match(js,/kitImagesLookDuplicated\(sample,previous\)/);
 assert.match(js,/onPhoto:async\(\{slot,dataUrl,kitSku\}\)/);
 assert.match(js,/slot>1&&images.size/);
 assert.match(js,/ESTA É A IMAGEM 02 \(USO REAL\), NÃO A CAPA 01/);
 const normal=fs.readFileSync(new URL('../public/app.js',import.meta.url),'utf8');
 assert.ok(!normal.includes('kitImagesLookDuplicated('));
});
