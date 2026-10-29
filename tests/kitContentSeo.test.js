import test from 'node:test';
import assert from 'node:assert/strict';
import {scoreKitSeoTitle,parseKitSeoResponse} from '../public/kit-seo-helper.js';
test('kit importa três títulos SEO distintos e uma descrição única',()=>{
 const titles=['Kit Elefante Musical e Chocalho Para Bebê 🎶','Kit Chocalho e Elefante Musical Brinquedos Para Bebê 🐘','🐘 Kit Brinquedo Musical Elefante com Chocalho para Diversão 🎶'];
 const content=titles.map((x,i)=>'TÍTULO '+(i+1)+': '+x).join('\n')+
  '\nDESCRIÇÃO:\n✨ Um conjunto infantil com elefante musical e chocalho.\n✅ BENEFÍCIOS\n• Diversão de brinquedos.\n💡 POR QUE COMPRAR\nDuas opções para brincar.\n📦 O QUE VAI NA EMBALAGEM\n• 1 elefante musical\n• 1 chocalho.';
 const parsed=parseKitSeoResponse(content);
 assert.equal(parsed.titles.length,3);
 assert.match(parsed.description,/BENEFÍCIOS/);
 const rank=scoreKitSeoTitle(parsed.titles[0].title,[{name:'Elefante Musical'},{name:'Chocalho'}]);
 assert(Number.isInteger(rank.score)&&rank.score>=0&&rank.score<=100);
 assert.match(rank.note,/não é ranking oficial/);
 assert.throws(()=>parseKitSeoResponse('TÍTULO: Único\nDESCRIÇÃO: curta'),/TÍTULO 1/);
});

test('cópia de bloco Escrita do ChatGPT com 3 títulos e descrição é importada',async()=>{
 const {kitSeoRiskFlags}=await import('../public/kit-seo-helper.js');
 const source='Escrita\n\n**TÍTULO 1:** Kit Elefante Brincalhão Musical com Luzes + Torre Chocalho 🐘 🎶\n\n'+
  '**TÍTULO 2:** Kit Infantil Sensorial Elefante e Torre com Bola Chocalho 🐘 ✨\n\n'+
  '**TÍTULO 3:** Kit Brinquedos para Bebê Elefante Musical e Torre com Chocalho 🎁 🐘\n\n'+
  '**DESCRIÇÃO:**\n\n✨ Kit com dois brinquedos para brincar.\n\n✅ BENEFÍCIOS\n• Elefante musical\n• Torre e bola chocalho\n\n💡 POR QUE COMPRAR\nDois componentes em um kit.\n\n📦 O QUE VAI NA EMBALAGEM\n1 de cada produto.';
 const parsed=parseKitSeoResponse(source);
 assert.equal(parsed.titles.length,3);
 assert.match(parsed.description,/DOIS/i);
 assert.deepEqual(kitSeoRiskFlags('Kit para Bebê 12 Meses',[
  {name:'Elefante Musical',description:'Brinquedo Musical'}]),[
   'Faixa etária “12 meses” não confirmada nos dados WeDrop disponíveis'
  ]);
});
test('colagem de prompt no campo de resposta mostra erro orientado ao usuário',()=>{
 const input='Você é redator brasileiro especializado em conversão e SEO Shopee da Rede Achados BR.\n'+
  'Informações por produto (dados do fornecedor):\nSKU 310200\nResponda apenas neste formato:\n'+
  'TÍTULO 1: Kit exemplo um\nTÍTULO 2: Kit exemplo dois\nTÍTULO 3: Kit exemplo três\nDESCRIÇÃO: ✨ o prompt não é anúncio, e não deve importar.';
 assert.throws(()=>parseKitSeoResponse(input),/ORIENTAÇÃO enviada/);
});

test('blocos SEO ficam imediatamente após o gerador de títulos e descrição do kit',async()=>{
 const {readFileSync}=await import('node:fs');
 const html=readFileSync(new URL('../public/index.html',import.meta.url),'utf8');
 const names=[
  'Gerar 3 títulos SEO e descrição do kit no ChatGPT Plus',
  'id="kitSeoOptions"',
  'id="kitContentDetails"',
  'id="kitMissingFacts"',
  'class="kit-copy-assistant"'
 ];
 const locations=names.map(name=>html.indexOf(name));
 assert(locations.every(x=>x>=0));
 assert(locations.every((x,i)=>i===0||locations[i-1]<x),
  'gerador, resultados, opções avançadas e próximos blocos devem estar na ordem correta');
 for(const id of ['kitSeoOptions','kitSeoOptionList','kitSaveSeoContent',
  'kitContentDetails','kitPlusTextResult','kitImportText','kitContentPrompt'])
  assert.equal(html.split('id="'+id+'"').length-1,1,'ID único: '+id);
 const between=html.slice(locations[0],locations[1]);
 assert.doesNotMatch(between,/id="kitMissingFacts"|class="kit-copy-assistant"/);
});

test('importacao azul fica ao lado do gerador; instrucoes duplicadas foram removidas',async()=>{
 const {readFileSync}=await import('node:fs');
 const html=readFileSync(new URL('../public/index.html',import.meta.url),'utf8');
 const browser=readFileSync(new URL('../public/kit-builder.js',import.meta.url),'utf8');
 const strip=html.slice(html.indexOf('class="kit-chatgpt-strip kit-chatgpt-import-strip"'),html.indexOf('id="kitSeoOptions"'));
 for(const id of ['kitPlusText','kitImportCopiedText','kitImportState','kitContentFeedback'])
  assert.match(strip,new RegExp('id="'+id+'"'));
 assert.doesNotMatch(html,/class="kit-copy-assistant"/);
 for(const id of ['kitImportCopiedText','kitPlusText','kitContentFeedback','kitImportState','kitContentDetails','kitPlusTextResult'])
  assert.equal(html.split('id="'+id+'"').length-1,1);
 assert.match(browser,/kitImportCopiedText'\)\?\.addEventListener\('click'/);
 assert.match(browser,/const content=await navigator\.clipboard\.readText\(\)/);
 assert.match(browser,/parseKitSeoResponse\(\$\('#kitPlusTextResult'\)\.value\)/);
 assert.match(browser,/\$\('#kitDescription'\)\.value=result\.description/);
 assert.match(browser,/void saveDraft\(\)\.then/);
 assert.match(browser,/Abra Opções avançadas/);
});
