import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {supplierAttributeSuggestions,supplierProductDimensions} from '../shopeeSupplierEvidenceFacts.js';

const original=`Fonte: capturas da ficha WeDrop fornecidas para a SKU TRC1525 (Piscina Inflável - Azul).
Marca: Top Rio.
Material: plástico.
Estampa: Estampado (desenhos coloridos visíveis nas fotografias).
Dimensões descritas para a piscina: 43 cm de altura × 135 cm de largura × 88 cm de comprimento; confirmar com fabricante.
Dimensões do catálogo logístico: 13 cm de altura × 33 cm de largura × 36 cm de comprimento.
Idade recomendada: não informada.
Registro INMETRO: não informado.`;
const attr=(id,name,inputType=3,values=[],options=[])=>({id,name,inputType,values,options});
const schema=[
 attr(410,'Marca',3,[{name:'Novo'}]),
 attr(525,'Material',3,[{name:'Plástico'}]),
 attr(616,'Estampa',3),
 attr(707,'Dimensões do Produto (A x L x C), sem a caixa de embalagem',3),
 attr(808,'Tamanho Do Pacote',3),
 attr(909,'Número de registro INMETRO',1,[],[{id:100,name:'N/A – NBR não aplicável'}])
];
const supplier={supplier_sku:'TRC1525',source_file:'catalogo.csv',
 product_data:{brand:'Top Rio',catalogMeasurements:{heightCm:'13',widthCm:'33',lengthCm:'36',weightKg:'2600'}}};
test('sku TRC1525 recebe automaticamente marca, estampa e medidas A x L x C de produto',()=>{
 const result=supplierAttributeSuggestions({attributes:schema,supplier,sourceText:original});
 const read=id=>result.suggestions.find(x=>x.attributeId===id);
 assert.equal(read(410).values[0].valueName,'Top Rio');
 assert.equal(read(616).values[0].valueName,'Estampado');
 assert.equal(read(707).values[0].valueName,'43 x 135 x 88 cm');
 assert.equal(read(808),undefined,'medidas logísticas não são medidas do pacote confirmadas');
 assert.equal(read(909),undefined,'inmetro não informado jamais vira N/A');
 assert.ok(result.conflicts.some(x=>x.attributeId===410&&x.current==='Novo'));
 assert.match(read(707).evidence,/NÃO são dimensões da embalagem/);
});
test('regex do catálogo extrai medidas do produto, nunca só a caixa',()=>{
 const assembled=supplierProductDimensions(original);
 assert.deepEqual([assembled.height,assembled.width,assembled.length],['43','135','88']);
 assert.equal(supplierProductDimensions('Dimensões da embalagem: 13 cm de altura × 33 cm de largura × 36 cm de comprimento'),null);
});
test('outras SKUs e categorias com IDs novos são preenchidas por nome, não por ID fixo',()=>{
 const other=supplierAttributeSuggestions({attributes:[
  attr(9010,'Marca',3),
  attr(9020,'Estampa',3),
  attr(9030,'Dimensões do Produto (A x L x C), sem a caixa de embalagem',3)
 ],supplier:{supplier_sku:'FUTURO1',source_file:'we.csv',product_data:{brand:'OutraMarca'}},
 sourceText:'Estampa: Estampado\nDimensões: 20cm Altura x 45cm Largura x 65cm Comprimento'});
 assert.deepEqual(other.suggestions.map(x=>[x.attributeId,x.values[0].valueName]),[
  [9010,'OutraMarca'],[9020,'Estampado'],[9030,'20 x 45 x 65 cm']]);
});
test('fallback usa a descrição existente do anúncio, se não houver texto extra',()=>{
 const result=supplierAttributeSuggestions({attributes:[attr(5,'Dimensões do Produto',3)],
   supplier:{supplier_sku:'TEST5',source_file:'cat.csv',product_data:{}},
   productDescription:'Piscina. Dimensões: 43cm Altura x 135cm Largura x 88cm Comprimento\nCor azul'});
 assert.equal(result.suggestions[0].values[0].valueName,'43 x 135 x 88 cm');
});
test('sem prova de estampa ou medidas, os campos não são inventados',()=>{
 const result=supplierAttributeSuggestions({attributes:schema,supplier,sourceText:'Produto azul, sem dados dimensionais.'});
 assert.equal(result.suggestions.some(x=>[616,707].includes(x.attributeId)),false);
});
test('campos de opção única não recebem valueId fictício e expõem busca oficial',()=>{
 const result=supplierAttributeSuggestions({attributes:[
  {...attr(103,'Marca',1),supportSearch:true},
  attr(104,'Estampa',1,[],[{id:991,name:'Estampado'}])
 ],supplier,sourceText:original});
 assert.equal(result.suggestions.some(x=>x.attributeId===103),false);
 assert.ok(result.unresolved.some(x=>x.attributeId===103&&x.value==='Top Rio'));
 assert.deepEqual(result.suggestions.find(x=>x.attributeId===104).values,[{valueId:991,valueName:'Estampado'}]);
});
test('a interface carrega valores comprovados como preenchidos sem um clique extra',()=>{
 const js=readFileSync(new URL('../public/app.js',import.meta.url),'utf8');
 assert.match(js,/const auto=\(!reviewed\|\|invalidNewBrand\)\?suggested:null/);
 assert.match(js,/enabled\.checked=Boolean\(existing\)/);
 assert.match(js,/Preenchido automaticamente/);
 const server=readFileSync(new URL('../server.js',import.meta.url),'utf8');
 assert.match(server,/productDescription:record\.description/);
 assert.match(server,/matrixShopeeSearch\(cfg,auth,request\)/);
});
