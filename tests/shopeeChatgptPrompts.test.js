import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createChatGptPrompts,assignChatGptFiles,CHATGPT_IMAGE_SCENES} from '../public/chatgptPrompts.js';

test('modo ChatGPT monta as nove instruções para a SKU, respeita roteiro e imagens separadas',()=>{
 const brief=createChatGptPrompts({
  sku:'TRC1525',title:'Produto original TRC1525',
  masterPrompt:'Fundo galpão claro sem trocar o modelo',
  imageNotes:{5:'Destacar uso doméstico'},
  attributes:[{state:'filled',name:'Material',values:[{name:'Aço inoxidável'}]},
   {state:'missing',name:'Potência',values:[]}],
  imageUrls:['https://down-br.img.susercontent.com/file/xyz']
 });
 assert.equal(CHATGPT_IMAGE_SCENES.length,9);
 assert.equal(brief.prompts.length,9);
 assert.match(brief.batch,/TRC1525/);
 assert.match(brief.batch,/Fundo galpão claro/);
 assert.match(brief.batch,/Aço inoxidável/);
 assert.doesNotMatch(brief.batch,/Potência:/);
 assert.match(brief.batch,/01 \/ 09/);
 assert.match(brief.batch,/09 \/ 09/);
 assert.match(brief.batch,/01.png, 02.png/);
 assert.match(brief.prompts[0],/GERAR APENAS A IMAGEM 01/);
 assert.match(brief.prompts[8],/GERAR APENAS A IMAGEM 09/);
 assert.match(brief.prompts[4],/Destacar uso doméstico/);
 assert.match(brief.batch,/anexe a foto original/i);
 assert.equal(brief.original,'https://down-br.img.susercontent.com/file/xyz');
 assert.match(brief.prompts[0],/DIVERSIDADE OBRIGATÓRIA/);
 assert.match(brief.prompts[2],/MEDIDAS DO PRODUTO/);
 const backpack=createChatGptPrompts({sku:'TUD0667',title:'Super Mochila Construtor 3 em 1',
  imageUrls:['https://cf.shopee.com.br/file/original'],attributes:[]});
 assert.equal(backpack.prompts.length,9);
 assert.match(backpack.prompts[1],/DIMENSÕES/i);
 assert.match(backpack.prompts[2],/ANAMÓRFICA/i);
 assert.match(backpack.prompts[3],/DETALHES/i);
 assert.match(backpack.prompts[7],/EM USO/i);
 assert.notEqual(backpack.scenes[1].guide,backpack.scenes[3].guide);
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
 assert.match(js,/optimizerImagesMode=optimizerImagesApiConfigured\?'api':'chatgpt'/);
 assert.match(js,/optimizerChatgptScaleFile/);
 assert.match(js,/prepareSquareImage\(file\)/);
 assert.match(js,/api\/shopee\/optimizer\/images\/manual/);
});
