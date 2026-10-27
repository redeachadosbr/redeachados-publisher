// Prompt curto do ChatGPT Plus para kit: uso em ?prompt= e na área de transferência.
// NÃO utiliza API, não controla o chat externo, nem insere imagens no navegador.
const clean=(s,max=500)=>String(s||'').replace(/<[^>]*>/g,' ').replace(/\s+/g,' ').trim().slice(0,max);
export function buildKitPlusImageBrief(kit,{manualFacts={}}={}){
 const items=Array.isArray(kit?.components)?kit.components:[];
 if(items.length<2||items.length>3)throw Error('Selecione um kit com 2 ou 3 SKUs.');
 const allowed=new Set(items.map(x=>String(x.sku)));
 const details=items.map((part,index)=>{
  const sku=String(part.sku);
  const facts=allowed.has(sku)?clean(manualFacts?.[sku],300):'';
  return [
   'PRODUTO '+(index+1)+': SKU '+sku+' — '+clean(part.name,115)+'; 1 unidade.',
   'Foto WeDrop: '+(String(part.imageUrl||'').startsWith('https://')?part.imageUrl:'FOTO DE REFERÊNCIA DEVE SER ANEXADA'),
   'Descrição WeDrop: '+(clean(part.description,340)||'não informada'),
   'Medidas WeDrop: '+(clean(part.dimensions,90)||'não informadas'),
   'Texto adicional do vendedor (NÃO verificado): '+(facts||'nenhum')
  ].join('\n');
 }).join('\n\n');
 const stages=[
  '01 CAPA: todos os produtos juntos, 85–90% da área, fundo moderno, SEM texto.',
  '02 USO REAL: itens juntos em situação cotidiana coerente, frase curta se comprovada.',
  '03 ESPECIFICAÇÕES: todos juntos; dimensões por SKU somente se verificadas, nunca misturadas.',
  '04 BENEFÍCIOS: 2–3 frases discretas, apenas fatos verdadeiros.',
  '05 DOR E SOLUÇÃO: produtos juntos como solução coerente, uma frase curta.',
  '06 PERSUASÃO: destaque a combinação, uma frase breve.',
  '07 TRANSFORMAÇÃO: experiência realista, sem prometer efeitos não confirmados.',
  '08 QUEBRA DE OBJEÇÕES: 3 dúvidas com respostas objetivas comprovadas.',
  '09 MOCKUP: ambos juntos em fundo premium; selos Compra Segura, Entrega Rápida e Atendimento Online somente se verdadeiros.'
 ].join('\n');
 return [
  'REDE ACHADOS BR — COMANDO PARA GERAR IMAGENS NO CHATGPT PLUS.',
  'Crie 9 imagens INDIVIDUAIS, não mosaico, para UM kit com '+items.length+' produtos distintos. O formato de cada imagem é 1:1; preferencialmente 1200 × 1200 pixels.',
  'Atenção: esta é uma solicitação de GERAÇÃO DE IMAGEM, não de redação de prompts. Use o recurso de imagens.',
  'KIT: '+clean(kit.kitSku,110)+'.',
  details,
  'REGRA ABSOLUTA: em cada uma das 9 imagens, TODOS OS '+items.length+' SKUs devem aparecer JUNTOS na MESMA cena, fielmente às fotos originais. Jamais somente o produto principal. Nunca dividir os produtos em quadros separados; não inventar acessórios, funções, cores, quantidades ou medidas.',
  'FOTOS: utilize as imagens reais anexadas nesta conversa, correspondentes aos SKUs. URLs acima são apenas referências; se você não conseguir ver fielmente uma foto, solicite que eu a anexe antes de gerar. Não crie componentes aproximados sem referência.',
  'VISUAL: fotografia publicitária realista, fundo ambientado moderno HD, iluminação premium, diversidade de cenas e ângulos, pouco texto em português brasileiro. Sem preços, logotipos ou marca-d’água.',
  'AS NOVE IMAGENS DEVEM SEGUIR ESTA SEQUÊNCIA:',
  stages,
  'ENTREGA: 9 arquivos de imagem separados, com produtos completos nas nove artes. Se a interface gerar apenas uma imagem por mensagem, gere AGORA a IMAGEM 01 e depois continue sequencialmente quando eu solicitar “próxima imagem”. Não retorne apenas descrições ou prompts.',
  'Comece pela geração de imagens, respeitando a fidelidade dos produtos.'
 ].join('\n\n');
}
export function kitPlusPromptLink(prompt,max=8500){
 const full='https://chatgpt.com/?prompt='+encodeURIComponent(prompt);
 return full.length<=max?full:'https://chatgpt.com/';
}
