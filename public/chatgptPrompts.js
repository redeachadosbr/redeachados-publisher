// Montagem local dos roteiros ChatGPT por SKU. Sem chave API e sem conexão a contas pessoais.
import {confirmedProductDimensionsFromWeDrop,confirmedProductSideFactsFromWeDrop} from './productDimensions.js';
import {imageScenePrompt} from './imageSceneDiversity.js?v=20261104-contextual-faq';
// Cenas com enquadramentos e benefícios distintos; não repetir a fotografia em outro fundo.
// As nove instruções autorizadas pelo vendedor — NÃO acrescentar texto,
// SKU, informações de catálogo, cabeçalho, notas, outro prompt ou rodapé.
// O formato 1200 x 1200 e os fatos WeDrop são tratados pelo Manager,
// fora do campo de mensagem do ChatGPT.
export const CHATGPT_IMAGE_SCENES=Object.freeze([
 {label:"01 · Capa",guide:"Imagem 01 — Capa: produto original ocupando aproximadamente 85% a 90% da imagem, fundo limpo e apresentação profissional. imagem com fundo ambientado"},
 {label:"02 · Uso real",guide:"Imagem 02 — Uso real: mostrar o produto em um ambiente cotidiano de utilização, com composição diferente da capa. imagem com fundo ambientado. FRASES CURTAS DE CONVERSÃO"},
 {label:"03 · Especificações",guide:"Imagem 03 — Mostrar o produto REAL inteiro e bem definido em perspectiva lateral ou três-quartos, fundo ambientado moderno, margens livres próximas ao seu contorno. Esta geração é uma BASE SEM texto: o Shopee Manager acrescentará as dimensões REAIS da SKU diretamente perto do produto em uma camada final de tipografia moderna fina, sem esconder a foto."},
 {label:"04 · Benefícios",guide:"Imagem 04 — Benefícios: fotografar a vantagem mais relevante e realmente verificável do produto. Criar UMA frase original e persuasiva de 4 a 8 palavras, ligada ao que está visível na foto, sem slogan genérico; tipografia sofisticada e discreta."},
 {label:"05 · Dor e solução",guide:"Imagem 05 — Dor e solução: fotografar uma situação concreta em que o produto ajuda o comprador. Criar UMA frase contextualizada e persuasiva de 4 a 8 palavras, sem inventar problema, recurso ou resultado."},
 {label:"06 · Persuasão",guide:"Imagem 06 — Persuasão: mostrar diferencial real e comprovado do produto em fotografia publicitária sofisticada. Criar UMA frase de 4 a 8 palavras que traduza esse diferencial em vantagem para o comprador; texto pequeno."},
 {label:"07 · Transformação",guide:"Imagem 07 — Transformação: experiência real usando o produto em ambiente diferente. Criar UMA frase de 4 a 8 palavras que faça o cliente imaginar o uso ou a conveniência real, sem prometer mudanças não comprovadas."},
 {label:"08 · Quebra de objeções",guide:"Imagem 08 — Quebra de objeções: produto protagonista em ambiente premium. Escrever 2 perguntas de clientes com respostas curtas, específicas e verdadeiras sobre o produto; se houver terceiro fato comprovado e espaço, permitir até 3 pares. Microtipografia moderna nas margens, duas linhas por par (Pergunta? / Resposta), sem prejudicar a foto."},
 {label:"09 · Mockup e confiança",guide:"Imagem 09 — Mockup e confiança: apresentar o produto em cenário profissional com os três selos da loja: Compra Segura, Entrega Rápida e Atendimento Online. imagem com fundo ambientado"}
]);
export function createChatGptPrompts({imageUrls=[],supplierSourceText='',title='',imageNotes={},imagePrompts={},masterPrompt=''}={}){
 const original=(Array.isArray(imageUrls)?imageUrls:[]).find(x=>/^https:\/\//i.test(String(x||'')))||'';
 const scenes=CHATGPT_IMAGE_SCENES;
 // Cada slot leva seu próprio roteiro visual. Funciona em chat novo ou no
 // mesmo chat, sem depender da memória das imagens geradas anteriormente.
 const prompts=scenes.map(({guide},i)=>{
  const slot=i+1;
  // Priorizar a orientação específica salva da SKU (antes ignorada pelo motor).
  const customized=String(imagePrompts?.[slot]||'').trim().slice(0,15000);
  const note=String(imageNotes?.[slot]||'').trim().slice(0,500);
  const storeRule=String(masterPrompt||'').trim().slice(0,4500);
  const mandatory=[
   'REGRA ATUAL DA REDE ACHADOS BR (prevalece sobre roteiros antigos e orientações gerais): imagem única 1200×1200, foto realista fiel ao produto original; fundo ambientado moderno, nítido e visível em HD, com luz, ângulo e ambiente diferentes em cada uma das 9 posições. Nunca repetir personagens, poses e composição.',
   'Produto prioritário, tipografia moderna, fina e sofisticada, área TOTAL de textos <=10% da foto, sem painéis, tarjas, números inventados ou títulos grandes. Imagens 04 a 07: apenas UMA frase elaborada de 4 a 8 palavras, escolhida conforme a cena e as vantagens reais; imagem 08: perguntas com respostas objetivas (não meras palavras soltas), até 3 pares muito discretos. Imagem 01 com produto 85%–90% e SEM textos; imagem 09 somente os três selos aprovados.'
  ].join('\n');
  return [
   customized||guide,
   imageScenePrompt({slot,title}),
   storeRule?'REGRAS DA LOJA (apenas se compatíveis com as instruções atuais): '+storeRule:'',
   note?'AJUSTE SALVO ESPECÍFICO DESTA IMAGEM: '+note:'',
   mandatory
  ].filter(Boolean).join('\n\n');
 });
 const dims=confirmedProductDimensionsFromWeDrop(supplierSourceText);
 const facts=confirmedProductSideFactsFromWeDrop(supplierSourceText);
 // A imagem gerada no ChatGPT deve ser uma BASE limpa: o Manager insere
 // SOMENTE os números exatos da WeDrop na imagem final. Não confiar em
 // letras/números que o modelo possa inventar, nem usar peso da caixa.
 prompts[2]=[
  scenes[2].guide,
  imageScenePrompt({slot:3,title}),
  'IMAGEM 03 — FOTOGRAFIA BASE SEM QUALQUER TEXTO.',
  'O gerador é responsável SOMENTE PELA FOTO AMBIENTADA do produto original. NENHUMA medida, número, palavra, letra, unidade, seta, ícone, régua, tabela, etiqueta, subtítulo, selo, painel lateral ou composição textual deve aparecer na imagem produzida.',
  'Não tente extrair nem apresentar dimensões da foto, da ficha técnica, de outro produto, de um brinquedo montado ou da embalagem. Não crie absolutamente nenhum detalhe gráfico técnico.',
  /pista|conjunto|kit/i.test(title)?'Esta SKU vende um CONJUNTO: mostrar o produto completo com os componentes reais da foto original. Não isolar apenas um caminhão se a referência mostrar pista, carrinho e personagem. Não inventar peças ou acessórios.':'',
  'Crie uma foto comercial limpa com produto fiel em destaque, ambiente moderno HD visível e espaço nas bordas para o Manager adicionar as informações verificadas DEPOIS.',
  // Não repassar os valores da WeDrop ao modelo de imagem: o próprio
  // modelo já gerou números conflitantes e o Manager desenhou outra camada.
  'ORDEM FINAL OBRIGATÓRIA DA IMAGEM 03: ENTREGAR SÓ FOTOGRAFIA, 100% SEM TEXTO. A camada de dimensões reais da própria SKU será desenhada PELO SHOPEE MANAGER após a geração, com medidas visíveis junto ao produto, linhas finas e fonte bonita, moderna e discreta. Não criar medidas por conta própria.'
 ].join('\\n\\n');

 return {batch:prompts[0],prompts,scenes,original,confirmedDimensions:dims};
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
