import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import * as XLSX from '@stackline/xlsx';
import {parseOrganicCsv,parseOrganicReport,rankOrganicTop}
 from '../shopeeOrganicPerformance.js';
const date={periodStart:'2026-10-01',periodEnd:'2026-10-30',organicConfirmed:true};
const csv=text=>Buffer.from(text,'utf8');
test('leitura CSV da Shopee conta visitas, cliques, impressões e calcula CTR orgânico',()=>{
 const input='SKU;Impressões;Visitantes do Produto;Cliques;Origem do Tráfego;Produto\r\n'+
 'ABC-1;1.250;425;75;Busca Orgânica;Produto A\r\n'+
 'ABC-2;600;250;60;Recomendação Orgânica;Produto B\r\n'+
 'ADS-1;2.000;650;100;Shopee Ads;Anúncio Pago\r\n';
 const report=parseOrganicReport(csv(input),{...date,fileName:'relatorio.csv'});
 assert.equal(report.records.length,2);
 assert.equal(report.records[0].impressions,1250);
 assert.equal(report.records[0].visits,425);
 assert.equal(report.records[0].clicks,75);
 assert.equal(report.records[0].ctr,6);
 assert.equal(report.skipped.paid,1);
 assert.equal(report.metricAvailability.ctr,true);
 assert.equal(report.records.some(x=>x.sku==='ADS-1'),false);
});
test('CSV suporta campos com aspas e não inventa métricas que não aparecem no relatório',()=>{
 const body='SKU;Visitantes do Produto;Nome do Produto\n"SKU;12";198;"Vaso; Lindo"\n';
 const parsed=parseOrganicCsv(body);
 assert.equal(parsed[1][0],'SKU;12');
 const report=parseOrganicReport(csv(body),{...date,fileName:'s.csv'});
 assert.equal(report.records[0].visits,198);
 assert.equal(report.records[0].impressions,null);
 assert.equal(report.records[0].clicks,null);
 assert.equal(report.records[0].ctr,null);
});
test('não aceita classificação orgânica sem confirmação ou com origem indefinida',()=>{
 const raw=csv('SKU;Visitas;Origem do Tráfego\nSKU-1;200;Total\n');
 assert.throws(()=>parseOrganicReport(raw,{...date,organicConfirmed:false,fileName:'s.csv'}),/Confirme/);
 assert.throws(()=>parseOrganicReport(raw,{...date,fileName:'s.csv'}),/sem confirmação orgânica/);
 assert.throws(()=>parseOrganicReport(csv('SKU;Visitas;Origem do Tráfego\nSKU-1;200;Anúncios pagos\n'),
  {...date,fileName:'s.csv'}),/Não encontrei SKUs/);
});
test('o importador não duplica SKU e rejeita valor conflitante ou período inválido',()=>{
 const duplicate=csv('SKU;Impressões\nSK1;100\nSK1;200\n');
 assert.throws(()=>parseOrganicReport(duplicate,{...date,fileName:'s.csv'}),/repetida/);
 const wrong=csv('SKU;Impressões;Cliques\nSK1;100;123\n');
 assert.throws(()=>parseOrganicReport(wrong,{...date,fileName:'s.csv'}),/maiores que impressões/);
 assert.throws(()=>parseOrganicReport(csv('SKU;Visitas\nSK1;1\n'),
  {...date,periodStart:'2026-11-01',periodEnd:'2026-10-01',fileName:'s.csv'}),/datas/);
});
test('arquivo XLSX oficial aceita SKU, cliques e visitas reais',()=>{
 const workbook=XLSX.utils.book_new();
 const sheet=XLSX.utils.aoa_to_sheet([
  ['SKU','Cliques','Visitas','Impressões'],
  ['T234',31,150,850]
 ]);
 XLSX.utils.book_append_sheet(workbook,sheet,'Produtos');
 const buffer=XLSX.write(workbook,{bookType:'xlsx',type:'buffer'});
 const report=parseOrganicReport(buffer,{...date,fileName:'Performance.xlsx'});
 assert.equal(report.records.length,1);
 assert.equal(report.records[0].sku,'T234');
 assert.equal(report.records[0].visits,150);
 assert.equal(report.records[0].ctr,Number((31*100/850).toFixed(2)));
});
test('TOP 10 ranqueia por métricas orgânicas comprovadas e permite ordenar por CTR',()=>{
 const records=Array.from({length:17},(_,i)=>({
  sku:'SKU'+(i+1),impressions:100+i*90,visits:30+i*18,
  clicks:3+i*6,ctr:Number((100*(3+i*6)/(100+i*90)).toFixed(2))
 }));
 const top=rankOrganicTop(records);
 assert.equal(top.length,10);
 assert.equal(top[0].sku,'SKU17');
 assert.equal(top[9].sku,'SKU8');
 assert.equal(rankOrganicTop(records,{sort:'impressions'})[0].sku,'SKU17');
 const special=[
  {sku:'A',impressions:100,visits:30,clicks:20,ctr:20},
  {sku:'B',impressions:900,visits:120,clicks:55,ctr:6.11}
 ];
 assert.equal(rankOrganicTop(special,{sort:'ctr'})[0].sku,'A');
});
test('popup abre após login autenticado e não usa API Ads como fonte',()=>{
 const html=readFileSync(new URL('../public/index.html',import.meta.url),'utf8');
 const ui=readFileSync(new URL('../public/organic-top10.js',import.meta.url),'utf8');
 const server=readFileSync(new URL('../server.js',import.meta.url),'utf8');
 const app=readFileSync(new URL('../public/app.js',import.meta.url),'utf8');
 assert.match(html,/id="organicTop10Overlay"/);
 assert.match(html,/organic-top10\.js\?v=/);
 assert.match(html,/id="organicTop10File"/);
 assert.match(html,/id="organicTop10Open"/);
 assert.match(ui,/window\.addEventListener\('ra:app-authorized'/);
 assert.match(app,/dispatchEvent\(new Event\('ra:app-authorized'\)\)/);
 assert.match(ui,/\/api\/shopee\/organic\/top10/);
 assert.match(ui,/\/api\/shopee\/organic\/top10\/import/);
 assert.match(server,/\/api\/shopee\/organic\/top10/);
 assert.match(server,/\/api\/shopee\/organic\/top10\/import/);
 assert.doesNotMatch(ui,/\/api\/shopee\/ads\//);
 assert.match(server,/source:snapshot\.source/);
});
