// Regras permanentes do Motor Matriz Shopee: independentes de produto, SKU e categoria.
// Sugestões WeDrop nunca autorizam publicações ou mudanças fiscais automaticamente.
// Motor Matriz: regras fixas da descrição para todas as SKUs.
export const REDE_ACHADOS_DESCRIPTION_RULES=Object.freeze({
 minChars:1400,maxChars:1440,cta:'🛒 Gostou? Adicione ao carrinho e aproveite!',
 sections:5,faqCount:5,reasonsCount:10,compactPreview:true
});
const normal=x=>String(x??'').trim();
const ncmPattern=/^\d{8}$/;
// Padrão de cadastro do vendedor Rede Achados BR, confirmado para seus anúncios
// Shopee. Não é um CST universal de NF-e; a contabilidade pode orientar
// exceções por SKU e o valor salvo/revisado da SKU tem precedência.
// Nunca aplicar esta regra para inferir CEST, CFOP ou NCM.
// CEST "00" é valor literal solicitado pela loja e pode ser enviado após autorização. Não presume enquadramento fiscal de 7 dígitos.
export const REDE_ACHADOS_FISCAL_DEFAULTS=Object.freeze({pis_cofins_cst:'99',cest:'00'});
export const isShopeeCestConfirmed=value=>/^\d{7}$/.test(String(value??'').trim());
export function fiscalStoreDefaults(fiscalNotes=''){
 const notes=normal(fiscalNotes);
 const approved=notes.match(/(?:PIS\s*(?:e|\/|&)\s*COFINS\s*CST|CST\s*PIS\s*(?:e|\/)\s*COFINS|PISCOFIS|PIS\s*COFINS)\s*:\s*(\d{2})\b/i)?.[1];
 return {pis_cofins_cst:approved||REDE_ACHADOS_FISCAL_DEFAULTS.pis_cofins_cst,
  cest:REDE_ACHADOS_FISCAL_DEFAULTS.cest};
}
export function fiscalMatrixSource({sku,supplier,tax,reviewSource=null}={}){
 const listingSku=normal(sku),supplierSku=normal(supplier?.supplier_sku);
 if(!listingSku)throw Error('Motor Matriz: SKU do anúncio não confirmada.');
 if(supplier){
  if(!supplierSku||(!['exact-sku','reviewed-link'].includes(supplier.matchedBy)))
   throw Error('Motor Matriz: correspondência WeDrop não revisada; confira o vínculo da SKU.');
  if(supplier.matchedBy==='exact-sku'&&supplierSku!==listingSku)
   throw Error('Motor Matriz: SKU do fornecedor diverge da SKU Shopee.');
 }
 const confirmed=normal(supplier?.product_data?.ncm);
 const chosen=normal(tax?.ncm);
 if(tax&&(!ncmPattern.test(chosen)))
  throw Error('Motor Matriz: NCM fiscal obrigatório com oito dígitos.');
 if(tax&&ncmPattern.test(confirmed)&&chosen!==confirmed)
  throw Error('Motor Matriz: NCM revisado diverge da ficha WeDrop da SKU '+listingSku+'. Confira o fornecedor antes de executar.');
 const proof=normal(tax?.evidence);
 if(tax&&!proof)throw Error('Motor Matriz: informe a fonte fiscal do NCM desta SKU.');
 if(tax&&!supplier&&/\bwedrop\b/i.test(proof))
  throw Error('Motor Matriz: a fonte WeDrop citada não está vinculada à SKU atual. Reimporte ou confirme o vínculo.');
 if(reviewSource&&tax){
  if(normal(reviewSource.sku)!==listingSku)
   throw Error('Motor Matriz: aprovação fiscal pertence a outra SKU.');
  if(reviewSource.supplierSku&&(!supplier||supplierSku!==normal(reviewSource.supplierSku)))
   throw Error('Motor Matriz: o vínculo WeDrop foi alterado após aprovação fiscal.');
  if(normal(reviewSource.ncm)!==chosen)
   throw Error('Motor Matriz: o NCM aprovado mudou. Refaça a revisão fiscal.');
 }
 return {sku:listingSku,ncm:chosen,supplierSku:supplierSku||null,
  source:supplier?.matchedBy||'manual-verified',file:supplier?.source_file||null};
}

// MOTOR MATRIZ — pesquisa de concorrentes para QUALQUER SKU Shopee.
// Somente ofertas reais com URL, preço e vendedor distintos autorizam uma média.
// Nunca salvar preço pesquisado como confirmado só porque há um título semelhante.
export const REDE_ACHADOS_MARKET_RULES=Object.freeze({
 minimumOffers:2,maximumOffers:5,maxQueries:5,apiPageLimit:50,
 distinctShops:true,excludeOwnShop:true,excludeAccessories:true,
 preserveModelSpecs:true,maxVariantPriceRatio:1.30,
 minimumPriceRatioToMedian:0.65,maximumPriceRatioToMedian:1.55,
 preserveDesiredMarginWithinMarketPct:2,
 autoPriceAndResearchOnSku:true,prepareDiscountDuringOptimization:true,
 publishDiscountOnlyAfterApproval:true
});
const marketNormal=x=>String(x??'').normalize('NFD').replace(/[\u0300-\u036f]/g,'')
 .toLowerCase().replace(/[^a-z0-9 ]+/g,' ').replace(/\s+/g,' ').trim();
