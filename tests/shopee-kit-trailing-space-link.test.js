import test from 'node:test';
import assert from 'node:assert/strict';
import {recordKitOptimization} from '../shopeeKitDraftStore.js';
import {readFileSync} from 'node:fs';
const kitSku='KIT-126051011000-126088800001-TRC0663';
const skus=['1.26051.01.1000','1.26088.80.0001','TRC0663'];
const title='Kit para Banheiro: Escova Sanitária, Lixeira Inox e Porta Disco de Algodão';
const description='Descrição do conjunto de banheiro: '.repeat(5);
const original={
 kit:{kitSku,components:skus.map(sku=>({sku,name:sku})),kitCost:61.27,
  quote:{grossPrice:183.8,marketplacePrice:128.59}},
 creative:{title:title+' ',description,manualFacts:{TRC0663:'Porta discos'},
  fiscalBySku:Object.fromEntries(skus.map(sku=>[sku,{origin:'2'}]))},
 publication:{status:'local_draft',itemId:null},optimization:null
};
const link={kitSku,sku:skus[1],mainSku:skus[1],itemId:'58222014306',modelId:'0',
 componentSkus:skus,kitCost:61.27,grossPrice:183.8,title,description};
async function fakeDatabase(fn){
 const previousFetch=globalThis.fetch,oldUrl=process.env.SUPABASE_URL,
  oldKey=process.env.SUPABASE_SECRET_KEY;
 let stored=structuredClone(original),writes=0;
 try{
  process.env.SUPABASE_URL='https://test.supabase.co';
  process.env.SUPABASE_SECRET_KEY='test-key';
  globalThis.fetch=async(url,opt={})=>{
   const u=new URL(String(url));
   assert.match(u.pathname,/\/shopee_wedrop_kit_drafts$/);
   if(opt.method==='PATCH'){
    const body=JSON.parse(opt.body);
    writes++;
    stored=body.draft;
    return Response.json([{kit_sku:kitSku,draft:stored}]);
   }
   return Response.json([{kit_sku:kitSku,component_skus:skus,draft:stored,
    updated_at:'2026-11-01T07:27:00Z'}]);
  };
  await fn({get:()=>stored,writes:()=>writes});
 }finally{
  globalThis.fetch=previousFetch;
  if(oldUrl===undefined)delete process.env.SUPABASE_URL;else process.env.SUPABASE_URL=oldUrl;
  if(oldKey===undefined)delete process.env.SUPABASE_SECRET_KEY;else process.env.SUPABASE_SECRET_KEY=oldKey;
 }
}
test('espaço final não altera identidade nem bloqueia gravação do vínculo',()=>fakeDatabase(async db=>{
 const result=await recordKitOptimization(852701218,kitSku,link);
 assert.equal(result.saved,true);
 assert.equal(result.optimization.itemId,'58222014306');
 assert.equal(db.writes(),1);
 assert.equal(db.get().creative.title,title+' ');
 assert.equal(db.get().kit.quote.grossPrice,183.8);
 assert.equal(db.get().creative.fiscalBySku[skus[1]].origin,'2');
 assert.deepEqual(db.get().creative.manualFacts,{TRC0663:'Porta discos'});
 assert.equal(db.get().publication.status,'local_draft');
}));
test('alteração real de título não deve ser tolerada',()=>fakeDatabase(async db=>{
 await assert.rejects(recordKitOptimization(852701218,kitSku,{
  ...link,title:'Outro kit para banheiro'}),/composi.+preço ou texto comercial mudou/i);
 assert.equal(db.writes(),0);
}));
test('alteração real de preço ou componentes não deve ser tolerada',()=>fakeDatabase(async db=>{
 await assert.rejects(recordKitOptimization(852701218,kitSku,{
  ...link,grossPrice:189.90}),/preço ou texto comercial mudou/);
 await assert.rejects(recordKitOptimization(852701218,kitSku,{
  ...link,componentSkus:[...skus].reverse()}),/preço ou texto comercial mudou/);
 assert.equal(db.writes(),0);
}));
test('comparação da gravação usa o mesmo trim da validação inicial',()=>{
 const source=readFileSync(new URL('../shopeeKitDraftStore.js',import.meta.url),'utf8');
 assert.match(source,/String\(current\.creative\?\.title\|\|''\)\.trim\(\)!==String\(link\.title\|\|''\)\.trim\(\)/);
 assert.match(source,/String\(current\.creative\?\.description\|\|''\)\.trim\(\)!==String\(link\.description\|\|''\)\.trim\(\)/);
});
