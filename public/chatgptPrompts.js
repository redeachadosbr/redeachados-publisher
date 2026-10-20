// Montagem local dos roteiros ChatGPT por SKU. Sem chave API e sem conexão a contas pessoais.
export const CHATGPT_IMAGE_SCENES=Object.freeze([
 {label:'01 · Capa',guide:'Foto de capa limpa: o produto real ocupa aproximadamente 85% da cena, sobre superfície apropriada em ambiente moderno coerente, sem textos, sem preços, sem novo logotipo.'},
 {label:'02 · Dicas de uso',guide:'Mostrar o produto real em uso correto e fácil de compreender, com demonstração clara, realista e sem acessórios inventados.'},
 {label:'03 · Especificações',guide:'Mostrar visualmente até três características técnicas comprovadas pelos dados recebidos. Se medidas não estiverem confirmadas, não exibir números nem escalas.'},
 {label:'04 · Benefícios',guide:'Cena de uso real mostrando o principal benefício comprovável do produto, preservando design, cor e funcionalidades verdadeiras.'},
 {label:'05 · Dor e solução',guide:'Mostrar uma situação cotidiana de problema real e a solução plausível usando o produto, sem exageros ou benefícios não demonstrados.'},
 {label:'06 · Copy persuasiva',guide:'Destacar um diferencial real do produto com composição comercial elegante. Texto curtíssimo em português somente se for necessário e factual.'},
 {label:'07 · Transformação',guide:'Mostrar visualmente uma transformação possível a partir do uso correto. Se usar texto, no máximo uma frase curta em português, sem falsas promessas.'},
 {label:'08 · Três objeções',guide:'Responder a até três dúvidas comuns do comprador com elementos visuais e somente informações verificadas. Não inventar certificações, garantia, dimensões ou potência.'},
 {label:'09 · Mockup',guide:'Hero comercial com produto real e embalagem apenas se for fiel à referência; selos discretos Compra segura, Entrega rápida e Produto em estoque somente se essas condições foram confirmadas pela loja.'}
]);
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
  'REGRAS INEGOCIÁVEIS: manter exatamente o mesmo produto, geometria, cores, marcas existentes, acabamento, quantidade e peças. Não inventar variantes, acessórios, medidas, embalagem, funcionalidades nem logotipos.',
  'Para cada posição, criar UMA IMAGEM INDIVIDUAL QUADRADA, com composição para 1200 × 1200 pixels, fotorrealista, iluminação de estúdio/ambiente profissional, sem marca d’água e sem preço.',
  'Se o ChatGPT entregar outra resolução quadrada, o Shopee Manager ajustará para 1200 × 1200 na importação.',
  'Sem textos decorativos nas imagens. Textos só nos slots em que o roteiro expressamente permite, curtos, corretos e em português.',
  'Características confirmadas: '+(factsFrom(attributes)||'Nenhuma especificação técnica confirmada; não mostrar valores ou características inventadas.'),
  'REGRAS MESTRAS DA LOJA: '+(asText(masterPrompt,10000)||'Seguir os nove roteiros e a fidelidade ao produto.'),
  'ENTREGA: gerar nove arquivos individuais, nunca uma montagem 3x3. Nomear 01.png, 02.png, ... 09.png. Use somente fatos confirmados; omita especificações não essenciais que estiverem ausentes e continue. Interrompa apenas se a referência visual estiver inacessível ou ocorrer uma falha real da geração.',
 ].join('\n');
 const prompts=CHATGPT_IMAGE_SCENES.map((scene,index)=>[
  header,
  'GERAR APENAS A IMAGEM '+String(index+1).padStart(2,'0')+' DE 09.',
  scene.label+': '+scene.guide,
  'AJUSTE ESPECÍFICO: '+(asText(imageNotes?.[index+1],500)||'Nenhum.'),
  'Exiba a imagem gerada diretamente na conversa com a ferramenta nativa de imagens. Não entregue apenas um link de arquivo, um prompt ou uma resposta em texto. A extensão precisa receber o resultado visual desta posição antes de solicitar a próxima.'
 ].join('\n\n'));
 const batch=[header,
  'TAREFA AUTORIZADA: execute a sequência completa de 9 imagens agora, em nove chamadas sequenciais da ferramenta de imagens, uma imagem individual por chamada, mantendo o MESMO produto da foto original. Continue até a imagem 09 sem solicitar confirmação entre posições. Exiba cada resultado diretamente na conversa; não substitua a imagem por um link de download. Se houver uma falha real da ferramenta, informe exatamente a posição pendente e preserve o progresso.',
  ...CHATGPT_IMAGE_SCENES.map((scene,i)=>
   String(i+1).padStart(2,'0')+' / 09 — '+scene.label+': '+scene.guide+
   (imageNotes?.[i+1]?'\nAjuste: '+asText(imageNotes[i+1],500):'')),
  'Confira a coerência das nove fotos com a referência antes de entregá-las; evite qualquer afirmação que não esteja comprovada.'
 ].join('\n\n');
 return {batch,prompts,scenes:CHATGPT_IMAGE_SCENES,original};
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
