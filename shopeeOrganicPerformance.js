// Desempenho orgânico por SKU: somente importações de Informações Gerenciais
// identificadas como tráfego NÃO PAGO. Nunca consultar endpoints Shopee Ads.
import * as XLSX from '@stackline/xlsx';
const TABLE='shopee_organic_performance_snapshots';
const PERFORMANCE_TABLE='shopee_product_performance_snapshots';
const LIMIT=4_000_000;
const MAX_ROWS=20000;
const names={
 sku:['sku','sku do produto','sku do anuncio','sku da variacao','seller sku','product sku','codigo do produto','codigo sku'],
 itemId:['item id','id do item','id do produto','id do anuncio','product id'],
 title:['nome do produto','titulo do produto','produto','product name','nome do anuncio'],
 impressions:['impressoes','impressoes de produto','impressoes do produto','impressoes organicas','exibicoes organicas','exibicoes do produto','product impressions','organic impressions'],
 visits:['visitantes do produto','visitantes','visitas','visitas do produto','visitas organicas','visitas ao produto','product visitors','unique product visitors','product visits','product page views','visualizacoes de pagina do produto'],
 clicks:['cliques','cliques por produto','cliques do produto','cliques no produto','cliques organicos','product clicks','organic clicks'],
 ctr:['ctr','ctr %','ctr organico','taxa de cliques','taxa de cliques %','click through rate'],
 uniqueImpressions:['impressoes unicas de produto','impressoes unicas do produto','unique product impressions'],
 uniqueClicks:['cliques unicos no produto','cliques unicos de produto','unique product clicks'],
 pageViews:['visualizacoes da pagina do produto','visualizacoes da pagina','product page views'],
 searchClicks:['cliques em buscas','cliques nas buscas','search clicks'],
 cartVisitors:['visitantes (adicionar ao carrinho)','visitantes adicionar ao carrinho','visitantes que adicionaram ao carrinho','unique add to cart visitors'],
 cartUnits:['unidades (adicionar ao carrinho)','unidades adicionar ao carrinho','unidades adicionadas ao carrinho','add to cart units'],
 cartConversionRate:['taxa de conversao (adicionar ao carrinho)','taxa de conversao adicionar ao carrinho','taxa de conversao do carrinho','add to cart conversion rate'],
 orderConversionRate:['taxa de conversao de pedidos','taxa conversao de pedidos','order conversion rate'],
 orders:['pedidos','quantidade de pedidos','orders','total orders'],
 soldUnits:['unidades','unidades vendidas','itens vendidos','units sold','products sold'],
 cartAdded:['itens adicionados ao carrinho','produtos adicionados ao carrinho','unidades adicionadas ao carrinho','adicoes ao carrinho','adicionados ao carrinho','adicoes no carrinho','add to cart','add to cart units','items added to cart'],
 cartPending:['itens abandonados no carrinho','produtos abandonados no carrinho','unidades abandonadas no carrinho','itens deixados no carrinho','produtos deixados no carrinho','carrinhos abandonados','carrinhos parados','abandonos de carrinho','itens nao comprados no carrinho','cart abandonment units','abandoned cart units','abandoned carts'],
 cartAbandonmentRate:['taxa de abandono do carrinho','taxa de abandono de carrinho','taxa de abandono carrinho','abandono de carrinho %','porcentagem de abandono do carrinho','cart abandonment rate','abandoned cart rate','taxa de carrinho abandonado','taxa de carrinhos abandonados','taxa de abandono %'],
 traffic:['origem do trafego','fonte de trafego','origem trafego','tipo de trafego','traffic source','traffic type','canal de trafego']
};
const fold=x=>String(x??'').normalize('NFD').replace(/[\u0300-\u036f]/g,'')
 .toLowerCase().replace(/\s*\(.*?\)\s*/g,' ').replace(/[%:_\-\/]+/g,' ')
 .replace(/\s+/g,' ').trim();
const label=x=>String(x??'').trim();
// Preserve parentheses contents so visitors to product != visitors who added to cart.
const headerKey=x=>String(x??'').normalize('NFD').replace(/[\u0300-\u036f]/g,'')
 .toLowerCase().replace(/[()%:_\-/]+/g,' ').replace(/\s+/g,' ').trim();
