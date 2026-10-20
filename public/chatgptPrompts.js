// Montagem local dos roteiros ChatGPT por SKU. Sem chave API e sem conexão a contas pessoais.
// Cenas com enquadramentos e benefícios distintos; não repetir a fotografia em outro fundo.
export const CHATGPT_IMAGE_SCENES=Object.freeze([
 {label:'01 · Capa',guide:'FOTO HERÓI: plano 3/4 à altura do produto, ocupando 85 a 90% do quadro. Ambiente moderno limpo, foco integral no produto real, sem texto.'},
 {label:'02 · Em uso',guide:'PLANO ABERTO: pessoa usando o produto de maneira correta no ambiente cotidiano apropriado, interação plausível. Trocar cenário e distância da câmera; não repetir a capa.'},
 {label:'03 · Dimensões',guide:'VISTA TÉCNICA: vista frontal e perfil da própria peça. Cotas em centímetros SOMENTE se medidas do produto estiverem comprovadas no campo CARACTERÍSTICAS CONFIRMADAS. Sem medidas confirmadas: detalhes de proporção sem números, setas dimensionais nem comparação de escala enganosa.'},
 {label:'04 · Benefício principal',guide:'CENA DE BENEFÍCIO: destacar visualmente a função comprovada mais importante, com enquadramento lateral ou diagonal e cenário diferente das fotos 01 a 03.'},
 {label:'05 · Problema e solução',guide:'DÍPTICO NARRATIVO: antes/depois com uso realista do MESMO produto, sem repetir o enquadramento ou acrescentar acessórios que não existem.'},
 {label:'06 · Material e detalhes',guide:'MACRO: detalhes reais de estrutura, textura, material, encaixe ou acabamento visíveis na referência, com iluminação lateral. NÃO inventar certificações ou novas peças.'},
 {label:'07 · Praticidade no dia a dia',guide:'FOTO DE ESTILO DE VIDA: enquadramento amplo, ângulo de câmera novo, mostrar manuseio ou armazenamento realistas em ambiente diferente de 02 e 04.'},
 {label:'08 · Quebra de objeções',guide:'COMPOSIÇÃO EDITORIAL: três recortes reais do mesmo produto para responder dúvidas verificáveis como modo de uso, organização ou manutenção. Até três frases curtas em português e somente fatos confirmados.'},
 {label:'09 · Hero final',guide:'MOCKUP FOTORREALISTA: cenário publicitário premium com produto real em ângulo inédito; sem embalagem fictícia. Selos Compra Segura, Entrega Rápida, Produto em Estoque somente quando a loja confirmar expressamente as três condições.'}
]);
const CONSTRUCTOR_BACKPACK_SCENES=Object.freeze([
 {label:'01 · Capa',guide:'Capa: mochila construtor ORIGINAL fechada em primeiro plano 3/4, ocupando 85 a 90% da imagem, bancada infantil elegante e fundo desfocado. Sem criança, letreiro ou novas peças.'},
 {label:'02 · Oficina em ação',guide:'Cena aberta na sala de brincar: mostrar EXATAMENTE a mesma mochila na configuração oficina vista na referência, com criança em brincadeira simbólica supervisionada. Evitar repetir pose e cenário da capa.'},
 {label:'03 · Tamanho da mochila',guide:'Vista frontal e de perfil da mochila fechada, em ambiente claro e ângulo técnico. Desenhar altura/largura/profundidade em cm APENAS com valores EXPLÍCITOS e confirmados do produto; caso contrário mostrar proporções e detalhes sem cotas numéricas nem setas falsas.'},
 {label:'04 · Organização das ferramentas',guide:'Foto de cima (flat lay): mochila aberta e ferramentas ACESSÓRIOS EXISTENTES dispostos de modo organizado ao redor, somente peças visíveis na referência. Destacar organização visual sem inventar quantidades.'},
 {label:'05 · Guardar e transportar',guide:'Antes e depois realista em ambiente infantil: ferramentas de brinquedo originais em uso e depois guardadas na mesma mochila fechada. Distância média, duas cenas distintas, sem criar itens novos.'},
 {label:'06 · Encaixes e acabamento',guide:'Close macro da estrutura amarela/preta original, fechos, alças e encaixes que realmente aparecem nas fotos de referência. Destaque do material e acabamento sem atributos não comprovados.'},
 {label:'07 · Levar a brincadeira',guide:'Cena de estilo de vida distinta: mochila ORIGINAL fechada e carregada corretamente por criança em local seguro da casa, acompanhada por adulto; câmera lateral ampla; nenhuma ferramenta inventada.'},
 {label:'08 · Três benefícios visuais',guide:'Três recortes editoriais diferentes da mesma mochila real: usar como oficina, organizar ferramentas do kit e guardar na mochila. Legendas pequenas em português apenas se coerentes com a referência; nunca afirmar quantidade exata de peças.'},
 {label:'09 · Mockup premium',guide:'Imagem hero premium da mesma mochila 3 em 1, uma vista fechada em primeiro plano e a configuração oficina em segundo plano SOMENTE se fiel às fotografias originais; fundo sofisticado novo, sem embalagem inventada.'}
]);
function sceneSelection(title){
 return /mochila/i.test(title)&&/(construt|ferrament|oficina)/i.test(title)?CONSTRUCTOR_BACKPACK_SCENES:CHATGPT_IMAGE_SCENES;
}
const asText=(value,max=10000)=>String(value||'').normalize('NFC').slice(0,max);
const factsFrom=attributes=>(Array.isArray(attributes)?attributes:[]).filter(a=>a?.state==='filled'&&Array.isArray(a.values)&&a.values.length)
 .slice(0,20).map(a=>asText(a.name,80)+': '+a.values.map(v=>asText(v?.name,100)+(v?.unit?' '+asText(v.unit,20):'')).join(', '))
 .filter(x=>!x.endsWith(': ')).join('; ').slice(0,1600);
