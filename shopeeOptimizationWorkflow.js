// Checklist de otimização Shopee por SKU (não publica nem altera anúncios).
export const STAGE_IDS=Object.freeze(['images','video','seo','technical','description','variants','fiscal','final']);
export const VARIATION_TYPES=Object.freeze(['Cor','Tamanho','Unidades por pacote','Modelo','Variação','Voltagem','Print','Quantidade']);
export function validateVariationConfig(input,reviewed=false){
 if(!input||typeof input!=='object'||Array.isArray(input)||typeof input.enabled!=='boolean')throw Error('Marque se o anúncio tem variações.');
 if(!input.enabled)return {enabled:false,type:'',values:[]};
 const type=String(input.type||'').trim();
 if(type&&!VARIATION_TYPES.includes(type))throw Error('Tipo de variação inválido.');
 const values=Array.isArray(input.values)?input.values:[];
 if(values.length>20)throw Error('Informe no máximo 20 opções de variação.');
 const cleaned=values.map(x=>String(x||'').normalize('NFC').trim()).filter(Boolean);
 if(cleaned.some(x=>[...x].length>60||/[\x00-\x1f]/.test(x))||new Set(cleaned.map(x=>x.toLocaleLowerCase('pt-BR'))).size!==cleaned.length)throw Error('As opções de variação devem ser válidas e não repetidas.');
 if(reviewed&&(!type||!cleaned.length))throw Error('Selecione o tipo e pelo menos uma opção da variação.');
 return {enabled:true,type,values:cleaned};
}
export function validateImageNotes(input){
 if(!input||typeof input!=='object'||Array.isArray(input))throw Error('Solicitações de imagem inválidas.');
 const entries=Object.entries(input);
 if(entries.length>9||entries.some(([k,v])=>!/^[1-9]$/.test(k)||typeof v!=='string'||[...v].length>500))throw Error('Informe instruções de até 500 caracteres por posição (1–9).');
 return Object.fromEntries(entries.map(([k,v])=>[k,v.trim()]));
}
export const normalizedTitle=value=>String(value||'').normalize('NFC').replace(/\s+/g,' ').trim();
export const safeTitle=value=>[...normalizedTitle(value)].slice(0,120).join('');
export const codePointCount=value=>[...String(value||'')].length;
// Dimensões compostas são detalhadas na ficha técnica, não usadas como preenchimento SEO.
// Capacidade (ex.: 210 litros) e tamanhos pesquisados individualmente seguem permitidos.
export const titleHasUnhelpfulDimensions=value=>/\b\d+(?:[.,]\d+)?\s*[x×]\s*\d+(?:[.,]\d+)?(?:\s*[x×]\s*\d+(?:[.,]\d+)?)?\s*(?:mm|cm|m)\b/i.test(normalizedTitle(value));
export function validateContentRules({title,description}){
 if(title!==undefined){
  if(codePointCount(normalizedTitle(title))!==120)throw Error('O título deve ter exatamente 120 caracteres, incluindo espaços e emojis, conforme as regras da loja.');
  if(titleHasUnhelpfulDimensions(title))throw Error('Não utilize sequência de medidas lineares no título SEO. Priorize palavras-chave pesquisáveis e deixe as dimensões na ficha técnica.');
 }
 if(description!==undefined){
  const text=String(description).replace(/\r\n?/g,'\n').normalize('NFC').trim(),count=codePointCount(text);
  if(count<1400||count>1440)throw Error('A descrição deve ter entre 1400 e 1440 caracteres, incluindo quebras de linha e emojis.');
  const headings=['Descrição do produto','Especificações do produto','Tabela de medidas','5 dúvidas frequentes','10 motivos para comprar agora'];
  const positions=headings.map(x=>text.toLocaleLowerCase('pt-BR').indexOf(x.toLocaleLowerCase('pt-BR')));
  if(positions.some((p,i)=>p<0||(i>0&&p<=positions[i-1])))throw Error('Use as cinco seções solicitadas, na ordem: descrição, especificações, medidas, 5 dúvidas e 10 motivos.');
  const numbered=part=>(part.match(/^\d{1,2}[.)]\s+.+$/gm)||[]);
  const questions=numbered(text.slice(positions[3],positions[4])),reasons=numbered(text.slice(positions[4]));
  if(questions.length!==5||reasons.length!==10)throw Error('Numere as 5 perguntas com respostas e os 10 motivos, um por linha.');
 }
}
export function descriptionDraft(record){
  if(record?.description)return String(record.description);
  return [safeTitle(record?.title)||'Produto da loja','',
    'Confira as fotografias e características informadas no anúncio para escolher a opção adequada.',
    'Antes da compra, verifique as medidas, o conteúdo da embalagem e as orientações de uso confirmadas pelo fabricante.',
    '','Dúvidas? Converse com nossa loja pelo chat da Shopee.'].join('\n');
}
export function buildStages(record,review={}){
  if(!record?.itemId||!record?.sku)throw Error('Auditoria válida de SKU obrigatória.');
  const a=record.attributeAudit||{},img=Number(record.imageCount)||0;
  const missing=Number(a.missingMandatory)||0,suspect=Number(a.review)||0;
  const optional=Array.isArray(a.attributes)?a.attributes.filter(x=>x.state==='missing'&&!x.mandatory).length:0;
  const hasVariants=review.variationConfig?.enabled??Boolean(record.hasModel);
  const stages=[
    {key:'images',name:'Imagens comerciais',detail:img+' de 9 imagens disponíveis. '+Math.max(0,9-img)+' posições a preparar/revisar. Não substituir fotos originais sem aprovação.',hint:'Uma imagem por vez (1200 × 1200), preservando exatamente o modelo das fotos originais, seguindo o prompt salvo.',blocking:img<9},
    {key:'video',name:'Vídeo do anúncio',detail:String(record.videoStatus||'Presença não confirmada')+'. Continue as outras etapas mesmo sem confirmação.',hint:'Confirmar Clip publicado/em revisão ou utilizar vídeo de fonte autorizada e upload manual. Não presumir ausência.',blocking:false},
    {key:'seo',name:'Título SEO',detail:'Título atual: '+(record.title||'Não informado')+'. Revise as versões A/B preparadas; o texto atual não é uma nova otimização.',hint:'Cada título A/B deve ter exatamente 120 caracteres com emojis e começar por termos que compradores digitam, sustentados por pesquisa de anúncios equivalentes. Priorize nome, tipo, público, capacidade e ocasião de uso conforme o produto. Evite sequências de dimensões em cm: deixe medidas na ficha/descrição. Não declare volumes de busca sem dados oficiais e não invente características.',blocking:!record.title},
    {key:'technical',name:'Ficha técnica',detail:(Number(a.total)||0)+' atributos: '+missing+' obrigatório(s) ausente(s), '+suspect+' para revisar, '+optional+' opcionais sem valor.',hint:'Zero obrigatórios ausentes não significa todos os dados corretos. Usar apenas opções da categoria e fontes comprovadas.',blocking:missing>0||suspect>0},
    {key:'description',name:'Descrição',detail:(record.descriptionPresent?'Descrição atual encontrada.':'Descrição não confirmada.')+' Revise a redação conforme as regras da loja.',hint:'Escreva de 1400 a 1440 caracteres e preserve as cinco seções: Descrição do produto; Especificações do produto; Tabela de medidas; 5 dúvidas frequentes; 10 motivos para comprar agora. Na apresentação, use dois parágrafos curtos separados por uma linha em branco, com até duas frases em cada. Distribua emojis relevantes entre a abertura, os subtítulos, benefícios e chamada final (aproximadamente 10 a 20 no texto), sem excesso visual; mantenha as listas numeradas legíveis. Não invente dados, certificações nem promessas.',blocking:false},
    {key:'variants',name:'Variações (opcional)',detail:hasVariants?'Defina o tipo e os valores das variações antes de revisar imagens individuais.':'Sem variações selecionadas; etapa dispensada.',hint:'Marque a opção Tem variações somente quando aplicável. Escolha o tipo sugerido pela Shopee e informe os valores reais (ex.: Azul e Verde). Cada variação exige uma foto fiel. Este cadastro é um rascunho; a criação de modelos na Shopee requer um fluxo de API específico e confirmação.',blocking:hasVariants&&!review?.stages?.variants?.reviewed},
    {key:'fiscal',name:'Informações fiscais',detail:'Dados fiscais dependem do produto e validação da contabilidade. Nenhuma nota ou cadastro fiscal alterado.',hint:'NCM, CFOP, origem e CSOSN devem ser verificados; não aplicar valores genéricos indiscriminadamente.',blocking:false},
    {key:'final',name:'Revisão e execução',detail:'Conferir todas as etapas e solicitar confirmação antes de qualquer alteração via API.',hint:'A execução salva progresso e confirma as alterações por nova leitura da Shopee.',blocking:true}
  ];
  return stages.map(s=>{const entry=review?.stages?.[s.key]||{},reviewed=entry.reviewed===true;
    const skipped=s.key==='variants'&&!hasVariants;
    return {...s,reviewed:skipped?false:reviewed,skipped,reviewedAt:reviewed?entry.reviewedAt||null:null,status:skipped?'skipped':reviewed?'reviewed':s.blocking?'attention':'pending'};
  });
}
export function validateReview(input){
  if(!input||typeof input!=='object'||Array.isArray(input))throw Error('Revisão inválida.');
  const stage=String(input.stage||'');
  if(!STAGE_IDS.includes(stage))throw Error('Etapa de otimização inválida.');
  if(typeof input.reviewed!=='boolean')throw Error('Informe a confirmação da revisão.');
  if(stage==='final'&&input.reviewed)throw Error('Este checklist não pode declarar execução/publicação concluída sem confirmação da API.');
  const title=input.title===undefined?undefined:normalizedTitle(input.title);
  const description=input.description===undefined?undefined:String(input.description||'').replace(/\r\n?/g,'\n').normalize('NFC').trim();
  if(title!==undefined&&!title)throw Error('Título vazio.');
  if(description!==undefined&&codePointCount(description)>3000)throw Error('Descrição excede 3000 caracteres.');
  if(input.reviewed&&stage==='seo')validateContentRules({title:title??''});
  if(input.reviewed&&stage==='description')validateContentRules({description:description??''});
  const variationConfig=stage==='variants'?validateVariationConfig(input.variationConfig,input.reviewed):undefined;
  const imageNotes=stage==='images'&&input.imageNotes!==undefined?validateImageNotes(input.imageNotes):undefined;
  return {stage,reviewed:input.reviewed,title,description,
    ...(variationConfig!==undefined?{variationConfig}:{}),
    ...(imageNotes!==undefined?{imageNotes}:{}),
    ...(stage==='technical'&&Array.isArray(input.attributes)?{attributes:input.attributes}:{}),
    ...(stage==='fiscal'&&input.tax?{tax:input.tax}:{})};
}

