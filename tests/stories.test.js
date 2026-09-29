import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const server=fs.readFileSync(new URL('../server.js',import.meta.url),'utf8');
const html=fs.readFileSync(new URL('../public/index.html',import.meta.url),'utf8');
const app=fs.readFileSync(new URL('../public/app.js',import.meta.url),'utf8');

test('V5.5.7 exposes official Instagram Story publishing',()=>{
  assert.match(server,/media_type:'STORIES'/);
  assert.match(server,/\/api\/instagram\/story\/publish-remote/);
  assert.match(server,/\/api\/instagram\/story\/publish/);
  assert.match(server,/\/api\/instagram\/story\/finalize/);
});

test('V5.5.7 exposes assisted Story flow with Shopee link',()=>{
  assert.match(html,/id="prepareStoryBtn"/);
  assert.match(html,/Story com link da Shopee/);
  assert.match(app,/copyStoryLink/);
  assert.match(app,/navigator\.share/);
  assert.match(app,/adesivo <b>Link<\/b>/);
});

test('automatic Story is explicitly link-free',()=>{
  assert.match(html,/API oficial · sem adesivo de link/);
  assert.match(server,/sem adesivo de link/);
});
