'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const sandbox={URL};
vm.runInNewContext(fs.readFileSync('oferta-sources-visual-v15.js','utf8'),sandbox,{timeout:2000});
const M=sandbox.OBSourcesVisualV15;
assert.ok(M&&typeof M.init==='function'&&typeof M.stateFor==='function');
assert.equal(M.stateFor('Página lida'),'read');
assert.equal(M.stateFor('Falha de acesso'),'error');
assert.equal(M.stateFor('HTTP 403 - Erro'),'error');
assert.equal(M.stateFor('Não verificada'),'pending');
assert.equal(M.stateFor(''),'pending');
const code=fs.readFileSync('oferta-sources-visual-v15.js','utf8');
assert.ok(code.includes('sourcesGrid')&&code.includes('MutationObserver'));
assert.ok(code.includes('aria-pressed')&&code.includes('card.hidden='));
assert.ok(code.includes('Uma página acessível não garante preços ou ofertas confirmadas.'));
const styles=fs.readFileSync('oferta-sources-visual-v15.css','utf8');
for(const text of ['.obv-source-card','[data-obv-source-state="error"]','[data-obv-source-state="pending"]','prefers-reduced-motion']){
 assert.ok(styles.includes(text),text);
}
console.log('OB_V15_SOURCES_VISUAL_STATUS_FILTERS_PASS');