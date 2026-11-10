import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {visualReferenceCandidates,isVisualReferenceError,bridgeShopeeReferenceCandidates} from '../public/optimizer-visual-reference.js';

test('Kit anunciado usa fotos originais do Item ID e alterna CDN oficial',()=>{
 const url='https://cf.shopee.com.br/file/sg-11134201-825ad-mqxk7vehq77wd0';
 const refs=visualReferenceCandidates([url,'https://down-br.img.susercontent.com/file/outra-foto']);
 assert.equal(refs[0],'https://down-br.img.susercontent.com/file/sg-11134201-825ad-mqxk7vehq77wd0');
 assert.equal(refs[1],url);
 assert.equal(refs[2],'https://cf.shopee.com.br/file/outra-foto');
 assert.equal(refs[3],'https://down-br.img.susercontent.com/file/outra-foto');
 assert.equal(refs.length,4);
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
 assert.match(app,/const bridgeCompleted=deferredThird\?/);
 assert.match(app,/completed:bridgeCompleted/);
 assert.match(server,/if\(wedropImage&&!editCurrent&&!listingIsKit\)/);
 assert.match(images,/for\(const u of sources\)\{/);
 assert.match(images,/break; \/\/ Referência boa/);
});

test('Ponte não envia imagem WeDrop quando anúncio individual está vinculado à Shopee',()=>{
 const shopee='https://cf.shopee.com.br/file/sg-11134201-825ad-mqxk7vehq77wd0';
 const wedrop='https://wedrop-products-images.nyc3.cdn.digitaloceanspaces.com/6s1dh1dctha-xl.jpg';
 const refs=bridgeShopeeReferenceCandidates([wedrop,shopee]);
 assert.ok(refs.length>=2);
 assert.equal(refs[0],shopee);
 assert.ok(refs.every(url=>!url.includes('digitaloceanspaces.com')));
 assert.equal(isVisualReferenceError('Fotografia original fora da Shopee.'),true);
});
test('Imagem isolada tenta fontes oficiais do mesmo anúncio sem apagar as duas primeiras fotos',()=>{
 const app=readFileSync(new URL('../public/app.js',import.meta.url),'utf8');
 const handler=app.slice(app.indexOf('async function optimizerCommercialRequestChatgptSlot('),
  app.indexOf('async function optimizerChatgptCopyAll('));
 assert.match(handler,/brief\.referenceCandidates\|\|\[\]/);
 assert.match(handler,/const reply=await ack/);
 assert.match(handler,/isVisualReferenceError\(lastError\)/);
 assert.match(handler,/completed:Array\.from\(\{length:9\}/);
 assert.doesNotMatch(handler,/method:'DELETE'/);
 assert.doesNotMatch(handler,/imageUrl:brief\.original/);
});
