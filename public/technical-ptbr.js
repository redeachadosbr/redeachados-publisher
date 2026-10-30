/* Rede Achados BR — tradução visual da ficha técnica Shopee para pt-BR.
 * Somente apresentação. IDs e valores oficiais continuam intactos para a API.
 */
(function(root){
 'use strict';
 const normalize=value=>String(value??'').normalize('NFD').replace(/[\u0300-\u036f]/g,'')
  .toLowerCase().replace(/[’']/g,'').replace(/\s+/g,' ').trim();
 const names={
  'volume capacity':'Capacidade (volume)','volume':'Volume',
  'capacity':'Capacidade','capacity volume':'Capacidade (volume)',
  'product capacity':'Capacidade do produto','cup capacity':'Capacidade do copo',
  'capacity of product':'Capacidade do produto','capacity of cup':'Capacidade do copo',
  'product weight':'Peso do produto','item weight':'Peso do produto',
  'net weight':'Peso líquido','gross weight':'Peso bruto',
  'weight':'Peso','weight capacity':'Capacidade de peso',
  'maximum weight':'Peso máximo suportado','maximum load':'Carga máxima',
  'load capacity':'Capacidade de carga',
  'length':'Comprimento','width':'Largura','height':'Altura',
  'depth':'Profundidade','diameter':'Diâmetro','thickness':'Espessura',
  'product length':'Comprimento do produto','product width':'Largura do produto',
  'product height':'Altura do produto','product depth':'Profundidade do produto',
  'product dimensions':'Dimensões do produto','item dimensions':'Dimensões do item',
  'dimensions':'Dimensões','dimension (l x w x h)':'Dimensões (C × L × A)',
  'dimension (l x w x h) (cm)':'Dimensões (C × L × A) em cm',
  'size':'Tamanho','ball size':'Tamanho da bola','ball diameter':'Diâmetro da bola',
  'material':'Material','main material':'Material principal','composition':'Composição',
  'product material':'Material do produto','body material':'Material do corpo',
  'type':'Tipo','product type':'Tipo de produto','category':'Categoria',
  'brand':'Marca','brand name':'Nome da marca','model':'Modelo',
  'model name':'Nome do modelo','product model':'Modelo do produto',
  'model number':'Número do modelo','product name':'Nome do produto',
  'name':'Nome','style':'Estilo','pattern':'Estampa','design':'Design',
  'color':'Cor','colour':'Cor','colors':'Cores','colour family':'Família de cores',
  'color family':'Família de cores','shape':'Formato','finish':'Acabamento',
  'surface finish':'Acabamento da superfície',
  'quantity':'Quantidade','quantity per pack':'Quantidade por embalagem',
  'number of pieces':'Número de peças','number of items':'Número de itens',
  'number of units':'Número de unidades','pack size':'Tamanho da embalagem',
  'package contents':'Conteúdo da embalagem','included items':'Itens inclusos',
  'accessories included':'Acessórios inclusos','set includes':'Itens do conjunto',
  'condition':'Condição do produto','product condition':'Condição do produto',
  'item condition':'Condição do item','custom product':'Produto personalizado',
  'is customized':'É personalizado','is handmade':'É artesanal',
  'country of origin':'País de origem',
  'region of origin':'País ou região de origem',
  'country/region of origin':'País ou região de origem',
  'country or region of origin':'País ou região de origem',
  'place of origin':'Local de origem','made in':'Fabricado em',
  'manufacturer':'Fabricante','manufacturing country':'País de fabricação',
  'warranty':'Garantia','warranty duration':'Prazo de garantia',
  'warranty type':'Tipo de garantia','warranty period':'Período de garantia',
  'warranty coverage':'Cobertura da garantia',
  'recommended age':'Idade recomendada','age range':'Faixa etária',
  'age recommendation':'Idade recomendada','minimum age':'Idade mínima',
  'maximum age':'Idade máxima','suitable age':'Idade indicada',
  'gender':'Gênero indicado','target audience':'Público indicado',
  'indication':'Indicação de uso','indication of use':'Indicação de uso',
  'recommended use':'Uso recomendado','usage':'Uso',
  'application':'Aplicação','function':'Função','features':'Características',
  'special features':'Características especiais',
  'power':'Potência','power source':'Fonte de alimentação',
  'power supply':'Fonte de alimentação','voltage':'Tensão elétrica',
  'input voltage':'Tensão de entrada','output voltage':'Tensão de saída',
  'rated voltage':'Tensão nominal','frequency':'Frequência',
  'rated power':'Potência nominal','power consumption':'Consumo de energia',
  'battery':'Bateria','battery type':'Tipo de bateria',
  'battery capacity':'Capacidade da bateria','built-in battery':'Bateria integrada',
  'build-in battery':'Bateria integrada','batteries included':'Baterias inclusas',
  'battery included':'Bateria inclusa','charging time':'Tempo de carregamento',
  'operating time':'Autonomia de funcionamento','working time':'Tempo de uso',
  'wireless':'Sem fio','connectivity':'Conectividade',
  'compatible devices':'Dispositivos compatíveis',
  'is waterproof':'É à prova d’água','water resistance':'Resistência à água',
  'waterproof':'À prova d’água',
  'certification':'Certificação','has certification':'Possui certificação',
  'certification number':'Número da certificação',
  'inmetro registration number':'Número de registro no Inmetro',
  'has bsmi no.':'Possui certificação BSMI',
  'has bsmi no':'Possui certificação BSMI',
  'contains bluetooth, wireless and/or rf technology':'Contém Bluetooth, Wi-Fi ou tecnologia RF',
  'has bluetooth':'Possui Bluetooth','wireless technology':'Tecnologia sem fio',
  'expiration date':'Data de validade','expiry date':'Data de validade',
  'manufacturing date':'Data de fabricação','production date':'Data de produção',
  'shelf life':'Prazo de validade','storage instructions':'Instruções de armazenamento',
  'installation type':'Tipo de instalação','mounting type':'Tipo de montagem',
  'assembly required':'Requer montagem',
  'package weight':'Peso da embalagem','package length':'Comprimento da embalagem',
  'package width':'Largura da embalagem','package height':'Altura da embalagem'
 };
 const values={
  'yes':'Sim','no':'Não','true':'Sim','false':'Não',
  'new':'Novo','used':'Usado','refurbished':'Recondicionado',
  'not applicable':'Não se aplica','n/a':'Não se aplica',
  'not specified':'Não informado','unknown':'Não informado','none':'Nenhum',
  'other':'Outro','others':'Outros','no warranty':'Sem garantia',
  'with warranty':'Com garantia','without warranty':'Sem garantia',
  'manufacturer warranty':'Garantia do fabricante','seller warranty':'Garantia do vendedor',
  'stainless steel':'Aço inoxidável','steel':'Aço','glass':'Vidro',
  'borosilicate glass':'Vidro borossilicato','plastic':'Plástico',
  'aluminum':'Alumínio','aluminium':'Alumínio','silicone':'Silicone',
  'polypropylene':'Polipropileno','wood':'Madeira','metal':'Metal',
  'cotton':'Algodão','rubber':'Borracha',
  'black':'Preto','white':'Branco','blue':'Azul','red':'Vermelho',
  'green':'Verde','yellow':'Amarelo','pink':'Rosa','purple':'Roxo',
  'orange':'Laranja','gray':'Cinza','grey':'Cinza','silver':'Prata',
  'gold':'Dourado','golden':'Dourado','transparent':'Transparente',
  'multicolor':'Multicolorido','assorted':'Sortido','beige':'Bege',
  'brown':'Marrom','light blue':'Azul-claro','dark blue':'Azul-escuro',
  'battery':'Bateria','battery operated':'Alimentação por bateria',
  'battery powered':'Alimentação por bateria',
  'rechargeable battery':'Bateria recarregável','rechargeable':'Recarregável',
  'electric':'Elétrico','manual':'Manual','usb':'USB',
  'adult':'Adulto','children':'Crianças','kids':'Infantil',
  'unisex':'Unissex','male':'Masculino','female':'Feminino',
  'round':'Redondo','square':'Quadrado','rectangular':'Retangular'
 };
 function isPortuguese(raw){
  return /[áàâãéêíóôõúç]/i.test(raw)||
   /\b(?:da|do|das|dos|de|para|com|sem|até|em|por|apenas|produto|modelo|tamanho|altura|largura|comprimento|peso|idade|origem|fabricação|fabricacao|quantidade|capacidade|cor|marca|material|voltagem|garantia|medidas|peças|pecas)\b/i.test(raw);
 }
 function attribute(raw,id){
  const original=String(raw??'').trim();if(!original)return id?'Atributo Shopee nº '+id:'Atributo da Shopee';
  const key=normalize(original);
  if(names[key])return names[key];
  if(isPortuguese(original))return original;
  if(/^dimension(?:s)?\s*\(/i.test(original))return 'Dimensões do produto';
  if(/^battery\s/i.test(original))return 'Informações da bateria';
  if(/^warranty\s/i.test(original))return 'Informações da garantia';
  if(/^product\s/i.test(original))return 'Informações do produto';
  if(/^package\s/i.test(original))return 'Informações da embalagem';
  // Não inventar tradução de atributo desconhecido, nem expor rótulos em inglês.
  return id?'Atributo da categoria nº '+id:'Outro atributo da categoria';
 }
 function value(raw,id){
  const original=String(raw??'').trim();if(!original)return '';
  const key=normalize(original);
  if(values[key])return values[key];
  const years=key.match(/^(\d{1,2})\s*(?:years?|yrs?)\s*(?:old\s*)?and\s+(?:above|up|over)$/)||
   key.match(/^(\d{1,2})\+\s*(?:years?|yrs?)$/);
  if(years)return 'A partir de '+Number(years[1])+' anos';
  const bands=key.match(/^(\d{1,2})\s*[-–]\s*(\d{1,2})\s*(years?|months?)$/);
  if(bands)return bands[1]+' a '+bands[2]+' '+(bands[3].startsWith('month')?'meses':'anos');
  if(/^\d+(?:[.,]\d+)?(?:\s*(?:ml|l|g|kg|cm|mm|m|w|v|hz|mah))?$/i.test(original))return original;
  // Nomes comerciais, marcas, códigos e textos já em português não são modificados.
  if(isPortuguese(original)||/^[A-Z0-9][A-Z0-9._/+ -]*$/.test(original))return original;
  // Não apresentar uma opção inglesa desconhecida como se fosse traduzida.
  if(/\b(?:with|without|not|and|for|per|year|years|months|battery|powered|electric|warranty|made|steel|wooden|plastic|color|colour|size|type|piece|pieces)\b/i.test(original))
   return id&&Number(id)>0?'Opção oficial nº '+id+' (conferir na Shopee)':'Opção oficial para conferir';
  return original;
 }
 root.RATechnicalPT=Object.freeze({attribute,value});
})(globalThis);
