// Publicação nativa de Kit Formal da Shopee. Sem inteligência artificial paga.
// Construir requisição somente depois de resolver componentes Shopee e logística.
import crypto from 'node:crypto';
const id=x=>/^[1-9]\d{0,17}$/.test(String(x))&&Number.isSafeInteger(Number(x));
const amount=x=>Number.isFinite(Number(x))&&Number(x)>0&&Number(x)<=100000;
export function kitPublishFields(input,kit){
 const title=String(input?.title||'').trim();
 const description=String(input?.description||'').trim();
 if(title.length<10||title.length>120)throw Error('Nome do kit deve ter 10 a 120 caracteres.');
 if(description.length<80||description.length>5000)throw Error('Descrição deve ter 80 a 5000 caracteres.');
 if(!kit||!Array.isArray(kit.components)||kit.components.length<2||kit.components.length>3)
  throw Error('Composição do kit inválida.');
 const selected=kit.components.map(x=>String(x.sku));
 const mainSku=String(input?.mainSku||'');
 if(!selected.includes(mainSku))throw Error('Selecione um SKU principal entre os componentes.');
 const weight=Number(input?.weightKg);
 if(!Number.isFinite(weight)||weight<=0||weight>30)
  throw Error('Informe o peso total da embalagem em kg, medido para o kit completo.');
 const dimensions=['lengthCm','widthCm','heightCm'].map(k=>Number(input?.[k]));
 if(dimensions.some(x=>!Number.isInteger(x)||x<=0||x>200))
  throw Error('Informe comprimento, largura e altura reais da embalagem do kit (cm).');
 const logisticId=input?.logisticId;
 if(!id(logisticId))throw Error('Selecione um canal de envio válido da Shopee.');
 const photoIds=input?.imageIds;
 if(!Array.isArray(photoIds)||photoIds.length<1||photoIds.length>9||
   photoIds.some(x=>typeof x!=='string'||!/^[-_\w]{12,180}$/.test(x))||
   new Set(photoIds).size!==photoIds.length)
  throw Error('Envie de 1 a 9 imagens aprovadas do kit à mídia Shopee.');
 if(input?.photosReviewed!==true||input?.contentsReviewed!==true)
  throw Error('Confira os produtos de TODAS as imagens e a composição antes de publicar.');
 if(input?.singleParcelConfirmed!==true)
  throw Error('Confirme que todos os itens serão enviados juntos no mesmo pacote, com logística compatível com a WeDrop.');
 const days=Number(input?.daysToShip);
 const preorder=input?.preOrder===true;
 if(preorder&&(!Number.isInteger(days)||days<3||days>30))
  throw Error('Pré-encomenda exige dias para envio permitidos pela Shopee.');
 return {title,description,mainSku,weight,dimensions,logisticId:Number(logisticId),
  photoIds,preorder,days:preorder?days:null,
  syncDts:input?.autoSyncDts===true,contentsReviewed:true,photosReviewed:true,
  singleParcelConfirmed:true};
}
export function kitPublishPayload(kit,fields,linked,{maxTitleLength=120,videoUploadId=null}={}){
 if(fields.title.length>maxTitleLength)
  throw Error('O título excede o limite da categoria consultado na Shopee.');
 if(!Array.isArray(linked)||linked.length!==kit.components.length)
  throw Error('Os componentes precisam ter vínculos confirmados na Shopee.');
 const bySupplier=new Map(linked.map(x=>[String(x.supplierSku),x]));
 if(bySupplier.size!==linked.length)throw Error('Vínculos de SKUs duplicados.');
 const component_list=kit.components.map(x=>{
  const live=bySupplier.get(String(x.sku));
  if(!live||!id(live.itemId)||!Number.isSafeInteger(Number(live.modelId))||
    Number(live.modelId)<0||String(live.status)!=='NORMAL')
   throw Error('SKU '+x.sku+' sem anúncio ativo/variação confirmada na Shopee.');
  const component={component_item_id:Number(live.itemId),quantity:1,
   main_component:x.sku===fields.mainSku};
  if(Number(live.modelId)>0)component.component_model_id=Number(live.modelId);
  return component;
 });
 if(component_list.filter(x=>x.main_component).length!==1)
  throw Error('Exatamente um componente principal é obrigatório.');
 const ids=new Set(component_list.map(x=>x.component_item_id+':'+(x.component_model_id||0)));
 if(ids.size!==component_list.length)throw Error('Kit com componentes duplicados na Shopee.');
 if(!amount(kit.quote?.grossPrice))throw Error('Preço bruto inválido.');
 return {
  sync_setting:{auto_sync_dts:fields.syncDts},
  item_setting:{
   item_name:fields.title,item_sku:kit.kitSku,
   description_type:'normal',description:fields.description,
   images:{image_id_list:fields.photoIds},
   ...(videoUploadId?{video_upload_id:[videoUploadId]}:{}),
   weight:fields.weight,
   dimension:{package_length:fields.dimensions[0],
    package_width:fields.dimensions[1],package_height:fields.dimensions[2]},
   logistic_info:[{logistic_id:fields.logisticId,enabled:true}],
   pre_order:fields.preorder?{is_pre_order:true,days_to_ship:fields.days}:{is_pre_order:false},
   unlisted:false,
   model_list:[{tier_index:[0],model_sku:kit.kitSku,
    original_price:Number(kit.quote.grossPrice),component_list}],
   tier_variation_list:[{name:'Composição',option_list:[{option:'Kit completo'}]}]
  }
 };
}
export function kitApprovalFingerprint(kit,fields,linked){
 const approved={sku:kit.kitSku,components:kit.components.map(x=>x.sku),gross:kit.quote.grossPrice,
  margin:kit.quote.targetMarginPct,fields,linked};
 return crypto.createHash('sha256').update(JSON.stringify(approved)).digest('hex');
}
export function validatePublishedKitResponse(data){
 const number=Number(data?.response?.item_id);
 if(!Number.isSafeInteger(number)||number<=0)
  throw Error('A Shopee não confirmou o novo Item ID. Verifique o catálogo antes de tentar publicar novamente.');
 return String(number);
}
