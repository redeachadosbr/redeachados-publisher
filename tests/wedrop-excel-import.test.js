import fs from 'node:fs';
import test from 'node:test';
import assert from 'node:assert/strict';
import * as XLSX from '@stackline/xlsx';
import {excelBufferToWeDropCsv,convertWeDropExcelBase64} from '../wedropExcel.js';
import {parseCsv,previewWeDropCsv,prepareAutomaticWeDropImport,prepareWeDropImport} from '../wedropCsv.js';

const headers=['SKU','Nome do Produto','Marca','Categoria','Fornecedor','Estado do fornecedor',
 'Preço','EAN','NCM','CEST','Peso (kg)','Largura (cm)','Altura (cm)',
 'Comprimento (cm)','Peso da caixa (kg)','Imagem Principal'];
const product=['002392','Bicicleta Moto Cross Aro 16 Rosa','Loja','Brinquedos','WeDrop',
 'SP',569.99,'007788821240589','95030099','2806400',3.5,30,40,70,4,'https://example.com/photo.jpg'];
function workbook(format='xlsx',table=[headers,product]){
 const book=XLSX.utils.book_new();
 XLSX.utils.book_append_sheet(book,XLSX.utils.aoa_to_sheet([['Manual do fornecedor'],['Não importar esta aba']]),'Instrucoes');
 XLSX.utils.book_append_sheet(book,XLSX.utils.aoa_to_sheet(table),'Produtos');
 return XLSX.write(book,{bookType:format,type:'buffer'});
}
test('xlsx WeDrop preserva SKU como texto, campos fiscais e custo real',()=>{
 const converted=excelBufferToWeDropCsv(workbook('xlsx'),{fileName:'produtos-catalogo.xlsx'});
 assert.equal(converted.sheetName,'Produtos');
 assert.equal(converted.format,'xlsx');
 assert.equal(converted.recognizedLayout,true);
 const preview=previewWeDropCsv(converted.csv);
 assert.equal(preview.headers.length,16);
 assert.equal(preview.rowCount,1);
 const prepared=prepareAutomaticWeDropImport(converted.csv);
 assert.deepEqual(prepared.costs,[{sku:'002392',unitCost:569.99}]);
 assert.equal(prepared.products[0].data.ncm,'95030099');
 assert.equal(prepared.products[0].data.cest,'2806400');
});
test('xls legado converte para o mesmo pipeline CSV e conserva o custo',()=>{
 const buffer=workbook('biff8');
 const converted=convertWeDropExcelBase64(buffer.toString('base64'),'catalogo.xls');
 assert.equal(converted.format,'xls');
 assert.equal(prepareAutomaticWeDropImport(converted.csv).costs[0].unitCost,569.99);
});
test('xlsx generico exige mapeamento explicito e nao adivinha preco de venda',()=>{
 const rows=[['SKU','Nome','Preço de Venda'],['K101','Produto',99.99]];
 const converted=excelBufferToWeDropCsv(workbook('xlsx',rows),{fileName:'generico.xlsx'});
 assert.equal(converted.recognizedLayout,false);
 assert.throws(()=>prepareAutomaticWeDropImport(converted.csv),/Layout não reconhecido/);
 const parsed=parseCsv(converted.csv);
 assert.deepEqual(parsed.headers,['SKU','Nome','Preço de Venda']);
 assert.equal(prepareWeDropImport(converted.csv,{skuColumn:0,costColumn:2}).costs[0].unitCost,99.99);
});
test('rejeita arquivo malicioso com extensao falsa ou base64 invalido',()=>{
 assert.throws(()=>excelBufferToWeDropCsv(Buffer.from('fake'),{fileName:'catalogo.xlsx'}),/planilha Excel válida/);
 assert.throws(()=>excelBufferToWeDropCsv(workbook('xlsx'),{fileName:'catalogo.xls'}),/extensão/);
 assert.throws(()=>convertWeDropExcelBase64('zzz%%','catalogo.xlsx'),/inválido/);
});
test('interface e rota reaproveitam validacao existente e aceitam Excel',async()=>{
 const {readFileSync}=await import('node:fs');
 const app=readFileSync(new URL('../public/app.js',import.meta.url),'utf8');
 const html=readFileSync(new URL('../public/index.html',import.meta.url),'utf8');
 const server=readFileSync(new URL('../server.js',import.meta.url),'utf8');
 assert.match(html,/accept="[^"]*\.xlsx,\.xls/);
 assert.match(app,/async function wdReadCatalogText\(file\)/);
 assert.match(app,/\/api\/shopee\/wedrop\/convert-excel/);
 assert.match(server,/app\.post\('\/api\/shopee\/wedrop\/convert-excel'/);
 assert.match(server,/importSupplierAutomatically\(auth.shopId,costCsvFromBody\(req\)/);
});

test('kits: XLSX com aba Estoque e aba Catálogo escolhe a aba certa para a disponibilidade',()=>{
 const book=XLSX.utils.book_new();
 XLSX.utils.book_append_sheet(book,XLSX.utils.aoa_to_sheet([headers,product]),'Catalogo');
 XLSX.utils.book_append_sheet(book,XLSX.utils.aoa_to_sheet([
  ['SKU','Disponibilidade'],
  ['002392','DISPONÍVEL'],['SKU-B','INDISPONÍVEL']
 ]),'Disponibilidade');
 const data=XLSX.write(book,{bookType:'xlsx',type:'buffer'});
 const selected=convertWeDropExcelBase64(data.toString('base64'),'catalogo-estoque.xlsx',{purpose:'availability'});
 assert.equal(selected.sheetName,'Disponibilidade');
 assert.match(selected.csv,/002392;DISPONÍVEL/);
 assert.match(selected.csv,/SKU-B;INDISPONÍVEL/);
 const catalog=convertWeDropExcelBase64(data.toString('base64'),'catalogo-estoque.xlsx',{purpose:'catalog'});
 assert.equal(catalog.sheetName,'Catalogo');
});
test('kits: planilha Excel sem Disponibilidade nunca habilita estoque',()=>{
 const data=workbook('xlsx');
 assert.throws(()=>convertWeDropExcelBase64(data.toString('base64'),'catalogo.xlsx',{purpose:'availability'}),/Nenhuma aba.*SKU e Disponibilidade/);
});
test('kits: interface permite selecionar CSV, XLS e XLSX para catálogo e estoque',()=>{
 const html=fs.readFileSync(new URL('../public/index.html',import.meta.url),'utf8');
 const js=fs.readFileSync(new URL('../public/kit-builder.js',import.meta.url),'utf8');
 for(const id of ['kitCatalogFile','kitStockCsv']){
  assert.match(html,new RegExp('id="'+id+'"[^>]*accept="[^"]*\\.csv,\\.xlsx,\\.xls'));
 }
 assert.match(js,/\/api\/shopee\/wedrop\/convert-excel/);
 assert.match(js,/\/api\/shopee\/wedrop\/auto\/import/);
 assert.match(js,/\/api\/shopee\/kits\/availability\/import/);
 assert.match(js,/fileName:file\.name,purpose/);
});
