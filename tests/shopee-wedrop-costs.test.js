import test from 'node:test';
import assert from 'node:assert/strict';
import {
  parseCsv,parseMoneyBR,previewWeDropCsv,prepareWeDropImport
} from '../wedropCsv.js';
import {matchWeDropCosts} from '../wedropCosts.js';

test('CSV brasileiro com aspas, vírgula decimal e ponto e vírgula',()=>{
  const csv='\uFEFFSKU;Nome;Custo WeDrop\nA1;"Caneca; vidro";"R$ 1.234,50"\nA2;"Item ""premium""";12,90\n';
  const parsed=parseCsv(csv);
  assert.equal(parsed.headers.length,3);
  assert.equal(parsed.rows[0][1],'Caneca; vidro');
  assert.equal(parsed.rows[1][1],'Item "premium"');
  const data=prepareWeDropImport(csv,{skuColumn:0,costColumn:2});
  assert.deepEqual(data.costs,[{sku:'A1',unitCost:1234.5},{sku:'A2',unitCost:12.9}]);
  assert.equal(data.totalRows,2);
  assert.equal(previewWeDropCsv(csv).rowCount,2);
});
test('CSV separado por vírgula e campos multilinhas entre aspas',()=>{
  const csv='SKU,Detalhes,Custo\nAB,"Pote\ncom tampa","12.50"\n';
  const parsed=parseCsv(csv);
  assert.equal(parsed.rows.length,1);
  assert.equal(parsed.rows[0][1],'Pote\ncom tampa');
  assert.equal(prepareWeDropImport(csv,{skuColumn:0,costColumn:2}).costs[0].unitCost,12.5);
});
test('custos aceitos sem adivinhar preço de venda e sem permitir número inválido',()=>{
  assert.equal(parseMoneyBR('R$ 123,45'),123.45);
  assert.equal(parseMoneyBR('1,234.56'),1234.56);
  assert.equal(parseMoneyBR('1.234,56'),1234.56);
  assert.equal(parseMoneyBR('1.000'),1000);
  assert.equal(parseMoneyBR('0'),null);
  assert.equal(parseMoneyBR('-1,00'),null);
  assert.equal(parseMoneyBR('R$ 12,3456'),null);
  assert.equal(parseMoneyBR('formula()'),null);
  assert.throws(()=>prepareWeDropImport('SKU;Custo\nA;10\n',{skuColumn:1,costColumn:1}),/colunas diferentes/);
});
test('SKUs repetidos conflitantes são barrados sem importação parcial',()=>{
  assert.throws(()=>prepareWeDropImport('SKU;Custo\nA;12,50\nA;15,00\n',{
    skuColumn:0,costColumn:1
  }),/repetidos com custos diferentes/);
  const ok=prepareWeDropImport('SKU;Custo\nA;12,50\nA;12,50\n',{skuColumn:0,costColumn:1});
  assert.equal(ok.costs.length,1);
});
test('linhas inválidas exigem autorização explícita para ignorar',()=>{
  const raw='SKU;Custo\nA;12,50\nB;ABC\n;99,00';
  assert.throws(()=>prepareWeDropImport(raw,{skuColumn:0,costColumn:1}),/linhas inválidas/);
  const p=prepareWeDropImport(raw,{skuColumn:0,costColumn:1,skipInvalid:true});
  assert.equal(p.costs.length,1);
  assert.equal(p.skippedInvalid,2);
});
test('cobertura usa SKU exato e separa preço, custo e diferença bruta',()=>{
  const items=[
    {item_id:10,item_name:'Porta temperos',item_status:'NORMAL',sku:'W10',price:'89.90',has_model:false},
    {item_id:11,item_name:'Garrafa',item_status:'NORMAL',sku:'',price:null,has_model:true},
    {item_id:12,item_name:'Variação não sincronizada',item_status:'NORMAL',sku:'',has_model:true},
    {item_id:13,item_name:'Produto sem custo',item_status:'NORMAL',sku:'NO-COST',price:'12.90',has_model:false}
  ];
  const models=[
    {item_id:11,model_id:100,model_sku:'W11-A',price:'35.50'},
    {item_id:11,model_id:101,model_sku:'W11-B',price:null}
  ];
  const costs=[
    {supplier_sku:'W10',unit_cost:'50.10'},
    {supplier_sku:'W11-A',unit_cost:'15.20'},
    {supplier_sku:'UNLINKED',unit_cost:'9.50'}
  ];
  const report=matchWeDropCosts(items,models,costs);
  assert.equal(report.totals.catalogItems,4);
  assert.equal(report.totals.waitingModels,1);
  assert.equal(report.totals.comparedSkus,4);
  assert.equal(report.totals.matched,2);
  assert.equal(report.totals.missingCost,2);
  assert.equal(report.totals.supplierSkusNotMatched,1);
  assert.equal(report.rows.find(x=>x.sku==='W10').grossDifference,39.8);
  assert.equal(report.rows.find(x=>x.sku==='NO-COST').grossDifference,null);
  assert.equal(report.rows.find(x=>x.sku==='W11-B').grossDifference,null);
});
