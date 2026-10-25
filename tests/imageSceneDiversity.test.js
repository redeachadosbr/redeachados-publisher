import test from 'node:test';
import assert from 'node:assert/strict';
import {imageSceneDirection,imageScenePrompt,imageProductFamily} from '../public/imageSceneDiversity.js';
import {createChatGptPrompts} from '../public/chatgptPrompts.js';
import {imagePrompt} from '../shopeeOpenAiImages.js';

test('bicicleta 2392: nove ambientes e perspectivas diferentes e três crianças distintas',()=>{
 const title='Bicicleta Infantil Moto Cross Aro 16 Rosa';
 assert.equal(imageProductFamily(title),'bicycle');
 const list=Array.from({length:9},(_,i)=>imageSceneDirection({slot:i+1,title}));
 for(const key of ['environment','camera','light']){
  assert.equal(new Set(list.map(x=>x[key])).size,9,key+' precisa variar nas 9 imagens');
 }
 assert.match(list[1].people,/Criança A.*capacete claro/);
 assert.match(list[4].people,/Criança B.*capacete amarelo/);
 assert.match(list[6].people,/Criança C.*capacete escuro/);
 assert.match(list[2].people,/Sem personagens/);
 assert.equal(list[0].environment.includes('garagem'),false); // Ambiente arquitetônico, não o mesmo parque
 for(const x of list){
  const p=imageScenePrompt({slot:x.slot,title});
  assert.match(p,/A FOTO DE REFERÊNCIA serve apenas para preservar o PRODUTO EXATO/);
  assert.match(p,/Não reutilize o mesmo fundo/);
  assert.match(p,/NÃO|Não inventar/);
 }
});
test('variedade adapta ambientes por categoria sem colocar bicicletas em produtos de cozinha',()=>{
 for(const [title,family] of [
  ['Garrafa Térmica 900ml','kitchen'],['Porta Shampoo','home'],
  ['Jogo de Chaves 40 Peças','tools'],['Bloco de Montar Magnético','toys'],
  ['Produto desconhecido','general']
 ]){
  assert.equal(imageProductFamily(title),family);
  const directions=Array.from({length:9},(_,i)=>imageSceneDirection({slot:i+1,title}));
  assert.equal(new Set(directions.map(x=>x.environment)).size,9);
  assert.equal(new Set(directions.map(x=>x.camera)).size,9);
  assert(!directions.some(x=>/bicicleta|Criança A com capacete/.test(x.environment)));
 }
});
test('nova geração API e ChatGPT usam a mesma direção para SKU 2392',()=>{
 const title='Bicicleta Infantil Moto Cross Aro 16 Rosa';
 const {prompts}=createChatGptPrompts({title});
 const rec={sku:'2392',title,attributeAudit:{attributes:[]}};
 for(let slot=1;slot<=9;slot++){
  const scene=imageSceneDirection({slot,title});
  const a=prompts[slot-1];
  const b=imagePrompt({record:rec,slot});
  assert(a.includes(scene.environment),slot+' ChatGPT deve ter ambiente exclusivo');
  assert(b.includes(scene.environment),slot+' API deve ter ambiente exclusivo');
  assert(a.includes(scene.camera),slot+' ChatGPT deve ter câmera exclusiva');
  assert(b.includes(scene.camera),slot+' API deve ter câmera exclusiva');
 }
 const edited=imagePrompt({record:rec,slot:2,hasPreparedReference:true});
 assert.match(edited,/EDIÇÃO LOCAL SOLICITADA/);
 assert.doesNotMatch(edited,/AMBIENTE EXCLUSIVO/);
});
