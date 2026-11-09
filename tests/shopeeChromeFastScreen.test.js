import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
const code=readFileSync(new URL('../chrome-extension-shopee/background.js',import.meta.url),'utf8');
const build=()=>{
 const listener=()=>{};
 const chrome={runtime:{onInstalled:{addListener:listener},onStartup:{addListener:listener},
  onMessage:{addListener:listener}},tabs:{onActivated:{addListener:listener},
  onUpdated:{addListener:listener},onRemoved:{addListener:listener}},
  windows:{onRemoved:{addListener:listener}}};
 const ctx={chrome,console,URL,setTimeout,clearTimeout,globalThis:null};
 ctx.globalThis=ctx;
 vm.runInNewContext(code+'\nglobalThis.__fastScreen={costFirstReject,highMonthlyShopCount,MAX_SEARCH_PAGES,PRICE_SCREEN_SAMPLE};',ctx);
 return ctx.__fastScreen;
};
const offer=(shop,item,price,monthly=null,title='Dispenser Lavanderia Sabao Liquido')=>({
 shopId:String(shop),itemId:String(item),productName:title,
 priceMin:price,monthlySold:monthly,monthlyPeriod:monthly===null?null:'month'
});
test('triagem financeira exige 5 anúncios distintos muito equivalentes',()=>{
 const c=build(),job={query:'dispenser lavanderia',minSkuCost:40};
 const group=Array.from({length:5},(_,i)=>offer(100+i,900+i,25+i));
 assert.equal(c.costFirstReject(job,group),true);
 assert.equal(c.costFirstReject(job,group.slice(0,4)),false);
 assert.equal(c.costFirstReject(job,[...group.slice(0,4),offer(105,905,43)]),false);
 assert.equal(c.costFirstReject(job,[...group.slice(0,4),offer(105,905,5)]),false);
 assert.equal(c.costFirstReject({...job,minSkuCost:null},group),false);
 assert.equal(c.costFirstReject(job,group.map(o=>({...o,productName:'Fone Sem Fio Bluetooth'}))),false);
});
test('curva exige 2 lojas distintas com >=700 vendidos/mês',()=>{
 const c=build(),q='dispenser lavanderia';
 assert.equal(c.highMonthlyShopCount(q,[offer(5,1,22,900),offer(5,2,23,950)]),1);
 assert.equal(c.highMonthlyShopCount(q,[offer(5,1,22,900),offer(6,3,24,700)]),2);
 assert.equal(c.highMonthlyShopCount(q,[offer(5,1,22,900),offer(6,3,24,699)]),1);
 const total=offer(6,3,24,1200);total.monthlyPeriod=null;
 assert.equal(c.highMonthlyShopCount(q,[offer(5,1,22,900),total]),1);
});
test('busca limitada a 3 páginas e 5 preços para triagem inicial',()=>{
 const c=build();
 assert.equal(c.MAX_SEARCH_PAGES,2);
 assert.equal(c.PRICE_SCREEN_SAMPLE,5);
 assert.match(code,/for\(let page=0;page<MAX_SEARCH_PAGES;page\+\+\)/);
 assert.match(code,/labelsSeen>0&&labelsInCards===0/);
});
