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
 assert.match(bg,/Number\(result\.visibleCards\)>0/);
 assert.match(bg,/restoreResearchWindow\(managerTab,nonce\)/);
 assert.match(bg,/chrome\.tabs\.reload\(tab\.id\)/);
 assert.doesNotMatch(bg,/chrome\.tabs\.create\(/);
});
