const crypto = require('crypto');

function clean(v){ return String(v ?? '').replace(/\s+/g,' ').trim(); }
function key(v){ return clean(v).normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^a-z0-9]+/g,' ').trim(); }
function num(v,d=0){
  if(v===null||v===undefined||v==='') return d;
  let s=String(v).trim();
  if(/^\d{1,3}(\.\d{3})+,\d+$/.test(s)) s=s.replace(/\./g,'').replace(',','.');
  else if(/^\d+,\d+$/.test(s)) s=s.replace(',','.');
  else s=s.replace(/[^0-9.-]/g,'');
  const n=Number(s); return Number.isFinite(n)?n:d;
}
function bool(v){ return ['1','true','sim','yes','s'].includes(key(v)); }

function availabilityState(v){
  const k=key(v);
  if(!k) return 'unknown';
  if(['disponivel','em estoque','disponivel para venda','ativo','available','in stock','sim','yes'].includes(k)) return 'available';
  if(['indisponivel','sem estoque','esgotado','inativo','unavailable','out of stock','nao','não','no'].includes(k)) return 'unavailable';
  if(k.includes('indispon')||k.includes('sem estoque')||k.includes('esgot')) return 'unavailable';
  if(k.includes('dispon')) return 'available';
  return 'unknown';
}

