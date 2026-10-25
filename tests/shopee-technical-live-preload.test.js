import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';
const context={localStorage:{getItem:()=>null,setItem:()=>{}},console};
context.globalThis=context;
runInNewContext(readFileSync(new URL('../public/technical-memory.js',import.meta.url),'utf8'),context);
const memory=context.RATechnicalMemory;
const field=(name,inputType,values,options=[],allowedUnits=[])=>
 ({name,id:1,inputType,values,options,allowedUnits,formatType:allowedUnits.length?2:null});
test('API da Shopee recupera numero com unidade na Indicacao de uso sem inventar valor',()=>{
 const attr=field('Indicação de uso',3,[{valueId:0,name:'88',unit:'CM'}],[],['cm','mm']);
 const live=memory.liveDraft(attr);
 assert.equal(live.values[0].valueName,'88');
 assert.equal(live.values[0].unit,'cm');
 assert.equal(live.source,'shopee-live');
});
test('opcoes oficiais existentes, mesmo omitidas da arvore, retornam nos controles',()=>{
 const attr=field('Idade recomendada',1,[{valueId:123,name:'3 a 4 anos',unit:''}]);
 const live=memory.liveDraft(attr);
 assert.equal(live.values[0].valueId,123);
 assert.equal(attr.options[0].id,123);
 const battery=field('Bateria integrada',1,[{valueId:44,name:'Sim',unit:''}],[{id:44,name:'Sim'}]);
 assert.equal(memory.liveDraft(battery).values[0].valueName,'Sim');
});
test('sem valores oficiais de origem, nada e preenchido; sem reuso de outra SKU',()=>{
 assert.equal(memory.liveDraft(field('Indicação de uso',3,[])),null);
 assert.equal(memory.liveDraft(field('Idade recomendada',1,[{valueId:0,name:'3 anos'}])),null);
 assert.equal(memory.liveDraft(field('Indicação de uso',3,[{valueId:0,name:''}])),null);
});
test('editor usa Shopee como preenchimento de fallback sem sobrescrever rascunho manual',()=>{
 const src=readFileSync(new URL('../public/app.js',import.meta.url),'utf8');
 assert.match(src,/const live=memory\?\.liveDraft\?\.\(attr\)/);
 assert.match(src,/const existing=manualChoice\?/);
 assert.match(src,/manualChoice\?Boolean\(manual\.enabled\):Boolean\(existing\)/);
 assert.match(src,/suspiciousUsage/);
 assert.match(src,/if\(same\(values,attr\.values\)\)return null/);
 const html=readFileSync(new URL('../public/index.html',import.meta.url),'utf8');
 assert.match(html,/technical-memory\.js\?v=1\.0\.1-live-sku-preload/);
 assert.match(html,/app\.js\?v=1\.21\.74-live-technical-fields/);
});
