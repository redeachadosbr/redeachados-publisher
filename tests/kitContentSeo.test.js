import test from 'node:test';
import assert from 'node:assert/strict';
import {scoreKitSeoTitle,parseKitSeoResponse,formatKitShopeeDescription} from '../public/kit-seo-helper.js';
const validSeoTitle=text=>{const suffix=' para momento de brincadeira com opções de estímulo e interação';let out=text;while([...out].length<100)out+=suffix;return [...out].slice(0,120).join('').trim();};
test('kit importa três títulos SEO distintos e uma descrição única',()=>{
 const titles=['Kit Elefante Musical e Chocalho Para Bebê 🎶','Kit Chocalho e Elefante Musical Brinquedos Para Bebê 🐘','🐘 Kit Brinquedo Musical Elefante com Chocalho para Diversão 🎶'];
 const content=titles.map((x,i)=>'TÍTULO '+(i+1)+': '+validSeoTitle(x)).join('\n')+
  '\nDESCRIÇÃO:\n✨ Um conjunto infantil com elefante musical e chocalho.\n✅ BENEFÍCIOS\n• Diversão de brinquedos.\n💡 POR QUE COMPRAR\nDuas opções para brincar.\n📦 O QUE VAI NA EMBALAGEM\n• 1 elefante musical\n• 1 chocalho.';
 const parsed=parseKitSeoResponse(content);
 assert.equal(parsed.titles.length,3);
 assert.match(parsed.description,/BENEFÍCIOS/);
 const rank=scoreKitSeoTitle(parsed.titles[0].title,[{name:'Elefante Musical'},{name:'Chocalho'}]);
 assert(Number.isInteger(rank.score)&&rank.score>=0&&rank.score<=100);
 assert.match(rank.note,/não é ranking oficial/);
 assert.throws(()=>parseKitSeoResponse('TÍTULO: Único\nDESCRIÇÃO: curta'),/TÍTULO 1/);
});

test('descrição de kit Shopee mantém apenas uma separação entre seções',()=>{
 const raw=' ✨ Kit com elefante musical e bola chocalho.\r\n\r\n\r\n✅ BENEFÍCIOS\r\n\r\n🌈 Luzes e sons.\r\n\r\n🙌 Coordenação e diversão.\r\n\r\n💡 POR QUE COMPRAR\r\n\r\n🎁 Dois produtos em um kit.\r\n\r\n❓ DÚVIDAS FREQUENTES\r\n\r\n👶 Qual a idade indicada?\r\n\r\nConsulte a indicação dos produtos.\r\n\r\n🛒 Confira os componentes.';
 const expected=[
  '✨ Kit com elefante musical e bola chocalho.','','✅ BENEFÍCIOS',
  '🌈 Luzes e sons.','🙌 Coordenação e diversão.','','💡 POR QUE COMPRAR',
  '🎁 Dois produtos em um kit.','','❓ DÚVIDAS FREQUENTES',
  '👶 Qual a idade indicada?','Consulte a indicação dos produtos.',
  '','🛒 Confira os componentes.'
 ].join('\n');
 assert.equal(formatKitShopeeDescription(raw),expected);
 assert.equal(formatKitShopeeDescription(expected),expected,'a formatação deve ser idempotente');
 assert.doesNotMatch(expected,/\n{3,}/);
 const titleLines=[
  'TÍTULO 1: Kit Elefante Musical com Torre e Bola Chocalho Infantil',
  'TÍTULO 2: Brinquedos para Bebê Kit Chocalho e Elefante Musical',
  'TÍTULO 3: Kit Infantil Elefante com Música e Bola Chocalho'
 ];
 const imported=parseKitSeoResponse(titleLines.map(x=>x.replace(/^(TÍTULO \d: )(.+)$/,(_,prefix,title)=>prefix+validSeoTitle(title))).join('\n')+'\nDESCRIÇÃO:\n'+raw);
 assert.equal(imported.description,expected,'o importador compacta antes de salvar');
});

