// Shopee-only deterministic simulation. Amounts are integer BRL cents.
// No commission, promotion, price or other write requests to Shopee are made here.
export const SHOPEE_PRICE_DEFAULTS=Object.freeze({
  marginPct:25,minMarginPct:5,discountPct:20,couponPct:1,taxPct:4,
  flashPct:3,adsPct:0,shipping:0,packing:0,sellerType:'cpf',
  highVolumeCpf:false,commissionRates:[20,14,14,14],fixedFees:[4.5,16,20,26]
});
const BRL_LIMIT=25000000;
const money=v=>Math.round(Number(v)*100);
const brl=v=>Math.round(v)/100;
const has=(x,k)=>Object.prototype.hasOwnProperty.call(x,k);
const val=(x,k,fallback,min,max)=>{
  const n=has(x,k)?Number(x[k]):fallback;
  if(!Number.isFinite(n)||n<min||n>max)throw Error('Parâmetro inválido: '+k);
  return n;
};
export function normalizeShopeePricingSettings(raw={}){
  if(!raw||typeof raw!=='object'||Array.isArray(raw))throw Error('Configurações inválidas.');
  const d=SHOPEE_PRICE_DEFAULTS,c={};
  for(const k of ['marginPct','minMarginPct'])c[k]=val(raw,k,d[k],0,70);
  for(const k of ['discountPct','couponPct'])c[k]=val(raw,k,d[k],0,90);
  for(const k of ['taxPct','flashPct','adsPct'])c[k]=val(raw,k,d[k],0,60);
  for(const k of ['shipping','packing'])c[k]=val(raw,k,d[k],0,100000);
  c.sellerType=has(raw,'sellerType')?String(raw.sellerType):d.sellerType;
  if(!['cpf','cnpj'].includes(c.sellerType))throw Error('Tipo de conta Shopee inválido.');
  c.highVolumeCpf=has(raw,'highVolumeCpf')?raw.highVolumeCpf===true:d.highVolumeCpf;
  for(const k of ['commissionRates','fixedFees']){
    const a=has(raw,k)?raw[k]:d[k];
    if(!Array.isArray(a)||a.length!==4||a.some(n=>!Number.isFinite(Number(n))||Number(n)<0||Number(n)>(k==='commissionRates'?70:1000)))
      throw Error('Tabela de comissões inválida: '+k);
    c[k]=a.map(Number);
  }
  if(c.marginPct>70||c.minMarginPct>70)throw Error('Margem desejada fora do intervalo.');
  return c;
}
function tier(priceCents){
  if(priceCents<8000)return 0;
  if(priceCents<10000)return 1;
  if(priceCents<20000)return 2;
  return 3;
}
export function calculateShopeeSale(grossCents,c,costCents){
  const afterCampaign=Math.round(grossCents*(1-c.discountPct/100));
  const sale=Math.round(afterCampaign*(1-c.couponPct/100));
  const t=tier(sale),commission=Math.round(sale*c.commissionRates[t]/100);
  const fixed=sale<900?Math.round(sale/2):money(c.fixedFees[t]);
  const extraCpf=c.sellerType==='cpf'&&c.highVolumeCpf?300:0;
  const tax=Math.round(sale*c.taxPct/100),flash=Math.round(sale*c.flashPct/100);
  const ads=Math.round(sale*c.adsPct/100);
  const productPlusExtras=costCents+money(c.shipping+c.packing);
  const profit=sale-productPlusExtras-commission-fixed-extraCpf-tax-flash-ads;
  return {gross:brl(grossCents),campaignDiscount:brl(grossCents-afterCampaign),
    couponDiscount:brl(afterCampaign-sale),finalPrice:brl(sale),unitCost:brl(costCents),
    shipping:brl(money(c.shipping)),packing:brl(money(c.packing)),
    commission:brl(commission),fixedFee:brl(fixed),cpfExtra:brl(extraCpf),
    tax:brl(tax),flash:brl(flash),ads:brl(ads),profit:brl(profit),
    marginPct:sale>0?profit*100/sale:-Infinity,tier:t,saleCents:sale};
}
function saleCents(gross,c){
  return Math.round(Math.round(gross*(1-c.discountPct/100))*(1-c.couponPct/100));
}
function firstGrossSaleAtLeast(c,required){
  let lo=1,hi=BRL_LIMIT;
  while(lo<hi){const mid=Math.floor((lo+hi)/2);if(saleCents(mid,c)>=required)hi=mid;else lo=mid+1}
  return saleCents(lo,c)>=required?lo:BRL_LIMIT+1;
}
export function minimumGrossForNetMargin(cost,c,marginPct){
  const fixedCost=money(cost),ranges=[[1,899],[900,7999],[8000,9999],[10000,19999],[20000,BRL_LIMIT]];
  let best=null;
  for(const [from,to] of ranges){
    const left=firstGrossSaleAtLeast(c,from),right=to===BRL_LIMIT?BRL_LIMIT:firstGrossSaleAtLeast(c,to+1)-1;
    if(left>right||left>BRL_LIMIT)continue;
    const check=g=>calculateShopeeSale(g,c,fixedCost).marginPct+1e-8>=marginPct;
    if(!check(right))continue;
    let lo=left,hi=right;
    while(lo<hi){const mid=Math.floor((lo+hi)/2);if(check(mid))hi=mid;else lo=mid+1}
    for(let n=Math.max(left,lo-12);n<=Math.min(right,lo+12);n++){
      if(check(n)){if(best===null||n<best)best=n;break}
    }
  }
  return best;
}
export function quoteShopeePrice({unitCost,settings={},marketAverage=null}={}){
  const c=normalizeShopeePricingSettings(settings);
  const cost=Number(unitCost);
  if(!Number.isFinite(cost)||cost<=0||cost>100000)throw Error('Custo de aquisição WeDrop não disponível ou inválido.');
  const market=(marketAverage===null||marketAverage===undefined||marketAverage==='')?null:Number(marketAverage);
  if(market!==null&&(!Number.isFinite(market)||market<=0||market>100000))throw Error('Média de mercado inválida.');
  const floor=minimumGrossForNetMargin(cost,c,c.minMarginPct);
  const desired=Math.max(c.marginPct,c.minMarginPct);
  const gross=minimumGrossForNetMargin(cost,c,desired);
  if(gross===null||floor===null)throw Error('As taxas e a margem escolhida impedem preço seguro.');
  let proposed={...c},financial=calculateShopeeSale(gross,proposed,money(cost)),state='PROTEGIDO';
  let note='Plano preparado com a margem desejada e as taxas cadastradas.';
  if(market!==null){
    // O percentual competitivo NÃO é o desconto base (20%). É o menor
    // desconto capaz de colocar o preço final próximo ao preço de referência
    // mantendo lucro >= piso. Cupom já entra no preço final calculado.
    const target=money(market);
    let chosen=null;
    for(let step=0;step<=900;step++){
      const candidate={...c,discountPct:step/10};
      const result=calculateShopeeSale(gross,candidate,money(cost));
      if(result.saleCents<=target&&result.marginPct+1e-8>=c.minMarginPct){
        chosen={candidate,result};break;
      }
    }
    if(chosen){
      proposed=chosen.candidate;financial=chosen.result;
      state='COMPETITIVO';
      note='Desconto calculado pela referência de preço informada. A origem da referência deve ser conferida no relatório de mercado.';
    }else{
      state='MERCADO_ABAIXO_DO_PISO';
      note='Não existe desconto competitivo viável no preço bruto calculado sem violar a margem mínima. Nenhum desconto deve ser publicado automaticamente.';
    }
  }else note+=' Média de mercado não informada; não foi feita pesquisa de concorrentes.';
  if(financial.marginPct+1e-8<c.minMarginPct)throw Error('Cotação rejeitada: abaixo da margem líquida mínima.');
  const floorSale=calculateShopeeSale(floor,c,money(cost));
  return {unitCost:cost,grossPrice:financial.gross,discountPct:proposed.discountPct,
    couponPct:c.couponPct,customerPrice:financial.finalPrice,netProfit:financial.profit,
    netMarginPct:Number(financial.marginPct.toFixed(3)),minMarginPct:c.minMarginPct,
    targetMarginPct:c.marginPct,marketAverage:market,priceFloor:floorSale.finalPrice,
    feeTier:financial.tier,breakdown:{
      campaignDiscount:financial.campaignDiscount,couponDiscount:financial.couponDiscount,
      unitCost:financial.unitCost,shipping:financial.shipping,packing:financial.packing,
      commission:financial.commission,fixedFee:financial.fixedFee,
      cpfExtra:financial.cpfExtra,tax:financial.tax,flash:financial.flash,ads:financial.ads
    },status:state,notice:note,readyForManualReview:true,appliedInShopee:false,
    assumptions:'Taxas editáveis, Shopee outubro/2026 (referência). Cupom reduz receita; oferta relâmpago tratada como custo. Não é confirmação de campanha real.'};
}
