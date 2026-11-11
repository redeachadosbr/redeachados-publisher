// Publicação de anúncio comercial de kit WeDrop (produto normal / add_item).
// NÃO confundir com Kit Formal: complementos pertencem somente à WeDrop.
import {optimizerCategoryAttributes,officialAttributeName} from './productOptimizer.js';
const arr=x=>Array.isArray(x)?x:[];
const str=x=>String(x??'').trim();
const positive=x=>Number.isSafeInteger(Number(x))&&Number(x)>0;
const money=x=>Number(x);
export function commercialCategoryFields(tree,categoryId,selected=[]){
 const values=new Map(arr(selected).filter(x=>positive(x?.id)).map(x=>[Number(x.id),x]));
 const pseudo=arr(selected).filter(x=>positive(x?.id)).map(x=>({
  attribute_id:Number(x.id),attribute_value_list:[{
   value_id:Number(x.valueId||0),
   original_value_name:str(x.text),
   value_unit:str(x.unit)
  }]
 }));
 const nodes=optimizerCategoryAttributes({category_id:Number(categoryId),attribute_list:pseudo},tree);
 return nodes.filter(x=>!x.conditional).map(x=>{
  const info=x.attribute_info||{};
  return {id:Number(x.attribute_id),name:officialAttributeName(x)||'Atributo oficial '+x.attribute_id,
   mandatory:Boolean(x.mandatory??x.is_mandatory),
   inputType:Number(info.input_type||0),formatType:Number(info.format_type||0),
   units:arr(info.attribute_unit_list).map(str),
   options:arr(x.attribute_value_list).map(o=>({
    id:Number(o.value_id||0),name:officialAttributeName(o)||str(o.name||o.original_value_name),
    rawName:str(o.name||o.original_value_name),unit:str(o.value_unit)
   })).filter(o=>o.id>0),
   value:values.get(Number(x.attribute_id))||null};
 });
}
export function commercialAttributePayload(tree,categoryId,selected=[]){
 if(!Array.isArray(selected)||selected.length>50)throw Error('Atributos inválidos ou em quantidade excessiva.');
 const rows=commercialCategoryFields(tree,categoryId,selected),known=new Map(rows.map(x=>[x.id,x]));
 const seen=new Set(),out=[];
 for(const entry of selected){
  const id=Number(entry?.id);
  if(!positive(id)||seen.has(id)||!known.has(id))
   throw Error('Atributo não reconhecido na categoria oficial da Shopee.');
  seen.add(id);
  const meta=known.get(id),valueId=Number(entry?.valueId||0),text=str(entry?.text),unit=str(entry?.unit);
  if(!valueId&&!text)continue;
  if(text.length>250)throw Error('Texto do atributo '+meta.name+' é muito longo.');
  let value;
  if(valueId>0){
   const chosen=meta.options.find(x=>x.id===valueId);
   if(!chosen)throw Error('Opção não pertence ao atributo '+meta.name+'.');
   value={value_id:valueId,original_value_name:chosen.rawName||chosen.name};
   if(chosen.unit)value.value_unit=chosen.unit;
  }else{
   if(!text||((meta.options.length>0)&&![2,3,5].includes(meta.inputType)))
    throw Error('Selecione uma opção oficial para '+meta.name+'.');
   value={value_id:0,original_value_name:text};
   if(meta.formatType===2){
    if(!unit||!meta.units.includes(unit))throw Error('Selecione a unidade oficial de '+meta.name+'.');
    value.value_unit=unit;
   }
  }
  out.push({attribute_id:id,attribute_value_list:[value]});
 }
 const filled=new Set(out.map(x=>x.attribute_id));
 const missing=rows.filter(x=>x.mandatory&&!filled.has(x.id));
 if(missing.length)throw Error('Atributos obrigatórios da Shopee: '+missing.map(x=>x.name).join(', ')+'.');
 return out;
}
export function commercialKitFields(input,kit,allowedChannels=[],uploadedImageIds=[]){
 const parts=arr(kit?.components),skus=parts.map(p=>str(p.sku));
 if(parts.length<2||parts.length>4||new Set(skus).size!==parts.length)
  throw Error('Kit deve conter de 2 a 4 componentes distintos.');
 if(!skus.includes(str(input?.mainSku)))throw Error('A SKU principal deve pertencer ao kit salvo.');
 if(input?.categoryReviewed!==true||!positive(input?.categoryId))
  throw Error('Confirme a categoria oficial da Shopee para este kit.');
 const categoryId=Number(input.categoryId),title=str(input.title),description=str(input.description);
 if([...title].length<10||[...title].length>120||description.length<80||description.length>5000)
  throw Error('Título ou descrição incompletos para publicação.');
 if(skus.some(code=>code&&(title+'\n'+description).toLowerCase().includes(code.toLowerCase()))||
    /\bKIT-[A-Z0-9-]{4,}\b/i.test(title+'\n'+description))
  throw Error('Remova os códigos internos do título e da descrição.');
 if(title!==str(input?.title)||description!==str(input?.description))
  throw Error('Revise o texto comercial antes da publicação.');
 const logistics=Number(input.logisticId);
 if(!positive(logistics)||!arr(allowedChannels).some(x=>Number(x.id)===logistics))
  throw Error('Selecione um canal logístico habilitado na Shopee.');
 const weight=Number(input.weightKg),dimensions=['lengthCm','widthCm','heightCm'].map(k=>Number(input[k]));
 if(!Number.isFinite(weight)||weight<=0||weight>30||dimensions.some(n=>!Number.isSafeInteger(n)||n<1||n>200))
  throw Error('Confirme o peso e as dimensões reais do kit embalado.');
 if(input?.contentsReviewed!==true||input?.photosReviewed!==true||input?.singleParcelConfirmed!==true)
  throw Error('Confirme composição, fotografias e envio em um único pacote.');
 const images=arr(input.imageIds).map(str);
 if(images.length!==9||new Set(images).size!==9||
    images.some(id=>!uploadedImageIds.includes(id)))
  throw Error('As nove imagens devem estar confirmadas no MediaSpace Shopee.');
 if(!(money(kit?.quote?.grossPrice)>0))
  throw Error('Preço bruto do kit não confirmado na WeDrop.');
 return {categoryId,mainSku:str(input.mainSku),title,description,logistics,
  weight,dimensions,images,attributes:arr(input.attributes)};
}
export function commercialKitPayload(fields,kit,attributeList=[],videoUploadId=null){
 if(!kit.components?.some(p=>str(p.sku)===fields.mainSku))throw Error('A SKU principal não pertence ao kit.');
 return {
  category_id:fields.categoryId,
  item_name:fields.title,item_sku:fields.mainSku,
  description_type:'normal',description:fields.description,
  original_price:Number(kit.quote.grossPrice),
  // Disponibilidade WeDrop é binária: anunciar uma unidade do kit, nunca estoque ilimitado.
  normal_stock:1,
  condition:'NEW',item_status:'NORMAL',
  image:{image_id_list:fields.images},
  weight:fields.weight,
  dimension:{package_length:fields.dimensions[0],
   package_width:fields.dimensions[1],package_height:fields.dimensions[2]},
  logistic_info:[{logistic_id:fields.logistics,enabled:true}],
  pre_order:{is_pre_order:false},
  attribute_list:attributeList,
  ...(videoUploadId?{video_upload_id:[videoUploadId]}:{})
 };
}
