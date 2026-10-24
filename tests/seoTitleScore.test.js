import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
const context={globalThis:null};
context.globalThis=context;
vm.runInNewContext(readFileSync(new URL('../public/seo-title-scoring.js',import.meta.url),'utf8'),context);
const {scoreTitle,rank}=context.RASeoTitleScore;
const example='🦖 🚚 Caminhão Dinossauro Verde 3 Mini Carrinhos Brinquedo Infantil para Crianças Presente e Diversão com Amigos';
test('quatro títulos retornam na ordem de maior para menor nota, com vencedor único',()=>{
 const source=[
 {title:'🦖 🚚 Caminhão Dinossauro Verde 3 Mini Carrinhos Brinquedo Infantil para Crianças Presente e Diversão com Amigos'},
 {title:'🦖 🚚 Dino Caminhão Brinquedo Infantil Verde com Mini Carrinhos para Crianças Presentear e Brincar no Dia a Dia'},
 {title:'🦖 🚚 Caminhão Verde com Mini Carrinhos e Dinossauro Brinquedo Infantil para Crianças em Momentos de Lazer'},
 {title:'🦖 🚚 Caminhão Dinossauro Brinquedo com Mini Carrinhos Verde para Crianças Diversão Criativa Infantil'}
 ];
 const list=rank(source,{productTitle:'Caminhão Dinossauro com 3 Mini Carrinhos - Verde',keywords:['caminhão dinossauro','mini carrinhos','brinquedo infantil','para crianças']});
 assert.equal(list.length,4);
 assert.equal(list.filter(t=>t.ideal).length,1);
 assert.equal(list[0].rank,1);
 assert.equal(list[0].ideal,true);
 for(let i=1;i<4;i++)assert.ok(list[i-1].score>=list[i].score);
 for(const s of list){assert.ok(s.score>=0&&s.score<=100);assert.equal(Object.values(s.breakdown).reduce((a,b)=>a+b,0),s.score);}
});
test('nota não representa volume oficial nem inventa prova de mercado',()=>{
 const plain=scoreTitle(example,{productTitle:'Caminhão Dinossauro',keywords:[]});
 const searched=scoreTitle(example,{productTitle:'Caminhão Dinossauro',keywords:['caminhão dinossauro','mini carrinhos']});
 assert.ok(searched.score>plain.score,'termos encontrados precisam influenciar nota estrutural');
 assert.ok(plain.score<=100);
});
test('o módulo de pesquisa inclui o texto salvo em Informações da WeDrop',()=>{
 const context2={globalThis:null};context2.globalThis=context2;
 vm.runInNewContext(readFileSync(new URL('../public/seo-chatgpt-bridge.js',import.meta.url),'utf8'),context2);
 const prompt=context2.RASeoChatGPT.prompt({
  sku:'303448',productTitle:'Caminhão Dinossauro Verde',supplierProduct:{name:'Caminhão Dinossauro 3 Mini Carrinhos'},
  sourceEvidence:{sourceText:'WeDrop confirmado: produto verde, 3 mini carrinhos, fabricante TOYS & TOYS'}
 });
 assert.match(prompt,/WeDrop confirmado: produto verde, 3 mini carrinhos/);
 assert.match(prompt,/PESQUISE AGORA NA WEB/);
 assert.match(prompt,/buscar 120 quando houver palavras-chave confirmadas/);\n assert.match(prompt,/um emoji NO INÍCIO e outro NO FIM/);
});
