// Motor de descrição comercial por SKU. Nenhuma publicação é realizada aqui.
// Dados não confirmados não se tornam características do produto.
import {validateContentRules,codePointCount} from './shopeeOptimizationWorkflow.js';
import {supplierProductDimensions} from './shopeeSupplierEvidenceFacts.js';
const normal=v=>String(v||'').normalize('NFC').replace(/\r\n?/g,'\n');
const clean=v=>normal(v).replace(/\s+/g,' ').trim();
const fold=v=>clean(v).normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase();
const compactTitle=v=>{const t=clean(v).replace(/[!|]+/g,' ');return codePointCount(t)<=84?t:([...t].slice(0,84).join('').replace(/\s+\S*$/,'').trim()||'este produto');};
const verify=s=>{try{validateContentRules({description:s});return true;}catch{return false;}};
export function isCommercialDescription(value){return verify(normal(value).trim());}
function extract({record={},supplier=null,sourceText=''}) {
 const data=supplier?.product_data||{};
 const desc=[sourceText,data.description||data.details||'',record.description||''].filter(Boolean).map(normal);
 const combined=desc.join('\n');
 const normalized=fold(combined);
 const head=clean(data.name||record.title||'Produto');
 const title=compactTitle(head);
 const short=title.replace(/^(super|novo|nova|promo[cç][aã]o|oferta)\s+/i,'');
 const age=normalized.match(/(?:a partir de|idade recomendada\s*[:\-]?|criancas? a partir de)\s*(\d{1,2})\s*anos?/);
 const size=desc.map(text=>supplierProductDimensions(text)).find(Boolean)||null;
 const material=normalized.match(/(?:composicao|material)\s*[:\-]\s*(polipropileno|aco inoxidavel|aco carbono|aco|plastico|silicone|vidro|aluminio|pp|abs|metal)\b/)||
  normalized.match(/(?:fabricad[oa]|produzid[oa]|feito)\s+em\s+(polipropileno|aco inoxidavel|aco carbono|plastico|silicone|vidro|aluminio|pp|abs)\b/);
 const capacity=normalized.match(/(?:capacidade|reservatorio)\s*(?:de|:)?\s*(\d{2,5})\s*(ml|litros|l)\b/);
 const watts=clean(head+' '+combined).match(/\b(\d{3,4})\s*w\b/i);
 const voltage=clean(head+' '+combined).match(/\b(110|127|220|240)\s*v\b/i);
 let type='general';
 if(/mochila/.test(fold(head))&&/construtor|ferramentas/.test(fold(head)))type='toy';
 else if(/passadeira a vapor|vaporizador de roupa/.test(fold(head)))type='steamer';
 else if(/porta shampoo|organizador de box|prateleira de banheiro/.test(fold(head)))type='bath';
 else if(/piscina inflavel/.test(fold(head)))type='pool';
 else if(/garrafa termica/.test(fold(head)))type='bottle';
 else if(/cafeteira italiana/.test(fold(head)))type='coffee';
 const confirmedMaterial=material?({pp:'PP',abs:'ABS',aco:'aço',plastico:'plástico',polipropileno:'polipropileno',vidro:'vidro',metal:'metal',silicone:'silicone',aluminio:'alumínio','aco carbono':'aço carbono','aco inoxidavel':'aço inoxidável'}[material[1]]||material[1]):'';
 const extraInfo={
   age:age?age[1]+' anos':'',
   dimensions:size?size.value:'',
   material:confirmedMaterial,
   capacity:capacity?capacity[1]+' '+(capacity[2]==='l'?'L':capacity[2]):'',
   power:watts?watts[1]+' W':'',
   voltage:voltage?voltage[1]+' V':''
 };
 const content=/conjunto de ferramentas|ferramentas, brinquedos, miniaturas/i.test(normalized);
 const converts=/pode ser aberta e transformada|transformad[ao] em um cenario|vira (?:mesa|bancada|oficina)/i.test(normalized);
 return {type,title,short,data,sourceText,hasSupplier:Boolean(supplier),facts:extraInfo,content,converts};
}
function pack(p){
 const name=p.short;
 if(p.type==='toy')return{
  intro1:'🧰 A '+name+' reúne ferramentas e acessórios de brinquedo para criar cenas de construção, montagem e faz de conta com muita imaginação.',
  intro2:'🎯 A proposta 3 em 1 permite explorar diferentes formas de brincar; depois, a mochila ajuda a guardar as peças e organizar tudo para a próxima aventura.',
  details:[
    '🧩 Tipo: mochila construtor 3 em 1 com ferramentas de brinquedo.',
    '🛠️ Uso: brincadeiras de oficina e montagem com acessórios.',
    ...(p.content?['📦 Conteúdo: mochila e conjunto de ferramentas, brinquedos e miniaturas.']:[])
  ],
  measureExtra:'Confira também o tamanho e as peças mostradas nas fotos do anúncio.',
  faq:[
   ['O que é?','Uma mochila construtor 3 em 1 com ferramentas e acessórios para brincar.'],
   ['Como usar?','Abra a mochila e organize as peças conforme as brincadeiras propostas.'],
   ['É para qual idade?',p.facts.age?'A indicação informada é a partir de '+p.facts.age+'.':'Confira a idade indicada na embalagem e na ficha.'],
   ['O que vem no conjunto?',p.content?'Mochila e conjunto de ferramentas, peças e miniaturas.':'Confira os itens indicados na ficha e nas fotos.'],
   ['Ocupa muito espaço?','A mochila facilita reunir e guardar os componentes após o uso.']
  ],
  reasons:[
   '🧰 Kit com ferramentas de brinquedo',
   'Formato de mochila para organizar peças',
   '🎲 Incentiva novas brincadeiras de faz de conta',
   'Tema de oficina e construção infantil',
   'Acessórios para explorar diferentes cenas',
   '⭐ Proposta 3 em 1 no mesmo produto',
   'Peças reunidas para guardar depois',
   'Facilita levar a brincadeira para outro ambiente',
   '🎁 Uma opção para presentear crianças',
   'Possibilidades de brincadeira e montagem'
  ],
  tips:[
   '💡 A mochila facilita a organização dos acessórios entre uma brincadeira e outra.',
   '📷 Observe as fotos para conferir formatos, cores e detalhes das peças do conjunto.',
   '🎯 Confira a idade recomendada e os itens inclusos antes de finalizar seu pedido.',
   '🧩 As peças podem ser combinadas em diferentes cenários de faz de conta e construção.',
   '📦 Consulte as informações de embalagem para identificar exatamente o que acompanha.',
   '🔎 A proposta de oficina estimula brincadeiras de montagem e criação de histórias.',
   '💬 Se precisar confirmar alguma peça, fale com a loja antes de comprar.',
   '📷 Confira os acessórios nas fotos do anúncio.'
  ]
 };
 if(p.type==='steamer')return{
  intro1:'👕 A '+name+' oferece praticidade no cuidado das roupas e ajuda a suavizar vincos sem precisar estender uma tábua de passar.',
  intro2:'✨ O formato portátil facilita o manuseio em peças no cabide e combina com uma rotina de preparação das roupas em casa ou em viagem.',
  details:['👔 Uso: cuidados com roupas e tecidos adequados ao vapor.','🧳 Formato: passadeira portátil para uso vertical.'],
  measureExtra:'Confira a voltagem e as características do reservatório antes do uso.',
  faq:[['Como funciona?','O vapor ajuda a suavizar amassados nas roupas.'],['Pode usar no cabide?','O formato é indicado para roupas penduradas.'],['Serve para qualquer tecido?','Verifique as orientações de cuidado da peça.'],['É portátil?','Sim, foi concebida para manuseio prático.'],['Precisa de tábua?','A utilização vertical dispensa a tábua em várias peças.']],
  reasons:['👕 Cuidado prático das roupas','Formato portátil','✨ Uso com roupas no cabide','Ajuda a reduzir vincos','Boa opção para rotina doméstica','🧳 Prática para levar em viagens','Acesso simples às peças penduradas','Menos preparação para passar roupas','🎯 Apoia uma rotina organizada','Consulte os detalhes e escolha com segurança'],
  tips:['💡 Verifique a etiqueta dos tecidos antes de aplicar vapor.','🔌 Confira a voltagem selecionada na compra.','📷 Consulte as fotos do reservatório e dos acessórios incluídos.','👔 Use conforme as instruções do fabricante para cada tipo de tecido.','💬 Tire dúvidas sobre uso e cuidados com a loja antes do pedido.']
 };
 if(p.type==='bath')return{
  intro1:'🚿 O '+name+' ajuda a organizar shampoos, cremes e itens de higiene usando melhor os espaços disponíveis no banheiro.',
  intro2:'✨ O formato de canto mantém os frascos reunidos e ao alcance das mãos, facilitando a rotina do banho e a organização do box.',
  details:['🛁 Aplicação: organização de produtos no canto do box.','🧴 Uso: apoio para shampoo, condicionador e itens de higiene.'],
  measureExtra:'Confira a estrutura, as medidas e o kit de instalação nas imagens.',
  faq:[['Onde instalar?','No canto do box compatível com o suporte.'],['Serve para shampoo?','É destinado a organizar frascos de higiene.'],['Quantos andares tem?','Confira a quantidade na versão anunciada.'],['O kit é incluso?','Verifique os itens inclusos na ficha.'],['Ocupa muito espaço?','O formato de canto aproveita áreas do box.']],
  reasons:['🚿 Mais organização no banheiro','Aproveitamento do canto do box','🧴 Frascos reunidos em um lugar','Itens próximos durante o banho','Mais praticidade na rotina','✨ Formato funcional','Ajuda a liberar áreas do box','Facilita conferir os produtos','🛁 Opção para organizar higiene','Confira a instalação ideal para sua parede'],
  tips:['📷 Consulte as fotos do produto antes de escolher a variação.','💡 Confira as dimensões do canto do box e o sistema de fixação.','🔎 Compare os itens inclusos com o que você precisa instalar.','🧴 Organize os frascos conforme o espaço disponível.']
 };
 if(p.type==='pool')return{
  intro1:'💦 A '+name+' é uma opção de lazer para momentos de brincadeira com água em espaços adequados e com supervisão.',
  intro2:'☀️ Com estrutura inflável, oferece uma alternativa para recreação em dias quentes; confira sempre a capacidade e as orientações de uso.',
  details:['🌊 Tipo: piscina inflável para recreação infantil.','🏡 Uso: área plana e adequada, sob supervisão de um adulto.'],
  measureExtra:'Consulte as medidas infladas antes de definir o espaço de montagem.',
  faq:[['É inflável?','Sim, conforme a descrição do produto.'],['Onde usar?','Em superfície plana e adequada ao uso.'],['Crianças podem usar sozinhas?','Não. É indispensável supervisão constante.'],['Qual a capacidade?','Consulte a informação indicada na ficha.'],['Como guardar?','Esvazie, seque e siga as orientações do fabricante.']],
  reasons:['💦 Lazer com água','Estrutura inflável','☀️ Opção para dias quentes','Brincadeiras recreativas','Uso em espaço adequado','🏡 Indicada para áreas externas compatíveis','Montagem conforme manual','Facilidade para guardar após secar','🌊 Momentos de recreação','Confira a capacidade antes de comprar'],
  tips:['⚠️ Nunca deixe crianças sem supervisão, nem por alguns instantes.','📏 Confira as medidas da piscina inflada e o espaço disponível.','💧 Respeite o limite de água e as instruções do fabricante.','📷 Observe as fotos e os detalhes da versão anunciada.']
 };
 if(p.type==='bottle')return{
  intro1:'🥤 A '+name+' facilita levar bebidas em diferentes momentos do dia, aliando funcionalidade e organização da rotina.',
  intro2:'✨ O formato de garrafa térmica é pensado para armazenar bebidas; verifique a capacidade e as orientações de temperatura e limpeza.',
  details:['🧊 Categoria: garrafa térmica para bebidas.','👜 Uso: armazenamento e transporte conforme indicação.'],
  measureExtra:'Consulte a capacidade e as dimensões informadas no anúncio.',
  faq:[['É uma garrafa térmica?','Sim, conforme o modelo anunciado.'],['Qual a capacidade?','Confira a litragem indicada na ficha.'],['Pode levar na bolsa?','Verifique medidas e fechamento antes.'],['Como limpar?','Siga as orientações de conservação.'],['Qual a cor?','Confira a opção escolhida na compra.']],
  reasons:['🥤 Praticidade para bebidas','Formato de garrafa térmica','✨ Rotina mais organizada','Fácil de conferir a capacidade','Uso conforme as orientações','👜 Opção para diferentes momentos','Modelo funcional','Armazenamento em um recipiente','🧊 Consulte a conservação indicada','Escolha a versão certa para seu uso'],
  tips:['🧽 Antes do primeiro uso, observe as recomendações de limpeza.','📷 Confira fotos do fechamento e da tampa.','💧 Respeite a capacidade declarada na ficha.','🌡️ Verifique as orientações do fabricante para temperaturas.']
 };
 return{
  intro1:'✨ Conheça '+name+', uma opção para quem busca praticidade e quer conferir as características do produto antes de escolher.',
  intro2:'🎯 Observe a proposta de uso, os detalhes nas imagens e os itens inclusos para selecionar a versão mais adequada à sua rotina.',
  details:['📦 Produto: '+name+'.','🔎 Uso e características: conforme a ficha e as fotos desta SKU.'],
  measureExtra:'As dimensões podem variar por modelo. Confira a versão anunciada.',
  faq:[['O que recebo?','O conteúdo indicado na ficha e nas fotos.'],['Como escolher?','Confira as características e a versão.'],['Quais as medidas?','Consulte os detalhes informados.'],['É o mesmo das fotos?','Confira a variação escolhida no anúncio.'],['Como tirar dúvidas?','Converse com a loja antes de comprar.']],
  reasons:['✨ Informações reunidas em um anúncio','Fotos para conferir detalhes','🎯 Compare as opções disponíveis','Selecione a versão adequada','Confira o conteúdo informado','🔎 Mais clareza para decidir','Consulte dados e medidas','Organize suas necessidades','📦 Confira os itens inclusos','Tire dúvidas antes de finalizar'],
  tips:['📷 Observe todas as fotografias para conferir a versão apresentada.','📏 Consulte medidas e materiais confirmados na ficha técnica.','💬 Tire dúvidas sobre compatibilidade com a loja antes de comprar.','✅ Confira a variação selecionada e o conteúdo da embalagem.','🔎 Analise os detalhes antes de finalizar o pedido.','📦 Os itens inclusos são os descritos no anúncio da sua SKU.']
 };
}
function toLines(p,profile,extraLines=[],short=false){
 const parts=[];
 parts.push('✨ Descrição do produto');
 const paragraph1=short?profile.intro1.replace(/, reunindo[^.]*\./,'.'):profile.intro1;
 parts.push(paragraph1,'',profile.intro2);
 parts.push('','⚙️ Especificações do produto',...profile.details);
 const f=p.facts;
 if(f.material)parts.push('🔹 Material: '+f.material+'.');
 if(f.age)parts.push('🔹 Idade indicada: a partir de '+f.age+'.');
 if(f.capacity)parts.push('🔹 Capacidade informada: '+f.capacity+'.');
 if(f.power)parts.push('🔹 Potência informada: '+f.power+'.');
 if(f.voltage)parts.push('🔹 Voltagem informada: '+f.voltage+'.');
 parts.push(...extraLines);
 parts.push('','📏 Tabela de medidas');
 if(f.dimensions)parts.push('📐 Produto (A × L × C): '+f.dimensions+'.');
 else parts.push('📐 Medidas: consulte os dados do produto e a versão anunciada.');
 parts.push(profile.measureExtra);
 parts.push('','❓ 5 dúvidas frequentes');
 profile.faq.forEach(([q,a],i)=>parts.push((i+1)+'. '+q+' '+a));
 parts.push('','🌟 10 motivos para comprar agora');
 profile.reasons.forEach((x,i)=>parts.push((i+1)+'. '+x));
 return parts.join('\n').trim();
}
function shortest(value,max){
 const s=clean(value);if(codePointCount(s)<=max)return s.replace(/\.+$/,'');
 return [...s].slice(0,max).join('').replace(/\s+\S*$/,'').replace(/[\s,.;:-]+$/,'');
}
export function composeShopeeDescription({record={},supplier=null,sourceText=''}={}){
 const p=extract({record,supplier,sourceText}),pr=pack(p);
 // Use official SKU-specific facts, never raw source text as a completed description.
 let body=toLines(p,pr);
 if(codePointCount(body)>1440&&p.type==='toy'){
  // Prefira retirar repetições a cortar frases no meio. As especificações da fonte permanecem.
  pr.intro1='🧰 A '+p.short+' reúne ferramentas e acessórios para brincadeiras de construção, montagem e faz de conta.';
  pr.intro2='🎯 A proposta 3 em 1 permite criar cenários de oficina e guardar as peças na mochila depois da diversão.';
  pr.details=pr.details.filter(x=>!x.includes('Uso: brincadeiras de oficina'));
  body=toLines(p,pr);
 }
 if(codePointCount(body)>1440){
  const shortened={...pr,
   intro1:shortest(pr.intro1,140)+'.',
   intro2:shortest(pr.intro2,135)+'.',
   faq:pr.faq.map(([q,a])=>[q,shortest(a,75)]),
   reasons:pr.reasons.map(x=>shortest(x,54)),
   measureExtra:shortest(pr.measureExtra,90)};
  body=toLines(p,shortened);
  if(codePointCount(body)>1440){
    shortened.intro1=shortest(pr.intro1,110)+'.';
    shortened.intro2=shortest(pr.intro2,110)+'.';
    shortened.faq=pr.faq.map(([q,a])=>[q,shortest(a,52)]);
    shortened.reasons=pr.reasons.map(x=>shortest(x,43));
    body=toLines(p,shortened);
  }
  Object.assign(pr,shortened);
 }
 // Nunca entregar rascunho inválido. Compactar anotações repetidas antes das dicas adicionais.
 if(codePointCount(body)>1440){
  pr.details=pr.details.filter(x=>!/\bUso:|\bCategoria:/.test(x));
  body=toLines(p,pr);
 }
 if(codePointCount(body)>1440){
  pr.measureExtra='Confira nas fotos a versão e os detalhes anunciados.';
  body=toLines(p,pr);
 }
 if(codePointCount(body)>1440){
  pr.faq=pr.faq.map(([q,a])=>[q,shortest(a,Math.max(35,Math.ceil(a.length*.72))).replace(/[.]+$/,'')+'.']);
  body=toLines(p,pr);
 }
 if(codePointCount(body)<1400){
  // Best-first selection from real-use guidance; independent notes, never invented claims.
  const candidates=pr.tips.map(clean).filter(Boolean);
  const selected=[];
  while(candidates.length&&codePointCount(body)<1400){
   const available=1440-codePointCount(body);
   let index=-1,quality=-Infinity;
   for(let i=0;i<candidates.length;i++){
    const size=codePointCount(candidates[i])+1;
    if(size>available)continue;
    const deficit=1400-codePointCount(body);
    const score=size>=deficit?100000-size:1000+size;
    if(score>quality){quality=score;index=i;}
   }
   if(index<0)break;
   selected.push(candidates.splice(index,1)[0]);
   body=toLines(p,pr,selected);
  }
 }
 return {description:body,valid:verify(body),characterCount:codePointCount(body),
  source:p.hasSupplier?'WeDrop + anúncio Shopee':'Anúncio Shopee',
  warnings:[
   ...(!p.facts.dimensions?['Medidas específicas não confirmadas; confira a ficha do fornecedor.']:[]),
   'Certificações, selos e números de registro não são deduzidos automaticamente.'
  ]};
}
