import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {buildKitPlusImageBrief,kitPlusPromptLink} from '../public/kit-plus-image-brief.js';
const kit={kitSku:'KIT-278CHOCALHO-310200',components:[
 {sku:'310200',name:'Elefante Brincalhão Musical',imageUrl:'https://files.example.com/elefante.jpg',description:'Brinquedo com música',dimensions:'20 cm'},
 {sku:'278CHOCALHO',name:'Torre e Bola Chocalho',imageUrl:'https://files.example.com/torre.jpg'}
]};
test('geração ChatGPT Plus envia pedido de imagens, não só prompt explicativo',()=>{
 const p=buildKitPlusImageBrief(kit,{manualFacts:{'278CHOCALHO':'Medida 19 cm'}});
 assert.match(p,/GERE AGORA A IMAGEM 01/i);
 assert.match(p,/NÃO de redação de prompts/i);
 assert.match(p,/TODOS OS 2 SKUs/);
 for(let n=1;n<=9;n++)assert.match(p,new RegExp(String(n).padStart(2,'0')+' (?:CAPA|USO REAL|ESPECIFICAÇÕES|BENEFÍCIOS|DOR E SOLUÇÃO|PERSUASÃO|TRANSFORMAÇÃO|QUEBRA DE OBJEÇÕES|MOCKUP)'));
 assert.match(p,/19 cm/);
 assert.match(p,/https:\/\/files.example.com\/elefante.jpg/);
 assert.match(p,/Se a interface gerar apenas uma imagem por mensagem/);
});
test('link de transferência do texto oferece prefill e fallback seguro',()=>{
 const prompt=buildKitPlusImageBrief(kit);
 const url=kitPlusPromptLink(prompt);
 assert(url.startsWith('https://chatgpt.com/?prompt='));
 assert.equal(kitPlusPromptLink('x'.repeat(9000)),'https://chatgpt.com/');
});
test('modo Plus e Ponte continuam funcionais sem seção redundante de pasta',()=>{
 const html=fs.readFileSync(new URL('../public/index.html',import.meta.url),'utf8');
 const js=fs.readFileSync(new URL('../public/kit-builder.js',import.meta.url),'utf8');
 for(const id of ['kitGenerateAll','kitPlusImagePrompt','kitPlusNextImagePrompt','kitPlusGenerationStatus','kitImportImages'])
  assert(html.includes('id="'+id+'"'));
 assert.match(js,/kitPlusPromptLink\(prompt\)/);
 assert.match(js,/window.open\(url,'_blank'/);
 assert.doesNotMatch(js,/kitStartAutoFolder|kitStopAutoFolder/);
 assert.match(html,/class="kit-generation-mode kit-generation-auto" hidden/);
});
