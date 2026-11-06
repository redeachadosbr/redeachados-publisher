import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
const source=readFileSync(new URL('../chrome-extension-shopee/visible-offers.js',import.meta.url),'utf8');
const ctx={URL,globalThis:null,location:{origin:'https://shopee.com.br',href:'https://shopee.com.br/search?keyword=caneca',pathname:'/search'},
 chrome:{runtime:{onMessage:{addListener(){}}}}};
ctx.globalThis=ctx;
vm.runInNewContext(source,ctx);
const parser=ctx.RAShopeeVisible;
test('coleta do Chrome reconhece rótulo mensal somente quando explícito',()=>{
 assert.equal(parser.monthlyEvidence('950 vendidos/mês').monthlySold,950);
 assert.equal(parser.monthlyEvidence('Vendido no mês: 1,2 mil').monthlySold,1200);
 assert.equal(parser.monthlyEvidence('1.001 vendidos nos últimos 30 dias').monthlySold,1001);
 assert.equal(parser.monthlyEvidence('950 vendidos').monthlySold,null);
 assert.equal(parser.parseCount('2,5 mil'),2500);
});
test('leitor visual reconhece links reais e mantém vendas históricas separadas',()=>{
 const ids=parser.ids('https://shopee.com.br/coqueteleira-inox-i.12345.67890');
 assert.equal(ids.shopId,'12345');assert.equal(ids.itemId,'67890');
 assert.equal(parser.historicalSales('1.000 vendidos'),1000);
 assert.equal(parser.historicalSales('Sem informações de vendas'),null);
 assert.equal(parser.ids('https://example.com/product/123/456'),null);
});

test('parser identifica a quantidade mensal quando vem após o período de 30 dias',()=>{
 assert.equal(parser.monthlyEvidence('Vendas 30d: 950').monthlySold,950);
 assert.equal(parser.monthlyEvidence('950 vendas/mês').monthlySold,950);
});

test('leitura visual so marca ID como visto depois de extrair os dados',()=>{
 const code=readFileSync(new URL('../chrome-extension-shopee/visible-offers.js',import.meta.url),'utf8');
 assert.match(code,/if\(product\)\{seen\.add\(id\);found\.push\(product\);\}/);
});

