import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const server=fs.readFileSync(new URL('../server.js',import.meta.url),'utf8');
const app=fs.readFileSync(new URL('../public/app.js',import.meta.url),'utf8');
const html=fs.readFileSync(new URL('../public/index.html',import.meta.url),'utf8');

test('new sb_secret keys are not sent as bearer JWTs',()=>{
  assert.ok(server.includes("if(/^eyJ[A-Za-z0-9_-]*\\./.test(cfg.key)) headers.Authorization=`Bearer ${cfg.key}`;"));
  assert.match(server,/apikey:cfg\.key/);
});

test('published reel can be repaired without reposting',()=>{
  assert.match(server,/\/api\/instagram\/sync-latest-reel/);
  assert.match(html,/id="syncLatestReelBtn"/);
  assert.match(app,/syncLatestReelBtn/);
});

test('publish feedback exposes Supabase sync state',()=>{
  assert.match(app,/automação registrada no Supabase/);
  assert.match(app,/Supabase não configurado/);
});
