import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const server=fs.readFileSync(new URL('../server.js',import.meta.url),'utf8');
const html=fs.readFileSync(new URL('../public/index.html',import.meta.url),'utf8');
const app=fs.readFileSync(new URL('../public/app.js',import.meta.url),'utf8');

test('V5.5.14 exposes official Instagram Story publishing',()=>{
  assert.match(server,/media_type:'STORIES'/);
  assert.match(server,/\/api\/instagram\/story\/publish-remote/);
  assert.match(server,/\/api\/instagram\/story\/publish/);
  assert.match(server,/\/api\/instagram\/story\/finalize/);
});

test('V5.5.14 exposes native QR-to-iPhone Story flow with Shopee link',()=>{
  const mobile=fs.readFileSync(new URL('../public/story-mobile.html',import.meta.url),'utf8');
  assert.match(html,/id="prepareStoryBtn"/);
  assert.match(html,/Abrir Story no iPhone/);
  assert.match(server,/\/api\/story-share\/remote/);
  assert.match(server,/\/api\/story-share\/upload/);
  assert.match(server,/QRCode\.toDataURL/);
  assert.match(app,/showStoryQr/);
  assert.match(mobile,/Copiar link da Shopee/);
  assert.match(mobile,/redeachados:\/\/story/);
  assert.match(mobile,/Abrir direto no Story do Instagram/);
  assert.doesNotMatch(mobile,/navigator\.share/);
  assert.match(mobile,/Alternativa: baixar vídeo/);
  assert.match(mobile,/downloadUrl/);
  assert.match(server,/req\.query\.download/);
  assert.match(server,/\/api\/wedrop\/prepare/);
  assert.match(server,/prepareDriveVideo/);
  assert.match(server,/serveLocalVideo/);
  assert.match(server,/metaAppId:envText\('META_APP_ID'\)/);
  assert.ok(fs.existsSync(new URL('../ios-native-helper/RedeAchadosStoryBridge/StoryBridgeViewModel.swift',import.meta.url)));
});

test('automatic Story is explicitly link-free',()=>{
  assert.match(html,/API oficial · sem adesivo de link/);
  assert.match(server,/sem adesivo de link/);
});
