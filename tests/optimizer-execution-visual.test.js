import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
const html=readFileSync(new URL('../public/index.html',import.meta.url),'utf8');
const css=readFileSync(new URL('../public/optimizer-execution-progress.css',import.meta.url),'utf8');
const app=readFileSync(new URL('../public/app.js',import.meta.url),'utf8');
const visual=readFileSync(new URL('../public/optimizer-execution-visual.js',import.meta.url),'utf8');
const sandbox={document:{getElementById:()=>null}};
sandbox.globalThis=sandbox;
vm.runInNewContext(visual,sandbox,{filename:'optimizer-execution-visual.js'});
const {derive,phaseFromServer,phaseFromEvent}=sandbox.RAExecutionVisual;
test('layout anterior realmente aparece na tela de execução com nove ícones e histórico',()=>{
 const area=html.slice(html.indexOf('id="optimizerExecutionVisual"'),html.indexOf('id="optimizerExecutionLivePhase"'));
 for(const id of ['optimizerVisualCount','optimizerVisualPercent','optimizerVisualBar',
  'optimizerVisualCurrentIcon','optimizerVisualCurrentTitle','optimizerVisualCurrentDetail',
  'optimizerExecutionVisualHistory'])
  assert.ok(area.includes('id="'+id+'"'),id);
 assert.match(css,/\.ra-visual-hero/);
 assert.match(css,/\.ra-visual-stage-track/);
 assert.match(css,/\.ra-visual-current/);
 assert.match(css,/\.ra-visual-history/);
 assert.match(css,/@media\(max-width:760px\)/);
 assert.match(html,/optimizer-execution-visual\.js\?v=/);
 assert.ok(html.indexOf('optimizer-execution-visual.js?v=')<html.indexOf('/app.js?v='));
 assert.match(app,/function optimizerExecutionVisualPaint\(/);
 assert.match(app,/RAExecutionVisual\?\.render\?\.\(/);
});
test('prévia preparada não recebe porcentagem nem fases verdes inventadas',()=>{
 const state=derive({job:{state:'prepared'},progress:{state:'prepared',percent:90,hasStarted:false,hasSavedProgress:false}});
 assert.equal(state.percent,0);
 assert.equal(state.completed,0);
 assert.ok(state.states.every(s=>s==='waiting'));
 assert.match(state.title,/Prévia pronta/);
});
test('vídeo real em upload destaca somente vídeo e distingue mídia de publicação',()=>{
 const state=derive({
  job:{state:'running',result:{phase:'video_upload'}},
  progress:{percent:12,hasStarted:true,imagesTotal:9,imagesUploaded:9,imagesPublished:0,
   message:'Enviando vídeo à mídia',steps:[{id:'images',status:'staged'},{id:'video',status:'active'},
    {id:'seo',status:'waiting'},{id:'description',status:'waiting'}]},
  eventTitle:'5. Execução aceita pelo servidor'
 });
 assert.equal(state.active,1);
 assert.equal(state.title,'Enviando vídeo');
 assert.equal(state.percent,12);
 assert.equal(state.states[0],'staged');
 assert.equal(state.states[1],'active');
 assert.equal(state.states[2],'waiting');
 assert.ok(state.mediaInfo.includes('0 publicadas no anúncio'));
 assert.ok(state.completed<9);
});
test('falha e estado incerto nunca aparecem como confirmação da Shopee',()=>{
 const base={progress:{percent:35,hasStarted:true,steps:[{id:'video',status:'active'}]}};
 const failed=derive({...base,job:{state:'failed',result:{phase:'video_upload'}}});
 const uncertain=derive({...base,job:{state:'uncertain',result:{phase:'video_upload'}}});
 assert.equal(failed.states[1],'error');
 assert.notEqual(uncertain.states[1],'done');
 assert.match(failed.title,/interrompida/);
 assert.match(uncertain.title,/Aguardando confirmação/);
});
test('verificação final de job parcial não finge que título, descrição ou desconto foram publicados',()=>{
 const out=derive({job:{state:'verified',result:{phase:'verified'}},progress:{
  percent:100,hasStarted:true,steps:[{id:'images',status:'done'},
   {id:'seo',status:'skipped'},{id:'description',status:'skipped'}]}});
 assert.equal(out.percent,100);
 assert.equal(out.states[2],'waiting');
 assert.equal(out.states[3],'waiting');
 assert.equal(out.states[7],'waiting');
 assert.equal(out.states[8],'done');
 assert.ok(out.completed<9);
});
test('etapas reais Shopee são reconhecidas sem criar nova requisição',()=>{
 assert.equal(phaseFromServer({state:'running',result:{phase:'video_upload'}},{}),1);
 assert.equal(phaseFromServer({state:'running',result:{phase:'images_upload'}},{}),0);
 assert.equal(phaseFromServer({state:'running',result:{phase:'verifying'}},{}),8);
 assert.equal(phaseFromEvent('1. Conferindo a prévia salva'),-1);
 assert.equal(phaseFromEvent('5. Execução aceita pelo servidor'),-1);
 assert.equal(phaseFromEvent('Sem concorrentes verificados: validar margem e desconto'),7);
 assert.equal(phaseFromServer({state:'running',result:{phase:'model_discount_updating'}},{}),7);
 assert.ok(!visual.includes('fetch('),'visualização não deve acessar a rede');
 assert.ok(!visual.includes('XMLHttpRequest'),'visualização não deve enviar alterações');
});

test('falha de desconto não reverte imagens já confirmadas nem finge publicação do desconto',()=>{
 const state=derive({
  job:{state:'failed',result:{phase:'discount_verifying'},last_error:'Sem concorrentes verificados: margem e desconto'},
  progress:{state:'failed',percent:83,hasStarted:true,imagesTotal:9,imagesUploaded:9,
   imagesPublished:9,steps:[{id:'images',status:'done'},{id:'discount',status:'active'}]}
 });
 assert.equal(state.percent,83);
 assert.equal(state.states[0],'done');
 assert.equal(state.states[7],'error');
 assert.equal(state.states[8],'waiting');
 assert.ok(state.completed<9);
 assert.match(state.detail,/Sem concorrentes/);
});
