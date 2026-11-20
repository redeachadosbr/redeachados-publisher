// Comparação SOMENTE LEITURA: confirmar as três variações pelo Item ID, model_id,
// preço promocional e campanha real da Shopee. Não autoriza nem envia desconto.
const cents=n=>Number.isFinite(Number(n))?Math.round(Number(n)*100):NaN;
export function verifyModelDiscountReadback({options=[],models=[],prices=[],member=null,campaign=null}={}){
 const fail=reason=>({confirmed:false,reason});
 if(!Array.isArray(options)||options.length<2||
    !Array.isArray(models)||models.length!==options.length||
    !Array.isArray(prices)||prices.length!==options.length)
  return fail('Quantidade de variações ou cotações não corresponde ao anúncio na Shopee.');
 const skus=options.map(o=>String(o?.sku||'').trim());
 if(skus.some(x=>!x)||new Set(skus).size!==skus.length)
  return fail('Há SKUs de variação ausentes ou duplicados.');
 const bySku=new Map(models.map(m=>[String(m.model_sku||''),m]));
 const byPrice=new Map(prices.map(p=>[String(p.sku||''),p]));
 if(bySku.size!==options.length||byPrice.size!==options.length)
  return fail('Modelos ou preços duplicados na conferência da promoção.');
 const status=String(campaign?.status||'').toLowerCase();
 if(!['ongoing','upcoming'].includes(status)||
    !(Number(campaign?.end_time)>Math.floor(Date.now()/1000)))
  return fail('Campanha Minha Promoção encerrada ou inválida.');
 const published=member?.model_list;
 if(!Array.isArray(published)||published.length!==options.length)
  return fail('A campanha ainda não contém todas as variações do anúncio.');
 const ids=new Set();
 for(const sku of skus){
  const model=bySku.get(sku),price=byPrice.get(sku);
  if(!model||!price||!Number.isSafeInteger(Number(model.model_id))||Number(model.model_id)<=0)
   return fail('A SKU '+sku+' não foi vinculada ao mesmo modelo aprovado.');
  const id=String(model.model_id);
  if(ids.has(id)||String(price.modelId)!==id||!(cents(price.promo)>0))
   return fail('Identidade ou valor promocional inválido no modelo '+sku+'.');
  ids.add(id);
  const list=published.filter(p=>String(p.model_id)===id);
  if(list.length!==1||cents(list[0].model_promotion_price)!==cents(price.promo))
   return fail('O desconto da cor '+sku+' ainda não corresponde ao valor aprovado na Shopee.');
 }
 if(new Set(published.map(p=>String(p.model_id))).size!==ids.size)
  return fail('A campanha possui modelos diferentes dos aprovados.');
 return {confirmed:true,reason:'Todos os modelos têm preços promocionais confirmados na campanha Shopee.'};
}
