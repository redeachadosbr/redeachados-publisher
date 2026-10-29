// Rede Achados BR — indícios de termos SEO em ofertas públicas da Shopee.
// Títulos recorrentes NÃO são ranking de buscas, volume ou popularidade oficial.
import {lookupShopeeCompetitors,marketResearchConfigured} from './shopeeMarketResearch.js';

const norm=s=>String(s||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'')
 .toLowerCase().replace(/[^a-z0-9]+/g,' ').replace(/\s+/g,' ').trim();
const STOP=new Set(['kit','combo','conjunto','com','de','da','do','das','dos','para','em','e','ou',
 'a','o','os','as','por','unidade','unidades','peca','pecas','pcs','produto','produtos',
 'sortido','sortida','modelo','novo','nova','original','premium','qualidade','cozinha']);
const tokens=s=>norm(s).split(' ').filter(w=>w.length>2&&!STOP.has(w)&&!/^\d+$/.test(w));
const compact=s=>String(s||'').trim().slice(0,180);
const safeUrl=url=>/^https:\/\/shopee\.com\.br\/product\/\d+\/\d+(?:\/?(?:\?.*)?)?$/.test(String(url||''))?url:null;

export function summarizeKitSeoEvidence(components,observations=[]){
 const products=[],picks=[],seen=new Set(),allOffers=[];
 const add=(phrase,sku,source,occurrences=0)=>{
  const label=String(phrase||'').trim().slice(0,85),key=norm(label);
  if(!label||seen.has(key)||tokens(label).length<2)return;
  seen.add(key);picks.push({term:label,sku,source,offerTitleOccurrences:occurrences});
 };
 for(const [index,p] of components.entries()){
  const sku=String(p.sku||''),own=tokens(p.name||'').slice(0,12);
  const row=observations[index]||{};
  const offers=(Array.isArray(row.sample)?row.sample:[]).slice(0,5)
   .filter(x=>x&&typeof x.title==='string'&&safeUrl(x.url))
   .map(x=>({title:compact(x.title),url:safeUrl(x.url),sku}));
  allOffers.push(...offers);
  const anchor=own.slice(0,3).join(' ');
  const fallback=own.slice(0,2).join(' ');
  const count=phrase=>offers.filter(x=>norm(x.title).includes(norm(phrase))).length;
  products.push({sku,name:compact(p.name),status:String(row.status||'not_checked'),
   searchedQueries:(row.searchedQueries||[]).slice(0,4).map(compact),
   observedOffers:offers,checkedAt:row.researchedAt||null});
  add(anchor||fallback,sku,offers.length?'catálogo e títulos de ofertas Shopee':'catálogo WeDrop',count(anchor));
 }
 // Opções complementares: expressões observadas em títulos equivalentes
 // cujos tokens também aparecem na ficha do próprio componente.
 const alternative=[];
 for(const [index,p] of components.entries()){
  const own=new Set(tokens(p.name||''));
  const offers=products[index].observedOffers;
  const phraseCounts=new Map();
  for(const offer of offers){
   const t=tokens(offer.title);
   const phrases=new Set();
   for(let i=0;i<t.length-1;i++){
    if(own.has(t[i])&&own.has(t[i+1]))phrases.add(t[i]+' '+t[i+1]);
    if(i<t.length-2&&own.has(t[i])&&own.has(t[i+1])&&own.has(t[i+2]))
     phrases.add(t[i]+' '+t[i+1]+' '+t[i+2]);
   }
   for(const phrase of phrases)phraseCounts.set(phrase,(phraseCounts.get(phrase)||0)+1);
  }
  for(const [term,count] of phraseCounts)alternative.push({term,sku:String(p.sku),
   source:'títulos de ofertas Shopee (amostra, sem volume)',count});
  const t=tokens(p.name);
  if(t.length>=3){
   alternative.push({term:t.slice(0,2).join(' '),sku:String(p.sku),source:'catálogo WeDrop',count:0});
   alternative.push({term:[t[0],t[t.length-1]].join(' '),sku:String(p.sku),source:'catálogo WeDrop',count:0});
  }
 }
 alternative.sort((a,b)=>b.count-a.count||a.term.length-b.term.length);
 for(const x of alternative)if(picks.length<5)add(x.term,x.sku,x.source,x.count);
 const hasOffers=allOffers.length>0,configured=marketResearchConfigured();
 return {status:hasOffers?'offer_titles_observed':configured?'no_comparable_offers':'provider_not_configured',
  source:hasOffers?'Shopee Afiliados (títulos de ofertas comparáveis)':'Catálogo WeDrop (hipóteses de termos)',
  isOfficialSearchRanking:false,searchVolumeAvailable:false,
  note:hasOffers?'Amostra parcial de anúncios, não ranking das palavras mais buscadas nem volume de pesquisas.':
   'A consulta de ofertas Shopee não retornou amostra utilizável. Prioridades são hipóteses; solicitar pesquisa de fontes ao ChatGPT.',
  candidates:picks.slice(0,5),products,observedOffers:allOffers.length};
}

export async function researchShopeeKitSeo(components){
 if(!Array.isArray(components)||components.length<2||components.length>3)
  throw Error('Pesquisa exige 2 ou 3 SKUs do kit.');
 if(!marketResearchConfigured())return summarizeKitSeoEvidence(components);
 const observations=await Promise.all(components.map(async p=>{
  try{return await lookupShopeeCompetitors({title:String(p.name||'').slice(0,180)});}
  catch(e){return {status:'provider_error',message:String(e.message||e).slice(0,90),sample:[]};}
 }));
 return summarizeKitSeoEvidence(components,observations);
}
