import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
const code=readFileSync(new URL('../public/description-chatgpt-bridge.js',import.meta.url),'utf8');
const context={globalThis:null};context.globalThis=context;
vm.runInNewContext(code,context);
const api=context.RADescriptionChatGPT;
test('prompt usa informações reais da WeDrop e impede características inventadas',()=>{
 const data={sku:'303448',productTitle:'Caminhão Dinossauro com 3 Mini Carrinhos Verde',
  supplierProduct:{name:'Caminhão Dinossauro',brand:'TOYS & TOYS'},
  sourceEvidence:{sourceText:'Caminhão verde com três mini carrinhos. Registro de catálogo WeDrop.'}};
 const p=api.prompt(data);
 assert.match(p,/informacoesWeDropSalvas/);
 assert.match(p,/três mini carrinhos/);
 assert.match(p,/O que acompanha/);
 assert.match(p,/Dúvidas frequentes/);
 assert.match(p,/CTA/);
 assert.match(p,/PROIBIDO inventar/);
});
test('importa JSON completo com emojis, itens inclusos, benefícios e CTA',()=>{
 const description=[
 '✨ Caminhão dinossauro verde com 3 mini carrinhos, para criar novas histórias e se divertir com o tema dos dinossauros.',
 '✅ Benefícios: o conjunto reúne veículo temático e mini carrinhos em uma só opção.',
 '💡 Por que comprar: ideia para presentear fãs de dinossauros, sem prometer recursos não confirmados.',
 '⚙️ Características: cor verde, brinquedo com caminhão dinossauro e 3 mini carrinhos.',
 '📦 O que acompanha: um caminhão dinossauro com três mini carrinhos, conforme o cadastro.',
 '❓ Dúvida: quantos mini carrinhos? São três, segundo a ficha WeDrop.',
 '🛒 Escolha o conjunto e aproveite para criar suas próprias aventuras!'
 ].join('\n\n');
 const result=api.parse('Analisado\n'+JSON.stringify({description,factsUsed:['3 mini carrinhos']})+'\nFim');
 assert.equal(result.description,description);
 assert.ok(result.length>250);
 assert.equal(result.factsUsed.length,1);
});
test('descrição incompleta sem itens inclusos ou CTA não pode ser publicada',()=>{
 assert.throws(()=>api.parse(JSON.stringify({description:'✨ descrição de teste '.repeat(30)})),/faltam itens inclusos/);
});
test('botão preserva edição, importação e confirmação de rascunho por SKU',()=>{
 const modern=readFileSync(new URL('../public/description-modern-layout.js',import.meta.url),'utf8');
 const app=readFileSync(new URL('../public/app.js',import.meta.url),'utf8');
 const page=readFileSync(new URL('../public/index.html',import.meta.url),'utf8');
 assert.match(modern,/Gerar descrição com ChatGPT/);
 assert.match(modern,/Importar descrição copiada/);
 assert.match(modern,/RADescriptionChatGPT\.acknowledge\(result\)/);
 assert.match(modern,/ShopeeDescriptionSaveChatGPT/);
 assert.match(app,/globalThis\.ShopeeDescriptionSaveChatGPT=async/);
 assert.match(app,/await optimizerContentFlush\(\)/);
 assert.match(page,/description-chatgpt-bridge\.js/);
});
