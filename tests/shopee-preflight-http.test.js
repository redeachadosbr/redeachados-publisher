import test from 'node:test';
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {createServer} from 'node:net';
import {once} from 'node:events';
async function unusedPort(){const s=createServer();s.listen(0,'127.0.0.1');await once(s,'listening');const p=s.address().port;await new Promise(resolve=>s.close(resolve));return p;}
test('authenticated HTTP preflight passes the real config from audit to the subsequent Shopee read',async()=>{
 const port=await unusedPort(),base='http://127.0.0.1:'+port;
 const child=spawn(process.execPath,['tests/fixtures/optimizer-server.mjs'],{cwd:new URL('..',import.meta.url),env:{
  PATH:process.env.PATH,PORT:String(port),APP_PASSWORD:'fixture-password',SESSION_SECRET:'fixture-session',
  PUBLIC_BASE_URL:base,SHOPEE_ENV:'live',SHOPEE_PARTNER_ID:'12',SHOPEE_PARTNER_KEY:'fixture-key',
  SHOPEE_REDIRECT_URI:'https://fixture.invalid/auth/shopee/callback',SUPABASE_URL:'https://fixture.supabase.co',SUPABASE_SECRET_KEY:'fixture-service',SHOPEE_MONITOR_ENABLED:'false'
 }});
 try{
  await new Promise((resolve,reject)=>{const timeout=setTimeout(()=>reject(Error('Fixture startup timeout')),10000);
   child.stdout.on('data',b=>{if(String(b).includes('Shopee API em')){clearTimeout(timeout);resolve();}});
   child.once('error',reject);child.once('exit',c=>{clearTimeout(timeout);reject(Error('Fixture exited '+c));});
  });
  const login=await fetch(base+'/api/login',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({password:'fixture-password'})});
  const cookie=login.headers.get('set-cookie').split(';')[0];
  const response=await fetch(base+'/api/shopee/optimizer/execution/prepare',{method:'POST',
   headers:{'Content-Type':'application/json',Cookie:cookie,Origin:base},body:JSON.stringify({sku:'SKU',itemId:'2',modelId:'0'})});
  const body=await response.json();
  assert.equal(response.status,200,JSON.stringify(body));assert.equal(body.ready,true);
  assert.equal(body.plan.proposed.item_name,'Título revisado do produto');
  assert.equal(body.marketplaceUpdated,false);
  assert.doesNotMatch(JSON.stringify(body),/fixture-key|fixture-token|fixture-service/);
  const bad=await fetch(base+'/api/shopee/optimizer/execution/prepare',{method:'POST',headers:{'Content-Type':'application/json',Cookie:cookie,Origin:'https://wrong-origin.invalid'},body:JSON.stringify({sku:'SKU',itemId:'2',modelId:'0'})});
  assert.equal(bad.status,403);
 }finally{child.kill();await once(child,'exit').catch(()=>{});}
});
