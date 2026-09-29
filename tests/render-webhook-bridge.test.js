import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const server=fs.readFileSync(new URL('../server.js',import.meta.url),'utf8');
const worker=fs.readFileSync(new URL('../CLOUDFLARE_WORKER_REFERENCE.js',import.meta.url),'utf8');
const pkg=JSON.parse(fs.readFileSync(new URL('../package.json',import.meta.url),'utf8'));

test('V5.5.11 preserves Render webhook bridge',()=>{
  assert.equal(pkg.version,'5.5.11');
  assert.match(server,/app\.post\('\/api\/instagram\/webhook'/);
  assert.match(server,/supabaseInstagramWebhookUrl\(\)/);
  assert.match(server,/req\.rawBody/);
  assert.match(server,/X-Hub-Signature-256/);
  assert.match(server,/Instagram webhook bridge/);
});

test('Cloudflare Worker forwards POST to Render instead of Supabase',()=>{
  assert.match(worker,/https:\/\/redeachados-publisher\.onrender\.com\/api\/instagram\/webhook/);
  assert.doesNotMatch(worker,/SUPABASE_WEBHOOK/);
  assert.match(worker,/X-Hub-Signature-256/);
});
