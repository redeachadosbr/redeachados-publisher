// Auditoria de Minha Promoção. Sinal positivo só com confirmação de membro da campanha.
// Resultados incompletos NUNCA viram "sem desconto". Nenhuma chamada de escrita.
const valid=x=>/^[1-9][0-9]{0,17}$/.test(String(x||''));
const discountPct=(g,p)=>{
 const a=Number(g),b=Number(p);
 return Number.isFinite(a)&&Number.isFinite(b)&&a>b&&b>0
   ?Math.round((100-b*100/a)*100)/100:null;
};
export function summarizeDiscountMembership(itemIds,campaigns,{complete=true,warnings=[]}={}){
 const ids=[...new Set(itemIds.map(String))],wanted=new Set(ids);
 const items=Object.fromEntries(ids.map(id=>[id,{kind:complete?'missing':'unknown'}]));
 for(const campaign of campaigns){
  const kind=campaign.status==='ongoing'?'active':campaign.status==='upcoming'?'scheduled':null;
  if(!kind)continue;
  for(const row of campaign.items||[]){
   const key=String(row.item_id||'');if(!wanted.has(key))continue;
   if(items[key].kind==='active'&&kind!=='active')continue;
   const mods=Array.isArray(row.model_list)?row.model_list:[];
   const modelRates=mods.map(m=>discountPct(m.model_original_price,m.model_promotion_price)).filter(x=>x!=null);
   const pct=discountPct(row.item_original_price,row.item_promotion_price)??(modelRates.length===1?modelRates[0]:null);
   const note='Campanha '+String(campaign.name||campaign.discountId)+' (ID '+campaign.discountId+')'+
    (pct!==null?' · '+pct.toFixed(2).replace('.',',')+'%':' · conferir cada variação');
   items[key]={kind,text:kind==='active'?(pct===null?'Desconto ativo':pct.toFixed(2).replace('.',',')+'% de desconto'):'Programado',note};
  }
 }
 return {complete,items,warning:warnings.join(' | ').slice(0,750),verifiedAt:new Date().toISOString()};
}
export async function auditCatalogDiscounts({cfg,auth,call,readPages,itemIds}){
 const collected=[],campaigns=[],warnings=[];let complete=true;
 for(const status of ['ongoing','upcoming']){
  for(let page=1;page<=5;page++){
   try{
    const response=(await call(cfg,{path:'/api/v2/discount/get_discount_list',
      method:'POST',accessToken:auth.accessToken,shopId:auth.shopId,
      body:{discount_status:status,page_no:page,page_size:100}}))?.response;
    if(!Array.isArray(response?.discount_list)||typeof response.more!=='boolean')
      throw Error('A Shopee não retornou uma lista completa');
    for(const d of response.discount_list)
      if(valid(d.discount_id))collected.push({discountId:String(d.discount_id),status,name:String(d.discount_name||'')});
    if(!response.more)break;
    if(page===5){complete=false;warnings.push('Muitas campanhas; consulta parcial.');}
   }catch(e){complete=false;warnings.push('Lista '+status+': '+String(e.message||e).slice(0,95));break;}
  }
 }
 const unique=[...new Map(collected.map(x=>[x.discountId,x])).values()];
 if(unique.length>60){complete=false;warnings.push('Mais de 60 campanhas; consulta parcial.');}
 for(const c of unique.slice(0,60)){
  try{
   const detail=await readPages(call,{cfg,auth,discountId:c.discountId,maxPages:30});
   if(!detail.complete)throw Error('Paginação não confirmada');
   campaigns.push({...c,status:String(detail.record?.status||c.status).toLowerCase(),
     items:detail.pages.flatMap(p=>p.item_list||[])});
  }catch(e){complete=false;warnings.push('Campanha '+c.discountId+': '+String(e.message||e).slice(0,90));}
 }
 return {...summarizeDiscountMembership(itemIds,campaigns,{complete,warnings}),
  scannedCampaigns:campaigns.length,campaignsFound:unique.length};
}