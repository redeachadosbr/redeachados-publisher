// Resumo curto de decisão Ads. As cinco regras permanecem no motor original.
// Somente apresenta as ações calculadas; não altera ROAS nem campanhas.
(()=>{
'use strict';
const brNumber=x=>Number(x).toLocaleString('pt-BR',{maximumFractionDigits:2});
const brMoney=x=>Number(x).toLocaleString('pt-BR',{style:'currency',currency:'BRL'});
const asPercent=(from,to)=>{
 if(!(from>0)||!Number.isFinite(to))return null;
 return Math.round(Math.abs((to/from-1)*100));
};
function summarize(r,diagnosis){
 const d=r?.d||{},actions=[];
 const add=(label,detail='')=>actions.push({label,detail});
 const confirmed=r?.days>=7&&d.periodClosed===true;
 const mismatch=d.actual!==null&&d.actual!==undefined&&d.revenue!==null&&d.revenue!==undefined&&
  r.actual!==null&&r.actual!==undefined&&Math.abs(d.actual-r.actual)>.1;
 if(mismatch)return {actions:[{label:'Conferir números da campanha',detail:'ROAS informado difere de vendas ÷ investimento'}],pending:true};
 const extra=()=>{
  if(!confirmed)return;
  const candidates=Array.isArray(diagnosis?.action)?diagnosis.action:[];
  const labels=new Map([['Capa','Trocar capa'],['Título','Melhorar título'],['Preço','Verificar preço']]);
  for(const x of candidates){
   const label=labels.get(x.category);
   if(label&&!x.recent&&!actions.some(a=>a.label===label))add(label);
  }
 };
 if(r?.scenario===1||r?.scenario===2){
  if(r.scenario===2)add('Verificar preço','Conferir oferta, frete e conversão antes do ajuste');
  const roasPct=asPercent(d.target,r.suggestedROAS);
  if(roasPct!==null&&r.suggestedROAS<d.target)
   add('Baixar ROAS-alvo '+roasPct+'%',brNumber(d.target)+'x → '+brNumber(r.suggestedROAS)+'x');
  const budgetPct=asPercent(d.budget,r.suggestedBudget);
  if(budgetPct!==null&&r.suggestedBudget<d.budget)
   add('Reduzir orçamento '+budgetPct+'%',brMoney(d.budget)+' → '+brMoney(r.suggestedBudget));
  extra();
 }else if(r?.scenario===3){
  const roasPct=asPercent(d.target,r.suggestedROAS);
  if(roasPct!==null&&r.suggestedROAS>d.target)
   add('Aumentar ROAS-alvo '+roasPct+'%',brNumber(d.target)+'x → '+brNumber(r.suggestedROAS)+'x');
  add('Manter orçamento',d.budget>0?brMoney(d.budget):'');
  extra();
 }else if(r?.scenario===4){
  add('Opção A: orçamento +20%',brMoney(d.budget)+' → '+brMoney(d.budget*1.2)+' · ROAS igual');
  add('Opção B: ROAS-alvo +20%',brNumber(d.target)+'x → '+brNumber(d.target*1.2)+'x · orçamento igual');
  add('Opção C: ambos +20%','Orçamento '+brMoney(d.budget*1.2)+' · ROAS '+brNumber(d.target*1.2)+'x');
 }else if(r?.previewScenario){
  add('Acompanhar até fechar o período','Cenário '+r.previewScenario+' provisório; não executar ainda');
 }else if(r?.unlimitedRule){
  const u=r.unlimitedRule;
  if(u.candidate!==null&&u.candidate!==undefined&&Number.isFinite(u.candidate)&&u.candidate<d.target){
   add('Baixar ROAS-alvo '+asPercent(d.target,u.candidate)+'%',brNumber(d.target)+'x → '+brNumber(u.candidate)+'x · Teste da regra ilimitada');
  }else{
   add('Manter ROAS-alvo',d.target>0?brNumber(d.target)+'x':'');
  }
  extra();
 }else{
  if(d.budgetMode==='daily'&&!d.budgetStable)add('Conferir histórico do orçamento','O gasto diário não pode ser classificado com segurança');
  else if(!confirmed)add('Acompanhar campanha','Amostra ainda insuficiente ou período aberto');
  extra();
  if(!actions.length)add('Manter e acompanhar','Sem ajuste percentual confirmado');
 }
 return {actions:actions.slice(0,5),pending:false};
}
window.RedeAdsShortActions={summarize};
})();