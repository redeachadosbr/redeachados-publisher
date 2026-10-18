import session from 'express-session';
import crypto from 'node:crypto';

export const SESSION_TTL_MS=12*60*60*1000;
// Session IDs are hashed with server secrets before persistence. This table is
// private to the backend and is not an alternative login endpoint.
export class ShopeeSessionStore extends session.Store {
 constructor({url,key,secret,password='',fetchImpl=fetch,now=Date.now}){
  super();
  this.url=String(url).replace(/\/$/,'');this.key=key;this.secret=secret;this.password=password;
  this.fetch=fetchImpl;this.now=now;
 }
 id(sid){return crypto.createHmac('sha256',this.secret).update('shopee-session\0'+this.password+'\0'+sid).digest('hex');}
 expiry(sess){
  const requested=Date.parse(sess?.cookie?.expires);
  return new Date(Math.min(Number.isFinite(requested)?requested:this.now()+SESSION_TTL_MS,this.now()+SESSION_TTL_MS)).toISOString();
 }
 async request(query,{method='GET',body}={}){
  const headers={apikey:this.key,Accept:'application/json','Content-Type':'application/json'};
  if(/^eyJ[A-Za-z0-9_-]*\./.test(this.key))headers.Authorization='Bearer '+this.key;
  if(method==='POST')headers.Prefer='resolution=merge-duplicates,return=minimal';
  let response;
  try{response=await this.fetch(this.url+'/rest/v1/shopee_app_sessions'+query,{
   method,headers,...(body===undefined?{}:{body:JSON.stringify(body)}),signal:AbortSignal.timeout(12000)});}
  catch{throw Error('Armazenamento da sessão temporariamente indisponível.');}
  if(!response.ok)throw Error('Armazenamento da sessão retornou HTTP '+response.status+'.');
  return method==='GET'?response.json():null;
 }
 get(sid,callback){
  this.request('?session_key=eq.'+this.id(sid)+'&expires_at=gt.'+encodeURIComponent(new Date(this.now()).toISOString())+
   '&select=session_data&limit=1').then(rows=>callback(null,rows[0]?.session_data||null),callback);
 }
 set(sid,sess,callback=()=>{}){
  const data={session_key:this.id(sid),session_data:{cookie:sess.cookie,appAuth:sess.appAuth===true},
   expires_at:this.expiry(sess),updated_at:new Date(this.now()).toISOString()};
  this.request('?on_conflict=session_key',{method:'POST',body:[data]}).then(()=>callback(null),callback);
 }
 touch(sid,sess,callback=()=>{}){
  // PATCH never recreates a session that was concurrently signed out.
  this.request('?session_key=eq.'+this.id(sid)+'&expires_at=gt.'+encodeURIComponent(new Date(this.now()).toISOString()),{
   method:'PATCH',body:{session_data:{cookie:sess.cookie,appAuth:sess.appAuth===true},
    expires_at:this.expiry(sess),updated_at:new Date(this.now()).toISOString()}}).then(()=>callback(null),callback);
 }
 destroy(sid,callback=()=>{}){
  this.request('?session_key=eq.'+this.id(sid),{method:'DELETE'}).then(()=>callback(null),callback);
 }
}
export function createShopeeSessionStore(env=process.env){
 const url=String(env.SUPABASE_URL||'').trim(),key=String(env.SUPABASE_SECRET_KEY||env.SUPABASE_SERVICE_ROLE_KEY||'').trim();
 const password=String(env.APP_PASSWORD||'').trim(),secret=String(env.SESSION_SECRET||'').trim()||password;
 if(!url||!key)return undefined; // Existing in-memory behavior for local setups only.
 if(!secret)throw Error('Configure SESSION_SECRET para persistir as sessões do aplicativo.');
 return new ShopeeSessionStore({url,key,secret,password});
}
