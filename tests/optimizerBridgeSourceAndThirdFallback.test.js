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
