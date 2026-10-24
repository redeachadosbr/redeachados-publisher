import test from 'node:test';
import assert from 'node:assert/strict';
import {composeShopeeDescription} from '../shopeeDescriptionComposer.js';
test('ordem comercial do motor e embalagem confirmada',()=>{
 const out=composeShopeeDescription({
  record:{title:'Cafeteira Italiana 300 ml'},
  supplier:{product_data:{name:'Cafeteira Italiana 300 ml',description:'Material: alumínio. Capacidade: 300 ml. Itens inclusos: uma cafeteira italiana'}}
 });
 assert.equal(out.valid,true);
 const headings=['✅ BENEFÍCIOS','💡 POR QUE COMPRAR','❓ DÚVIDAS FREQUENTES','⚙️ CARACTERÍSTICAS','📦 O QUE VAI NA EMBALAGEM','🛒'];
 let prev=-1;for(const heading of headings){const at=out.description.indexOf(heading);assert.ok(at>prev,heading);prev=at;}
 assert.match(out.description,/Itens informados pela WeDrop: uma cafeteira italiana/);
 assert.ok(out.description.split('\n\n').length>=7);
});
test('omite FAQ sem provas e não inventa conteúdo da embalagem',()=>{
 const out=composeShopeeDescription({record:{title:'Garrafa Térmica 900 ml'}});
 assert.doesNotMatch(out.description,/❓ DÚVIDAS FREQUENTES/);
 assert.match(out.description,/confirme os itens com o vendedor antes de comprar/);
 assert.ok(out.description.split('\n\n').at(-1).startsWith('🛒'));
});
