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
// Matriz conservadora de complementaridade para uma mesma ocasião de compra.
// Categoria igual NUNCA é prova suficiente. A regra exige funções diferentes,
// valida o contexto e não combina a mesma função em cores/tamanhos diferentes.
const BUNDLE_PATTERNS=[
 {id:'churrasco',reason:'Preparar e servir carnes com utensílios complementares',
  categories:/utensilios|talheres|panelas|frigideiras|churrasco|cozinha/,
  left:/tabua|tábua|churrasqueira|grelha|grelhador/,
  right:/pegador|faca|cutelo|espet|garfo|avental|pincel|luva|talheres/},
 {id:'churrasco-servir',reason:'Cortar e manipular carnes no preparo do churrasco',
  categories:/utensilios|talheres|cozinha/,
  left:/faca|cutelo|chaira/,right:/pegador|garfo|espet|avental|pincel/},
 {id:'cafe',reason:'Preparar e servir café no mesmo momento de consumo',
  categories:/copos|jarras|servir|eletroportateis|cozinha|garrafas|termicas/,
  left:/cafeteira|prensa francesa|coador|filtro de cafe|moedor de cafe/,
  right:/xicara|caneca|copo|colher|leiteira|garrafa termica/},
 {id:'hidratar',reason:'Transportar a bebida e utilizar um recipiente para servir',
  categories:/garrafas|termicas|copos|jarras|servir|utensilios/,
  left:/garrafa|squeeze|jarra|termica/,
  right:/copo|caneca|xicara/},
 {id:'cozinhar',reason:'Preparar alimentos com panela e utensílio de uso complementar',
  categories:/panelas|frigideiras|utensilios|talheres|cozinha/,
  left:/frigideira|panela|caçarola|assadeira|wok/,
  right:/espatula|colher de silicone|concha|pegador|luva termica|descanso de panela/},
 {id:'escola',reason:'Transportar material e organizar os acessórios escolares',
  categories:/mochilas|estojos|lancheiras|cadernos|papelaria|garrafas|termicas/,
  left:/mochila|bolsa escolar|lancheira/,
  right:/estojo|caderno|garrafa|squeeze|lapis|caneta|borracha|apontador/},
 {id:'material-escolar',reason:'Organização de escrita e atividades escolares',
  categories:/estojos|cadernos|papelaria/,
  left:/caderno|bloco de notas/,
  right:/estojo|lapis|caneta|borracha|apontador/},
 {id:'boneca',reason:'Brinquedos e acessórios para a mesma brincadeira',
  categories:/bonecas|casinhas|brinquedos|jogos/,
  left:/boneca|casinha/,right:/roupinha|vestido de boneca|moveis de boneca|acessorio de boneca/},
 {id:'carrinhos',reason:'Brincadeira com veículo e pista ou garagem',
  categories:/carrinhos|pistas|brinquedos|jogos/,
  left:/carrinho|caminhao|caminhão|miniatura de carro/,
  right:/pista|garagem|estacionamento de brinquedo/},
 {id:'piscina',reason:'Uso conjunto em atividades de praia ou piscina',
  categories:/praia|piscina|camping|brinquedos/,
  left:/piscina|colchao inflavel|boia|flutuador/,
  right:/balde|bola de praia|brinquedo de praia|oculos de natacao|boia|toalha de praia/},
 {id:'limpeza',reason:'Limpeza de superfícies com ferramenta e acessório',
  categories:/limpeza|lavanderia|utensilios/,
  left:/mop|vassoura|rodo|balde|escova de limpeza/,
  right:/pano|refil|borrifador|esponja|balde/},
 {id:'organizacao',reason:'Organizar e identificar objetos em um mesmo ambiente',
  categories:/organizadores|cestos|prateleiras|suportes|potes|mantimentos/,
  left:/organizador|caixa organizadora|cesto|pote/,
  right:/etiqueta|divisoria|separador|gancho|suporte de organizacao/},
 {id:'banheiro',reason:'Itens complementares para organização do banheiro',
  categories:/banheiro|lixeiras|organizadores|suportes/,
  left:/toalha|saboneteira|dispensador/,
  right:/porta toalha|gancho|suporte|tapete para banheiro|organizador/}
];
const CATEGORY_CONFLICT=/\b(?:fitness|musculacao|abdominal|flexao|academia|halter|treino|reabilitacao)\b/;
const BUYER_ROLES=[
 ['tabua',/tabua/],['pegador',/pegador/],['faca',/faca|cutelo|chaira/],
 ['espetos',/espet/],['grelha',/grelha|churrasqueira/],
 ['cafeteira',/cafeteira|prensa francesa|coador|moedor de cafe/],
 ['caneca',/xicara|caneca|copo/],['garrafa',/garrafa|squeeze|termica/],
 ['panela',/frigideira|panela|caçarola|assadeira|wok/],
 ['espatula',/espatula|concha|colher de silicone/],
 ['mochila',/mochila|bolsa escolar/],['lancheira',/lancheira/],
 ['estojo',/estojo/],['caderno',/caderno|bloco de notas/],
 ['boneca',/boneca/],['casinha',/casinha/],
 ['carrinho',/carrinho|caminhao/],['pista',/pista|garagem/],
 ['boia',/boia|flutuador/],['piscina',/piscina|colchao inflavel/],
 ['limpeza-ferramenta',/mop|vassoura|rodo|escova de limpeza/],
 ['limpeza-insumo',/pano|refil|borrifador|esponja/]
];
const buyerRole=p=>BUYER_ROLES.find(([,pattern])=>pattern.test(norm(p.name)))?.[0]||
 norm(p.name).replace(/[^a-z ]/g,' ').split(' ').filter(x=>x.length>4).slice(0,2).join('-');
