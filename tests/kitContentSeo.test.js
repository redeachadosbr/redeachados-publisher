import test from 'node:test';
import assert from 'node:assert/strict';
import {scoreKitSeoTitle,parseKitSeoResponse} from '../public/kit-seo-helper.js';
test('kit importa três títulos SEO distintos e uma descrição única',()=>{
 const titles=['Kit Elefante Musical e Chocalho Para Bebê 🎶','Kit Chocalho e Elefante Musical Brinquedos Para Bebê 🐘','🐘 Kit Brinquedo Musical Elefante com Chocalho para Diversão 🎶'];
 const content=titles.map((x,i)=>'TÍTULO '+(i+1)+': '+x).join('\n')+
  '\nDESCRIÇÃO:\n✨ Um conjunto infantil com elefante musical e chocalho.\n✅ BENEFÍCIOS\n• Diversão de brinquedos.\n💡 POR QUE COMPRAR\nDuas opções para brincar.\n📦 O QUE VAI NA EMBALAGEM\n• 1 elefante musical\n• 1 chocalho.';
 const parsed=parseKitSeoResponse(content);
 assert.equal(parsed.titles.length,3);
 assert.match(parsed.description,/BENEFÍCIOS/);
 const rank=scoreKitSeoTitle(parsed.titles[0].title,[{name:'Elefante Musical'},{name:'Chocalho'}]);
 assert(Number.isInteger(rank.score)&&rank.score>=0&&rank.score<=100);
 assert.match(rank.note,/não é ranking oficial/);
 assert.throws(()=>parseKitSeoResponse('TÍTULO: Único\nDESCRIÇÃO: curta'),/TÍTULO 1/);
});
