import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
const source=readFileSync(new URL('../chrome-extension-shopee/visible-offers.js',import.meta.url),'utf8');
const ctx={globalThis:null,location:{origin:'https://shopee.com.br',href:'https://shopee.com.br/search?keyword=caneca',pathname:'/search'},
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
