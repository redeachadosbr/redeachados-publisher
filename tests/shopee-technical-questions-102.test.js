import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const source=path=>readFileSync(new URL('../'+path,import.meta.url),'utf8');

test('ficha de kits usa rótulos oficiais e não expõe números como pergunta',()=>{
 const translations=source('public/technical-ptbr.js');
 const backend=source('productOptimizer.js');
 assert.match(translations,/return original;\s*}\s*function value/);
 assert.doesNotMatch(translations,/return id\?'Atributo da categoria nº/);
 assert.match(backend,/officialAttributeName\(meta\)/);
 assert.match(backend,/nameMissing:!officialName/);
});
test('opcionais permanecem recolhidos e a pergunta pode ser recarregada sem publicar',()=>{
 const studio=source('public/optimizer-technical-studio.js');
 const app=source('public/app.js');
 assert.match(studio,/dispensáveis',optional\.length,[\s\S]*?'optional',optional,false/);
 assert.match(app,/Atualizar perguntas da Shopee/);
 assert.match(app,/if\(attr\.nameMissing\)/);
 assert.match(app,/option\.displayName\|\|option\.name/);
 assert.match(app,/await techRefreshSuggestions\(\)/);
 assert.match(app,/if\(same\(values,attr\.values\)\)return null/);
});
test('fontes da mesma SKU alimentam rascunhos, sem publicar atributos',()=>{
 const server=source('server.js');
 assert.match(server,/mergeWorkflowTechnicalAutofill\(auth\.shopId,itemId,modelId,sku,/);
 assert.match(server,/kitPrincipalTechnicalEvidence\(/);
 const store=source('shopeeOptimizationWorkflowStore.js');
 assert.match(store,/attr\.values\?\.length\|\|savedMap\.has\(id\)/);
 assert.match(store,/previous&&!previous\.enabled&&previous\.userDisabled/);
});
