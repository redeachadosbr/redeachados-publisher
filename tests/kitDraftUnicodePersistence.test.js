import test from 'node:test';
import assert from 'node:assert/strict';
import {buildKitSeoTitle} from '../public/kit-seo-helper.js';
import {kitDraftUnicodeSlice,serializeKitDraftJson,saveKitDraft} from '../shopeeKitDraftStore.js';

const components=[
 {sku:'BAS25021',name:'Arena Mini Jogo de Basquete de Mesa'},
 {sku:'579383',name:'Pista Looping 360° Strike com Carrinho e Acessórios'},
 {sku:'304438',name:'Pula Pirata Jump Pequeno - 16 Peças'}
];
const kitSku='KIT-304438-579383-BAS25021';

test('reprodução do PGRST102: não cortar emoji final de título com 120 caracteres',()=>{
 const title=buildKitSeoTitle(components);
 assert.equal(Array.from(title).length,120);
 assert.ok(title.endsWith('📦'));
 // A versão anterior corrompia a metade alta do par UTF-16.
 const broken=title.slice(0,120);
 assert.match(broken,/[\uD800-\uDBFF]$/);
 assert.equal(kitDraftUnicodeSlice(title,120),title);
 assert.doesNotMatch(serializeKitDraftJson({title}),/\\ud83d/i);
 assert.equal(JSON.parse(serializeKitDraftJson({title})).title,title);
 assert.equal(JSON.parse(serializeKitDraftJson({title:broken})).title,
  broken.slice(0,-1)+'�');
});
test('kit BAS25021 + 579383 + 304438 salva rascunho JSON Unicode íntegro no PostgREST',async()=>{
 const oldFetch=globalThis.fetch,oldUrl=process.env.SUPABASE_URL,oldKey=process.env.SUPABASE_SECRET_KEY;
 const requests=[];
 try{
  process.env.SUPABASE_URL='https://fixture.supabase.co';
  process.env.SUPABASE_SECRET_KEY='fixture-key';
  globalThis.fetch=async(url,options={})=>{
   requests.push({url:String(url),options});
   if(options.method==='POST'){
    const json=options.body;
    assert.doesNotMatch(json,/\\ud83d/i);
    const parsed=JSON.parse(json);
    assert.equal(parsed.length,1);
    const saved=parsed[0];
    assert.deepEqual(saved.component_skus,['BAS25021','579383','304438']);
    assert.ok(saved.draft.creative.title.endsWith('📦'));
    assert.equal(Array.from(saved.draft.creative.title).length,120);
    return Response.json([{updated_at:'2026-11-02T00:30:00Z'}],{status:201});
   }
   return Response.json([]);
  };
  const title=buildKitSeoTitle(components);
  const draft=await saveKitDraft(852701218,{
   kit:{kitSku,components,kitCost:31.97,quote:{grossPrice:95.91}},
   creative:{title,description:'✨ Kit Arena de Basquete de Mesa + Pista Looping com Carrinho + Pula Pirata Jump. ✅ Três brinquedos para diversão em família, com uma unidade de cada produto.'},
   importBatchId:'test-batch'
  });
  assert.equal(draft.saved,true);
  assert.equal(requests.filter(x=>x.options.method==='POST').length,1);
 }finally{
  globalThis.fetch=oldFetch;
  if(oldUrl===undefined)delete process.env.SUPABASE_URL;
  else process.env.SUPABASE_URL=oldUrl;
  if(oldKey===undefined)delete process.env.SUPABASE_SECRET_KEY;
  else process.env.SUPABASE_SECRET_KEY=oldKey;
 }
});
