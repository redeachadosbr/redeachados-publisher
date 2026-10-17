import crypto from 'node:crypto';
import {safeTitle} from './shopeeOptimizationWorkflow.js';

// Preparation is deterministic for one verified item/model/SKU. This module
// never calls Shopee, and never considers a reviewed checkbox a published item.
const normal=s=>String(s??'').replace(/\r\n?/g,'\n').trim();
export function compileShopeeExecutionPlan({shopId,itemId,modelId,sku,record,review,live}){
  const state=review||{},stages=state.stages||{};
  const title=safeTitle(state.draftTitle||'');
  const description=normal(state.draftDescription);
  const currentTitle=normal(live?.item_name),currentDescription=normal(live?.description);
  const currentType=String(live?.description_type||'normal').toLowerCase();
  const proposed={},blocked=[],warnings=[];
  if(record?.sku!==sku||String(record?.itemId)!==String(itemId)||
     String(record?.selectedModelId||'0')!==String(modelId))
    throw Error('Anúncio, modelo ou SKU diferente da auditoria atual.');
  if(!['NORMAL','UNLIST'].includes(String(record?.status)))blocked.push('Anúncio não está em estado editável confirmado.');
  if(stages.seo?.reviewed===true){
    if(!title||title.length>120)blocked.push('Título SEO revisado é inválido.');
    else if(title!==currentTitle)proposed.item_name=title;
  }else if(title&&title!==currentTitle)blocked.push('Revisar e registrar a etapa Título SEO antes de executar.');
  if(stages.description?.reviewed===true){
    if(currentType!=='normal')blocked.push('Descrição estendida da Shopee exige fluxo próprio; atualização bloqueada.');
    else if(description.length<60||description.length>3000)
      blocked.push('Descrição revisada deve ter entre 60 e 3000 caracteres.');
    else if(description!==currentDescription)proposed.description=description;
  }else if(description&&description!==currentDescription)blocked.push('Revisar e registrar Descrição e variações antes de executar.');
  if(Number(record?.imageCount)<9)warnings.push('Imagens: '+record.imageCount+'/9; faltam arquivos aprovados, geração e upload.');
  warnings.push('Vídeo: '+String(record?.videoStatus||'não verificado')+'. É necessário confirmar/upload autorizado.');
  if((record.attributeAudit?.missingMandatory||0)>0)warnings.push('Ficha técnica: atributos obrigatórios pendentes.');
  warnings.push('Categoria/GTIN e fiscal dependem de comprovação. Não serão enviados.');
  warnings.push('Preço, frete e promoção permanecem separados; descontos não serão enviados.');
  const canExecute=blocked.length===0&&Object.keys(proposed).length>0;
  const fingerprint=crypto.createHash('sha256').update(JSON.stringify({
    shopId:String(shopId),itemId:String(itemId),modelId:String(modelId),sku,
    from:{item_name:currentTitle,description:currentDescription,description_type:currentType},
    to:proposed
  })).digest('hex');
  return {planId:crypto.randomUUID(),shopId:Number(shopId),itemId:String(itemId),
    modelId:String(modelId),sku,original:{
      item_name:currentTitle,description:currentDescription,description_type:currentType
    },proposed,actions:Object.keys(proposed),blocked,warnings,canExecute,
    fingerprint,createdAt:new Date().toISOString(),marketplaceUpdated:false,
    requiresExplicitConfirmation:true,
    scope:'somente título/descrição revisados; mídias e demais etapas permanecem pendentes'};
}
export function confirmShopeeExecution(plan,{sku,confirmation}={}){
  if(!plan||!plan.canExecute||Object.keys(plan.proposed||{}).length===0)
    throw Error('Não existem alterações aprovadas e elegíveis para executar.');
  if(String(sku)!==plan.sku||String(confirmation)!=='EXECUTAR '+plan.sku)
    throw Error('Confirmação da SKU incorreta. Digite EXECUTAR '+plan.sku);
}
export function assertLiveShopeeUnchanged(plan,base){
  if(String(base?.item_id)!==String(plan.itemId))throw Error('Item ID divergente; execução cancelada.');
  if(normal(base.item_name)!==plan.original.item_name||
     normal(base.description)!==plan.original.description||
     String(base.description_type||'normal').toLowerCase()!==plan.original.description_type)
    throw Error('Anúncio alterado após preparação. Recalcule o plano antes de executar.');
}
export function verifyShopeeExecution(plan,item){
  return Object.entries(plan.proposed||{}).every(([key,value])=>normal(item?.[key])===normal(value));
}
