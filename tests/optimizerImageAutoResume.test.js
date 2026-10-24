import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const app=readFileSync(new URL('../public/app.js',import.meta.url),'utf8');
const html=readFileSync(new URL('../public/index.html',import.meta.url),'utf8');

const slotsFromServer=rows=>{
 const saved=new Set(rows.map(r=>Number(r.slot)).filter(n=>Number.isInteger(n)&&n>=1&&n<=9));
 return Array.from({length:9},(_,i)=>i+1).filter(n=>!saved.has(n));
};

test('retomada automática identifica a primeira posição realmente vazia (mesmo com lacunas)',()=>{
 assert.deepEqual(slotsFromServer([{slot:1}]),[2,3,4,5,6,7,8,9]);
 assert.deepEqual(slotsFromServer([{slot:1},{slot:3},{slot:5}]),[2,4,6,7,8,9]);
 assert.deepEqual(slotsFromServer(Array.from({length:9},(_,i)=>({slot:i+1}))),[]);
 assert.deepEqual(slotsFromServer([]),[1,2,3,4,5,6,7,8,9]);
});

test('botão principal executa a retomada diretamente, sem proxy oculto',()=>{
 assert.match(html,/id="optimizerChatgptAuto"[^>]*>[^<]*Gerar \/ continuar automaticamente/);
 assert.match(html,/id="optimizerChatgptRestartAll"/);
 assert.match(app,/async function optimizerChatgptContinueFromServer\(\)/);
 assert.match(app,/\$\('#optimizerChatgptAuto'\)\?\.addEventListener\?\.\('click',\(\)=>void optimizerChatgptContinueFromServer\(\)\)/);
 assert.doesNotMatch(app,/resume\.click\(\)/);
 const handler=app.slice(app.indexOf('async function optimizerChatgptContinueFromServer'),app.indexOf("$('#optimizerChatgptAbort')?.addEventListener"));
 assert.match(handler,/Consultando a primeira posição pendente diretamente no servidor/);
 assert.match(handler,/optimizerChatgptContinueBusy/);
 assert.doesNotMatch(handler,/method:'DELETE'|restart:true/);
});

test('retomada consulta sempre banco e informa slots confirmados para a Ponte',()=>{
 const start=app.indexOf('async function optimizerChatgptContinueFromServer()');
 const end=app.indexOf("$('#optimizerChatgptAbort')?.addEventListener",start);
 assert(start>0&&end>start,'handler de retomada ausente');
 const resume=app.slice(start,end);
 assert.match(resume,/api\/shopee\/optimizer\/images\/manual\?/);
 assert.match(resume,/const missing=Array\.from\(\{length:9\}/);
 assert.match(resume,/completed:stored,imageUrl:brief\.original,prompts:brief\.prompts/);
 assert.match(resume,/imageUrl:brief\.original,prompts:brief\.prompts,completed:stored/);
 assert.match(resume,/optimizerBridgeRecoverFromExtension/);
 assert.doesNotMatch(resume,/method:'DELETE'|restart:true/);
 assert(resume.indexOf('optimizerBridgeRecoverFromExtension')<resume.indexOf("if(recovered.ok)"));
});

test('painel oferece reinício completo apenas explicitamente, fora da ação principal',()=>{
 assert.match(html,/Recomeçar tudo desde a imagem 01 \(apaga fotos preparadas\)/);
 assert.match(html,/id="optimizerChatgptResume"[^>]*display:none/);
 const restart=app.slice(app.indexOf("$('#optimizerChatgptRestartAll')?.addEventListener"),
   app.indexOf('function optimizerBridgeRecoverFromExtension'));
 assert.match(restart,/method:'DELETE'/);
 assert.match(restart,/confirm\(/);
});
