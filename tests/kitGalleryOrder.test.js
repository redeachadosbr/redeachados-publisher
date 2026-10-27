import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {kitImageFilenameSlot,kitImageNextSlot,kitPlanImageImports,kitMoveImage} from '../public/kit-gallery-order.js';
test('reconhece nomes de fotos por posição e ignora números de data',()=>{
 assert.equal(kitImageFilenameSlot('kit-foto-01.png'),1);
 assert.equal(kitImageFilenameSlot('Imagem 09.png'),9);
 assert.equal(kitImageFilenameSlot('image_3.webp'),3);
 assert.equal(kitImageFilenameSlot('05-de-09.jpg'),5);
 assert.equal(kitImageFilenameSlot('ChatGPT Image Oct 27, 2026.png'),null);
});
test('importação em lote encontra primeiro espaço vazio e preserva fotos existentes',()=>{
 const input=[{name:'imagem-03.png'},{name:'imagem-01.png'},{name:'ChatGPT Image.png'}];
 const plan=kitPlanImageImports(input,[1,4]);
 assert.deepEqual(plan.map(x=>x.slot),[2,3,5]);
 assert.equal(kitImageNextSlot([1,2,3,4,5,6,7,8,9]),null);
 assert.equal(kitPlanImageImports([{name:'teste.jpg'}],Array.from({length:9},(_,i)=>i+1))[0].slot,null);
});
test('arrastar troca duas fotos; mover para vazio libera origem',()=>{
 const original=new Map([[1,'a'],[2,'b'],[5,'e']]);
 const shifted=kitMoveImage(original,1,2);
 assert.equal(shifted.get(1),'b');assert.equal(shifted.get(2),'a');
 assert.equal(original.get(1),'a');
 const moved=kitMoveImage(shifted,5,3);
 assert.equal(moved.get(3),'e');assert.equal(moved.has(5),false);
 assert.throws(()=>kitMoveImage(original,4,1),/não contém/);
});
test('interface tem upload múltiplo, pasta autorizada, clipboard e drag-drop com revalidação',()=>{
 const html=fs.readFileSync(new URL('../public/index.html',import.meta.url),'utf8');
 const js=fs.readFileSync(new URL('../public/kit-builder.js',import.meta.url),'utf8');
 for(const id of ['kitImportCopiedImage','kitWatchDownloads','kitStopWatchDownloads','kitMultiPhotoFiles','kitGalleryCount'])
  assert.ok(html.includes('id="'+id+'"'));
 for(const token of ['showDirectoryPicker','requestPermission','kitMoveImage(','kitInvalidatePhotoPositions','kitImportPhotoFiles(','kitImageDrop(','images.keys()'])
  assert.ok(js.includes(token));
 assert.match(js,/kitWatchSeen=new Set\(entries\.map\(x=>x\.key\)\)/);
 assert.match(js,/kitWatchSku/);
});