export function createChatGptPrompts({sku='',title='',masterPrompt='',imageNotes={},attributes=[],imageUrls=[]}={}){
 const original=(Array.isArray(imageUrls)?imageUrls:[]).find(x=>/^https:\/\//i.test(String(x||'')))||'';
 const header=[
  'PROJETO: REDE ACHADOS BR — NOVE IMAGENS DE UM ÚNICO ANÚNCIO SHOPEE',
  'SKU: '+asText(sku,120),
  'Produto: '+asText(title,260),
  'FOTO REAL OBRIGATÓRIA: use a foto original já anexada nesta conversa. Se ainda não houver referência visual acessível, anexe a foto original do anúncio antes de criar qualquer imagem. NÃO comece sem a referência visual.',
  original?'Foto original disponível no endereço (abra e anexe o arquivo, pois o ChatGPT pode não conseguir abrir o link): '+original:'Abra o anúncio Shopee, salve a foto original e anexe-a a esta conversa.',
  'REGRAS INEGOCIÁVEIS: preservar o MESMO produto fotografado, geometria, cores, marcas originais, número e forma de peças reais. Não inventar variantes, acessórios, funcionalidades, dados, certificações, selos de terceiros ou embalagem.',
  'DIVERSIDADE OBRIGATÓRIA: nove imagens VISUALMENTE DIFERENTES. Variar ambiente, ângulo, distância, ação, iluminação e propósito conforme a posição. Não entregar a mesma foto com apenas fundo ou zoom alterado; não repetir pose, montagem ou composição entre posições.',
  'Para cada posição, criar UMA IMAGEM INDIVIDUAL QUADRADA, com composição para 1200 × 1200 pixels, fotorrealista, iluminação de estúdio/ambiente profissional, sem marca d’água e sem preço.',
  'Se o ChatGPT entregar outra resolução quadrada, o Shopee Manager ajustará para 1200 × 1200 na importação.',
  'Imagens 01, 02, 04, 05, 06 e 07 sem textos decorativos. Textos apenas nas posições 03 (medidas confirmadas), 08 e 09 quando expressamente permitidos, discretos e em português correto.',
  'MEDIDAS DO PRODUTO: se houver conflito entre fontes, dados ausentes, valores 0 ou medidas possivelmente da embalagem, NÃO incluir números. Não inventar medida, seta ou proporção milimétrica. Nunca trocar altura, largura ou profundidade sem evidência.',
  'Características confirmadas: '+(factsFrom(attributes)||'Nenhuma especificação técnica confirmada; não mostrar valores ou características inventadas.'),
  'REGRAS MESTRAS DA LOJA (apenas o que não contradiz os fatos): '+(asText(masterPrompt,2200)||'Seguir os nove roteiros e a fidelidade ao produto.'),
  'ENTREGA: gerar nove arquivos individuais, nunca uma montagem 3x3. Nomear 01.png, 02.png, ... 09.png. Use somente fatos confirmados; omita especificações não essenciais que estiverem ausentes e continue. Interrompa apenas se a referência visual estiver inacessível ou ocorrer uma falha real da geração.',
 ].join('\n');
 const scenes=sceneSelection(asText(title,260));
 const prompts=scenes.map((scene,index)=>[
  header,
  'PRIORIDADE DESTA RESPOSTA: POSIÇÃO '+String(index+1).padStart(2,'0')+' DE 09. NÃO repetir a pose, cenário ou ângulo da posição anterior. Entregar exatamente UMA FOTO distinta da sequência.',
  scene.label+': '+scene.guide,
  'AJUSTE ESPECÍFICO: '+(asText(imageNotes?.[index+1],500)||'Nenhum.'),
  'Exiba a imagem gerada diretamente na conversa com a ferramenta nativa de imagens. Não entregue apenas um link de arquivo, um prompt ou uma resposta em texto. A extensão precisa receber o resultado visual desta posição antes de solicitar a próxima.'
 ].join('\n\n'));
 const batch=[header,
  'TAREFA AUTORIZADA: execute a sequência completa de 9 imagens agora, em nove chamadas sequenciais da ferramenta de imagens, uma imagem individual por chamada, mantendo o MESMO produto da foto original. Continue até a imagem 09 sem solicitar confirmação entre posições. Exiba cada resultado diretamente na conversa; não substitua a imagem por um link de download. Se houver uma falha real da ferramenta, informe exatamente a posição pendente e preserve o progresso.',
  ...scenes.map((scene,i)=>
   String(i+1).padStart(2,'0')+' / 09 — '+scene.label+': '+scene.guide+
   (imageNotes?.[i+1]?'\nAjuste: '+asText(imageNotes[i+1],500):'')),
  'Confira a coerência das nove fotos com a referência antes de entregá-las; evite qualquer afirmação que não esteja comprovada.'
 ].join('\n\n');
 return {batch,prompts,scenes,original};
}
export function assignChatGptFiles(files,{startSlot=1}={}){
 const incoming=Array.from(files||[]);
 if(incoming.length===0||incoming.length>9)throw Error('Selecione de 1 a 9 arquivos de imagem.');
 if(!Number.isInteger(Number(startSlot))||Number(startSlot)<1||Number(startSlot)>9)throw Error('Posição inicial inválida.');
 const parsed=incoming.map(file=>{
  const name=String(file.name||'');
  const match=name.match(/^(?:imagem|image|foto|chatgpt[-_ ]?image)?[-_ ]?0?([1-9])(?:[-_. ()]|$)/i);
  return {file,slot:match?Number(match[1]):null};
 });
 const found=parsed.filter(x=>x.slot!==null);
 if(found.length===incoming.length){
  const numbers=parsed.map(x=>x.slot);
  if(new Set(numbers).size!==numbers.length)throw Error('Há arquivos com posições repetidas. Renomeie para 01.png até 09.png.');
  return parsed.sort((a,b)=>a.slot-b.slot);
 }
 if(found.length>0)throw Error('Apenas parte dos arquivos tem numeração. Renomeie todos para 01.png, 02.png... ou remova a numeração de todos.');
 if(Number(startSlot)+incoming.length-1>9)throw Error('Os arquivos ultrapassam a posição 09.');
 return incoming.map((file,i)=>({file,slot:Number(startSlot)+i}));
}
