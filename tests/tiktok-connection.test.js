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
