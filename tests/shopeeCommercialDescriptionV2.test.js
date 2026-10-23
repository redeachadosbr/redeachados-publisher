import test from 'node:test';
import assert from 'node:assert/strict';
import {composeShopeeDescription,isGenericShopeeDescription,isCommercialDescription} from '../shopeeDescriptionComposer.js';
import {validateContentRules} from '../shopeeOptimizationWorkflow.js';

const moto={
 record:{title:'Moto Elétrica Infantil 6V Vintage - Vermelha',description:''},
 supplier:{product_data:{name:'Moto Elétrica Infantil 6V Vintage - Vermelha',
  brand:'UNITOYS',description:'Material: plástico. Idade indicada: a partir de 3 anos. Bateria recarregável de 6V. Motor 380 W. Carregador 220 V.'}},
 sourceText:'REGISTRO INMETRO: 014015/2025\nAceleração por pedal. Velocidade até 3 km/h.'
};
test('SKU 3747: descrição persuasiva e organizada com fatos da WeDrop e CTA',()=>{
 const out=composeShopeeDescription(moto);
 assert.equal(out.valid,true);
 assert.ok(out.characterCount>=300);
 for(const term of ['Vermelha','6 V','UNITOYS','plástico','3 anos','pedal','🌟 Benefícios que fazem a diferença','⚙️ Características','🛒'])
  assert.ok(out.description.includes(term),'Esperado no texto: '+term);
 for(const unsafe of ['220 V','380 W','5 dúvidas frequentes','10 motivos para comprar agora','014015/2025'])
  assert.ok(!out.description.includes(unsafe),'Não usar: '+unsafe);
});

test('não inventa potência, selos ou medidas logísticas sem fonte',()=>{
 const out=composeShopeeDescription({
  record:{title:'Moto Elétrica Infantil 6V Vintage - Vermelha'},
  supplier:{product_data:{name:'Moto Elétrica Infantil 6V Vintage - Vermelha',catalogMeasurements:{heightCm:37,widthCm:53,lengthCm:36}}}
 });
 assert.equal(out.valid,true);
 assert.ok(!/380 W|220 V|INMETRO|37 x 53|36 x 53/.test(out.description));
});

test('usa informação salva na caixa da WeDrop para produtos de outras categorias',()=>{
 const out=composeShopeeDescription({
  record:{title:'Cafeteira Italiana 300 ml'},
  supplier:{product_data:{name:'Cafeteira Italiana 300 ml'}},
  sourceText:'Material: alumínio.'
 });
 assert.equal(out.valid,true);
 assert.match(out.description,/300 ml/);
 assert.match(out.description,/alumínio/);
 assert.match(out.description,/preparar café/);
});

test('padrão antigo repetitivo pode ser identificado para migração',()=>{
 const old='✨ Conheça a moto, uma opção para quem busca praticidade e quer conferir as características do produto.\nInformações reunidas em um anúncio\nConsulte dados e medidas.';
 assert.equal(isGenericShopeeDescription(old),true);
 assert.equal(isGenericShopeeDescription('Descrição manual: moto infantil para brincar'),false);
});

test('descrição manual curta pode ser validada sem FAQ ou CTA padronizado',()=>{
 const manual='🏍️ Moto infantil vermelha 6V para brincadeiras. 🎁 Conheça os detalhes do produto e escolha sua versão!';
 assert.doesNotThrow(()=>validateContentRules({description:manual}));
 assert.equal(isCommercialDescription(manual),true);
});

test('edição manual extensa fica salva inteira, sem limite arbitrário de tamanho',()=>{
 const manual='✨ Moto infantil e detalhes confirmados.\n'.repeat(220);
 assert.ok([...manual].length>3000);
 assert.doesNotThrow(()=>validateContentRules({description:manual}));
 assert.equal(isCommercialDescription(manual),true);
});

test('descrição mantém seções harmoniosas e CTA contextual sem repetir FAQ artificial',()=>{
 const result=composeShopeeDescription(moto);
 const text=result.description;
 const title=text.indexOf('✨ Moto Elétrica Infantil');
 const benefits=text.indexOf('🌟 Benefícios que fazem a diferença');
 const specs=text.indexOf('⚙️ Características');
 const cta=text.lastIndexOf('🛒');
 assert.ok(title>=0&&benefits>title&&specs>benefits&&cta>specs);
 assert.ok(text.split('\n\n').length>=4);
 assert.match(text,/passeios|aventuras|brincadeiras/);
});


test('benefícios comerciais têm explicação desenvolvida, não frases soltas',()=>{
 const out=composeShopeeDescription(moto);
 const section=out.description.split('🌟 Benefícios que fazem a diferença')[1]
   .split('⚙️ Características')[0].trim();
 const paragraphs=section.split(/\n\s*\n/).map(x=>x.trim()).filter(Boolean);
 assert.equal(paragraphs.length,3);
 for(const paragraph of paragraphs){
  assert.ok(paragraph.length>=180,'Parágrafo curto demais: '+paragraph);
  assert.ok(paragraph.split(/[.!?]/).filter(Boolean).length>=2,
   'O benefício deve ter explicação contextual: '+paragraph);
 }
 assert.ok(out.description.indexOf('🌟 Benefícios')<out.description.indexOf('⚙️ Características'));
 assert.ok(!/380 W|220 V|014015\/2025/.test(out.description));
});

test('outras categorias explicam benefícios de uso antes dos dados técnicos',()=>{
 const products=[
  ['Cafeteira Italiana 300 ml','preparo tradicional'],
  ['Porta Shampoo 2 andares','frascos'],
  ['Garrafa Térmica 900 ml','rotina'],
  ['Bola Futebol Infantil Vinil N2','partida']
 ];
 for(const [title,term] of products){
  const out=composeShopeeDescription({record:{title},supplier:{product_data:{name:title}}});
  assert.equal(out.valid,true,title);
  const benefits=out.description.split('🌟 Benefícios que fazem a diferença')[1].split('⚙️ Características')[0];
  assert.ok(benefits.length>=380,title+' com benefícios insuficientes');
  assert.match(benefits,new RegExp(term,'i'),title);
 }
});
