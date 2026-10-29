import crypto from 'node:crypto';
const TABLE='publisher_tiktok_sandbox_oauth';
const cfg=()=>{
 const base=String(process.env.SUPABASE_URL||'').replace(/\/$/,'');
 const key=String(process.env.SUPABASE_SECRET_KEY||process.env.SUPABASE_SERVICE_ROLE_KEY||'');
 const secret=String(process.env.TIKTOK_SANDBOX_CLIENT_SECRET||'');
 if(!/^https:\/\/[a-z0-9.-]+$/i.test(base)||!key||!secret)throw Error('Sandbox precisa das credenciais e do armazenamento no Render.');
 const headers={apikey:key,Accept:'application/json','Content-Type':'application/json'};
 if(/^eyJ[A-Za-z0-9_-]*\./.test(key))headers.Authorization='Bearer '+key;
 return {base,headers,secret};
};
const key=(c)=>crypto.createHash('sha256').update('Publisher TikTok SANDBOX v1').update(c.secret).digest();
function encrypt(token,c){
 const iv=crypto.randomBytes(12),cipher=crypto.createCipheriv('aes-256-gcm',key(c),iv);
 const bytes=Buffer.concat([cipher.update(JSON.stringify(token)),cipher.final()]);
 return ['v1',iv.toString('base64url'),cipher.getAuthTag().toString('base64url'),bytes.toString('base64url')].join('.');
}
function decrypt(text,c){
 const [version,iv,tag,data,...rest]=String(text||'').split('.');
 if(version!=='v1'||!iv||!tag||!data||rest.length)throw Error('Token Sandbox inválido.');
 const dec=crypto.createDecipheriv('aes-256-gcm',key(c),Buffer.from(iv,'base64url'));
 dec.setAuthTag(Buffer.from(tag,'base64url'));
 const token=JSON.parse(Buffer.concat([dec.update(Buffer.from(data,'base64url')),dec.final()]).toString('utf8'));
 if(!token?.refresh_token||!token?.access_token)throw Error('Token Sandbox incompleto.');
 return token;
}
async function query(c,path,opt={}){
 const r=await fetch(c.base+'/rest/v1/'+TABLE+path,{
  method:opt.method||'GET',
  headers:{...c.headers,...(opt.prefer?{Prefer:opt.prefer}:{})},
  ...(opt.body?{body:JSON.stringify(opt.body)}:{}),signal:AbortSignal.timeout(12000)
 });
 if(!r.ok)throw Error('Armazenamento do Sandbox indisponível (HTTP '+r.status+').');
 if(r.status===204)return [];
 return await r.json().catch(()=>[]);
}
export async function readSandboxToken(){
 const c=cfg(),rows=await query(c,'?id=eq.sandbox&select=encrypted_token&limit=1');
 return rows[0]?.encrypted_token?decrypt(rows[0].encrypted_token,c):null;
}
export async function saveSandboxToken(token){
 if(!token?.access_token||!token?.refresh_token)throw Error('Token Sandbox incompleto.');
 const c=cfg();
 await query(c,'?on_conflict=id',{method:'POST',prefer:'resolution=merge-duplicates,return=minimal',
  body:[{id:'sandbox',encrypted_token:encrypt(token,c),updated_at:new Date().toISOString()}]});
}