function buyerPair(a,b){
 if(!a||!b||a.sku===b.sku||!a.name||!b.name)return null;
 const first=norm(a.name),second=norm(b.name);
 const categoryA=norm(a.category),categoryB=norm(b.category);
 if(CATEGORY_CONFLICT.test(first+' '+categoryA)||CATEGORY_CONFLICT.test(second+' '+categoryB))
  return null;
 if(buyerRole(a)===buyerRole(b))return null;
 for(const rule of BUNDLE_PATTERNS){
  if(!rule.categories.test(categoryA)||!rule.categories.test(categoryB))continue;
  if((rule.left.test(first)&&rule.right.test(second))||
   (rule.left.test(second)&&rule.right.test(first))){
   // A família/ocasião precisa realmente aparecer nos nomes: não atribuir
   // automaticamente sucesso comercial porque dois produtos dividem categoria.
   return {id:rule.id,reason:rule.reason,score:20+
    (categoryA!==categoryB?3:0)};
  }
 }
 return null;
}
export function assessKitBuyerFit(items){
 if(!Array.isArray(items)||items.length<2||items.length>3)
  return {ok:false,score:0,reason:'Kit precisa de dois ou três produtos.'};
 if(new Set(items.map(p=>p.sku)).size!==items.length)
  return {ok:false,score:0,reason:'SKU duplicada.'};
 if(new Set(items.map(buyerRole)).size!==items.length)
  return {ok:false,score:0,reason:'Produtos com a mesma função; possível variação de cor ou tamanho.'};
 const links=[],connected=new Set();
 for(let i=0;i<items.length;i++)for(let j=i+1;j<items.length;j++){
  const link=buyerPair(items[i],items[j]);if(!link)continue;
  links.push(link);connected.add(i);connected.add(j);
 }
 if(links.length<items.length-1||connected.size!==items.length)
  return {ok:false,score:0,reason:'Não há complementaridade comprovada entre todos os componentes.'};
 const categories=new Set(items.map(p=>p.category));
 const cost=items.reduce((sum,p)=>sum+Number(p.unitCost||0),0);
 const ratios=items.map(p=>Number(p.unitCost||0)/cost);
 const accessoryBalance=ratios.every(x=>x>0.035&&x<0.93);
 const score=Math.min(100,Math.round(25+links.length*20+
  (accessoryBalance?10:0)+(categories.size>1?5:0)));
 return {ok:true,score,
  reason:[...new Set(links.map(x=>x.reason))].join(' + '),
  signals:['Produtos com funções diferentes','Complementaridade de uso',
   ...(accessoryBalance?['Itens com custos proporcionais']:[])],
  evidence:'Heurística de complementaridade; vendas e buscas não verificadas'};
}
function related(a,b){
 const match=buyerPair(a,b);
 return match?match.score:-20;
}
function pairCandidates(rows,category,limit=9){
 // Nunca preencher kit apenas porque a categoria é a mesma.
 const anchors=rows.filter(x=>categoryMatches(x.category,category))
  .sort((a,b)=>a.unitCost-b.unitCost).slice(0,260);
 const other=rows.filter(x=>categoryMatches(x.category,category)||
  BUNDLE_PATTERNS.some(rule=>rule.categories.test(norm(x.category))))
  .sort((a,b)=>a.unitCost-b.unitCost).slice(0,500);
 const choices=[],seen=new Set();
 for(const a of anchors){
  if(a.unitCost>300)continue;
  const partners=other.filter(b=>a.sku!==b.sku&&a.unitCost+b.unitCost<400)
   .map(b=>({b,fit:assessKitBuyerFit([a,b])}))
   .filter(x=>x.fit.ok)
   .sort((x,y)=>y.fit.score-x.fit.score||x.b.unitCost-y.b.unitCost);
  for(const item of partners.slice(0,4)){
   const skus=[a.sku,item.b.sku].sort(),key=skus.join('|');
   if(seen.has(key))continue;
   seen.add(key);
   choices.push({key,skus,compatibility:item.fit.score,
    reason:item.fit.reason,items:[a,item.b]});
  }
 }
 return choices.sort((a,b)=>b.compatibility-a.compatibility||
  (a.items[0].unitCost+a.items[1].unitCost)-(b.items[0].unitCost+b.items[1].unitCost))
 .slice(0,limit);
}

