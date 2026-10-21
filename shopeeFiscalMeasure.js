// Sugestão de unidade de medida na migração fiscal; não constitui validação tributária.
const normalized=value=>String(value??'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase();
export function suggestFiscalMeasureUnit(title='',supplierTitle=''){
 const text=normalized([supplierTitle,title].filter(Boolean).join(' '));
 const kit=/\bkit\b|\bcombo\b/.test(text);
 const jogo=/\bjogo\b|\bconjunto\s+de\b/.test(text);
 if(kit&&jogo)return {unit:null,reason:'Ambiguidade entre KIT e JOGO; revisar composição na WeDrop.'};
 if(jogo)return {unit:'JOGO',reason:'Título identifica jogo/conjunto.'};
 if(kit)return {unit:'KIT',reason:'Título identifica kit/combo.'};
 return {unit:'UN',reason:'Produto individual; confirmar se o anúncio reúne múltiplas peças.'};
}
