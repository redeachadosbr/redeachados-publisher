import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';

function factory(){
 const saved=new Map();
 const storage={getItem:key=>saved.get(key)||null,setItem:(key,val)=>saved.set(key,val)};
 const ctx={globalThis:null,localStorage:storage,Date};ctx.globalThis=ctx;
 vm.runInNewContext(readFileSync(new URL('../public/technical-memory.js',import.meta.url),'utf8'),ctx);
 return ctx.RATechnicalMemory;
}
const basic={shopId:'shop-10',categoryId:101010,supplierProduct:{name:'Caminhão Dinossauro com 3 Mini Carrinhos - Verde'}};
const attr=(name,id,options=[],inputType=1)=>({id,name,options,inputType,mandatory:false,conditional:false,values:[]});
const condition=attr('Condição do produto',100,[{id:3,name:'NOVO'},{id:4,name:'USADO'}]);
const personalized=attr('Produto personalizado',101,[{id:8,name:'Não'},{id:9,name:'Sim'}]);

test('aprende apenas opção oficial escolhida pelo vendedor e reaproveita na mesma categoria',()=>{
 const m=factory();
 assert.equal(m.learn(basic,condition,[{valueId:3,valueName:''}],{explicit:true}),true);
 assert.equal(m.suggest(basic,condition).values[0].valueName,'NOVO');
 assert.equal(m.learn(basic,personalized,[{valueId:8,valueName:''}],{explicit:true}),true);
 assert.equal(m.suggest(basic,personalized).values[0].valueName,'Não');
 assert.equal(m.suggest({...basic,categoryId:202020},condition),null);
 assert.equal(m.suggest({...basic,shopId:'other'},personalized),null);
});
test('não aprende NOVO ou Não sem escolha explícita; não sobrescreve preenchido na Shopee',()=>{
 const m=factory();
 assert.equal(m.learn(basic,condition,[{valueId:3,valueName:'NOVO'}],{explicit:false}),false);
 assert.equal(m.suggest(basic,condition),null);
 m.learn(basic,condition,[{valueId:3,valueName:''}],{explicit:true});
 assert.equal(m.suggest(basic,{...condition,values:[{name:'USADO',valueId:4}]}),null);
 assert.equal(m.learn(basic,condition,[{valueId:4,valueName:'USADO'}],{explicit:true}),false);
});
test('não inventa idade, país, bateria nem certificações a partir de outro anúncio',()=>{
 const m=factory();
 for(const name of ['País ou região de fabricação','Idade recomendada','Bateria integrada','Possui certificação BSMI','NCC','Fonte de alimentação','Material']){
  const field=attr(name,123,[{id:9,name:'Brasil'},{id:10,name:'Não'}]);
  assert.equal(m.learn(basic,field,[{valueId:9,valueName:'Brasil'}],{explicit:true}),false,name);
  assert.equal(m.suggest(basic,field),null,name);
 }
});
test('nome comercial da WeDrop só é sugerido no campo Model Name customizável',()=>{
 const m=factory();
 const model=attr('Model Name',223,[],3);
 const suggestion=m.modelSuggestion(basic,model);
 assert.equal(suggestion.values[0].valueId,0);
 assert.match(suggestion.values[0].valueName,/3 Mini Carrinhos/);
 assert.match(suggestion.evidence,/confira/i);
 assert.equal(m.modelSuggestion(basic,{...model,inputType:1}),null);
 assert.equal(m.modelSuggestion(basic,{...model,values:[{valueId:0,valueName:'Outro modelo'}]}),null);
});
test('integra à ficha técnica sem alterar a ponte das nove imagens',()=>{
 const app=readFileSync(new URL('../public/app.js',import.meta.url),'utf8');
 const page=readFileSync(new URL('../public/index.html',import.meta.url),'utf8');
 assert.match(page,/technical-memory\.js\?v=1\.0\.0-category-safe-defaults/);
 assert.match(app,/RATechnicalMemory\?\.learn/);
 assert.match(app,/memory\?\.modelSuggestion/);
 assert.match(app,/memory\?\.suggest/);
 assert.match(app,/if\(reusedDefaults\)/);
});
