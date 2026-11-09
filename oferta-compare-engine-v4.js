'use strict';
/*
 * Oferta Blumenau - motor de comparação V4.
 * No fictitious prices: only active, source-linked promotional offers.
 * Network-level deduplication prevents eight Cooper branches counting as eight competitors.
 * A brand, variant and package must match before percent savings is calculated.
 */
(function(root, factory){
 const api=factory();
 if(typeof module==='object' && module.exports)module.exports=api;
 if(root)root.OBCompareEngine=api;
})(typeof globalThis==='object'?globalThis:null,function(){
 const STOP=new Set(['de','da','do','dos','das','para','com','sem','e','em','por','na','no','uma','um','a','o']);
 const norm=s=>String(s==null?'':s).normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/(\d),(\d)/g,'$1.$2').replace(/[^a-z0-9.]+/g,' ').replace(/\s+/g,' ').trim();
 const tokens=s=>norm(s).split(' ').filter(t=>t.length>1&&!STOP.has(t));
 const dateNow=()=>new Date().toLocaleDateString('sv-SE',{timeZone:'America/Sao_Paulo'});
 function productPack(o){
  const text=String(o.package||o.size||'') || String(o.name||'');
  // Explicit multipacks and single packs. Refuse ambiguous multiple sizes.
  const t=norm(text).replace(/(\d+(?:\.\d+)?)(kg|g|ml|l)\b/g,'$1 $2');
  const multi=t.match(/(?:^|\s)(\d+)\s*[x×]\s*(\d+(?:\.\d+)?)\s*(kg|g|ml|l|unidades|unidade|un)\b/i);
  const one=t.match(/(?:^|\s)(\d+(?:\.\d+)?)\s*(kg|g|ml|l|litros|litro|unidades|unidade|un)\b/i);
  if(!one&&!multi)return null;
  const count=multi?Number(multi[1]):1,amount=Number(multi?multi[2]:one[1]);
  const unit=String(multi?multi[3]:one[2]).toLowerCase();
  if(!Number.isFinite(amount)||amount<=0||!Number.isInteger(count)||count<=0||count>100)return null;
  const kind=(unit==='g'||unit==='kg')?'kg':(unit==='ml'||unit==='l'||unit.startsWith('litro'))?'l':'un';
  const qty=(unit==='g'||unit==='ml')?amount*count/1000:amount*count;
  if(!Number.isFinite(qty)||qty<=0||qty>1000)return null;
  return {kind,qty:Math.round(qty*1000000)/1000000,text:text.trim()};
 }
 function comparableName(o){
  const name=norm(o.name);
  // Keep brand, variant, refil, "light", product characteristics; drop ONLY size.
  return name.replace(/\b\d+(?:\.\d+)?\s*(?:kg|g|ml|l|litros?|unidades?|un)\b/g,' ')
    .replace(/\b\d+\s*[x×]\s*/g,' ').replace(/\s+/g,' ').trim();
 }
 function gtinValid(s){
  const t=String(s||'').replace(/\D/g,'');
  if(![8,12,13,14].includes(t.length))return false;
  let sum=0, weight=3;
  for(let i=t.length-2;i>=0;i--){sum+=Number(t[i])*weight;weight=weight===3?1:3;}
  return ((10-(sum%10))%10)===Number(t[t.length-1]);
 }
 function productIdentity(o){
  const pack=productPack(o), name=comparableName(o),brand=norm(o.brand);
  if(!name||!pack)return null;
  const raw=String(o.barcode||o.ean||o.gtin||'').replace(/\D/g,'');
  // Missing brands remain distinct from named brands; do not group a generic SKU with a branded one.
  const base=gtinValid(raw)?'gtin:'+raw:'name:'+brand+'|'+name;
  return {base,pack,exact:base+'|'+pack.kind+'|'+pack.qty,
          family:base+'|'+pack.kind,description:String(o.name||''),brand:String(o.brand||'')};
 }
 function verifiedActive(offers,day=dateNow()){
  if(!Array.isArray(offers))return [];
  const out=[];
  for(const o of offers){
   if(!o||typeof o!=='object'||o.source_type==='fiscal')continue;
   const price=Number(o.price),start=String(o.starts_on||''),end=String(o.ends_on||'');
   if(!(price>0&&price<100000&&Number.isFinite(price))||!o.store_id||!o.network||
     !o.name||!o.source_url||!/^\d{4}-\d{2}-\d{2}$/.test(start)||
     !/^\d{4}-\d{2}-\d{2}$/.test(end)||start>day||end<day)continue;
   out.push(o);
  }
  return out;
 }
 function priceMetric(o,identity,mode){
  const price=Number(o.price);
  if(mode==='unit'&&identity.pack.qty>0)return price/identity.pack.qty;
  return price;
 }
 function groups(offers,{day=dateNow(),category=null,mode='exact'}={}){
  const map=new Map();
  for(const offer of verifiedActive(offers,day)){
   if(category&&category!=='Todas'&&norm(offer.category)!==norm(category))continue;
   const ident=productIdentity(offer);
   if(!ident)continue;
   const key=mode==='unit'?ident.family:ident.exact;
   if(!map.has(key))map.set(key,{key,identity:ident,kind:ident.pack.kind,rows:[],category:offer.category||'Outros'});
   map.get(key).rows.push({offer,identity:ident,metric:priceMetric(offer,ident,mode)});
  }
  const out=[];
  for(const group of map.values()){
   const perNetwork=new Map();
   for(const row of group.rows){
    const network=norm(row.offer.network);
    const prev=perNetwork.get(network);
    if(!prev||row.metric<prev.metric-1e-7||
       (Math.abs(row.metric-prev.metric)<1e-7&&String(row.offer.store_id)<String(prev.offer.store_id)))
      perNetwork.set(network,row);
   }
   const ranks=[...perNetwork.values()].sort((a,b)=>a.metric-b.metric||Number(a.offer.price)-Number(b.offer.price)||
      String(a.offer.network).localeCompare(String(b.offer.network)));
   if(!ranks.length)continue;
   const first=ranks[0],second=ranks[1]||null;
   const ties=ranks.filter(x=>Math.abs(x.metric-first.metric)<1e-7);
   const competing=ranks.length>1;
   // Savings relative to the second cheapest AVAILABLE verified network; no list-price claims.
   const savingPercent=second&&ties.length===1&&second.metric>first.metric?
      Math.round((second.metric-first.metric)/second.metric*1000)/10:null;
   const savingAmount=second&&ties.length===1&&second.metric>first.metric?
      Math.round((second.metric-first.metric)*100)/100:null;
   out.push({key:group.key,identity:group.identity,kind:group.kind,category:group.category,
      mode,networkCount:ranks.length,competing,first,second,ranks,
      tiedNetworkCount:ties.length,marketSavingPercent:savingPercent,marketSavingAmount:savingAmount});
  }
  return out.sort((a,b)=>(b.competing?1:0)-(a.competing?1:0)||
    Number(b.marketSavingPercent||0)-Number(a.marketSavingPercent||0)||
    a.first.metric-b.first.metric||a.key.localeCompare(b.key));
 }
 function matchSaved(term,offers,day=dateNow(),extra={}){
  const search=norm(term);
  const required=tokens(term);
  if(!search||!required.length)return {term,valid:[],options:[],ambiguous:false,networkCount:0};
  const wantedPack=productPack({package:extra.package||term});
  const preferredBrand=norm(extra.brand);
  const current=verifiedActive(offers,day);
  const matches=current.filter(o=>{
   const n=norm([o.name,o.brand,o.package].join(' '));
   if(preferredBrand&&norm(o.brand)!==preferredBrand)return false;
   if(wantedPack){
    const found=productPack(o);
    if(!found||found.kind!==wantedPack.kind||Math.abs(found.qty-wantedPack.qty)>1e-6)return false;
   }
   return required.every(t=>n.split(' ').some(piece=>piece===t||piece===t.replace(/\.$/,'')));
  });
  const perNetwork=new Map();
  for(const o of matches){
   const k=norm(o.network),prev=perNetwork.get(k);
   if(!prev||Number(o.price)<Number(prev.price)||
      (Number(o.price)===Number(prev.price)&&String(o.store_id)<String(prev.store_id)))
     perNetwork.set(k,o);
  }
  const opts=[...perNetwork.values()].sort((a,b)=>Number(a.price)-Number(b.price));
  const identities=new Set(matches.map(o=>productIdentity(o)?.exact||null).filter(Boolean));
  const ambiguous=identities.size>1||opts.some(o=>!productIdentity(o));
  const best=opts[0]||null;
  // Comparable savings require one exact product family and two independent chains.
  let competition=null;
  if(best&&!ambiguous&&opts.length>1){
   const alt=opts[1],p=Number(best.price),b=Number(alt.price);
   competition=p<b?{savingAmount:Math.round((b-p)*100)/100,
                   savingPercent:Math.round((b-p)/b*1000)/10}:null;
  }
  return {term,valid:matches,options:opts,ambiguous,networkCount:opts.length,best,competition,
    exactProduct:identities.size===1&&matches.length>0};
 }
 function optimizeBasket(favorites,offers,day=dateNow(),intents={}){
  const items=(Array.isArray(favorites)?favorites:[]).map(term=>
    matchSaved(term,offers,day,intents[norm(term)]||{}));
  const available=items.filter(x=>!!x.best);
  const missing=items.filter(x=>!x.best);
  const ambiguous=available.filter(x=>x.ambiguous);
  const comparable=available.length===items.length&&ambiguous.length===0&&items.length>0;
  const sum=available.reduce((a,x)=>a+Number(x.best.price),0);
  const allNetworks=new Set(available.flatMap(x=>x.options.map(o=>norm(o.network))));
  const single=[];
  if(comparable){
   for(const net of allNetworks){
     const options=items.map(x=>x.options.find(o=>norm(o.network)===net));
     if(options.every(Boolean)){
       single.push({network:options[0].network,total:Math.round(options.reduce((a,o)=>a+Number(o.price),0)*100)/100,
                    rows:options});
     }
   }
  }
  single.sort((a,b)=>a.total-b.total);
  return {items,available,missing,ambiguous,comparable,
    splitTotal:comparable?Math.round(sum*100)/100:null,
    bestSingleNetwork:single[0]||null,completeNetworks:single};
 }
 return {norm,productPack,gtinValid,productIdentity,verifiedActive,groups,matchSaved,optimizeBasket,dateNow};
});