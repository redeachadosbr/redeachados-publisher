import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import '../public/technical-ptbr.js';

const pt=globalThis.RATechnicalPT;

test('nomes de atributos oficiais em inglês aparecem em português',()=>{
 assert.equal(pt.attribute('Volume Capacity',101),'Capacidade (volume)');
 assert.equal(pt.attribute('Product Weight',102),'Peso do produto');
 assert.equal(pt.attribute('Dimension (L x W x H)',103),'Dimensões (C × L × A)');
 assert.equal(pt.attribute('Material',104),'Material');
 assert.equal(pt.attribute('Warranty Duration',105),'Prazo de garantia');
 assert.equal(pt.attribute('Country/Region of Origin',106),'País ou região de origem');
 assert.equal(pt.attribute('Cup Capacity',107),'Capacidade do copo');
 assert.equal(pt.attribute('Model',108),'Modelo');
 assert.equal(pt.attribute('Product Condition',109),'Condição do produto');
 assert.equal(pt.attribute('Battery Capacity',110),'Capacidade da bateria');
});
test('rótulo desconhecido não é mostrado em inglês nem inventa tradução',()=>{
 const label=pt.attribute('Operating Temperature Range',12345);
 assert.equal(label,'Atributo da categoria nº 12345');
 assert.doesNotMatch(label,/operating|temperature|range/i);
 assert.equal(pt.attribute('Diâmetro da base',99),'Diâmetro da base');
});
test('valores e opções comuns em inglês aparecem em português',()=>{
 assert.equal(pt.value('Yes',11),'Sim');
 assert.equal(pt.value('No',12),'Não');
 assert.equal(pt.value('New',13),'Novo');
 assert.equal(pt.value('Stainless Steel',14),'Aço inoxidável');
 assert.equal(pt.value('Borosilicate Glass',15),'Vidro borossilicato');
 assert.equal(pt.value('Black',16),'Preto');
 assert.equal(pt.value('3 Years and Above',17),'A partir de 3 anos');
 assert.equal(pt.value('2-5 months',18),'2 a 5 meses');
 assert.equal(pt.value('500 ml',19),'500 ml');
 assert.equal(pt.value('210 g',20),'210 g');
 assert.equal(pt.value('GH643',21),'GH643');
});
test('valor oficial com inglês desconhecido exige conferência em vez de tradução inventada',()=>{
 assert.equal(pt.value('Battery Powered with External Adapter',312),
  'Opção oficial nº 312 (conferir na Shopee)');
});
test('tradutor é somente apresentação e submissão mantém nome e ID oficiais',()=>{
 const app=readFileSync(new URL('../public/app.js',import.meta.url),'utf8');
 const html=readFileSync(new URL('../public/index.html',import.meta.url),'utf8');
 assert.match(html,/technical-ptbr\.js[^"]*"><\/script>[\s\S]*?app\.js/);
 assert.match(app,/name\.append\(optimizerMake\('strong','',optimizerTechLabel\(x\.name,x\.id\)/);
 assert.match(app,/field\.append\(optimizerMake\('legend','',optimizerTechLabel\(name,attr\.id\)/);
 assert.match(app,/valueName:official\?\.name\|\|/);
 assert.match(app,/item\.value=String\(option\.id\)/);
 assert.match(app,/attributeId,evidence,values/);
});