// Pesquisa determinística por ideia escrita: somente produtos reais, com custos
// e disponibilidade importados da WeDrop. Não faz busca web nem usa API de IA.
// Um conceito pode abranger várias categorias: não restringir à categoria do menu.
const IDEA_STOPWORDS=new Set(['kit','kits','ideia','ideias','sugestao','sugestoes','montar','montagem',
 'produto','produtos','para','pra','com','sem','uma','uns','dos','das','que','quero','preciso',
 'combinar','monta','fazer','meu','minha','seu','sua','mais','de','da','do','e','o','a','os','as']);
const IDEA_THEMES=[
 {pattern:/churrasc|grelha/,groups:[
  ['churrasc','tabua','corte','faca','cutelo','espet','grelha'],
  ['pegador','garfo','espatul','espet','avental','pincel','tempero','saleiro','churrasc']
 ]},
 {pattern:/cafe|cafeteir|capuccin/,groups:[
  ['cafe','cafeteir','prensa','french','moedor'],
  ['xicara','caneca','copo','colher','leiteir','bule','termic']
 ]},
 {pattern:/escolar|escola|volta as aulas/,groups:[
  ['mochil','lancheir','bolsa','estojo'],
  ['lapis','cadern','canet','garrafa','apontador','borrach','estojo']
 ]},
 {pattern:/bebe|maternidad|recem nascid/,groups:[
  ['bebe','fralda','mamadeir','chupet','banho','higiene'],
  ['brinqued','mordedor','sonaj','musical','toalha','escova','pente','termometro']
 ]},
 {pattern:/limpeza|faxina|lavander/,groups:[
  ['mop','vassoura','rodo','balde','escova','limpeza'],
  ['pano','esponja','borrifador','refil','organizador','saco']
 ]},
 {pattern:/cozinh|culinari|preparo/,groups:[
  ['panela','frigideir','assadeira','forma','processador','tabua'],
  ['colher','espatul','pegador','concha','faca','pote','escorredor']
 ]},
 {pattern:/banho|banheiro/,groups:[
  ['toalha','banho','saboneteir','escova'],
  ['porta','organiz','tapete','lixeira','suporte','gancho']
 ]},
 {pattern:/praia|piscina|verao/,groups:[
  ['piscina','boia','colchao','bald','praia'],
  ['brinquedo','bola','oculos','toalha','bolsa','guarda','flutuador']
 ]}
];
const ideaWords=value=>norm(value).replace(/[^a-z0-9]+/g,' ').split(' ')
 .filter(word=>word.length>=3&&!IDEA_STOPWORDS.has(word)).slice(0,15);