const ALIASES={
  sku:['sku','seller sku','seller_sku','codigo sku','código sku','codigo','código','cod produto','cod. produto','codigo produto','código produto','referencia','referência','ref','id produto','produto id','item id','item_id'],
  product:['produto','nome','nome produto','nome do produto','produto nome','descricao produto','descrição produto','descricao do produto','descrição do produto','titulo','título','title','product','product name'],
  cost:['custo','preco custo','preço custo','custo unitario','custo unitário','valor custo','preco atacado','preço atacado','preco fornecedor','preço fornecedor','valor fornecedor','valor','preco','preço'],
  price:['preco venda','preço venda','valor venda','preco sugerido','preço sugerido','sale price','retail price'],
  stock:['estoque','stock','quantidade','qtd','saldo','quantidade estoque','qtd estoque','quantidade disponivel','quantidade disponível','estoque disponivel','estoque disponível','saldo disponivel','saldo disponível','available stock','stock quantity','qty available','qtd disponivel','qtd disponível'],
  availability:['disponibilidade','status disponibilidade','status de disponibilidade','status estoque','status do estoque','situacao estoque','situação estoque','disponivel','disponível'],
  gtin:['gtin','ean','ean13','codigo barras','código barras','codigo de barras','código de barras','barcode'],
  brand:['marca','brand','fabricante'],
  model:['modelo','model','referencia modelo','referência modelo'],
  color:['cor','color','cores'],
  material:['material','materiais','composicao','composição'],
  dimensions:['dimensoes','dimensões','medidas','dimensions','tamanho produto','medida produto'],
  height_cm:['altura cm','altura_cm','altura'],
  width_cm:['largura cm','largura_cm','largura'],
  length_cm:['comprimento cm','comprimento_cm','comprimento','profundidade cm','profundidade'],
  diameter_cm:['diametro cm','diâmetro cm','diametro_cm','diâmetro_cm','diametro','diâmetro'],
  weight_g:['peso g','peso_g','peso gramas','peso produto','peso do produto','peso','peso kg','peso em kg','peso liquido','peso líquido','weight','weight g','weight kg'],
  packaging_image_url:['embalagem url','embalagem_url','foto embalagem','imagem embalagem','packaging image','packaging_image_url'],
  features:['caracteristicas','características','features','especificacoes','especificações','detalhes','beneficios','benefícios'],
  package_content:['conteudo','conteúdo','conteudo embalagem','conteúdo embalagem','itens inclusos','itens inclusos embalagem','package content'],
  video_url:['video','vídeo','video url','vídeo url','video_url'],
  category_id:['category id','category_id','categoria id','categoria_id'],
  supplier_category:['categoria','categoria fornecedor','categoria do fornecedor','supplier category'],
  parent_sku:['sku pai','parent sku','parent_sku','codigo pai','código pai','grupo sku','grupo de sku'],
  product_family:['familia','família','familia produto','família produto','product family','family name','grupo produto','grupo de produto','produto base'],
  size:['tamanho','size','tam','tamanho produto'],
  voltage:['voltagem','tensao','tensão','voltage','volts'],
  capacity:['capacidade','capacity','volume'],
  flavor:['sabor','flavor'],
  pattern:['estampa','desenho','design','padrao','padrão'],
  variant_name:['variacao','variação','variation','nome variacao','nome variação'],
  sales_30d:['vendas 30 dias','vendas_30d','sales 30d','sales_30d','vendidos 30 dias','vendidos_30d'],
};
const normalizedAliases=Object.fromEntries(Object.entries(ALIASES).map(([f,a])=>[f,new Set(a.map(key))]));
function value(row,field){
  const aliases=normalizedAliases[field]||new Set();
  for(const [k,v] of Object.entries(row||{})){ if(aliases.has(key(k)) && v!=='' && v!==null && v!==undefined) return v; }
  return '';
}
function fieldEntry(row,field){
  const aliases=normalizedAliases[field]||new Set();
  for(const [k,v] of Object.entries(row||{})){ if(aliases.has(key(k)) && v!=='' && v!==null && v!==undefined) return {header:clean(k),value:v}; }
  return {header:'',value:''};
}
function normalizeWeightToGrams(entry={}){
  const raw=entry.value;if(raw===null||raw===undefined||String(raw).trim()==='')return '';
  const parsed=num(raw,0);if(!(parsed>0))return '';
  const h=key(entry.header);
  // Catálogos WeDrop já apareceram com cabeçalho "Peso (kg)" e valores em gramas (355, 5200, 14300).
  // Se o número for grande, preservamos como gramas; quando vier 0,355 / 5,2 kg, convertemos para g.
  if(/(^| )kg($| )/.test(h))return Math.round(parsed<100?parsed*1000:parsed);
  return Math.round(parsed);
}
function urlsFromRow(row){
  const urls=[];
  for(const [k,v] of Object.entries(row||{})){
    if(!/(foto|imagem|image|picture|url)/i.test(k) || /(embalagem|packaging|video|vídeo)/i.test(k)) continue;
    String(v||'').split(/[;,\n]/).forEach(x=>{x=x.trim();if(/^https?:\/\//i.test(x))urls.push(x)});
  }
  return [...new Set(urls)];
}
function nonEmptyAttributes(row){
  const out={};
  for(const [k,v] of Object.entries(row||{})){
    const val=clean(v); if(!val) continue;
    out[clean(k)]=val;
    if(Object.keys(out).length>=80) break;
  }
  return out;
}
function explicitStockFromText(v){
  const text=clean(v); if(!text)return null;
  const m=text.match(/(?:estoque|stock|quantidade|qtd|saldo|dispon[ií]vel(?:\s*[:\-])?)?\s*(\d{1,7})(?:\s*(?:un|unid|unidades?|pcs?|pe[cç]as?))?/i);
  if(!m)return null;
  const q=Number(m[1]); return Number.isFinite(q)?Math.max(0,Math.floor(q)):null;
}
function normalizeSupplierRow(row,index=0){
  const sku=clean(value(row,'sku'));
  const rawStock=value(row,'stock');
  const availabilityRaw=clean(value(row,'availability'));
  const weightEntry=fieldEntry(row,'weight_g');
  const availability_status=availabilityState(availabilityRaw);
  const rawStockPresent=!(rawStock===null||rawStock===undefined||String(rawStock).trim()==='');
  const inferredStock=rawStockPresent?num(rawStock,0):explicitStockFromText(availabilityRaw);
  const stock_quantity_known=rawStockPresent||inferredStock!==null;
  const product={
    supplierRow:index+2,
    sku,
    product:clean(value(row,'product')),
    cost:num(value(row,'cost'),0),
    price:num(value(row,'price'),0),
    stock:stock_quantity_known?Math.max(0,Math.floor(Number(inferredStock)||0)):(availability_status==='available'?1:0),
    stock_quantity_known,
    availability_status,
    availability_raw:availabilityRaw,
    gtin:clean(value(row,'gtin')),
    brand:clean(value(row,'brand')),
    model:clean(value(row,'model')),
    color:clean(value(row,'color')),
    material:clean(value(row,'material')),
    dimensions:clean(value(row,'dimensions')),
    height_cm:num(value(row,'height_cm'),0)||'',
    width_cm:num(value(row,'width_cm'),0)||'',
    length_cm:num(value(row,'length_cm'),0)||'',
    diameter_cm:num(value(row,'diameter_cm'),0)||'',
    weight_g:normalizeWeightToGrams(weightEntry),
    packaging_image_url:clean(value(row,'packaging_image_url')),
    features:clean(value(row,'features')),
    package_content:clean(value(row,'package_content')),
    video_url:clean(value(row,'video_url')),
    category_id:clean(value(row,'category_id')),
    supplier_category:clean(value(row,'supplier_category')),
    parent_sku:clean(value(row,'parent_sku')),
    product_family:clean(value(row,'product_family')),
    size:clean(value(row,'size')),
    voltage:clean(value(row,'voltage')),
    capacity:clean(value(row,'capacity')),
    flavor:clean(value(row,'flavor')),
    pattern:clean(value(row,'pattern')),
    variant_name:clean(value(row,'variant_name')),
    sales_30d:num(value(row,'sales_30d'),-1),
    images:urlsFromRow(row),
    supplierAttributes:nonEmptyAttributes(row)
  };
  return product;
}
function recoverStockQuantity(supplier={}){
  const direct=Math.max(0,Math.floor(num(supplier.stock,0)));
  if(supplier.stock_quantity_known===true||direct>1)return {quantity:direct,known:true,source:supplier.stock_quantity_known===true?'normalized':'normalized-recovered'};
  for(const [k,v] of Object.entries(supplier.supplierAttributes||{})){
    if(!(normalizedAliases.stock||new Set()).has(key(k)))continue;
    const text=clean(v); if(!text)continue; const q=explicitStockFromText(text); if(q!==null)return {quantity:q,known:true,source:`attribute:${clean(k)}`};
    const parsed=num(text,NaN);if(Number.isFinite(parsed))return {quantity:Math.max(0,Math.floor(parsed)),known:true,source:`attribute:${clean(k)}`};
  }
  const availability=explicitStockFromText(supplier.availability_raw);if(availability!==null)return {quantity:availability,known:true,source:'availability'};
  return {quantity:direct,known:false,source:'fallback'};
}
function normalizedSku(v){ return key(v).replace(/\s+/g,''); }
function catalogIndex(products=[]){
  const m=new Map();
  for(const p of products){ const k=normalizedSku(p.sku); if(k && !m.has(k)) m.set(k,p); }
  return m;
}
function hasValue(v){ return !(v===null||v===undefined||v===''||(typeof v==='number'&&v===0)); }
function mergeIntoProduct(base,supplier){
  if(!supplier) return {...base,catalogMatch:{found:false,sku:base.sku||'',matchedAt:new Date().toISOString()}};
  const out={...base};
  const fields=['product','cost','price','gtin','brand','model','color','material','dimensions','height_cm','width_cm','length_cm','diameter_cm','weight_g','packaging_image_url','features','package_content','video_url','category_id','supplier_category','parent_sku','product_family','size','voltage','capacity','flavor','pattern','variant_name','sales_30d'];
  for(const f of fields){ if(!hasValue(out[f]) && hasValue(supplier[f])) out[f]=supplier[f]; }
  // Estoque do catálogo é autoritativo. Corrige versões antigas em que `stock_quantity_known:false`
  // impedia o número real do fornecedor de substituir o fallback de 1 unidade.
  const recoveredStock=recoverStockQuantity(supplier);
  if(recoveredStock.known){
    out.stock=recoveredStock.quantity;
    out.stock_quantity_known=true;
    out.stock_source=recoveredStock.source;
    out.availability_status=clean(supplier.availability_status)|| (out.stock>0?'available':'unavailable');
    out.availability_raw=clean(supplier.availability_raw);
  }else{
    if(!hasValue(out.stock) && hasValue(supplier.stock))out.stock=supplier.stock;
    if(out.stock_quantity_known!==true && supplier.stock_quantity_known===true)out.stock_quantity_known=true;
    if(!clean(out.availability_status) && clean(supplier.availability_status))out.availability_status=supplier.availability_status;
    if(!clean(out.availability_raw) && clean(supplier.availability_raw))out.availability_raw=supplier.availability_raw;
  }
  out.images=[...new Set([...(supplier.images||[]),...(out.images||[])])];
  out.supplierAttributes={...(supplier.supplierAttributes||{}),...(out.supplierAttributes||{})};
  out.catalogMatch={found:true,sku:supplier.sku,row:supplier.supplierRow||null,matchedAt:new Date().toISOString()};
  return out;
}

function refreshFromSupplier(base,supplier){
  if(!supplier)return {...base,catalogMatch:{found:false,sku:base.sku||'',matchedAt:new Date().toISOString()}};
  const out={...base};
  const authoritative=['product','cost','gtin','brand','model','color','material','dimensions','height_cm','width_cm','length_cm','diameter_cm','weight_g','packaging_image_url','features','package_content','video_url','category_id','supplier_category','parent_sku','product_family','size','voltage','capacity','flavor','pattern','variant_name','sales_30d'];
  for(const f of authoritative){ if(hasValue(supplier[f])) out[f]=supplier[f]; }
  const recoveredStock=recoverStockQuantity(supplier);
  out.stock=recoveredStock.quantity;
  out.stock_quantity_known=Boolean(recoveredStock.known);
  out.stock_source=recoveredStock.source;
  out.availability_status=clean(supplier.availability_status)||'unknown';
  out.availability_raw=clean(supplier.availability_raw);
  if(hasValue(supplier.price)) out.supplier_price=supplier.price;
  out.images=[...new Set([...(supplier.images||[]),...(base.images||[])])];
  out.supplierAttributes={...(base.supplierAttributes||{}),...(supplier.supplierAttributes||{})};
  out.catalogMatch={found:true,sku:supplier.sku,row:supplier.supplierRow||null,matchedAt:new Date().toISOString(),refreshed:true};
  return out;
}



function cleanMultiline(v){ return String(v??'').replace(/\r/g,'').split('\n').map(x=>x.replace(/[\t ]+/g,' ').trim()).filter((x,i,a)=>x|| (i>0&&a[i-1])).join('\n').replace(/\n{3,}/g,'\n\n').trim(); }
function firstMatch(text,patterns){ for(const re of patterns){const m=text.match(re);if(m&&clean(m[1]))return clean(m[1]);}return ''; }
function sectionLines(text,startRe,endRes=[]){
  const lines=cleanMultiline(text).split('\n');let on=false,out=[];
  for(const line of lines){if(!on&&startRe.test(line)){on=true;continue;}if(on&&endRes.some(re=>re.test(line)))break;if(on&&line)out.push(clean(line));}
  return out;
}
function parseSupplierDetailText(input){
  const text=cleanMultiline(input); if(!text)return {patch:{},supplierAttributes:{},found:[]};
  const attrs={},patch={},found=[]; const put=(k,v)=>{v=clean(v);if(v){attrs[k]=v;found.push(k)}};
  const inmetro=firstMatch(text,[/INMETRO\s*:\s*(?:Registro\s*)?([A-Z0-9.\/-]+)/i,/registro(?:\/certifica[cç][aã]o)?\s*(?:inmetro)?\s*[:\-]?\s*([A-Z0-9.\/-]{5,})/i]); put('Registro INMETRO',inmetro);
  const age=firstMatch(text,[/Idade recomendada\s*:\s*([^\n]+)/i,/indicad[ao]\s+para\s+crian[cç]as\s+(?:a partir de|acima de)\s*([^\n.,;]+)/i]); put('Idade recomendada',age);
  const qty=firstMatch(text,[/Capacidade\s*:\s*(?:Kit\s+com\s*)?(\d+\s*pe[cç]as)/i,/Total\s+de\s+(\d+\s*pe[cç]as)/i,/Quantidade(?:\s+de\s+pe[cç]as)?\s*:\s*(\d+)/i]); put('Quantidade de peças',qty);
  const material=firstMatch(text,[/(?:Composi[cç][aã]o|Material)\s*:\s*([^\n]+)/i]); put('Composição',material); if(material)patch.material=material;
  const color=firstMatch(text,[/Cor\s*:\s*([^\n]+)/i]); put('Cor',color); if(color)patch.color=color;
  const weight=firstMatch(text,[/Peso(?:\s+(?:do|da)\s+(?:produto|item|pacote|embalagem))?\s*[:\-]?\s*([^\n]+)/i,/Peso\s+(?:líquido|liquido|bruto)\s*[:\-]?\s*([^\n]+)/i]); put('Peso do produto',weight);
  if(weight){const wm=String(weight).match(/([\d.,]+)\s*(kg|kgs|quilogramas?|g|gr|gramas?)?/i);if(wm){const raw=String(wm[1]||'').trim(),unit=String(wm[2]||'').toLowerCase();let w=num(raw,0);if(/^kg|^quilo/.test(unit))w*=1000;else if(!unit&&w>0&&w<50&&/[,.]/.test(raw))w*=1000;if(w>0)patch.weight_g=Math.round(w);}}
  const mounted=firstMatch(text,[/Dimens(?:[oõ]es|ão)(?:\s+(?:do|da))?\s*(?:produto|montad[ao]|embalagem|pacote)?\s*:\s*([^\n]+)/i,/Medidas(?:\s+(?:do|da))?\s*(?:produto|embalagem|pacote)?\s*:\s*([^\n]+)/i]); put('Dimensões montada',mounted);
  let dm=mounted.match(/([\d.,]+)\s*(?:cm)?\s*(?:altura|a)\s*[xX×]\s*([\d.,]+)\s*(?:cm)?\s*(?:largura|l)\s*[xX×]\s*([\d.,]+)\s*(?:cm)?\s*(?:comprimento|c|profundidade)?/i) || mounted.match(/([\d.,]+)\s*(?:cm)?\s*[xX×]\s*([\d.,]+)\s*(?:cm)?\s*[xX×]\s*([\d.,]+)\s*(?:cm)?/i);
  if(!dm){const h=firstMatch(text,[/Altura\s*:\s*([\d.,]+)\s*cm/i]),w=firstMatch(text,[/Largura\s*:\s*([\d.,]+)\s*cm/i]),l=firstMatch(text,[/(?:Comprimento|Profundidade)\s*:\s*([\d.,]+)\s*cm/i]);if(h&&w&&l)dm=[null,h,w,l];}
  if(dm){const h=num(dm[1],0),w=num(dm[2],0),l=num(dm[3],0);if(h)patch.height_cm=h;if(w)patch.width_cm=w;if(l)patch.length_cm=l;patch.dimensions=`${dm[1]} cm altura x ${dm[2]} cm largura x ${dm[3]} cm comprimento`;put('Altura do produto',`${dm[1]} cm`);put('Largura do produto',`${dm[2]} cm`);put('Comprimento do produto',`${dm[3]} cm`);}
  const specLine=mounted; if(specLine&&!attrs['Dimensões montada'])put('Dimensões montada',specLine);
  const included=sectionLines(text,/^Itens inclusos\s*:?$/i,[/^Especifica[cç][oõ]es\s*:?$/i,/^Cont[eé]m\s*:?$/i]);
  const contains=sectionLines(text,/^Cont[eé]m\s*:?$/i,[/^Especifica[cç][oõ]es\s*:?$/i,/^Descri[cç][aã]o/i]);
  const content=[...new Set([...included,...contains])].filter(x=>x.length>1).slice(0,30); if(content.length){patch.package_content=content.join('\n');put('Itens inclusos',content.join(' | '));}
  const specs=sectionLines(text,/^Especifica[cç][oõ]es\s*:?$/i,[/^Cont[eé]m\s*:?$/i,/^Itens inclusos\s*:?$/i]);
  for(const line of specs){const m=line.match(/^([^:]{2,45})\s*:\s*(.+)$/);if(m)put(m[1],m[2]);}
  // Mantém como benefícios/dados factuais, sem transformar o texto inteiro do fornecedor em descrição final.
  const featureCandidates=[];
  if(qty)featureCandidates.push(`Kit com ${qty}`);if(material)featureCandidates.push(`Material: ${material}`);if(age)featureCandidates.push(`Idade recomendada: ${age}`);if(inmetro)featureCandidates.push(`Registro INMETRO: ${inmetro}`);if(mounted)featureCandidates.push(`Dimensões montada: ${mounted}`);
  if(featureCandidates.length)patch.features=featureCandidates.join('; ');
  patch.supplierDetailCapture={source:'WeDrop · página copiada',capturedAt:new Date().toISOString(),fields:found};
  return {patch,supplierAttributes:attrs,found};
}

function parseSkuText(input){
  const arr=Array.isArray(input)?input:String(input||'').split(/[\n;,\t ]+/);
  return [...new Set(arr.map(clean).filter(Boolean))];
}
function detectHeaders(rows=[]){ return rows[0]?Object.keys(rows[0]).map(clean).filter(Boolean):[]; }
function chooseCatalogSheet(workbook, XLSX){
  let best=null;
  for(const name of workbook.SheetNames||[]){
    const rows=XLSX.utils.sheet_to_json(workbook.Sheets[name],{defval:''});
    const products=rows.map(normalizeSupplierRow).filter(p=>p.sku);
    const candidate={sheetName:name,rows,products,headers:detectHeaders(rows)};
    if(!best||products.length>best.products.length) best=candidate;
  }
  return best||{sheetName:'',rows:[],products:[],headers:[]};
}

function catalogAgeHours(meta){
  const at=Date.parse(meta?.uploadedAt||meta?.refreshedAt||''); if(!Number.isFinite(at))return Infinity;
  return Math.max(0,(Date.now()-at)/3600000);
}
function catalogFreshness(meta,maxAgeHours=24){
  const ageHours=catalogAgeHours(meta), max=Math.max(1,Number(maxAgeHours)||24);
  const stale=!Number.isFinite(ageHours)||ageHours>max;
  const warning=!stale&&ageHours>Math.max(1,max*0.75);
  return {stale,warning,ageHours:Number.isFinite(ageHours)?Math.round(ageHours*10)/10:null,maxAgeHours:max,remainingHours:Number.isFinite(ageHours)?Math.max(0,Math.round((max-ageHours)*10)/10):0};
}

function catalogHash(products=[]){
  return crypto.createHash('sha1').update(products.map(p=>`${normalizedSku(p.sku)}:${p.product}:${p.cost}`).join('|')).digest('hex').slice(0,12);
}
function mergeCatalog(oldProducts=[],newProducts=[]){
  const old=catalogIndex(oldProducts), fresh=catalogIndex(newProducts), merged=new Map(old);
  let added=0,updated=0,unchanged=0;
  for(const [sku,p] of fresh){
    if(!old.has(sku)){added++;merged.set(sku,p);continue;}
    const before=JSON.stringify(old.get(sku)); const after=JSON.stringify(p);
    if(before===after)unchanged++;else updated++; merged.set(sku,{...old.get(sku),...p});
  }
  const removed=[...old.keys()].filter(k=>!fresh.has(k)).length;
  return {products:[...merged.values()],stats:{added,updated,unchanged,removed,previous:old.size,incoming:fresh.size,total:merged.size}};
}
module.exports={clean,key,num,bool,availabilityState,explicitStockFromText,recoverStockQuantity,value,normalizeSupplierRow,normalizedSku,catalogIndex,mergeIntoProduct,refreshFromSupplier,parseSupplierDetailText,parseSkuText,chooseCatalogSheet,catalogHash,mergeCatalog,catalogAgeHours,catalogFreshness};
