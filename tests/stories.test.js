import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const server=fs.readFileSync(new URL('../server.js',import.meta.url),'utf8');
const html=fs.readFileSync(new URL('../public/index.html',import.meta.url),'utf8');
const app=fs.readFileSync(new URL('../public/app.js',import.meta.url),'utf8');

test('V5.5.16 preserves official Instagram Story publishing',()=>{
  assert.match(server,/media_type:'STORIES'/);
  assert.match(server,/\/api\/instagram\/story\/publish-remote/);
  assert.match(server,/\/api\/instagram\/story\/publish/);
  assert.match(server,/\/api\/instagram\/story\/finalize/);
});

test('V5.5.16 Story helper only copies the Shopee product link',()=>{
  assert.match(html,/id="prepareStoryBtn"/);
  assert.match(html,/Copiar link do produto/);
  assert.match(app,/copyStoryProductLink/);
  assert.match(app,/navigator\.clipboard/);
  assert.doesNotMatch(html,/Abrir Story no iPhone/);
  assert.doesNotMatch(html,/id="storyQrDialog"/);
  assert.doesNotMatch(app,/showStoryQr/);
});

test('automatic Story is explicitly link-free',()=>{
  assert.match(html,/publica o vídeo sem adesivo de link/);
  assert.match(server,/sem adesivo de link/);
});