test('cópia de bloco Escrita do ChatGPT com 3 títulos e descrição é importada',async()=>{
 const {kitSeoRiskFlags}=await import('../public/kit-seo-helper.js');
 const source='Escrita\n\n**TÍTULO 1:** Kit Elefante Brincalhão Musical com Luzes + Torre Chocalho 🐘 🎶\n\n'+
  '**TÍTULO 2:** Kit Infantil Sensorial Elefante e Torre com Bola Chocalho 🐘 ✨\n\n'+
  '**TÍTULO 3:** Kit Brinquedos para Bebê Elefante Musical e Torre com Chocalho 🎁 🐘\n\n'+
  '**DESCRIÇÃO:**\n\n✨ Kit com dois brinquedos para brincar.\n\n✅ BENEFÍCIOS\n• Elefante musical\n• Torre e bola chocalho\n\n💡 POR QUE COMPRAR\nDois componentes em um kit.\n\n📦 O QUE VAI NA EMBALAGEM\n1 de cada produto.';
 const prepared=source.replace(/(\*\*TÍTULO [123]:\*\* )([^\n]+)/g,(_,prefix,title)=>prefix+validSeoTitle(title));
 const parsed=parseKitSeoResponse(prepared);
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
  'class="kit-bar kit-section-heading kit-images-heading"'
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
 assert.match(browser,/RA_SITE_KIT_TEXT_FETCH/);
 assert.match(browser,/kitFetchGeneratedTextFromPonte\(kitSku,skus,products\)/);
 assert.match(browser,/parseKitSeoResponse\(\$\('#kitPlusTextResult'\)\.value\)/);
 assert.match(browser,/\$\('#kitDescription'\)\.value=result\.description/);
 assert.match(browser,/void saveDraft\(\)\.then/);
 assert.match(browser,/Ponte ChatGPT: localizando os 3 títulos/);
});

