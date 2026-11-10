// Rede Achados BR — núcleo puro de conciliação cumulativa, somente leitura.
(()=>{
'use strict';
const isoDate=x=>/^\d{4}-\d{2}-\d{2}$/.test(String(x||''))?String(x):'';
const ms=x=>Date.parse(x+'T12:00:00Z');
const move=(x,n)=>new Date(ms(x)+n*86400000).toISOString().slice(0,10);
const cents=x=>Math.round(Number(x)*100);
const money=x=>Math.round(x*100)/100;
const number=x=>x!==null&&x!==undefined&&x!==''&&Number.isFinite(Number(x))?Number(x):null;
const cleanSku=x=>String(x||'').trim().toUpperCase();
function makeRanges(start,end,maxDays=28){
 if(!isoDate(start)||!isoDate(end)||start>end||maxDays<2||maxDays>30)throw Error('Datas inválidas para consulta.');
 const total=Math.round((ms(end)-ms(start))/86400000)+1;
 if(total<2)throw Error('A API Ads exige pelo menos dois dias em cada consulta.');
 let parts=Math.ceil(total/maxDays);
 if(total/parts<2)throw Error('Não é possível cobrir a janela em blocos de pelo menos dois dias.');
 const base=Math.floor(total/parts),extra=total%parts;
 const chunks=[],nextStart=start;
 let pointer=nextStart;
 for(let i=0;i<parts;i++){
  const size=base+(i<extra?1:0);
  const last=move(pointer,size-1);
  chunks.push([pointer,last]);pointer=move(last,1);
 }
 if(pointer!==move(end,1))throw Error('Cobertura de datas inconsistente.');
 return chunks;
}
function campaignStart(changes,sku,today){
 const candidates=(Array.isArray(changes)?changes:[]).filter(x=>
  cleanSku(x?.sku)===cleanSku(sku)&&x?.timestamp&&
  /campanha\s+(?:iniciad[ao]|criad[ao]|ativad[ao])|in[ií]cio\s+(?:d[aeo]\s+)?campanha/i.test(String(x.note||'')+' '+(x.changes||[]).join(' '))
 ).map(x=>{
  const y=new Date(x.timestamp);if(!Number.isFinite(y.getTime()))return null;
  const parts=new Intl.DateTimeFormat('en-US',{timeZone:'America/Sao_Paulo',year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(y);
  const obj=Object.fromEntries(parts.filter(p=>p.type!=='literal').map(p=>[p.type,p.value]));
  return obj.year+'-'+obj.month+'-'+obj.day;
 }).filter(Boolean).sort();
 const start=candidates[0]||null;
 if(!start)return {start:null,reason:'A data de início da campanha não foi localizada no histórico.'};
 if(today&&start>today)return {start:null,reason:'A data de início da campanha está no futuro.'};
 return {start,reason:null};
}
function adSpend(chunks,campaignId){
 let total=0,missing=[];
 const id=String(campaignId||'');
 for(const part of chunks){
  const found=Array.isArray(part.data?.campaigns)?part.data.campaigns.find(x=>String(x.campaignId)===id):null;
  if(part.data?.dateAdjustment?.shiftedDays||!found){
   missing.push(part.from+' a '+part.to);continue;
  }
  const spend=number(found.expense);
  if(spend===null||spend<0||!Number.isInteger(spend*100+1e-6)&&Math.abs(spend*100-Math.round(spend*100))>1e-4){
   missing.push(part.from+' a '+part.to);continue;
  }
  if(Number(found.daysWithData)===0&&spend===0){
   // A API não confirmou métricas diárias para a janela; não assumir zero.
   missing.push(part.from+' a '+part.to);continue;
  }
  total+=cents(spend);
 }
 return {spent:missing.length?null:total/100,knownSpend:total/100,complete:missing.length===0,missing};
}
function orderBalance(rows,sku){
 const target=cleanSku(sku);
 const byOrder=new Map(),issues=[];
 for(const r of rows){
  const id=String(r?.orderSn||'').trim();
  if(!id){issues.push('pedido sem número');continue}
  const list=(Array.isArray(r.skuList)?r.skuList:[]).map(cleanSku).filter(Boolean);
  if(!list.includes(target))continue;
  // A API não traz repasse líquido individual por SKU de um pedido multissku.
  if(new Set(list).size!==1){issues.push('pedido '+id+' possui vários SKUs');continue}
  // A resposta de uma janela pode estar repetida em consultas limítrofes.
  if(byOrder.has(id))continue;
  const payout=number(r.payout),cost=number(r.totalCost);
  const credit=number(r.supplierCredit??0),external=number(r.externalExpense??0);
  const known=payout!==null&&cost!==null&&credit!==null&&external!==null;
  const done=r.status==='COMPLETED'&&r.payoutConfirmed===true&&
   r.refundPending!==true&&r.costSource==='wedrop_order_recorded';
  byOrder.set(id,{known,done,amount:known?cents(payout)-cents(cost)+cents(credit)-cents(external):null,
   costSource:r.costSource||'',refundPending:r.refundPending===true});
 }
 let known=0,ready=0,positive=0,negative=0;
 for(const row of byOrder.values()){
  if(row.known){known+=row.amount;row.done?ready++:0;if(row.amount>=0)positive++;else negative++}
 }
 return {beforeAds:byOrder.size&&ready===byOrder.size&&issues.length===0?known/100:null,
  knownBeforeAds:known/100,orderCount:byOrder.size,ready,issues,
  incomplete:byOrder.size!==ready||issues.length>0,positive,negative};
}
function reconcile({ads,orders,financialCoverage=true,xlsx=null}={}){
 const amount=ads?.spent??null;
 if(orders?.beforeAds!==null&&orders?.beforeAds!==undefined&&
    amount!==null&&ads.complete&&financialCoverage&&!orders.incomplete){
  return {status:'confirmed',spent:amount,operatingBeforeAds:orders.beforeAds,
    afterAds:money(orders.beforeAds-amount),source:'api',reasons:[]};
 }
 if(xlsx?.beforeAds!==null&&xlsx?.beforeAds!==undefined&&xlsx.complete&&
    amount!==null&&ads?.complete){
  return {status:'xlsx',spent:amount,operatingBeforeAds:xlsx.beforeAds,
    afterAds:money(xlsx.beforeAds-amount),source:'xlsx_before_ads',reasons:[]};
 }
 const reasons=[];
 if(!ads?.complete)reasons.push('investimento Ads incompleto');
 if(!financialCoverage)reasons.push('pedidos, devoluções ou repasses incompletos na API');
 if(orders?.incomplete)reasons.push('custos ou repasses por pedido pendentes');
 if(!orders?.orderCount&&!xlsx?.complete)reasons.push('lucro por SKU não confirmado');
 return {status:'pending',spent:amount,knownSpend:ads?.knownSpend??null,
  operatingBeforeAds:null,afterAds:null,source:null,reasons:[...new Set(reasons)]};
}
window.RedeCampaignFinance={makeRanges,campaignStart,adSpend,orderBalance,reconcile};
})();