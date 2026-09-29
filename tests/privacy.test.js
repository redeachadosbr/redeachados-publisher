import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const server=fs.readFileSync(new URL('../server.js',import.meta.url),'utf8');
const html=fs.readFileSync(new URL('../public/privacy.html',import.meta.url),'utf8');

test('public privacy route exists without login middleware',()=>{
  assert.match(server,/app\.get\(\['\/privacy','\/privacy-policy'\]/);
  assert.doesNotMatch(server,/app\.get\(\['\/privacy','\/privacy-policy'\],\s*mustLogin/);
});

test('privacy page includes required operational sections',()=>{
  assert.match(html,/Política de Privacidade/);
  assert.match(html,/exclusão de dados/i);
  assert.match(html,/Meta\/Instagram/);
  assert.match(html,/redeachadosbr@gmail\.com/);
});
