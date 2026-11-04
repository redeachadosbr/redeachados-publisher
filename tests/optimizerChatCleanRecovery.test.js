import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const app=readFileSync(new URL('../public/app.js',import.meta.url),'utf8');
const html=readFileSync(new URL('../public/index.html',import.meta.url),'utf8');
const css=readFileSync(new URL('../public/optimizer-image-studio.css',import.meta.url),'utf8');

test('NOVO_CHAT_NAO_LIMPO pauses safely without deleting stored images',()=>{
 const start=app.indexOf("const RA_BRIDGE_CHAT_PAUSE_KEY=");
 const end=app.indexOf('// A identificação é compartilhada',start);
 assert(start>0&&end>start);
 const recovery=app.slice(start,end);
 assert.match(recovery,/NOVO_CHAT_NAO_LIMPO/);
 assert.match(recovery,/optimizerChatBridgeIdentity\(w,job\)/);
 assert.match(recovery,/optimizerChatgptContinueFromServer\(\)/);
 assert.doesNotMatch(recovery,/method:'DELETE'|restart:true|RA_SITE_ABORT|RA_SITE_UPLOAD_RESULT/);
 assert.match(app,/if\(m.kind==='RA_EXTENSION_PROGRESS'\)\{\s*optimizerBridgeChatPauseMark\(m\)/);
 assert.match(app,/if\(m.kind==='RA_EXTENSION_WAKE_RESULT'\)\{\s*if\(!m.ok\)\{optimizerBridgeChatPauseMark\(m\)/);
});

test('recovery is visible and requires explicit user confirmation of clean ChatGPT composer',()=>{
 for(const id of ['optimizerChatgptCleanRecovery','optimizerChatgptCleanRecoveryMessage',
  'optimizerChatgptOpenCleanChat','optimizerChatgptResumeCleanChat'])
  assert.match(html,new RegExp('id="'+id+'"'));
 assert.match(app,/window.confirm\('Você abriu um NOVO chat/);
 assert.match(app,/window.open\('https:\/\/chatgpt.com\//);
 assert.match(css,/\.optimizer-chat-clean-recovery\[hidden\]/);
});

test('saved image count and first missing slot remain source of truth',()=>{
 assert.match(app,/optimizerImagesSavedSlots=new Set\(stored.keys\(\)\);\s*optimizerBridgeChatPausePaint\(\)/);
 assert.match(app,/optimizerBridgeChatPauseClear\(\);\s*try\{/);
 const fromServer=app.slice(app.indexOf('async function optimizerChatgptContinueFromServer()'),
  app.indexOf('globalThis.__RA_SHOPEE_RESUME_BRIDGE='));
 assert.match(fromServer,/api\/shopee\/optimizer\/images\/manual\?/);
 assert.match(fromServer,/completed:stored/);
 assert.doesNotMatch(fromServer,/method:'DELETE'/);
});
