import test from 'node:test';
import assert from 'node:assert/strict';
import {assessKitBuyerFit} from '../shopeeKitBuilder.js';
const item=(sku,name,cost=15)=>({sku,name,category:'Brinquedos',unitCost:cost});
const cases=[
 [['DTY1126','Mini Paraíso Brinquedo Playset Parque Diversão Acessórios Colorido'],['DTY1127','Parque Diversão Brinquedo Giratório Animais Carrossel']],
 [['BAS25021','Arena Mini Jogo de Basquete de Mesa'],['FUT25020','Mini Jogo Futebol de Mesa Arena Fut League'],['GOL25022','Mini Jogo Futebol de Mesa Duelo de Pênaltis Arena Fut League']],
 [['050','01 Pote de Massinha 05 unidades 75gr Coloridas - Sortido'],['1509','Brinquedo Kit Massinha de Modelar Infantil'],['CO0961295','Kit Massinha Dentista com 14 Peças']],
 [['1259','Brinquedo Infantil Maleta de Ferramentas - 24 Peças'],['70005','Dinossauro Montar Desmontar Com Parafusadeira Elétrica']],
 [['303448','Caminhão Dinossauro com 3 Mini Carrinhos - Verde'],['A203925','Pista Infantil de Dinossauros com Carrinho Motorizados - Verde']],
 [['285BR','Conjunto Copa Cozinha Geladeira com Boneca - Rosa'],['221-JXP','Mini Cozinha Rosa com Fogão, Forno, Liquidificador, Espátula e Outros Acessórios']],
 [['977395','Jogo Pula Pirata Com 16 Espadas'],['1665','Jogo de Tabuleiro Quem Sou Eu?'],['MD5093','Jogo Derruba Torre Divertido']],
 [['309709','Tabuleiro Letras Alfabeto de Madeira Aprendizado Brinquedo- Multicolorido'],['10619','Quebra-Cabeça Bilíngue Animais da Fazenda 20 Peças']],
 [['MD5284','Kit Joias com várias peças para criação de acessórios'],['3539','Kit Miçangas com Sereia Infantil']],
 [['310200','Elefante Brincalhão Musical'],['278CHOCALHO','Conjunto com Torre e Bola Chocalho']]
];
test('10 kits de brinquedos/23 SKUs são reconhecidos como rascunhos sujeitos à revisão',()=>{
 assert.equal(cases.length,10);
 assert.equal(cases.flat().length,23);
 assert.equal(cases[2][0][0],'050');
 for(const [i,group] of cases.entries()){
  const fit=assessKitBuyerFit(group.map(([sku,name])=>item(sku,name)));
  assert.equal(fit.ok,true,'Kit '+(i+1)+' '+fit.reason);
  assert.equal(fit.reviewRequired,true,'Kit '+(i+1)+' revisão obrigatória');
  assert.match(fit.reviewNotes.join(' '),/Compatibilidade física não confirmada/);
 }
});
test('variações iguais, SKU repetida e misturas arbitrárias continuam recusadas',()=>{
 assert.equal(assessKitBuyerFit([item('X','Brinquedo Mini Carro Vermelho'),item('X','Brinquedo Mini Carro Azul')]).ok,false);
 assert.equal(assessKitBuyerFit([item('A','Carrinho Azul'),item('B','Carrinho Vermelho')]).ok,false);
 assert.equal(assessKitBuyerFit([item('A','Kit Joias com miçangas'),{sku:'C',name:'Frigideira Antiaderente',category:'Panelas e Frigideiras',unitCost:25}]).ok,false);
});
test('servidor preserva títulos editados e só salva rascunhos; interface informa pendências',async()=>{
 const {readFileSync}=await import('node:fs');
 const server=readFileSync(new URL('../server.js',import.meta.url),'utf8');
 const browser=readFileSync(new URL('../public/kit-builder.js',import.meta.url),'utf8');
 assert.match(server,/previous\?\.creative\?\.title&&previous\?\.creative\?\.description/);
 assert.match(server,/reviewRequired=fit\.reviewRequired===true\|\|!fit\.ok/);
 assert.match(server,/pendingReview:kits\.filter/);
 assert.match(server,/marketplaceUpdated:false,shopeePublished:false/);
 assert.match(browser,/id.*kitImportReport|#kitImportReport/);
 assert.match(browser,/RASCUNHO — REVISAR COERÊNCIA/);
});
