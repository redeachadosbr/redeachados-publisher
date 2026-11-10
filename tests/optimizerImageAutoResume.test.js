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
 assert.match(resume,/const allMissing=Array\.from\(\{length:9\}/);
 assert.match(resume,/const missing=deferredThird\?allMissing\.filter/);
 assert.match(resume,/completed:bridgeCompleted,imageUrl:referenceUrl,prompts:brief\.prompts/);
 assert.match(resume,/imageUrl:referenceUrl,prompts:brief\.prompts,completed:bridgeCompleted/);
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

test('chat não limpo não reativa prompt antigo; sessão nova começa pelo próximo slot confirmado',()=>{
 const start=app.indexOf('async function optimizerChatgptContinueFromServer()');
 const end=app.indexOf('globalThis.__RA_SHOPEE_RESUME_BRIDGE',start);
 const source=app.slice(start,end);
 assert.match(app,/let optimizerChatgptCleanChatAuthorized=false/);
 assert.match(app,/optimizerChatgptCleanChatAuthorized=true/);
 assert.match(source,/const resumeDirty=Boolean\(pausedDirty&&optimizerChatBridgeIdentity\(pausedDirty,w\)\)/);
 assert.match(source,/resumeDirty&&!optimizerChatgptCleanChatAuthorized/);
 assert.match(source,/await optimizerChatBridgeRelease\('Chat novo confirmado/);
 assert.match(source,/recovered=\{reason:'NO_RECOVERABLE_JOB'\}/);
 assert.match(source,/completed:bridgeCompleted/);
 assert.doesNotMatch(source,/method:'DELETE'|restart:true/);
});
