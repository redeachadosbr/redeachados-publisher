/* Score SEO explicável, NÃO é volume de buscas nem previsão de vendas. */
(function(root){
 'use strict';
 const clean=s=>String(s||'').normalize('NFC').replace(/\s+/g,' ').trim();
 const count=s=>[...clean(s)].length;
 const norm=s=>clean(s).normalize('NFD').replace(/[\u0300-\u036f]/g,'')
  .toLocaleLowerCase('pt-BR').replace(/[\p{P}\p{S}]/gu,' ').replace(/\s+/g,' ').trim();
 const emojiCount=s=>(String(s||'').match(/\p{Extended_Pictographic}/gu)||[]).length;
 function scoreTitle(title,{keywords=[],productTitle=''}={}){
  const name=clean(title),n=count(name),standard=norm(name);
  const base=norm(productTitle);
  const terms=[...new Set((Array.isArray(keywords)?keywords:[])
   .map(x=>norm(typeof x==='string'?x:x?.term||'')).filter(x=>x.length>=3))].slice(0,5);
  const weights=[10,9,7,5,4];
  const matched=terms.filter(t=>standard.includes(t));
  const points={
   length:n>=100&&n<=120?20+Math.min(10,Math.round((n-100)/2)):0,
   keywords:terms.reduce((sum,term,i)=>sum+(standard.includes(term)?weights[i]:0),0),
   front:terms.some(t=>standard.slice(0,45).includes(t))?10:0,
   product:base.split(' ').filter(x=>x.length>3).slice(0,3).some(t=>standard.includes(t))?10:0,
   emojis:emojiCount(name)===2?10:0,
   readability:!/\b(gr[aá]tis|melhor pre[cç]o|100% garantido|frete 24h)\b/iu.test(name)&&
    !/[!]{2,}|\s{2,}/.test(name)?5:0
  };
  return {score:Math.min(100,Object.values(points).reduce((a,b)=>a+b,0)),length:n,
   matchedKeywords:matched,breakdown:points};
 }
 function rank(titles,context={}){
  if(!Array.isArray(titles)||titles.length!==4)throw Error('Precisamos de exatamente quatro opções.');
  return titles.map((v,i)=>({...v,originalOrder:i+1,...scoreTitle(v.title,context)}))
   .sort((a,b)=>b.score-a.score||b.length-a.length||a.originalOrder-b.originalOrder)
   .map((v,i)=>({...v,rank:i+1,ideal:i===0}));
 }
 root.RASeoTitleScore={scoreTitle,rank};
})(globalThis);