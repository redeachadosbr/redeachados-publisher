import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const script=readFileSync(new URL('../public/optimizer-image-studio.js',import.meta.url),'utf8');
const html=readFileSync(new URL('../public/index.html',import.meta.url),'utf8');

test('compact studio retains four visible image actions and original handlers',()=>{
 const controls=[
  ['Trocar imagem','optimizerImageCorrectionChoose'],
  ['Editar orientação','optimizerImageEditOrientation'],
  ['Melhorar com IA','optimizerImageImproveAI'],
  ['Remover fundo','optimizerImageRemoveBackground']
 ];
 assert.match(script,/originalEditToolbar\.style\.display='none'/);
 for(const [label,id] of controls){
  assert.ok(script.includes(label),'Missing visible label: '+label);
  assert.ok(script.includes("dispatchOriginalAction('"+id+"'"),'Missing handler: '+label);
  assert.ok(html.includes('id="'+id+'"'),'Missing native button: '+label);
 }
 assert.doesNotMatch(script,/quick\.append\(button\)/);
 assert.match(script,/quick\.dataset\.actionCount=String\(quick\.querySelectorAll\('button'\)\.length\)/);
});
