// Kits Inteligentes WeDrop: leitura de catálogo por loja, cálculo monetário único,
// seleção assistida por OpenAI quando conectada. Não publica nem altera Shopee.
import {readWeDropCosts} from './wedropCosts.js';
import {shopeePricingPreferences} from './shopeePricingStore.js';
import {quoteShopeePrice} from './shopeePricing.js';
import {readKitStockSnapshot,assertKitStockSnapshot,assertKitComponentsAvailable} from './shopeeKitAvailability.js';


const CACHE_MS=5*60*1000;
const cached=new Map();
export function clearKitCatalogCache(shopId){cached.delete(Number(shopId));}
const norm=s=>String(s||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase();
const clean=s=>String(s||'').trim().slice(0,240);
const brl=n=>Math.round(Number(n)*100)/100;
const validShop=shop=>{const n=Number(shop);if(!Number.isSafeInteger(n)||n<=0)throw Error('Loja inválida.');return n;};
const asset=u=>{try{const x=new URL(u);return x.protocol==='https:'&&x.hostname==='wedrop-products-images.nyc3.cdn.digitaloceanspaces.com'?x.href:'';}catch{return '';}};
const GROUPS=Object.freeze({
 Brinquedos:['Brinquedos','Bonecas e Casinhas','Carrinhos e Pistas','Jogos e Educativos','Fantasias','Passeio e Elétricos','Bebês'],
 Cozinha:['Utensílios e Talheres','Panelas e Frigideiras','Copos, Jarras e Servir','Garrafas e Térmicas','Potes, Marmitas e Mantimentos','Eletroportáteis de Cozinha'],
 Organização:['Organizadores e Cestos','Prateleiras e Suportes','Lixeiras','Acessórios de Banheiro','Lavanderia'],
 Papelaria:['Cadernos','Mochilas, Estojos e Lancheiras']
});
export function categoryMatches(actual,filter){
 return filter==='Todos'||actual===filter||(GROUPS[filter]||[]).includes(actual);
}
async function readCatalog(shop){
 const id=validShop(shop);
 const saved=cached.get(id);
 if(saved&&Date.now()-saved.at<CACHE_MS)return saved.rows;
 const base=String(process.env.SUPABASE_URL||'').replace(/\/$/,'');
 const key=String(process.env.SUPABASE_SECRET_KEY||process.env.SUPABASE_SERVICE_ROLE_KEY||'');
 if(!base.startsWith('https://')||!key)throw Error('Catálogo WeDrop não conectado.');
 const headers={apikey:key,Accept:'application/json'};
 if(key.startsWith('eyJ'))headers.Authorization='Bearer '+key;
 const [costs,...pages]=await Promise.all([
  readWeDropCosts(id),
  ...Array.from({length:3},(_,i)=>i*1000)
   .map(async offset=>{const url=base+'/rest/v1/shopee_wedrop_products?shop_id=eq.'+id+
    '&select=supplier_sku,product_data&order=supplier_sku.asc&limit=1000&offset='+offset;
    const r=await fetch(url,{headers,signal:AbortSignal.timeout(19000)});
    if(!r.ok)throw Error('Consulta ao catálogo WeDrop falhou (HTTP '+r.status+').');
    return r.json();})
 ]);
 let catalog=pages.flat();
 // Catálogos grandes: percorrer todas as páginas adicionais para não limitar
 // sugestões às primeiras categorias/SKUs.
 if(pages.at(-1)?.length===1000){
  for(let offset=3000;offset<18000;offset+=1000){
   const url=base+'/rest/v1/shopee_wedrop_products?shop_id=eq.'+id+
    '&select=supplier_sku,product_data&order=supplier_sku.asc&limit=1000&offset='+offset;
   const response=await fetch(url,{headers,signal:AbortSignal.timeout(19000)});
   if(!response.ok)throw Error('Leitura paginada WeDrop indisponível.');
   const page=await response.json();catalog.push(...page);
   if(page.length<1000)break;
  }
 }
 const byCost=new Map(costs.map(x=>[String(x.supplier_sku),Number(x.unit_cost)]));
 const rows=catalog.map(x=>{
  const v=x.product_data||{},sku=String(x.supplier_sku||'').trim(),cost=byCost.get(sku);
  return {sku,name:clean(v.name),category:clean(v.category)||'Sem categoria',
   unitCost:brl(cost),imageUrl:asset(v.imageUrl),brand:clean(v.brand),
   stockStatus:'não verificado'};
 }).filter(p=>p.sku&&p.name&&Number.isFinite(p.unitCost)&&p.unitCost>0);
 cached.set(id,{at:Date.now(),rows});return rows;
}
export async function kitCatalog(shop,{category='Todos',search='',limit=80}={}){
 const [rows,stock]=await Promise.all([readCatalog(shop),readKitStockSnapshot(shop)]);
 const categories=[...new Set(rows.map(x=>x.category))].sort((a,b)=>a.localeCompare(b,'pt-BR'));
 const groups=Object.keys(GROUPS).filter(x=>GROUPS[x].some(c=>categories.includes(c)));
 const term=norm(search).trim();
 const filtered=rows.filter(x=>categoryMatches(x.category,category)&&(!term||norm(x.name+' '+x.sku).includes(term)));
 const available=filtered.filter(x=>stock.map.get(x.sku)==='DISPONIVEL');
 const stockSummary={ready:stock.ready,reason:stock.reason,
  importedCount:stock.importedCount,availableCount:stock.availableCount,
  unavailableCount:stock.unavailableCount,lastSuccessAt:stock.lastSuccessAt,
  catalogLastImportedAt:stock.catalogLastImportedAt,expiresAt:stock.expiresAt};
 return {categories:['Todos',...groups,...categories],catalogCount:rows.length,matched:filtered.length,
  availableMatched:stock.ready?available.length:0,
  products:stock.ready?available.slice(0,Math.max(1,Math.min(160,Number(limit)||80)))
   .map(x=>({...x,stockStatus:'DISPONIVEL'})):[],
  stock:stockSummary,snapshotAt:new Date(cached.get(validShop(shop)).at).toISOString()};
}
const RELATED=[
 [/garrafa|termica/,/copo|caneca|escova|suporte|porta/],
 [/cafe|cafeteira/,/xicar|colher|copo|caneca/],
 [/panela|frigideira|assadeira/,/espatula|colher|pegador|concha|luva/],
 [/organiz|cesto|caixa/,/gancho|cabide|prateleira|etiqueta/],
 [/mochila|lancheira/,/estojo|caderno|garrafa|lapis/],
 [/boneca|casinha/,/roupinha|moveis|acessorio|cozinha|carrinho/],
 [/carrinho|caminhao|pista/,/pista|garagem|boneco|carrinho|helicoptero/],
 [/praia|piscina/,/boia|balde|brinquedo|oculos/],
 [/banheiro|shampoo/,/saboneteira|gancho|suporte|organizador/],
 [/limpeza|vassoura/,/pano|balde|escova|rodo/]
];
function related(a,b){
 const x=norm(a.name),y=norm(b.name);
 if(x===y)return -10;
 let score=a.category===b.category?2:0;
 for(const [one,two] of RELATED){
  if((one.test(x)&&two.test(y))||(one.test(y)&&two.test(x)))score+=9;
 }
 if(norm(a.name).replace(/azul|rosa|verde|preto|branco|vermelho|amarelo|sortido|sortida/g,'').trim()===
    norm(b.name).replace(/azul|rosa|verde|preto|branco|vermelho|amarelo|sortido|sortida/g,'').trim())
  score-=12;
 // Não apresentar combinações sem conexão funcional como "alto potencial".
 return score;
}
function pairCandidates(rows,category,limit=9){
 const anchors=rows.filter(x=>categoryMatches(x.category,category))
  .sort((a,b)=>a.unitCost-b.unitCost).slice(0,140);
 const other=rows.filter(x=>categoryMatches(x.category,category)||RELATED.some(([x,y])=>x.test(norm(category))||y.test(norm(category))))
  .sort((a,b)=>a.unitCost-b.unitCost).slice(0,240);
 const choices=[];
 for(const a of anchors){
  if(a.unitCost>300)continue;
  const partners=other.filter(b=>a.sku!==b.sku&&a.unitCost+b.unitCost<400)
   .map(b=>({b,score:related(a,b)}))
   .filter(x=>x.score>=2).sort((x,y)=>y.score-x.score||x.b.unitCost-y.b.unitCost);
  for(const item of partners.slice(0,3)){
   const skus=[a.sku,item.b.sku].sort(),key=skus.join('|');
   if(choices.some(x=>x.key===key))continue;
   choices.push({key,skus,compatibility:item.score,items:[a,item.b]});
  }
 }
 return choices.sort((a,b)=>b.compatibility-a.compatibility||
  (a.items[0].unitCost+a.items[1].unitCost)-(b.items[0].unitCost+b.items[1].unitCost))
 .slice(0,limit);
}
export function kitSku(skus){
 const ids=skus.map(s=>String(s).toUpperCase().replace(/[^A-Z0-9]/g,'').slice(0,22)).sort();
 return 'KIT-'+ids.join('-').slice(0,112);
}
export async function composeKit(shop,skus,{marginPct=15,packing=0,shipping=0}={}){
 const [items,stock]=await Promise.all([readCatalog(shop),readKitStockSnapshot(shop)]);
 assertKitStockSnapshot(stock);
 if(!Array.isArray(skus)||skus.length<2||skus.length>3||new Set(skus).size!==skus.length)
  throw Error('Selecione dois ou três SKUs distintos da WeDrop.');
 const lookup=new Map(items.map(x=>[x.sku,x]));
 const products=skus.map(x=>{
  const p=lookup.get(String(x));
  return p?{...p,stockStatus:stock.map.get(p.sku)||'DESCONHECIDO'}:null;
 });
 if(products.some(x=>!x))throw Error('SKU não encontrada com custo WeDrop válido na mesma loja.');
 assertKitComponentsAvailable(products,stock);
 const costs=brl(products.reduce((a,p)=>a+p.unitCost,0));
 const n=Number(marginPct),extra=Number(packing),freight=Number(shipping);
 if(!Number.isFinite(n)||n<0||n>70||!Number.isFinite(extra)||extra<0||extra>500||
   !Number.isFinite(freight)||freight<0||freight>500)
  throw Error('Margem ou custo adicional do kit inválido.');
 const settings=await shopeePricingPreferences(shop);
 const quote=quoteShopeePrice({unitCost:costs,marginOverride:true,
  settings:{...settings,marginPct:n,minMarginPct:Math.min(n,settings.minMarginPct),
   packing:extra,shipping:freight,adsPct:0}});
 return {kitSku:kitSku(skus),components:products,componentCost:costs,
  packing:extra,shipping:freight,kitCost:brl(costs+extra+freight),
  quote:{grossPrice:quote.grossPrice,discountPct:quote.discountPct,
   marketplacePrice:quote.marketplaceDisplayPrice,afterCoupon:quote.customerPrice,
   couponPct:quote.couponPct,netProfit:quote.netProfit,netMarginPct:quote.netMarginPct,
   targetMarginPct:n,commission:quote.breakdown.commission,
   fixedFee:quote.breakdown.fixedFee,tax:quote.breakdown.tax,
   flash:quote.breakdown.flash,campaign:quote.breakdown.campaignDiscount,
   ads:quote.breakdown.ads,priceEndingRuleVersion:quote.priceEndingRuleVersion},
  warning:'Simulação com custo WeDrop e status DISPONÍVEL na importação. Estoque pode mudar; revalide antes de publicar. Frete conjunto e disponibilidade do kit físico exigem confirmação.',
  verifiedSales:false,marketResearchVerified:false,shopeePublished:false,
  wedropAvailabilityConfirmedAt:stock.lastSuccessAt};
}
export function kitPrompts(kit){
 const exact=kit.components.map((x,i)=>(i+1)+'. SKU '+x.sku+' — '+x.name+' — 1 unidade').join('; ');
 const intro='Kits Rede Achados BR. Produtos EXATOS e inalteráveis: '+exact+'. O kit contém '+kit.components.length+' produtos distintos; nunca inventar variantes, atributos, brindes, medidas, certificações, marcas, acessórios ou quantidades. Fotos referência de cada SKU devem ser usadas para preservar a aparência fiel. Arte 1200×1200, moderna, limpa e ambientada, sem logos, preços ou marcas d’água.';
 return [
  '01 CAPA: mostrar TODOS os componentes juntos ocupando 85 a 90% da foto; fundo comercial sofisticado e limpo; SEM TÍTULO.',
  '02 USO REAL: mostrar os produtos reunidos num uso cotidiano coerente, sem alterar nenhum componente; uma frase curta só se comprovada.',
  '03 CONTEÚDO DO KIT: os produtos originais lado a lado, etiquetas pequenas com SKU e quantidade 1 de cada, nenhum número técnico inferido.',
  '04 BENEFÍCIOS: destacar visualmente a complementaridade real; até três frases pequenas e somente fatos comprovados.',
  '05 PROBLEMA E SOLUÇÃO: kit completo em um cenário real sem simular funções não confirmadas; frase curta.',
  '06 VANTAGEM DO CONJUNTO: mostrar os produtos organizados como um conjunto com texto discreto "Leve juntos", sem alegar economia sem comparar preços reais.',
  '07 EXPERIÊNCIA: composição lifestyle com todos os itens, fundo HD nítido e diferente da capa.',
  '08 OBJEÇÕES: exibir quantidades exatas e composição confirmada; não prometer frete ou prazo não verificado.',
  '09 MOCKUP: conjunto em embalagem neutra ilustrativa, não afirmar que a embalagem acompanha; três pequenos selos Compra Segura, Entrega Rápida e Atendimento Online, sujeitos à política real da loja.'
 ].map((slot,i)=>'Imagem '+String(i+1).padStart(2,'0')+'/09.\n'+intro+'\n'+slot);
}
export async function suggestKits(shop,{category='Brinquedos',size=2,marginPct=15,packing=0,shipping=0,ai=true}={}){
 if(![2,3].includes(Number(size)))throw Error('Selecione 2 ou 3 produtos no kit.');
 const [catalog,stock]=await Promise.all([readCatalog(shop),readKitStockSnapshot(shop)]);
 assertKitStockSnapshot(stock);
 const rows=catalog.filter(p=>stock.map.get(p.sku)==='DISPONIVEL');
 if(!rows.some(x=>categoryMatches(x.category,category)))throw Error('Categoria sem produtos DISPONÍVEIS na importação WeDrop. Se necessário, atualize o catálogo e a disponibilidade.');
 let picks=pairCandidates(rows,category,Math.max(16,Number(size)*8));
 let source='compatibilidade de categorias e preços (heurística)';
 let commentary='Potencial de venda inferido pela complementaridade, sem dados reais de pedidos ou buscas.';
 // A recomendação não consulta a API paga. O ChatGPT Plus funciona
 // somente através da cópia/colagem da seleção em uma aba autenticada
 // do usuário; esta etapa local apenas produz sugestões preliminares.
 // Para kits de 3 itens sem resposta da IA, acrescentar um terceiro
 // componente real com compatibilidade e custo seguros.
 if(Number(size)===3&&source.startsWith('compatibilidade')){
  picks=picks.map(pair=>{
   const extra=rows.filter(x=>!pair.skus.includes(x.sku)&&categoryMatches(x.category,category)&&
    pair.items.reduce((v,p)=>v+p.unitCost,0)+x.unitCost<400)
    .map(x=>({x,score:Math.max(...pair.items.map(item=>related(item,x)))}))
    .filter(z=>z.score>=3).sort((a,b)=>b.score-a.score||a.x.unitCost-b.x.unitCost)[0];
   if(!extra)return null;
   return {...pair,items:[...pair.items,extra.x],skus:[...pair.skus,extra.x.sku]};
  }).filter(Boolean);
 }
 const result=[];
 for(const pick of picks.slice(0,10)){
  const item=await composeKit(shop,pick.skus,{marginPct,packing,shipping});
  result.push({...item,compatibilityScore:pick.compatibility,
   businessReason:pick.reason||'Itens com usos complementares identificados por categoria e nome.'});
 }
 // Ordenar por lucro líquido simulado, sem confundir isso com vendas reais.
 result.sort((a,b)=>b.quote.netProfit-a.quote.netProfit);
 return {source,disclaimer:commentary,category,results:result.slice(0,8)};
}
export async function kitCreative(shop,kit,{ai=true}={}){
 const products=kit.components.map(p=>p.name+' (SKU '+p.sku+', 1 unidade)');
 let title='Kit '+products.map(x=>x.replace(/\s*\(SKU.*$/,'')).join(' + ');
 title=title.slice(0,120);
 let description='✨ Kit com '+kit.components.length+' produtos selecionados para uso complementar.\n\n✅ BENEFÍCIOS\n'+
  kit.components.map(x=>'• '+x.name).join('\n')+
  '\n\n💡 POR QUE COMPRAR\nAdquira os itens em um único conjunto.\n\n⚙️ CARACTERÍSTICAS\n'+
  'Composição conforme as fichas individuais da WeDrop; verifique cores e medidas de cada SKU.\n\n📦 O QUE VAI NA EMBALAGEM\n'+
  products.map(x=>'• 1 '+x).join('\n')+
  '\n\n🛒 Confira todos os componentes antes de finalizar sua compra.';
 let source='modelo determinístico com SKUs verificados';

 return {title,description,source,prompts:kitPrompts(kit)};
}
export async function kitPlusResearchBrief(shop,{category='Brinquedos',size=2}={}){
 if(![2,3].includes(Number(size)))throw Error('Escolha dois ou três SKUs por kit.');
 const [catalog,stock]=await Promise.all([readCatalog(shop),readKitStockSnapshot(shop)]);
 assertKitStockSnapshot(stock);
 const rows=catalog.filter(x=>categoryMatches(x.category,category)&&stock.map.get(x.sku)==='DISPONIVEL')
  .sort((a,b)=>a.unitCost-b.unitCost);
 if(!rows.length)throw Error('Nenhum produto WeDrop encontrado nesta categoria.');
 // Enviar nomes e custos somente como evidência. Não incluir IDs de loja,
 // tokens, nomes de clientes nem dados privados nas mensagens do ChatGPT.
 const candidates=rows.slice(0,110).map(x=>({
  sku:x.sku,name:x.name,category:x.category,unitCost:x.unitCost,imageUrl:x.imageUrl
 }));
 const prompt=[
  'Você é especialista brasileiro em cross-sell de kits para a Shopee.',
  'Loja: Rede Achados BR. Usar APENAS as SKUs listadas. Categoria: '+category+'.',
  'Monte até 8 kits com EXATAMENTE '+size+' SKUs diferentes por kit, de produtos de uso real complementar. Não invente códigos, custos, certificações, atributos, imagens, nem estoque.',
  'Todos os SKUs listados tinham status DISPONÍVEL na última importação WeDrop. Confirme novamente a disponibilidade antes de publicar; nunca invente estoque.',
  'Evite combinar meras variações de cor do mesmo produto. Não repita SKU dentro do kit.',
  'Avalie potencial comercial e relevância, mas NÃO diga que são os mais vendidos sem volumes comprovados. Os custos são da WeDrop e o lucro real será calculado no Shopee Manager.',
  'RESPOSTA OBRIGATÓRIA: somente uma linha por kit, com os códigos exatos separados pelo caractere |. Não use Markdown nem comentários. Exemplo: SKU_A | SKU_B.',
  'LISTA DE PRODUTOS REAIS WE DROP:',
  ...candidates.map(x=>x.sku+' | '+x.name+' | categoria '+x.category+' | custo R$ '+x.unitCost.toFixed(2).replace('.',','))
 ].join('\n');
 return {prompt,candidatesCount:candidates.length,category,size:Number(size),
  truncated:rows.length>candidates.length,source:'WeDrop real, preparado para ChatGPT Plus sem API'};
}
export function kitPlusContentPrompt(kit){
 const lines=kit.components.map(x=>'- SKU '+x.sku+': '+x.name+' (quantidade 1)').join('\n');
 return [
 'Você é redator de alta conversão Shopee da Rede Achados BR.',
 'Gere UM título SEO com até 120 caracteres e UMA descrição organizada com 700 a 1400 caracteres ou menor se necessário para não inventar informações.',
 'Estilo natural brasileiro, emojis discretos, parágrafos curtos. Estrutura ✨ introdução; ✅ BENEFÍCIOS; 💡 POR QUE COMPRAR; ⚙️ CARACTERÍSTICAS; 📦 O QUE VAI NA EMBALAGEM; 🛒 chamada final.',
 'Este kit tem EXATAMENTE estes produtos, 1 unidade de cada:',''+lines,
 'Identificador de rascunho: '+kit.kitSku+'.',
 'Não adicionar medidas, marcas, certificações, funções, brindes, prazos, frete grátis nem economia sem fatos confirmados. Nunca confundir SKUs.',
 'Você pode considerar termos de busca atuais se verificar fontes; não invente volume ou ranking.',
 'Formato de saída: primeira linha TÍTULO: ...; depois uma linha DESCRIÇÃO: ... e os blocos da descrição.'
 ].join('\n\n');
}
export async function kitProductImages(shop,skus){
 const rows=await readCatalog(shop);
 const map=new Map(rows.map(x=>[x.sku,x]));
 return skus.map(x=>map.get(String(x))?.imageUrl||'');
}
