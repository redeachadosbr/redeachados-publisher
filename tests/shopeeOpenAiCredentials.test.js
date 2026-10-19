import test from 'node:test';
import assert from 'node:assert/strict';
import {openAiKeyStatus,openAiApiKey,saveOpenAiApiKey,deleteOpenAiApiKey,verifyOpenAiApiKey} from '../shopeeOpenAiCredentials.js';

test('Chave OpenAI somente por sessão autorizada e criptografada no banco',async()=>{
 const saved={fetch:globalThis.fetch,SESSION_SECRET:process.env.SESSION_SECRET,SUPABASE_URL:process.env.SUPABASE_URL,
  SUPABASE_SECRET_KEY:process.env.SUPABASE_SECRET_KEY,OPENAI_API_KEY:process.env.OPENAI_API_KEY};
 const key='sk-proj-abcdefghijklmnopqrstuvwxyz0123456789abcde';
 let cipher='',count=0;
 try{
  process.env.SESSION_SECRET='long-unique-and-private-unit-test-session-secret';
  process.env.SUPABASE_URL='https://fixture.supabase.co';
  process.env.SUPABASE_SECRET_KEY='unit-test-role-value';
  delete process.env.OPENAI_API_KEY;
  globalThis.fetch=async(url,opts={})=>{
   count++;
   if(url==='https://api.openai.com/v1/models'){
    assert.equal(opts.headers.Authorization,'Bearer '+key);
    return Response.json({data:[{id:'gpt-image-2'}]});
   }
   if(!url.startsWith('https://fixture.supabase.co/rest/v1/shopee_openai_integrations'))
    throw Error('unexpected URL '+url);
   assert.equal(opts.headers.apikey,'unit-test-role-value');
   if(opts.method==='POST'){
    const row=JSON.parse(opts.body)[0];
    assert.equal(row.shop_id,12345);
    cipher=row.encrypted_key;
    assert.ok(cipher.startsWith('v1.'));
    assert.ok(!cipher.includes(key));
    return Response.json([row]);
   }
   if(opts.method==='DELETE'){cipher='';return new Response(null,{status:204});}
   return Response.json(cipher?[{encrypted_key:cipher,updated_at:'2026-10-18T12:00:00Z'}]:[]);
  };
  assert.deepEqual((await openAiKeyStatus(12345)).configured,false);
  const result=await saveOpenAiApiKey(12345,key);
  assert.equal(result.source,'cofre');
  assert.equal((await openAiKeyStatus(12345)).configured,true);
  assert.equal(await openAiApiKey(12345),key);
  await assert.rejects(()=>openAiApiKey(99999),/Não foi possível abrir/); // cipher mock still bound to 12345: must reject decryption
  const disconnected=await deleteOpenAiApiKey(12345);
  assert.equal(disconnected.configured,false);
  assert.equal(await openAiApiKey(12345),'');
  assert.ok(count>=6);
 }finally{
  globalThis.fetch=saved.fetch;
  for(const k of ['SESSION_SECRET','SUPABASE_URL','SUPABASE_SECRET_KEY','OPENAI_API_KEY'])
   if(saved[k]===undefined)delete process.env[k];else process.env[k]=saved[k];
 }
});

test('Não aceitar chave OpenAI inválida ou incompleta',async()=>{
 await assert.rejects(()=>verifyOpenAiApiKey('invalid'),/formato inválido/);
 await assert.rejects(()=>verifyOpenAiApiKey('sk-short'),/formato inválido/);
});
