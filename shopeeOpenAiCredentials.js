// Credenciais OpenAI por loja. Nunca devolve nem registra chave no navegador.
import crypto from 'node:crypto';

const TABLE='shopee_openai_integrations';
const env=name=>String(process.env[name]||'').trim();
const shopNumber=value=>{
 const n=Number(value);
 if(!Number.isSafeInteger(n)||n<=0)throw Error('Loja Shopee inválida.');
 return n;
};
function encryptionKey(shopId){
 const secret=env('SESSION_SECRET');
 if(secret.length<24)throw Error('SESSION_SECRET seguro é necessário para proteger a chave OpenAI.');
 return crypto.hkdfSync('sha256',Buffer.from(secret,'utf8'),
  Buffer.from('redeachados-shopee-openai-2026','utf8'),
  Buffer.from('openai-api-key:shop='+shopNumber(shopId),'utf8'),32);
}
function config(){
 const base=env('SUPABASE_URL').replace(/\/$/,'');
 const key=env('SUPABASE_SECRET_KEY')||env('SUPABASE_SERVICE_ROLE_KEY');
 if(!base.startsWith('https://')||!key)throw Error('Armazenamento protegido indisponível.');
 const headers={apikey:key,Accept:'application/json','Content-Type':'application/json'};
 if(/^eyJ[A-Za-z0-9_-]*\./.test(key))headers.Authorization='Bearer '+key;
 return {base,headers};
}
async function database(url,options={}){
 const {base,headers}=config();
 const r=await fetch(base+'/rest/v1/'+TABLE+url,{
  method:options.method||'GET',
  headers:{...headers,...(options.headers||{})},
  ...(options.body?{body:JSON.stringify(options.body)}:{}),
  signal:AbortSignal.timeout(15000)
 });
 if(!r.ok)throw Error('Falha ao acessar o cofre OpenAI (HTTP '+r.status+').');
 return options.method==='DELETE'?null:r.json();
}
function encrypt(value,shopId){
 const nonce=crypto.randomBytes(12),cipher=crypto.createCipheriv('aes-256-gcm',encryptionKey(shopId),nonce);
 cipher.setAAD(Buffer.from('shop:'+shopNumber(shopId)));
 const encrypted=Buffer.concat([cipher.update(value,'utf8'),cipher.final()]);
 return ['v1',nonce.toString('base64url'),encrypted.toString('base64url'),cipher.getAuthTag().toString('base64url')].join('.');
}
function decrypt(value,shopId){
 const [v,iv,data,tag,...extra]=String(value||'').split('.');
 if(v!=='v1'||!iv||!data||!tag||extra.length)throw Error('Formato do cofre OpenAI inválido. Reconecte a API.');
 try{
  const decipher=crypto.createDecipheriv('aes-256-gcm',encryptionKey(shopId),Buffer.from(iv,'base64url'));
  decipher.setAAD(Buffer.from('shop:'+shopNumber(shopId)));
  decipher.setAuthTag(Buffer.from(tag,'base64url'));
  return Buffer.concat([decipher.update(Buffer.from(data,'base64url')),decipher.final()]).toString('utf8');
 }catch{throw Error('Não foi possível abrir a chave OpenAI protegida. Reconecte a integração.');}
}
async function getRow(shopId){
 const id=shopNumber(shopId);
 const rows=await database('?shop_id=eq.'+id+'&select=encrypted_key,updated_at&limit=1');
 return rows[0]||null;
}
export async function openAiKeyStatus(shopId){
 if(env('OPENAI_API_KEY'))return {configured:true,source:'render',updatedAt:null};
 const row=await getRow(shopId);
 return {configured:Boolean(row),source:row?'cofre':'none',updatedAt:row?.updated_at||null};
}
export async function openAiApiKey(shopId){
 const envKey=env('OPENAI_API_KEY');
 if(envKey)return envKey;
 const row=await getRow(shopId);
 return row?decrypt(row.encrypted_key,shopId):'';
}
export async function verifyOpenAiApiKey(value){
 const key=String(value||'').trim();
 if(!/^sk-[A-Za-z0-9_-]{20,500}$/.test(key))throw Error('Chave OpenAI em formato inválido. Crie uma chave na plataforma OpenAI.');
 const response=await fetch('https://api.openai.com/v1/models',{
  headers:{Authorization:'Bearer '+key,Accept:'application/json'},signal:AbortSignal.timeout(16000)
 });
 if(response.status===401)throw Error('A OpenAI rejeitou a chave (401). Gere outra chave de API.');
 if(!response.ok)throw Error('Não foi possível validar a chave OpenAI (HTTP '+response.status+'). Verifique o projeto e as permissões.');
 return key;
}
export async function saveOpenAiApiKey(shopId,key){
 const id=shopNumber(shopId);
 const verified=await verifyOpenAiApiKey(key);
 const now=new Date().toISOString();
 await database('?on_conflict=shop_id',{
  method:'POST',headers:{Prefer:'resolution=merge-duplicates,return=representation'},
  body:[{shop_id:id,encrypted_key:encrypt(verified,id),updated_at:now}]
 });
 return {configured:true,source:'cofre',updatedAt:now};
}
export async function deleteOpenAiApiKey(shopId){
 await database('?shop_id=eq.'+shopNumber(shopId),{method:'DELETE'});
 return openAiKeyStatus(shopId);
}
