import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const builder=readFileSync(new URL('../public/kit-builder.js',import.meta.url),'utf8');
const html=readFileSync(new URL('../public/index.html',import.meta.url),'utf8');

test('editar detalhes de uma SKU nao invalida um rascunho de kit ja salvo',()=>{
 const start=builder.indexOf('const refresh=(edited=false)=>{');
 const end=builder.indexOf("box.addEventListener('input',()=>refresh(true));",start);
 assert.ok(start>=0&&end>start,'handler de edicao por SKU deve existir');
 const edit=builder.slice(start,end);
 assert.match(edit,/if\(edited\)\{[\s\S]*?clearKitPublishApproval\(\);[\s\S]*?kitPersistSkuFacts\(\);/);
 assert.doesNotMatch(edit,/kitSaved\s*=\s*false/,'rascunho ja salvo nao deve ser bloqueado por dados por SKU');
});

test('a referencia em memoria so avanca apos confirmacao do salvamento por SKU',()=>{
 const start=builder.indexOf('function kitPersistSkuFacts(){');
 const end=builder.indexOf('let kitContentSku=',start);
 assert.ok(start>=0&&end>start);
 const save=builder.slice(start,end);
 assert.match(save,/await api\('\/api\/shopee\/kits\/drafts\/manual-facts'/);
 assert.match(save,/if\(prepared\?\.kit\?\.kitSku===kitSku&&serial===kitFactsSaveSerial\)/);
 assert.match(save,/prepared\.creative=\{\.\.\.prepared\.creative,manualFacts:\{\.\.\.facts\}\}/);
});

test('etapa 05 ainda usa ficha oficial da SKU principal e sincronizacao local',()=>{
 assert.match(builder,/globalThis\.RAKitOpenTechnicalEditor\?\.\(\{kitSku:prepared\.kit\.kitSku,sku\}\)/);
 assert.match(builder,/const factsChanged=\[\.\.\.allowed\]\.some/);
 assert.match(builder,/if\(factsChanged\)\{/);
 assert.match(builder,/button\.click\(\)/);
 assert.match(html,/kit-builder\.js\?v=20261031-ficha-tecnica-facts-sync-v7/);
});