const sameIdeaWord=(a,b)=>a===b||(a.length>=5&&b.length>=5&&a.slice(0,5)===b.slice(0,5));
const matchesRoots=(haystack,roots)=>roots.some(root=>haystack.some(word=>word.startsWith(root)));
const ideaFamily=p=>norm(p.name).replace(/\b(?:azul|preto|preta|branco|branca|rosa|verde|vermelho|vermelha|amarelo|cinza|sortido|sortida)\b/g,' ')
 .replace(/\b\d+(?:[.,]\d+)?\s*(?:cm|mm|ml|litros?|l|kg|g|pecas?|unidades?)\b/g,' ')
 .replace(/[^a-z]+/g,' ').replace(/\s+/g,' ').trim();
export function rankKitIdeaProducts(idea,products){
 const phrase=clean(idea).slice(0,160),words=ideaWords(phrase);
 if(words.length===0)throw Error('Descreva a ideia com pelo menos uma palavra útil (ex.: churrasco, café, escolar).');
 const theme=IDEA_THEMES.find(x=>x.pattern.test(norm(phrase)));
 const scored=products.map(product=>{
  const text=ideaWords(product.name+' '+product.category),name=ideaWords(product.name);
  const explicit=words.filter(w=>text.some(t=>sameIdeaWord(w,t)));
  const roles=theme?theme.groups.flatMap((group,i)=>matchesRoots(name,group)?[i]:[]):[];
  const points=explicit.reduce((sum,w)=>sum+(name.some(t=>sameIdeaWord(w,t))?16:6),0)+
   roles.length*15;
  return {...product,ideaScore:points,ideaRoles:roles,ideaMatched:explicit};
 }).filter(x=>x.ideaScore>=10).sort((a,b)=>b.ideaScore-a.ideaScore||a.unitCost-b.unitCost);
 return {products:scored.slice(0,75),theme:theme||null,words};
}
export async function suggestKitsForIdea(shop,{idea,size=2,marginPct=10,packing=0,shipping=0}={}){
 if(![2,3].includes(Number(size)))throw Error('Selecione 2 ou 3 produtos por kit.');
 const phrase=String(idea||'').trim();
 if(phrase.length<3||phrase.length>160)throw Error('Escreva uma ideia de kit entre 3 e 160 caracteres.');
 const [catalog,stock]=await Promise.all([readCatalog(shop),readKitStockSnapshot(shop)]);
 assertKitStockSnapshot(stock);
 const available=catalog.filter(x=>stock.map.get(x.sku)==='DISPONIVEL');
 const result=rankKitIdeaProducts(phrase,available),pool=result.products.slice(0,40);
 if(pool.length<Number(size))return {results:[],source:'Catálogo WeDrop importado · pesquisa pela ideia',
  idea:phrase,candidatesFound:pool.length,disclaimer:'Não foram encontradas SKUs DISPONÍVEIS suficientes para esta ideia. Revise os termos ou atualize a importação WeDrop.'};
 const ranked=[];
 const candidate=(items)=>{
  if(new Set(items.map(x=>ideaFamily(x))).size!==items.length)return null;
  if(items.reduce((total,p)=>total+p.unitCost,0)>400)return null;
  const roles=new Set(items.flatMap(p=>p.ideaRoles));
  if(result.theme&&roles.size<2)return null;
  const fit=assessKitBuyerFit(items);
  if(!fit.ok)return null;
  return {items,fit,score:fit.score*2+
   items.reduce((total,p)=>total+p.ideaScore,0)};
 };
 for(let i=0;i<pool.length;i++){
  for(let j=i+1;j<pool.length;j++){
   const pair=[pool[i],pool[j]];
   if(Number(size)===2){
    const match=candidate(pair);
    if(match)ranked.push(match);
   }else{
    for(let k=j+1;k<pool.length;k++){
     const match=candidate([...pair,pool[k]]);
     if(match)ranked.push(match);
    }
   }
  }
 }
 ranked.sort((a,b)=>b.score-a.score||
  a.items.reduce((v,p)=>v+p.unitCost,0)-b.items.reduce((v,p)=>v+p.unitCost,0));
 const chosen=[],seen=new Set(),maxPerProduct=2;
 const usage=new Map();
 for(const item of ranked){
  const skus=item.items.map(p=>p.sku),key=skus.slice().sort().join('|');
  if(seen.has(key)||skus.some(s=>(usage.get(s)||0)>=maxPerProduct))continue;
  seen.add(key);chosen.push(item);
  skus.forEach(s=>usage.set(s,(usage.get(s)||0)+1));
  if(chosen.length>=8)break;
 }
 const kits=[];
 for(const match of chosen){
  try{
   const kit=await composeKit(shop,match.items.map(x=>x.sku),{marginPct,packing,shipping});
   kits.push({...kit,ideaMatchScore:match.score,
    buyerFitScore:match.fit.score,matchSignals:match.fit.signals,
    businessReason:match.fit.reason+'. Origem: ideia "'+phrase+'". A chance de venda é uma hipótese, não um resultado comprovado.',
    demandEvidence:'não verificada'});
  }catch(err){
   // Um kit sem preço seguro ou estoque validado não deve aparecer como pronto.
   if(!/combina|cotacao|centavos|Margem|margem|preco|preço/i.test(String(err.message||err)))throw err;
  }
 }
 return {results:kits,source:'Catálogo WeDrop importado · pesquisa pela ideia',idea:phrase,
  candidatesFound:pool.length,disclaimer:kits.length?
  'Combinações por nomes e usos relacionados; custos e estoque WeDrop revalidados. Não confirma procura de compradores nem disponibilidade do site em tempo real.':
  'Nenhuma combinação segura encontrada para a ideia. Revise os termos ou a disponibilidade importada.'};
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
   const extra=rows.filter(x=>!pair.skus.includes(x.sku)&&
    pair.items.reduce((v,p)=>v+p.unitCost,0)+x.unitCost<400)
    .map(x=>({x,fit:assessKitBuyerFit([...pair.items,x])}))
    .filter(z=>z.fit.ok).sort((a,b)=>b.fit.score-a.fit.score||a.x.unitCost-b.x.unitCost)[0];
   if(!extra)return null;
   return {...pair,items:[...pair.items,extra.x],skus:[...pair.skus,extra.x.sku],
    compatibility:extra.fit.score,reason:extra.fit.reason};
  }).filter(Boolean);
 }
 const result=[];
 for(const pick of picks.slice(0,10)){
  const item=await composeKit(shop,pick.skus,{marginPct,packing,shipping});
  const fit=assessKitBuyerFit(item.components);
  if(!fit.ok)continue;
  result.push({...item,compatibilityScore:fit.score,buyerFitScore:fit.score,
   matchSignals:fit.signals,
   businessReason:fit.reason+'. Potencial comercial estimado; vendas e buscas não verificadas.',
   demandEvidence:'não verificada'});
 }
 // Coerência vem antes de lucro absoluto: margem e lucro já foram
 // validados pela precificação; jamais promover combinações aleatórias.
 result.sort((a,b)=>b.buyerFitScore-a.buyerFitScore||
  b.quote.netMarginPct-a.quote.netMarginPct||
  b.quote.netProfit-a.quote.netProfit);
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
