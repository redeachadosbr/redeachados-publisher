// Tráfego da LOJA: a fonte vem exclusivamente da exportação da Central do Vendedor.
// As visualizações por Item ID e a Performance do Produto são fontes DISTINTAS.
// Nenhum clique de carrinho significa, por si só, abandono de carrinho.
import * as XLSX from '@stackline/xlsx';
const TABLE='shopee_store_traffic_snapshots';
const MAX_BYTES=4_000_000,MAX_ROWS=20_000;
const fold=value=>String(value??'').normalize('NFD').replace(/[\u0300-\u036f]/g,'')
  .toLowerCase().replace(/[()%:_\/\-]+/g,' ').replace(/\s+/g,' ').trim();
const safe=v=>String(v??'').trim();
const labels={
 source:['fontes de trafego','fonte de trafego','origem do trafego','origem de trafego','traffic source','traffic sources','source'],
 impressions:['impressoes de produto','impressoes do produto','impressoes de produtos','impressoes','product impressions','impressions'],
 clicks:['cliques por produto','cliques de produto','cliques do produto','cliques no produto','cliques','product clicks','clicks'],
 sales:['vendas','valor de vendas','valor das vendas','receita de vendas','vendas brutas','valor vendido','sales','gmv','revenue'],
 orders:['pedidos','pedido','pedidos feitos','pedido feito','numero de pedidos','orders'],
 sku:['sku principal','sku do produto','seller sku','product sku','sku'],
 itemId:['item id','id do item','id do produto','item_id','product id'],
 title:['nome do produto','titulo do produto','product name','nome do anuncio']
};
const findHeader=rows=>{
 for(let i=0;i<Math.min(rows.length,25);i++){
  const header=(rows[i]||[]).map(fold),cols={};
  for(const [k,alts] of Object.entries(labels)){
   const set=new Set(alts.map(fold)),p=header.findIndex(v=>set.has(v));
   if(p>=0)cols[k]=p;
  }
  if(cols.source!==undefined&&['impressions','clicks','sales','orders'].some(k=>cols[k]!==undefined))
   return {index:i,cols};
 }
 return null;
};
function csvRows(text){
 const raw=String(text).replace(/^\uFEFF/,'');
 const first=raw.split(/\r?\n/,1)[0]||'';
 const delim=[';',',','\t'].sort((a,b)=>first.split(b).length-first.split(a).length)[0];
 let quoted=false,cell='',row=[],rows=[];
 for(let i=0;i<raw.length;i++){
  const c=raw[i];
  if(c==='"'){if(quoted&&raw[i+1]==='"'){cell+='"';i++;}else quoted=!quoted;}
  else if(!quoted&&c===delim){row.push(cell);cell='';}
  else if(!quoted&&(c==='\r'||c==='\n')){
   if(c==='\r'&&raw[i+1]==='\n')i++;
   row.push(cell);cell='';
   if(row.some(x=>safe(x)))rows.push(row);
   row=[];if(rows.length>MAX_ROWS+30)throw Error('Máximo de 20 mil linhas por arquivo.');
  }else cell+=c;
 }
 if(quoted)throw Error('CSV com aspas não fechadas.');
 row.push(cell);if(row.some(x=>safe(x)))rows.push(row);
 return rows;
}
function selectRows(buffer,fileName,sheetName=''){
 if(!Buffer.isBuffer(buffer)||!buffer.length||buffer.length>MAX_BYTES)
  throw Error('Arquivo vazio ou maior que 4 MB.');
 if(/\.csv$/i.test(fileName)){
  let contents=new TextDecoder('utf-8').decode(buffer);
  if(contents.includes('\uFFFD'))contents=new TextDecoder('windows-1252').decode(buffer);
  return {rows:csvRows(contents),sheetName:'CSV'};
 }
 if(!/\.xlsx?$/i.test(fileName))
  throw Error('Importe um CSV, XLS ou XLSX exportado de Tráfego do Produto.');
 const xlsx=buffer[0]===0x50&&buffer[1]===0x4b;
 const xls=buffer.subarray(0,8).equals(Buffer.from([0xd0,0xcf,0x11,0xe0,0xa1,0xb1,0x1a,0xe1]));
 if(!((/\.xlsx$/i.test(fileName)&&xlsx)||(/\.xls$/i.test(fileName)&&xls)))
  throw Error('O conteúdo do arquivo Excel não corresponde à extensão.');
 let book;
 try{book=XLSX.read(buffer,{type:'buffer',sheetRows:MAX_ROWS+30,bookVBA:false,bookProps:false});}
 catch{throw Error('Arquivo Excel ilegível ou protegido.');}
 const matches=[];
 for(const name of (book.SheetNames||[]).slice(0,12)){
  const rows=XLSX.utils.sheet_to_json(book.Sheets[name],{header:1,raw:false,defval:'',blankrows:false});
  if(findHeader(rows))matches.push({rows,sheetName:name});
 }
 if(!matches.length)throw Error('Não foi encontrada a coluna Fonte de Tráfego com indicadores de cliques, impressões, pedidos ou vendas.');
 const choice=sheetName?matches.find(m=>m.sheetName===sheetName):
  matches.length===1?matches[0]:null;
 if(!choice){
  const error=Error('O arquivo tem múltiplas abas de tráfego. Selecione uma aba para evitar somar relatórios distintos.');
  error.availableSheets=matches.map(m=>m.sheetName);throw error;
 }
 return choice;
}
function numeric(value,{money=false}={}){
 let raw=safe(value);
 if(!raw||/^[-–—]+$/.test(raw)||/^n\/?a$/i.test(raw))return null;
 raw=raw.replace(/^R\$\s*/i,'').replace(/\s/g,'');
 if(raw.startsWith('−'))raw='-'+raw.slice(1);
 if(raw.includes(',')&&raw.includes('.')){
  raw=raw.lastIndexOf(',')>raw.lastIndexOf('.')?
   raw.replace(/\./g,'').replace(',','.'):raw.replace(/,/g,'');
 }else if(raw.includes(',')){
  raw=raw.replace(/\./g,'').replace(',','.');
 }else if(/^\d{1,3}(?:\.\d{3})+$/.test(raw)){
  raw=raw.replace(/\./g,'');
 }
 if(!/^\d+(?:\.\d+)?$/.test(raw))throw Error('Valor não numérico no relatório: '+safe(value).slice(0,36));
 const n=Number(raw);
 if(!Number.isFinite(n)||n<0||n>1e13)throw Error('Valor fora do limite permitido.');
 if(!money&&!Number.isSafeInteger(n))throw Error('Impressões, cliques e pedidos devem ser números inteiros.');
 return money?Math.round(n*100)/100:n;
}
function sourceName(value){
 const s=fold(value);
 if(!s||['total','card do produto','cartao de produto','cartao do produto','todos'].includes(s))return null;
 if(/^(pesquisar|pesquisa|busca|search)$/.test(s))return 'Pesquisar';
 if(/carrinho/.test(s)||s==='shopping cart')return 'Carrinho de Compras';
 if(/recomend/.test(s)||s==='recommendation')return 'Recomendação';
 if(/minha compra/.test(s)||s==='my purchases')return 'Minha Compra';
 if(/promoc/.test(s)||s==='promotion')return 'Promoção';
 if(/^(loja|shop|store)$/.test(s))return 'Loja';
 if(/^(outros|others|other)$/.test(s))return 'Outros';
 return safe(value).slice(0,65);
}
function validDate(value){
 const s=safe(value);if(!/^\d{4}-\d{2}-\d{2}$/.test(s))return false;
 const d=new Date(s+'T00:00:00Z');return !Number.isNaN(d.getTime())&&d.toISOString().slice(0,10)===s;
}
export function parseStoreTrafficReport(buffer,{fileName='',periodStart='',periodEnd='',sheetName=''}={}){
 if(!validDate(periodStart)||!validDate(periodEnd)||periodStart>periodEnd)
  throw Error('Informe as datas exatas do período exibido na Central do Vendedor.');
 const parsed=selectRows(buffer,String(fileName),sheetName);
 const {rows}=parsed,header=findHeader(rows);if(!header)throw Error('Cabeçalho de origem de tráfego não reconhecido.');
 const {cols}=header,records=[],seen=new Set();let skippedTotals=0;
 for(const row of rows.slice(header.index+1)){
  if(!Array.isArray(row)||row.every(v=>!safe(v)))continue;
  const source=sourceName(row[cols.source]);
  if(!source){skippedTotals++;continue;}
  const read=k=>cols[k]===undefined?null:numeric(row[cols[k]],{money:k==='sales'});
  const sku=cols.sku===undefined?'':safe(row[cols.sku]).slice(0,120);
  const itemId=cols.itemId===undefined?'':safe(row[cols.itemId]).replace(/\.0$/,'');
  const productId=/^[1-9]\d{0,18}$/.test(itemId)?itemId:'';
  const key=source+'|'+(productId?'#'+productId:sku||'LOJA');
  if(seen.has(key))throw Error('Fonte repetida para '+key+'. Escolha um relatório consolidado; não serão duplicadas vendas.');
  seen.add(key);
  const rec={source,sku,itemId:productId,title:cols.title===undefined?'':safe(row[cols.title]).slice(0,200),
   impressions:read('impressions'),clicks:read('clicks'),sales:read('sales'),orders:read('orders')};
  if(['impressions','clicks','sales','orders'].every(k=>rec[k]===null))continue;
  records.push(rec);
  if(records.length>MAX_ROWS)throw Error('Relatório ultrapassou 20 mil registros.');
 }
 if(!records.length)throw Error('Nenhuma fonte de tráfego com dados foi encontrada neste arquivo.');
 // Não somar linhas gerais e linhas por SKU na mesma importação.
 const hasShop=records.some(x=>!x.sku&&!x.itemId),hasSku=records.some(x=>x.sku||x.itemId);
 if(hasShop&&hasSku)throw Error('O arquivo mistura resumo da loja e linhas por SKU. Exporte uma única visão para não duplicar vendas.');
 return {records,periodStart,periodEnd,fileName:String(fileName).slice(0,180),
  sheetName:parsed.sheetName,source:'seller_center_traffic_sources_export',
  metadata:{scope:hasSku?'sku_by_source':'shop_sources',skippedTotalRows:skippedTotals,
   metrics:Object.fromEntries(['impressions','clicks','sales','orders'].map(k=>[k,records.some(x=>x[k]!==null)]))}};
}
const totalMetric=(rows,key)=>rows.some(x=>x[key]===null)?null:
 Math.round(rows.reduce((sum,r)=>sum+Number(r[key]||0),0)*(key==='sales'?100:1))/(key==='sales'?100:1);
