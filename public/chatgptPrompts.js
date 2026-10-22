// Montagem local dos roteiros ChatGPT por SKU. Sem chave API e sem conexão a contas pessoais.
// Cenas com enquadramentos e benefícios distintos; não repetir a fotografia em outro fundo.
export const CHATGPT_IMAGE_SCENES=Object.freeze([
 {label:'01 · Capa',guide:'CAPA: ambiente adequado à categoria, produto original em grande destaque ocupando 85% da composição. Sem texto; preservar o produto integralmente.'},
 {label:'02 · Dimensões',guide:'DIMENSÕES: fundo ambientado, vista 3D realista do produto original, com cotas e medidas NO PRODUTO apenas se confirmadas para o produto (nunca embalagem). Sem dados confiáveis: não inventar números nem setas com medidas.'},
 {label:'03 · Publicitária 3D anamórfica',guide:'PUBLICIDADE 3D ANAMÓRFICA: o produto original parece saltar literalmente para fora de painel, moldura ou estrutura cenográfica adequada ao produto; efeito impressionante de perspectiva sem modificar sua geometria.'},
 {label:'04 · Detalhes',guide:'DETALHES: fundo ambientado e closes precisos das características reais visíveis na referência, com legendas pequenas apenas se confirmadas.'},
 {label:'05 · Benefícios',guide:'BENEFÍCIOS: ambiente adequado, mostrar visualmente vantagens reais de compra, sem promessas, funcionalidades ou acessórios inventados.'},
 {label:'06 · Características',guide:'CARACTERÍSTICAS: ângulo novo, fundo ambientado, destacar recursos reais do produto e informações curtas discretas comprovadas.'},
 {label:'07 · Antes e depois',guide:'ANTES E DEPOIS: duas cenas contextuais mostrando a diferença plausível entre não ter o produto e tê-lo, mantendo a aparência do produto original na cena depois; sem resultados falsos.'},
 {label:'08 · Produto em uso',guide:'EM USO: contexto real do dia a dia com uso correto e seguro, produto original protagonista, ângulo e cena distintos da capa.'},
 {label:'09 · CTA',guide:'CHAMADA DE VENDA: ambiente adequado, produto original ocupa aproximadamente 85% da imagem, ângulo diferente da capa, texto curto em português sem preço nem urgência inventada.'}
]);
function sceneSelection(){ return CHATGPT_IMAGE_SCENES; }
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
  'Imagem 01 sem textos. Imagem 02: medidas confirmadas. Imagens 04, 05, 06 e 09: textos curtos e discretos somente se comprovados; os demais quadros sem textos decorativos. Sempre usar português correto.',
  'MEDIDAS DO PRODUTO: se houver conflito entre fontes, dados ausentes, valores 0 ou medidas possivelmente da embalagem, NÃO incluir números. Não inventar medida, seta ou proporção milimétrica. Nunca trocar altura, largura ou profundidade sem evidência.',
  'Características confirmadas: '+(factsFrom(attributes)||'Nenhuma especificação técnica confirmada; não mostrar valores ou características inventadas.'),
  'REGRAS MESTRAS DA LOJA (apenas o que não contradiz os fatos): '+(asText(masterPrompt,2200)||'Seguir os nove roteiros e a fidelidade ao produto.'),
  'ENTREGA: gerar nove arquivos individuais, nunca uma montagem 3x3. Nomear 01.png, 02.png, ... 09.png. Use somente fatos confirmados; omita especificações não essenciais que estiverem ausentes e continue. Interrompa apenas se a referência visual estiver inacessível ou ocorrer uma falha real da geração.',
 ].join('\n');
 const scenes=sceneSelection(asText(title,260));
 const prompts=scenes.map((scene,index)=>[
  header,
  'PRIORIDADE DESTA RESPOSTA: GERAR APENAS A IMAGEM '+String(index+1).padStart(2,'0')+' DE 09. NÃO repetir a pose, cenário ou ângulo da posição anterior. Entregar exatamente UMA FOTO distinta da sequência.',
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