test('botão SEO encaminha o prompt completo pela Ponte mesmo com dados ausentes',async()=>{
 const {readFileSync}=await import('node:fs');
 const browser=readFileSync(new URL('../public/kit-builder.js',import.meta.url),'utf8');
 const begin=browser.indexOf('async function plusText('),end=browser.indexOf('function kitShowSeoTitles(',begin);
 const fn=browser.slice(begin,end);
 assert.match(fn,/kitContentHandoff\(data\.prompt\)/);
 assert.match(fn,/kitContentReadManual\(\)/);
 assert.doesNotMatch(fn,/tab\?\.close\(\)/);
 assert.doesNotMatch(fn,/window\.open\(/);
 assert.match(browser,/requestKitContent\(\{kitSku,prompt\}/);
});
test('prompt combinado cobre as três SKUs e dados separados por componente',async()=>{
 const {kitContentBrief}=await import('../shopeeKitBuilder.js');
 const kit={kitSku:'KIT-CAFE-CANECA-ACUCAR',components:[
  {sku:'CAF1',name:'Cafeteira',description:'Preparo de café',category:'Cozinha'},
  {sku:'CAN2',name:'Canecas de vidro',description:'Servir',category:'Cozinha'},
  {sku:'ACU3',name:'Açucareiro',description:'Açúcar',category:'Cozinha'}
 ]};
 const facts={CAF1:'Capacidade 300 ml',CAN2:'Altura 8 cm',ACU3:'Largura 10 cm'};
 const result=kitContentBrief(kit,{manualFacts:facts});
 assert.equal(result.components.length,3);
 assert.match(result.prompt,/TODOS os 3 componentes devem estar representados em CADA título/);
 assert.match(result.prompt,/1 unidade de CADA COMPONENTE/);
 for(const part of kit.components){assert.ok(result.prompt.includes('SKU '+part.sku));assert.ok(result.prompt.includes(facts[part.sku]));}
 assert.equal(result.imagePrompts.length,9);
});

test('pesquisa SEO usa três SKUs e apresenta cinco termos sem inventar volume',async()=>{
 const {summarizeKitSeoEvidence}=await import('../shopeeKitSeoResearch.js');
 const components=[
  {sku:'103006',name:'Cafeteira Italiana Inox 3 Xícaras'},
  {sku:'CO6968126',name:'Conjunto com Canecas 6 Peça Vidro Expresso 70ml'},
  {sku:'TRC7085',name:'Açucareiro de aço inox com colher 220ml'}];
 const data=summarizeKitSeoEvidence(components,[
  {status:'verified',sample:[{title:'Cafeteira Italiana Inox 3 Xicaras',url:'https://shopee.com.br/product/123/456'}]},
  {status:'verified',sample:[{title:'Canecas Vidro Expresso 70ml',url:'https://shopee.com.br/product/987/654'}]},
  {status:'missing',sample:[]}]);
 assert.equal(data.candidates.length,5);
 assert.equal(data.products.length,3);
 assert.equal(data.searchVolumeAvailable,false);
 assert.equal(data.isOfficialSearchRanking,false);
 assert.equal(data.observedOffers,2);
 assert.deepEqual(data.candidates.slice(0,3).map(x=>x.sku),['103006','CO6968126','TRC7085']);
 const {kitContentBrief}=await import('../shopeeKitBuilder.js');
 const prompt=kitContentBrief({kitSku:'KIT-103006-CO6968126-TRC7085',components},{manualFacts:{
  '103006':'altura 10 cm e largura 12 cm',
  'CO6968126':'capacidade 70 ml',
  'TRC7085':'açucareiro inox com colher e capacidade 220ml'},keywordResearch:data}).prompt;
 assert.match(prompt,/PESQUISA OBRIGATÓRIA NA SHOPEE POR SKU/);
 assert.match(prompt,/Ordene exatamente CINCO expressões-chave/);
 assert.match(prompt,/pesquisaStatus: unverified/);
 for(const p of components)assert.match(prompt,new RegExp('SKU '+p.sku));
 assert.match(prompt,/https:\/\/shopee\.com\.br\/product\/123\/456/);
 const html=(await import('node:fs')).readFileSync(new URL('../public/index.html',import.meta.url),'utf8');
 assert.match(html,/id="kitSeoMarketDetails"/);
});

test('botão azul recupera automaticamente a resposta por Ponte, sem abrir área manual',async()=>{
 const {readFileSync}=await import('node:fs');
 const ui=readFileSync(new URL('../public/kit-builder.js',import.meta.url),'utf8');
 const html=readFileSync(new URL('../public/index.html',import.meta.url),'utf8');
 const start=ui.indexOf('async function kitImportCopiedContent()');
 const end=ui.indexOf('function kitPasteSeoReply(',start);
 const body=ui.slice(start,end);
 assert.match(body,/kitFetchGeneratedTextFromPonte\(kitSku,skus,products\)/);
 assert.match(body,/parseKitSeoResponse\(response\.rawText\)/);
 assert.match(body,/importPlusText\(\)/);
 assert.match(body,/bridgeIdentityError/);
 assert.doesNotMatch(body,/kitShowPasteSeoReply/);
 assert.match(ui,/RA_EXTENSION_KIT_TEXT_RESULT/);
 assert.match(ui,/RA_SITE_KIT_TEXT_FETCH/);
 assert.match(ui,/kitShowSeoTitles\(scored\)/);
 assert.match(ui,/\$\('#kitDescription'\)\.value=result\.description/);
 assert.match(html,/3 títulos com notas SEO/);
});
test('abrir ChatGPT não sobrescreve a resposta na área de transferência',async()=>{
 const {readFileSync}=await import('node:fs');
 const browser=readFileSync(new URL('../public/kit-builder.js',import.meta.url),'utf8');
 const handoff=browser.slice(browser.indexOf('function kitContentHandoff('),
  browser.indexOf('function kitContentReadManual(',browser.indexOf('function kitContentHandoff(')));
 assert.doesNotMatch(handoff,/navigator\.clipboard\.writeText\(prompt\)/);
 assert.match(browser,/kitShowSeoTitles\(scored\)/);
 assert.match(browser,/scoreKitSeoTitle\(x\.title,prepared\.kit\.components\)/);
 assert.match(browser,/\$\('#kitDescription'\)\.value=result\.description/);
 assert.match(browser,/RA_SITE_KIT_TEXT_FETCH/);
});

test('Ponte v1.0.61 recebe nomes separados das 3 SKUs e preserva validação SEO',async()=>{
 const {readFileSync}=await import('node:fs');
 const ui=readFileSync(new URL('../public/kit-builder.js',import.meta.url),'utf8');
 assert.match(ui,/parts\[2\]>=61/);
 assert.match(ui,/products=prepared\.kit\.components\.map/);
 assert.match(ui,/payload:\{nonce,kitSku,skus,products\}/);
 assert.match(ui,/parseKitSeoResponse\(response\.rawText\)/);
 assert.match(ui,/kitShowSeoTitles\(scored\)/);
});

test('fichas dos SKUs recolhidas por padrão e íntegros os dados e prints',async()=>{
 const {readFileSync}=await import('node:fs');
 const html=readFileSync(new URL('../public/index.html',import.meta.url),'utf8');
 const css=readFileSync(new URL('../public/kit-builder.css',import.meta.url),'utf8');
 const js=readFileSync(new URL('../public/kit-builder.js',import.meta.url),'utf8');
 const start=html.indexOf('<details id="kitMissingFacts"');
 const end=html.indexOf('</details>',start);
 assert.ok(start>0&&end>start);
 const block=html.slice(start,end);
 assert.match(block,/<summary class="kit-missing-title kit-facts-summary">/);
 assert.match(block,/Mostrar informações/);
 assert.match(block,/Ocultar informações/);
 assert.doesNotMatch(block.slice(0,160),/\sopen(?:\s|=|>)/);
 for(const id of ['kitMissingFactFields','kitContinueContent','kitSaveSkuFacts']){
  assert.equal(html.split('id="'+id+'"').length-1,1);
  assert.match(block,new RegExp('id="'+id+'"'));
 }
 assert.match(css,/kit-facts-summary:focus-visible/);
 assert.match(css,/kitMissingFacts:not\(\[open\]\)/);
 assert.match(js,/\$\('#kitMissingFacts'\)\.open=false/);
 assert.match(js,/factsPanel\.open=true/);
 assert.match(js,/function kitContentReadManual\(\)/);
 assert.match(js,/recognizeKitLogisticsPrint\(photo/);
 assert.match(js,/kitContentManualFacts\.set\(sku,box\.value\)/);
});

test('botão de recolher todo o bloco de títulos e descrição mantém editores e opções SEO intactos',async()=>{
 const {readFileSync}=await import('node:fs');
 const html=readFileSync(new URL('../public/index.html',import.meta.url),'utf8');
 const js=readFileSync(new URL('../public/kit-builder.js',import.meta.url),'utf8');
 const css=readFileSync(new URL('../public/kit-builder.css',import.meta.url),'utf8');
 const start=html.indexOf('id="kitCopyContentPanel"');
 const end=html.indexOf('</section>\n  <details id="kitMissingFacts"',start);
 assert.ok(start>0&&end>start,'editor agrupado antes das fichas por SKU');
 const section=html.slice(start,end);
 for(const id of ['kitTitle','kitDescription','kitPlusText','kitImportCopiedText',
  'kitSeoOptions','kitSeoOptionList','kitSaveSeoContent','kitContentDetails']){
  assert.ok(section.includes('id="'+id+'"'),'campo preservado: '+id);
  assert.equal(html.split('id="'+id+'"').length-1,1,'ID único: '+id);
 }
 assert.ok(!section.includes('id="kitMissingFacts"'),'fichas SKU fora do recolhimento');
 assert.match(html,/id="kitToggleCopyContent"[^>]*aria-controls="kitCopyContentPanel"[^>]*aria-expanded="true"/);
 assert.match(html,/Ocultar todo o bloco/);
 assert.match(js,/panel\.hidden=Boolean\(collapsed\)/);
 assert.match(js,/button\.setAttribute\('aria-expanded',String\(!collapsed\)\)/);
 assert.match(js,/kitSetCopyContentCollapsed\(!\$\('#kitCopyContentPanel'\)\.hidden\)/);
 assert.match(js,/kitShowSeoTitles\(scored\)/);
 assert.match(js,/\$\('#kitDescription'\)\.value=result\.description/);
 assert.match(css,/#tab-kits #kitDetail #kitCopyContentPanel\[hidden\]\{display:none!important\}/);
});

test('personalizar composição tem botão destacado para ocultar sem alterar SKUs e cálculos',async()=>{
 const {readFileSync}=await import('node:fs');
 const html=readFileSync(new URL('../public/index.html',import.meta.url),'utf8');
 const css=readFileSync(new URL('../public/kit-builder.css',import.meta.url),'utf8');
 const js=readFileSync(new URL('../public/kit-builder.js',import.meta.url),'utf8');
 const start=html.indexOf('id="kitCompositionContent"');
 const end=html.indexOf('</section>',start);
 assert.ok(start>=0&&end>start);
 const section=html.slice(start,end);
 for(const id of ['kitManualComposition','kitManualStatus']){
  assert.equal(html.split('id="'+id+'"').length-1,1);
  assert.ok(section.includes('id="'+id+'"'));
 }
 assert.match(html,/id="kitToggleComposition"[^>]*aria-controls="kitCompositionContent"[^>]*aria-expanded="true"/);
 assert.match(js,/function kitSetCompositionCollapsed\(collapsed\)/);
 assert.match(js,/panel\.hidden=Boolean\(collapsed\)/);
 assert.match(js,/kitSetCompositionCollapsed\(!\$\('#kitCompositionContent'\)\.hidden\)/);
 assert.match(js,/kitManualControls\(kit,\{editor:true\}\)/);
 assert.match(css,/#tab-kits #kitDetail #kitCompositionContent\[hidden\]\{display:none!important\}/);
});
