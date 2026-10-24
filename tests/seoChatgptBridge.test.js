import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';

const source=readFileSync(new URL('../public/seo-chatgpt-bridge.js',import.meta.url),'utf8');
const context={URL,globalThis:null};context.globalThis=context;
vm.runInNewContext(source,context);
const {parse,count,emojiCount,prompt}=context.RASeoChatGPT;

const words='Caminhão Dinossauro Verde com Mini Carrinhos Brinquedo Infantil de Montar para Crianças ';
const make=(n)=>'🦖 🚚 '+(words+n).padEnd(106,'a');

test('quatro títulos ChatGPT são distintos, têm 100-120 caracteres e dois emojis',()=>{
 const titles=[1,2,3,4].map(n=>({title:make(n),reason:'Termos do produto confirmado'}));
 const output=parse(JSON.stringify({titles,keywords:['caminhão dinossauro','mini carrinhos'],sources:[],researchStatus:'verified'}));
 assert.equal(output.titles.length,4);
 assert.equal(output.researchStatus,'unverified','Sem fonte pesquisada não afirmar buscas verificadas');
 for(const t of output.titles){assert.ok(count(t.title)>=100&&count(t.title)<=120);assert.equal(emojiCount(t.title),2);}
});
test('não aceitar quatro títulos iguais, emojis faltando ou títulos curtos',()=>{
 const t=[1,2,3,4].map(n=>({title:make(n)}));
 assert.throws(()=>parse(JSON.stringify({titles:[t[0],t[0],t[2],t[3]]})),/repetiu/);
 assert.throws(()=>parse(JSON.stringify({titles:[{title:make(1).replace('🚚','a')},...t.slice(1)]})),/exatamente 2 emojis/);
 assert.throws(()=>parse(JSON.stringify({titles:[{title:'🦖 🚚 curto'},...t.slice(1)]})),/100 a 120/);
});
test('prompt obriga pesquisa real, sem declarar volumes não verificados',()=>{
 const p=prompt({sku:'303448',itemId:'1',productTitle:'Caminhão Dinossauro com 3 Mini Carrinhos - Verde',supplierProduct:{brand:'TOYS & TOYS'}});
 assert.match(p,/PESQUISE AGORA NA WEB/);
 assert.match(p,/exatamente 2 EMOJIS/);
 assert.match(p,/mínimo 100 e máximo 120/);
 assert.match(p,/volumes absolutos/);
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
