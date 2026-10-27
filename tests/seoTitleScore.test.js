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
 {title:'🦖 Caminhão Dinossauro Verde 3 Mini Carrinhos Brinquedo Infantil para Crianças Presente e Diversão com Amigos 🚚'},
 {title:'🦖 Dino Caminhão Brinquedo Infantil Verde com Mini Carrinhos para Crianças Presentear e Brincar no Dia a Dia 🚚'},
 {title:'🦖 Caminhão Verde com Mini Carrinhos e Dinossauro Brinquedo Infantil para Crianças em Momentos de Lazer 🚚'},
 {title:'🦖 Caminhão Dinossauro Brinquedo com Mini Carrinhos Verde para Crianças Diversão Criativa Infantil 🚚'}
 ];
 const list=rank(source,{productTitle:'Caminhão Dinossauro com 3 Mini Carrinhos - Verde',keywords:['caminhão dinossauro','mini carrinhos','brinquedo infantil','para crianças']});
 assert.equal(list.length,4);
 assert.equal(list.filter(t=>t.ideal).length,1);
 assert.equal(list[0].rank,1);
 assert.equal(list[0].ideal,true);
 for(let i=1;i<4;i++)assert.ok(list[i-1].score>=list[i].score);
 for(const s of list){assert.ok(s.score>=0&&s.score<=100);assert.equal(Math.min(89,Object.values(s.breakdown).reduce((a,b)=>a+b,0)),s.score);}
});
test('título incompleto recebe nota, mas nunca ganha destaque como ideal',()=>{
 const original='🦖 Caminhão Dinossauro Verde com 3 Mini Carrinhos Infantil para Crianças Aventura Brinquedo de Transporte 🚚';
 const rows=rank([{title:original,valid:false,warning:'Não confirmado'},
 {title:original+' Especial',valid:false}, {title:original.replace('Infantil','Brinquedo Infantil'),valid:true},
 {title:original.replace('Transporte','Brincadeira'),valid:false}],
 {productTitle:'Caminhão Dinossauro 3 Mini Carrinhos',keywords:['caminhão dinossauro']});
 assert.equal(rows.length,4);
 assert.equal(rows.filter(x=>x.ideal).length,1);
 assert.equal(rows[0].usable,true);
 assert.equal(rows[0].ideal,true);
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
 assert.match(prompt,/buscar 120 quando houver palavras-chave confirmadas/);
 assert.match(prompt,/um emoji NO INÍCIO e outro NO FIM/);
});

test('quatro cartões em grade 2x2 exibem notas e destacam a recomendação',()=>{
 const css=readFileSync(new URL('../public/seo-modern-layout.css',import.meta.url),'utf8');
 const studio=readFileSync(new URL('../public/title-studio.js',import.meta.url),'utf8');
 const page=readFileSync(new URL('../public/index.html',import.meta.url),'utf8');
 assert.match(css,/#optimizerTitleVariants \.seo-modern-grid\{display:grid!important;grid-template-columns:repeat\(2,minmax\(0,1fr\)\)!important/);
 assert.match(css,/#optimizerTitleVariants \.seo-modern-grid \.seo-studio-meter\{display:flex!important/);
 assert.doesNotMatch(css,/#optimizerTitleVariants \.seo-modern-grid \.seo-studio-meter\{display:none!important/);
 assert.match(css,/\.seo-studio-card\.seo-studio-ideal/);
 assert.match(studio,/RASeoTitleScore\?\.rank/);
 assert.match(studio,/seo-studio-score-track/);
 assert.match(studio,/RECOMENDADO — maior nota SEO/);
 assert.match(studio,/Aguardando título validado de 100 a 120 caracteres/);
 assert.match(page,/seo-modern-layout\.css\?v=1\.0\.5-compact-cards/);
});

test('botão de importação de resposta copiada é visível e gera quatro cartões sem pesquisa nova',()=>{
 const studio=readFileSync(new URL('../public/title-studio.js',import.meta.url),'utf8');
 const ui=readFileSync(new URL('../public/seo-modern-layout.js',import.meta.url),'utf8');
 const css=readFileSync(new URL('../public/seo-modern-layout.css',import.meta.url),'utf8');
 assert.match(studio,/Importar resposta copiada do ChatGPT/);
 assert.match(studio,/navigator\.clipboard\.readText\(\)/);
 assert.match(studio,/pasteDirect\.onclick/);
 assert.match(ui,/suggestions\.append\(pasteDirect\)/);
 assert.match(css,/\.seo-studio-direct-import/);
});

test('SEO compacto mantém os 4 cartões com notas e recolhe justificativas e URLs por padrão',()=>{
 const studio=readFileSync(new URL('../public/title-studio.js',import.meta.url),'utf8');
 const layout=readFileSync(new URL('../public/seo-modern-layout.js',import.meta.url),'utf8');
 const css=readFileSync(new URL('../public/seo-modern-layout.css',import.meta.url),'utf8');
 assert.match(studio,/seo-studio-analysis-details/);
 assert.match(studio,/Ver análise e critérios da nota/);
 assert.match(layout,/seo-modern-research-details/);
 assert.match(layout,/Ver palavras-chave e URLs da pesquisa/);
 assert.match(layout,/references\.append\(summary,researchPanel\)/);
 assert.doesNotMatch(layout,/lower\.append\(supplier\)/);
 assert.doesNotMatch(layout,/lower\.append\(quick\)/);
 assert.doesNotMatch(layout,/content\.append\(lower\)/);
 assert.match(css,/SEO compacto: 4 títulos/);
 assert.match(css,/seo-modern-research-details/);
 assert.match(css,/seo-studio-choose/);
});
