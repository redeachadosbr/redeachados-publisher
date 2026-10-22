import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const css=readFileSync(new URL('../public/ads-manual.css',import.meta.url),'utf8');
const js=readFileSync(new URL('../public/ads-manual.js',import.meta.url),'utf8');
const html=readFileSync(new URL('../public/index.html',import.meta.url),'utf8');

test('editor GMV aberto ocupa linha completa e não estica cartões vizinhos',()=>{
 assert.match(css,/#tab-ads #adsSeoResults\.ads-seo-cards\{[\s\S]*?align-items:start!important/);
 assert.match(css,/#tab-ads #adsSeoResults>\.ads-seo-card\{[\s\S]*?height:auto!important/);
 assert.match(css,/\.ads-seo-card\.ads-card-expanded\{\s*grid-column:1\/-1!important/);
 assert.match(js,/root\.addEventListener\('toggle'/);
 assert.match(js,/card\?\.classList\.toggle\('ads-card-expanded',root\.open\)/);
 assert.match(js,/if\(other!==root\)other\.open=false/);
});
test('confirmação GMV usa checkbox com 18px e texto legível ocupando espaço restante',()=>{
 assert.match(css,/\.ads-manual-consent\{\s*display:grid!important;\s*grid-template-columns:19px minmax\(0,1fr\)!important/);
 assert.match(css,/\.ads-manual-consent input\[type="checkbox"\]\{[\s\S]*?width:18px!important/);
 assert.match(css,/\.ads-manual-consent>span\{[\s\S]*?white-space:normal!important/);
 assert.match(css,/\.ads-manual-fields>\.ads-manual-consent,[\s\S]*?grid-column:1\/-1!important/);
});
test('inputs GMV são responsivos, sem quebrar prévia e execução da API',()=>{
 assert.match(css,/@media\(max-width:720px\)/);
 assert.match(css,/grid-template-columns:minmax\(0,1fr\)!important/);
 assert.match(js,/\/api\/shopee\/ads\/product-roas\/preview/);
 assert.match(js,/\/api\/shopee\/ads\/product-roas\/create/);
 assert.match(js,/A campanha pode gerar cobranças reais/);
 assert.match(html,/ads-manual\.js\?v=/);
});
