import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {resolve,dirname} from 'node:path';
import vm from 'node:vm';

const folder=resolve(dirname(fileURLToPath(import.meta.url)),'..');
const source=name=>readFileSync(resolve(folder,name),'utf8');
const shift=(x,n)=>new Date(Date.parse(x+'T12:00:00Z')+n*86400000).toISOString().slice(0,10);
const inDays=(a,b)=>Math.round((Date.parse(b+'T12:00:00Z')-Date.parse(a+'T12:00:00Z'))/86400000)+1;
const day=x=>{
 const a=new Intl.DateTimeFormat('en-US',{timeZone:'America/Sao_Paulo',year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(new Date(x));
 const o=Object.fromEntries(a.filter(x=>x.type!=='literal').map(x=>[x.type,x.value]));
 return o.year+'-'+o.month+'-'+o.day;
};
function timeline(){
 const win={};
 const node={addEventListener(){}};
 const ctx={window:win,document:{getElementById(){return node}},
  historyBrazilDate:day,historyMoveDay:shift,daysInclusive:inDays,
  getChanges(){return []}};
 vm.runInNewContext(source('evolution.js'),ctx,{filename:'evolution.js'});
 return win.RedeEvolution;
}
function sales(){
 const win={};
 vm.runInNewContext(source('order-phase-metrics.js'),{window:win},{filename:'order-phase-metrics.js'});
 return win.RedeOrderPhase;
}
function parser(){
 const html=source('index.html');
 const inline=html.match(/<script>\s*([\s\S]*?)<\/script>/)?.[1];
 assert.ok(inline,'Script de importação presente');
 const slice=(start,end)=>{
  const i=inline.indexOf(start),j=inline.indexOf(end,i);
  assert.ok(i>=0&&j>i,'Funções presentes: '+start);
  return inline.slice(i,j);
 };
 const code=slice('function normalizeSupplierSku(value){','function importSupplierRows(rows){')+
  slice('function orderDateISO(raw){','function compareOrdersToAds(d){');
 return new Function(code+';return {summarizeOrderRows,orderStatusGroup};')();
}
test('histórico 28/10 e 03/11 cria fases distintas e dias de transição',()=>{
 const api=timeline();
 const changes=[
  {id:'a',timestamp:'2026-10-28T23:28:06Z',changes:['Preço'],note:'Preço novo'},
  {id:'b',timestamp:'2026-11-03T13:11:19Z',changes:['ROAS alvo','Impulsão Rápida'],note:'ROAS 25'}
 ];
 const model=api.makePhases('11991','2026-10-28','2026-11-10','2026-11-10',changes);
 assert.deepEqual(JSON.parse(JSON.stringify(model.phases.filter(x=>x.type==='full').map(x=>[x.from,x.to,x.label]))),
  [['2026-10-29','2026-11-02','Preço'],['2026-11-04','2026-11-09','ROAS alvo + Impulsão Rápida']]);
 assert.deepEqual(JSON.parse(JSON.stringify(model.phases.filter(x=>x.type==='transition').map(x=>x.from))),['2026-10-28','2026-11-03']);
 assert.deepEqual(JSON.parse(JSON.stringify(api.requestsFor(model).map(x=>[x.from,x.to]))),
  [['2026-10-29','2026-11-02'],['2026-11-04','2026-11-09']]);
});
test('nenhuma alteração e alteração hoje não duplicam dias',()=>{
 const api=timeline();
 const model=api.makePhases('11991','2026-10-28','2026-11-10','2026-11-10',[]);
 assert.equal(model.phases.filter(x=>x.type==='full').length,1);
 assert.equal(model.phases[0].to,'2026-11-09');
 const today=api.makePhases('11991','2026-11-09','2026-11-10','2026-11-10',
  [{id:'x',timestamp:'2026-11-10T14:00:00Z',changes:['Preço']}]);
 assert.equal(today.phases.filter(x=>x.type==='transition').length,1);
 assert.equal(today.current,null);
});
test('janelas API até 28 dias nunca criam bloco isolado',()=>{
 const api=timeline();
 for(const length of [2,7,28,29,30,57,179]){
  const until=shift('2026-05-01',length-1);
  const model=api.makePhases('S','2026-05-01',until,'2026-11-10',[]);
  const jobs=api.requestsFor(model);
  assert.equal(jobs.reduce((sum,j)=>sum+inDays(j.from,j.to),0),length);
  assert.ok(jobs.every(j=>inDays(j.from,j.to)>=2&&inDays(j.from,j.to)<=28));
 }
});
test('pedidos de um mesmo número com SKUs diferentes não são perdidos e duplicados não são somados',()=>{
 const p=parser();
 const rows=[['Status','Produtos','Número do Pedido','Data de Criação'],
  ['Pendente','SKU: ABC1 (2 x)','P1','29/10/2026'],
  ['Pendente','SKU: ABC1 (2 x)','P1','29/10/2026'],
  ['Enviado','SKU: XYZ2 (1 x)','P1','29/10/2026'],
  ['Cancelado','SKU: ABC1 (3 x)','P2','01/11/2026']];
 const result=p.summarizeOrderRows(rows);
 assert.equal(result.formatVersion,3);
 assert.equal(result.orderCount,2);
 assert.equal(result.duplicateLines,1);
 assert.equal(result.bySku.find(x=>x.sku==='ABC1').units,5);
 assert.equal(result.bySku.find(x=>x.sku==='XYZ2').units,1);
 const counted=sales().calculate(result,result.bySku.find(x=>x.sku==='ABC1'),'2026-10-29','2026-11-02');
 assert.equal(counted.units,2);
 assert.equal(counted.pending,2);
 assert.equal(counted.cancelled,3);
});
test('arquivo sem cobertura ou resumo antigo não é apresentado como vendas completas',()=>{
 const calc=sales().calculate;
 const meta={formatVersion:3,bySku:[],firstDate:'2026-11-01',lastDate:'2026-11-08',withoutDate:0};
 const partial=calc(meta,null,'2026-10-28','2026-11-08');
 assert.equal(partial.covered,false);
 assert.equal(partial.units,0);
 assert.equal(calc({...meta,formatVersion:2},null,'2026-11-02','2026-11-04').available,false);
 assert.equal(calc(null,null,'2026-11-02','2026-11-04').available,false);
});
