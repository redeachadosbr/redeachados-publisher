import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const source=readFileSync(new URL('../site/ads-simple-search.js',import.meta.url),'utf8');
const simple=readFileSync(new URL('../site/simple-dashboard.js',import.meta.url),'utf8');
const html=readFileSync(new URL('../site/index.html',import.meta.url),'utf8');
const css=readFileSync(new URL('../site/ads-friendly.css',import.meta.url),'utf8');

test('duas abas, CSS claro, script de busca e financeiro preservado em Produtos',()=>{
 assert.doesNotThrow(()=>new Function(source));
 assert.doesNotThrow(()=>new Function(simple));
 assert.match(html,/ads-friendly\.css/);
 assert.match(html,/ads-simple-search\.js/);
 assert.match(html,/color-scheme" content="light"/);
 assert.match(css,/#f4f7fb/);
 assert.doesNotMatch(simple,/tab\.insertAdjacentHTML\('afterbegin','<button class="tab" data-tab="painel"/);
 assert.doesNotMatch(simple,/id="simpleModeToggle"/);
 assert.match(simple,/getElementById\('produtos'\)\.appendChild\(panel\)/);
 assert.match(simple,/switchTab\('produtos'\);/);
 assert.match(simple,/id="simpleFinanceForm"/);
 assert.match(simple,/getHistory\(\)/);
});

function makeSearchHarness(){
 const events=new Map(),nodes=new Map();
 const get=id=>{
  if(!nodes.has(id))nodes.set(id,{
   id,value:'',textContent:'',innerHTML:'',hidden:false,dataset:{},
   attributes:{},style:{},
   addEventListener(type,fn){events.set(id+':'+type,fn)},
   setAttribute(k,v){this.attributes[k]=v},
   querySelectorAll(){return []},querySelector(){return null},
   contains(){return true},focus(){},scrollIntoView(){},
   dispatchEvent(){events.get(id+':change')?.()},
   closest(){return id==='changeSku'?field:null}
  });
  return nodes.get(id);
 };
 const field={insertBefore(node){this.wrapper=node},querySelector:()=>label};
 const label={textContent:'Produto / SKU',htmlFor:'changeSku'};
 const products=[
  {sku:'A-111',name:'Capa de Chuva Motoqueiro'},
  {sku:'B-222',name:'Bomba USB Galão Água'},
  {sku:'C-333',name:'Pote Organizador'},
 ];
 const doc={getElementById:get,createElement:()=>get('wrapper'),addEventListener:(n,fn)=>events.set('document:'+n,fn),
  activeElement:null};
 const win={};
 const fn=new Function('document','window','readProducts','refreshChangeSelects','Event',source);
 fn(doc,win,()=>products,()=>{},class Event{constructor(type){this.type=type}});
 return {get,events,win};
}
test('busca parcial mostra somente os produtos correspondentes, não o dropdown completo',()=>{
 const {get,events,win}=makeSearchHarness();
 get('changeSkuSearch').value='bomba';
 events.get('changeSkuSearch:input')();
 assert.equal(get('changeSkuResults').hidden,false);
 assert.match(get('changeSkuResults').innerHTML,/B-222/);
 assert.doesNotMatch(get('changeSkuResults').innerHTML,/A-111|C-333/);
 assert.equal(get('changeSku').value,'');
 win.RedeAdsProductSearch.choose('B-222');
 assert.equal(get('changeSku').value,'B-222');
 assert.match(get('changeSkuChosen').textContent,/B-222/);
 assert.equal(get('changeSkuResults').hidden,true);
});
test('digitar após escolher limpa SKU antiga e evita gravação no produto errado',()=>{
 const {get,events,win}=makeSearchHarness();
 win.RedeAdsProductSearch.choose('A-111');
 get('changeSkuSearch').value='pote';
 events.get('changeSkuSearch:input')();
 assert.equal(get('changeSku').value,'');
 assert.match(get('changeSkuResults').innerHTML,/C-333/);
 assert.equal(get('changeSkuChosen').hidden,true);
});
test('sem resultados informa usuário sem reabrir lista geral',()=>{
 const {get,events}=makeSearchHarness();
 get('changeSkuSearch').value='nao existe produto';
 events.get('changeSkuSearch:input')();
 assert.equal(get('changeSkuResults').hidden,true);
 assert.match(get('changeSkuSearchHint').textContent,/Nenhum produto encontrado/);
});
