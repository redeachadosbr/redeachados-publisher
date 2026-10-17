// Checklist de otimização Shopee por SKU (não publica nem altera anúncios).
export const STAGE_IDS=Object.freeze(['images','video','seo','category','technical','description','fiscal','pricing','final']);
export const safeTitle=value=>String(value||'').normalize('NFC').replace(/\s+/g,' ').trim().slice(0,120);
export function descriptionDraft(record){
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
  const stages=[
    {key:'images',name:'Imagens comerciais',detail:img+' de 9 imagens disponíveis. '+Math.max(0,9-img)+' posições a preparar/revisar. Não substituir fotos originais sem aprovação.',hint:'Uma imagem por vez (1200 × 1200), preservando exatamente o modelo das fotos originais, seguindo o prompt salvo.',blocking:img<9},
    {key:'video',name:'Vídeo do anúncio',detail:String(record.videoStatus||'Presença não confirmada')+'. Continue as outras etapas mesmo sem confirmação.',hint:'Confirmar Clip publicado/em revisão ou utilizar vídeo de fonte autorizada e upload manual. Não presumir ausência.',blocking:false},
    {key:'seo',name:'Título SEO',detail:'Título atual: '+(record.title||'Não informado')+'. Sugestão inicial editável sem alegações novas.',hint:'Até 120 caracteres. Usar palavras-chave comprovadas sem inventar dimensões, idade, material ou certificação.',blocking:!record.title},
    {key:'category',name:'Categoria e GTIN',detail:'Categoria Shopee: '+(record.categoryId||'não informada')+'. GTIN não confirmado nesta auditoria.',hint:'Validar categoria e EAN/GTIN com fonte oficial/fabricante. Não inventar valores.',blocking:!record.categoryId},
    {key:'technical',name:'Ficha técnica',detail:(Number(a.total)||0)+' atributos: '+missing+' obrigatório(s) ausente(s), '+suspect+' para revisar, '+optional+' opcionais sem valor.',hint:'Zero obrigatórios ausentes não significa todos os dados corretos. Usar apenas opções da categoria e fontes comprovadas.',blocking:missing>0||suspect>0},
    {key:'description',name:'Descrição e variações',detail:(record.descriptionPresent?'Descrição atual encontrada.':'Descrição não confirmada.')+' Minuta conservadora disponível para revisar.',hint:'Não adicionar medidas, conteúdo de kit ou funções sem confirmação; revisar variações sem alterar estoques.',blocking:false},
    {key:'fiscal',name:'Informações fiscais',detail:'Dados fiscais dependem do produto e validação da contabilidade. Nenhuma nota ou cadastro fiscal alterado.',hint:'NCM, CFOP, origem e CSOSN devem ser verificados; não aplicar valores genéricos indiscriminadamente.',blocking:false},
    {key:'pricing',name:'Preço e promoção',detail:'Usar o plano vinculado à mesma SKU, custo WeDrop atualizado e margem mínima protegida.',hint:'Conferir comissão, cupom e promoção vigente. Este checklist não altera preços na Shopee.',blocking:false},
    {key:'final',name:'Revisão e execução',detail:'Conferir todas as etapas e solicitar confirmação antes de qualquer alteração via API.',hint:'Este painel prepara e salva revisões; só a confirmação da API pode provar anúncio atualizado/publicado.',blocking:true}
  ];
  return stages.map(s=>{const entry=review?.stages?.[s.key]||{},reviewed=entry.reviewed===true;
    return {...s,reviewed,reviewedAt:reviewed?entry.reviewedAt||null:null,status:reviewed?'reviewed':s.blocking?'attention':'pending'};
  });
}
export function validateReview(input){
  if(!input||typeof input!=='object'||Array.isArray(input))throw Error('Revisão inválida.');
  const stage=String(input.stage||'');
  if(!STAGE_IDS.includes(stage))throw Error('Etapa de otimização inválida.');
  if(typeof input.reviewed!=='boolean')throw Error('Informe a confirmação da revisão.');
  if(stage==='final'&&input.reviewed)throw Error('Este checklist não pode declarar execução/publicação concluída sem confirmação da API.');
  const title=input.title===undefined?undefined:safeTitle(input.title);
  const description=input.description===undefined?undefined:String(input.description||'').trim();
  if(title!==undefined&&!title)throw Error('Título vazio.');
  if(description!==undefined&&description.length>3000)throw Error('Descrição excede 3000 caracteres.');
  return {stage,reviewed,title,description};
}
