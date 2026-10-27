import crypto from 'node:crypto';
const TABLE='publisher_tiktok_oauth';
export function encryptTikTokToken(token,secret){
 if(!secret||!token?.access_token||!token?.refresh_token)throw Error('Token TikTok incompleto.');
 const key=crypto.createHash('sha256').update('RA Publisher TikTok OAuth 2026').update(secret).digest();
 const iv=crypto.randomBytes(12),cipher=crypto.createCipheriv('aes-256-gcm',key,iv);
 const bytes=Buffer.concat([cipher.update(JSON.stringify(token),'utf8'),cipher.final()]);
 return ['v1',iv.toString('base64url'),cipher.getAuthTag().toString('base64url'),bytes.toString('base64url')].join('.');
}
export function decryptTikTokToken(text,secret){
 const [version,iv,tag,payload,...rest]=String(text||'').split('.');
 if(version!=='v1'||!iv||!tag||!payload||rest.length||!secret)throw Error('Token TikTok persistido inválido.');
 const key=crypto.createHash('sha256').update('RA Publisher TikTok OAuth 2026').update(secret).digest();
 const cipher=crypto.createDecipheriv('aes-256-gcm',key,Buffer.from(iv,'base64url'));
 cipher.setAuthTag(Buffer.from(tag,'base64url'));
 const token=JSON.parse(Buffer.concat([cipher.update(Buffer.from(payload,'base64url')),cipher.final()]).toString('utf8'));
 if(!token?.access_token||!token?.refresh_token)throw Error('Token TikTok persistido incompleto.');
 return token;
}
function cfg(settings={}){
 const base=String(process.env.SUPABASE_URL||'').trim().replace(/\/$/,'');
 const apiKey=String(process.env.SUPABASE_SECRET_KEY||process.env.SUPABASE_SERVICE_ROLE_KEY||'').trim();
 const secret=String(process.env.TIKTOK_CLIENT_SECRET||settings.tiktokClientSecret||'').trim();
 if(!/^https:\/\/[a-z0-9.-]+$/i.test(base)||!apiKey||!secret)return null;
 const headers={apikey:apiKey,'Content-Type':'application/json',Accept:'application/json'};
 if(/^eyJ[A-Za-z0-9_-]*\./.test(apiKey))headers.Authorization='Bearer '+apiKey;
 return {base,headers,secret};
}
export function tiktokStorageConfigured(settings={}){return Boolean(cfg(settings));}
async function request(config,query,options={}){
 const r=await fetch(config.base+'/rest/v1/'+TABLE+query,{
  method:options.method||'GET',
  headers:{...config.headers,...(options.prefer?{Prefer:options.prefer}:{})},
  ...(options.body?{body:JSON.stringify(options.body)}:{}),
  signal:AbortSignal.timeout(10000)
 });
 if(!r.ok)throw Error('Persistência TikTok indisponível (HTTP '+r.status+').');
 if(r.status===204)return [];
 const body=await r.text();return body?JSON.parse(body):[];
}
export async function readPersistentTikTokToken(settings={}){
 const config=cfg(settings);if(!config)return null;
 const rows=await request(config,'?id=eq.primary&select=encrypted_token&limit=1');
 return rows?.[0]?.encrypted_token?decryptTikTokToken(rows[0].encrypted_token,config.secret):null;
}
export async function writePersistentTikTokToken(token,settings={}){
 const config=cfg(settings);if(!config)return false;
 const encrypted_token=encryptTikTokToken(token,config.secret);
 await request(config,'?on_conflict=id',{method:'POST',prefer:'resolution=merge-duplicates,return=minimal',
  body:[{id:'primary',encrypted_token,updated_at:new Date().toISOString()}]});
 return true;
}
export async function deletePersistentTikTokToken(settings={}){
 const config=cfg(settings);if(!config)return false;
 await request(config,'?id=eq.primary',{method:'DELETE'});
 return true;
}