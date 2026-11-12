import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';

const read=path=>readFileSync(new URL('../'+path,import.meta.url),'utf8');
const builder=read('public/kit-builder.js');
const store=read('shopeeKitDraftStore.js');
const start=builder.indexOf('function kitCurrentMain(');
const end=builder.indexOf('function kitOrderedComponents(',start);
assert.ok(start>=0&&end>start,'Resolver de SKU principal não encontrado');
const resolver=builder.slice(start,end);

function resolve({chosen='894182',saved='894939',remembered='894939',optimized='894939'}={}){
 const kit={kitSku:'KIT-894182-894939',components:[{sku:'894182'},{sku:'894939'}]};
 const selector={value:chosen,options:[{value:''},{value:'894182'},{value:'894939'}]};
 return runInNewContext(resolver+'\nkitCurrentMain(kit);',{
  kit,prepared:{kit,logistics:{mainSku:saved},optimization:{mainSku:optimized}},
  kitRememberedMain:()=>remembered,
  $:id=>id==='#kitPrincipalSku'?selector:
   id==='#kitOptimizeMainSku'?{value:optimized}:null
 });
}

test('Escova 894182 escolhida prevalece sobre bola 894939 gravada anteriormente',()=>{
 assert.equal(resolve(),'894182');
 assert.equal(resolve({saved:'894182'}),'894182');
});

test('Permite modificar a escolha; sem regra fixa do brinquedo',()=>{
 assert.equal(resolve({chosen:'894939',saved:'894182'}),'894939');
 assert.doesNotMatch(builder,/kit\.kitSku==='KIT-894182-894939'&&String\(main\)!=='894939'/);
 assert.doesNotMatch(builder,/const confirmed=kit\?\.kitSku==='KIT-894182-894939'/);
});

test('Seleção válida é sincronizada e link antigo não pode ser reaproveitado',()=>{
 assert.match(builder,/prepared\.logistics=\{\.\.\.\(prepared\.logistics\|\|\{\}\),mainSku:String\(main\)\}/);
 assert.match(builder,/if\(persist\)kitLogisticsKeeper\.queue\(\)/);
 assert.match(builder,/prepared\.optimization=null/);
 assert.match(store,/String\(previous\.optimization\.mainSku\|\|''\)===String\(savedLogistics\.mainSku\)/);
 assert.match(store,/String\(current\.optimization\.mainSku\|\|''\)===String\(logistics\.mainSku\|\|''\)/);
});
