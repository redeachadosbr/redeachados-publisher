// Contrato único da campanha premium de nove imagens da Rede Achados BR.
// Usado por ChatGPT/Ponte, API de imagens, gerador individual e kits WeDrop.
export const PREMIUM_NINE_IMAGE_TITLES=Object.freeze([
 '01 · Capa premium','02 · Uso real','03 · Dimensões','04 · Benefícios',
 '05 · Detalhes do produto','06 · Mockup da embalagem','07 · Informações técnicas',
 '08 · Quebra de objeções','09 · Confiança'
]);
export const PREMIUM_NINE_IMAGE_RULES=Object.freeze([
 'CAPA PREMIUM — Fotografia principal sem QUALQUER texto, preço, marca extra ou selo. Produto REAL inteiro ocupa 85% a 90% da área útil, sem distorção, num cenário real limpo e sofisticado. Fundo ambientado coerente com a categoria, iluminação comercial e ângulo 3/4. Protagonismo absoluto.',
 'USO REAL — Nova cena cotidiana, diferente da capa, mostrando a utilidade verdadeira do produto sem inventar funções ou acessórios incluídos. No máximo UMA frase autoral de conversão com 2 a 5 palavras, moderna, legível, pequena e fora do objeto.',
 'DIMENSÕES — ARTE FINAL COM COTAS EXATAS diretamente junto ao produto, somente quando os valores da MESMA SKU estiverem explicitamente confirmados nas informações WeDrop ou ficha do vendedor identificada como tal. Altura na vertical, comprimento no eixo longo e largura na profundidade, setas finas, números e unidades reais; não inverter eixos, não copiar medidas da embalagem, não duplicar anotações. Se não houver medidas, foto técnica limpa sem números inventados.',
 'BENEFÍCIOS — Produto inteiro e grande em foto ambientada. Exibir ATÉ 3 benefícios específicos e comprovados, preferencialmente 3 microfrases de 3 a 7 palavras em pequenas etiquetas elegantes nas margens, com linhas finas opcionais associadas a detalhes reais. Não esconder o produto; nunca inventar promessas.',
 'DETALHES DO PRODUTO — Foto macro editorial de um detalhe EXISTENTE: textura, material visível, acabamento, encaixe, mecanismo ou fecho real. Manter parte reconhecível do produto, sem mosaico. No máximo UMA microfrase descritiva discreta de 3 a 6 palavras, se comprovada. Não usar cena antiga de dor e solução nem texto de transformação.',
 'MOCKUP DA EMBALAGEM — Produto REAL em primeiro plano e caixa comercial 3D ao lado ou atrás em cenário sofisticado. Se houver foto REAL da embalagem WeDrop, reproduzi-la fielmente. Se não houver, usar embalagem CONCEITUAL ILUSTRATIVA, explicitamente identificada como "Mockup ilustrativo" de forma discreta, sem apresentar como embalagem oficial recebida. Não inventar logotipo, certificação, acessórios ou conteúdo. Exibir quantidade apenas se confirmada, sem sugerir kit de várias unidades.',
 'INFORMAÇÕES TÉCNICAS — Infográfico fotográfico premium: produto principal central e até 6 dados técnicos VERIFICADOS, com pequenas ampliações circulares de detalhes reais, conectores finos e etiquetas arredondadas, seguindo o padrão fornecido. Preferir material, quantidade, capacidade, potência, cor, composição e recursos existentes. Omitir dados ausentes; NÃO desenhar especificações falsas. Esta posição NÃO é transformação de uso.',
 'QUEBRA DE OBJEÇÕES — Exatamente 3 perguntas de compradores e suas 3 respostas específicas, curtas, em português BR, quando houver 3 fatos confiáveis para responder. Fotografia do produto na metade superior e três cartões horizontais compactos na metade inferior, com ícone pequeno, pergunta em negrito e resposta direta. NÃO criar respostas sem prova; se houver menos de três fatos verificáveis, sinalizar DADOS INSUFICIENTES para revisão e não aprovar como concluída. Não alegar recarga, compatibilidade, garantia ou idade sem cadastro.',
 'CONFIANÇA — Foto premium do produto real em cenário novo e três selos pequenos no rodapé, com os três textos exatos Compra Segura, Entrega Rápida e Atendimento Online, ícones discretos, acabamento elegante e harmonizado. Não inserir outros textos ou certificados. Exibir selos apenas conforme políticas reais da loja, sem prometer prazos de frete nem inventar certificações.'
]);
export function premiumNineImageRule(slot,{kit=false}={}){
 const n=Number(slot);
 if(!Number.isInteger(n)||n<1||n>9)throw Error('Posição de imagem inválida (01–09).');
 return [
  'PADRÃO ATUAL E OBRIGATÓRIO REDE ACHADOS BR — '+PREMIUM_NINE_IMAGE_TITLES[n-1]+'. PREVALECE sobre roteiros de séries antigas.',
  PREMIUM_NINE_IMAGE_RULES[n-1],
  'Usar a FOTO ORIGINAL da WeDrop como fonte de verdade visual. Usar apenas dados explícitos da mesma SKU como verdade técnica. Texto natural e elegante em português brasileiro; cores da tipografia harmonizadas à peça (não forçar azul para outros produtos). Imagem INDIVIDUAL 1:1 1200×1200, cenário premium. Textos pequenos (até 10% da composição) exceto a área informativa necessária para os cartões técnicos 07 e FAQ 08. Produto sempre visível, sem tarjas gigantes, colagem nem marcas novas.',
  kit?'KIT: TODOS os componentes efetivamente incluídos e presentes em TODAS as nove imagens; fotografias e medidas vinculadas a cada SKU sem misturas. Caixa conceitual da posição 06 não é uma unidade adicional do kit.':'ANÚNCIO UNITÁRIO: não mostrar produtos duplicados ou variações que insinuem várias unidades vendidas; usar somente variantes confirmadas.'
 ].join('\n');
}
