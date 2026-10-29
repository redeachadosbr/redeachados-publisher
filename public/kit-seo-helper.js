// Importador e ranking local de títulos para kits. Não é resultado oficial de busca Shopee.
const norm=s=>String(s||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase();
const stop=new Set(['para','com','mais','sortido','sortida','infantil','produto','pecas']);
const tokens=s=>norm(s).split(/[^a-z0-9]+/).filter(x=>x.length>=4&&!stop.has(x));
export function scoreKitSeoTitle(title,components=[]){
 const t=String(title||'').trim(),n=norm(t),len=Array.from(t).length;
 const portions=components.map(p=>{const w=[...new Set(tokens(p.name))].slice(0,6);
  return w.length?w.filter(k=>n.includes(k)).length/w.length:0;});
 const coverage=portions.length?portions.reduce((s,v)=>s+v,0)/portions.length:0;
 const lengthScore=len>=90&&len<=120?32:len>=70&&len<=120?26:len>=45&&len<=120?16:0;
 const score=Math.min(100,lengthScore+Math.round(coverage*48)+
  (portions.length&&portions.every(x=>x>=.2)?12:0)+(/\bkit\b/i.test(t)?8:0));
 return {score,label:score>=80?'Forte':score>=60?'Boa':'Revisar',
  note:'Estimativa por tamanho e termos dos produtos; não é ranking oficial da Shopee.'};
}
// Shopee trata quebras de linha vazias como espaço vertical em anúncios.
 // Mantém uma única separação entre seções e nenhuma linha vazia entre itens.
export function formatKitShopeeDescription(raw){
 const sections=/^(?:[^\p{L}\p{N}]{0,8}\s*)?(?:BENEF[ÍI]CIOS|POR QUE COMPRAR|D[ÚU]VIDAS FREQUENTES|PERGUNTAS FREQUENTES|CARACTER[ÍI]STICAS|ESPECIFICA[ÇC][ÕO]ES|O QUE VAI NA EMBALAGEM|ITENS INCLUSOS|CONTE[ÚU]DO DO KIT)\s*:?\s*$/iu;
 const lines=String(raw||'').normalize('NFC').replace(/\r\n?/g,'\n')
  .replace(/\u00a0/g,' ').split('\n')
  .map(line=>line.replace(/[ \t\f\v]+/g,' ').trim()).filter(Boolean);
 return lines.map((line,index)=>(index?(sections.test(line)||/^🛒/.test(line)?'\n\n':'\n'):'')+line).join('').trim();
}

// Aceita copiar bloco "Escrita" do ChatGPT, Markdown (**TÍTULO 1:**),
// títulos em negrito, linhas em branco e separadores: sem confundir o prompt com a resposta.
export function parseKitSeoResponse(raw){
 const text=String(raw||'').replace(/\r\n?/g,'\n').replace(/\u00a0/g,' ').trim();
 if(!text)throw Error('Nenhuma resposta copiada. No ChatGPT, clique em Copiar no BLOCO DO ANÚNCIO e volte.');
 if(/(?:^|\n)\s*(?:você é (?:redator|um redator)|gere exatamente 3 títulos|responda apenas neste formato|informaç(?:ões|oes) por produto|dados extras colados pelo vendedor)/i.test(text.slice(0,1800))&&
    /(?:^|\n)\s*(?:informaç(?:ões|oes) por produto|responda apenas neste formato|dados extras colados pelo vendedor)/i.test(text))
  throw Error('Você copiou a ORIENTAÇÃO enviada, não a resposta. No ChatGPT, use Copiar no bloco com os 3 títulos e a descrição.');
 const titles=[];
 const titleRegex=/(?:^|\n)\s*(?:#{1,4}\s*)?(?:[-*]\s*)?(?:\*\*)?T[ÍI]TULO\s*([123])\s*(?:\*\*)?\s*[:：—–-]\s*(?:\*\*)?([^\n]+)/gi;
 let m;
 while((m=titleRegex.exec(text))!==null){
  const n=Number(m[1]);
  const title=m[2].replace(/\*\*|__|\s+$/g,'').trim();
  if(!titles.some(x=>x.number===n))titles.push({number:n,title});
 }
 const descriptionTag=/(?:^|\n)\s*(?:#{1,4}\s*)?(?:[-*]\s*)?(?:\*\*)?DESCRI[ÇC][ÃA]O(?:\*\*)?\s*[:：—–-]\s*(?:\*\*)?\s*/i.exec(text);
 let description=descriptionTag?text.slice(descriptionTag.index+descriptionTag[0].length).trim():'';
 description=formatKitShopeeDescription(description.replace(/^\*\*\s*/,''));
 const numbered=[...new Set(titles.map(x=>x.number))];
 if(numbered.length!==3||![1,2,3].every(n=>numbered.includes(n)))
  throw Error('Não localizei TÍTULO 1, TÍTULO 2 e TÍTULO 3. Copie o anúncio completo usando o ícone Copiar no ChatGPT.');
 if(titles.some(x=>Array.from(x.title).length<10||Array.from(x.title).length>120))
  throw Error('Um título ficou fora do limite de 10 a 120 caracteres. Ajuste apenas esse título no ChatGPT e copie a resposta completa.');
 if(new Set(titles.map(x=>norm(x.title))).size!==3)
  throw Error('Os três títulos precisam ser diferentes.');
 if(!descriptionTag)throw Error('Faltou DESCRIÇÃO: no texto copiado. Use Copiar no bloco completo do ChatGPT.');
 if(description.length<80||description.length>2000)
  throw Error('A descrição deve ter entre 80 e 2.000 caracteres. Verifique se copiou todo o anúncio.');
 return {titles:titles.sort((a,b)=>a.number-b.number),description};
}
export function kitSeoRiskFlags(text,components=[]){
 // Atenções somente quando o dado específico não aparece nas fichas da WeDrop.
 const verified=norm(components.map(p=>[p.name,p.description,p.dimensions,p.brand].filter(Boolean).join(' ')).join(' '));
 const review=[];
 const age=/(?:\b\d{1,2}\s*(?:meses?|anos?)\b)/gi;
 const matches=String(text||'').match(age)||[];
 for(const entry of [...new Set(matches.map(x=>x.toLowerCase()))]){
  if(!verified.includes(norm(entry)))review.push('Faixa etária “'+entry+'” não confirmada nos dados WeDrop disponíveis');
 }
 return review;
}
