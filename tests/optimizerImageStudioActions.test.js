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

const app=readFileSync(new URL('../public/app.js',import.meta.url),'utf8');

test('permite mover imagens depois de importar ou falhar ao colar uma imagem',()=>{
 const start=app.indexOf('async function optimizerImageCorrectionImportFile(');
 const end=app.indexOf("$('#optimizerImageCorrectionChoose')?.addEventListener",start);
 const importer=app.slice(start,end);
 assert.ok(start>0&&end>start,'Rotina de importação não encontrada');
 const finallyIndex=importer.lastIndexOf('}finally{');
 assert.ok(finallyIndex>0,'A importação precisa liberar as operações no finally');
 assert.doesNotMatch(importer.slice(0,finallyIndex),/await optimizerImagesLoad\(\)/,
  'Não renderizar galeria enquanto o indicador de importação ainda está ocupado');
 assert.match(importer.slice(finallyIndex),/optimizerImagesAutoBusy=false;[\s\S]*await optimizerImagesLoad\(\)/,
  'Recarregar galeria após liberar o bloqueio inclusive quando falha');
 const progress=app.slice(app.indexOf('function optimizerImagesSetProgress()'),app.indexOf('// Result messages live OUTSIDE'));
 assert.match(progress,/select\.disabled=optimizerImagesAutoBusy/,
  'Todos os menus Mover para precisam desbloquear ao concluir a importação');
 assert.match(script,/menu\.addEventListener\('toggle'/,
  'Abrir o menu de ações não pode ativar o arrastar do cartão');
});