const MARKET_FAMILIES=[
 {id:'mochila_construtor',detect:/\bmochila\b.*\b(construtor|ferramentas|oficina)\b|\b(construtor|ferramentas|oficina)\b.*\bmochila\b/,
  queries:['mochila construtor ferramentas','mochila ferramentas brinquedo','mochila bancada ferramentas infantil','maleta mochila ferramentas brinquedo']},
 {id:'passadeira_vapor',detect:/\b(passadeira|vaporizador)\b.*\bvapor\b|\bvapor\b.*\b(passadeira|vaporizador)\b/,
  queries:['passadeira a vapor portatil roupas','vaporizador de roupas portatil','steamer vaporizador roupas']},
 {id:'piscina_inflavel',detect:/\bpiscina\b.*\binflavel\b|\binflavel\b.*\bpiscina\b/,
  queries:['piscina inflavel infantil','piscina inflavel quadrada','piscina inflavel para criancas']},
 {id:'porta_shampoo',detect:/\bporta shampoo\b|\b(suporte|organizador)\b.*\b(shampoo|box)\b/,
  queries:['porta shampoo canto banheiro','organizador box banheiro','suporte shampoo banheiro']},
 {id:'garrafa_termica',detect:/\bgarrafa\b.*\btermica\b|\btermica\b.*\bgarrafa\b/,
  queries:['garrafa termica bebidas','garrafa termica portatil','garrafa termica inox']},
 {id:'cafeteira_italiana',detect:/\bcafeteira\b.*\bitaliana\b|\bitaliana\b.*\bcafeteira\b|\bcafeteira moka\b/,
  queries:['cafeteira italiana moka','cafeteira moka aluminio','cafeteira italiana cafe']},
 {id:'raquete_mosquito',detect:/\braquete\b.*\b(mosquito|mosquitos|insetos)\b|\b(mata mosquito|mata mosquitos)\b.*\braquete\b/,
  queries:['raquete mata mosquito eletrica','raquete eletrica insetos','raquete mata mosquitos']},
 {id:'lixeira_tela',detect:/\blixeira\b.*\b(tela|telada|metal|aramada)\b|\b(tela|telada|aramada)\b.*\blixeira\b/,
  queries:['lixeira telada metal','lixeira aramada escritorio','lixeira metal tela']},
 {id:'jogo_chaves',detect:/\b(jogo|kit|conjunto)\b.*\b(chaves|ferramentas)\b/,
  queries:['jogo chaves ferramentas','kit chaves maleta','jogo ferramentas chaves']},
 {id:'arvore_natal',detect:/\barvore\b.*\bnatal\b|\bnatal\b.*\barvore\b/,
  queries:['arvore natal decoracao','arvore natal verde','arvore natal galhos']},
 {id:'microfone_karaoke',detect:/\bmicrofone\b.*\b(karaoke|infantil|kids)\b/,
  queries:['microfone infantil karaoke','microfone karaoke brinquedo','microfone karaokê sem fio']},
 {id:'fogareiro',detect:/\bfogareiro\b/,
  queries:['fogareiro portatil','fogareiro camping','fogareiro gas']},
 {id:'pote_hermetico',detect:/\bpote\b.*\b(hermetico|vedacao)\b|\b(hermetico|vedacao)\b.*\bpote\b/,
  queries:['pote hermetico cozinha','pote vedacao alimentos','recipiente hermetico']},
 {id:'porta_temperos',detect:/\bporta temperos\b|\b(organizador|suporte)\b.*\btemperos\b/,
  queries:['porta temperos cozinha','organizador porta temperos','suporte potes temperos']},
 {id:'liquidificador_portatil',detect:/\bliquidificador\b.*\b(portatil|mini|usb)\b/,
  queries:['liquidificador portatil','mini liquidificador usb','liquidificador individual']},
 {id:'carrinho_compras',detect:/\bcarrinho\b.*\bcompras\b/,
  queries:['carrinho compras dobravel','carrinho de feira dobravel','carrinho mercado rodinhas']}
];
export function marketMatrixProfile(title){
 const normalized=marketNormal(title);
 const family=MARKET_FAMILIES.find(f=>f.detect.test(normalized));
 return {family:family?.id||'generic',queries:family?.queries||[],original:normalized};
}
export function marketMatrixSearchQueries(title,seed=''){
 const profile=marketMatrixProfile(title),base=marketNormal(seed||title);
 const words=base.split(' ').filter(x=>x.length>2);
 // Atributos comerciais principais da própria SKU entram nos termos de busca,
 // inclusive quando o título tem variações como "2,10m", "210L" e "40 peças".
 const raw=String(title||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase();
 const pieces=raw.match(/\b\d{1,4}\s*(?:pecas|pçs|pcs|galhos)\b/i)?.[0];
 const size=raw.match(/\b\d{1,2}[,.]\d{1,2}\s*m\b/i)?.[0]?.replace(',','.');
 const capacity=raw.match(/\b\d{2,5}\s*(?:ml|l|litros|litro)\b/i)?.[0];
 const power=raw.match(/\b\d{2,4}\s*w\b/i)?.[0];
 const voltage=raw.match(/\b(?:110|127|220|240)\s*v\b/i)?.[0];
 const storey=raw.match(/\b\d\s*(?:andares|andar|niveis)\b/i)?.[0];
 const profileCore=profile.queries[0]?.split(' ').filter(x=>x.length>2&&!['para','com','dos','das'].includes(x)).slice(0,2).join(' ');
 const anchor=profileCore||words.slice(0,2).join(' ');
 const details=[size,pieces,capacity,power&&voltage?power+' '+voltage:power,storey]
  .filter(Boolean).map(v=>anchor+' '+v);
 // Regra universal: sempre manter família e atributos, depois sinônimos,
 // sem exagerar o número de chamadas à API de afiliados.
 const generic=[words.slice(0,4).join(' '),words.slice(0,3).join(' '),
  words.slice(0,2).join(' '),words.slice(-3).join(' ')];
 const searchNormalize=value=>String(value??'').normalize('NFD').replace(/[\u0300-\u036f]/g,'')
  .toLowerCase().replace(/[^a-z0-9., ]+/g,' ').replace(/\s+/g,' ').trim();
 const terms=[...details,base,...profile.queries,...generic];
 return [...new Set(terms.map(searchNormalize).filter(x=>x.split(' ').length>=2))]
  .slice(0,REDE_ACHADOS_MARKET_RULES.maxQueries);
}
export function marketMatrixFamilyCompatible(source,candidate){
 const a=marketMatrixProfile(source),b=marketMatrixProfile(candidate);
 // Outro tipo reconhecido (ex. piscina vs garrafa) jamais entra na média.
 if(a.family!=='generic')return a.family===b.family;
 if(b.family!=='generic')return false;
 return null; // família genérica: usar palavras centrais e características.
}

// A Marca cadastrada é um atributo por categoria, nunca a condição NEW.
export function assertShopeeSupplierBrand({record,attributes=[],supplier}={}){
 const brand=normal(supplier?.product_data?.brand);
 if(!brand)return;
 const fmt=x=>String(x??'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().trim();
 const brandAttr=(record?.attributeAudit?.attributes||[]).find(x=>fmt(x.name)==='marca');
 if(!brandAttr)return;
 const saved=attributes.find(x=>Number(x.attributeId)===Number(brandAttr.id));
 const chosen=normal(saved?.values?.[0]?.valueName||brandAttr.values?.[0]?.name);
 if(chosen&&fmt(chosen)!==fmt(brand))
  throw Error('Motor Matriz: Marca "'+chosen+'" diverge da marca "'+brand+
   '" informada pela WeDrop. Abra Ficha técnica, selecione a marca oficial e aprove novamente.');
}
export function technicalMatrixSource({sku,record,attributes=[],reviewSource=null}={}){
 const listingSku=normal(sku),categoryId=Number(record?.categoryId);
 if(!listingSku||record?.sku!==listingSku)throw Error('Motor Matriz: ficha técnica pertence a outra SKU.');
 if(!Number.isSafeInteger(categoryId)||categoryId<=0)
  throw Error('Motor Matriz: categoria oficial Shopee não confirmada.');
 if(!Array.isArray(attributes))throw Error('Motor Matriz: atributos inválidos para revisão.');
 const schemaIds=new Set((record?.attributeAudit?.attributes||[]).filter(x=>!x.legacy).map(x=>Number(x.id)));
 const ids=new Set();
 for(const attr of attributes){
  const id=Number(attr?.attributeId);
  if(!Number.isSafeInteger(id)||ids.has(id)||!schemaIds.has(id))
   throw Error('Motor Matriz: atributo não pertence à categoria oficial ou está repetido.');
  ids.add(id);
  // A referência da fonte é opcional na conferência da ficha técnica.
 }
 if(reviewSource&&(normal(reviewSource.sku)!==listingSku||Number(reviewSource.categoryId)!==categoryId))
  throw Error('Motor Matriz: a SKU ou a categoria técnica mudou após a revisão. Refaça a conferência.');
 return {sku:listingSku,categoryId};
}
