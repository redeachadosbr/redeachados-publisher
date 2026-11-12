import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';

const read=path=>readFileSync(new URL('../'+path,import.meta.url),'utf8');
const builder=read('public/kit-builder.js');
const store=read('shopeeKitDraftStore.js');
const start=builder.indexOf('const KIT_MAIN_ORDER_PREFIX=');
const end=builder.indexOf('function kitOrderedComponents(',start);
assert.ok(start>=0&&end>start,'Resolver de SKU principal não encontrado');
const resolver=builder.slice(start,end);

function resolve({chosen='894182',saved='894939',remembered=null,optimized='894939'}={}){
 const kit={kitSku:'KIT-894182-894939',components:[{sku:'894182'},{sku:'894939'}]};
 const selector={value:chosen,dataset:{kitSku:kit.kitSku},
  options:[{value:''},{value:'894182'},{value:'894939'}]};
 return runInNewContext(resolver+'\nkitCurrentMain(kit);',{
  kit,prepared:{kit,logistics:{mainSku:saved},optimization:{mainSku:optimized}},
  localStorage:{getItem:key=>key.includes('v2:')?remembered:'894939'},
  $:id=>id==='#kitPrincipalSku'?selector:
   id==='#kitOptimizeMainSku'?{value:optimized}:null
 });
}

test('Escova 894182 escolhida prevalece sobre bola 894939 gravada anteriormente',()=>{
 assert.equal(resolve(),'894182');
 assert.equal(resolve({saved:'894182'}),'894182');
});

test('Migração ignora preferência antiga forçada e permite novas escolhas',()=>{
 assert.equal(resolve({chosen:''}),'894182');
 assert.equal(resolve({chosen:'',remembered:'894939'}),'894939');
 assert.equal(resolve({chosen:'894939',saved:'894182'}),'894939');
 assert.doesNotMatch(builder,/kit\.kitSku==='KIT-894182-894939'&&String\(main\)!=='894939'/);
 assert.doesNotMatch(builder,/const confirmed=kit\?\.kitSku==='KIT-894182-894939'/);
});

test('SKU principal é salva e link antigo não pode ser reaproveitado',()=>{
 assert.match(builder,/prepared\.logistics=\{\.\.\.\(prepared\.logistics\|\|\{\}\),mainSku:String\(main\)\}/);
 assert.match(builder,/if\(persist\)kitLogisticsKeeper\.queue\(\)/);
 assert.match(builder,/prepared\.optimization=null/);
 assert.match(store,/String\(previous\.optimization\.mainSku\|\|''\)===String\(savedLogistics\.mainSku\)/);
 assert.match(store,/String\(current\.optimization\.mainSku\|\|''\)===String\(logistics\.mainSku\|\|''\)/);
});

test('Execução direta sincroniza principal antes de consultar publicação Shopee',()=>{
 const start=builder.indexOf('async function kitWizardExecuteNewListingDirect()');
 const end=builder.indexOf('// Preserve a categoria previamente revisada',start);
 const section=builder.slice(start,end);
 assert.ok(start>0&&end>start);
 assert.match(section,/const syncedMain=await api\('\/api\/shopee\/kits\/drafts\/logistics'/);
 assert.match(section,/String\(syncedMain\.logistics\?\.mainSku\)!==principalForDraft/);
 assert.ok(builder.indexOf('await kitReadinessCheck({throwOnError:true});',start)>end);
});
