import test from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import session from 'express-session';
import {once} from 'node:events';
import {ShopeeSessionStore,createShopeeSessionStore,SESSION_TTL_MS} from '../shopeeSessionStore.js';

function fixture(){
 let now=Date.parse('2026-10-18T03:00:00Z');
 const rows=new Map(),requests=[];
 const fetchImpl=async(url,options)=>{
  const u=new URL(url),id=u.searchParams.get('session_key')?.slice(3),row=rows.get(id);
  requests.push({url,options});
  if(options.method==='POST'){
   const value=JSON.parse(options.body)[0];rows.set(value.session_key,value);
  }else if(options.method==='DELETE')rows.delete(id);
  else if(options.method==='PATCH'){
   if(row&&row.expires_at>u.searchParams.get('expires_at')?.slice(3))Object.assign(row,JSON.parse(options.body));
  }else return new Response(JSON.stringify(row&&row.expires_at>u.searchParams.get('expires_at')?.slice(3)?[row]:[]));
  return new Response(null,{status:204});
 };
 const make=(overrides={})=>new ShopeeSessionStore({url:'https://fixture.invalid',key:'fixture-service',
  secret:'fixture-secret',password:'fixture-password',fetchImpl,now:()=>now,...overrides});
 return {rows,requests,make,advance:ms=>{now+=ms;},session:()=>({appAuth:true,cookie:{originalMaxAge:SESSION_TTL_MS,
  expires:new Date(now+SESSION_TTL_MS),httpOnly:true,sameSite:'lax',path:'/'}})};
}
const call=(store,method,...args)=>new Promise((resolve,reject)=>store[method](...args,(error,value)=>error?reject(error):resolve(value)));

test('authenticated session survives a new store instance and expires after its lifetime',async()=>{
 const f=fixture(),first=f.make(),sid='browser-session-id';
 await call(first,'set',sid,f.session());
 assert.equal((await call(f.make(),'get',sid)).appAuth,true);
 const stored=JSON.stringify([...f.rows.values()]);
 assert.doesNotMatch(stored,/browser-session-id|fixture-secret|fixture-password|fixture-service/);
 assert.match([...f.rows.keys()][0],/^[a-f0-9]{64}$/);
 f.advance(SESSION_TTL_MS+1);
 assert.equal(await call(f.make(),'get',sid),null);
});

test('logout cannot be undone by a delayed touch; password rotation invalidates prior sessions',async()=>{
 const f=fixture(),store=f.make(),sess=f.session();
 await call(store,'set','sid',sess);
 assert.equal(await call(f.make({password:'changed-password'}),'get','sid'),null);
 await call(store,'destroy','sid');
 await call(store,'touch','sid',sess);
 assert.equal(f.rows.size,0);
 assert.equal(await call(store,'get','sid'),null);
});

test('sessions persist only application authentication and cap unexpected cookie lifetimes',async()=>{
 const f=fixture(),store=f.make(),sess=f.session();
 const limit=sess.cookie.expires.toISOString();
 sess.cookie.expires=new Date('2099-01-01');sess.accessToken='must-not-persist';
 await call(store,'set','sid',sess);
 const row=[...f.rows.values()][0];
 assert.equal(row.expires_at,limit);
 assert.deepEqual(Object.keys(row.session_data).sort(),['appAuth','cookie']);
 assert.equal(f.requests[0].options.headers.apikey,'fixture-service');
 assert.equal(f.requests[0].options.headers.Authorization,undefined);
});

test('database failure fails closed and errors do not reveal connection credentials',async()=>{
 const f=fixture(),store=f.make({fetchImpl:async()=>{throw Error('fixture-service private network details');}});
 await assert.rejects(call(store,'get','sid'),{message:'Armazenamento da sessão temporariamente indisponível.'});
 await assert.rejects(call(store,'set','sid',f.session()),{message:'Armazenamento da sessão temporariamente indisponível.'});
 const unavailable=f.make({fetchImpl:async()=>new Response('private details',{status:503})});
 await assert.rejects(call(unavailable,'get','sid'),{message:'Armazenamento da sessão retornou HTTP 503.'});
 assert.equal(createShopeeSessionStore({}),undefined);
 assert.throws(()=>createShopeeSessionStore({SUPABASE_URL:'https://fixture.invalid',SUPABASE_SECRET_KEY:'fixture-service'}),/SESSION_SECRET/);
});

test('real signed cookies authenticate on another server and logout invalidates both servers',async()=>{
 const f=fixture(),servers=[];
 async function start(){
  const app=express();
  app.use(session({secret:'cookie-signing-fixture',store:f.make(),resave:false,saveUninitialized:false,cookie:{maxAge:SESSION_TTL_MS}}));
  app.post('/login',(req,res)=>req.session.regenerate(error=>{
   if(error)return res.sendStatus(503);
   req.session.appAuth=true;req.session.save(error=>res.sendStatus(error?503:204));
  }));
  app.get('/private',(req,res)=>res.sendStatus(req.session.appAuth?204:401));
  app.post('/logout',(req,res)=>req.session.destroy(error=>res.sendStatus(error?503:204)));
  const server=app.listen(0,'127.0.0.1');servers.push(server);await once(server,'listening');
  return 'http://127.0.0.1:'+server.address().port;
 }
 try{
  const first=await start(),second=await start();
  assert.equal((await fetch(second+'/private')).status,401);
  const login=await fetch(first+'/login',{method:'POST'});
  assert.equal(login.status,204);
  const cookie=login.headers.get('set-cookie').split(';')[0],headers={Cookie:cookie};
  assert.equal((await fetch(second+'/private',{headers})).status,204);
  assert.equal((await fetch(second+'/logout',{method:'POST',headers})).status,204);
  assert.equal((await fetch(first+'/private',{headers})).status,401);
 }finally{await Promise.all(servers.map(server=>new Promise(resolve=>server.close(resolve))));}
});
