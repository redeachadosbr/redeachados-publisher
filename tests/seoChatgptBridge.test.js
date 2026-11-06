import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';

const source=readFileSync(new URL('../public/seo-chatgpt-bridge.js',import.meta.url),'utf8');
const context={URL,globalThis:null};context.globalThis=context;
vm.runInNewContext(source,context);
const {parse,count,emojiCount,prompt}=context.RASeoChatGPT;

const make=(n)=>{const base='Caminhão Dinossauro Verde 🦖 Brinquedo Infantil com Mini Carrinhos para Crianças e Brincadeiras Criativas '+n;return base+'a'.repeat(120-[...base].length);};

test('quatro títulos ChatGPT são distintos, têm exatamente 120 caracteres e um emoji após o nome',()=>{
 const titles=[1,2,3,4].map(n=>({title:make(n),reason:'Termos do produto confirmado'}));
 const output=parse(JSON.stringify({titles,keywords:['caminhão dinossauro','mini carrinhos'],sources:[],researchStatus:'verified'}));
 assert.equal(output.titles.length,4);
 assert.equal(output.researchStatus,'unverified','Sem fonte pesquisada não afirmar buscas verificadas');
 for(const t of output.titles){assert.equal(count(t.title),120);assert.equal(emojiCount(t.title),1);}
});
test('não aceitar quatro títulos iguais, emojis faltando ou títulos curtos',()=>{
 const t=[1,2,3,4].map(n=>({title:make(n)}));
 const duplicate=parse(JSON.stringify({titles:[t[0],t[0],t[2],t[3]]}));
 assert.equal(duplicate.titles.length,4);
 assert.equal(duplicate.titles[1].valid,false);
 assert.match(duplicate.titles[1].warning,/repetido/i);
 const emoji=parse(JSON.stringify({titles:[{title:make(1).replace('🦖','a')},...t.slice(1)]}));
 assert.equal(emoji.titles.length,4);
 assert.equal(emoji.titles[0].valid,false);
 assert.match(emoji.titles[0].warning,/1 emoji/);
 const short=parse(JSON.stringify({titles:[{title:'Caminhão 🦖 curto'},...t.slice(1)]}));
 assert.equal(short.titles.length,4);
 assert.equal(short.titles[0].valid,false);
 assert.match(short.titles[0].warning,/exatamente 120/);
});
test('prompt obriga pesquisa real, sem declarar volumes não verificados',()=>{
 const p=prompt({sku:'303448',itemId:'1',productTitle:'Caminhão Dinossauro com 3 Mini Carrinhos - Verde',supplierProduct:{brand:'TOYS & TOYS'}});
 assert.match(p,/PESQUISE AGORA NA WEB/);
 assert.match(p,/UM emoji apropriado/);
 assert.match(p,/EXATAMENTE 120 caracteres Unicode/);
 assert.match(p,/Não invente volume/);
});
test('quatro sugestões incluem títulos incompletos sem descartar outros três',()=>{
 const titles=[1,2,3,4].map(n=>({title:make(n),reason:'Palavra-chave contextual'}));
 titles[1].title='Caminhão Dinossauro Verde 🦖 com 3 Mini Carrinhos';
 const parsed=parse(JSON.stringify({titles,keywords:['caminhão dinossauro']}));
 assert.equal(parsed.titles.length,4);
 assert.equal(parsed.titles[1].valid,false);
 assert.equal(parsed.titles.filter(t=>t.valid).length,3);
});
test('importa JSON com texto antes e depois e mantém um emoji após o nome',()=>{
 const titles=[1,2,3,4].map(n=>({title:make(n),reason:'Busca comercial do produto'}));
 const response='Analisado\\n'+JSON.stringify({titles,keywords:['caminhão dinossauro','mini carrinhos'],
   sources:[],researchStatus:'unverified'})+'\\nVerifique os detalhes antes de publicar.';
 const parsed=parse(response);
 assert.equal(parsed.titles.length,4);
 for(const t of parsed.titles){
  assert.ok(t.title.startsWith('Caminhão Dinossauro Verde 🦖 '));
  assert.ok(t.title.length>100);
  assert.equal(emojiCount(t.title),1);
  assert.equal(count(t.title),120);
 }
});
test('títulos retornados exigem confirmação explícita do Manager para fechar o ChatGPT',()=>{
 const site=readFileSync(new URL('../public/title-studio.js',import.meta.url),'utf8');
 const bridge=readFileSync(new URL('../public/seo-chatgpt-bridge.js',import.meta.url),'utf8');
 assert.match(site,/grid\.querySelectorAll\('article\.seo-studio-card'\)\.length!==4/);
 assert.match(site,/RASeoChatGPT\.acknowledge\(result\)/);
 assert.match(bridge,/RA_SITE_SEO_ACK/);
});
test('editor manual e botão visível não dependem da ponte',()=>{
 const site=readFileSync(new URL('../public/seo-modern-layout.js',import.meta.url),'utf8');
 const app=readFileSync(new URL('../public/app.js',import.meta.url),'utf8');
 const studio=readFileSync(new URL('../public/title-studio.js',import.meta.url),'utf8');
 assert.match(site,/Salvar título manual/);
 assert.match(app,/globalThis\.ShopeeSeoSaveManual=async/);
 assert.match(app,/workflow\/content-draft/);
 assert.match(studio,/RASeoChatGPT\.request/);
 assert.doesNotMatch(studio,/void generateTitles\(false\);\s*\/\/ Processo local/);
});