export function summarizeStoreTraffic(records){
 const groups=new Map();
 for(const r of Array.isArray(records)?records:[]){
  if(!r?.source)continue;
  if(!groups.has(r.source))groups.set(r.source,[]);
  groups.get(r.source).push(r);
 }
 const sources=[...groups].map(([source,rows])=>({
  source,impressions:totalMetric(rows,'impressions'),clicks:totalMetric(rows,'clicks'),
  sales:totalMetric(rows,'sales'),orders:totalMetric(rows,'orders'),
  skuCount:rows.filter(x=>x.sku||x.itemId).length
 }));
 const total={impressions:totalMetric(sources,'impressions'),
  clicks:totalMetric(sources,'clicks'),sales:totalMetric(sources,'sales'),orders:totalMetric(sources,'orders')};
 for(const source of sources){
  source.ctr=source.impressions>0&&source.clicks!==null?
   Number((100*source.clicks/source.impressions).toFixed(2)):null;
  source.salesShare=total.sales>0&&source.sales!==null?
   Number((100*source.sales/total.sales).toFixed(2)):null;
  source.clickShare=total.clicks>0&&source.clicks!==null?
   Number((100*source.clicks/total.clicks).toFixed(2)):null;
 }
 sources.sort((a,b)=>(b.sales??-1)-(a.sales??-1)||(b.clicks??-1)-(a.clicks??-1));
 total.ctr=total.impressions>0&&total.clicks!==null?
  Number((100*total.clicks/total.impressions).toFixed(2)):null;
 return {total,sources};
}
export function diagnoseStoreTraffic(sources){
 const get=name=>sources.find(r=>r.source===name);
 const result=[],search=get('Pesquisar'),recs=get('Recomendação'),cart=get('Carrinho de Compras');
 if(search&&search.salesShare!==null&&search.salesShare>=40)
  result.push({id:'seo',level:'opportunity',source:'Pesquisar',
   title:'Pesquisa é uma das principais origens de vendas',
   why:String(search.salesShare).replace('.',',')+'% do valor de vendas dos cards veio da Pesquisa.',
   action:'Priorizar auditoria de títulos SEO, termos de busca, capas e preço competitivo; confirmar resultados por SKU.'});
 if(recs&&recs.clicks>=30&&search&&search.clicks>=30&&search.sales!==null&&recs.sales!==null){
  const revSearch=search.sales/search.clicks,revRec=recs.sales/recs.clicks;
  if(revSearch>0&&revRec<revSearch*.5)
   result.push({id:'recommendation',level:'investigate',source:'Recomendação',
    title:'Menor receita atribuída por clique em Recomendações',
    why:'A relação R$/clique é inferior à metade da Pesquisa neste período (não é taxa de conversão).',
    action:'Conferir ofertas, frete, preço final e desempenho dos produtos recomendados antes de editar anúncios.'});
 }
 if(cart?.clicks>0)
  result.push({id:'cart',level:'opportunity',source:'Carrinho de Compras',
   title:'Há vendas originadas do Carrinho de Compras',
   why:String(cart.clicks)+' cliques vieram do Carrinho; cliques não representam abandonos.',
   action:'Relacionar adições ao carrinho, pedidos e abandono real quando disponíveis; avaliar frete, cupons e preço final.'});
 for(const name of ['Promoção','Loja']){
  const r=get(name);
  if(r&&r.clicks>=10&&r.sales===0)result.push({id:fold(name),level:'investigate',source:name,
   title:'Acessos sem vendas atribuídas em '+name,
   why:String(r.clicks)+' cliques e nenhuma venda atribuída no período.',
   action:name==='Loja'?'Revisar vitrine, organização e destaque dos produtos.':
    'Revisar elegibilidade das promoções, exposição e margem, sem aplicar descontos automáticos.'});
 }
 return result;
}
function config(){
 const url=String(process.env.SUPABASE_URL||'').replace(/\/$/,'');
 const key=String(process.env.SUPABASE_SECRET_KEY||process.env.SUPABASE_SERVICE_ROLE_KEY||'').trim();
 if(!url||!key)throw Error('Armazenamento Supabase não configurado.');
 const headers={apikey:key,Accept:'application/json','Content-Type':'application/json'};
 if(/^eyJ[A-Za-z0-9_-]*\./.test(key))headers.Authorization='Bearer '+key;
 return {url,headers};
}
function shopId(id){const n=Number(id);if(!Number.isSafeInteger(n)||n<=0)throw Error('Shop ID inválido.');return n;}
async function request(shop,options={}){
 const {url,headers}=config(),saving=Boolean(options.save);
 const params=saving?'?on_conflict=shop_id,period_start,period_end&select=*':
  '?shop_id=eq.'+shopId(shop)+'&select=*&order=imported_at.desc&limit=8';
 const response=await fetch(url+'/rest/v1/'+TABLE+params,{
  method:saving?'POST':'GET',
  headers:{...headers,...(saving?{Prefer:'resolution=merge-duplicates,return=representation'}:{})},
  ...(saving?{body:JSON.stringify(options.rows)}:{}),
  signal:AbortSignal.timeout(20000)
 });
 if(!response.ok)throw Error('Armazenamento do relatório de tráfego indisponível (HTTP '+response.status+').');
 return response.json();
}
export async function readStoreTrafficSnapshots(shop){return request(shop);}
export async function saveStoreTrafficSnapshot(shop,report){
 if(!report?.records?.length||report.source!=='seller_center_traffic_sources_export')
  throw Error('Relatório de fontes inválido.');
 const row={shop_id:shopId(shop),period_start:report.periodStart,period_end:report.periodEnd,
  source:report.source,file_name:report.fileName,row_count:report.records.length,
  records:report.records,metadata:{...report.metadata,sheetName:report.sheetName},
  imported_at:new Date().toISOString()};
 const result=await request(shop,{save:true,rows:[row]});
 if(result?.length!==1)throw Error('A importação não foi confirmada no banco.');
 return result[0];
}
