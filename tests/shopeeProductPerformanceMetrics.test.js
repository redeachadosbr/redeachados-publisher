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
test('novo popup remove campo colar tabela e oferece seletor de quantidade',()=>{
 const html=readFileSync(new URL('../public/index.html',import.meta.url),'utf8');
 const js=readFileSync(new URL('../public/organic-top10.js',import.meta.url),'utf8');
 const css=readFileSync(new URL('../public/organic-top10.css',import.meta.url),'utf8');
 assert.doesNotMatch(html,/id="organicTop10PasteText"/);
 assert.doesNotMatch(html,/id="organicTop10ReadClipboard"/);
 assert.doesNotMatch(js,/navigator\.clipboard|organicTop10PasteText/);
 assert.match(html,/id="organicTop10ImportLimit"/);
 assert.match(html,/id="organicTop10Limit"/);
 for(const n of [10,20,50,100])assert.match(html,new RegExp('<option value="'+n+'">'));
 assert.match(html,/organic-top10-import-help/);
 assert.match(html,/organic-top10-import-date-grid/);
 assert.match(js,/rankingLimit=10/);
 assert.match(js,/limit:String\(rankingLimit\)/);
 assert.match(css,/\[data-importing="true"\]/);
 assert.doesNotMatch(js,/fetch\(['"]https:\/\/seller\.shopee/);
});
test('limite configurável traz até 100 SKUs sem afetar ordenação',()=>{
 const rows=Array.from({length:130},(_,i)=>({
  itemId:String(i+1),sku:'SKU-'+(i+1),impressions:100+i,visits:10+i,
  clicks:5+i,ctr:4
 }));
 assert.equal(rankOrganicTop(rows).length,10);
 for(const limit of [10,20,50,100]){
  const top=rankOrganicTop(rows,{sort:'impressions',limit});
  assert.equal(top.length,limit);
  assert.equal(top[0].itemId,'130');
  assert.equal(top.at(-1).itemId,String(131-limit));
 }
 assert.equal(rankOrganicTop(rows,{limit:999}).length,100);
});
test('endpoints aplicam limite recebido antes de retornar ranking',()=>{
 const server=readFileSync(new URL('../server.js',import.meta.url),'utf8');
 assert.match(server,/const productRankingLimit=value=>\[10,20,50,100\]/);
 assert.match(server,/rankObservedViews\(snapshots,window,\{limit:productRankingLimit\(req\.query\.limit\)\}\)/);
 assert.match(server,/rankOrganicTop\(snapshot\.records,\{sort,limit:productRankingLimit\(req\.query\.limit\)\}\)/);
 assert.match(server,/readBaseInfoBatches\(cfg,auth,ids\)/);
});
test('planilha com abas gerais não é misturada: usuário seleciona uma aba de produto',()=>{
 const workbook=XLSX.utils.book_new();
 XLSX.utils.book_append_sheet(workbook,XLSX.utils.aoa_to_sheet([
  ['SKU','Impressões','Cliques'],['PROD-A',450,25]
 ]),'Produto Pai');
 XLSX.utils.book_append_sheet(workbook,XLSX.utils.aoa_to_sheet([
  ['SKU','Impressões','Cliques'],['VARIACAO-A',300,11]
 ]),'Variações');
 const buffer=XLSX.write(workbook,{bookType:'xlsx',type:'buffer'});
 const options={...info,fileName:'parentskudetail.20261004_20261102.xlsx'};
 assert.throws(()=>parseProductPerformanceReport(buffer,options),error=>
  Array.isArray(error.availableSheets)&&error.availableSheets.length===2&&
  /Escolha a aba/.test(error.message));
 const report=parseProductPerformanceReport(buffer,{...options,sheetName:'Produto Pai'});
 assert.equal(report.sheetName,'Produto Pai');
 assert.equal(report.records.length,1);
 assert.equal(report.records[0].sku,'PROD-A');
 assert.equal(report.records[0].impressions,450);
 assert.equal(report.records.some(x=>x.sku==='VARIACAO-A'),false);
 assert.equal(report.source,'seller_center_product_performance_export');
});
test('relatório com abas orgânica e Ads escolhe apenas orgânico e impede aba paga',()=>{
 const workbook=XLSX.utils.book_new();
 XLSX.utils.book_append_sheet(workbook,XLSX.utils.aoa_to_sheet([
  ['SKU','Impressões','Cliques','Origem do Tráfego'],
  ['ORG-A',1000,120,'Busca Orgânica']
 ]),'Orgânico');
 XLSX.utils.book_append_sheet(workbook,XLSX.utils.aoa_to_sheet([
  ['SKU','Impressões','Cliques','Origem do Tráfego'],
  ['ADS-A',5000,300,'Shopee Ads']
 ]),'Ads');
 const data=XLSX.write(workbook,{bookType:'xlsx',type:'buffer'});
 const options={...info,fileName:'trafego.xlsx',organicConfirmed:true};
 const report=parseOrganicReport(data,options);
 assert.equal(report.sheetName,'Orgânico');
 assert.equal(report.records.length,1);
 assert.equal(report.records[0].sku,'ORG-A');
 assert.throws(()=>parseOrganicReport(data,{...options,sheetName:'Ads'}),/paga\/Ads/);
});
test('não rotular abas genéricas com múltiplas fontes como orgânicas',()=>{
 const workbook=XLSX.utils.book_new();
 for(const [tab,sku] of [['Produto Pai','A'],['Variações','B']]){
  XLSX.utils.book_append_sheet(workbook,XLSX.utils.aoa_to_sheet([
   ['SKU','Impressões'],[sku,200]
  ]),tab);
 }
 const data=XLSX.write(workbook,{bookType:'xlsx',type:'buffer'});
 const options={...info,fileName:'parentskudetail.xlsx',organicConfirmed:true};
 assert.throws(()=>parseOrganicReport(data,options),/não é possível determinar/i);
 assert.throws(()=>parseOrganicReport(data,{...options,sheetName:'Produto Pai'}),/não comprova tráfego/);
});
test('servidor e interface permitem indicar uma aba sem misturar fontes',()=>{
 const server=readFileSync(new URL('../server.js',import.meta.url),'utf8');
 const ui=readFileSync(new URL('../public/organic-top10.js',import.meta.url),'utf8');
 assert.match(server,/availableSheets:error\.availableSheets\|\|null/);
 assert.match(server,/periodEnd,organicConfirmed,sheetName/);
 assert.match(ui,/organicTop10SheetRow/);
 assert.match(ui,/sheetName:\$\('organicTop10File'\)/);
 assert.match(ui,/data\.availableSheets/);
});

test('XLSX parentskudetail real: ignora hifens, escolhe aba correta, não duplica variações',()=>{
 const workbook=XLSX.utils.book_new();
 const cols=['ID do Item','Produto','ID da Variação','SKU da Variação','SKU Principle',
  'Impressão do Produto','Cliques Por Produto','CTR','Visitantes do Produto (Visita)',
  'Visitantes do Produto (Adicionar ao Carrinho)',
  'Unidades (adicionar ao carrinho)','Taxa de Conversão (adicionar ao carrinho)',
  'Pedido Feito','Unidades (Pedido realizado)','Taxa de Conversão de Pedido (Pedido Realizado)'];
 XLSX.utils.book_append_sheet(workbook,XLSX.utils.aoa_to_sheet([
  cols,
  ['58268864630','Rena LED','-','-','NTM3001127V','4985','126','2,53%','96','4','6','4,17%','1','1','0,79%'],
  ['58268864630','Rena LED','149557639203','NTM3001220V','NTM3001127V',
   '-','-','-','-','2','4','-','-','1','-'],
  // A mesma SKU principal aparece em vários Item IDs da Shopee.
  ['58268864631','Outro anúncio','-','-','NTM3001127V','400','20','5%','30','-','-','-','-','-','-']
 ]),'Produtos com Melhor Desempenho');
 XLSX.utils.book_append_sheet(workbook,XLSX.utils.aoa_to_sheet([
  ['ID do Item','Produto','Impressão do Produto','Cliques Por Produto','CTR'],
  ['58272083884','Escova giratória','1','0','0,00%']
 ]),'Produtos Recém-Cadastrados');
 XLSX.utils.book_append_sheet(workbook,XLSX.utils.aoa_to_sheet([
  ['ID do Item','Produto','Impressão do Produto','Cliques Por Produto','CTR'],
  ['58268864630','Rena LED','999','50','5,01%']
 ]),'Acompanhar Performance dos ADS');
 const data=XLSX.write(workbook,{bookType:'xlsx',type:'buffer'});
 const report=parseProductPerformanceReport(data,{
  ...info,fileName:'parentskudetail.20261004_20261102.xlsx',
  periodStart:'2026-10-04',periodEnd:'2026-11-02'
 });
 assert.equal(report.sheetName,'Produtos com Melhor Desempenho');
 assert.equal(report.source,'seller_center_product_performance_export');
 assert.equal(report.records.length,2);
 assert.equal(report.skipped.variation,1);
 const one=report.records[0],two=report.records[1];
 assert.equal(one.itemId,'58268864630');
 assert.equal(one.sku,'NTM3001127V','preferir SKU Principle, não SKU da Variação');
 assert.equal(one.impressions,4985);
 assert.equal(one.clicks,126);
 assert.equal(one.visits,96);
 assert.equal(one.ctr,2.53);
 assert.equal(one.cartVisitors,4);
 assert.equal(one.cartUnits,6);
 assert.equal(one.cartConversionRate,4.17);
 assert.equal(one.orders,1);
 assert.equal(one.soldUnits,1);
 assert.equal(one.orderConversionRate,0.79);
 assert.equal(two.itemId,'58268864631');
 assert.equal(two.sku,'NTM3001127V');
 assert.equal(two.cartVisitors,null,'hífen indica dado ausente, não zero');
 assert.equal(two.orders,null);
 assert.equal(two.impressions,400);
 assert.equal(report.records.some(x=>x.impressions===999),false,'não misturar abas Ads');
});
test('relatório com hífen nos campos numéricos ignora ausência sem interromper todo o arquivo',()=>{
 const csv='ID do Item;Impressão do Produto;Cliques Por Produto;CTR;Pedido Feito\n'+
   '58268864630;125;5;4,00%;-\n'+
   '58268864631;10;0;0,00%;—\n';
 const report=parseProductPerformanceReport(Buffer.from(csv),{
  ...info,fileName:'parentskudetail.csv'
 });
 assert.equal(report.records[0].orders,null);
 assert.equal(report.records[1].orders,null);
 assert.equal(report.records[1].clicks,0);
});
test('confirmação exclusivamente orgânica oculta na aba Performance do Produto',()=>{
 const css=readFileSync(new URL('../public/organic-top10.css',import.meta.url),'utf8');
 assert.match(css,/\.organic-top10-consent\[hidden\]\{display:none!important\}/);
});

test('arquivo oficial TRC0886: 7 impressões, 13 cliques, CTR 185,71% sem bloquear importação',()=>{
 const book=XLSX.utils.book_new();
 XLSX.utils.book_append_sheet(book,XLSX.utils.aoa_to_sheet([
  ['ID do Item','Produto','ID da Variação','SKU Principle','Impressão do Produto',
   'Cliques Por Produto','CTR','Visitantes do Produto (Visita)','Pedido Feito',
   'Taxa de Conversão (adicionar ao carrinho)'],
  ['58214693188','Escorredor Louças 3 Andares','-','TRC0886',7,13,'185,71%',11,0,'0,00%'],
  ['58214693189','Produto normal','-','SKU-2',500,25,'5,00%',40,2,'8,00%']
 ]),'Produtos com Melhor Desempenho');
 const buffer=XLSX.write(book,{bookType:'xlsx',type:'buffer'});
 const report=parseProductPerformanceReport(buffer,{
  ...info,fileName:'parentskudetail.20261004_20261102.xlsx',
  periodStart:'2026-10-04',periodEnd:'2026-11-02'
 });
 assert.equal(report.records.length,2,'não interromper a importação dos demais anúncios');
 const outlier=report.records.find(x=>x.sku==='TRC0886');
 assert.equal(outlier.itemId,'58214693188');
 assert.equal(outlier.impressions,7);
 assert.equal(outlier.clicks,13);
 assert.equal(outlier.ctr,185.71,'preservar o CTR efetivamente informado pela Shopee');
 assert.equal(report.anomalies.clicksOverImpressions,1);
 assert.equal(report.anomalies.ctrAbove100,1);
 assert.deepEqual(report.anomalies.examples[0],{
  sku:'TRC0886',itemId:'58214693188',impressions:7,clicks:13,ctr:185.71
 });
 assert.equal(report.records[1].cartConversionRate,8);
 const organicSheet=Buffer.from('SKU;Impressões;Cliques;CTR\nTRC0886;7;13;185,71%\n','utf8');
 assert.throws(()=>parseOrganicReport(organicSheet,{
  ...info,fileName:'organico.csv',organicConfirmed:true
 }),/Cliques maiores que impressões/,'a regra de origem comprovada não deve mudar');
});
test('taxas de conversão acima de 100 não ganham exceção do CTR oficial',()=>{
 const csv='SKU;Impressões;Cliques;CTR;Taxa de Conversão (adicionar ao carrinho)\n'+
  'TRC0886;7;13;185,71%;150,00%\n';
 const report=parseProductPerformanceReport(Buffer.from(csv),{...info,fileName:'report.csv'});
 assert.equal(report.records[0].ctr,185.71);
 assert.equal(report.records[0].cartConversionRate,null);
 assert.equal(report.anomalies.ctrAbove100,1);
 assert.equal(report.anomalies.clicksOverImpressions,1);
});
test('interface alerta CTR incomum apenas na Performance geral sem modificar registros',()=>{
 const server=readFileSync(new URL('../shopeeOrganicPerformance.js',import.meta.url),'utf8');
 const ui=readFileSync(new URL('../public/organic-top10.js',import.meta.url),'utf8');
 assert.match(server,/unusualMetrics:report\.anomalies/);
 assert.match(ui,/data\.metadata\?\.unusualMetrics\?\.clicksOverImpressions/);
 assert.match(ui,/CTR oficial preservado/);
});
