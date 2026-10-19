// Regra Shopee BR 20/10/2026: dados Anatel da árvore oficial por categoria.
// Não pressupõe que determinada categoria/produto contenha rádio e não homologa registros.
const list=x=>Array.isArray(x)?x:[];
const norm=x=>String(x??'').normalize('NFD').replace(/[\u0300-\u036f]/g,'')
 .toLowerCase().replace(/[^a-z0-9]+/g,' ').trim();
const isRadioQuestion=x=>{
 const n=norm(x);
 return n.includes('bluetooth')&&/\bwi fi\b/.test(n)&&
  (n.includes('radiofrequencia')||/\brf\b/.test(n));
};
const isAnatelNumber=x=>{
 const n=norm(x);
 return /\banatel\b/.test(n)&&/\b(numero|licenca|registro|homologacao)\b/.test(n);
};
function valueName(attribute,value){
 const option=list(attribute?.options).find(o=>Number(o.id)>0&&Number(o.id)===Number(value?.valueId));
 return String(option?.name||value?.name||'').trim();
}
function answerFor(attribute){
 const values=list(attribute?.values);
 if(values.length!==1)return '';
 const n=norm(valueName(attribute,values[0]));
 if(n==='sim')return 'sim';
 if(n==='nao')return 'nao';
 return '';
}
// Formato indicativo e conservador: não autentica nem consulta o certificado na Anatel.
// Não transformar textos como "não se aplica", códigos zerados ou nomes de produtos em números.
function plausibleRegistration(value){
 const raw=String(value||'').trim(),digits=raw.replace(/\D/g,'');
 return /^[\d .\/-]+$/.test(raw)&&digits.length>=7&&digits.length<=20&&!/^0+$/.test(digits);
}
export function inspectAnatelCompliance(audit){
 const attrs=list(audit?.attributes).filter(x=>!x.legacy);
 const parent=attrs.find(x=>isRadioQuestion(x.name));
 if(!parent)return {applicable:false,status:'nao-aplicavel',requiresAction:false,
  message:'Categoria sem o atributo de conectividade Anatel na árvore oficial consultada.'};
 const registration=attrs.find(x=>isAnatelNumber(x.name)&&Number(x.parentId)===Number(parent.id))
  ||attrs.find(x=>isAnatelNumber(x.name));
 const base={applicable:true,categoryId:Number(audit?.categoryId)||null,
  parentAttributeId:parent.id,registrationAttributeId:registration?.id||null};
 const decision=answerFor(parent);
 if(decision==='nao')return {...base,decision,status:'declarado-nao',requiresAction:false,
  message:'Conectividade declarada como NÃO. O número Anatel não é exigido por este atributo.'};
 if(decision!=='sim')return {...base,decision:null,status:'pendente-resposta',requiresAction:true,
  message:'Responda SIM ou NÃO usando uma opção oficial da Shopee e informe a fonte verificada do produto.'};
 const code=list(registration?.values).map(v=>valueName(registration,v))
  .find(v=>plausibleRegistration(v));
 if(code&&!registration?.conditional)return {...base,decision,status:'registro-informado',
  requiresAction:false,message:'Número Anatel informado. Confira o certificado e a correspondência exata do modelo na Anatel.'};
 return {...base,decision,status:'pendente-registro',requiresAction:true,
  message:registration
   ?'Produto declarado com Bluetooth, Wi-Fi ou RF. Informe o número Anatel válido do modelo e a fonte documental no atributo dependente.'
   :'Produto declarado com Bluetooth, Wi-Fi ou RF, mas a Shopee não retornou o campo dependente Anatel. Atualize a ficha e confira a árvore oficial.'};
}
export function assertAnatelCompliance(audit){
 const status=inspectAnatelCompliance(audit);
 if(status.requiresAction)throw Error('Motor Matriz — Anatel: '+status.message);
 return status;
}
