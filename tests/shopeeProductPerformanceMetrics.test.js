import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import * as XLSX from '@stackline/xlsx';
import {parseProductPerformanceReport,parseOrganicReport,rankOrganicTop}
 from '../shopeeOrganicPerformance.js';
const info={fileName:'Performance_Produto.csv',periodStart:'2026-11-01',periodEnd:'2026-11-03'};
test('dez indicadores exatos da tela Shopee são lidos sem confundir visitantes e carrinho',()=>{
 const csv='ID do Produto;Nome do Produto;Impressões de Produto;Cliques Por Produto;Visitantes do Produto;CTR;Taxa de Conversão de Pedidos;Visitantes (Adicionar ao Carrinho);Unidades (Adicionar ao Carrinho);Taxa de Conversão (adicionar ao carrinho);Pedidos;Unidades\n'+
  '58221909468;Cortina de Box;2.684;97;475;3,61%;2,10%;46;63;9,68%;7;9\n';
 const report=parseProductPerformanceReport(Buffer.from(csv,'utf8'),info);
 assert.equal(report.source,'seller_center_product_performance_export');
 assert.equal(report.records.length,1);
 const item=report.records[0];
 assert.equal(item.sku,'');
 assert.equal(item.itemId,'58221909468');
 assert.equal(item.title,'Cortina de Box');
 assert.equal(item.impressions,2684);
 assert.equal(item.clicks,97);
 assert.equal(item.visits,475);
 assert.equal(item.ctr,3.61);
 assert.equal(item.cartVisitors,46);
 assert.equal(item.cartUnits,63);
 assert.equal(item.cartConversionRate,9.68);
 assert.equal(item.orderConversionRate,2.1);
 assert.equal(item.orders,7);
 assert.equal(item.soldUnits,9);
 assert.equal(item.cartPending,null,'adições não significam carrinhos abandonados');
 assert.equal(item.cartAbandonmentRate,null,'não inventar abandono');
 assert.equal(report.metricAvailability.cartVisitors,true);
 assert.equal(report.metricAvailability.cartConversionRate,true);
 assert.equal(rankOrganicTop(report.records)[0].itemId,'58221909468',
  'listar produto por Item ID mesmo quando a exportação não incluir SKU');
});
test('CSV pode ter só métricas de adição; taxa não é calculada a partir de visitas',()=>{
 const csv='SKU;Visitantes do Produto;Visitantes (Adicionar ao Carrinho);Unidades (Adicionar ao Carrinho)\n'+
  'SKU-A;400;52;65\n';
 const item=parseProductPerformanceReport(Buffer.from(csv),info).records[0];
 assert.equal(item.visits,400);
 assert.equal(item.cartVisitors,52);
 assert.equal(item.cartUnits,65);
 assert.equal(item.cartConversionRate,null,'a taxa oficial precisa estar declarada');
 assert.equal(item.cartAbandonmentRate,null);
});
test('XLSX aceita 10 campos e não exige consentimento orgânico para a fonte geral',()=>{
 const workbook=XLSX.utils.book_new();
 const sheet=XLSX.utils.aoa_to_sheet([
  ['ID do Produto','Impressões de Produto','Cliques Por Produto','CTR',
   'Visitantes do Produto','Visitantes (Adicionar ao Carrinho)',
   'Unidades (Adicionar ao Carrinho)','Taxa de Conversão (adicionar ao carrinho)','Pedidos'],
  ['58221909468','2.684','97','3,61%','500','55','70','11%','5']
 ]);
 XLSX.utils.book_append_sheet(workbook,sheet,'Performance do Produto');
 const file=XLSX.write(workbook,{bookType:'xlsx',type:'buffer'});
 const item=parseProductPerformanceReport(file,{...info,fileName:'Produto.xlsx'}).records[0];
 assert.equal(item.cartVisitors,55);
 assert.equal(item.cartUnits,70);
 assert.equal(item.cartConversionRate,11);
 assert.equal(item.orders,5);
});
test('arquivo generalizado NÃO é aceito na aba exclusivamente orgânica sem confirmação',()=>{
 const csv=Buffer.from('SKU;Impressões de Produto\nSKU1;250\n');
 assert.throws(()=>parseOrganicReport(csv,info),/Confirme/);
});
test('ranking permite ordenar visitantes que adicionaram e pedidos sem criar cliques extras',()=>{
 const rows=[
  {itemId:'10',sku:'A',impressions:400,clicks:40,visits:120,ctr:10,cartVisitors:15,orders:5},
  {itemId:'20',sku:'B',impressions:300,clicks:25,visits:180,ctr:8.33,cartVisitors:34,orders:4}
 ];
 assert.equal(rankOrganicTop(rows,{sort:'cartVisitors'})[0].sku,'B');
 assert.equal(rankOrganicTop(rows,{sort:'orders'})[0].sku,'A');
});
test('interface e endpoints separam Performance Shopee, orgânico e visualizações gerais',()=>{
 const html=readFileSync(new URL('../public/index.html',import.meta.url),'utf8');
 const js=readFileSync(new URL('../public/organic-top10.js',import.meta.url),'utf8');
 const server=readFileSync(new URL('../server.js',import.meta.url),'utf8');
 assert.match(html,/id="organicTop10ModePerformance"/);
 assert.match(html,/data-sort="cartVisitors"/);
 assert.match(html,/data-sort="cartConversionRate"/);
 assert.match(html,/id="organicTop10ImportTitle"/);
 assert.match(js,/source==='performance'/);
 assert.match(js,/row\.cartVisitors/);
 assert.match(js,/row\.cartUnits/);
 assert.match(js,/row\.cartConversionRate/);
 assert.match(js,/row\.orders/);
 assert.match(js,/\/api\/shopee\/performance\/top10/);
 assert.match(server,/\/api\/shopee\/performance\/top10\/import/);
 assert.match(server,/parseProductPerformanceReport/);
 assert.doesNotMatch(js,/\/api\/shopee\/ads\//);
});


test('tabela TSV copiada da Central é importada com métricas por produto',()=>{
 const tsv=[
  'ID do Produto\tNome do Produto\tImpressões de Produto\tCliques Por Produto\tVisitantes do Produto\tCTR\tVisitantes (Adicionar ao Carrinho)\tUnidades (Adicionar ao Carrinho)\tPedidos',
  '58221909468\tCortina de Box\t2.684\t97\t475\t3,61%\t46\t63\t7'
 ].join('\n');
 const report=parseProductPerformanceReport(Buffer.from(tsv,'utf8'),{
  ...info,fileName:'Performance_Produto_Colado.csv'
 });
 assert.equal(report.records.length,1);
 const row=report.records[0];
 assert.equal(row.itemId,'58221909468');
 assert.equal(row.impressions,2684);
 assert.equal(row.clicks,97);
 assert.equal(row.visits,475);
 assert.equal(row.ctr,3.61);
 assert.equal(row.cartVisitors,46);
 assert.equal(row.cartUnits,63);
 assert.equal(row.orders,7);
 assert.equal(row.cartPending,null);
 assert.equal(row.cartAbandonmentRate,null);
});
test('colagem depende de ação do vendedor e nunca chama API privada da Central',()=>{
 const html=readFileSync(new URL('../public/index.html',import.meta.url),'utf8');
 const js=readFileSync(new URL('../public/organic-top10.js',import.meta.url),'utf8');
 assert.match(html,/id="organicTop10PasteText"/);
 assert.match(html,/id="organicTop10ReadClipboard"/);
 assert.match(js,/organicTop10ReadClipboard'\)\.addEventListener\('click'/);
 assert.match(js,/navigator\.clipboard\?\.readText\(\)/);
 assert.match(js,/Performance_Produto_Colado\.csv/);
 assert.match(js,/source==='organic'&&\$\('organicTop10OrganicConfirmed'\)\.checked/);
 assert.doesNotMatch(js,/fetch\(['"]https:\/\/seller\.shopee/);
});
