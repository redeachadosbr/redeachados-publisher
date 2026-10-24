import test from 'node:test';
import assert from 'node:assert/strict';
import {confirmedSpecCard} from '../public/specificationCard.js';
import {createChatGptPrompts} from '../public/chatgptPrompts.js';
import {readFileSync} from 'node:fs';

test('SKU 303448: somente medidas do caminhão, nunca dimensões de embalagem WeDrop',()=>{
 const specs=confirmedSpecCard({sku:'303448'});
 assert.equal(specs.title,'MEDIDAS DO CAMINHÃO');
 assert.deepEqual(specs.measurements.map(x=>x.value),['35 cm','16 cm','9 cm']);
 assert(specs.details.some(x=>x.includes('ABS')));
 assert(specs.details.some(x=>x.includes('3 mini carrinhos')));
 const asText=JSON.stringify(specs);
 assert(!asText.includes('48 cm')&&!asText.includes('18 cm')&&!asText.includes('15 cm'));
});
test('prompt imagem 03 deixa espaço para ficha técnica determinística e mostra 3 carrinhos',()=>{
 const x=createChatGptPrompts({sku:'303448',title:'Caminhão Dinossauro com 3 Mini Carrinhos - Verde',imageUrls:['https://shopee.com.br/foto']});
 assert.equal(x.prompts.length,9);
 assert(x.prompts[2].includes('FICHA DE ESPECIFICAÇÕES'));
 assert(x.prompts[2].includes('Manager imprimirá as dimensões'));
 assert(x.prompts[2].includes('3 mini carrinhos'));
 assert(x.prompts[2].includes('não escrever')||x.prompts[2].includes('Não adicione'));
 assert(!x.prompts[0].includes('FICHA DE ESPECIFICAÇÕES'));
 assert(!x.prompts[1].includes('FICHA DE ESPECIFICAÇÕES'));
});
test('upload ponte aplica ficha técnica antes da confirmação no servidor',()=>{
 const app=readFileSync(new URL('../public/app.js',import.meta.url),'utf8');
 const img=app.indexOf("if(Number(m.slot)===3)");
 const hash=app.indexOf("const sha256=await imageBlobSha256(prepared.blob)",img);
 assert(img>0&&hash>img);
 const block=app.slice(img,hash);
 assert(block.includes('addConfirmedSpecificationCard'));
 assert(block.includes('Imagem 03 requer especificações confirmadas'));
});
test('outras SKUs sem dados verificados nunca recebem dimensões inventadas',()=>{
 assert.equal(confirmedSpecCard({sku:'aleatorio',attributes:[]}),null);
 const known=confirmedSpecCard({sku:'aleatorio',attributes:[{name:'Cor',value:'Verde'}]});
 assert.deepEqual(known.details,['Cor: Verde']);
 assert.equal(known.measurements.length,0);
});
