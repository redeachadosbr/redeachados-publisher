import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createChatGptPrompts,assignChatGptFiles,CHATGPT_IMAGE_SCENES} from '../public/chatgptPrompts.js';

test('nove prompts independentes com cenários e câmeras diferentes por produto',()=>{
 const brief=createChatGptPrompts({
  sku:'2392',title:'Bicicleta Infantil Moto Cross Aro 16 Rosa',
  supplierSourceText:'Dimensões: 75cm altura x 63cm largura x 117cm comprimento',
  imageUrls:['https://down-br.img.susercontent.com/file/xyz']
 });
 assert.equal(CHATGPT_IMAGE_SCENES.length,9);
 assert.equal(brief.prompts.length,9);
 assert.equal(brief.batch,brief.prompts[0]);
 assert.equal(brief.original,'https://down-br.img.susercontent.com/file/xyz');
 const environments=brief.prompts.map(p=>p.match(/AMBIENTE EXCLUSIVO: ([^\\n]+)/)?.[1]);
 assert.equal(new Set(environments).size,9);
 for(let i=0;i<9;i++){
  assert.match(brief.prompts[i],new RegExp('CENA ÚNICA '+String(i+1).padStart(2,'0')+'/09'));
  assert.match(brief.prompts[i],/ÂNGULO E ENQUADRAMENTO:/);
  assert.match(brief.prompts[i],/preservar o PRODUTO EXATO/);
 }
 assert.match(brief.prompts[1],/Criança A/);
 assert.match(brief.prompts[4],/Criança B/);
 assert.match(brief.prompts[6],/Criança C/);
 assert.match(brief.prompts[2],/ALTURA: 75 cm/);
 assert.match(brief.prompts[2],/LARGURA: 63 cm/);
 assert.match(brief.prompts[2],/COMPRIMENTO: 117 cm/);
 assert.match(brief.prompts[8],/Compra Segura, Entrega Rápida e Atendimento Online/);
});
test('arquivos numerados mapeiam os slots corretos independentemente da ordem de seleção',()=>{
 const input=[{name:'09.png'},{name:'02.webp'},{name:'01.png'}];
 const out=assignChatGptFiles(input);
 assert.deepEqual(out.map(x=>x.slot),[1,2,9]);
 assert.deepEqual(out.map(x=>x.file.name),['01.png','02.webp','09.png']);
 assert.throws(()=>assignChatGptFiles([{name:'01.png'},{name:'1.jpg'}]),/repetidas/);
 assert.throws(()=>assignChatGptFiles([{name:'01.png'},{name:'semnumero.png'}]),/parte dos arquivos/);
 assert.deepEqual(assignChatGptFiles([{name:'a.png'},{name:'b.png'}],{startSlot:6}).map(x=>x.slot),[6,7]);
 assert.throws(()=>assignChatGptFiles([{name:'a.png'},{name:'b.png'}],{startSlot:9}),/ultrapassam/);
});
test('layout oferece escolha ChatGPT independente de API e mantém prévia antes de enviar',()=>{
 const html=readFileSync(new URL('../public/index.html',import.meta.url),'utf8');
 const js=readFileSync(new URL('../public/app.js',import.meta.url),'utf8');
 for(const id of ['optimizerImagesChatgptPanel','optimizerImagesApiPanel','optimizerChatgptAuto',
  'optimizerModeApi','optimizerChatgptOpen','optimizerChatgptCopyAll','optimizerChatgptPromptList',
  'optimizerChatgptFiles','optimizerChatgptImport','optimizerChatgptImportStatus']){
  assert.equal((html.match(new RegExp('id="'+id+'"','g'))||[]).length,1,id);
 }
 assert.match(js,/const mode=optimizerImagesMode\|\|'chatgpt'/);
 assert.match(js,/optimizerChatgptScaleFile/);
 assert.match(js,/prepareSquareImage\(file\)/);
 assert.match(js,/api\/shopee\/optimizer\/images\/manual/);
});
