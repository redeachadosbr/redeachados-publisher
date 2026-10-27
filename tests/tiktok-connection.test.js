import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {encryptTikTokToken,decryptTikTokToken} from '../publisherTikTokAuthStore.js';
test('token TikTok cifrado AES-GCM preserva renovação mas não revela segredos',()=>{
 const token={access_token:'access-test',refresh_token:'refresh-test',expires_in:86400,obtained_at:123};
 const encoded=encryptTikTokToken(token,'secret-test');
 assert.ok(!encoded.includes('access-test')&&!encoded.includes('refresh-test'));
 assert.deepEqual(decryptTikTokToken(encoded,'secret-test'),token);
 assert.throws(()=>decryptTikTokToken(encoded,'secret-wrong'));
});
test('status real da API e erro OAuth antigo não entram em conflito',()=>{
 const ui=fs.readFileSync(new URL('../public/app.js',import.meta.url),'utf8');
 const server=fs.readFileSync(new URL('../server.js',import.meta.url),'utf8');
 assert.match(ui,/api\/tiktok\/status/);
 assert.doesNotMatch(ui,/invalidFromUrl/);
 assert.match(ui,/history\.replaceState/);
 assert.match(ui,/config\.tiktokConnected=tik\.status==='connected'/);
 assert.match(server,/app\.get\('\/api\/tiktok\/status'/);
 assert.match(server,/await creatorInfo\(\)/);
 assert.match(server,/validTikTokState\(req\)/);
 assert.doesNotMatch(server,/req\.query\.state!==req\.session\.oauthState/);
 assert.match(server,/await restoreTikTokSession\(\)/);
});

test('persistência REST aceita HTTP 201 sem body e mantém envelope criptografado',async()=>{
 const oldEnv={SUPABASE_URL:process.env.SUPABASE_URL,SUPABASE_SECRET_KEY:process.env.SUPABASE_SECRET_KEY,TIKTOK_CLIENT_SECRET:process.env.TIKTOK_CLIENT_SECRET};
 const fetchOld=globalThis.fetch;
 process.env.SUPABASE_URL='https://fixture-tiktok.supabase.co';
 process.env.SUPABASE_SECRET_KEY='sb_secret_test';
 process.env.TIKTOK_CLIENT_SECRET='local-test';
 try{
  globalThis.fetch=async(url,opts)=>{
   assert.match(String(url),/publisher_tiktok_oauth/);
   assert.equal(opts.method,'POST');
   const payload=JSON.parse(opts.body);
   assert.equal(payload[0].id,'primary');
   assert.ok(!opts.body.includes('refresh-secret'));
   return new Response('',{status:201});
  };
  const {writePersistentTikTokToken}=await import('../publisherTikTokAuthStore.js');
  assert.equal(await writePersistentTikTokToken({access_token:'a',refresh_token:'refresh-secret',expires_in:123}),true);
 }finally{
  globalThis.fetch=fetchOld;
  for(const [key,value] of Object.entries(oldEnv))if(value===undefined)delete process.env[key];else process.env[key]=value;
 }
});
