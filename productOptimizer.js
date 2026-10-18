// Otimizador Shopee: apenas leitura, com esquema de atributos obtido da Shopee
// no momento da consulta. Não produz dados técnicos fictícios nem modifica anúncios.
import {validItemId} from './catalog.js';

const moneylessString=value=>String(value??'').trim();
const array=value=>Array.isArray(value)?value:[];
const numeric=value=>Number.isSafeInteger(Number(value))&&Number(value)>0;

export function validateSkuLookup(input){
  const value=moneylessString(input);
  if(!value||value.length>120||/[\x00-\x1F]/.test(value))
    throw Error('Informe o SKU exato da Shopee (até 120 caracteres).');
  return value;
}
// A API get_attribute_tree devolve response.list[{category_id, attribute_tree}].
 // As crianças da árvore dependem do value_id selecionado no atributo pai.
export function optimizerCategoryAttributes(item,attributesResponse){
  const categoryId=Number(item?.category_id);
  const response=attributesResponse?.response||{};
  const lists=Array.isArray(response.list)?response.list:null;
  const branch=lists?.find(x=>Number(x.category_id)===categoryId);
  const roots=lists?(branch?.attribute_tree):
    Array.isArray(response.attribute_list)?response.attribute_list:response.attribute_tree;
  if(!numeric(categoryId)||!Array.isArray(roots))
    throw Error('A Shopee não retornou a árvore de atributos da categoria '+categoryId+'.');
  const previous=new Map(array(item.attribute_list).map(x=>[Number(x.attribute_id),x]));
  const nodes=new Map();
  function visit(children,active=true,parentId=null){
    for(const meta of array(children)){
      if(!numeric(meta?.attribute_id))continue;
      const id=Number(meta.attribute_id);
      const present=nodes.get(id);
      const conditional=!active;
      if(!present||(!conditional&&present.conditional)){
        nodes.set(id,{...meta,conditional,parentId});
      }
      const selected=new Set(array(previous.get(id)?.attribute_value_list)
        .map(x=>Number(x.value_id)).filter(x=>x>0));
      for(const option of array(meta.attribute_value_list)){
        const grandchildren=array(option.child_attribute_list);
        if(!grandchildren.length)continue;
        visit(grandchildren,active&&selected.has(Number(option.value_id)),id);
      }
    }
  }
  visit(roots);
  return [...nodes.values()];
}
export function normalizeAttributeAudit(item,attributesResponse){
  const categoryId=Number(item?.category_id);
  const attrs=optimizerCategoryAttributes(item,attributesResponse);
  const existing=new Map(array(item.attribute_list).map(x=>[String(x.attribute_id),x]));
  const rows=attrs.map(meta=>{
    const id=Number(meta.attribute_id);
    if(!numeric(id))return null;
    const recorded=existing.get(String(id));
    const values=array(recorded?.attribute_value_list);
    const declared=array(meta.attribute_value_list);
    const options=declared.map(v=>({
      id:Number(v.value_id||0),
      name:moneylessString(v.name||v.original_value_name),
      unit:moneylessString(v.value_unit)
    }));
    const name=moneylessString(meta.name||meta.attribute_name)||'Atributo '+id;
    const info=meta.attribute_info||{};
    const mandatory=Boolean(meta.mandatory??meta.is_mandatory);
    const conditional=Boolean(meta.conditional);
    const complete=values.some(v=>
      (Number(v.value_id)>0)||Boolean(moneylessString(v.original_value_name))
    );
    const missingUnit=complete&&Number(info.format_type)===2&&
      values.some(v=>(Number(v.value_id)===0)&&
        moneylessString(v.original_value_name)&&!moneylessString(v.value_unit));
    const suspicious=values.some(v=>{
      const value=moneylessString(v.original_value_name);
      return /^0(?:[.,]0+)?(?:\s*(?:mah|w|v|g|kg))?$/i.test(value);
    });
    const longDimension=/(dimens|medida|altura|comprimento|largura)/i.test(name)&&
      values.some(v=>moneylessString(v.original_value_name).length>65);
    const usbMismatch=/plug|tomada/i.test(name)&&
      /usb|recarregável/i.test(moneylessString(item.item_name))&&
      values.some(v=>/europe|europeu|europ|uk|britânico|americano/i.test(moneylessString(v.original_value_name)));
    const issues=[
      ...(missingUnit?['Unidade exigida pela API não está preenchida']:[]),
      ...(suspicious?['Valor zero suspeito: confirmar em documentação do fabricante']:[]),
      ...(longDimension?['Dimensões com texto extenso: separar medidas e unidades']:[]),
      ...(usbMismatch?['Tipo de plugue possivelmente incompatível: confirmar se acompanha carregador AC']:[])
    ];
    const state=conditional?'conditional':!complete?'missing':issues.length?'review':'filled';
    return {id,name,mandatory,conditional,parentId:meta.parentId||null,state,issues,inputType:info.input_type??null,
      formatType:info.format_type??null,validationType:info.input_validation_type??null,maxValues:info.max_value_count??null,
      supportSearch:Boolean(info.support_search_value),allowedUnits:array(info.attribute_unit_list),
      values:values.map(v=>({
        valueId:Number(v.value_id||0),
        name:moneylessString(v.original_value_name)||
          moneylessString(declared.find(x=>Number(x.value_id)===Number(v.value_id))?.name),
        unit:moneylessString(v.value_unit)
      })),options,optionsTruncated:false};
  }).filter(Boolean);
  const seen=new Set(rows.map(x=>x.id));
  const legacy=array(item.attribute_list)
    .filter(x=>numeric(x.attribute_id)&&!seen.has(Number(x.attribute_id)))
    .map(x=>({id:Number(x.attribute_id),name:'Atributo existente fora da árvore retornada',mandatory:false,
      state:'review',issues:['A categoria atual não retornou esse atributo; revisar migração de categoria'],
      inputType:null,formatType:null,maxValues:null,supportSearch:false,
      allowedUnits:[],values:array(x.attribute_value_list).map(v=>({
        valueId:Number(v.value_id||0),name:moneylessString(v.original_value_name),
        unit:moneylessString(v.value_unit)
      })),options:[],optionsTruncated:false}));
  rows.push(...legacy);
  const audit={
    categoryId,checkedAt:new Date().toISOString(),
    total:rows.length,mandatory:rows.filter(x=>x.mandatory&&!x.conditional).length,
    missingMandatory:rows.filter(x=>x.mandatory&&x.state==='missing').length,
    review:rows.filter(x=>x.state==='review').length,
    optionalEmpty:rows.filter(x=>!x.mandatory&&x.state==='missing').length,
    // Somente API valida a estrutura. Nem atributos preenchidos garantem veracidade factual.
    technicalAccuracyConfirmed:false,
    attributes:rows,
    note:'Esquema e opções consultados da Shopee. Medidas, bateria, potência e certificações precisam de fonte do fabricante/WeDrop e validação humana. O produto NÃO foi alterado.'
  };
  // Retained for server-side revalidation of dependent attributes, not sent to clients.
  Object.defineProperty(audit,'schema',{value:attributesResponse,enumerable:false});
  return audit;
}
export function normalizeOptimizerItem(base,models,attributes){
  const id=validItemId(base?.item_id);
  const media=base.image||{};
  const ids=array(media.image_id_list).map(String).filter(Boolean);
  const urls=array(media.image_url_list).filter(v=>typeof v==='string'&&/^https:\/\//i.test(v));
  const sku=moneylessString(base.item_sku);
  const variations=Array.isArray(models?.response?.model)
    ?models.response.model.map(m=>({modelId:String(m.model_id||''),sku:moneylessString(m.model_sku),
      status:moneylessString(m.model_status)})):[];
  const variationTiers=array(models?.response?.tier_variation).slice(0,2).map(tier=>({
    name:moneylessString(tier.name).slice(0,80),
    options:array(tier.option_list).slice(0,20).map(option=>({
      name:moneylessString(option.option).slice(0,80),
      imageUrl:/^https:\/\//i.test(String(option.image?.image_url||''))?String(option.image.image_url):null,
      imageId:moneylessString(option.image?.image_id).slice(0,150)
    })).filter(x=>x.name)
  })).filter(x=>x.name);
  return {
    itemId:id,sku,title:moneylessString(base.item_name),
    status:moneylessString(base.item_status),categoryId:Number(base.category_id),condition:moneylessString(base.condition),
    hasModel:Boolean(base.has_model),models:variations,variationTiers,
    descriptionPresent:Boolean(moneylessString(base.description)),
    description:moneylessString(base.description),descriptionType:String(base.description_type||'normal'),
    promotion:Boolean(base.has_promotion),
    imageCount:Math.max(ids.length,urls.length),imageUrls:urls.slice(0,9),
    imageIds:ids.slice(0,9),
    videoStatus:(Array.isArray(base.video_info)?base.video_info.length>0:Boolean(base.video_info?.video_url))?'Shopee retornou metadados de vídeo — conferir processamento':
      'Não confirmado pela API de detalhes (não significa ausência de vídeo)',
    attributeAudit:attributes,
    steps:[
      {key:'images',name:'9 imagens do prompt',state:'waiting',reason:'Aguardando prompt, credenciais de geração e revisão das imagens'},
      {key:'video',name:'Vídeo',state:'waiting',reason:'Fonte autorizada ou arquivo manual; confirmar upload e processamento'},
      {key:'seo',name:'Título SEO',state:'waiting',reason:'Validar termos, emojis e limite real antes de gravar'},
      {key:'category',name:'Categoria e GTIN',state:'review',reason:'Conferir dados atuais e critérios da categoria'},
      {key:'technical',name:'Ficha técnica',state:attributes.missingMandatory||attributes.review?'review':'read',
        reason:attributes.missingMandatory+' obrigatórios ausentes, '+attributes.review+' atributos para revisar'},
      {key:'description',name:'Descrição e variações',state:'waiting',reason:'Conferir texto e modelo sem alterar estoque/preço'},
      {key:'fiscal',name:'Informações fiscais',state:'waiting',reason:'Preenchimento permitido somente com dados fiscais fornecidos e validados'}
    ]
  };
}
export async function auditShopeeItem(cfg,auth,callApi,itemId,{expectedSku='',expectedModelId=''}={}){
  const id=validItemId(itemId);
  const common={accessToken:auth.accessToken,shopId:auth.shopId};
  const data=await callApi(cfg,{path:'/api/v2/product/get_item_base_info',
    ...common,query:{item_id_list:id}});
  const item=array(data?.response?.item_list).find(x=>String(x.item_id)===id);
  if(!item)throw Error('A Shopee não retornou o anúncio para o Item ID informado.');
  const categoryId=Number(item.category_id);
  if(!numeric(categoryId))throw Error('Categoria não foi retornada pela Shopee; impossível validar atributos.');
  const tree=await callApi(cfg,{path:'/api/v2/product/get_attribute_tree',
    ...common,query:{category_id_list:String(categoryId),language:'pt-BR'}});
  const attributes=normalizeAttributeAudit(item,tree);
  let models=null,modelWarning=null;
  if(item.has_model){
    try{models=await callApi(cfg,{path:'/api/v2/product/get_model_list',
      ...common,query:{item_id:id}});}
    catch(e){modelWarning='Não foi possível conferir variações: '+String(e.message||e).slice(0,160);}
  }
  // Um SKU encontrado no cache pode ter sido editado manualmente na Shopee.
  // Conferimos sempre a correspondência AO VIVO antes de autorizar o fluxo.
  const checkedSku=String(expectedSku||'').trim();
  const checkedModel=String(expectedModelId||'').trim();
  if(checkedSku){
    const sameParent=String(item.item_sku||'').trim()===checkedSku;
    const listed=array(models?.response?.model).filter(x=>
      String(x.model_sku||'').trim()===checkedSku);
    if(checkedModel&&checkedModel!=='0'){
      if(!listed.some(x=>String(x.model_id)===checkedModel))
        throw Error('O SKU ou modelo deste anúncio mudou na Shopee. Atualize o catálogo e selecione novamente.');
    }else if(!sameParent){
      if(modelWarning)throw Error('O SKU pertence a uma variação, mas a Shopee não permitiu confirmar qual. Tente novamente.');
      if(listed.length!==1)throw Error('O SKU não corresponde de forma única às variações atuais. Atualize o catálogo e revise o cadastro.');
    }
    if(!sameParent&&!listed.length)
      throw Error('SKU informado não corresponde mais ao produto na Shopee. Nenhuma alteração foi feita.');
  }
  return {...normalizeOptimizerItem(item,models,attributes),sku:checkedSku||
    String(item.item_sku||'').trim(),selectedModelId:checkedModel||null,modelWarning};
}

