// Descrições comerciais automáticas, claras, específicas e sem crédito de API.
// Constrói textos a partir da SKU, catálogo WeDrop e informações extras do vendedor.
// Não inventa características, certificações, acessórios, medidas ou compatibilidades.
import {validateContentRules,codePointCount} from './shopeeOptimizationWorkflow.js';
import {REDE_ACHADOS_DESCRIPTION_RULES} from './shopeeMatrixRules.js';
import {supplierProductDimensions} from './shopeeSupplierEvidenceFacts.js';

const clean=v=>String(v??'').normalize('NFC').replace(/\s+/g,' ').trim();
const fold=v=>clean(v).normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase();
const trunc=(v,n=150)=>{const t=clean(v);return [...t].length<=n?t:[...t].slice(0,n).join('').replace(/\s+\S*$/u,'').trim();};
const cta=REDE_ACHADOS_DESCRIPTION_RULES.cta;
function titleOf(record,data){
 const name=clean(record.title||data.name||'Produto');
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
 const age=(normalized.match(/\b(?:a\s*partir\s*de|idade indicada|idade recomendada|indicacao de uso|indicacao de idade)\s*[:\-]?\s*(?:\+|de\s*)?(\d{1,2})\s*anos?\b/)||fromTitle.match(/\b(?:\+|acima de )\s*(\d{1,2})\s*anos?\b/))?.[1];
 const cap=(normalized.match(/\b(?:capacidade|volume)\s*[:\-]?\s*(\d{1,5}(?:[.,]\d+)?)\s*(ml|litros|l)\b/)||
   fromTitle.match(/\b(\d{2,5})\s*(ml|litros|l)\b/));
 const qty=(normalized.match(/\b(?:cont[eé]m|quantidade|itens inclusos|conte[uú]do)\s*[:\-]?\s*(\d{1,3})\s*(?:pe[cç]as|potes|unidades)\b/)||
   fromTitle.match(/\b(\d{1,3})\s*(?:pe[cç]as|potes|unidades)\b/));
 const dims=supplierProductDimensions(supplemental)||supplierProductDimensions(catalog);
 const facts=[];
 const brand=clean(data.brand||'');
 if(brand&&!/^(?:generico|gen[eé]rico|sem marca|importado|outros?|n\/a)$/i.test(brand))
  facts.push('🏷️ Marca informada: '+trunc(brand,55));
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
 if(type==='moto'&&/pedal\s+(?:de\s+)?acelerador|(?:acionamento|aceleracao)\s+por\s+pedal/.test(normalized))
  facts.push('🦶 Aceleração por pedal, conforme ficha do fornecedor');
 if(type==='moto'){
  const speed=normalized.match(/(?:velocidade\s+(?:de\s+)?(?:at[eé]\s+)?|alcan[cç]a\s+(?:at[eé]\s+)?)(\d+(?:[.,]\d+)?)\s*km\s*\/\s*h/);
  if(speed)facts.push('🚦 Velocidade informada: até '+speed[1]+' km/h');
 }
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

// Destaques comerciais por categoria. São benefícios do uso proposto e do
// formato reconhecido na SKU; características técnicas vêm somente da fonte.
// Benefícios persuasivos por categoria: cada texto explica O QUE o comprador
// ganha na experiência de uso e POR QUE isso importa. Não afirmar desempenho,
// acessórios ou resultados técnicos que a SKU não comprove.
const highlights={
 moto:[
  '🎨 Um visual para impressionar: o estilo vintage e a cor vermelha dão personalidade à motinha e fazem dela um presente cheio de charme. É uma opção que chama atenção pelo visual inspirado nas motos clássicas.',
  '🏍️ Brincadeiras que viram histórias: brincar de pilotar abre espaço para imaginar passeios e aventuras diferentes a cada dia. A proposta é transformar momentos de lazer em experiências de faz de conta, sempre em local adequado e sob supervisão de um adulto.',
  '🎁 Uma surpresa especial para os pequenos: para crianças que gostam de veículos, a moto pode ser o centro das brincadeiras e de bons momentos em família. Um presente que une a emoção de ganhar um brinquedo à vontade de começar a brincar.'
 ],
 ball:[
  '⚽ Mais diversão em cada partida: a bola convida a criar pequenas partidas, treinar chutes e trocar passes em momentos de lazer. Uma opção para crianças que gostam de futebol desde cedo e querem aproveitar mais momentos de brincadeira em espaços adequados.',
  '🏃 Brincadeira para compartilhar: reunir amigos ou familiares para jogar transforma um espaço apropriado em cenário de diversão e interação. Cada partida pode ser diferente, com novas jogadas e histórias.',
  '🎁 Um presente com jeito de futebol: para crianças que já gostam desse esporte, a bola aproxima o tema favorito da rotina de brincadeiras. Pode acompanhar atividades recreativas em ambientes adequados.'
 ],
 pool:[
  '💦 Um convite à diversão nos dias quentes: a piscina inflável ajuda a preparar um espaço de recreação com água. É uma opção para variar as brincadeiras da família em ambiente apropriado.',
  '☀️ Momentos para aproveitar juntos: organizar uma atividade refrescante pode tornar o tempo livre mais especial. Mantenha sempre um adulto presente e supervisionando as crianças durante todo o uso.',
  '🏡 Lazer no espaço disponível: quando instalada de acordo com as instruções e em superfície adequada, a piscina oferece uma proposta simples de recreação. Confira dimensões e capacidade antes de escolher.'
 ],
 bottle:[
  '🥤 Praticidade que acompanha sua rotina: ter uma garrafa dedicada às bebidas ajuda a organizar o que levar para o trabalho, estudo ou passeio. Escolha a capacidade que melhor combina com seus hábitos.',
  '👜 Um item para diferentes momentos: seja na mesa de trabalho ou durante atividades externas, a garrafa pode fazer parte dos acessórios do dia a dia. Seu uso deve seguir as orientações de conservação do fabricante.',
  '🎁 Uma escolha funcional para presentear: produtos úteis também podem ser lembranças especiais. A garrafa térmica é uma alternativa para quem gosta de manter a rotina bem organizada.'
 ],
 coffee:[
  '☕ O prazer de preparar o próprio café: a cafeteira italiana traz o ritual do preparo tradicional para dentro de casa. Do preparo ao momento de servir, cada etapa pode fazer parte de uma pausa especial.',
  '🏡 Um toque de tradição na cozinha: para quem aprecia café, ter uma cafeteira dedicada ajuda a transformar um hábito em um momento mais pessoal. É uma opção para preparar a bebida do seu jeito, seguindo as instruções do produto.',
  '🎁 Um presente para apaixonados por café: quem valoriza o aroma, o preparo e a experiência da bebida pode gostar de receber uma cafeteira italiana. Uma escolha ligada ao universo do café e dos encontros.'
 ],
 steamer:[
  '👕 Roupas preparadas com mais praticidade: a passadeira a vapor pode ajudar a suavizar amassados em peças adequadas a esse tipo de cuidado. Assim, a preparação do vestuário pode ficar mais integrada à rotina.',
  '✨ Cuidado com a apresentação das peças: ao preparar roupas para compromissos, trabalho ou passeios, cada detalhe faz diferença. Use o vapor apenas em tecidos permitidos e conforme as instruções.',
  '🧳 Uma aliada em diferentes momentos: da organização do armário à preparação de uma peça para vestir, a passadeira oferece outra opção de cuidado. Confira o modo correto de uso para cada tecido.'
 ],
 bath:[
  '🧴 Cada coisa em seu lugar: reunir shampoos e outros produtos de banho em um suporte ajuda a reduzir a sensação de desorganização. Fica mais simples visualizar e localizar os itens que você usa.',
  '🚿 Mais praticidade na hora do banho: com os frascos reunidos em uma área definida, você pode acessar o que precisa com menos procura. Confira as medidas e a instalação compatível com seu banheiro.',
  '✨ Organização que valoriza o ambiente: pequenos acessórios ajudam a compor um banheiro visualmente mais arrumado. O porta-shampoo é uma maneira de começar pelos objetos usados todos os dias.'
 ],
 spices:[
  '🌿 Temperos organizados ao seu alcance: reunir condimentos em um espaço definido ajuda a localizar os ingredientes durante o preparo das refeições. Isso torna a bancada e a rotina de cozinha mais práticas.',
  '🍳 Mais prazer em cozinhar: com os temperos agrupados, fica mais fácil encontrar a opção que combina com cada receita. Um detalhe de organização pode fazer diferença nas atividades diárias.',
  '✨ Uma cozinha com visual mais harmonioso: um porta-temperos ajuda a concentrar itens que costumam ficar espalhados. Confira a quantidade e o formato dos recipientes antes de comprar.'
 ],
 picnic:[
  '🏕️ Prepare seu cantinho ao ar livre: uma toalha para camping ou piquenique ajuda a delimitar um espaço para sentar e aproveitar o passeio. Ideal para levar o momento de descanso para ambientes apropriados.',
  '🌳 Mais oportunidades para curtir bons momentos: parques, piqueniques e encontros em família ficam mais acolhedores com um espaço reservado. Confira o tamanho para escolher conforme o número de pessoas.',
  '🎒 Um item pensado para passeios: incluir a toalha entre os acessórios do seu programa ajuda a planejar melhor a experiência. Verifique o material e os cuidados indicados pelo fabricante.'
 ],
 bin:[
  '🗑️ Um lugar definido para pequenos resíduos: ter uma lixeira no ambiente ajuda a concentrar o descarte em vez de deixar objetos espalhados. É um detalhe simples que contribui para a organização.',
  '🏠 Mais praticidade para o dia a dia: posicionar uma lixeira onde ela faz sentido pode facilitar hábitos de limpeza e descarte. Escolha um tamanho compatível com o espaço e sua necessidade.',
  '✨ Organize sem complicar: a lixeira complementa a arrumação da casa, escritório ou outro ambiente adequado. Confira as dimensões e o material para decidir pelo modelo certo.'
 ],
 tools:[
  '🛠️ Ferramentas reunidas para suas tarefas: um conjunto facilita manter diferentes peças organizadas em um mesmo local. Isso ajuda na preparação para pequenos ajustes compatíveis com o kit.',
  '🔧 Mais organização na hora de trabalhar: localizar cada ferramenta antes de começar pode tornar a atividade menos trabalhosa. Confira os itens inclusos para saber o que o conjunto realmente oferece.',
  '🏠 Uma escolha para quem gosta de estar preparado: manter um kit adequado em casa pode ser útil nas tarefas cotidianas. Use cada ferramenta conforme suas especificações e recomendações de segurança.'
 ],
 swatter:[
  '🦟 Uma alternativa para lidar com insetos: a raquete foi pensada para auxiliar no controle de insetos em situações de uso doméstico. Siga sempre as instruções e os cuidados informados pelo fabricante.',
  '🏡 Praticidade para a rotina da casa: ter uma opção destinada a essa finalidade pode ser útil em momentos de incômodo com insetos. Escolha o modelo considerando o tipo de uso descrito.',
  '✨ Um acessório com finalidade definida: em vez de improvisar, você conta com um produto anunciado para essa tarefa. Confira as orientações de manuseio e armazenamento seguro.'
 ],
 cart:[
  '🛒 Ajuda no transporte das compras: um carrinho pode tornar mais cômodo levar produtos compatíveis com sua capacidade. É uma opção para organizar melhor o trajeto entre a feira ou mercado e seu destino.',
  '🏡 Mais praticidade no planejamento da rotina: reunir compras no carrinho permite transportar os itens de forma mais organizada. Confira dimensões e capacidade para escolher conforme seu uso.',
  '✨ Um acessório pensado para a tarefa: para quem costuma fazer compras, ter um carrinho dedicado ao transporte pode ser conveniente. Use sempre respeitando as orientações do fabricante.'
 ],
 blender:[
  '🥤 Bebidas preparadas no seu ritmo: um liquidificador oferece uma opção para misturar ingredientes adequados ao equipamento. Você pode incluir o preparo de bebidas entre os hábitos do dia a dia.',
  '🍓 Mais possibilidades na cozinha: receitas simples de bebidas e misturas podem fazer parte da rotina, desde que compatíveis com o produto. Confira capacidade e instruções antes de usar.',
  '✨ Praticidade na preparação: ter um aparelho dedicado a essa tarefa ajuda a organizar os momentos de preparo. Escolha o modelo considerando as informações técnicas confirmadas.'
 ],
 general:[
  '🎯 Uma escolha mais alinhada ao que você procura: considere a finalidade do produto e como ela se encaixa na sua rotina. As informações confirmadas da SKU ajudam a identificar a versão mais adequada.',
  '✨ Um detalhe que pode fazer diferença: cada produto tem uma proposta de uso própria. Confira as características apresentadas no anúncio para descobrir quais benefícios são relevantes para você.'
 ]
};
const closing={
 moto:'🛒 Que tal levar mais imaginação para as brincadeiras? Escolha sua moto infantil e adicione ao carrinho!',
 ball:'🛒 Prepare a próxima brincadeira com futebol: escolha sua bola infantil e adicione ao carrinho!',
 pool:'🛒 Prepare momentos de lazer em família! Confira a versão e adicione ao carrinho.',
 bottle:'🛒 Escolha a sua garrafa térmica e leve mais praticidade para o dia a dia!',
 coffee:'🛒 Faça do café um momento especial: escolha sua cafeteira e adicione ao carrinho!',
 steamer:'🛒 Simplifique os cuidados com as roupas: escolha sua passadeira e adicione ao carrinho!',
 bath:'🛒 Dê um toque de organização ao banheiro: adicione ao carrinho!',
 spices:'🛒 Organize os temperos da cozinha: escolha seu conjunto e adicione ao carrinho!',
 picnic:'🛒 Prepare seu próximo passeio: escolha sua toalha e adicione ao carrinho!',
 bin:'🛒 Complete a organização do ambiente: adicione ao carrinho!',
 tools:'🛒 Complete seu conjunto de ferramentas: escolha o kit e adicione ao carrinho!',
 swatter:'🛒 Escolha sua raquete e adicione ao carrinho!',
 cart:'🛒 Leve mais praticidade para as compras: adicione ao carrinho!',
 blender:'🛒 Escolha seu liquidificador e adicione ao carrinho!',
 general:cta
};
export function composeShopeeDescription({record={},supplier=null,sourceText=''}={}){
 const data=supplier?.product_data||{};
 const title=titleOf(record,data),type=skuType(title),p=profiles[type];
 const facts=confirmedFacts(record,data,sourceText,type);
 const name=trunc(title,90);
 const paras=[
  '✨ '+name,
  '',
  '💛 '+p.opening,
  '',
  p.benefit,
  '',
  '🌟 Benefícios que fazem a diferença',
  '',
  ...(highlights[type]||highlights.general).flatMap(benefit=>[benefit,'']),
  '⚙️ Características e informações do produto',
  ...(p.details.length?p.details:[]),
  ...facts
 ];
 // Informações do fornecedor são suporte para os detalhes, e não um
 // catálogo repetido na apresentação publicitária.
 if(!facts.length&&!p.details.length)
  paras.push('🔎 Modelo anunciado: '+title);
 paras.push('',closing[type]||cta);
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
