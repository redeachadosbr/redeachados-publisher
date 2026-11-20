import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';

const source=readFileSync(new URL('../site/simple-dashboard.js',import.meta.url),'utf8');
const index=readFileSync(new URL('../site/index.html',import.meta.url),'utf8');
const localISO=()=>{
 const p=new Intl.DateTimeFormat('en-US',{timeZone:'America/Sao_Paulo',year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(new Date());
 const d=Object.fromEntries(p.map(x=>[x.type,x.value]));return d.year+'-'+d.month+'-'+d.day;
};
const relative=(date,days)=>new Date(Date.parse(date+'T15:00:00Z')+days*86400000).toISOString().slice(0,10);
const stamp=(date)=>date+'T15:00:00Z';
const today=localISO(),twoWeeksAgo=relative(today,-14);
const products=[
 {sku:'SKU-A',name:'Produto mais recente',curve:'A',market:39.90,adsStatus:'active'},
 {sku:'SKU-B',name:'Produto anterior',curve:'B',market:25.99,adsStatus:'removed'},
 {sku:'SKU-C',name:'Produto sem historico',curve:'',market:null,adsStatus:'unknown'}
];
const changes=[
 {id:'c1',sku:'SKU-A',timestamp:stamp(today),changes:['Capa','ROAS alvo']},
 {id:'c2',sku:'SKU-B',timestamp:stamp(twoWeeksAgo),changes:['Preço']}
];
const ledger=[{id:'f1',savedAt:stamp(today),data:{kind:'simple_finance_v1',sku:'SKU-A',
 periodStart:relative(today,-7),periodEnd:relative(today,-1),revenueNet:150,
 wedropCost:100,adsSpend:20,otherCosts:5,confirmed:true}}];
const listeners={};
const dom=new Map();
const makeNode=(id)=>({
 id,value:id==='simplePeriod'?'all':id==='simpleRecent'?'all':'',
 textContent:'',className:'',innerHTML:'',options:[],checked:false,open:false,
 addEventListener(type,fn){listeners[id+':'+type]=fn},
 reset(){},querySelector(){return {addEventListener(){}}},
 querySelectorAll(){return []},scrollIntoView(){},
 insertAdjacentElement(){},insertAdjacentHTML(){},appendChild(child){this.child=child},
 classList:{add(){},remove(){},toggle(){return true}}
});
const get=id=>{if(!dom.has(id))dom.set(id,makeNode(id));return dom.get(id)};
const document={
 head:{append(){}},
 body:{classList:{add(){},contains(){return true},toggle(){return true}}},
 createElement:tag=>makeNode('created-'+tag),
 querySelector:sel=>get(sel),
 getElementById:get
};
const context={
 document,
 getHistory:()=>ledger,
 setHistory:()=>true,
 getChanges:()=>changes,
 readProducts:()=>products,
 effectiveAdsStatus:p=>p.adsStatus,
 switchTab:()=>{},
 Intl,Date,Math,Number,String,Array,Object,Map,Set,RegExp,JSON,
 console
};
test('valida sintaxe, instalação do script e filtros no HTML',()=>{
 assert.doesNotThrow(()=>new Function(source));
 assert.match(index,/simple-dashboard\.js/);
 assert.match(index,/id="historyRecentFilter"/);
 assert.match(source,/historyRecentFilter/);
});
test('produtos lê curva e média do cadastro, ordena recentes e apura valor conferido',()=>{
 runInNewContext(source,context);
 const html=get('simpleProductRows').innerHTML;
 assert.ok(html.indexOf('SKU-A')<html.indexOf('SKU-B'));
 assert.ok(html.indexOf('SKU-B')<html.indexOf('SKU-C'));
 assert.match(html,/Curva A/);
 assert.match(html,/Curva B/);
 assert.match(html,/R\$ 39,90|R\$ 39,90/);
 assert.match(html,/Não informado/);
 assert.match(html,/Capa \+ ROAS alvo/);
 assert.equal(get('sNet').textContent.replace(/\s/g,'').replace(/\u00a0/g,''),'R$25,00');
});
test('filtro hoje, 7, 15 dias e sem alterações trabalha por SKU',()=>{
 const box=get('simpleRecent');
 box.value='today';listeners['simpleRecent:change']();
 let h=get('simpleProductRows').innerHTML;
 assert.match(h,/SKU-A/);assert.doesNotMatch(h,/SKU-B|SKU-C/);
 box.value='7';listeners['simpleRecent:change']();
 h=get('simpleProductRows').innerHTML;
 assert.match(h,/SKU-A/);assert.doesNotMatch(h,/SKU-B|SKU-C/);
 box.value='15';listeners['simpleRecent:change']();
 h=get('simpleProductRows').innerHTML;
 assert.match(h,/SKU-A/);assert.match(h,/SKU-B/);assert.doesNotMatch(h,/SKU-C/);
 box.value='none';listeners['simpleRecent:change']();
 h=get('simpleProductRows').innerHTML;
 assert.match(h,/SKU-C/);assert.doesNotMatch(h,/SKU-A|SKU-B/);
 assert.equal(get('sNet').textContent,'—');
});
