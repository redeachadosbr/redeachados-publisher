/* Rede Achados BR: unidades de pedidos por SKU e intervalo.
   A origem é exclusivamente o relatório XLS/XLSX importado no navegador.
   Não mistura pedido amplo Ads com unidades da planilha. */
(()=>{
'use strict';
function numeric(x){const n=Number(x);return Number.isFinite(n)&&n>=0?n:0}
function iso(value){return typeof value==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(value)?value:''}
function calculate(meta,record,from,to){
 const empty={available:false,covered:false,coverage:'missing',firstDate:'',
  lastDate:'',source:'Relatório de pedidos Shopee',units:null,
  fulfilled:null,pending:null,cancelled:null,unknown:null,orders:null,days:null};
 const dayStart=iso(from),dayEnd=iso(to);
 if(!dayStart||!dayEnd||dayStart>dayEnd)return {...empty,reason:'Período inválido'};
 if(!meta)return {...empty,reason:'Importe o relatório de pedidos XLSX na aba Produtos.'};
 if(meta.formatVersion!==2||!Array.isArray(meta.bySku))
  return {...empty,reason:'Reimporte o XLSX: o resumo antigo não contém datas por SKU.'};
 const firstDate=iso(meta.firstDate),lastDate=iso(meta.lastDate);
 const source=String(meta.sourceName||'Relatório de pedidos Shopee');
 const covered=!!firstDate&&!!lastDate&&firstDate<=dayStart&&lastDate>=dayEnd&&
  !(Number(meta.withoutDate)>0);
 const partial=!covered;
 let fulfilled=0,pending=0,cancelled=0,unknown=0,orders=0,all=0;
 const data=record&&record.byDate&&typeof record.byDate==='object'?record.byDate:{};
 for(const [day,entry] of Object.entries(data)){
  if(day<dayStart||day>dayEnd||!iso(day))continue;
  const groups=entry.statuses&&typeof entry.statuses==='object'?entry.statuses:{};
  fulfilled+=numeric(groups.shipped)+numeric(groups.delivered);
  pending+=numeric(groups.pending);
  cancelled+=numeric(groups.cancelled);
  unknown+=numeric(groups.unknown);
  orders+=numeric(entry.orders);
  all+=numeric(entry.units);
 }
 const units=fulfilled+pending;
 const count=Math.round((Date.parse(dayEnd+'T12:00:00Z')-Date.parse(dayStart+'T12:00:00Z'))/86400000)+1;
 return {available:true,covered,coverage:partial?'partial':'bounded',
  firstDate,lastDate,source,units,fulfilled,pending,cancelled,unknown,
  orders,days:count,all,
  // A cobertura entre datas é apenas indicativa; não assegura que o arquivo
  // represente todos os pedidos da loja ou tenha todas as linhas.
  reason:partial?'O arquivo não cobre todo o intervalo ou contém pedidos sem data.':'Intervalo dentro das datas do arquivo (cobertura indicativa).'};
}
function compareDaily(a,b){
 if(!a?.available||!b?.available||!a.covered||!b.covered||!(a.days>0)||!(b.days>0))return null;
 const previous=b.units/b.days,current=a.units/a.days;
 return {current,previous,delta:previous>0?(current/previous-1)*100:null};
}
window.RedeOrderPhase={calculate,compareDaily};
})();