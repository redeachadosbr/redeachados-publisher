// SEO de Ads Rede Achados BR: triagem conservadora de SKUs, somente leitura.
// Não usar a expressão "probabilidade de venda" sem dados de visitas, cliques e conversões.
const money=n=>Math.round(n*100)/100;
export function rankAdsCandidates(items,plans,{limit=10}={}){
 const catalog=new Map((items||[]).map(i=>[String(i.itemId),i]));
 const out=[];
 for(const p of plans||[]){
  const c=catalog.get(String(p.itemId)),q=p.quote||{};
  if(!c||String(c.sku)!==String(p.sku)||!p.sku)continue;
  const stock=Number(c.stock),margin=Number(q.netMarginPct),profit=Number(q.netProfit);
  const cost=Number(q.unitCost),price=Number(q.customerPrice);
  if(!Number.isFinite(stock)||stock<=0||!Number.isFinite(margin)||!Number.isFinite(profit)||!Number.isFinite(price)||price<=0||cost<=0)continue;
  if(!/^(normal|active)$/i.test(String(c.status)))continue;
  if(margin<8||profit<=0)continue;
  const research=q.marketResearch||{};
  const researched=research.verified===true&&Number(research.count)>=2;
  const updated=Date.parse(p.updatedAt||''),fresh=Number.isFinite(updated)&&Date.now()-updated<14*86400000;
  const score=Math.min(100,Math.round(20+Math.min(25,margin)+Math.min(15,stock/3)+
    (researched?20:0)+(fresh?10:0)+Math.min(10,profit/5)));
  // O saldo antes Ads não é necessariamente igual à margem disponível para Ads.
  // Fator de segurança e ROAS-alvo apenas indicativos; não há garantia de rentabilidade.
  const breakEven=money(Math.max(1,100/margin));
  const roas=money(Math.max(3,breakEven*1.4));
  const daily=money(Math.min(30,Math.max(5,Math.floor(Math.min(profit*1.5,stock*profit*0.1)/5)*5)));
  out.push({sku:p.sku,itemId:String(p.itemId),title:c.title,imageUrl:c.imageUrl||'',stock,marginPct:margin,
   estimatedProfitBeforeAds:money(profit),score,roasTarget:roas,breakEvenRoasEstimate:breakEven,
   suggestedDailyBudget:daily,confidence:researched&&fresh?'moderada':'baixa',
   source:'Catálogo Shopee e plano de preço WeDrop',signals:{
    marketResearchVerified:researched,pricingFresh:fresh,visitsAvailable:false,
    clicksAvailable:false,conversionAvailable:false},
   reason:researched?'Margem, estoque e pesquisa de preços disponíveis; faltam visitas e conversões.':
    'Triagem preliminar; falta pesquisa de mercado validada e métricas de tráfego.',
   recommendation:'Teste controlado. ROAS e orçamento são estimativas, não parâmetros confirmados pela Shopee.'});
 }
 return out.sort((a,b)=>b.score-a.score||b.marginPct-a.marginPct).slice(0,limit);
}