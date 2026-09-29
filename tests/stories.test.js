import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const server=fs.readFileSync(new URL('../server.js',import.meta.url),'utf8');
const html=fs.readFileSync(new URL('../public/index.html',import.meta.url),'utf8');
const app=fs.readFileSync(new URL('../public/app.js',import.meta.url),'utf8');

test('V5.5.9 exposes official Instagram Story publishing',()=>{
  assert.match(server,/media_type:'STORIES'/);
  assert.match(server,/\/api\/instagram\/story\/publish-remote/);
  assert.match(server,/\/api\/instagram\/story\/publish/);
  assert.match(server,/\/api\/instagram\/story\/finalize/);
});

test('V5.5.9 exposes QR-to-iPhone Story flow with Shopee link',()=>{
  const mobile=fs.readFileSync(new URL('../public/story-mobile.html',import.meta.url),'utf8');
  assert.match(html,/id="prepareStoryBtn"/);
  assert.match(html,/Continuar Story no iPhone/);
  assert.match(server,/\/api\/story-share\/remote/);
  assert.match(server,/\/api\/story-share\/upload/);
  assert.match(server,/QRCode\.toDataURL/);
  assert.match(app,/showStoryQr/);
  assert.match(mobile,/Copiar link da Shopee/);
  assert.match(mobile,/preloadVideo/);
  assert.match(mobile,/shareFile/);
  assert.match(mobile,/navigator\.share/);
  assert.match(mobile,/download=1/);
  assert.match(server,/req\.query\.download/);
});

test('automatic Story is explicitly link-free',()=>{
  assert.match(html,/API oficial · sem adesivo de link/);
  assert.match(server,/sem adesivo de link/);
});
