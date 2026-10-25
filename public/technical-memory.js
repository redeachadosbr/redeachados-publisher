/* Rede Achados BR — padrões de ficha técnica por loja e categoria.
 * Nunca reutilizar idade, origem, certificações, energia nem bateria de outra SKU.
 * Os padrões ficam neste navegador; revisão e publicação exigem confirmação. */
(function(root){
 'use strict';
 const KEY='ra-technical-seller-defaults-v1';
 const norm=x=>String(x??'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^a-z0-9]+/g,' ').trim();
 const kind=name=>{
  const n=norm(name);
  if(['condition','product condition','condicao do produto','estado do produto'].includes(n))return 'condition';
  if(['custom product','produto personalizado','customized product','personalizacao'].includes(n))return 'custom';
  if(['model name','product model','modelo do produto','nome do modelo'].includes(n))return 'model-name';
  return '';
 };
 const safe=(kind,value)=>{
  const v=norm(value);
  if(kind==='condition')return ['new','novo'].includes(v);
  if(kind==='custom')return ['no','nao'].includes(v);
  return false;
 };
 const read=()=>{try{const val=JSON.parse(localStorage.getItem(KEY)||'{}');return val&&typeof val==='object'?val:{};}catch{return {};}};
 const write=data=>{try{localStorage.setItem(KEY,JSON.stringify(data));return true;}catch{return false;}};
 function id(data,attr){
  if(!data?.shopId||!data?.categoryId||!Number.isFinite(Number(attr?.id)))return '';
  const type=kind(attr.name);
  if(!['condition','custom'].includes(type))return '';
  return [String(data.shopId),String(data.categoryId),String(attr.id),type].join(':');
 }
 function resolved(attr,val){
  if(!attr||!val)return null;
  const opt=(attr.options||[]).find(o=>norm(o.name)===norm(val.valueName)||
   Number(o.id)>0&&Number(o.id)===Number(val.valueId)&&norm(o.name)===norm(val.valueName));
  if(!opt||!Number.isSafeInteger(Number(opt.id))||Number(opt.id)<=0)return null;
  return {valueId:Number(opt.id),valueName:String(opt.name),unit:''};
 }
 function learn(data,attr,values,{explicit=false}={}){
  const k=id(data,attr),v=Array.isArray(values)&&values.length===1?values[0]:null;
  if(!k||!explicit||!v)return false;
  const option=(attr.options||[]).find(o=>Number(o.id)===Number(v.valueId));
  const type=kind(attr.name),label=String(option?.name||v.valueName||'').trim();
  if(!safe(type,label)||!resolved(attr,{...v,valueName:label}))return false;
  const now=read(),last=now[k];
  now[k]={valueId:Number(v.valueId),valueName:label,updatedAt:new Date().toISOString(),
   observations:Math.min(999,Number(last?.observations||0)+1)};
  if(Object.keys(now).length>100){
   const ranked=Object.keys(now).sort((a,b)=>String(now[b].updatedAt).localeCompare(String(now[a].updatedAt)));
   for(const key of ranked.slice(100))delete now[key];
  }
  return write(now);
 }
 function suggest(data,attr){
  if(attr?.mandatory||attr?.conditional||attr?.values?.length)return null;
  const k=id(data,attr),past=k?read()[k]:null;
  if(!past||!safe(kind(attr.name),past.valueName))return null;
  const value=resolved(attr,past);
  return value?{values:[value],evidence:'Padrão informado anteriormente pelo vendedor nesta categoria; revisar antes de publicar',learned:true}:null;
 }

 // Recuperar valores efetivamente existentes na Shopee, por SKU e atributo.
 // Não deduzir valores ausentes nem inventar IDs de opções de categoria.
 function liveDraft(attr){
  if(!attr||attr.conditional||attr.legacy||!Array.isArray(attr.values)||!attr.values.length)return null;
  const kind=Number(attr.inputType),custom=[2,3,5].includes(kind);
  const units=(attr.allowedUnits||[]).map(u=>typeof u==='string'?u:u?.unit||u?.name||'').filter(Boolean);
  const values=[];
  for(const row of attr.values){
   const id=Number(row?.valueId),name=String(row?.name||'').trim();
   let unit=String(row?.unit||'').trim();
   if(!Number.isSafeInteger(id)||id<0||!name)return null;
   const matchedUnit=units.find(u=>norm(u)===norm(unit));
   if(matchedUnit)unit=matchedUnit;
   if(id>0){
    let option=(attr.options||[]).find(o=>Number(o.id)===id);
    if(!option){
     // Um valor positivo devolvido no próprio anúncio pela API é oficial,
     // ainda que a árvore da categoria tenha omitido essa opção.
     option={id,name,unit};
     attr.options=[...(attr.options||[]),option];
    }
    values.push({valueId:id,valueName:String(option.name||name),unit:unit||String(option.unit||'')});
   }else if(custom){
    values.push({valueId:0,valueName:name,unit});
   }else return null;
  }
  return {values,evidence:'Valor já cadastrado na Shopee (API oficial); sem alteração automática',
   source:'shopee-live'};
 }
 function modelSuggestion(data,attr){
  if(kind(attr?.name)!=='model-name'||attr?.values?.length||attr?.conditional)return null;
  if(![2,3,5].includes(Number(attr.inputType)))return null;
  const name=String(data?.supplierProduct?.name||data?.productTitle||'').trim();
  if(!name||name.length>170||/^\d+$/.test(name))return null;
  return {values:[{valueId:0,valueName:name,unit:''}],
   evidence:'Nome comercial da ficha WeDrop desta SKU; confira a designação oficial do modelo',learned:false};
 }
 root.RATechnicalMemory={kind,learn,suggest,modelSuggestion,liveDraft};
})(globalThis);