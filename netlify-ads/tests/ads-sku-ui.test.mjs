import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const html=readFileSync(new URL('../site/index.html',import.meta.url),'utf8');
test('script inline permanece sintaticamente valido apos edicao da SKU',()=>{
 const scripts=[...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].map(x=>x[1]);
 assert.ok(scripts.length);
 for(const script of scripts)assert.doesNotThrow(()=>new Function(script));
});
test('interface permite editar SKU e confirma a troca preservando o cadastro',()=>{
 assert.match(html,/ads-sku-rename\.js/);
 assert.match(html,/\$\('pSku'\)\.readOnly=false;\$\('skuCorrectionHint'\)\.hidden=false/);
 assert.match(html,/Corrigir a SKU deste produto no Rede Achados Ads/);
 assert.match(html,/commitSkuCorrection\(plan\)/);
 assert.match(html,/plan\.adsSnapshots/);
 assert.match(html,/plan\.history/);
 assert.match(html,/plan\.changes/);
 assert.match(html,/plan\.preferences/);
 assert.match(html,/plan\.profitKeys/);
});
