import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';

const script=readFileSync(new URL('../public/sidebar-collapse.js',import.meta.url),'utf8');
const css=readFileSync(new URL('../public/sidebar-collapse.css',import.meta.url),'utf8');
const html=readFileSync(new URL('../public/index.html',import.meta.url),'utf8');

function environment({desktop=true,stored='0'}={}){
 const storage=new Map([['redeachadosbr:sidebar-collapsed:v1',stored]]);
 const attrs=new Map(),classes=new Set(),events=new Map();
 const linkAttrs=new Map();
 const link={title:'',querySelector:selector=>selector==='.nav-name'?{textContent:'Shopee Ads'}:null,
  hasAttribute:name=>linkAttrs.has(name),setAttribute:(name,value)=>linkAttrs.set(name,value)};
 const sidebar={querySelectorAll:()=>[link]};
 const button={title:'',setAttribute:(name,value)=>attrs.set(name,value),
  addEventListener:(name,fn)=>events.set(name,fn)};
 const ctx={
  document:{
   getElementById:id=>id==='sidebarCollapse'?button:id==='appSidebar'?sidebar:null,
   body:{classList:{toggle:(name,on)=>on?classes.add(name):classes.delete(name)}}
  },
  window:{matchMedia:()=>({matches:desktop}),
   localStorage:{getItem:key=>storage.get(key)??null,setItem:(key,value)=>storage.set(key,value)}}
 };
 runInNewContext(script,ctx);
 return {button,attrs,classes,events,storage,link,linkAttrs};
}
test('botão global recolhe menu e conserva a preferência no navegador',()=>{
 const x=environment();
 assert.equal(x.attrs.get('aria-pressed'),'false');
 x.events.get('click')();
 assert.ok(x.classes.has('sidebar-collapsed'));
 assert.equal(x.attrs.get('aria-pressed'),'true');
 assert.equal(x.attrs.get('aria-label'),'Expandir menu lateral');
 assert.equal(x.storage.get('redeachadosbr:sidebar-collapsed:v1'),'1');
 x.events.get('click')();
 assert.equal(x.classes.has('sidebar-collapsed'),false);
 assert.equal(x.storage.get('redeachadosbr:sidebar-collapsed:v1'),'0');
});
test('opção recolhida é restaurada e ícones mantêm rótulos acessíveis',()=>{
 const x=environment({stored:'1'});
 assert.ok(x.classes.has('sidebar-collapsed'));
 assert.equal(x.link.title,'Shopee Ads');
 assert.equal(x.linkAttrs.get('aria-label'),'Shopee Ads');
});
test('controle de desktop não interfere no menu de gaveta do celular',()=>{
 const x=environment({desktop:false});
 x.events.get('click')();
 assert.equal(x.storage.get('redeachadosbr:sidebar-collapsed:v1'),'0');
});
test('estilos acomodam menu recolhido na Shopee Ads e nas outras páginas',()=>{
 assert.match(html,/id="sidebarCollapse"/);
 assert.match(html,/sidebar-collapse\.css\?v=/);
 assert.match(html,/sidebar-collapse\.js\?v=/);
 assert.match(css,/body\.sidebar-collapsed \.shell\.app-layout/);
 assert.match(css,/body\.view-ads\.sidebar-collapsed \.shell\.app-layout/);
 assert.match(css,/grid-template-columns:76px minmax\(0,1fr\)!important/);
 assert.match(css,/body\.sidebar-collapsed \.workspace-content/);
 assert.match(css,/@media\(max-width:980px\)/);
});