function fields(header){
 const normalized=header.map(headerKey);
 const found={};
 for(const [key,alternatives] of Object.entries(names)){
  const opts=new Set(alternatives.map(headerKey));
  const idx=normalized.findIndex(value=>opts.has(value));
  if(idx!==-1)found[key]=idx;
 }
 return found;
}
export function parseOrganicCsv(text){
 const raw=String(text||'').replace(/^\uFEFF/,'');
 const first=raw.split(/\r?\n/,1)[0]||'';
 const candidates=[';',',','\t'];
 const delim=candidates.sort((a,b)=>first.split(b).length-first.split(a).length)[0];
 let quoted=false,cell='',row=[],rows=[];
 for(let i=0;i<raw.length;i++){
  const c=raw[i];
  if(c==='"'){
   if(quoted&&raw[i+1]==='"'){cell+='"';i++;}else quoted=!quoted;
  }else if(!quoted&&c===delim){row.push(cell);cell='';}
  else if(!quoted&&(c==='\r'||c==='\n')){
   if(c==='\r'&&raw[i+1]==='\n')i++;
   row.push(cell);cell='';
   if(row.some(x=>x.trim()))rows.push(row);
   row=[];
  }else cell+=c;
  if(rows.length>MAX_ROWS+12)throw Error('Relatório excede 20 mil SKUs. Divida o arquivo.');
 }
 if(quoted)throw Error('CSV com aspas não fechadas.');
 row.push(cell);if(row.some(x=>x.trim()))rows.push(row);
 return rows;
}
function workbookRows(buffer,fileName){
 const isExcel=/\.xlsx?$/i.test(fileName);
 const isCsv=/\.csv$/i.test(fileName);
 if(!isExcel&&!isCsv)throw Error('Importe somente CSV, XLS ou XLSX da Central do Vendedor.');
 if(!Buffer.isBuffer(buffer)||!buffer.length||buffer.length>LIMIT)
  throw Error('Relatório vazio ou maior que 4 MB.');
 if(isCsv){
  const decoded=new TextDecoder('utf-8',{fatal:false}).decode(buffer);
  return {rows:parseOrganicCsv(decoded),sheetName:'CSV'};
 }
 const xlsx=buffer[0]===0x50&&buffer[1]===0x4b;
 const xls=buffer.subarray(0,8).equals(Buffer.from([0xd0,0xcf,0x11,0xe0,0xa1,0xb1,0x1a,0xe1]));
 if(!xlsx&&!xls||/\.xlsx$/i.test(fileName)&&!xlsx||
    /\.xls$/i.test(fileName)&&!xls)
  throw Error('Conteúdo Excel não corresponde à extensão.');
 let book;
 try{book=XLSX.read(buffer,{type:'buffer',sheetRows:MAX_ROWS+12,
  bookVBA:false,bookProps:false});}
 catch{throw Error('Arquivo Excel corrompido ou protegido.');}
 const matched=[];
 for(const sheetName of (book.SheetNames||[]).slice(0,10)){
  const rows=XLSX.utils.sheet_to_json(book.Sheets[sheetName],{
   header:1,raw:false,defval:'',blankrows:false});
  if(rows.length>MAX_ROWS+12)throw Error('Relatório acima do limite de SKUs.');
  if(rows.some((r,i)=>i<8&&(fields(r).sku!==undefined||fields(r).itemId!==undefined)&&
    ['impressions','visits','clicks','ctr','cartAdded','cartPending','cartAbandonmentRate','cartVisitors','cartUnits','cartConversionRate','orders','orderConversionRate'].some(k=>fields(r)[k]!==undefined)))
   matched.push({rows,sheetName});
 }
 if(matched.length!==1)throw Error(matched.length?
  'Há várias abas com métricas. Mantenha apenas a aba orgânica.':
  'Não encontrei a aba com SKU e métricas de produto.');
 return matched[0];
}
function indexHeader(rows){
 for(let i=0;i<Math.min(25,rows.length);i++){
  const columns=fields(rows[i]||[]);
  if((columns.sku!==undefined||columns.itemId!==undefined)&&
     ['impressions','visits','clicks','ctr','cartAdded','cartPending','cartAbandonmentRate','cartVisitors','cartUnits','cartConversionRate','orders','orderConversionRate'].some(k=>columns[k]!==undefined))
   return {start:i+1,columns};
 }
 throw Error('Cabeçalho inválido. É necessário SKU ou Item ID e alguma métrica orgânica de alcance, cliques ou carrinho.');
}
function count(value){
 if(value===null||value===undefined||!String(value).trim())return null;
 const raw=String(value).trim().replace(/\s/g,'');
 const normalized=raw.includes(',')?raw.replace(/\./g,'').replace(',','.'):
  /^\d{1,3}(?:\.\d{3})+$/.test(raw)?raw.replace(/\./g,''):raw;
 if(!/^\d+(?:\.\d+)?$/.test(normalized))throw Error('Métrica com valor não numérico: '+raw.slice(0,40));
 const n=Number(normalized);
 if(!Number.isSafeInteger(n)||n<0)return null;
 return n;
}
const percent=x=>{
 const v=label(x);
 if(!v)return null;
 const n=Number(v.replace('%','').replace(/\s/g,'').replace(',','.'));
 return Number.isFinite(n)&&n>=0&&n<=100?n:null;
};
const isPaid=x=>{
 const source=fold(x);
 if(/\b(nao pago|sem ads|sem anuncios|organico|organic|gratuito)\b/.test(source))return false;
 return /\b(ads|pago|patrocinad|paid|sponsored|promovid|anunci)/.test(source);
};
const isOrganic=x=>/\b(organic|organico|nao pago|sem ads|sem anuncios|gratuit|busca|diret|direct|recomendac)/.test(fold(x));
export function parseOrganicReport(buffer,options={}){
 return parseProductReport(buffer,{...options,mode:'organic'});
}
export function parseProductPerformanceReport(buffer,options={}){
 return parseProductReport(buffer,{...options,mode:'performance'});
}
function parseProductReport(buffer,{
 fileName,periodStart,periodEnd,organicConfirmed=false,mode='organic'
}={}){
 if(mode==='organic'&&organicConfirmed!==true)
  throw Error('Confirme que o arquivo representa exclusivamente tráfego orgânico, sem Ads.');
 const validDate=x=>/^\d{4}-\d{2}-\d{2}$/.test(String(x||''))&&
   !Number.isNaN(Date.parse(x+'T00:00:00Z'));
 if(!validDate(periodStart)||!validDate(periodEnd)||periodStart>periodEnd)
  throw Error('Informe as datas inicial e final do período da Shopee.');
 const {rows,sheetName}=workbookRows(buffer,fileName);
 const {start,columns}=indexHeader(rows);
 const list=[],used=new Set(),skipped={paid:0,empty:0};
 for(const row of rows.slice(start)){
  if(!Array.isArray(row)||row.every(x=>!label(x)))continue;
  const sku=label(row[columns.sku]).slice(0,120);
  const itemId=label(row[columns.itemId]).replace(/\.0$/,'');
  if(!sku&&!/^[1-9]\d{0,18}$/.test(itemId)){skipped.empty++;continue;}
  if(columns.traffic!==undefined){
   const source=label(row[columns.traffic]);
   if(mode==='organic'){
    if(isPaid(source)){skipped.paid++;continue;}
    if(!isOrganic(source))
     throw Error('Origem de tráfego sem confirmação orgânica na SKU '+(sku||itemId)+
      '. Filtre o relatório para orgânico, sem Ads.');
   }
  }
  const metric={};
  for(const k of ['impressions','visits','clicks','cartAdded','cartPending','uniqueImpressions','uniqueClicks','pageViews','searchClicks','cartVisitors','cartUnits','orders','soldUnits'])
   metric[k]=columns[k]===undefined?null:count(row[columns[k]]);
  const ctr=columns.ctr===undefined?null:percent(row[columns.ctr]);
  const cartConversionRate=columns.cartConversionRate===undefined?null:percent(row[columns.cartConversionRate]);
  const orderConversionRate=columns.orderConversionRate===undefined?null:percent(row[columns.orderConversionRate]);
  const explicitAbandonment=columns.cartAbandonmentRate===undefined?
   null:percent(row[columns.cartAbandonmentRate]);
  // Só calcular abandono quando numerador e denominador medem a MESMA
  // unidade. Carrinhos, pessoas e unidades não são intercambiáveis.
  const basis=header=>{
   const name=fold(header||'');
   if(/itens|produtos|unidades|items|units/.test(name))return 'items';
   if(/carrinhos abandonados|abandoned carts/.test(name))return 'carts';
   return 'events';
  };
  const matchingBasis=columns.cartPending!==undefined&&columns.cartAdded!==undefined&&
   basis(rows[start-1][columns.cartPending])===basis(rows[start-1][columns.cartAdded]);
  if(matchingBasis&&metric.cartPending!==null&&metric.cartAdded!==null&&
     metric.cartPending>metric.cartAdded)
   throw Error('Carrinhos parados maiores que adições ao carrinho na SKU '+
    (sku||itemId)+'. Confirme os indicadores e suas unidades.');
  if(metric.impressions!==null&&metric.clicks!==null&&
    metric.clicks>metric.impressions)
   throw Error('Cliques maiores que impressões na SKU '+(sku||itemId)+
    '. Verifique se as colunas estão corretas.');
  if(Object.values(metric).every(v=>v===null)&&ctr===null&&explicitAbandonment===null&&cartConversionRate===null&&orderConversionRate===null)continue;
  const id=sku||'#'+itemId;
  if(used.has(id))throw Error('SKU repetida: '+id+
   '. Use um relatório consolidado por SKU e período.');
  used.add(id);
  const computed=metric.impressions>0&&metric.clicks!==null?
   Number((100*metric.clicks/metric.impressions).toFixed(2)):null;
  const cartRate=explicitAbandonment!==null?explicitAbandonment:
   matchingBasis&&metric.cartPending!==null&&metric.cartAdded>0?
    Number((metric.cartPending/metric.cartAdded*100).toFixed(2)):null;
  const cartCountKind=columns.cartPending===undefined?null:
   basis(rows[start-1][columns.cartPending]);
  list.push({sku,itemId:/^[1-9]\d{0,18}$/.test(itemId)?itemId:'',
   title:label(row[columns.title]).slice(0,220),
   impressions:metric.impressions,visits:metric.visits,clicks:metric.clicks,
   ctr:ctr===null?computed:ctr,
   uniqueImpressions:metric.uniqueImpressions,uniqueClicks:metric.uniqueClicks,
   pageViews:metric.pageViews,searchClicks:metric.searchClicks,
   cartVisitors:metric.cartVisitors,cartUnits:metric.cartUnits,
   cartConversionRate,orders:metric.orders,soldUnits:metric.soldUnits,orderConversionRate,
   cartAdded:metric.cartAdded,cartPending:metric.cartPending,
   cartAbandonmentRate:cartRate,cartRateSource:explicitAbandonment!==null?
    'reported':cartRate!==null?'calculated':'unavailable',
   cartCountKind});
  if(list.length>MAX_ROWS)throw Error('Relatório excede 20 mil linhas.');
 }
 if(!list.length)throw Error('Não encontrei SKUs com métricas orgânicas válidas.');
 const metricAvailability=Object.fromEntries(['impressions','visits','clicks','ctr','cartAdded','cartPending','cartAbandonmentRate','cartVisitors','cartUnits','cartConversionRate','orders','orderConversionRate','uniqueImpressions','uniqueClicks','pageViews','searchClicks','soldUnits'].map(k=>
  [k,list.some(r=>r[k]!==null)]));
 return {records:list,periodStart,periodEnd,fileName:String(fileName).slice(0,180),
  sheetName,metricAvailability,skipped,source:mode==='organic'?'seller_center_organic_export':'seller_center_product_performance_export'};
}
export function rankOrganicTop(records,{sort='combined',limit=10}={}){
 const keys=['impressions','visits','clicks','ctr','cartAdded','cartPending','cartAbandonmentRate','cartVisitors','cartUnits','cartConversionRate','orders','orderConversionRate'];
 if(!['combined',...keys].includes(sort))sort='combined';
 const recordsSafe=(Array.isArray(records)?records:[]).filter(x=>x&&(x.sku||x.itemId));
 const max=Object.fromEntries(keys.map(k=>[k,Math.max(0,...recordsSafe.map(x=>
  Number.isFinite(Number(x[k]))&&x[k]!==null?Number(x[k]):0))]));
 // O ranking principal permanece baseado em alcance orgânico; sinais de
 // carrinho só podem ser escolhidos como ordenação explícita.
 const weights={impressions:.3,visits:.3,clicks:.3,ctr:.1,
  cartAdded:0,cartPending:0,cartAbandonmentRate:0,cartVisitors:0,cartUnits:0,cartConversionRate:0,orders:0,orderConversionRate:0};
 const scored=recordsSafe.map(row=>{
  let score=0,weight=0;
  for(const key of keys){
   if(!weights[key]||row[key]===null||row[key]===undefined||!max[key])continue;
   // Limita o efeito de outliers. CTR só pesa com amostra razoável.
   if(key==='ctr'&&Number(row.impressions||0)<30)continue;
   const m=key==='ctr'?Number(row[key])/max[key]:
    Math.log1p(Number(row[key]))/Math.log1p(max[key]);
   score+=weights[key]*m;weight+=weights[key];
  }
  return {...row,score:weight?Number((100*score/weight).toFixed(1)):0};
 });
 scored.sort((a,b)=>{
  if(sort!=='combined'){
   const av=a[sort],bv=b[sort];
   return (bv===null?-Infinity:Number(bv))-(av===null?-Infinity:Number(av))||
    b.score-a.score||String(a.sku||a.itemId).localeCompare(String(b.sku||b.itemId));
  }
  return b.score-a.score||Number(b.impressions||0)-Number(a.impressions||0)||
   String(a.sku||a.itemId).localeCompare(String(b.sku||b.itemId));
 });
 return scored.slice(0,Math.max(1,Math.min(limit,10)));
}
function config(){
 const url=String(process.env.SUPABASE_URL||'').replace(/\/$/,'');
 const key=String(process.env.SUPABASE_SECRET_KEY||process.env.SUPABASE_SERVICE_ROLE_KEY||'').trim();
 if(!url||!key)throw Error('Supabase não configurado para dados orgânicos.');
 const headers={apikey:key,Accept:'application/json','Content-Type':'application/json'};
 if(/^eyJ[A-Za-z0-9_-]*\./.test(key))headers.Authorization='Bearer '+key;
 return {url,headers};
}
const shop=id=>{
 const n=Number(id);if(!Number.isSafeInteger(n)||n<=0)throw Error('Shop ID inválido.');
 return n;
};
async function db(shopId,{method='GET',data,table=TABLE}={}){
 const {url,headers}=config();
 const query=method==='POST'?'?on_conflict=shop_id&select=*':
  '?shop_id=eq.'+shop(shopId)+'&select=*&limit=1';
 const response=await fetch(url+'/rest/v1/'+table+query,{
  method,headers:{...headers,...(method==='POST'?{
   Prefer:'resolution=merge-duplicates,return=representation'}:{})},
  ...(data?{body:JSON.stringify(data)}:{}),signal:AbortSignal.timeout(20000)
 });
 if(!response.ok)throw Error('Banco de desempenho orgânico HTTP '+response.status);
 return response.json();
}
export async function readOrganicSnapshot(shopId){
 const result=await db(shopId);
 return result?.[0]||null;
}
export async function saveOrganicSnapshot(shopId,report){
 if(!report?.records?.length)throw Error('Relatório orgânico vazio.');
 const data={shop_id:shop(shopId),period_start:report.periodStart,
  period_end:report.periodEnd,file_name:report.fileName,source:report.source,
  row_count:report.records.length,records:report.records,
  metadata:{metrics:report.metricAvailability,sheetName:report.sheetName,
   excludedPaidRows:report.skipped.paid,rowsWithoutIdentity:report.skipped.empty},
  imported_at:new Date().toISOString(),updated_at:new Date().toISOString()};
 const saved=await db(shopId,{method:'POST',data:[data]});
 if(saved?.length!==1)throw Error('Relatório não confirmado pelo banco.');
 return saved[0];
}

export async function readPerformanceSnapshot(shopId){
 const result=await db(shopId,{table:PERFORMANCE_TABLE});
 return result?.[0]||null;
}
export async function savePerformanceSnapshot(shopId,report){
 if(report?.source!=='seller_center_product_performance_export'||!report?.records?.length)
  throw Error('Relatório de Performance do Produto inválido.');
 const data={shop_id:shop(shopId),period_start:report.periodStart,
  period_end:report.periodEnd,file_name:report.fileName,source:report.source,
  row_count:report.records.length,records:report.records,
  metadata:{metrics:report.metricAvailability,sheetName:report.sheetName,
   rowsWithoutIdentity:report.skipped.empty,trafficScope:'not_separated_from_ads'},
  imported_at:new Date().toISOString(),updated_at:new Date().toISOString()};
 const saved=await db(shopId,{method:'POST',data:[data],table:PERFORMANCE_TABLE});
 if(saved?.length!==1)throw Error('Relatório de Performance do Produto não confirmado.');
 return saved[0];
}