test('página com cards sem marcador mensal é considerada carregada, nunca Curva A/B',()=>{
 const source=readFileSync(new URL('../chrome-extension-shopee/visible-offers.js',import.meta.url),'utf8');
 const bg=readFileSync(new URL('../chrome-extension-shopee/background.js',import.meta.url),'utf8');
 assert.match(source,/seenCards\.add\(id\)/);
 assert.match(source,/visibleCards:seenCards\.size/);
 assert.match(bg,/visibleCards:Math\.max\(Number\(last\?\.visibleCards\|\|0\),merged\.size\)/);
 assert.match(bg,/restoreResearchWindow\(managerTab,nonce\)/);
 assert.match(bg,/chrome\.tabs\.reload\(tab\.id\)/);
 assert.doesNotMatch(bg,/chrome\.tabs\.create\(/);
});

test('Vendido/Mês lê exatamente a vitrine da Shopee com 1mil+ e números inteiros',()=>{
 assert.equal(parser.monthlyEvidence('1mil+ Vendido/Mês').monthlySold,1000);
 assert.equal(parser.monthlyEvidence('952 Vendido/Mês').monthlySold,952);
 assert.equal(parser.monthlyEvidence('946 Vendido/Mês').monthlySold,946);
 assert.equal(parser.monthlyEvidence('931 Vendido/Mês').monthlySold,931);
 assert.equal(parser.monthlyEvidence('1mil+ Vendido').monthlySold,null);
 assert.equal(parser.parseCount('1mil+'),1000);
});
test('leitor procura Vendido/Mês no cartão pai quando o link inclui só o título',()=>{
 assert.match(source,/function cardFor\(link,identity\)/);
 assert.match(source,/const card=cardFor\(link,identity\)/);
});

test('o leitor busca rótulo mensal no ancestral do mesmo anúncio, sem usar outro cartão',()=>{
 const href='https://shopee.com.br/processador-manual-i.100.200';
 const cardText='Mini Processador de Alimentos Manual R$ 13,98 3mil+ Vendido/Mês';
 const name={innerText:'Mini Processador de Alimentos Manual'};
 const link={innerText:'Mini Processador de Alimentos Manual',textContent:'Mini Processador de Alimentos Manual',
  getAttribute:()=>href,closest(){return inner;},parentElement:null,
  querySelectorAll:()=>[]};
 const inner={innerText:'Mini Processador de Alimentos Manual R$ 13,98',
  textContent:'Mini Processador de Alimentos Manual R$ 13,98',
  parentElement:null,querySelectorAll:()=>[link],
  querySelector:()=>name};
 const outer={innerText:cardText,textContent:cardText,parentElement:null,
  querySelectorAll:()=>[link],querySelector:()=>name};
 const grid={innerText:cardText+' Processador 300 watts R$ 161,41 5mil+ Vendido/Mês',
  textContent:cardText+' Processador 300 watts R$ 161,41 5mil+ Vendido/Mês',
  parentElement:null,
  querySelectorAll:()=>[link,{getAttribute:()=>'/product/101/201'}]};
 link.parentElement=inner;inner.parentElement=outer;outer.parentElement=grid;
 const doc={body:{innerText:'Resultado da pesquisa'},
  querySelectorAll:selector=>selector==='a[href]'?[link]:[]};
 const local={URL,location:ctx.location,document:doc,globalThis:null,
  chrome:{runtime:{onMessage:{addListener(){}}}}};
 local.globalThis=local;
 vm.runInNewContext(source,local);
 const response=local.RAShopeeVisible.extract();
 assert.equal(response.offers.length,1);
 assert.equal(response.offers[0].monthlySold,3000);
 assert.equal(response.offers[0].monthlyPeriod,'month');
 assert.equal(response.offers[0].priceMin,13.98);
 assert.equal(response.offers[0].productName,'Mini Processador de Alimentos Manual');
});
test('a extensão lê 3mil+ e 2mil+ na mesma regra mensal',()=>{
 assert.equal(parser.monthlyEvidence('3mil+ Vendido/Mês').monthlySold,3000);
 assert.equal(parser.monthlyEvidence('2mil+ Vendido/Mês').monthlySold,2000);
});

test('Ponte registra rótulo mensal visível separadamente da contagem comprovada',()=>{
 assert.match(source,/monthlyLabelsVisible:labelInPage/);
 assert.match(source,/monthlyLabelsInCards/);
 assert.match(source,/monthlyLabelVisible/);
});

test('rolagem acumula anúncios e Vendido/Mês carregados fora da primeira dobra',async()=>{
 let pos=0;
 const pages=Array.from({length:4},(_,page)=>
  Array.from({length:4},(_,slot)=>{
   const id=String(5000+page*4+slot);
   const label=(page%2?'1mil+':'4mil+')+' Vendido/Mês';
   const title='Balança Digital de Cozinha 10kg Alta Precisão';
   const href='https://shopee.com.br/balanca-cozinha-i.'+String(700+slot)+'.'+id;
   const link={innerText:title,textContent:title,getAttribute:k=>k==='href'?href:null,
    closest:()=>card,parentElement:null,querySelectorAll:()=>[]};
   const card={innerText:title+' R$ 16,90 '+label,
    textContent:title+' R$ 16,90 '+label,
    querySelector:selector=>selector==='img[alt]'?null:{innerText:title},
    querySelectorAll:()=>[link],parentElement:null};
   link.parentElement=card;
   return link;
  }));
 const win={scrollY:0,innerHeight:700,scrollTo(x,y){pos=Math.min(3,Math.floor(y/500));this.scrollY=y;}};
 const doc={documentElement:{scrollHeight:2400},body:{scrollHeight:2400,
  get innerText(){return pages[pos].map(x=>x.parentElement.innerText).join(' ');}},
  querySelectorAll:selector=>selector==='a[href]'?pages[pos]:[]};
 const local={URL,location:ctx.location,document:doc,window:win,globalThis:null,
  chrome:{runtime:{onMessage:{addListener(){}}}},setTimeout:(fn)=>fn()};
 local.globalThis=local;
 vm.runInNewContext(source,local);
 const result=await local.RAShopeeVisible.scanPage();
 assert.equal(result.ok,true);
 assert.ok(result.offers.length>=10);
 assert.ok(result.monthlyCards>=10);
 assert.ok(result.offers.every(x=>x.priceMin===16.9));
 assert.ok(result.offers.every(x=>x.monthlyPeriod==='month'));
});
