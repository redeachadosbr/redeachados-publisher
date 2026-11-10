// V17.1 — Apenas diagnóstico provisório; nenhuma caixa de seleção rápida é criada.
// A consulta é feita no formulário principal, com datas manuais e SKU selecionado.
(()=>{
'use strict';
const byId=id=>document.getElementById(id);
if(!byId('resultEmpty')||!byId('productSelect'))return;
const css=document.createElement('style');
css.textContent=[
'.ads-provisional{padding:5px 2px 20px}',
'.ads-provisional .ads-provisional-head{font-size:11px;font-weight:800;color:#f0c777;letter-spacing:1.1px}',
'.ads-provisional h3{font-size:23px;line-height:1.18;margin:10px 0;color:#f6faff}',
'.ads-provisional .ads-p-meta{color:#bed0e1;font-size:12px;margin:3px 0 17px}',
'.ads-provisional .ads-p-kpis{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:10px;margin:15px 0}',
'.ads-provisional .ads-p-kpis>div{background:#14202f;border:1px solid #41566c;border-radius:11px;padding:13px}',
'.ads-provisional .ads-p-kpis small{display:block;color:#b2c8db;font-size:11px}',
'.ads-provisional .ads-p-kpis strong{font-size:21px;color:#f5fbff;line-height:1.45}',
'.ads-provisional .ads-p-action{background:#243044;border:1px solid #52657b;border-left:4px solid #e3b460;padding:15px;border-radius:10px;color:#dce9f8;font-size:13px;line-height:1.55}',
'.ads-provisional .ads-p-action strong{display:block;color:#fff;font-size:16px;margin-bottom:6px}',
'.ads-provisional .ads-p-note{font-size:12px;color:#c2d3e6;margin-top:13px;line-height:1.55}',
'.ads-provisional .ads-p-warn{color:#f3d29d;font-size:12px;border-top:1px solid #41566a;margin-top:14px;padding-top:12px}'
].join('\n');
document.head.append(css);
const escapeText=x=>String(x??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const preview=document.createElement('section');
preview.className='ads-provisional';preview.hidden=true;
preview.setAttribute('aria-label','Diagnóstico parcial Shopee Ads');
byId('resultEmpty').after(preview);
function clearPreview(){preview.hidden=true}
function isProvisional(){return !preview.hidden}
function renderProvisional(d,errors=[]){
 // Não classificar consumo nem inventar orçamento: só resumo confiável da API.
 if(!d||!d.sku||d.sku!==byId('productSelect').value||!Array.isArray(errors)||!errors.length)return false;
 const allowed=/Informe um orçamento diário maior que zero|Informe um ROAS alvo maior que zero/;
 if(errors.some(x=>!allowed.test(x)))return false;
 if(d.spent===null||d.spent<0||(d.revenue===null&&d.actual===null))return false;
 const realised=d.spent>0?(d.revenue!==null?d.revenue/d.spent:d.actual):null;
 const ctr=d.impressions>0&&d.clicks!==null?d.clicks/d.impressions*100:null;
 const finance=calcFinance(d,realised);
 const min=finance&&Number.isFinite(finance.minRoas)?finance.minRoas:null;
 const balance=finance&&Number.isFinite(finance.breakeven)?finance.breakeven:null;
 let headline='Acompanhar antes de alterar';
 let advice='Ainda não há volume suficiente para concluir o desempenho. Mantenha a campanha em observação e confira os dados do anúncio.';
 if(realised!==null&&finance&&(!Number.isFinite(finance.breakeven)||realised<finance.breakeven)){
  headline='Risco de margem negativa';
  advice='O ROAS realizado está abaixo do equilíbrio estimado pelo cadastro. Revise preço, custo WeDrop, taxas e atribuição das vendas antes de manter ou aumentar os gastos.';
 }else if(realised!==null&&finance&&(!Number.isFinite(finance.minRoas)||realised<finance.minRoas)){
  headline='Margem desejada não atingida';
  advice='O ROAS da campanha está abaixo do necessário para a margem desejada cadastrada. Não aumente o investimento e verifique a rentabilidade antes de reduzir a meta.';
 }else if(realised!==null&&d.target>0&&realised<d.target){
  headline='ROAS abaixo da meta';
  advice='O ROAS realizado não alcançou a meta. Revise custo, preço, frete e o potencial de conversão sem modificar vários elementos ao mesmo tempo.';
 }else if(d.clicks!==null&&d.clicks<20){
  headline='Poucos cliques para concluir';
  advice='A quantidade de cliques ainda é pequena. Acompanhe mais dias antes de uma decisão de orçamento ou mudança de capa.';
 }
 if(ctr!==null&&d.impressions>=100&&ctr<1){
  advice+=' O CTR está abaixo da referência interna de 1%; vale comparar capa e título, mas isso não comprova que a imagem seja o problema.';
 }
 const brMoney=value=>Number(value||0).toLocaleString('pt-BR',{style:'currency',currency:'BRL'});
 const brNum=value=>Number(value||0).toLocaleString('pt-BR',{maximumFractionDigits:0});
 const brRatio=value=>value===null||!Number.isFinite(value)?'—':value.toLocaleString('pt-BR',{minimumFractionDigits:2,maximumFractionDigits:2})+'x';
 const brPct=value=>value===null||!Number.isFinite(value)?'—':value.toLocaleString('pt-BR',{minimumFractionDigits:2,maximumFractionDigits:2})+'%';
 const label=(name,value)=>'<div><small>'+escapeText(name)+'</small><strong>'+escapeText(value)+'</strong></div>';
 const note=errors.some(x=>/orçamento diário/.test(x))?
  'O orçamento diário não foi confirmado. O diagnóstico acima está disponível, mas os quatro cenários de consumo ficam pendentes.':
  'A meta de ROAS não foi confirmada. O diagnóstico de vendas e margem continua disponível.';
 preview.innerHTML='<span class="ads-provisional-head">DIAGNÓSTICO DOS DADOS DISPONÍVEIS</span>'+
  '<h3>'+escapeText(headline)+'</h3>'+
  '<p class="ads-p-meta">'+escapeText(d.campaign)+' · '+escapeText(d.dateStart.split('-').reverse().join('/')+' a '+d.dateEnd.split('-').reverse().join('/'))+'</p>'+
  '<div class="ads-p-kpis">'+
   label('Investimento',brMoney(d.spent))+
   label('ROAS realizado',brRatio(realised))+
   label('Vendas atribuídas',d.revenue===null?'Não informado':brMoney(d.revenue))+
   label('Itens vendidos (XLSX)',d.itemsSoldSource==='xlsx_fulfilled'?brNum(d.itemsSold):'Não confirmado')+
   label('Cliques / CTR',brNum(d.clicks)+' / '+brPct(ctr))+
   label('Meta de ROAS',d.target>0?brRatio(d.target):'Não confirmada')+
   label('ROAS p/ margem desejada',min===null?(finance?'Inviável':'Não validado'):brRatio(min))+
   '</div>'+
  '<div class="ads-p-action"><strong>'+escapeText(headline)+'</strong>'+escapeText(advice)+'</div>'+
  '<p class="ads-p-note">Base: dados da campanha selecionada. GMV amplo da Shopee pode incluir outros produtos e não representa lucro líquido. Comparações de margem são estimativas conforme o cadastro.</p>'+
  '<p class="ads-p-warn">'+escapeText(note)+'</p>';
 preview.hidden=false;
 byId('resultContent').hidden=true;
 byId('resultEmpty').style.display='none';
 byId('resultTimestamp').textContent='Diagnóstico parcial · '+d.dateStart.split('-').reverse().join('/')+' a '+d.dateEnd.split('-').reverse().join('/');
 return true;
}

window.RedeAdsQuick={clearPreview,isProvisional,renderProvisional};
})();