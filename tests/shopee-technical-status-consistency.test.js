import {readFileSync} from 'node:fs';
import test from 'node:test';
import assert from 'node:assert/strict';
import '../public/technical-status.js';

const compute=globalThis.RATechnicalStatus.compute;
const attrs=Array.from({length:17},(_,i)=>({
 id:i+1,mandatory:i<2,conditional:false,
 values:[1,3,4].includes(i+1)?[{name:'Preenchido'}]:[]
}));
const changes=[2,5,6,7,8,9].map(attributeId=>({
 attributeId,values:[{valueId:0,valueName:'Valor confirmado'}]
}));
test('tela do patinete distingue 3 já na Shopee, 6 propostas, nenhum obrigatório pendente',()=>{
 const s=compute({attributes:attrs,changes,reviewed:false});
 assert.equal(s.total,17);
 assert.equal(s.inShopee,3);
 assert.equal(s.prepared,6);
 assert.equal(s.filled,9);
 assert.equal(s.mandatoryMissing,0);
 assert.equal(s.optionalTotal,15);
 assert.equal(s.optionalUsed,7);
 assert.equal(s.optionalRemaining,8);
 assert.equal(s.readyToReview,true);
 assert.equal(s.reviewed,false,'9 campos cobertos não significam revisão registrada');
});
test('campos opcionais em branco não bloqueiam nem contam como campos obrigatórios',()=>{
 const s=compute({attributes:[{id:1,mandatory:true,values:[{name:'Sim'}]},
   {id:2,mandatory:false,values:[]},{id:3,mandatory:false,values:[]}],changes:[]});
 assert.equal(s.readyToReview,true);
 assert.equal(s.mandatoryMissing,0);
 assert.equal(s.optionalRemaining,2);
 assert.equal(s.filled,1);
});
test('um obrigatório ausente bloqueia, mesmo quando existe sugestão opcional',()=>{
 const s=compute({attributes:[{id:1,mandatory:true,values:[]},{id:2,mandatory:false,values:[]}],
  changes:[{attributeId:2,values:[{valueId:0,valueName:'Teste'}]}]});
 assert.equal(s.mandatoryMissing,1);
 assert.equal(s.readyToReview,false);
});
test('divergência resolvida pelo rascunho não reaparece; dependência inativa é ignorada',()=>{
 const s=compute({attributes:[
 {id:1,mandatory:true,values:[{name:'Velho'}]},
 {id:2,mandatory:false,conditional:true,values:[]}],
 changes:[{attributeId:1,values:[{valueId:0,valueName:'Azul'}]}],
 conflicts:[{attributeId:1,recommended:'azul'},{attributeId:2,recommended:'Outro'}]});
 assert.equal(s.conflicts,0);
 assert.equal(s.total,1);
 assert.equal(s.inShopee,1);
 assert.equal(s.prepared,1);
 assert.equal(s.filled,1,'uma alteração no atributo existente não aumenta os campos preenchidos');
});
test('visual não trata opcionais não preenchidos como pendência e separa revisão da API',()=>{
 const app=readFileSync(new URL('../public/app.js',import.meta.url),'utf8');
 const studio=readFileSync(new URL('../public/optimizer-technical-studio.js',import.meta.url),'utf8');
 const html=readFileSync(new URL('../public/index.html',import.meta.url),'utf8');
 assert.match(app,/RATechnicalStatus\?\.compute/);
 assert.match(studio,/RATechnicalStatus\?\.compute/);
 assert.match(studio,/Opcionais dispensáveis/);
 assert.match(app,/campos opcionais podem permanecer vazios|campo\(s\) opcionais podem permanecer vazios/);
 assert.doesNotMatch(studio,/number\('review',checked\+'\/'/);
 assert.match(html,/technical-status\.js\?v=/);
});
