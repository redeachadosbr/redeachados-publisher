import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {supplierWorkflowFacts} from '../shopeeSupplierFacts.js';
import {compileTax} from '../shopeeStructuredFields.js';

const settings={fiscal_notes:`Dados obrigatórios:
NCM: Planilha de produtos Wedrop localizar
Origem: 2- estrangeira: adquirida no mercado interno
CFOP Mesmo Estado: 5106
CFOP Outros Estados: 6106
CSOSN: 102
Unidade de medida: de acordo com o produto (unidade, metro, kit e etc)
Dados opcionais:
PISCOFIS: 99
tipo de serviço: Revendedor`};
const supplier={supplier_sku:'TRC1525',source_file:'produtos-catalogo(20261016-144428).csv',
 source_line:5306,product_data:{ncm:'95069900',cest:null,name:'Piscina Inflável - Azul'}};
const record={title:'Piscina Inflável Azul',description:'Piscina azul',attributeAudit:{attributes:[
  {id:111,name:'Quantidade da embalagem',values:[{name:'1'}]}
]}};
test('Motor Matriz mostra 00 no CEST sem enviar um código inventado à Shopee',()=>{
 const data=supplierWorkflowFacts(supplier,record,settings);
 const values=data.taxSuggestion;
 assert.deepEqual(Object.fromEntries(['ncm','origin','same_state_cfop','diff_state_cfop','csosn','measure_unit','operation_type','cest','pis_cofins_cst'].map(k=>[k,values[k]??''])),{
  ncm:'95069900',origin:'2',same_state_cfop:'5106',diff_state_cfop:'6106',
  csosn:'102',measure_unit:'UN',operation_type:'1',cest:'00',pis_cofins_cst:'99'
 });
 assert.match(values.evidence,/WeDrop.*TRC1525/);
 assert.match(data.taxSuggestionSources.same_state_cfop,/Regras fiscais salvas da loja/);
 assert.match(data.taxSuggestionSources.ncm,/WeDrop/);
 const output=compileTax({...values,evidence:values.evidence}, {tax_info:{}});
 assert.equal(output.ncm,'95069900');
 assert.equal(output.same_state_cfop,'5106');
 assert.equal(Object.hasOwn(output,'cest'),false);
 assert.equal(Object.hasOwn(output,'pis_cofins_cst'),false);
});
test('não inventar unidade ou impostos sem fonte da SKU nem regras salvas',()=>{
 const data=supplierWorkflowFacts({supplier_sku:'KIT01',source_file:'s.csv',
   product_data:{name:'Kit ferramentas'}},{title:'Kit ferramentas',attributeAudit:{attributes:[]}},
   {fiscal_notes:''});
 assert.equal(data.taxSuggestion.ncm,undefined);
 assert.equal(data.taxSuggestion.csosn,undefined);
 assert.equal(data.taxSuggestion.measure_unit,undefined);
 assert.equal(data.taxSuggestion.cest,'00');
 assert.equal(data.taxSuggestion.pis_cofins_cst,'99');
});
test('respeitar unidade específica confirmada pela WeDrop para outras categorias',()=>{
 const base={supplier_sku:'METRO1',source_file:'csv',product_data:{name:'Tecido vendido em metro',
   ncm:'60069000',measureUnit:'M'}};
 const out=supplierWorkflowFacts(base,{title:'Tecido',attributeAudit:{attributes:[]}},settings);
 assert.equal(out.taxSuggestion.measure_unit,'M');
});
test('fiscal é pré-preenchido no aplicativo, mas não declara dados publicados',()=>{
 const app=readFileSync(new URL('../public/app.js',import.meta.url),'utf8');
 assert.match(app,/const draft=\{\.\.\.\(data\.taxCurrent\|\|\{\}\),\.\.\.defaults,\.\.\.saved\}/);
 assert.match(app,/a Central do Vendedor só muda após execução e confirmação da API/);
 assert.match(app,/CEST 00 = CEST não informado/);
 assert.match(app,/Pré-preenchido automaticamente/);
});
