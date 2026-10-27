// Kit SEO scoring: estimativa local, NÃO métrica oficial da Shopee.
const norm=s=>String(s||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase();
const stop=new Set(['para','com','mais','sortido','sortida','infantil','produto','pecas']);
const tokens=s=>norm(s).split(/[^a-z0-9]+/).filter(x=>x.length>=4&&!stop.has(x));
export function scoreKitSeoTitle(title,components=[]){
 const t=String(title||'').trim(),n=norm(t),len=Array.from(t).length;
 const portions=components.map(p=>{const w=[...new Set(tokens(p.name))].slice(0,6);
  return w.length?w.filter(k=>n.includes(k)).length/w.length:0;});
 const cover=portions.length?portions.reduce((s,v)=>s+v,0)/portions.length:0;
 const lengthScore=len>=90&&len<=120?32:len>=70&&len<=120?26:len>=45&&len<=120?16:0;
 const score=Math.min(100,lengthScore+Math.round(cover*48)+
  (portions.length&&portions.every(x=>x>=.2)?12:0)+(/\bkit\b/i.test(t)?8:0));
 return {score,label:score>=80?'Forte':score>=60?'Boa':'Revisar',
  note:'Estimativa por tamanho e termos dos produtos; não é ranking oficial da Shopee.'};
}
export function parseKitSeoResponse(raw){
 const text=String(raw||'').replace(/\r\n?/g,'\n').trim(),titles=[];
 const reg=/(?:^|\n)\s*(?:#{1,4}\s*)?(?:\*\*)?T[ÍI]TULO\s*([123])(?:\*\*)?\s*:\s*([^\n]+)/gi;
 let match;
 while((match=reg.exec(text))){
  if(!titles.some(x=>x.number===Number(match[1])))
   titles.push({number:Number(match[1]),title:match[2].replace(/\*\*/g,'').trim()});
 }
 const desc=/(?:^|\n)\s*(?:#{1,4}\s*)?(?:\*\*)?DESCRI[ÇC][ÃA]O(?:\*\*)?\s*:\s*/i.exec(text);
 const description=desc?text.slice(desc.index+desc[0].length).trim():'';
 if(titles.length!==3||titles.some(x=>Array.from(x.title).length<10||Array.from(x.title).length>120))
  throw Error('Informe TÍTULO 1, TÍTULO 2 e TÍTULO 3 com 10 a 120 caracteres cada.');
 if(new Set(titles.map(x=>norm(x.title))).size!==3)throw Error('Os três títulos devem ser diferentes.');
 if(description.length<80||description.length>2000)throw Error('Descrição necessária, entre 80 e 2.000 caracteres.');
 return {titles:titles.sort((a,b)=>a.number-b.number),description};
}
