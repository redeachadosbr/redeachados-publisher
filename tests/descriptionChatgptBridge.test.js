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
 assert.match(p,/O QUE VAI NA EMBALAGEM/);
 assert.match(p,/DÚVIDAS FREQUENTES/);
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
 assert.ok(result.description.indexOf('❓ DÚVIDAS FREQUENTES')<result.description.indexOf('⚙️ CARACTERÍSTICAS'));
 assert.match(result.description,/✅ BENEFÍCIOS/);
 assert.match(result.description,/💡 POR QUE COMPRAR/);
 assert.ok(result.length>250);
 assert.equal(result.factsUsed.length,1);
});
test('descrição incompleta sem itens inclusos ou CTA não pode ser publicada',()=>{
 assert.throws(()=>api.parse(JSON.stringify({description:'✨ descrição de teste '.repeat(30)})),/incompleta/);
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

test('descrição JSON com \\n literais chega ao editor com parágrafos reais, sem fatos JSON',()=>{
 const content=[
  '✨ Caminhão Dinossauro verde com três mini carrinhos para uma brincadeira criativa com o tema dos dinossauros.',
  '✅ BENEFÍCIOS',
  '🚚 O conjunto permite criar histórias e brincar com os mini carrinhos sem precisar de acessórios extras.',
  '💡 POR QUE COMPRAR',
  'Uma opção temática para fãs de dinossauros, baseada somente nas informações do produto.',
  '⚙️ CARACTERÍSTICAS',
  'Cor verde e três mini carrinhos confirmados pelo catálogo WeDrop.',
  '📦 O QUE ACOMPANHA',
  'Um caminhão dinossauro e três mini carrinhos.',
  '🛒 Escolha o conjunto e prepare novas aventuras!'
 ].join('\\n\\n'); // o ChatGPT às vezes duplica o escape
 const text='Resposta comercial pronta:\n'+JSON.stringify({
  description:content,factsUsed:['SKU 303448','3 mini carrinhos'],
  unverified:['idade recomendada não confirmada']})+'\nPesquisa concluída.';
 const parsed=api.parse(text);
 assert.match(parsed.description,/\n\n✅ BENEFÍCIOS/);
 assert.match(parsed.description,/\n\n📦 O QUE VAI NA EMBALAGEM/);
 assert.match(parsed.description,/\n\n🛒 Escolha/);
 assert.doesNotMatch(parsed.description,/\\n/);
 assert.doesNotMatch(parsed.description,/factsUsed|unverified|"description":/);
 assert.equal(parsed.factsUsed.length,2);
});
test('descrição pode ser recuperada sem outra geração e exige confirmação do banco',()=>{
 const modern=readFileSync(new URL('../public/description-modern-layout.js',import.meta.url),'utf8');
 const bridge=readFileSync(new URL('../public/description-chatgpt-bridge.js',import.meta.url),'utf8');
 assert.match(bridge,/RA_SITE_DESC_RECOVER/);
 assert.match(bridge,/RA_EXTENSION_DESC_RECOVER_RESULT/);
 assert.match(bridge,/RA_SITE_DESC_RECOVER_ACK/);
 assert.match(modern,/Recuperar descrição do ChatGPT/);
 assert.match(modern,/await applyDescription\(result\)/);
 assert.match(modern,/acknowledgeRecovery\(result\)/);
 assert.match(modern,/Importar texto colado/);
 assert.match(modern,/manualArea\.value/);
});

test('reorganiza as dúvidas antes das características mesmo que o ChatGPT troque a ordem',()=>{
 const source=[
 '✨ Caminhão dinossauro verde para criar histórias com os três mini carrinhos do conjunto.',
 '✅ BENEFÍCIOS','🚚 Brincadeira temática com mini carrinhos e caminhão dinossauro.',
 '💡 POR QUE COMPRAR','O produto reúne um caminhão e três mini carrinhos anunciados.',
 '⚙️ CARACTERÍSTICAS','Cor verde, brinquedo temático conforme ficha WeDrop.',
 '📦 O QUE ACOMPANHA','Um caminhão dinossauro e três mini carrinhos.',
 '❓ DÚVIDAS FREQUENTES','Quantos carrinhos acompanham? Três mini carrinhos.',
 '🛒 Adicione ao carrinho e prepare novas brincadeiras!'
 ].join('\\n\\n');
 const out=api.parse(JSON.stringify({description:source})).description;
 const headings=['✅ BENEFÍCIOS','💡 POR QUE COMPRAR','❓ DÚVIDAS FREQUENTES','⚙️ CARACTERÍSTICAS','📦 O QUE VAI NA EMBALAGEM','🛒'];
 let old=-1;for(const heading of headings){const at=out.indexOf(heading);assert.ok(at>old,heading);old=at;}
 assert.ok(out.includes('\n\n✅ BENEFÍCIOS\n'));
 assert.ok(out.endsWith('🛒 Adicione ao carrinho e prepare novas brincadeiras!'));
});

test('cartão Escrita do ChatGPT: colagem com Markdown importa texto real sem cabeçalho',()=>{
 const raw=[
  'Escrita',
  '✨ Uma mala infantil rosa para organizar pertences e trazer charme aos passeios. Seu formato divertido transforma cada aventura em uma experiência especial.',
  '## **✅ BENEFÍCIOS**',
  '🎀 Interior com compartimentos para guardar os objetos do dia a dia.',
  '🧳 Rodinhas e alça para deslocamento mais prático durante os passeios.',
  '💡 **POR QUE COMPRAR**',
  '💖 Design infantil inspirado em carrinho com detalhes que valorizam o produto, sem precisar inventar acessórios.',
  '## ⚙️ CARACTERÍSTICAS',
  'Cor rosa e design conversível em formato de carro, conforme a descrição do produto.',
  '📦 **O QUE VAI NA EMBALAGEM**',
  'Uma mala infantil rosa, conforme a descrição fornecida.',
  '🛒 Leve mais organização e encanto às aventuras do dia a dia!'
 ].join('\n\n');
 const parsed=api.parse(raw);
 assert.ok(parsed.length>250);
 assert.match(parsed.description,/✅ BENEFÍCIOS\n/);
 assert.match(parsed.description,/📦 O QUE VAI NA EMBALAGEM/);
 assert.ok(!parsed.description.startsWith('Escrita'));
 assert.doesNotMatch(parsed.description,/\*\*|^##/m);
 assert.ok(parsed.description.split('\n\n').at(-1).startsWith('🛒'));
});
test('fallback de colagem continua disponível durante espera de geração e cancela espera após salvar',()=>{
 const modern=readFileSync(new URL('../public/description-modern-layout.js',import.meta.url),'utf8');
 const bridge=readFileSync(new URL('../public/description-chatgpt-bridge.js',import.meta.url),'utf8');
 assert.match(modern,/generationAbort=new AbortController\(\)/);
 assert.match(modern,/if\(fallback\)generationAbort\?\.abort\(\)/);
 assert.match(modern,/listen\(manualArea,'input'/);
 assert.match(modern,/runManual\(\{automatic:true\}\)/);
 assert.match(modern,/await applyDescription\(result,\{fallback:true\}\)/);
 assert.doesNotMatch(modern,/async function runManual\(\)\{\s*if\(busy\)return/);
 assert.match(bridge,/signal\?\.addEventListener\('abort',abort/);
});
