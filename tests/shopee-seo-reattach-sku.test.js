import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const bridge=readFileSync(new URL('../public/seo-chatgpt-bridge.js',import.meta.url),'utf8');
const studio=readFileSync(new URL('../public/title-studio.js',import.meta.url),'utf8');
const index=readFileSync(new URL('../public/index.html',import.meta.url),'utf8');

test('SEO mantém a requisição por SKU quando a etapa do Motor Matriz é reaberta',()=>{
 assert.match(bridge,/const seoRequests=new Map\(\),seoUnconfirmedResults=new Map\(\)/);
 assert.match(bridge,/const active=seoRequests\.get\(id\)/);
 assert.match(bridge,/if\(active\)\{/);
 assert.match(bridge,/return active\.promise/);
 assert.match(bridge,/seoUnconfirmedResults\.set\(id,result\)/);
 assert.match(bridge,/function hasPending\(data\)/);
 assert.match(studio,/RASeoChatGPT\?\.hasPending\?\.\(data\)/);
 assert.match(studio,/void generateTitles\(false\)/);
});
test('resultado SEO preservado até o Manager salvar e confirmar ACK da mesma SKU',()=>{
 assert.match(bridge,/seoUnconfirmedResults\.delete\(/);
 assert.match(bridge,/RA_SITE_SEO_ACK/);
 assert.match(bridge,/RA_EXTENSION_SEO_START_RESULT/);
 assert.match(index,/seo-chatgpt-bridge\.js\?v=1\.0\.8-persistent-sku-seo/);
 assert.match(index,/title-studio\.js\?v=1\.21\.26-reattach-seo/);
});
