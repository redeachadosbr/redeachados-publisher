import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';

const studio=readFileSync(new URL('../public/title-studio.js',import.meta.url),'utf8');
const scoreSource=readFileSync(new URL('../public/seo-title-scoring.js',import.meta.url),'utf8');
const promptSource=readFileSync(new URL('../public/seo-chatgpt-bridge.js',import.meta.url),'utf8');

function guard(title,wedropName){
 const first=studio.indexOf('  const productDimensions=');
 const last=studio.indexOf('  // One in-flight generation',first);
 assert.ok(first>=0&&last>first,'função de verificação deve existir');
 const scope={};
 vm.runInNewContext(
  "const clean=s=>String(s||'').normalize('NFC').replace(/\\s+/g,' ').trim();\n"+
  studio.slice(first,last)+
  "\nglobalThis.guard=titleWithoutUnverifiedDimensions;",scope);
 return scope.guard(title,wedropName);
}

test('SKU CT0153: remove 36x66 cm vindos somente da pesquisa sem bloquear a conferência',()=>{
 const fromChat='Tapete para Box Retangular 🛁 Antiderrapante com Ventosas para Piso do Banheiro, em PVC, 36x66 cm, Cor Sortida Clean Tech';
 const out=guard(fromChat,'Tapete para Box Retangular');
 assert.equal(out.removed,true);
 assert.doesNotMatch(out.title,/36x66/);
 assert.ok([...out.title].length>=100&&[...out.title].length<=120);
 assert.match(out.title,/Cor Sortida Clean Tech/);
});

test('medida validada no nome comercial da própria WeDrop permanece',()=>{
 const fromChat='Tapete para Box Retangular 🛁 Antiderrapante com Ventosas para Piso do Banheiro, em PVC, 36x66 cm, Cor Sortida Clean Tech';
 const exact=guard(fromChat,'Tapete para Box Retangular 36x66 cm');
 assert.equal(exact.removed,false);
 assert.match(exact.title,/36x66 cm/);
 const otherSku=guard(fromChat,'Tapete para Box Retangular 40x70 cm');
 assert.equal(otherSku.removed,true);
});

test('recebimento ChatGPT preenche automaticamente o rascunho, mas não marca revisão nem publica',()=>{
 assert.match(studio,/const recommended=regenerate\(\)/);
 assert.match(studio,/onChoose\(recommended\.title\)/);
 assert.match(studio,/data\.stages\?\.find\(x=>x\.key==='seo'\)\?\.reviewed!==true/);
 assert.match(studio,/Registrar etapa como conferida/);
 assert.doesNotMatch(studio,/RASeoSaveReview\(/);
});

test('título de 110 caracteres continua selecionável após remover medida não comprovada',()=>{
 const scope={};vm.runInNewContext(scoreSource,scope);
 const title='Tapete para Box Retangular 🛁 Antiderrapante com Ventosas para Piso do Banheiro, em PVC, Cor Sortida Clean Tech';
 const score=scope.RASeoTitleScore.scoreTitle(title,{productTitle:'Tapete para Box Retangular'});
 assert.ok(score.length>=100&&score.length<=120);
 const ranked=scope.RASeoTitleScore.rank([1,2,3,4].map(i=>({
  title:title.replace('Clean Tech','Clean Tech '+i),valid:true
 })),{productTitle:'Tapete para Box Retangular'});
 assert.equal(ranked[0].usable,true);
 assert.equal(ranked[0].ideal,true);
});

test('prompt não confunde dimensões logísticas e atributos de concorrentes',()=>{
 assert.match(promptSource,/medidasBrutasDoCatalogoNaoConfirmamDimensoesDoProduto/);
 assert.match(promptSource,/Medidas de embalagem, concorrentes, pesquisa SEO e título antigo NÃO comprovam/);
});
