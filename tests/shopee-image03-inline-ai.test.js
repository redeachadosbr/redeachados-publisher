import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createChatGptPrompts} from '../public/chatgptPrompts.js';
import {imagePrompt} from '../shopeeOpenAiImages.js';

const cases=[
 {sku:'PAT-01',title:'Patins Amarelo Infantil',facts:'Dimensões: 20cm altura x 22cm largura x 29cm comprimento',expected:['ALTURA: 20 cm','LARGURA: 22 cm','COMPRIMENTO: 29 cm']},
 {sku:'VAR-02',title:'Varal de Chão Dobrável Preto',facts:'Dimensões: 85cm altura x 46cm largura x 123cm comprimento',expected:['ALTURA: 85 cm','LARGURA: 46 cm','COMPRIMENTO: 123 cm']},
 {sku:'FON-03',title:'Fonte de Água',facts:'Dimensões: 20cm altura x 19cm diâmetro\nEmbalagem:\nDimensões: 14 x 21 x 21 cm',expected:['ALTURA: 20 cm','DIAMETRO: 19 cm']}
];
test('imagem 03 do ChatGPT inclui as cotas reais diretamente na arte para produtos diferentes',()=>{
 for(const item of cases){
  const browser=createChatGptPrompts({title:item.title,supplierSourceText:item.facts}).prompts[2];
  const api=imagePrompt({record:{sku:item.sku,title:item.title},slot:3,supplierSourceText:item.facts});
  for(const expected of item.expected){
   assert.ok(browser.includes(expected),item.sku+': '+expected+' ausente no ChatGPT');
   assert.ok(api.includes(expected),item.sku+': '+expected+' ausente na API');
  }
  assert.match(browser,/GERAR AGORA UMA IMAGEM/);
  assert.match(api,/DESENHE NA PRÓPRIA IMAGEM/);
  assert.doesNotMatch(api,/FOTO-BASE TOTALMENTE LIMPA|Manager desenhará as cotas/);
  assert.doesNotMatch(browser,/Shopee Manager adicionará somente dimensões/);
 }
});
test('API bloqueia imagem 03 sem medidas físicas confirmadas',()=>{
 assert.throws(()=>imagePrompt({record:{sku:'SKU-VAZIA',title:'Produto'},slot:3,
   supplierSourceText:'Embalagem:\nDimensões: 10 x 20 x 30 cm'}),/IMAGEM 03 NÃO GERADA/);
});
test('fluxo API não duplica as cotas com sobreposição local e força versão nova no navegador',()=>{
 const app=readFileSync(new URL('../public/app.js',import.meta.url),'utf8');
 const html=readFileSync(new URL('../public/index.html',import.meta.url),'utf8');
 const start=app.indexOf('async function optimizerAnnotateThirdGeneratedImage(');
 const end=app.indexOf('async function optimizerImagesGenerateSlot(',start);
 const validation=app.slice(start,end);
 assert.ok(start>0&&end>start);
 assert.doesNotMatch(validation,/addConfirmedSpecificationCard|\bbody:final\b/);
 assert.match(validation,/optimizerVerifiedDimensionSpec/);
 assert.match(app,/chatgpt-dimensoes-universal-v6/);
 assert.match(html,/image03=cotas-chatgpt-universal-v6/);
});
