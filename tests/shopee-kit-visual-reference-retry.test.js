import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {visualReferenceCandidates,isVisualReferenceError} from '../public/optimizer-visual-reference.js';

test('Kit anunciado usa fotos originais do Item ID e alterna CDN oficial',()=>{
 const url='https://cf.shopee.com.br/file/sg-11134201-825ad-mqxk7vehq77wd0';
 const refs=visualReferenceCandidates([url,'https://down-br.img.susercontent.com/file/outra-foto']);
 assert.equal(refs[0],'https://down-br.img.susercontent.com/file/sg-11134201-825ad-mqxk7vehq77wd0');
 assert.equal(refs[1],url);
 assert.equal(refs.length,3);
});
test('Rejeita URLs não oficiais e não gera referência de outra origem',()=>{
 assert.deepEqual(visualReferenceCandidates(['data:image/png;base64,abc','http://cf.shopee.com.br/file/test',
 'https://cf.shopee.com.br.evil.com/file/other','https://unknown.com/a.png']),[]);
 assert.equal(isVisualReferenceError('Referência visual inválida.'),true);
 assert.equal(isVisualReferenceError('Unauthorized'),false);
});
test('Ponte faz retry não destrutivo e não usa WeDrop de SKU unitária para kit avulso',()=>{
 const app=readFileSync(new URL('../public/app.js',import.meta.url),'utf8');
 const server=readFileSync(new URL('../server.js',import.meta.url),'utf8');
 const images=readFileSync(new URL('../shopeeOpenAiImages.js',import.meta.url),'utf8');
 assert.match(app,/const existingKit=isPendingKitDirect\(w.sku,w.itemId\)/);
 assert.match(app,/visualReferenceCandidates\(existingKit\?\(w.imageUrls\|\|\[\]\)/);
 assert.match(app,/isVisualReferenceError\(recovered.error\)/);
 assert.match(app,/isVisualReferenceError\(startResult\?\.error\)/);
 assert.match(app,/completed:stored/);
 assert.match(server,/if\(wedropImage&&!editCurrent&&!listingIsKit\)/);
 assert.match(images,/for\(const u of sources\)\{/);
 assert.match(images,/break; \/\/ Referência boa/);
});
