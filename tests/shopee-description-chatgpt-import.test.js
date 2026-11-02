import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';

function parser(){
 const src=readFileSync(new URL('../public/description-chatgpt-bridge.js',import.meta.url),'utf8');
 const globals={};globals.globalThis=globals;
 vm.runInNewContext(src,globals,{filename:'description-chatgpt-bridge.js'});
 return globals.RADescriptionChatGPT;
}
const response=[
 '✨ A escova elétrica giratória ajuda a organizar a limpeza de casa com mais praticidade. Use em diferentes locais conforme o material e as recomendações de cuidado.',
 '',
 '✅ BENEFÍCIOS',
 '✅ Rotação automática para auxiliar na limpeza.',
 '✅ Cabo confortável para o uso diário.',
 '✅ Três cabeçotes para necessidades diferentes.',
 '',
 '💡 POR QUE COMPRAR',
 'Você pode trocar o acessório conforme a superfície que precisa limpar, sem mudar de equipamento.',
 '',
 '⚙️ CARACTERÍSTICAS',
 '✅ Escova elétrica giratória na cor branca.',
 '✅ Alimentação recarregável via cabo USB.',
 '✅ Botão de ligar e desligar.',
 '',
 '📦 O QUE VAI NA EMBALAGEM',
 '✅ 01 Escova giratória',
 '✅ 01 Suporte',
 '✅ 01 Cabo USB',
 '✅ 01 Manual',
 '✅ 03 Cabeçotes',
 '',
 '🛒 Facilite sua rotina de limpeza com mais praticidade e versatilidade. Garanta a sua!'
].join('\n');

test('importação manual aceita descrição comercial com itens da embalagem marcados ✅',()=>{
 const p=parser();
 const got=p.parse(response);
 assert.equal(got.description,response);
 assert.equal(got.length,[...response].length);
 assert.ok(got.description.includes('📦 O QUE VAI NA EMBALAGEM\n✅ 01 Escova giratória'));
 assert.ok(got.description.includes('✅ 03 Cabeçotes\n\n🛒'));
});

test('retorno automático em JSON usa o MESMO parser e não transfere itens da embalagem para benefícios',()=>{
 const p=parser();
 const got=p.parse(JSON.stringify({description:response,factsUsed:[],unverified:[]}));
 assert.equal(got.description,response);
});

test('admite descrição sem FAQ ou cabeçalhos rígidos quando há texto comercial para revisão',()=>{
 const p=parser();
 const text=[
  '✨ Torne as atividades de limpeza mais práticas com esta escova elétrica giratória, desenvolvida para auxiliar nas tarefas de casa.',
  '✅ Uma escova rotativa que pode ajudar na limpeza diária.',
  '✅ Cabo de apoio para segurar durante o uso.',
  '⚙️ A escova possui um botão liga e desliga na parte superior do cabo.',
  '📦 Conteúdo da embalagem: confira os componentes descritos pelo fornecedor antes da compra.',
  '🛒 Conheça a praticidade deste produto para sua rotina e escolha com tranquilidade.'
 ].join('\n\n');
 assert.equal(p.parse(text).description,text);
});

test('não transforma o prompt de geração em descrição importada',()=>{
 const p=parser();
 const command=[
  'Você é um redator brasileiro especializado em conversão de anúncios Shopee da Rede Achados BR.',
  'ESTRUTURA OBRIGATÓRIA: BENEFÍCIOS, POR QUE COMPRAR, CARACTERÍSTICAS, O QUE VAI NA EMBALAGEM',
  'DADOS DA SKU: descrição produtos acessórios revisão comercial, inclua detalhes sem invenção.',
  response
 ].join('\n\n');
 assert.throws(()=>p.parse(command),/não identifiquei|ainda não entregou/i);
});

test('interface preserva a colagem quando o Chrome bloqueia clipboard.readText',()=>{
 const src=readFileSync(new URL('../public/description-modern-layout.js',import.meta.url),'utf8');
 assert.match(src,/const fromField=manualArea\.value\.trim\(\)/);
 assert.match(src,/const raw=fromField\|\|await navigator\.clipboard\.readText\(\)/);
 assert.match(src,/O texto colado continua disponível/);
 assert.match(src,/await applyDescription\(result,\{fallback:true\}\)/);
});
