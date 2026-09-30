import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const app=fs.readFileSync(new URL('../public/app.js',import.meta.url),'utf8');
const html=fs.readFileSync(new URL('../public/index.html',import.meta.url),'utf8');
const server=fs.readFileSync(new URL('../server.js',import.meta.url),'utf8');

test('V5.5.16 persists the full current publication including SKU and video',()=>{
  assert.match(app,/indexedDB\.open\(DRAFT_DB/);
  assert.match(app,/wedropSku:/);
  assert.match(app,/selectedRemoteVideo:safeRemoteVideoSnapshot\(\)/);
  assert.match(app,/persistManualVideo\(file\)/);
  assert.match(app,/restoreDraftMedia/);
});

test('TikTok OAuth callback notifies the original tab without resetting the draft',()=>{
  assert.match(server,/redeachados_tiktok_auth_v1/);
  assert.match(server,/BroadcastChannel/);
  assert.match(app,/handleTikTokAuthEvent/);
  assert.match(app,/Sua publicação continua exatamente como estava/);
  assert.doesNotMatch(app,/await loadHistory\(\);setTimeout\(\(\)=>\{resetVideo/);
});

test('publication clears only by explicit button or when a different SKU starts',()=>{
  assert.match(html,/id="clearPublicationBtn"/);
  assert.match(app,/async function resetPublication/);
  assert.match(app,/normalizeSku\(previous\)!==normalizeSku\(next\)/);
  assert.match(app,/window\.confirm\('Deseja realmente apagar o rascunho/);
});
