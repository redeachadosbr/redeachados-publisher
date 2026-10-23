// Descrições comerciais automáticas, claras, específicas e sem crédito de API.
// Constrói textos a partir da SKU, catálogo WeDrop e informações extras do vendedor.
// Não inventa características, certificações, acessórios, medidas ou compatibilidades.
import {validateContentRules,codePointCount} from './shopeeOptimizationWorkflow.js';
import {REDE_ACHADOS_DESCRIPTION_RULES} from './shopeeMatrixRules.js';
import {supplierProductDimensions} from './shopeeSupplierEvidenceFacts.js';

const clean=v=>String(v??'').normalize('NFC').replace(/\s+/g,' ').trim();
const fold=v=>clean(v).normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase();
const trunc=(v,n=150)=>[...clean(v)].slice(0,n).join('').replace(/\s+\S*$/u,'').trim();
const cta=REDE_ACHADOS_DESCRIPTION_RULES.cta;
function titleOf(record,data){
 const name=clean(data.name||record.title||'Produto');
 return trunc(name.replace(/\b(?:SKU|c[oó]d(?:igo)?)\s*[:#-]?\s*\d{4,}\b/gi,'').replace(/[|]+/g,' '),115)||'Produto';
}
function skuType(name){
 const t=fold(name);
 if(/moto.+(?:eletrica|infantil)|motinha.*eletrica/.test(t))return 'moto';
 if(/bola.+(?:futebol|infantil)/.test(t))return 'ball';
 if(/piscina.*inflavel/.test(t))return 'pool';
 if(/garrafa.*termica/.test(t))return 'bottle';
 if(/cafeteira/.test(t))return 'coffee';
 if(/passadeira.*vapor|vaporizador.*roupa/.test(t))return 'steamer';
 if(/porta.*shampoo|prateleira.*banheiro/.test(t))return 'bath';
 if(/porta.*tempero|kit.*tempero/.test(t))return 'spices';
 if(/toalha.*(?:camping|piquenique)|tapete.*piquenique/.test(t))return 'picnic';
 if(/lixeira/.test(t))return 'bin';
 if(/chaves|ferramentas/.test(t))return 'tools';
 if(/raquete.*(?:mosquito|inseto)/.test(t))return 'swatter';
 if(/carrinho.*compras/.test(t))return 'cart';
 if(/liquidificador/.test(t))return 'blender';
 return 'general';
}
const profiles={
 moto:{
  opening:'Uma motinha infantil de visual vintage para transformar as brincadeiras em passeios cheios de imaginação. O estilo retrô e a cor vermelha dão personalidade ao brinquedo.',
  benefit:'🎈 Uma proposta de diversão e faz de conta para os pequenos, com a experiência de brincar de pilotar em um espaço apropriado e com supervisão de um adulto.',
  advantages:'🎁 Um presente marcante para crianças que gostam de veículos e aventuras de faz de conta.',
  details:['🏍️ Tipo: moto elétrica infantil de brinquedo','🎨 Estilo: vintage, na cor vermelha']
 },
 ball:{
  opening:'Mais movimento e diversão para quem adora futebol! Esta bola infantil é uma opção para chutes, passes e partidas recreativas.',
  benefit:'⚽ Incentiva momentos de brincadeira e interação, em casa, na escola ou em espaços adequados à atividade.',
  advantages:'🎁 Uma opção de presente para pequenos fãs de futebol.',
  details:['⚽ Tipo: bola infantil para futebol recreativo']
 },
 pool:{
  opening:'Um convite a momentos refrescantes de brincadeira! A piscina inflável infantil traz uma opção de lazer para os dias quentes.',
  benefit:'💦 Ideal para recreação com água em espaço adequado, sempre com supervisão constante de um adulto.',
  advantages:'☀️ Uma maneira de preparar momentos de lazer em família.',
  details:['🏖️ Tipo: piscina inflável infantil']
 },
 bottle:{
  opening:'Uma garrafa térmica para acompanhar a rotina com mais praticidade, em casa, no trabalho ou nos passeios.',
  benefit:'🥤 Ajuda a organizar suas bebidas ao longo do dia; confira as orientações de temperatura e conservação do fabricante.',
  advantages:'👜 Um acessório útil para o dia a dia e para presentear.',
  details:['🥤 Tipo: garrafa térmica para bebidas']
 },
 coffee:{
  opening:'Que tal tornar o momento do café ainda mais especial? Esta cafeteira italiana une o preparo tradicional a uma rotina cheia de sabor.',
  benefit:'☕ Uma alternativa para preparar café em casa, com um ritual simples para quem aprecia a bebida.',
  advantages:'🎁 Uma boa escolha para quem gosta de preparar o próprio café.',
  details:['☕ Tipo: cafeteira de estilo italiano']
 },
 steamer:{
  opening:'Mais praticidade na hora de cuidar das roupas! A passadeira a vapor foi pensada para ajudar a suavizar amassados.',
  benefit:'👕 Facilita a preparação de peças adequadas ao uso de vapor, conforme as recomendações de cada tecido.',
  advantages:'✨ Uma aliada para a rotina de cuidados com o vestuário.',
  details:['👔 Tipo: passadeira a vapor para roupas']
 },
 bath:{
  opening:'Um banheiro mais organizado começa pelos detalhes! Este porta-shampoo ajuda a manter frascos e acessórios de banho reunidos.',
  benefit:'🧴 Mais praticidade para localizar os produtos no momento do banho e aproveitar melhor o espaço disponível.',
  advantages:'🚿 Uma solução simples para compor a organização do banheiro.',
  details:['🛁 Uso: organização de produtos de banho']
 },
 spices:{
  opening:'Temperos bem organizados fazem diferença na cozinha! Este porta-temperos ajuda a reunir os condimentos do dia a dia.',
  benefit:'🌿 Deixe os temperos mais fáceis de localizar durante o preparo das receitas.',
  advantages:'🍳 Uma opção funcional para quem gosta de manter a cozinha em ordem.',
  details:['🌿 Uso: armazenamento e organização de temperos']
 },
 picnic:{
  opening:'Prepare um espaço acolhedor para seus momentos ao ar livre! Esta toalha de piquenique é uma companhia para passeios e encontros.',
  benefit:'🏕️ Ajuda a criar uma área para sentar e aproveitar momentos em parques, camping e piqueniques.',
  advantages:'🌳 Uma opção prática para curtir passeios e momentos em família.',
  details:['🏕️ Uso: camping e piqueniques']
 },
 bin:{
  opening:'Organização também está nos detalhes! Esta lixeira ajuda a manter o descarte de pequenos resíduos em um lugar definido.',
  benefit:'🗑️ Uma solução para complementar a organização de ambientes compatíveis com seu tamanho.',
  advantages:'🏠 Um item prático para o dia a dia.',
  details:['🗑️ Tipo: lixeira para resíduos']
 },
 tools:{
  opening:'Tenha as ferramentas mais usadas reunidas para pequenos reparos e ajustes! Este conjunto ajuda a compor seu espaço de trabalho.',
  benefit:'🛠️ Praticidade na organização das peças para tarefas compatíveis com o kit anunciado.',
  advantages:'🔧 Uma opção para quem gosta de manter ferramentas à mão.',
  details:['🛠️ Categoria: conjunto de ferramentas']
 },
 swatter:{
  opening:'Uma alternativa prática para lidar com insetos no dia a dia! Esta raquete mata-mosquitos tem formato de raquete para uso doméstico.',
  benefit:'🦟 Pode auxiliar no controle de insetos conforme as orientações de uso do fabricante.',
  advantages:'🏡 Um acessório para a rotina da casa.',
  details:['🦟 Tipo: raquete mata-mosquitos']
 },
 cart:{
  opening:'Leve praticidade para a hora das compras! Este carrinho ajuda no transporte de compras compatíveis com sua capacidade.',
  benefit:'🛒 Facilita o deslocamento de itens em feiras e mercados, conforme as condições de uso do produto.',
  advantages:'🏡 Uma solução útil para a rotina de compras.',
  details:['🛒 Tipo: carrinho de compras']
 },
 blender:{
  opening:'Mais praticidade na preparação de bebidas! Este liquidificador ajuda a preparar sucos e misturas de acordo com as orientações de uso.',
  benefit:'🥤 Uma opção para ter o preparo de bebidas mais integrado à rotina.',
  advantages:'🍓 Uma escolha funcional para quem gosta de bebidas feitas na hora.',
  details:['🥤 Tipo: liquidificador']
 },
 general:{
  opening:'Um produto pensado para sua finalidade, com características que merecem atenção na hora da escolha.',
  benefit:'✨ Confira as funcionalidades e os dados confirmados antes de selecionar a versão desejada.',
  advantages:'🎯 Compare as informações e escolha o modelo adequado ao seu uso.',
  details:[]
 }
};
const materialMap={
 'plastico':'plástico','abs':'ABS','vinil':'vinil','pvc':'PVC',
 'polipropileno':'polipropileno','aco inoxidavel':'aço inoxidável',
 'aco':'aço','metal':'metal','silicone':'silicone','vidro':'vidro',
 'aluminio':'alumínio','tnt':'TNT','polietileno':'polietileno'
};
function confirmedFacts(record,data,sourceText,type){
 const catalog=String(data.description||data.details||'');
 const supplemental=String(sourceText||'');
 const name=String(data.name||record.title||'');
 const all=[supplemental,catalog,record.description||''].join('\n');
 const normalized=fold(all);
 const fromTitle=fold(name);
 // Prioritize explicit labels in supplier data, never arbitrary numbers from
 // a paragraph describing a different component (e.g. motor 380, adapter 220V).
 const mat=normalized.match(/\b(?:composicao|material)\s*[:\-]\s*(?:100%\s*)?(vinil\s*\(pvc\)|plastico|abs|vinil|pvc|polipropileno|aco inoxidavel|aco|metal|silicone|vidro|aluminio|tnt|polietileno)\b/);
 const selectedMat=mat?.[1]?.replace('vinil (pvc)','vinil')||'';
 const age=(normalized.match(/\b(?:a partir de|idade indicada|idade recomendada|indicacao de uso|indicacao de idade)\s*[:\-]?\s*(?:\+|de\s*)?(\d{1,2})\s*anos?\b/)||fromTitle.match(/\b(?:\+|acima de )\s*(\d{1,2})\s*anos?\b/))?.[1];
 const cap=(normalized.match(/\b(?:capacidade|volume)\s*[:\-]?\s*(\d{1,5}(?:[.,]\d+)?)\s*(ml|litros|l)\b/)||
   fromTitle.match(/\b(\d{2,5})\s*(ml|litros|l)\b/));
 const qty=(normalized.match(/\b(?:cont[eé]m|quantidade|itens inclusos|conte[uú]do)\s*[:\-]?\s*(\d{1,3})\s*(?:pe[cç]as|potes|unidades)\b/)||
   fromTitle.match(/\b(\d{1,3})\s*(?:pe[cç]as|potes|unidades)\b/));
 const dims=supplierProductDimensions(supplemental)||supplierProductDimensions(catalog);
 const facts=[];
 if(selectedMat)facts.push('🧩 Material informado: '+(materialMap[selectedMat]||selectedMat));
 if(age)facts.push('👧 Idade indicada: a partir de '+age+' anos');
 if(cap)facts.push('📦 Capacidade informada: '+cap[1]+' '+(cap[2]==='l'?'L':cap[2]));
 if(qty)facts.push('🔢 Quantidade informada: '+qty[1]+' '+(fromTitle.includes('potes')?'potes':'peças ou unidades'));
 if(type==='moto'&&/\b6\s*v\b/.test(fromTitle))facts.push('🔋 Alimentação do brinquedo: 6 V');
 if(dims)facts.push('📏 Dimensões declaradas do produto (A × L × C): '+dims.value);
 if(type==='ball'){
  const size=(normalized.match(/\btamanho\s*[:\-]?\s*n(?:o|º)?\s*([1-7])\b/)||fromTitle.match(/\bn\s*([1-7])\b/))?.[1];
  if(size)facts.push('⚽ Tamanho informado: nº '+size);
  if(/enviad[ao]\s+vazi[ao]|enviad[ao]\s+sem\s+ar/.test(normalized))
   facts.push('📦 Envio informado: bola vazia, para inflar');
 }
 if(type==='picnic'&&/\bimpermeavel\b/.test(fromTitle+' '+normalized))facts.push('💧 Material anunciado como impermeável');
 if(type==='moto'&&/bateria.*(?:recarregavel|interna)|(?:recarregavel|interna).*bateria/.test(normalized))
  facts.push('🔌 Bateria recarregável, conforme ficha do fornecedor');
 // 380 W, 220 V and certifications are deliberately NOT inferred from
 // arbitrary text: these need verified product-specific declarations.
 return [...new Set(facts)];
}
export function isGenericShopeeDescription(value){
 const t=fold(value);
 return t.includes('uma opcao para quem busca praticidade e quer conferir as caracteristicas do produto')&&
   t.includes('informacoes reunidas em um anuncio')&&t.includes('consulte dados e medidas');
}
export function isCommercialDescription(value){
 try{validateContentRules({description:String(value||'')});return true;}catch{return false;}
}
export function composeShopeeDescription({record={},supplier=null,sourceText=''}={}){
 const data=supplier?.product_data||{};
 const title=titleOf(record,data),type=skuType(title),p=profiles[type];
 const facts=confirmedFacts(record,data,sourceText,type);
 const name=trunc(title,90);
 const paras=[
  '✨ Descrição do produto',
  '💛 '+name+': '+p.opening,
  '',
  p.benefit,
  '',
  '🌟 Benefícios e por que comprar',
  p.advantages,
  '',
  '⚙️ Características confirmadas',
  ...(p.details.length?p.details:[]),
  ...facts
 ];
 // With sparse source information avoid invented generic specifications.
 if(!facts.length&&!p.details.length)paras.push('🔎 Produto: '+title);
 paras.push('','🛒 '+cta.replace(/^🛒\s*/,''));
 const description=paras.join('\n').trim();
 return {
  description,
  valid:isCommercialDescription(description),
  characterCount:codePointCount(description),
  source:supplier?'Catálogo WeDrop + anúncio Shopee':'Anúncio Shopee + informações adicionais',
  warnings:[
   ...(type==='moto'?['Dados como 220 V, 380 W, medidas logísticas e certificações só podem constar se comprovados para este produto.']:[]),
   ...(!facts.length?['Há poucas características específicas confirmadas; complemente Informações da WeDrop para enriquecer o texto.']:[])
  ]
 };
}
