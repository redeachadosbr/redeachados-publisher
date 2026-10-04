require('dotenv').config();
const express = require('express');
const session = require('express-session');
const helmet = require('helmet');
const multer = require('multer');
const XLSX = require('xlsx');
const crypto = require('crypto');
const path = require('path');
const fs = require('fs');
const axios = require('axios');
const {Store} = require('./store');
const ML = require('./ml');
const ImageStudio = require('./imageStudio');
const CE = require('./commercialEngine');
const MarketPro = require('./marketpro');
const SupplierCatalog = require('./supplierCatalog');
const Variations = require('./variations');
const Opportunity = require('./opportunityEngine');
const KitEngine = require('./kitEngine');
const Accounting = require('./accountingEngine');
const Promotion = require('./promotionEngine');
const Research = require('./researchEngine');
const VideoMatcher = require('./videoMatcher');
const SupplierVision = require('./supplierVision');
const SEO = require('./seoEngine');
const AdsEngine = require('./adsEngine');
const Monitoring = require('./monitoringEngine');
const OpsCopilot = require('./opsCopilot');
const DailyOps = require('./dailyOps');
const StockEngine = require('./stockEngine');

const app = express();
// Render terminates HTTPS at a reverse proxy. Trust the first proxy so secure session cookies are persisted correctly.
app.set('trust proxy', 1);
const store = new Store();
const upload = multer({storage:multer.memoryStorage(),limits:{fileSize:100*1024*1024}});
const imageUpload = multer({storage:multer.memoryStorage(),limits:{fileSize:25*1024*1024,files:9},fileFilter:(req,file,cb)=>{if(/^image\//i.test(file.mimetype||''))return cb(null,true);cb(new Error('Envie somente arquivos de imagem (JPG, PNG ou WEBP).'));}});
const videoUpload = multer({storage:multer.memoryStorage(),limits:{fileSize:180*1024*1024,files:1},fileFilter:(req,file,cb)=>{if(/video\/(mp4|quicktime)|application\/octet-stream/i.test(file.mimetype||''))return cb(null,true);cb(new Error('Envie vídeo MP4/MOV de até 180 MB.'));}});
const MANUAL_VIDEO_DIR=path.join(ImageStudio.MEDIA_DIR,'manual-videos'); fs.mkdirSync(MANUAL_VIDEO_DIR,{recursive:true});
const PORT = process.env.PORT || 10000;
const SITE = process.env.ML_SITE_ID || 'MLB';
const BASE = process.env.APP_BASE_URL || `http://localhost:${PORT}`;
const REDIRECT = process.env.ML_REDIRECT_URI || `${BASE}/auth/mercadolivre/callback`;

app.use(helmet({contentSecurityPolicy:false}));
app.use(express.json({limit:'10mb'})); app.use(express.urlencoded({extended:true}));
app.use(session({secret:process.env.SESSION_SECRET || crypto.randomBytes(32).toString('hex'),resave:false,saveUninitialized:false,proxy:true,cookie:{httpOnly:true,sameSite:'lax',secure:BASE.startsWith('https'),maxAge:12*60*60*1000}}));
app.use(express.static(path.join(__dirname,'..','public')));
// V1.8.76 — cliente/core compatíveis, diagnóstico e 404 real para arquivos OCR ausentes.
require('./ocrAssets').mountOcrAssets(app);
app.use('/generated', express.static(ImageStudio.MEDIA_DIR, {maxAge:'1h'}));

function id(){ return crypto.randomUUID(); }
function n(v,d=0){ const x=Number(String(v??'').replace(',','.').replace(/[^0-9.-]/g,'')); return Number.isFinite(x)?x:d; }
function clean(s){ return String(s??'').replace(/\s+/g,' ').trim(); }
function passwordHash(password,salt=crypto.randomBytes(16).toString('hex')){
  const hash=crypto.scryptSync(String(password||''),salt,64).toString('hex');
  return `${salt}:${hash}`;
}
function passwordMatches(password,stored){
  try{const [salt,hash]=String(stored||'').split(':');if(!salt||!hash)return false;const got=crypto.scryptSync(String(password||''),salt,64);const expected=Buffer.from(hash,'hex');return got.length===expected.length&&crypto.timingSafeEqual(got,expected)}catch(_){return false}
}
function publicOperator(u){return u?{id:u.id,name:u.name,username:u.username,role:u.role||'operator'}:null}
async function ensureSeedOperator(){
  if(store.getUsers().length)return;
  const username=clean(process.env.APP_LOGIN_USER||''),password=String(process.env.APP_LOGIN_PASSWORD||''),name=clean(process.env.APP_LOGIN_NAME||'Administrador Rede Achados');
  if(username&&password){await store.addUser({id:id(),username:username.toLowerCase(),name,passwordHash:passwordHash(password),role:'admin',active:true,createdAt:new Date().toISOString(),source:'env-seed'});}
}
function requireOperator(req,res,next){if(req.session?.operator?.id)return next();return res.status(401).json({error:'Faça login para acessar o Publisher.',loginRequired:true});}
function requireAdmin(req,res,next){if(req.session?.operator?.role==='admin')return next();return res.status(403).json({error:'Somente o administrador pode gerenciar operadores.'});}

function databaseBootReady(){
  const db=store.getDbState?.()||{};
  return !db.configured || db.initialized===true;
}
function databaseReconnectingPayload(){
  const db=store.getDbState?.()||{};
  return {error:'Conexão com o banco oscilou. O Publisher está reconectando automaticamente e manterá sua sessão aberta. Aguarde a recuperação; não repita comandos de gravação enquanto este aviso estiver ativo.',code:'DB_RECONNECTING',retryable:true,safeToRetry:true,database:db};
}
// A interface continua navegável usando o estado já carregado em memória. Antes de qualquer
// gravação, porém, confirmamos o PostgreSQL. Se ele estiver oscilando, esperamos/reconectamos
// ANTES de entrar na rota, tornando seguro o retry automático do frontend.
app.use(async(req,res,next)=>{
  const db=store.getDbState?.()||{};
  if(!db.configured)return next();
  if(req.path==='/health'||req.path.startsWith('/assets/')||!req.path.startsWith('/api/')&&!req.path.startsWith('/auth/mercadolivre'))return next();
  if(db.initialized!==true)return res.status(503).json(databaseReconnectingPayload());
  const mutating=!['GET','HEAD','OPTIONS'].includes(String(req.method||'GET').toUpperCase()) || req.path.startsWith('/auth/mercadolivre');
  if(!mutating)return next();
  if(db.connected!==false)return next();
  const recovered=await store.ensureConnected?.(4);
  if(recovered)return next();
  return res.status(503).json(databaseReconnectingPayload());
});

function cleanMultiline(s){ return SEO.cleanMultiline(s); }
function preserveMultiline(s){ return String(s??'').replace(/\r\n?/g,'\n').trim(); }
function supplierAttrValue(p,...names){
  const attrs=p?.supplierAttributes||{};
  const wanted=names.map(x=>SEO.key(x));
  for(const [k,v] of Object.entries(attrs)){if(wanted.includes(SEO.key(k))&&clean(v))return clean(v);}
  return '';
}
function recoveredProductName(p){
  const current=clean(p?.product||p?.nome||p?.title);
  if(!SEO.generic(current))return current;
  return supplierAttrValue(p,'Nome do Produto','Nome Produto','Produto','Descrição do Produto','Descricao Produto')||current;
}
function seo(product){
  const source=recoveredProductName(product);
  const parts=[source,product.brand||product.marca,product.model||product.modelo,product.color||product.cor,product.capacity||product.capacidade,product.power||product.potencia].map(clean).filter(Boolean);
  const generated=[...new Set(parts.join(' ').split(' '))].join(' ').slice(0,60).trim();
  const existingTitle=clean(product.seoTitle);
  const title=!SEO.generic(existingTitle)&&existingTitle!==clean(product.brand)?existingTitle:generated;
  const generatedModel=[product.model||product.modelo,source].map(clean).filter(Boolean).join(' ').slice(0,120);
  const model=clean(product.seoModelExpanded||product.seoModel)||generatedModel;
  // Descrição é persistente: uma descrição já salva nunca é reformatada por nova pesquisa.
  const description=preserveMultiline(product.description)||SEO.buildDescription({...product,product:source,seoTitle:title,seoModelExpanded:model});
  return {seoTitle:title,seoModel:model,description};
}

function normAttr(v){return clean(v).normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^a-z0-9]+/g,' ').trim();}
function normalizeAttrTags(raw){
  if(Array.isArray(raw))return Object.fromEntries(raw.map(x=>[String(x||''),true]));
  return raw&&typeof raw==='object'?raw:{};
}
function technicalAttributeDescriptor(a){
  const tags=normalizeAttrTags(a?.tags);
  const required=Boolean(tags.required||tags.new_required);
  return {
    id:clean(a?.id),name:clean(a?.name||a?.id),value_type:clean(a?.value_type),value_max_length:a?.value_max_length||null,
    values:(a?.values||[]).slice(0,120),required,new_required:Boolean(tags.new_required),catalog_required:Boolean(tags.catalog_required||tags.catalog_listing_required),
    conditional_required:Boolean(tags.conditional_required),allow_variations:Boolean(tags.allow_variations),variation_attribute:Boolean(tags.variation_attribute),
    hierarchy:clean(a?.hierarchy)||'ITEM',relevance:Number(a?.relevance||0)||0,attribute_group_id:clean(a?.attribute_group_id)||'OTHERS',
    attribute_group_name:clean(a?.attribute_group_name)||'Outros',allowed_units:(a?.allowed_units||[]).slice(0,30),default_unit:clean(a?.default_unit),tags
  };
}
function technicalSpecInputDescriptors(raw){
  const out=[];
  for(const group of Array.isArray(raw?.groups)?raw.groups:[]){
    for(const component of Array.isArray(group?.components)?group.components:[]){
      for(const attr of Array.isArray(component?.attributes)?component.attributes:[]){
        if(!attr?.id)continue;
        const tags=normalizeAttrTags(attr.tags);
        out.push(technicalAttributeDescriptor({...attr,tags,attribute_group_id:group.id||attr.attribute_group_id||'OTHERS',attribute_group_name:group.label||attr.attribute_group_name||'Ficha técnica'}));
      }
    }
  }
  return out;
}
function mergeTechnicalSchemas(...lists){
  const map=new Map();
  for(const list of lists){for(const raw of Array.isArray(list)?list:[]){if(!raw?.id)continue;const a=raw.value_type||raw.required!==undefined?raw:technicalAttributeDescriptor(raw),id=String(a.id);const prev=map.get(id);if(!prev){map.set(id,{...a});continue;}map.set(id,{...prev,...a,required:Boolean(prev.required||a.required),new_required:Boolean(prev.new_required||a.new_required),conditional_required:Boolean(prev.conditional_required||a.conditional_required),catalog_required:Boolean(prev.catalog_required||a.catalog_required),tags:{...normalizeAttrTags(prev.tags),...normalizeAttrTags(a.tags)},values:(a.values?.length?a.values:prev.values)||[],allowed_units:(a.allowed_units?.length?a.allowed_units:prev.allowed_units)||[]});}}
  return [...map.values()].filter(visibleTechnicalAttribute);
}
function itemAttributeText(a){
  if(!a)return '';
  if(a.value_struct&&a.value_struct.number!=null)return `${a.value_struct.number}${a.value_struct.unit?` ${a.value_struct.unit}`:''}`.trim();
  return clean(a.value_name||a.values?.[0]?.name||a.value_id||'');
}
function itemAttributeMap(item){const m=new Map();for(const a of Array.isArray(item?.attributes)?item.attributes:[]){if(a?.id)m.set(String(a.id),itemAttributeText(a));}return m;}
function conditionalAttributePayload(item={}){
  return {title:item.title||'',category_id:item.category_id||'',price:n(item.price),currency_id:item.currency_id||'BRL',available_quantity:Math.max(0,n(item.available_quantity)),buying_mode:item.buying_mode||'buy_it_now',condition:item.condition||'new',listing_type_id:item.listing_type_id||'gold_special',attributes:Array.isArray(item.attributes)?item.attributes:[]};
}
async function qualityTechnicalSchema(t,item={}){
  const categoryId=clean(item.category_id);if(!categoryId)return {schema:[],conditionalIds:[],technicalInputAvailable:false};
  let category=[],tech=null,conditional=null;
  try{category=await ML.categoryAttributes(t,categoryId)}catch(_){category=[]}
  try{tech=await ML.categoryTechnicalSpecsInput(t,categoryId)}catch(_){tech=null}
  try{conditional=await ML.categoryConditionalAttributes(t,categoryId,conditionalAttributePayload(item))}catch(_){conditional=null}
  const categoryDesc=(Array.isArray(category)?category:[]).map(technicalAttributeDescriptor),techDesc=technicalSpecInputDescriptors(tech);
  const conditionalRaw=Array.isArray(conditional?.required_attributes)?conditional.required_attributes:[],conditionalIds=conditionalRaw.map(x=>String(x?.id||x)).filter(Boolean);
  const conditionalDesc=conditionalRaw.filter(x=>x&&typeof x==='object'&&x.id).map(x=>technicalAttributeDescriptor({...x,tags:{...normalizeAttrTags(x.tags),required:true,conditional_required:true}}));
  const schema=mergeTechnicalSchemas(categoryDesc,techDesc,conditionalDesc).map(a=>conditionalIds.includes(String(a.id))?{...a,required:true,conditional_required:true}:a);
  return {schema,conditionalIds,technicalInputAvailable:Boolean(tech),categoryId};
}
function attributePayloadForDescriptor(desc,value){
  const normalized=normalizeMlAttributeValue(desc?.id,value,desc);if(!normalized)return null;
  const allowed=Array.isArray(desc?.values)?desc.values:[];const exact=allowed.find(x=>normAttr(x?.name)===normAttr(normalized));
  return exact?.id?{id:desc.id,value_id:String(exact.id)}:{id:desc.id,value_name:normalized};
}
function manualTechnicalField(a={},item={},extra={}){
  const existing=itemAttributeMap(item),id=String(a?.id||extra.id||'');
  return {
    id,name:a?.name||extra.name||id,value_type:a?.value_type||extra.value_type||'',default_unit:a?.default_unit||extra.default_unit||'',
    section:a?.attribute_group_name||extra.section||'Ficha técnica',source:extra.source||'technical_specs',currentValue:extra.currentValue!==undefined?clean(extra.currentValue):clean(existing.get(id)),
    issue:extra.issue||'missing',required:Boolean(a?.required),new_required:Boolean(a?.new_required),conditional_required:Boolean(a?.conditional_required),catalog_required:Boolean(a?.catalog_required),
    relevance:Number(a?.relevance||0)||0,values:(Array.isArray(a?.values)?a.values:[]).slice(0,120).map(v=>({id:v?.id!=null?String(v.id):'',name:clean(v?.name)})).filter(v=>v.name),
    allowed_units:(Array.isArray(a?.allowed_units)?a.allowed_units:[]).slice(0,30).map(u=>typeof u==='string'?u:clean(u?.name||u?.id)).filter(Boolean),manualFieldMode:extra.manualFieldMode||'exact'
  };
}
function catalogQualityMissing(cq={},schema=[],item={}){
  const ad=cq?.adoption_status||{},groups=['required','ft','all','pi'],ids=[];
  for(const g of groups)for(const id of (ad?.[g]?.missing_attributes||[]))if(id&&!ids.includes(String(id)))ids.push(String(id));
  return ids.map(id=>{const a=(schema||[]).find(x=>String(x.id)===id)||{id,name:id};return manualTechnicalField(a,item,{source:'catalog_quality'});});
}
function qualityMissingAttributes(schema,item,catalogQuality=null){
  const existing=itemAttributeMap(item);
  const base=(schema||[]).filter(a=>a.required&&!clean(existing.get(String(a.id)))).map(a=>manualTechnicalField(a,item,{source:'technical_specs',currentValue:'',issue:'missing'}));
  const merged=new Map(base.map(x=>[String(x.id),x]));
  // IMPORTANTE: catalog_quality/missing_attributes também pode indicar um atributo já
  // preenchido, porém com valor que o Mercado Livre considera insuficiente para qualidade.
  // Por isso não descartamos o atributo só porque existe value_name no item.
  for(const x of catalogQualityMissing(catalogQuality||{},schema,item)){
    const currentValue=clean(existing.get(String(x.id)));
    merged.set(String(x.id),{...(merged.get(String(x.id))||{}),...x,currentValue,issue:currentValue?'low_quality':'missing'});
  }
  return [...merged.values()];
}
function performanceAttributeManualFields(schema=[],item={},attributePending=[]){
  const existing=itemAttributeMap(item),rows=(schema||[]).filter(visibleTechnicalAttribute),raw=JSON.stringify(attributePending||[]),rawUpper=raw.toUpperCase(),rawNorm=normAttr(raw);
  const exact=[];
  for(const a of rows){
    const id=String(a.id||''),nameNorm=normAttr(a.name||'');if(!id)continue;
    const idHit=rawUpper.includes(id.toUpperCase()),nameHit=nameNorm.length>=4&&rawNorm.includes(nameNorm);
    if(idHit||nameHit)exact.push(manualTechnicalField(a,item,{source:'performance',issue:clean(existing.get(id))?'low_quality':'missing',manualFieldMode:'exact'}));
  }
  if(exact.length)return [...new Map(exact.map(x=>[String(x.id),x])).values()].sort((a,b)=>Number(b.required)-Number(a.required)||b.relevance-a.relevance).slice(0,12);
  const empty=rows.filter(a=>!clean(existing.get(String(a.id))));
  const priority=empty.filter(a=>a.required||a.new_required||a.conditional_required||a.catalog_required);
  const pool=priority.length?priority:empty,limit=priority.length?12:1;
  return pool.sort((a,b)=>Number(Boolean(b.required||b.new_required||b.conditional_required||b.catalog_required))-Number(Boolean(a.required||a.new_required||a.conditional_required||a.catalog_required))||Number(b.relevance||0)-Number(a.relevance||0)).slice(0,limit).map(a=>manualTechnicalField(a,item,{source:'performance_fallback',issue:'missing',manualFieldMode:priority.length?'required':'candidate'}));
}
function saleTermDescriptor(a){
  const tags=a?.tags||{};
  return {id:clean(a?.id),name:clean(a?.name||a?.id),value_type:clean(a?.value_type),value_max_length:a?.value_max_length||null,values:(a?.values||[]).slice(0,120),required:Boolean(tags.required||tags.new_required),allowed_units:(a?.allowed_units||[]).slice(0,30),default_unit:clean(a?.default_unit),hierarchy:clean(a?.hierarchy)||'SALE_TERMS',attribute_group_id:clean(a?.attribute_group_id)||'OTHERS',attribute_group_name:clean(a?.attribute_group_name)||'Condições de venda',tags};
}
function visibleTechnicalAttribute(a){
  if(!a?.id)return false; const tags=normalizeAttrTags(a.tags); const id=String(a.id).toUpperCase();
  if(tags.hidden||tags.new_hidden||tags.read_only)return false;
  if(['SELLER_SKU','ITEM_CONDITION'].includes(id))return false;
  return true;
}
function visibleSaleTerm(a){
  if(!a?.id)return false;const tags=normalizeAttrTags(a.tags);if(tags.hidden||tags.new_hidden||tags.read_only)return false;
  const id=String(a.id||'').toUpperCase(),nm=normAttr(a.name||'');const required=Boolean(tags.required||tags.new_required);
  const platformManaged=/LOYALTY|RECURR|CHECKOUT|EXCHANGE_RATE|BUYER|INSTALLMENT|PAYMENT|PRICE_PER/i.test(id)||/loyalty|compra recorrente|taxa de cambio|taxa de câmbio|checkout|parcelamento|preco por ser nivel|preço por ser nível/i.test(nm);
  return required||!platformManaged;
}

function normalizeMlNumberUnitText(value,{defaultUnit=''}={}){
  const raw=clean(value); if(!raw)return '';
  const simplified=raw.replace(/(acima\s+de|a\s+partir\s+de|desde|mais\s+de|maior\s+que|até|ate|no\s+mínimo|no\s+minimo|mínimo|minimo|máximo|maximo|menos\s+de|menor\s+que)/giu,' ').replace(/\+/g,' ').replace(/\s+/g,' ').trim();
  const m=simplified.match(/(-?\d+(?:[\.,]\d+)?)\s*([a-zA-ZÀ-ÿµμ]+)?/u); if(!m)return raw;
  const number=String(m[1]).replace(',','.');
  let unit=clean(m[2]||defaultUnit).toLowerCase();
  const units={
    'ano':'anos','anos':'anos','a':'anos',
    'mes':'meses','mês':'meses','meses':'meses',
    'semana':'semanas','semanas':'semanas',
    'dia':'dias','dias':'dias',
    'hora':'h','horas':'h','h':'h',
    'minuto':'m','minutos':'m','min':'m','m':'m',
    'segundo':'s','segundos':'s','s':'s',
    'milissegundo':'ms','milissegundos':'ms','ms':'ms',
    'microssegundo':'us','microssegundos':'us','µs':'us','μs':'us','us':'us'
  };
  unit=units[unit]||unit;
  return `${number}${unit?` ${unit}`:''}`.trim();
}
function normalizeMlPlainNumberText(value){
  const raw=clean(value); if(!raw)return '';
  const m=raw.match(/-?\d+(?:[\.,]\d+)?/); if(!m)return raw;
  const numeric=String(m[0]).replace(',','.');
  return numeric.replace(/\.0+$/,'');
}
function normalizeMlAttributeValue(id,value,descriptor=null){
  const aid=String(id||'').toUpperCase(); const raw=clean(value); if(!raw)return '';
  const valueType=clean(descriptor?.value_type).toLowerCase();
  // O ML valida atributos `number` como valor estritamente numérico: "52 peças" deve ser "52".
  if(valueType==='number'||['NUMBER_OF_PIECES','UNITS_PER_PACK','UNITS_PER_PACKAGE'].includes(aid))return normalizeMlPlainNumberText(raw);
  // `number_unit` aceita número + unidade. Aplicar a todos os atributos desse tipo, não só idade.
  if(valueType==='number_unit'||['MIN_RECOMMENDED_AGE','MAX_RECOMMENDED_AGE'].includes(aid)){
    const allowed=(descriptor?.allowed_units||[]).map(x=>clean(x?.id||x?.name||x)).filter(Boolean);
    const fallbackAge=['MIN_RECOMMENDED_AGE','MAX_RECOMMENDED_AGE'].includes(aid)?'anos':'';
    const defaultUnit=clean(descriptor?.default_unit)||allowed[0]||fallbackAge;
    let normalized=normalizeMlNumberUnitText(raw,{defaultUnit});
    if(allowed.length){
      const m=normalized.match(/^(-?\d+(?:\.\d+)?)\s*(.*)$/); 
      if(m){
        const typed=clean(m[2]).toLowerCase();
        const exact=allowed.find(u=>clean(u).toLowerCase()===typed)||(!typed?defaultUnit:'');
        if(exact)normalized=`${m[1]} ${exact}`.trim();
      }
    }
    return normalized;
  }
  return raw;
}

function effectiveAttributeValue(p,id){
  id=String(id||'').toUpperCase();
  const direct=p?.manualAttributes?.[id]??p?.attributeValues?.[id]; if(clean(direct))return clean(direct);
  if(id==='MODEL')return clean(p?.model); // MODEL é factual. Nunca usar palavras-chave sazonais/SEO como modelo do fabricante.
  if(id==='BRAND')return clean(p?.brand);
  if(id==='GTIN')return clean(p?.gtin);
  // O Mercado Livre pode exigir as dimensões da embalagem como atributos condicionais no momento do POST /items.
  if(['SELLER_PACKAGE_HEIGHT','PACKAGE_HEIGHT'].includes(id)&&n(p?.height_cm)>0)return String(Math.round(n(p.height_cm)));
  if(['SELLER_PACKAGE_WIDTH','PACKAGE_WIDTH'].includes(id)&&n(p?.width_cm)>0)return String(Math.round(n(p.width_cm)));
  if(['SELLER_PACKAGE_LENGTH','PACKAGE_LENGTH'].includes(id)&&n(p?.length_cm)>0)return String(Math.round(n(p.length_cm)));
  if(['SELLER_PACKAGE_WEIGHT','PACKAGE_WEIGHT'].includes(id)&&n(p?.weight_g)>0)return String(Math.round(n(p.weight_g)));
  return '';
}
function attributeFilled(p,id){return Boolean(effectiveAttributeValue(p,id));}
function saleTermFilled(p,id){return Boolean(clean(p?.manualSaleTerms?.[id]??p?.saleTermValues?.[id]??''));}
function technicalCoverage(p){
  const all=(p?.technicalAttributes||p?.requiredAttributes||[]).filter(a=>a?.id);
  const required=all.filter(a=>a.required===true||p?.requiredAttributes?.some?.(r=>r.id===a.id));
  const filledReq=required.filter(a=>attributeFilled(p,a.id)).length;
  const filledAll=all.filter(a=>attributeFilled(p,a.id)).length;
  const sale=(p?.saleTerms||[]).filter(a=>a?.id),saleRequired=sale.filter(a=>a.required===true),saleFilled=sale.filter(a=>saleTermFilled(p,a.id)).length,saleRequiredFilled=saleRequired.filter(a=>saleTermFilled(p,a.id)).length;
  return {
    requiredTotal:required.length,requiredFilled:filledReq,requiredMissing:required.filter(a=>!attributeFilled(p,a.id)).map(a=>({id:a.id,name:a.name||a.id,section:a.attribute_group_name||'Ficha técnica'})),requiredPercent:required.length?Math.round(filledReq/required.length*100):100,
    total:all.length,filled:filledAll,fullPercent:all.length?Math.round(filledAll/all.length*100):100,
    saleTermsTotal:sale.length,saleTermsFilled:saleFilled,saleTermsRequired:saleRequired.length,saleTermsRequiredFilled:saleRequiredFilled,saleTermsMissing:saleRequired.filter(a=>!saleTermFilled(p,a.id)).map(a=>({id:a.id,name:a.name||a.id,section:'Condições de venda'})),saleTermsPercent:sale.length?Math.round(saleFilled/sale.length*100):100
  };
}
function publicationFieldAudit(p){
  const cov=p?.technicalCoverage||technicalCoverage(p);const missing=[];
  if(!p?.category_id)missing.push({id:'CATEGORY',name:'Categoria Mercado Livre',section:'Identidade do anúncio'});
  if(!clean(p?.seoTitle||p?.product))missing.push({id:'SEO_TITLE',name:'Título SEO principal',section:'SEO'});
  if(!clean(p?.seoModelExpanded||p?.seoModel||p?.model))missing.push({id:'SEO_MODEL',name:'Modelo SEO / segunda busca',section:'SEO'});
  for(const x of cov.requiredMissing||[])missing.push(x);
  for(const x of cov.saleTermsMissing||[])missing.push(x);
  if(!preserveMultiline(p?.description))missing.push({id:'DESCRIPTION',name:'Descrição',section:'Descrição'});
  const uniqMissing=[];const seen=new Set();for(const x of missing){const k=`${x.section}:${x.id}`;if(!seen.has(k)){seen.add(k);uniqMissing.push(x)}}
  return {ready:uniqMissing.length===0,count:uniqMissing.length,missing:uniqMissing};
}

function publicationFamilyName(p){
  const raw=clean(p?.family_name||recoveredProductName(p)||p?.product||p?.seoTitle||p?.sku||'Produto');
  return raw.replace(/[✨⭐🔥🚀🎁✅✔️]/gu,' ').replace(/\s+/g,' ').trim().slice(0,120)||`Produto ${clean(p?.sku)}`.slice(0,120);
}
function itemConditionValueId(condition){const c=clean(condition).toLowerCase();if(c==='used')return '2230581';if(c==='refurbished'||c==='reconditioned')return '2230582';return '2230284';}
function mlPublishErrorDetails(data={}){
  const causes=Array.isArray(data?.cause)?data.cause:[];
  const messages=causes.map(c=>clean(c?.message)).filter(Boolean);
  const codes=causes.map(c=>clean(c?.code)).filter(Boolean);
  const missing=[];
  for(const msg of messages){
    const m=msg.match(/missing (?:the following properties: )?\[([^\]]+)\]/i);if(m)missing.push(...m[1].split(',').map(x=>x.trim()).filter(Boolean));
    const a=msg.match(/attributes? \[([^\]]+)\] (?:are|is) required/i);if(a)missing.push(...a[1].split(',').map(x=>x.trim()).filter(Boolean));
  }
  const uniqueMissing=[...new Set(missing)];
  let base=messages[0]||clean(data?.message)||clean(data?.error)||'Mercado Livre recusou a publicação.';
  if(/provided number is not valid/i.test(base)){const m=base.match(/Attribute\s+([A-Z0-9_]+).*?with value\s+(.+?)\s+was omitted/i);if(m)base=`O Mercado Livre recusou o formato do atributo ${m[1]} (${m[2]}). O valor precisa ser numérico e usar uma unidade válida, por exemplo: 3 anos ou 36 meses.`;}
  return {message:uniqueMissing.length?`Mercado Livre exige campo(s) adicional(is): ${uniqueMissing.join(', ')}. ${base}`:base,codes:[...new Set(codes)],missingFields:uniqueMissing,causes};
}
function hasPayloadAttribute(payload,id){return (payload?.attributes||[]).some(a=>String(a?.id||'').toUpperCase()===String(id||'').toUpperCase()&&(clean(a?.value_name)||clean(a?.value_id)));}
function buildMlFormSchema(p){
  const attrs=(p?.technicalAttributes||[]).filter(a=>a?.id);const groups={};
  for(const a of attrs){const gid=a.attribute_group_id||'OTHERS',gname=a.attribute_group_name||'Outros';groups[gid] ||= {id:gid,name:gname,attributes:[]};groups[gid].attributes.push(a);}
  const variations=attrs.filter(a=>a.allow_variations||a.variation_attribute||a.hierarchy==='CHILD_PK');
  const main=attrs.filter(a=>a.attribute_group_id==='MAIN'||a.hierarchy==='PARENT_PK'||a.relevance===1).filter(a=>!variations.some(v=>v.id===a.id));
  const mainIds=new Set(main.map(a=>a.id));
  const secondaryGroups=Object.values(groups).map(g=>({...g,attributes:g.attributes.filter(a=>!mainIds.has(a.id)&&!variations.some(v=>v.id===a.id))})).filter(g=>g.attributes.length);
  return {version:3,category_id:p?.category_id||'',category_name:p?.category_name||'',domain_id:p?.domain_id||'',generatedAt:new Date().toISOString(),flow:['estoque_sku','titulo_seo','variacoes','codigo_universal','caracteristicas_principais','caracteristicas_secundarias','condicoes_venda','midia','descricao','revisao'],variationAttributes:variations,mainAttributes:main,secondaryGroups,saleTerms:(p?.saleTerms||[]),categorySpecific:true,audit:publicationFieldAudit(p)};
}
function physicalAttributeKind(a={}){
  const id=String(a?.id||'').toUpperCase(),name=normAttr(a?.name||a?.id||'');
  // Nunca confundir peso/altura/largura do próprio produto com capacidade, limite ou medida máxima suportada.
  // Ex.: MAX_WEIGHT_SUPPORTED não é o peso do produto e só pode ser preenchido se a WeDrop trouxer esse dado explicitamente.
  const unsafe=/\b(max|maximo|maxima|min|minimo|minima|suport|carga|capacidade|limite|ajust|recomend)\b/i.test(name)||/(^|_)(MAX|MIN)(_|$)|SUPPORTED|CAPACITY|LOAD/i.test(id);
  if(unsafe)return '';
  if(/HEIGHT/.test(id)||/(^| )altura( |$)/.test(name))return 'height';
  if(/WIDTH/.test(id)||/(^| )largura( |$)/.test(name))return 'width';
  if(/LENGTH|DEPTH/.test(id)||/(comprimento|profundidade)/.test(name))return 'length';
  if(/DIAMETER/.test(id)||/diametro/.test(name))return 'diameter';
  if(/WEIGHT/.test(id)||/(^| )peso( |$)/.test(name))return 'weight';
  return '';
}
function inferAttributeValue(a,p){
  const id=String(a?.id||'').toUpperCase(), name=normAttr(a?.name||'');
  const supplier=p?.supplierAttributes||{};
  for(const [k,v] of Object.entries(supplier)){
    const nk=normAttr(k);
    if(nk&&(nk===normAttr(a?.name)||nk===normAttr(a?.id))&&clean(v))return {value:clean(v),source:`WeDrop · ${clean(k)}`,confidence:'high',matchedColumn:clean(k)};
  }
  const pick=(v,unit='')=>clean(v)?`${clean(v)}${unit?` ${unit}`:''}`:'';
  if(id==='BRAND'&&p.brand)return {value:clean(p.brand),source:'WeDrop',confidence:'high'};
  if(id==='MODEL'&&(p.model||p.seoModelExpanded||p.seoModel))return {value:clean(p.model||p.seoModelExpanded||p.seoModel),source:p.model?'WeDrop':'SEO · busca secundária',confidence:p.model?'high':'medium'};
  if(id==='GTIN'&&p.gtin)return {value:clean(p.gtin),source:'WeDrop',confidence:'high'};
  if(id==='COLOR'&&p.color)return {value:clean(p.color),source:'WeDrop',confidence:'high'};
  if(id==='MATERIAL'&&p.material)return {value:clean(p.material),source:'WeDrop',confidence:'high'};
  if(id==='VOLTAGE'&&p.voltage)return {value:clean(p.voltage),source:'WeDrop',confidence:'high'};
  if(id==='CAPACITY'&&p.capacity)return {value:clean(p.capacity),source:'WeDrop',confidence:'high'};
  if(id==='SIZE'&&p.size)return {value:clean(p.size),source:'WeDrop',confidence:'high'};
  const physical=physicalAttributeKind(a);
  if(physical==='height'&&p.height_cm)return {value:pick(p.height_cm,'cm'),source:'WeDrop · Altura',confidence:'high',matchedColumn:'Altura (cm)'};
  if(physical==='width'&&p.width_cm)return {value:pick(p.width_cm,'cm'),source:'WeDrop · Largura',confidence:'high',matchedColumn:'Largura (cm)'};
  if(physical==='length'&&p.length_cm)return {value:pick(p.length_cm,'cm'),source:'WeDrop · Comprimento',confidence:'high',matchedColumn:'Comprimento (cm)'};
  if(physical==='diameter'&&p.diameter_cm)return {value:pick(p.diameter_cm,'cm'),source:'WeDrop · Diâmetro',confidence:'high'};
  if(physical==='weight'&&p.weight_g)return {value:pick(p.weight_g,'g'),source:'WeDrop · Peso do produto',confidence:'high',matchedColumn:'Peso'};
  const aliases=[
    [/inmetro|certifica|registro/,['Registro Inmetro','Registro INMETRO','Certificação Inmetro','Certificacao Inmetro','Número de registro INMETRO','Numero de registro INMETRO','INMETRO']],
    [/idade.*min|idade.*recom|minimum.*age/,['Idade mínima recomendada','Idade minima recomendada','Idade recomendada','Faixa etária','Faixa etaria']],
    [/quantidade.*pec|pieces.*number|pecas.*quant/,['Quantidade de peças','Quantidade','Capacidade']],
    [/pecas.*inclu|itens.*inclu|included.*items/,['Peças incluídas','Pecas incluidas','Itens inclusos','Conteúdo','Conteudo']],
    [/potencia|power/,['Potência','Potencia','Power']],
    [/frequencia|frequency/,['Frequência','Frequencia','Frequency']],
    [/capacidade/,['Capacidade','Capacity','Quantidade de peças']],
    [/material/,['Material','Composição','Composicao']],
    [/cor|color/,['Cor','Color']],
    [/altura.*produto|product.*height/,['Altura do produto','Altura montada']],
    [/largura.*produto|product.*width/,['Largura do produto','Largura montada']],
    [/comprimento.*produto|product.*length/,['Comprimento do produto','Comprimento montada']],
  ];
  for(const [re,names] of aliases){if(re.test(name)||re.test(id.toLowerCase())){const v=supplierAttrValue(p,...names);if(v)return {value:v,source:'WeDrop',confidence:'medium'};}}
  return null;
}
function supplierAssistForField(a={},p={},supplierFound=false){
  const inferred=inferAttributeValue(a,p),id=String(a?.id||''),name=clean(a?.name||id),norm=normAttr(name),upper=id.toUpperCase();
  if(inferred?.value&&String(inferred.source||'').startsWith('WeDrop'))return {found:true,value:inferred.value,source:inferred.source,matchedColumn:inferred.matchedColumn||'',confidence:inferred.confidence||'medium'};
  let note='O catálogo WeDrop foi consultado, mas este dado não apareceu com correspondência segura.';
  if(/MAX_WEIGHT_SUPPORTED|peso maximo suportado/.test(`${upper} ${norm}`))note='Peso do produto e peso máximo suportado são informações diferentes. O Publisher não usará o peso do produto como capacidade suportada.';
  else if(/MAX.*HEIGHT|altura maxima/.test(`${upper} ${norm}`))note='Altura do produto e altura máxima suportada são informações diferentes; não vou copiar uma para a outra.';
  return {found:false,value:'',source:supplierFound?'WeDrop':'Catálogo WeDrop não localizado para esta SKU',matchedColumn:'',confidence:'none',note};
}
function decorateManualFieldsWithSupplier(fields=[],p={},supplierFound=false){
  return (fields||[]).map(x=>({...x,supplierAssist:supplierAssistForField(x,p,supplierFound)}));
}

function supplierVisionPatch(v={}){
  const patch={},attrs={},found=[];const set=(field,value)=>{if(value!==null&&value!==undefined&&String(value).trim()!==''){patch[field]=value;found.push(field)}};const attr=(name,value)=>{if(value!==null&&value!==undefined&&String(value).trim()!==''){attrs[name]=clean(value);found.push(name)}};
  set('product',clean(v.product));set('brand',clean(v.brand));set('model',clean(v.model));set('gtin',clean(v.gtin));set('color',clean(v.color));set('material',clean(v.material));
  for(const f of ['height_cm','width_cm','length_cm','diameter_cm','weight_g']){const val=n(v[f],0);if(val>0)set(f,f==='weight_g'?Math.round(val):val)}
  if(patch.height_cm&&patch.width_cm&&patch.length_cm)set('dimensions',`${patch.height_cm} cm altura x ${patch.width_cm} cm largura x ${patch.length_cm} cm comprimento`);else if(clean(v.dimensions_text))set('dimensions',clean(v.dimensions_text));
  set('package_content',clean(v.package_content));set('features',clean(v.features));
  attr('Registro INMETRO',v.inmetro);attr('Idade recomendada',v.recommended_age);attr('Idade mínima recomendada',v.minimum_age);attr('Quantidade de peças',v.quantity_pieces);attr('Com luzes',v.with_lights);attr('Com som',v.with_sound);attr('Inclui estojo',v.includes_case);attr('Cor',v.color);attr('Composição',v.material);
  if(patch.height_cm)attr('Altura do produto',`${patch.height_cm} cm`);if(patch.width_cm)attr('Largura do produto',`${patch.width_cm} cm`);if(patch.length_cm)attr('Comprimento do produto',`${patch.length_cm} cm`);if(patch.weight_g)attr('Peso do produto',`${patch.weight_g} g`);
  if(v.other_attributes&&typeof v.other_attributes==='object')for(const [k,val] of Object.entries(v.other_attributes))attr(k,val);
  if(clean(v.shipping_dimensions_source))attrs['Fonte das medidas para frete']=clean(v.shipping_dimensions_source);
  return {patch,supplierAttributes:attrs,found:[...new Set(found)]};
}

function stockIsAvailable(p){
  const st=clean(p?.availability_status).toLowerCase();
  if(st==='unavailable') return false;
  if(st==='available') return !(p?.stock_quantity_known===true && n(p?.stock,0)<=0);
  return n(p?.stock||p?.estoque,0)>0;
}
function desiredStockTarget(p){
  const remote=Number(p?.ml_available_quantity);
  // V1.8.48: depois que existe MLB, o Mercado Livre é a fonte operacional do estoque.
  // O catálogo WeDrop pode estar desatualizado (ex.: 0 local e 100 no ML) e nunca deve
  // provocar reposição/zeragem automática de um anúncio já publicado.
  if(p?.ml_item_id&&Number.isFinite(remote))return {quantity:Math.max(0,Math.floor(remote)),exact:true,source:'mercadolivre_remote'};
  const local=Math.max(0,Math.floor(n(p?.stock,0)));
  if(p?.stock_quantity_known===true || local>1)return {quantity:local,exact:true,source:p?.stock_quantity_known===true?'supplier_exact':'local_numeric_recovered'};
  if(p?.publishedStockTarget!=null && n(p.publishedStockTarget,0)>1)return {quantity:Math.max(0,Math.floor(n(p.publishedStockTarget,0))),exact:false,source:'published_target'};
  if(clean(p?.availability_status).toLowerCase()==='available')return {quantity:Math.max(1,local),exact:false,source:'availability_fallback'};
  return {quantity:local,exact:p?.stock_quantity_known===true,source:'local'};
}
function publishQuantity(p){return desiredStockTarget(p).quantity}
async function refreshProductStockFromSupplier(p){
  if(!p?.sku)return p;
  const sp=store.findSupplierSku(p.sku); if(!sp)return p;
  const fresh=SupplierCatalog.refreshFromSupplier(p,sp);
  // SKU já publicada: WeDrop fica apenas como fotografia informativa do catálogo.
  // O estoque operacional continua sendo o valor lido diretamente do Mercado Livre.
  if(p?.ml_item_id){
    const supplierStockSnapshot={quantity:Math.max(0,Math.floor(n(fresh.stock,0))),known:Boolean(fresh.stock_quantity_known),availabilityStatus:fresh.availability_status||'unknown',availabilityRaw:fresh.availability_raw||'',source:fresh.stock_source||'wedrop_catalog',checkedAt:new Date().toISOString()};
    await store.updateProduct(p.id,{supplierStockSnapshot,catalogMatch:fresh.catalogMatch}).catch(()=>{});
    return {...p,supplierStockSnapshot,catalogMatch:fresh.catalogMatch};
  }
  const before=JSON.stringify([p.stock,p.stock_quantity_known,p.availability_status,p.availability_raw]);
  const after=JSON.stringify([fresh.stock,fresh.stock_quantity_known,fresh.availability_status,fresh.availability_raw]);
  if(before!==after){
    await store.updateProduct(p.id,{stock:fresh.stock,stock_quantity_known:fresh.stock_quantity_known,stock_source:fresh.stock_source||p.stock_source||'',availability_status:fresh.availability_status,availability_raw:fresh.availability_raw,catalogMatch:fresh.catalogMatch});
  }
  return {...p,stock:fresh.stock,stock_quantity_known:fresh.stock_quantity_known,stock_source:fresh.stock_source||p.stock_source||'',availability_status:fresh.availability_status,availability_raw:fresh.availability_raw,catalogMatch:fresh.catalogMatch};
}
function quality(p){ let score=0, issues=[]; const aiReady=(p.imageStudio?.approvedCount||0)>=9; const checks=[['SKU',p.sku,8],['Produto',p.product||p.nome||p.title,12],['Custo',n(p.cost||p.custo)>0,8],['Preço',n(p.priceRecommendation?.grossUploadPrice||p.commercialAnalysis?.pricingRecommendation?.grossUploadPrice||p.price||p.preco)>0,8],['GTIN/EAN',p.gtin||p.ean,8],['Marca',p.brand||p.marca,8],['Modelo/SEO',p.model||p.modelo||p.seoModelExpanded,8],['Categoria',p.category_id,8],['Fotos fornecedor',Array.isArray(p.images)&&p.images.length>=1,5],['9 fotos aprovadas',aiReady,12],['Disponibilidade',stockIsAvailable(p),5],['Dimensões completas',CE.dimensionsParam(p),5],['Análise comercial',p.commercialAnalysis?.bestScenario,5]]; checks.forEach(([label,ok,pts])=>{if(ok)score+=pts;else issues.push(label)}); return {score:Math.min(100,score),issues,aiReady}; }
function normalizeRow(row,i){
  const get=(...keys)=>{for(const k of keys){const found=Object.keys(row).find(x=>x.trim().toLowerCase()===k.toLowerCase());if(found&&row[found]!=null)return row[found];}return ''};
  const urls=[];
  for(const [k,v] of Object.entries(row)){ if(/(imagem|image|foto|picture)/i.test(k) && !/(embalagem|packaging)/i.test(k)) String(v||'').split(/[;,\n]/).forEach(x=>{x=x.trim();if(/^https?:\/\//i.test(x))urls.push(x)}); }
  const imageStr=get('imagens','images','fotos','pictures','foto_url','image_url'); String(imageStr||'').split(/[;,\n]/).forEach(x=>{x=x.trim();if(/^https?:\/\//i.test(x))urls.push(x)});
  const p={id:id(),row:i+2,sku:clean(get('sku','seller_sku','código','codigo')),product:clean(get('produto','product','nome','title','titulo')),cost:n(get('custo','cost','preço custo','preco custo')),price:n(get('preço','preco','price','valor')),stock:n(get('estoque','stock','quantidade'),0),gtin:clean(get('gtin','ean','ean13')),brand:clean(get('marca','brand')),model:clean(get('modelo','model')),color:clean(get('cor','color')),material:clean(get('material','materiais')),dimensions:clean(get('dimensoes','dimensões','dimensions','medidas')),height_cm:n(get('altura_cm','altura cm','altura'),0)||'',width_cm:n(get('largura_cm','largura cm','largura'),0)||'',length_cm:n(get('comprimento_cm','comprimento cm','comprimento'),0)||'',diameter_cm:n(get('diametro_cm','diâmetro_cm','diametro','diâmetro'),0)||'',weight_g:n(get('peso_g','peso g','peso','weight_g','weight'),0)||'',packaging_image_url:clean(get('embalagem_url','packaging_image_url','foto_embalagem','imagem_embalagem')),category_id:clean(get('category_id','categoria_id','categoria')),features:clean(get('caracteristicas','características','features','especificacoes')),package_content:clean(get('conteudo','conteúdo','package_content')),video_url:clean(get('video','video_url','vídeo')),videoReviewed:Boolean(clean(get('video','video_url','vídeo'))),marketproVideo:null,catalogPolicy:null,commercialAnalysis:null,seoResearch:null,images:[...new Set(urls)],status:'importado',imageStudio:{status:'pending',approvedCount:0,total:9,items:[],updatedAt:null},createdAt:new Date().toISOString()};
  Object.assign(p,seo(p)); Object.assign(p,{quality:quality(p)}); return p;
}

function initializeProductShape(p, source='import'){
  const now=new Date().toISOString();
  const recoveredName=recoveredProductName(p);
  const out={
    id:p.id||id(),row:p.row||null,sku:clean(p.sku),product:clean(recoveredName),cost:n(p.cost),price:n(p.price),stock:n(p.stock,0),stock_quantity_known:Boolean(p.stock_quantity_known),availability_status:clean(p.availability_status)||'unknown',availability_raw:clean(p.availability_raw),
    gtin:clean(p.gtin),brand:clean(p.brand),model:clean(p.model),color:clean(p.color),material:clean(p.material),dimensions:clean(p.dimensions),
    height_cm:p.height_cm||'',width_cm:p.width_cm||'',length_cm:p.length_cm||'',diameter_cm:p.diameter_cm||'',weight_g:p.weight_g||'',
    packaging_image_url:clean(p.packaging_image_url),category_id:clean(p.category_id),features:clean(p.features),package_content:clean(p.package_content),
    video_url:clean(p.video_url),manualVideo:p.manualVideo||null,videoReviewed:Boolean(p.videoReviewed||p.video_url),marketproVideo:p.marketproVideo||null,catalogPolicy:p.catalogPolicy||null,
    commercialAnalysis:p.commercialAnalysis||null,seoResearch:p.seoResearch||null,images:[...new Set(p.images||[])],status:p.status||'importado',
    imageStudio:p.imageStudio||{status:'pending',approvedCount:0,total:9,items:[],updatedAt:null},createdAt:p.createdAt||now,
    supplierAttributes:p.supplierAttributes||{},catalogMatch:p.catalogMatch||null,
    parent_sku:clean(p.parent_sku),product_family:clean(p.product_family),size:clean(p.size),voltage:clean(p.voltage),capacity:clean(p.capacity),flavor:clean(p.flavor),pattern:clean(p.pattern),variant_name:clean(p.variant_name),sales_30d:Number.isFinite(Number(p.sales_30d))?Number(p.sales_30d):-1,
    variationGroup:p.variationGroup||null,variationAttributes:p.variationAttributes||[],marketOpportunity:p.marketOpportunity||null,researchEvidence:p.researchEvidence||null,researchFilledFields:p.researchFilledFields||[],researchStatus:p.researchStatus||null,
    supplier_category:clean(p.supplier_category)||supplierAttrValue(p,'Categoria'),category_name:clean(p.category_name),domain_id:clean(p.domain_id),categoryValidation:p.categoryValidation||null,requiredAttributes:p.requiredAttributes||[],technicalAttributes:p.technicalAttributes||[],technicalCoverage:p.technicalCoverage||null,attributeSources:p.attributeSources||{},predictedAttributes:p.predictedAttributes||[],
    saleTerms:p.saleTerms||[],saleTermValues:p.saleTermValues||{},manualSaleTerms:p.manualSaleTerms||{},mlFormSchema:p.mlFormSchema||null,
    listingProfile:{condition:'new',local_pick_up:false,...(p.listingProfile||{})},description:cleanMultiline(p.description),descriptionSource:clean(p.descriptionSource)||'auto',descriptionLocked:Boolean(p.descriptionLocked),supplierDetailCapture:p.supplierDetailCapture||null,
    seoTitle:clean(p.seoTitle),seoModel:clean(p.seoModel),seoModelExpanded:clean(p.seoModelExpanded),seoKeywordsPrimary:p.seoKeywordsPrimary||[],seoKeywordsSecondary:p.seoKeywordsSecondary||[],seoAnalysis:p.seoAnalysis||null,modelMaxLength:p.modelMaxLength||null,titleMaxLength:p.titleMaxLength||null,enrichmentWarnings:p.enrichmentWarnings||[],modelVerified:Boolean(p.modelVerified),manualAttributes:p.manualAttributes||{},attributeValues:p.attributeValues||{},publicationAudit:p.publicationAudit||null,
    generatedImages:p.generatedImages||[],priceRecommendation:p.priceRecommendation||null,adsRecommendation:p.adsRecommendation||null,readiness:p.readiness||null,publicationGuard:p.publicationGuard||null,
    ml_item_id:p.ml_item_id||null,user_product_id:p.user_product_id||null,publishedAt:p.publishedAt||null,listing_type_id:p.listing_type_id||null,source
  };
  Object.assign(out,seo(out)); out.quality=quality(out); return out;
}
function mergeCatalogIntoImported(p){
  if(!p?.sku) return initializeProductShape(p||{});
  const supplier=store.findSupplierSku(p.sku);
  const merged=SupplierCatalog.mergeIntoProduct(p,supplier);
  return initializeProductShape(merged,supplier?'supplier-catalog':'import');
}

function importSkuPreservingProgress(sku,i=0,extra={}){
  const supplier=store.findSupplierSku(sku); const existing=findProductRef('',sku);
  if(existing){
    const refreshed=supplier?SupplierCatalog.refreshFromSupplier(existing,supplier):existing;
    return initializeProductShape({...refreshed,...extra,id:existing.id,sku:existing.sku||sku,createdAt:existing.createdAt,status:existing.status||extra.status||'importado'},supplier?'supplier-catalog-refresh':'existing-progress');
  }
  const base=initializeProductShape({id:id(),row:i+1,sku,status:supplier?'preenchido-pelo-catalogo':'sku-nao-encontrada',imageStudio:{status:'pending',approvedCount:0,total:9,items:[],updatedAt:null},createdAt:new Date().toISOString(),...extra});
  return initializeProductShape(SupplierCatalog.mergeIntoProduct(base,supplier),supplier?'supplier-catalog':'sku-only');
}
function queueAutoImages(products){
  if(process.env.AUTO_GENERATE_IMAGES==='true' && process.env.OPENAI_API_KEY && store.getSettings().imageGenerationMode==='auto'){
    products.filter(p=>Array.isArray(p.images)&&p.images.length).forEach(p=>enqueueImages(p.id,'auto-import'));
    return true;
  }
  return false;
}
async function token(){
  let t=store.getTokens(); if(!t) throw Object.assign(new Error('Mercado Livre não conectado'),{status:401});
  if(Date.now()>t.expires_at-120000){ const r=await ML.refresh({clientId:process.env.ML_CLIENT_ID,clientSecret:process.env.ML_CLIENT_SECRET,refreshToken:t.refresh_token}); await store.setTokens(r); t=store.getTokens(); }
  return t.access_token;
}
function safeError(err){ return err.response?.data?.message || err.response?.data?.error || err.message || 'Erro inesperado'; }
function findProductRef(ref,sku=''){ return store.findProduct(ref,sku); }
function productRefFromReq(req){ return findProductRef(req.params?.id, req.query?.sku||req.body?.sku||''); }
function persistenceInfo(){ return {mode:store.pool?'postgres':'local-file',durable:Boolean(store.pool),warning:store.pool?'Dados persistidos no PostgreSQL; reconexão OAuth não apaga o progresso.':'DATABASE_URL não configurado: o Render pode apagar o arquivo local em reinícios/deploys. O navegador mantém um backup de recuperação, mas o ideal é configurar PostgreSQL.'}; }

let catalogDomainCache={at:0,required:new Set(),only:new Set()};
async function catalogPolicy(domainId,{token=null,title='',productIdentifier=''}={}){
  if(!domainId) return {status:'unknown',blocked:false,reason:'Domínio ainda não identificado.',source:'none'};
  let dumpError=null;
  if(Date.now()-catalogDomainCache.at>6*60*60*1000 || (!catalogDomainCache.required.size&&!catalogDomainCache.only.size)){
    try{
      const [required,only]=await Promise.all([ML.catalogDomains(SITE,'catalog_required',token),ML.catalogDomains(SITE,'catalog_only',token)]);
      catalogDomainCache={at:Date.now(),required:new Set((required?.domains||[]).map(x=>x.id)),only:new Set((only?.domains||[]).map(x=>x.id))};
    }catch(e){ dumpError=e; }
  }
  if(catalogDomainCache.only.has(domainId)) return {status:'catalog_only',blocked:true,reason:'Domínio exclusivo de catálogo segundo o dump oficial do Mercado Livre.',source:'domain_dump'};
  if(catalogDomainCache.required.has(domainId)) return {status:'catalog_required',blocked:true,reason:'Domínio com publicação obrigatória em catálogo quando houver correspondência.',source:'domain_dump'};
  if(catalogDomainCache.required.size||catalogDomainCache.only.size) return {status:'optional',blocked:false,reason:'Catálogo não obrigatório segundo o dump oficial atual.',source:'domain_dump'};

  // Fallback oficial: se os dumps estiverem indisponíveis, consulta o catálogo autenticado por produto.
  if(token&&(title||productIdentifier)){
    try{
      const query={site:SITE,status:'active',domainId,limit:10};
      if(productIdentifier) query.productIdentifier=productIdentifier; else query.q=title;
      const required=await ML.productSearch(token,{...query,listingStrategy:'catalog_required'});
      const requiredResults=Array.isArray(required?.results)?required.results:[];
      if(requiredResults.length){
        return {status:'catalog_required',blocked:true,reason:'Produto correspondente encontrado no catálogo oficial com listing_strategy catalog_required.',source:'product_search',matchedProductId:requiredResults[0]?.id||null};
      }
      const general=await ML.productSearch(token,query);
      const rows=Array.isArray(general?.results)?general.results:[];
      const strategies=[...new Set(rows.map(x=>String(x?.settings?.listing_strategy||'').trim()).filter(Boolean))];
      if(strategies.includes('catalog_required')) return {status:'catalog_required',blocked:true,reason:'Busca oficial de produtos retornou correspondência com estratégia catalog_required.',source:'product_search',matchedProductId:rows.find(x=>x?.settings?.listing_strategy==='catalog_required')?.id||null};
      if(strategies.includes('open')) return {status:'optional',blocked:false,reason:'Busca oficial de produtos encontrou correspondência com listing_strategy open.',source:'product_search',matchedProductId:rows.find(x=>x?.settings?.listing_strategy==='open')?.id||null};
      if(rows.length===0) return {status:'optional_no_match',blocked:false,reason:'Nenhum produto correspondente foi encontrado no catálogo oficial para esta SKU. A publicação tradicional pode seguir, sujeita à validação final do Mercado Livre.',source:'product_search'};
      return {status:'unverified',blocked:false,reason:'O catálogo respondeu, mas não informou uma estratégia de publicação reconhecida. Revise antes da publicação.',source:'product_search'};
    }catch(e){
      const code=String(e.response?.data?.code||''); const msg=safeError(e);
      return {status:'unverified',blocked:false,reason:`Validação de catálogo temporariamente indisponível. O sistema tentou o dump oficial e a busca autenticada de produtos, mas ambas falharam. ${msg}`,errorCode:code||null,source:'fallback_failed'};
    }
  }
  const code=String(dumpError?.response?.data?.code||''); const msg=dumpError?safeError(dumpError):'dump oficial indisponível';
  return {status:'unverified',blocked:false,reason:`Validação de catálogo temporariamente indisponível (${msg}). Não é possível concluir que exista problema de permissão da aplicação apenas por este erro.`,errorCode:code||null,source:'dump_failed'};
}

function skuKey(v){ return clean(v).normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^a-z0-9]/g,''); }
function supplierFreshness(){
  const c=store.getSupplierCatalog();
  const meta=c?.meta||null;
  const age=SupplierCatalog.catalogAgeHours(meta);
  return {
    configured:Boolean(c?.products?.length),
    persistentMaster:true,
    expires:false,
    stale:false,
    warning:false,
    ageHours:Number.isFinite(age)?Math.round(age*10)/10:null,
    maxAgeHours:null,
    remainingHours:null,
    meta
  };
}
function localPublicationGuard(p){
  const fresh=supplierFreshness();
  const stock=Math.floor(n(p?.stock,0));
  const availability=clean(p?.availability_status).toLowerCase()||'unknown';
  if(!fresh.configured) return {blocked:true,code:'CATALOG_MISSING',label:'CATÁLOGO WEDROP AUSENTE',reason:'Cadastre o catálogo WeDrop atualizado antes de publicar.',stock,availability,checkedAt:new Date().toISOString(),source:'local'};
  if(availability==='unavailable') return {blocked:true,code:'OUT_OF_STOCK',label:'SKU INDISPONÍVEL',reason:`A coluna Disponibilidade da WeDrop informa ${p?.availability_raw||'Indisponível'}.`,stock,availability,checkedAt:new Date().toISOString(),source:'local'};
  if(!stockIsAvailable(p)) return {blocked:true,code:'OUT_OF_STOCK',label:'SKU SEM ESTOQUE',reason:'A WeDrop não informou disponibilidade positiva nem quantidade válida para esta SKU.',stock,availability,checkedAt:new Date().toISOString(),source:'local'};
  if(!clean(p?.sku)) return {blocked:true,code:'MISSING_SKU',label:'SKU AUSENTE',reason:'Produto sem SKU não pode ser publicado.',stock,checkedAt:new Date().toISOString(),source:'local'};
  const k=skuKey(p.sku);
  const local=store.getProducts().find(x=>x.id!==p.id&&skuKey(x.sku)===k&&(x.ml_item_id||String(x.status||'').toLowerCase()==='publicado'));
  if(local) return {blocked:true,code:'ALREADY_PUBLISHED_LOCAL',label:'SKU JÁ PUBLICADA',reason:`Já existe publicação local para esta SKU${local.ml_item_id?` (${local.ml_item_id})`:''}.`,stock,existingItems:local.ml_item_id?[local.ml_item_id]:[],checkedAt:new Date().toISOString(),source:'local'};
  if(p.ml_item_id||String(p.status||'').toLowerCase()==='publicado') return {blocked:true,code:'ALREADY_PUBLISHED_LOCAL',label:'SKU JÁ PUBLICADA',reason:`Esta SKU já foi publicada${p.ml_item_id?` como ${p.ml_item_id}`:''}.`,stock,existingItems:p.ml_item_id?[p.ml_item_id]:[],checkedAt:new Date().toISOString(),source:'local'};
  return {blocked:false,code:'CLEAR',label:'LIBERADA',reason:availability==='available'?'SKU marcada como Disponível pela WeDrop.':'SKU e estoque liberados na validação local.',stock,existingItems:[],checkedAt:new Date().toISOString(),source:'local'};
}
function publicationRemoteState(item){
  const status=clean(item?.status).toLowerCase();
  const sub=(Array.isArray(item?.sub_status)?item.sub_status:[]).map(x=>clean(x).toLowerCase());
  const picturePending=sub.some(x=>['picture_download_pending','picture_downloading_pending'].includes(x));
  if(status==='active')return {code:'ACTIVE',label:'PUBLICADO E ATIVO',message:'O anúncio está ativo no Mercado Livre.',tone:'good'};
  if(picturePending&&['paused','not_yet_active','under_review','inactive'].includes(status))return {code:'WAITING_PICTURES',label:'PUBLICADO · AGUARDANDO FOTOS',message:'O Mercado Livre está baixando e validando as imagens. A ativação é automática se elas forem aprovadas.',tone:'warn'};
  if(status==='under_review')return {code:'UNDER_REVIEW',label:'PUBLICADO · EM REVISÃO',message:'O anúncio existe, mas está em revisão pelo Mercado Livre.',tone:'warn'};
  if(status==='paused')return {code:'PAUSED',label:'PUBLICADO · PAUSADO',message:'O anúncio existe, porém está pausado no Mercado Livre.',tone:'warn'};
  if(status==='inactive'||status==='not_yet_active')return {code:'INACTIVE',label:'PUBLICADO · INATIVO',message:'O anúncio existe no Mercado Livre, mas ainda não está ativo.',tone:'warn'};
  return {code:(status||'UNKNOWN').toUpperCase(),label:'PUBLICADO · STATUS '+(status||'desconhecido'),message:'O anúncio existe no Mercado Livre e será acompanhado pelo Monitor 24/7.',tone:'warn'};
}

async function reconcileExistingPublication(p,guard,t){
  const ids=[...(guard?.existingItems||[])].map(String).filter(Boolean);
  const itemId=clean(p?.ml_item_id)||ids[0]||'';
  if(!itemId)return null;

  // V1.8.48: a busca autenticada /users/{seller}/items/search já confirmou que o MLB
  // pertence à conta e corresponde à SKU. Vinculamos primeiro e só depois fazemos as
  // leituras secundárias. Assim um timeout momentâneo em /items/{MLB} não deixa a SKU
  // eternamente presa como “SKU JÁ PUBLICADA”.
  const adoptedAt=p.adoptedExistingPublicationAt||new Date().toISOString();
  const minimalPatch={
    ml_item_id:itemId,
    status:'publicado',
    stockAuthority:'mercadolivre',
    adoptedExistingPublicationAt:adoptedAt,
    publicationState:{code:'LINKED_PENDING_REMOTE',label:'PUBLICADO · VINCULADO',message:'Anúncio localizado na conta e vinculado ao Publisher. Confirmando estoque/status no Mercado Livre.',tone:'warn'},
    lastPublicationReconcileAt:new Date().toISOString(),
    lastPublicationReconcileError:null
  };
  await store.updateProduct(p.id,minimalPatch);
  p={...p,...minimalPatch};

  let item=null;
  try{item=await ML.itemDetails(t,itemId);}catch(e){
    const error=safeError(e);
    const partialPatch={...minimalPatch,lastPublicationReconcileError:error,publicationState:{code:'LINKED_PENDING_REMOTE',label:'PUBLICADO · VINCULADO',message:`MLB ${itemId} vinculado. A leitura detalhada do Mercado Livre falhou agora: ${error}. O sistema tentará novamente sem recolocar a SKU na fila.`,tone:'warn'}};
    await store.updateProduct(p.id,partialPatch).catch(()=>{});
    await store.addJob({id:id(),type:'publish-link-partial',status:'aguardando',sku:p.sku,item_id:itemId,error,at:new Date().toISOString()}).catch(()=>{});
    return {ok:true,partial:true,itemId,error,patch:partialPatch,marketStock:null};
  }
  const remote=publicationRemoteState(item);
  let marketStock=null;
  try{marketStock=await marketStockSnapshot(t,p,item,await ML.me(t));}catch(_){ }
  const remoteQty=marketStock?.confirmed?Math.max(0,Math.floor(n(marketStock.quantity,0))):null;
  const patch={
    ml_item_id:item.id||itemId,
    user_product_id:item.user_product_id||p.user_product_id||null,
    family_name:item.family_name||p.family_name||null,
    price:n(item.price,p.price),
    listing_type_id:item.listing_type_id||p.listing_type_id||null,
    status:'publicado',
    ml_status:item.status||'',
    ml_sub_status:Array.isArray(item.sub_status)?item.sub_status:[],
    ml_permalink:item.permalink||p.ml_permalink||'',
    publicationState:remote,
    publishedAt:p.publishedAt||item.date_created||new Date().toISOString(),
    lastPublicationReconcileAt:new Date().toISOString(),
    stockAuthority:'mercadolivre',
    adoptedExistingPublicationAt:p.adoptedExistingPublicationAt||new Date().toISOString(),
    ml_available_quantity:remoteQty,
    ml_stock_source:marketStock?.source||'',
    ml_stock_checked_at:new Date().toISOString(),
    ml_stock_details:marketStock||null
  };
  if(remoteQty!==null){
    patch.stock=remoteQty;
    patch.stock_quantity_known=true;
    patch.stock_source='mercadolivre_remote';
    patch.availability_status=remoteQty>0?'available':'unavailable';
    patch.availability_raw=`Mercado Livre: ${remoteQty} unidade(s)`;
    patch.publishedStockTarget=remoteQty;
  }
  await store.updateProduct(p.id,patch);
  await store.addJob({id:id(),type:'publish-reconcile',status:'concluido',sku:p.sku,item_id:item.id||itemId,remoteStatus:item.status||'',remoteSubStatus:item.sub_status||[],publicationState:remote.code,remoteStock:remoteQty,stockSource:marketStock?.source||'',at:new Date().toISOString()});
  return {ok:true,item,remote,patch,marketStock};
}


function mimeFromName(name=''){
  const x=String(name||'').toLowerCase();
  if(x.endsWith('.png'))return 'image/png';
  if(x.endsWith('.webp'))return 'image/webp';
  return 'image/jpeg';
}
async function pictureBufferFromSource(source){
  const src=clean(source);
  if(!src)throw new Error('Fonte de imagem vazia.');
  let rel='';
  try{
    const u=new URL(src,BASE);
    if(u.pathname.startsWith('/generated/'))rel=decodeURIComponent(u.pathname.slice('/generated/'.length));
  }catch(_){}
  if(!rel&&src.startsWith('/generated/'))rel=decodeURIComponent(src.slice('/generated/'.length));
  if(rel){
    const root=path.resolve(ImageStudio.MEDIA_DIR);
    const file=path.resolve(root,rel.replace(/^[/\\]+/,''));
    if(!file.startsWith(root+path.sep)&&file!==root)throw new Error('Caminho de imagem inválido.');
    if(fs.existsSync(file))return {buffer:fs.readFileSync(file),filename:path.basename(file),mime:mimeFromName(file),source:src,local:true};
  }
  const r=await axios.get(src,{responseType:'arraybuffer',timeout:30000,headers:{'User-Agent':'RedeAchadosBR-MLPublisher/1.8.76'}});
  const mime=String(r.headers?.['content-type']||mimeFromName(src)).split(';')[0];
  return {buffer:Buffer.from(r.data),filename:`produto-${crypto.randomBytes(3).toString('hex')}.${mime.includes('png')?'png':mime.includes('webp')?'webp':'jpg'}`,mime,source:src,local:false};
}
function approvedPictureSources(p){
  const studio=(p?.imageStudio?.items||[]).filter(x=>x?.status==='approved'&&x?.path).sort((a,b)=>n(a.slot)-n(b.slot)).map(x=>`${BASE}${x.path}`);
  const generated=Array.isArray(p?.generatedImages)?p.generatedImages.filter(Boolean):[];
  const supplier=Array.isArray(p?.images)?p.images.filter(Boolean):[];
  return [...new Set([...studio,...generated,...supplier])];
}
async function prepareMlPictures(p,t,{force=false}={}){
  const sources=approvedPictureSources(p);
  if(!sources.length)throw new Error('Nenhuma foto disponível para enviar ao Mercado Livre.');
  let maxPictures=12;
  try{const cat=await ML.categoryDetails(t,p.category_id);maxPictures=Math.max(1,n(cat?.settings?.max_pictures_per_item,12));}catch(_){}
  const selected=sources.slice(0,Math.min(maxPictures,12));
  const sourceKey=crypto.createHash('sha1').update(selected.join('|')).digest('hex');
  if(!force&&p?.mlPictureUpload?.sourceKey===sourceKey&&Array.isArray(p.mlPictureUpload.ids)&&p.mlPictureUpload.ids.length===selected.length){
    return {ids:p.mlPictureUpload.ids,sourceKey,count:selected.length,reused:true};
  }
  const ids=[],errors=[];
  for(let i=0;i<selected.length;i+=3){
    const batch=selected.slice(i,i+3);
    const rows=await Promise.all(batch.map(async(src,offset)=>{
      const idx=i+offset;
      try{
        const asset=await pictureBufferFromSource(src);
        const out=await ML.uploadPicture(t,asset);
        const pictureId=clean(out?.id);
        if(!pictureId)throw new Error('Mercado Livre não retornou ID da imagem.');
        return {ok:true,id:pictureId,source:src,index:idx};
      }catch(e){return {ok:false,source:src,index:idx,error:safeError(e)}}
    }));
    for(const row of rows){if(row.ok)ids.push(row.id);else errors.push(row);}
  }
  if(errors.length||ids.length!==selected.length){
    await store.addJob({id:id(),type:'ml-picture-upload',status:'erro',sku:p.sku,uploaded:ids.length,expected:selected.length,errors,at:new Date().toISOString()});
    throw new Error(`Falha ao carregar fotos diretamente no Mercado Livre (${ids.length}/${selected.length}). ${errors[0]?.error||''}`.trim());
  }
  const meta={sourceKey,ids,count:ids.length,uploadedAt:new Date().toISOString(),mode:'mercadolivre-picture-upload'};
  await store.updateProduct(p.id,{mlPictureUpload:meta});
  await store.addJob({id:id(),type:'ml-picture-upload',status:'sucesso',sku:p.sku,count:ids.length,at:new Date().toISOString()});
  return meta;
}
function preferredWarehouseStoreId(settings={}){return clean(settings.primaryWarehouseStoreId||process.env.ML_PRIMARY_WAREHOUSE_STORE_ID||'')}
function pricingAutomationLooksActive(v){
  const status=clean(v?.status||v?.automation?.status).toLowerCase();
  if(['inactive','disabled','finished','cancelled','canceled'].includes(status))return false;
  return Boolean(v?.rule_id||v?.ruleId||v?.automation?.rule_id||['active','started','enabled','pending'].includes(status));
}
async function pricingAutomationState(t,itemId){try{const data=await ML.pricingAutomationGet(t,itemId);return {active:pricingAutomationLooksActive(data),data};}catch(e){if([400,404].includes(Number(e.response?.status)))return {active:false,data:null};throw e;}}
function itemUserProductIds(item,p={}){
  const ids=new Set();
  const add=v=>{const x=clean(v);if(x)ids.add(x)};
  add(item?.user_product_id);add(p?.user_product_id);
  for(const v of (Array.isArray(item?.variations)?item.variations:[]))add(v?.user_product_id);
  return [...ids];
}
async function marketStockSnapshot(t,p,item,user=null){
  const itemQuantity=StockEngine.legacyRemoteQuantity(item);
  const parentQuantity=Math.max(0,Math.floor(n(item?.available_quantity,0)));
  const variationQuantity=StockEngine.variationRemoteQuantity(item);
  const userProductIds=itemUserProductIds(item,p);
  const stockReads=[],errors=[];
  let allLocationsTotal=0,sellerManagedTotal=0,sellerWarehouseTotal=0,sellingAddressTotal=0,meliFacilityTotal=0;
  for(const userProductId of userProductIds.slice(0,30)){
    try{
      const snap=await ML.userProductStock(t,userProductId);
      const summary=StockEngine.locationSummary(snap.data);
      stockReads.push({userProductId,version:snap.version,summary,data:snap.data});
      allLocationsTotal+=summary.allLocationsTotal;sellerManagedTotal+=summary.sellerManagedTotal;sellerWarehouseTotal+=summary.sellerWarehouse.total;sellingAddressTotal+=summary.sellingAddress.total;meliFacilityTotal+=summary.meliFacility.total;
    }catch(e){errors.push({userProductId,error:safeError(e),status:e.response?.status||null});}
  }
  const hasUserProductRead=stockReads.length>0;
  // V1.8.48: para LEITURA/EXIBIÇÃO o Mercado Livre é a fonte da verdade.
  // Usa o maior valor confirmado entre item.available_quantity e as localizações do User Product.
  // Isso elimina falsos zeros quando uma das superfícies do ML ainda não sincronizou.
  const candidates=[{value:parentQuantity,source:'item.available_quantity'}];
  if(variationQuantity>0)candidates.push({value:variationQuantity,source:'item.variations.available_quantity'});
  if(itemQuantity>0)candidates.push({value:itemQuantity,source:variationQuantity>parentQuantity?'item.variations.available_quantity':'item.available_quantity'});
  if(hasUserProductRead){candidates.push({value:allLocationsTotal,source:'user_product.locations_total'});if(sellerManagedTotal>0)candidates.push({value:sellerManagedTotal,source:'user_product.seller_managed'});}
  candidates.sort((a,b)=>b.value-a.value);
  const best=candidates[0]||{value:0,source:'unknown'};
  return {confirmed:true,quantity:Math.max(0,Math.floor(n(best.value,0))),source:best.source,parentQuantity,variationQuantity,itemQuantity,userProductIds,stockReads:stockReads.map(x=>({userProductId:x.userProductId,version:x.version,locations:x.summary.locations,allLocationsTotal:x.summary.allLocationsTotal,sellerManagedTotal:x.summary.sellerManagedTotal})),allLocationsTotal,sellerManagedTotal,sellerWarehouseTotal,sellingAddressTotal,meliFacilityTotal,warehouseManagement:StockEngine.usesWarehouseManagement(user),errors,conflict:hasUserProductRead&&itemQuantity!==allLocationsTotal};
}
async function remoteStockSnapshot(t,p,item,user,settings={}){
  const warehouseMode=StockEngine.usesWarehouseManagement(user),preferred=preferredWarehouseStoreId(settings);
  const market=await marketStockSnapshot(t,p,item,user);
  const target=p?.ml_item_id?{quantity:market.quantity,exact:true,source:'mercadolivre_remote'}:desiredStockTarget(p),expected=target.quantity;
  if(!warehouseMode){
    const remote=market.quantity;
    return {mode:'legacy',expected,targetSource:target.source,targetExact:target.exact,remote,marketRemote:market.quantity,marketSource:market.source,matches:StockEngine.stockMatches(expected,remote),sold:n(item?.sold_quantity,0),item,market};
  }
  const userProductId=market.userProductIds[0]||clean(item?.user_product_id||p?.user_product_id);
  const read=market.stockReads.find(x=>x.userProductId===userProductId)||market.stockReads[0]||null;
  const summary=read?StockEngine.locationSummary({locations:read.locations}):{sellerWarehouse:{locations:[],total:0,count:0},sellingAddress:{locations:[],total:0,count:0},sellerManagedTotal:0};
  const sellerRemote=market.sellerManagedTotal>0||summary.sellerWarehouse.count||summary.sellingAddress.count?market.sellerManagedTotal:market.quantity;
  const sellerLocations=market.stockReads.flatMap(x=>(x.locations||[]).filter(l=>String(l.type||'').toLowerCase()==='seller_warehouse'));
  return {mode:'multiwarehouse',expected,targetSource:target.source,targetExact:target.exact,remote:sellerRemote,marketRemote:market.quantity,marketSource:market.source,matches:StockEngine.stockMatches(expected,sellerRemote),userProductId,version:read?.version||'',locations:sellerLocations,locationCount:sellerLocations.length,preferredStoreId:preferred,sold:n(item?.sold_quantity,0),market};
}
async function syncRemoteStockToTarget(t,p,item,user,settings={}){
  p=await refreshProductStockFromSupplier(p);
  const target=desiredStockTarget(p); let snap=await remoteStockSnapshot(t,p,item,user,settings);
  if(snap.matches)return {ok:true,changed:false,p,snap,target};
  if(n(item?.sold_quantity,0)>0)return {ok:false,changed:false,manual:true,p,snap,target,reason:'O anúncio já possui vendas; reposição automática foi bloqueada para não duplicar unidades vendidas.'};
  if(snap.mode==='legacy'){
    await ML.updateItem(t,item.id,{available_quantity:target.quantity}); await new Promise(r=>setTimeout(r,900));
    item=await ML.itemDetails(t,item.id); snap=await remoteStockSnapshot(t,p,item,user,settings);
    if(snap.matches)await store.updateProduct(p.id,{publishedStockTarget:target.quantity,lastStockReconcileAt:new Date().toISOString()}).catch(()=>{});
    return {ok:snap.matches,changed:true,p,snap,target,item};
  }
  if(!snap.userProductId)return {ok:false,changed:false,waiting:true,p,snap,target,reason:'Aguardando user_product_id para sincronizar estoque multiorigem.'};
  const preferred=preferredWarehouseStoreId(settings);
  if((snap.locations||[]).length===1||preferred){
    const payload=StockEngine.sellerWarehousePayload(snap.locations||[],target.quantity,preferred);
    await ML.updateUserProductSellerWarehouseStockSafe(t,snap.userProductId,payload); await new Promise(r=>setTimeout(r,900));
    item=await ML.itemDetails(t,item.id); snap=await remoteStockSnapshot(t,p,item,user,settings);
    if(snap.matches)await store.updateProduct(p.id,{publishedStockTarget:target.quantity,lastStockReconcileAt:new Date().toISOString()}).catch(()=>{});
    return {ok:snap.matches,changed:true,p,snap,target,item};
  }
  return {ok:false,changed:false,manual:true,p,snap,target,reason:`Há ${snap.locationCount||0} depósitos seller_warehouse. Defina o depósito principal antes da correção automática.`};
}

function postStep(status,message,extra={}){return {status,message,at:new Date().toISOString(),...extra}}
function postPipelineOverall(steps={}){
  const vals=Object.values(steps);
  if(vals.some(x=>x?.status==='ERROR'))return 'ERROR';
  if(vals.some(x=>x?.status==='MANUAL'))return 'ACTION_REQUIRED';
  if(vals.some(x=>x?.status==='WAITING'||x?.status==='RUNNING'))return 'WAITING';
  return vals.length?'DONE':'PENDING';
}
function mlEditUrl(itemId){return itemId?`https://www.mercadolivre.com.br/anuncios/${encodeURIComponent(itemId)}/modificar`:''}
function postPublishApprovalIsFresh(p,maxMinutes=10){
  const ts=Date.parse(p?.postPublishExecutionApprovedAt||'');
  return Number.isFinite(ts)&&Date.now()-ts>=0&&Date.now()-ts<=Math.max(1,maxMinutes)*60000;
}

async function safeIndividualDiscount(p,item,t){
  const settings=store.getSettings();
  let sale=null;try{sale=await ML.salePrice(t,item?.id)}catch(_){}
  const base=n(sale?.regular_amount||sale?.amount||item?.price||p?.priceRecommendation?.grossUploadPrice||p?.price);
  if(base<=0)return {ok:false,reason:'Preço base indisponível.'};
  const target=Math.max(5,Math.min(30,n(settings.postPublishPromotionDiscountPct,settings.promotionTargetDiscount||10)));
  const minSale=n(p?.priceRecommendation?.minimumSalePrice||p?.commercialAnalysis?.pricingRecommendation?.minimumSalePrice||0);
  const maxSafePct=minSale>0&&base>0?Math.max(0,(1-minSale/base)*100):target;
  const pct=Math.min(target,n(settings.promotionMaxDiscount,20)||20,maxSafePct||target);
  if(pct<5)return {ok:false,reason:`Não há espaço de margem para desconto mínimo de 5%. Preço base ${base.toFixed(2)} e piso protegido ${minSale.toFixed(2)}.`};
  const deal=Math.round(base*(1-pct/100)*100)/100;
  const start=new Date(),finish=new Date(start.getTime()+13*86400000);
  const body={deal_price:deal,start_date:start.toISOString(),finish_date:finish.toISOString(),promotion_type:'PRICE_DISCOUNT'};
  try{
    const out=await ML.addPromotionItem(t,item.id,body);
    return {ok:true,type:'PRICE_DISCOUNT',price:deal,discountPct:Math.round(pct*100)/100,out};
  }catch(e){return {ok:false,reason:safeError(e),details:e.response?.data||null};}
}

const postPublishRuns=new Map();
async function runPostPublishPipeline(productId,opts={}){
  const key=String(productId||'');
  if(postPublishRuns.has(key))return await postPublishRuns.get(key);
  const job=runPostPublishPipelineUnlocked(productId,opts);
  postPublishRuns.set(key,job);
  try{return await job}finally{if(postPublishRuns.get(key)===job)postPublishRuns.delete(key)}
}
async function runPostPublishPipelineUnlocked(productId,{source='manual',forcePictures=false,forceStock=false}={}){
  let p=store.findProduct(productId,productId); if(!p)throw new Error('Produto não encontrado.');
  p=await refreshProductStockFromSupplier(p);
  if(!p.ml_item_id)throw new Error('SKU ainda não possui MLB publicado.');
  const t=await token(),settings=store.getSettings();
  let pipeline={...(p.postPublishPipeline||{}),itemId:p.ml_item_id,sku:p.sku,source,startedAt:p.postPublishPipeline?.startedAt||new Date().toISOString(),lastRunAt:new Date().toISOString(),steps:{...(p.postPublishPipeline?.steps||{})},attempts:n(p.postPublishPipeline?.attempts)+1};
  const save=async()=>{pipeline.status=postPipelineOverall(pipeline.steps);pipeline.updatedAt=new Date().toISOString();try{await store.updateProduct(p.id,{postPublishPipeline:pipeline})}catch(e){store.schedulePersistenceRetry?.(`post-publish-${p.ml_item_id}`,3000)}return pipeline};
  const setStep=async(name,value)=>{pipeline.steps[name]=value;await save();};
  let item=await ML.itemDetails(t,p.ml_item_id);
  const remote=publicationRemoteState(item);
  await store.updateProduct(p.id,{ml_status:item.status||'',ml_sub_status:Array.isArray(item.sub_status)?item.sub_status:[],ml_permalink:item.permalink||p.ml_permalink||'',publicationState:remote,lastPublicationReconcileAt:new Date().toISOString()}).catch(()=>{});

  // 1. Fotos: sempre usar upload oficial do Mercado Livre, nunca depender de URL temporária do Render.
  try{
    if(settings.postPublishAutoPictures!==false){
      const expected=Math.min(approvedPictureSources(p).length,12);
      const remoteCount=Array.isArray(item.pictures)?item.pictures.length:0;
      const picturePending=(item.sub_status||[]).some(x=>/picture_(download|downloading)_pending/i.test(String(x)));
      if(forcePictures||expected>0&&(remoteCount<expected||picturePending)){
        await setStep('pictures',postStep('RUNNING','Enviando fotos diretamente aos servidores do Mercado Livre...', {remoteCount,expected}));
        const up=await prepareMlPictures(p,t,{force:forcePictures||picturePending});
        await ML.updateItem(t,item.id,{pictures:up.ids.map(id=>({id}))});
        await new Promise(r=>setTimeout(r,1500));
        item=await ML.itemDetails(t,item.id);
      }
      const count=Array.isArray(item.pictures)?item.pictures.length:0;
      const pending=(item.sub_status||[]).some(x=>/picture_(download|downloading)_pending/i.test(String(x)));
      if(expected&&count>=Math.min(expected,approvedPictureSources(p).length)&&!pending)await setStep('pictures',postStep('DONE',`${count} foto(s) confirmadas no Mercado Livre.`,{count}));
      else await setStep('pictures',postStep('WAITING',`Mercado Livre ainda processando fotos (${count}/${expected||'?'}).`,{count,expected}));
    }else await setStep('pictures',postStep('SKIPPED','Sincronização automática de fotos desativada.'));
  }catch(e){await setStep('pictures',postStep('ERROR',safeError(e)));}

  // 1.5 Reativação segura após fotos: moderação preventiva por processamento de imagem pode deixar o item pausado.
  try{
    item=await ML.itemDetails(t,item.id);
    const picStep=pipeline.steps.pictures||{};
    const tags=Array.isArray(item.tags)?item.tags.map(String):[];
    const subs=Array.isArray(item.sub_status)?item.sub_status.map(String):[];
    const picturePending=subs.some(x=>/picture_(download|downloading)_pending/i.test(x));
    const preventive=tags.includes('moderation_penalty')||subs.some(x=>/picture|image/i.test(x));
    if(String(item.status||'').toLowerCase()==='paused'&&picStep.status==='DONE'&&!picturePending&&preventive){
      try{
        await ML.updateItem(t,item.id,{status:'active'});
        await new Promise(r=>setTimeout(r,1200));
        item=await ML.itemDetails(t,item.id);
        if(String(item.status||'').toLowerCase()==='active'){
          pipeline.steps.pictures=postStep('DONE',`${picStep.count||item.pictures?.length||0} foto(s) confirmadas e anúncio reativado após revisão preventiva.`,{count:picStep.count||item.pictures?.length||0,reactivated:true});
          await save();
        }
      }catch(e){
        pipeline.steps.pictures={...picStep,status:'WAITING',message:`Fotos enviadas. Mercado Livre ainda não liberou a reativação automática: ${safeError(e)}`,reactivationPending:true,at:new Date().toISOString()};
        await save();
      }
    }
  }catch(_){}

  // 2. Descrição
  try{
    if(p.description){await ML.updateDescription(t,item.id,p.description).catch(()=>ML.createDescription(t,item.id,p.description));await setStep('description',postStep('DONE','Descrição sincronizada.'))}
    else await setStep('description',postStep('SKIPPED','Sem descrição salva para sincronizar.'));
  }catch(e){await setStep('description',postStep('ERROR',safeError(e)));}

  // 3. Estoque: V1.8.48 separa LEITURA remota de CORREÇÃO de estoque.
  // Anúncios já existentes/adotados usam o Mercado Livre como fonte da verdade e nunca têm
  // 100 unidades sobrescritas por um fallback local antigo (ex.: 1 unidade).
  try{
    item=await ML.itemDetails(t,item.id);
    const remoteAuthority=Boolean(p.ml_item_id);
    const user=await ML.me(t);
    if(remoteAuthority&&!forceStock){
      let market=await marketStockSnapshot(t,p,item,user);
      if(Math.max(0,Math.floor(n(market.quantity,0)))===0){
        // Evita falso zero durante sincronização assíncrona do ML/WeDrop. Faz uma segunda
        // leitura direta do anúncio antes de classificar a SKU como sem estoque.
        await new Promise(r=>setTimeout(r,1100));
        item=await ML.itemDetails(t,item.id);
        const retry=await marketStockSnapshot(t,p,item,user);
        if(n(retry.quantity,0)>=n(market.quantity,0))market=retry;
      }
      const qty=Math.max(0,Math.floor(n(market.quantity,0)));
      const patch={stock:qty,stock_quantity_known:true,stock_source:'mercadolivre_remote',stockAuthority:'mercadolivre',ml_available_quantity:qty,ml_stock_source:market.source,ml_stock_checked_at:new Date().toISOString(),ml_stock_details:market,publishedStockTarget:qty,availability_status:qty>0?'available':'unavailable',availability_raw:`Mercado Livre: ${qty} unidade(s)`};
      await store.updateProduct(p.id,patch).catch(()=>{});p={...p,...patch};
      if(qty>0)await setStep('stock',postStep('DONE',`Estoque lido diretamente do Mercado Livre e importado para o Publisher: ${qty} unidade(s). Nenhuma alteração de estoque foi enviada ao ML.`,{remote:qty,marketRemote:qty,marketSource:market.source,sourceOfTruth:'mercadolivre',readOnly:true,market}));
      else await setStep('stock',postStep('WAITING','O Mercado Livre retornou estoque 0 nesta consulta. Nenhuma alteração foi enviada; o sistema continuará consultando até confirmar o estoque remoto.',{remote:0,marketRemote:0,marketSource:market.source,sourceOfTruth:'mercadolivre',readOnly:true,market}));
    }else{
      p=await refreshProductStockFromSupplier(p); const target=desiredStockTarget(p), expected=target.quantity, preferred=preferredWarehouseStoreId(settings);
      let snap=await remoteStockSnapshot(t,p,item,user,settings);
      const prior=pipeline.steps.stock||{};
      if(snap.matches){
        await setStep('stock',postStep('DONE',snap.mode==='multiwarehouse'?`Estoque confirmado no User Product: ${snap.remote} unidade(s) em estoque gerenciado pelo vendedor.`:`Estoque confirmado no anúncio: ${snap.remote} unidade(s).`,snap));
      }else if(!forceStock&&prior.status==='DONE'&&n(item.sold_quantity,0)>0){
        await setStep('stock',postStep('DONE',`Estoque mudou após venda(s) (${snap.marketRemote??snap.remote} disponível). O Publisher não repôs automaticamente para evitar duplicar unidades vendidas.`,{...snap,changedAfterSales:true}));
      }else if(n(item.sold_quantity,0)>0){
        await setStep('stock',postStep('MANUAL',`Estoque remoto ${snap.marketRemote??snap.remote??'indisponível'} difere do alvo inicial ${expected}, mas o anúncio já possui venda(s). Correção automática bloqueada para não repor unidades vendidas.`,{...snap,editUrl:mlEditUrl(item.id)}));
      }else if(snap.mode==='legacy'){
        await setStep('stock',postStep('RUNNING',`Corrigindo estoque no anúncio (${snap.remote} → ${expected})...`,snap));
        await ML.updateItem(t,item.id,{available_quantity:expected}); await new Promise(r=>setTimeout(r,1000)); item=await ML.itemDetails(t,item.id);
        snap=await remoteStockSnapshot(t,p,item,user,settings);
        if(snap.matches)await setStep('stock',postStep('DONE',`Estoque corrigido e confirmado no anúncio: ${snap.remote} unidade(s).`,snap));
        else await setStep('stock',postStep('WAITING',`Mercado Livre ainda não refletiu o estoque esperado (${snap.marketRemote??snap.remote}/${expected}).`,snap));
      }else if(!snap.userProductId){
        await setStep('stock',postStep('WAITING','Aguardando o Mercado Livre disponibilizar o user_product_id para validar estoque multiorigem.',snap));
      }else if((snap.locations||[]).length===1||preferred){
        const payload=StockEngine.sellerWarehousePayload(snap.locations||[],expected,preferred);
        await setStep('stock',postStep('RUNNING',`Corrigindo estoque pelo User Product (${snap.remote??0} → ${expected})...`,snap));
        await ML.updateUserProductSellerWarehouseStockSafe(t,snap.userProductId,payload); await new Promise(r=>setTimeout(r,1000));
        item=await ML.itemDetails(t,item.id); snap=await remoteStockSnapshot(t,p,item,user,settings);
        if(snap.matches)await setStep('stock',postStep('DONE',`Estoque multiorigem corrigido e confirmado: ${snap.remote} unidade(s).`,snap));
        else await setStep('stock',postStep('WAITING',`Atualização de estoque enviada ao User Product; aguardando sincronização (${snap.marketRemote??snap.remote}/${expected}).`,snap));
      }else{
        await setStep('stock',postStep('MANUAL',`O User Product possui ${snap.locationCount||0} depósitos. Selecione um depósito principal antes de alterar estoque automaticamente.`,{...snap,availableLocations:snap.locations,editUrl:mlEditUrl(item.id)}));
      }
    }
  }catch(e){await setStep('stock',postStep(['WAREHOUSE_SELECTION_REQUIRED','STOCK_LOCATIONS_MISSING'].includes(e.code)?'MANUAL':'ERROR',safeError(e),{code:e.code||'',availableLocations:e.availableLocations||null,details:e.response?.data||null}));}

  // V1.8.48: após confirmar estoque positivo, tenta retirar o anúncio de paused/out_of_stock.
  // Antes a V1.8.42 corrigia o estoque, mas podia deixar Flex/Promo presos porque o item continuava pausado.
  try{
    item=await ML.itemDetails(t,item.id);
    const stockStep=pipeline.steps.stock||{},subs=(item.sub_status||[]).map(x=>String(x)),status=String(item.status||'').toLowerCase();
    const blocker=subs.some(x=>/(under_review|forbidden|warning|suspend|fraud|moderation|closed_by_admin|deleted)/i.test(x));
    const confirmed=n(stockStep.remote,stockStep.expected||0)>0||n(stockStep.expected,0)>0&&stockStep.status==='DONE';
    if(status==='paused'&&confirmed&&!blocker&&(subs.includes('out_of_stock')||subs.length===0)){
      await ML.updateItem(t,item.id,{status:'active'}); await new Promise(r=>setTimeout(r,900)); item=await ML.itemDetails(t,item.id);
      const active=String(item.status||'').toLowerCase()==='active';
      pipeline.steps.stock={...stockStep,message:`${stockStep.message||'Estoque confirmado.'} ${active?'Anúncio reativado e confirmado como active.':'Reativação enviada; aguardando o Mercado Livre refletir o status.'}`,activationRequested:true,activationConfirmed:active,at:new Date().toISOString()};
      await save();
    }
  }catch(e){const stockStep=pipeline.steps.stock||{};pipeline.steps.stock={...stockStep,activationError:safeError(e),message:`${stockStep.message||'Estoque processado.'} Não foi possível confirmar a reativação agora: ${safeError(e)}`,at:new Date().toISOString()};await save();}

  item=await ML.itemDetails(t,item.id);
  let isActive=String(item.status||'').toLowerCase()==='active';

  // 4. Flex — só depois que o anúncio estiver ativo. A preferência é explícita e persistida no sistema.
  try{
    if(settings.postPublishAutoFlexEnabled===false)await setStep('flex',postStep('SKIPPED','Ativação automática do Flex desativada.'));
    else if(!isActive)await setStep('flex',postStep('WAITING','Aguardando anúncio ficar ativo para habilitar Flex.'));
    else{
      let flexRaw=null;try{flexRaw=await ML.flexStatus(t,item.id)}catch(_){}
      if(Monitoring.isFlex(item,flexRaw))await setStep('flex',postStep('DONE','Flex já está ativo no anúncio.'));
      else{
        const [prefs,me,subs]=await Promise.all([ML.categoryShippingPreferences(t,item.category_id),ML.me(t),ML.me(t).then(u=>ML.flexSubscriptions(t,{site:SITE,userId:u.id})).catch(()=>[])]);
        const supports=(prefs?.logistics||[]).some(x=>Array.isArray(x?.types)&&x.types.includes('self_service'));
        const subscribed=(Array.isArray(subs)?subs:[]).some(x=>String(x?.mode||'').toUpperCase()==='FLEX'&&['in','active','activating','enabled'].includes(String(x?.status||'').toLowerCase()));
        if(!supports)await setStep('flex',postStep('MANUAL','Categoria não oferece self_service/Flex para este item.',{editUrl:mlEditUrl(item.id)}));
        else if(!subscribed)await setStep('flex',postStep('MANUAL','Sua conta não retornou assinatura Flex ativa. Ative/valide Flex na Central do Vendedor.',{editUrl:mlEditUrl(item.id)}));
        else{
          // Recalcula a economia com self_service. Em 2026, itens com automação de preço ativa
          // rejeitam/ignoram PUT /items com price; por isso a V1.8.48 nunca presume que o preço mudou.
          let flexPriceBlocked=false;
          try{
            const flexAnalysis=await analyzeCommercial(p,{logistic_type:'self_service',shipping_mode:'me2',refreshMarket:false});
            const sc=flexAnalysis?.recommendedScenario||flexAnalysis?.bestScenario;
            if(sc&&n(sc.margin)>=n(settings.targetMargin,18)){
              const gross=n(flexAnalysis?.pricingRecommendation?.grossUploadPrice||sc.price),remotePrice=n(item.price);
              const current=store.findProduct(p.id,p.sku)||p;const patch=commercialPatchFromResult(current,flexAnalysis);await store.updateProduct(p.id,patch).catch(()=>{});
              if(gross>0&&remotePrice+0.01<gross){
                const pricing=await pricingAutomationState(t,item.id);
                if(pricing.active){
                  flexPriceBlocked=true;
                  await setStep('flex',postStep('MANUAL',`Flex não foi ativado: preço remoto ${remotePrice.toFixed(2)} está abaixo do preço seguro ${gross.toFixed(2)} e o anúncio possui automação de preços ativa. Ajuste pela automação de preços e verifique novamente.`,{priceAutomation:true,remotePrice,requiredPrice:gross,editUrl:mlEditUrl(item.id)}));
                }else{
                  await ML.updateItem(t,item.id,{price:gross}); await new Promise(r=>setTimeout(r,800)); item=await ML.itemDetails(t,item.id);
                  if(Math.abs(n(item.price)-gross)>.01){flexPriceBlocked=true;await setStep('flex',postStep('MANUAL',`Mercado Livre não confirmou o preço seguro para Flex (${n(item.price).toFixed(2)} / ${gross.toFixed(2)}). Revise o preço antes de ativar.`,{remotePrice:n(item.price),requiredPrice:gross,editUrl:mlEditUrl(item.id)}));}
                }
              }
            }
          }catch(e){flexPriceBlocked=true;await setStep('flex',postStep('MANUAL',`Não foi possível validar preço/margem para ativar Flex com segurança: ${safeError(e)}`,{editUrl:mlEditUrl(item.id)}));}
          if(!flexPriceBlocked){
            await ML.activateFlex(t,{site:SITE,itemId:item.id});
            await new Promise(r=>setTimeout(r,1200));
            let chk=null;try{chk=await ML.flexStatus(t,item.id)}catch(_){}
            item=await ML.itemDetails(t,item.id);
            if(Monitoring.isFlex(item,chk))await setStep('flex',postStep('DONE','Flex ativado e confirmado no Mercado Livre.'));
            else await setStep('flex',postStep('WAITING','Solicitação de Flex enviada; aguardando confirmação do Mercado Livre.'));
          }
        }
      }
    }
  }catch(e){await setStep('flex',postStep('ERROR',safeError(e),{details:e.response?.data||null}));}

  // 5. Promoção / desconto. Só é permitido quando o item já está ativo.
  item=await ML.itemDetails(t,item.id); isActive=String(item.status||'').toLowerCase()==='active';
  try{
    if(settings.postPublishAutoPromotionEnabled===false)await setStep('promotion',postStep('SKIPPED','Promoção automática pós-publicação desativada.'));
    else if(!isActive)await setStep('promotion',postStep('WAITING','Aguardando anúncio ficar ativo para aplicar promoção/desconto.'));
    else{
      let promos=[];try{promos=await ML.promotionsForItem(t,item.id)||[]}catch(_){}
      const active=promos.find(x=>['started','active','pending','sync_requested'].includes(String(x.status||'').toLowerCase()));
      if(active)await setStep('promotion',postStep('DONE',`Promoção ativa/programada: ${Promotion.typeLabel(active.type||active.promotion_type)}.`,{type:active.type||active.promotion_type,status:active.status,price:active.price||null}));
      else{
        let applied=null;
        const candidates=[];
        for(const promo of promos.filter(x=>String(x.status||'').toLowerCase()==='candidate')){
          const projection=await projectPromotion(p,promo,item,t);
          const row={id:`${item.id}|${promo.type||promo.promotion_type}|${promo.id||promo.promotion_id||''}`,productId:p.id,itemId:item.id,sku:p.sku,title:p.product||p.seoTitle,promotionId:promo.id||promo.promotion_id||null,type:promo.type||promo.promotion_type||'UNKNOWN',status:'candidate',raw:promo,...projection,selected:previousSelected.has(`${p.ml_item_id}|${type}|${promotionId||promo.ref_id||promo.name||promo.status}`)};
          if(row.eligible)candidates.push(row);
        }
        candidates.sort((a,b)=>n(b.projectedMargin)-n(a.projectedMargin));
        if(candidates[0]){await applyPromotionRow(candidates[0],t);applied={kind:'campaign',type:candidates[0].type,price:candidates[0].promoPrice,margin:candidates[0].projectedMargin};}
        else{
          const d=await safeIndividualDiscount(p,item,t);
          if(d.ok)applied={kind:'price_discount',...d};
          else await setStep('promotion',postStep('MANUAL',`Nenhuma campanha segura foi aplicada automaticamente. ${d.reason||'Revise promoções disponíveis.'}`,{editUrl:mlEditUrl(item.id),details:d.details||null}));
        }
        if(applied){
          await new Promise(r=>setTimeout(r,1200));
          const confirm=await ML.promotionsForItem(t,item.id).catch(()=>[]);
          const found=(confirm||[]).find(x=>['started','active','pending','sync_requested'].includes(String(x.status||'').toLowerCase()));
          if(found)await setStep('promotion',postStep('DONE',`Desconto/promoção enviado e confirmado (${Promotion.typeLabel(found.type||found.promotion_type)}).`,{applied,status:found.status,price:found.price||applied.price||null}));
          else await setStep('promotion',postStep('WAITING','Promoção enviada; aguardando confirmação do Mercado Livre.',{applied}));
        }
      }
    }
  }catch(e){await setStep('promotion',postStep('ERROR',safeError(e),{details:e.response?.data||null}));}

  // 6. Vídeo: Marketplace usa Clips; a API pública não documenta upload automático de Clips.
  const video=p.marketproVideo||p.manualVideo||p.video_url;
  if(video&&p.clipManualConfirmedAt){
    await setStep('video',postStep('DONE',`Clip confirmado manualmente no Mercado Livre em ${new Date(p.clipManualConfirmedAt).toLocaleString('pt-BR')}.`,{manualConfirmation:true,confirmedAt:p.clipManualConfirmedAt}));
  }else if(video){
    const mediaUrl=p.marketproVideo?.streamUrl||(p.manualVideo?.path?`${BASE}${p.manualVideo.path}`:p.video_url?`${BASE}${p.video_url}`:'');
    await setStep('video',postStep('MANUAL','Vídeo está preparado no Publisher, mas o Marketplace exige Clips e não há endpoint público documentado para anexá-lo automaticamente. Abra o anúncio no ML, envie o Clip e depois confirme esta etapa no Publisher.',{editUrl:mlEditUrl(item.id),mediaUrl,canConfirm:true}));
  }else await setStep('video',postStep('SKIPPED','Nenhum vídeo selecionado para esta SKU.'));

  // 7. Verificação remota final: não conclui enquanto o estado essencial do anúncio divergir.
  item=await ML.itemDetails(t,item.id);
  const finalState=publicationRemoteState(item);
  try{
    const user=await ML.me(t),stock=await remoteStockSnapshot(t,p,item,user,settings).catch(()=>null);
    let flex=null;try{flex=await ML.flexStatus(t,item.id)}catch(_){ }
    let promos=[];try{promos=await ML.promotionsForItem(t,item.id)||[]}catch(_){ }
    const promoOk=settings.postPublishAutoPromotionEnabled===false||promos.some(x=>['started','active','pending','sync_requested'].includes(String(x.status||'').toLowerCase()))||['MANUAL','SKIPPED'].includes(String(pipeline.steps.promotion?.status||''));
    const stockStepStatus=String(pipeline.steps.stock?.status||'');
    const stockOk=Boolean(stock&&stock.matches)||stockStepStatus==='MANUAL'||Boolean(pipeline.steps.stock?.changedAfterSales)||(stockStepStatus==='DONE'&&pipeline.steps.stock?.sourceOfTruth==='mercadolivre');
    const statusOk=String(item.status||'').toLowerCase()==='active';
    const flexOk=settings.postPublishAutoFlexEnabled===false||Monitoring.isFlex(item,flex)||['MANUAL','SKIPPED'].includes(String(pipeline.steps.flex?.status||''));
    if(statusOk&&stockOk&&flexOk&&promoOk)await setStep('remote',postStep('DONE','Estado remoto reconciliado: anúncio ativo e etapas automáticas confirmadas.',{status:item.status,stock:stock?{mode:stock.mode,remote:stock.marketRemote??stock.remote,expected:stock.expected,source:stock.marketSource||stock.mode}:null,flex:Boolean(Monitoring.isFlex(item,flex)),promotion:promoOk}));
    else await setStep('remote',postStep('WAITING',`Mercado Livre ainda não está totalmente reconciliado (${[!statusOk?'status':null,!stockOk?'estoque':null,!flexOk?'Flex':null,!promoOk?'promoção':null].filter(Boolean).join(', ')}).`,{status:item.status,stock,flex:Boolean(Monitoring.isFlex(item,flex)),promotion:promoOk}));
  }catch(e){await setStep('remote',postStep('WAITING',`Verificação remota incompleta: ${safeError(e)}`));}
  pipeline.remote={status:item.status||'',subStatus:item.sub_status||[],state:finalState,permalink:item.permalink||''};
  pipeline.status=postPipelineOverall(pipeline.steps);
  pipeline.completedAt=['DONE','ACTION_REQUIRED'].includes(pipeline.status)?new Date().toISOString():pipeline.completedAt||null;
  await save();
  await store.addJob({id:id(),type:'post-publish-pipeline',status:pipeline.status.toLowerCase(),sku:p.sku,item_id:item.id,steps:pipeline.steps,at:new Date().toISOString()}).catch(()=>{});
  return pipeline;
}

function normalizedDescriptionText(v){return clean(v).replace(/\s+/g,' ').trim()}
async function buildPostPublishCorrectionPlan(p,{persist=true}={}){
  if(!p?.ml_item_id)throw new Error('SKU ainda não possui MLB vinculado.');
  const t=await token(),settings=store.getSettings(),user=await ML.me(t);
  const item=await ML.itemDetails(t,p.ml_item_id);
  const market=await marketStockSnapshot(t,p,item,user);
  const actions=[],checks=[];
  const add=(type,label,{before=null,after=null,remoteWrite=false,manual=false,reason='',status='PENDING',editUrl='',mediaUrl='',canConfirm=false,actionLabel='',guidance=''}={})=>actions.push({type,label,before,after,remoteWrite,manual,reason,status,editUrl,mediaUrl,canConfirm,actionLabel,guidance});
  const ok=(type,label,details={})=>checks.push({type,label,status:'OK',...details});

  const localQty=Math.max(0,Math.floor(n(p.stock,0))),remoteQty=Math.max(0,Math.floor(n(market.quantity,0)));
  const remoteAuthority=Boolean(p.ml_item_id);
  if(remoteAuthority){
    if(localQty!==remoteQty){
      await store.updateProduct(p.id,{stock:remoteQty,stock_quantity_known:true,stock_source:'mercadolivre_remote',stockAuthority:'mercadolivre',ml_available_quantity:remoteQty,ml_stock_source:market.source,ml_stock_checked_at:new Date().toISOString(),availability_status:remoteQty>0?'available':'unavailable',availability_raw:`Mercado Livre: ${remoteQty} unidade(s)`}).catch(()=>{});
      ok('stock',`Estoque Mercado Livre confirmado e atualizado no Publisher: ${remoteQty} unidade(s).`,{source:market.source,autoResolved:true});
    }else ok('stock',`Estoque Mercado Livre confirmado: ${remoteQty} unidade(s).`,{source:market.source});
  }else{
    const target=desiredStockTarget(p);
    const snap=await remoteStockSnapshot(t,p,item,user,settings).catch(()=>null);
    const compareRemote=snap?.marketRemote??snap?.remote??remoteQty;
    if(snap&&!snap.matches)add('stock-sync','Sincronizar estoque no Mercado Livre com o estoque esperado pelo Publisher',{before:`${compareRemote} un.`,after:`${target.quantity} un.`,remoteWrite:true,reason:`Fonte esperada: ${target.source}.`});
    else ok('stock',`Estoque remoto compatível com o alvo: ${compareRemote} unidade(s).`);
  }

  const expectedPictures=Math.min(approvedPictureSources(p).length,12),remotePictures=Array.isArray(item.pictures)?item.pictures.length:0;
  const picturePending=(item.sub_status||[]).some(x=>/picture_(download|downloading)_pending/i.test(String(x)));
  if(expectedPictures>0&&(remotePictures<expectedPictures||picturePending))add('pictures','Corrigir/sincronizar fotos no anúncio',{before:`${remotePictures}/${expectedPictures}`,after:`${expectedPictures}/${expectedPictures}`,remoteWrite:true,reason:picturePending?'Mercado Livre ainda está processando imagens.':'Quantidade de fotos remotas está abaixo das fotos aprovadas.'});
  else ok('pictures',`Fotos confirmadas no Mercado Livre: ${remotePictures}.`);

  if(p.description){
    let remoteDescription='';
    try{const d=await ML.itemDescription(t,item.id);remoteDescription=d?.plain_text||d?.text||'';}catch(_){ }
    if(remoteDescription&&normalizedDescriptionText(remoteDescription)===normalizedDescriptionText(p.description))ok('description','Descrição já está sincronizada.');
    else add('description','Sincronizar a descrição salva no Publisher',{before:remoteDescription?'descrição diferente':'não confirmada',after:'descrição do Publisher',remoteWrite:true});
  }else ok('description','SKU sem descrição pendente para sincronizar.');

  const state=publicationRemoteState(item);
  if(String(item.status||'').toLowerCase()!=='active'){
    const subs=(item.sub_status||[]).map(String);
    if(remoteQty>0&&(String(item.status||'').toLowerCase()==='paused')&&(subs.includes('out_of_stock')||subs.length===0))add('activation','Reativar o anúncio após confirmar estoque positivo',{before:item.status,after:'active',remoteWrite:true});
    else checks.push({type:'status',label:`Status remoto: ${state.label}`,status:'WAITING',reason:state.message});
  }else ok('status','Anúncio ativo no Mercado Livre.');

  if(settings.postPublishAutoFlexEnabled!==false){
    let flexRaw=null;try{flexRaw=await ML.flexStatus(t,item.id)}catch(_){ }
    if(Monitoring.isFlex(item,flexRaw))ok('flex','Flex já está ativo.');
    else{
      try{
        const [prefs,subs]=await Promise.all([ML.categoryShippingPreferences(t,item.category_id),ML.flexSubscriptions(t,{site:SITE,userId:user.id}).catch(()=>[])]);
        const supports=(prefs?.logistics||[]).some(x=>Array.isArray(x?.types)&&x.types.includes('self_service'));
        const subscribed=(Array.isArray(subs)?subs:[]).some(x=>String(x?.mode||'').toUpperCase()==='FLEX'&&['in','active','activating','enabled'].includes(String(x?.status||'').toLowerCase()));
        if(!supports)ok('flex','Flex não é oferecido para esta categoria.',{notApplicable:true});
        else if(!subscribed)add('flex','Ativar ou validar Flex na Central do Vendedor',{manual:true,remoteWrite:false,reason:'A conta não retornou assinatura Flex ativa.',editUrl:mlEditUrl(item.id),actionLabel:'Abrir esta SKU para revisar Flex',guidance:'Abra a edição deste anúncio e confira a modalidade de envio. Depois volte e clique em verificar novamente.'});
        else add('flex','Ativar Flex automaticamente',{before:'desativado',after:'ativo',remoteWrite:true,reason:'Categoria e conta aceitam Flex; o Publisher ainda valida preço e margem antes de ativar.',editUrl:mlEditUrl(item.id),actionLabel:'Ativar Flex'});
      }catch(e){
        add('flex','Revisar Flex desta SKU',{manual:true,remoteWrite:false,reason:`Não foi possível confirmar elegibilidade agora: ${safeError(e)}`,editUrl:mlEditUrl(item.id),actionLabel:'Abrir esta SKU para revisar Flex'});
      }
    }
  }else ok('flex','Flex automático está desativado nas configurações.');

  if(settings.postPublishAutoPromotionEnabled!==false){
    let promos=[];try{promos=await ML.promotionsForItem(t,item.id)||[]}catch(_){ }
    const active=promos.find(x=>['started','active','pending','sync_requested'].includes(String(x.status||'').toLowerCase()));
    if(active)ok('promotion',`Promoção já ativa/programada: ${Promotion.typeLabel(active.type||active.promotion_type)}.`);
    else add('promotion','Aplicar promoção/desconto seguro se houver elegibilidade',{before:'sem promoção ativa',after:'promoção elegível com margem protegida',remoteWrite:true});
  }else ok('promotion','Promoção automática está desativada.');

  const video=p.marketproVideo||p.manualVideo||p.video_url;
  if(video&&!p.clipManualConfirmedAt){
    const mediaUrl=p.marketproVideo?.streamUrl||(p.manualVideo?.path?`${BASE}${p.manualVideo.path}`:p.video_url?`${BASE}${p.video_url}`:'');
    add('video','Anexar o Clip desta SKU no Mercado Livre',{manual:true,remoteWrite:false,reason:'O vídeo já está preparado. Falta somente anexá-lo na seção Clips da edição deste anúncio.',editUrl:mlEditUrl(item.id),mediaUrl,canConfirm:true,actionLabel:'Abrir esta SKU em Alterar → Clips',guidance:'Abra esta SKU no Mercado Livre, entre na seção Clips, envie o vídeo preparado e volte para confirmar.'});
  }else if(video)ok('video','Clip marcado como confirmado manualmente.');else ok('video','Nenhum vídeo preparado para esta SKU.',{optional:true});

  const plan={sku:p.sku,itemId:item.id,generatedAt:new Date().toISOString(),remoteStock:{quantity:remoteQty,source:market.source,itemQuantity:market.itemQuantity,userProductIds:market.userProductIds,allLocationsTotal:market.allLocationsTotal,sellerManagedTotal:market.sellerManagedTotal},actions,checks,remoteWrites:actions.filter(x=>x.remoteWrite).length,manualActions:actions.filter(x=>x.manual).length,summary:actions.length?`${actions.length} ação(ões) identificada(s) antes da finalização.`:'Nenhuma correção necessária; somente validação final.'};
  if(persist)await store.updateProduct(p.id,{postPublishCorrectionPlan:plan,ml_available_quantity:remoteQty,ml_stock_source:market.source,ml_stock_checked_at:new Date().toISOString()}).catch(()=>{});
  return plan;
}

async function remotePublicationGuard(p,t,userId){
  const local=localPublicationGuard(p); if(local.blocked)return local;
  const ids=new Set();
  for(const params of [{sellerSku:p.sku},{sku:p.sku}]){
    try{const d=await ML.userItemsSearch(t,{userId,...params,limit:50});for(const itemId of d?.results||[])if(itemId)ids.add(String(itemId));}catch(_){}
  }
  if(ids.size) return {blocked:true,code:'ALREADY_PUBLISHED_ML',label:'SKU JÁ PUBLICADA',reason:`Mercado Livre já possui ${ids.size} anúncio(s) com esta SKU.`,stock:Math.floor(n(p.stock,0)),existingItems:[...ids],checkedAt:new Date().toISOString(),source:'mercadolivre'};
  return {...local,checkedAt:new Date().toISOString(),source:'mercadolivre'};
}
async function refreshPublicationGuards({ids=null,remote=true}={}){
  const all=store.getProducts(), targets=ids?all.filter(p=>ids.includes(p.id)):all, result=[];
  let t=null,user=null;
  if(remote&&targets.length){try{t=await token();user=await ML.me(t);}catch{}}
  for(let i=0;i<targets.length;i+=5){
    const batch=targets.slice(i,i+5);
    const rows=await Promise.all(batch.map(async original=>{
      let p=original,guard=null,reconciled=false,reconcileData=null;
      if(t&&user&&p.ml_item_id){
        reconcileData=await reconcileExistingPublication(p,{existingItems:[p.ml_item_id]},t);
        if(reconcileData?.ok){p=store.findProduct(p.id,p.sku)||{...p,...reconcileData.patch};reconciled=true;}
        guard=localPublicationGuard(p);
      }else{
        guard=(t&&user)?await remotePublicationGuard(p,t,user.id):localPublicationGuard(p);
        // V1.8.48: se a busca do ML encontrou exatamente um anúncio para a SKU,
        // vincula automaticamente ao produto local. Antes ele ficava bloqueado como
        // "SKU JÁ PUBLICADA" e nunca ganhava ml_item_id, deixando a fila presa.
        if(t&&guard?.code==='ALREADY_PUBLISHED_ML'&&Array.isArray(guard.existingItems)&&guard.existingItems.length===1){
          reconcileData=await reconcileExistingPublication(p,guard,t);
          if(reconcileData?.ok){
            p=store.findProduct(p.id,p.sku)||{...p,...reconcileData.patch};reconciled=true;
            guard={blocked:false,code:'LINKED_EXISTING_ML',label:'SKU JÁ PUBLICADA · VINCULADA',reason:`Anúncio ${p.ml_item_id} localizado no Mercado Livre e vinculado automaticamente ao Publisher. Estoque remoto ${reconcileData.marketStock?.quantity??'consultado'} unidade(s).`,stock:reconcileData.marketStock?.quantity??n(p.stock),remoteStock:reconcileData.marketStock||null,existingItems:[p.ml_item_id],checkedAt:new Date().toISOString(),source:'mercadolivre'};
          }
        }
      }
      const base={...p,publicationGuard:guard}; const q=quality(base); const readiness=productReadiness({...base,quality:q});
      let status=p.status;
      if(p.ml_item_id)status='publicado';
      else if(guard.code==='OUT_OF_STOCK')status='bloqueado-sem-estoque';
      else if(guard.blocked&&String(guard.code||'').startsWith('ALREADY_PUBLISHED'))status='bloqueado-ja-publicada';
      else if(String(status||'').startsWith('bloqueado-'))status='importado';
      await store.updateProduct(p.id,{publicationGuard:guard,quality:q,readiness,status});
      if(reconciled&&p.ml_item_id&&store.getSettings().postPublishPipelineEnabled!==false){
        const linked=store.findProduct(p.id,p.sku)||p;
        await buildPostPublishCorrectionPlan(linked,{persist:true}).catch(()=>null);
      }
      return {id:p.id,sku:p.sku,reconciled,itemId:p.ml_item_id||null,remoteStock:reconcileData?.marketStock?.quantity??null,...guard};
    }));
    result.push(...rows);
  }
  return result;
}

function productReadiness(p){
  const r=CE.readiness(p); const extra=[];
  const guard=p.publicationGuard||localPublicationGuard(p);
  if(!stockIsAvailable(p)) extra.push(clean(p.availability_status).toLowerCase()==='unavailable'?'SKU INDISPONÍVEL':'SKU SEM ESTOQUE');
  if(guard?.blocked) extra.push(guard.label||guard.reason||'bloqueio de publicação');
  const catalogStatus=String(p.catalogPolicy?.status||'unknown');
  if(['unknown','unverified'].includes(catalogStatus)) extra.push('validação de catálogo pendente');
  if(!CE.dimensionsParam(p)) extra.push('altura, largura, comprimento e peso em gramas para cotação de frete');
  if(p.commercialAnalysis?.shippingComplete===false) extra.push('cotação de frete incompleta');
  return {ready:r.ready&&extra.length===0,reasons:[...new Set([...r.reasons,...extra])],guard};
}

async function researchMissingProductData(base,t){
  const q=[base.brand,base.model,base.product].map(clean).filter(Boolean).join(' ').slice(0,160);
  const candidates=[];
  const addCandidate=async(raw,{kind='catalog',exactIdentifier=false,source='Mercado Livre'}={})=>{
    if(!raw)return;
    let detail=raw;
    try{
      if(kind==='catalog'&&raw.id) detail=await ML.productDetails(t,raw.id);
      if(kind==='listing'&&raw.id) detail=await ML.itemDetails(t,raw.id);
    }catch(_){return;}
    const scored=Research.identityScore(base,detail,{exactIdentifier,catalog:kind==='catalog'});
    candidates.push({...scored,id:detail.id||raw.id||'',kind,source,detail});
  };
  if(clean(base.gtin)){
    try{
      const d=await ML.productSearch(t,{site:SITE,productIdentifier:clean(base.gtin),status:'active',limit:5});
      for(const r of (d?.results||[]).slice(0,3)) await addCandidate(r,{kind:'catalog',exactIdentifier:true,source:'Catálogo oficial Mercado Livre'});
    }catch(_){ }
  }
  if(!candidates.length && (clean(base.model)||clean(base.product))){
    try{
      const term=[base.brand,base.model].map(clean).filter(Boolean).join(' ')||q;
      const d=await ML.productSearch(t,{site:SITE,q:term,status:'active',limit:8});
      for(const r of (d?.results||[]).slice(0,4)) await addCandidate(r,{kind:'catalog',source:'Catálogo oficial Mercado Livre'});
    }catch(_){ }
  }
  const bestCatalog=candidates.sort((a,b)=>b.score-a.score)[0];
  if((bestCatalog?.score||0)<90 && q){
    try{
      const d=await ML.searchItems(t,{site:SITE,q,categoryId:base.category_id||undefined,limit:8});
      for(const r of (d?.results||[]).slice(0,4)) await addCandidate(r,{kind:'listing',source:'Anúncio comparável Mercado Livre'});
    }catch(_){ }
  }
  candidates.sort((a,b)=>b.score-a.score);
  const best=candidates[0]||null;
  if(!best||best.score<85) return {patch:{},evidence:best?Research.evidence(best):null,status:'not_confirmed',technicalAttributeValues:{},candidates:candidates.slice(0,5).map(x=>({id:x.id,score:x.score,kind:x.kind,reasons:x.reasons}))};
  const patch=Research.buildPatch(base,best);
  const technicalAttributeValues=best.score>=95?Research.attributeValueMap(best.detail):{};
  return {patch,evidence:Research.evidence(best),status:best.score>=95?'confirmed':'high_confidence',technicalAttributeValues,candidates:candidates.slice(0,5).map(x=>({id:x.id,score:x.score,kind:x.kind,reasons:x.reasons}))};
}

async function enrichProduct(p,body={}){
  const mergedInput={...p,...body};
  const recoveredName=recoveredProductName(mergedInput); if(recoveredName&&!SEO.generic(recoveredName))mergedInput.product=recoveredName;
  let patch={...seo(mergedInput)};
  const t=await token();
  const research=await researchMissingProductData(mergedInput,t);
  const researchFields=Object.keys(research.patch||{});
  if(researchFields.length){ Object.assign(mergedInput,research.patch); patch={...patch,...research.patch,...seo({...mergedInput,...research.patch})}; }
  patch.researchEvidence=research.evidence||p.researchEvidence||null; patch.researchFilledFields=researchFields; patch.researchStatus=research.status;
  const sourceName=clean(mergedInput.product||patch.product||patch.seoTitle||p.seoTitle);
  const genericName=!sourceName||sourceName.length<5||['importado','produto','item','sem nome','não informado','nao informado'].includes(sourceName.toLowerCase());
  const enrichmentWarnings=[];
  if(genericName) enrichmentWarnings.push('O nome do produto está genérico ou insuficiente. Atualize o Catálogo WeDrop ou informe GTIN/marca/modelo.');
  if(research.status==='not_confirmed') enrichmentWarnings.push('Pesquisa no Mercado Livre sem confiança suficiente para preencher dados técnicos automaticamente. Nenhum dado ambíguo foi inventado.');
  if(researchFields.length) enrichmentWarnings.push(`Pesquisa confiável preencheu: ${researchFields.join(', ')}.`);
  let pred=[];
  if(!genericName){
    if(!mergedInput.category_id){pred=await ML.categoryPredictor(t,sourceName);if(pred?.[0]?.category_id)patch.category_id=pred[0].category_id;}
    else{try{pred=await ML.categoryPredictor(t,sourceName)}catch{}}
  }
  const first=pred?.[0]||{};
  patch.domain_id=first.domain_id||patch.domain_id||mergedInput.domain_id||p.domain_id||'';
  patch.category_name=first.category_name||patch.category_name||p.category_name||'';
  patch.predictedAttributes=first.attributes||p.predictedAttributes||[];
  const rawConfidence=first.category_probability ?? first.probability ?? first.score;
  const confidence=Number.isFinite(Number(rawConfidence))?Number(rawConfidence):null;
  const categoryId=patch.category_id||mergedInput.category_id;
  patch.categoryValidation={status:!categoryId?'missing':confidence!==null&&confidence>=0.8?'confirmed':'identified',confidence,source:mergedInput.category_id?'existing':'predictor',alternatives:(pred||[]).slice(0,3).map(x=>({category_id:x.category_id||'',category_name:x.category_name||'',domain_id:x.domain_id||'',score:Number(x.category_probability??x.probability??x.score??0)||null})),checkedAt:new Date().toISOString()};
  if(!categoryId) enrichmentWarnings.push('Categoria não identificada. O produto precisa de revisão antes de qualquer publicação.');
  let attrs=[];
  if(categoryId){
    attrs=await ML.categoryAttributes(t,categoryId);
    let techInput=null;try{techInput=await ML.categoryTechnicalSpecsInput(t,categoryId)}catch(_){techInput=null;}
    const visible=mergeTechnicalSchemas((Array.isArray(attrs)?attrs:[]).map(technicalAttributeDescriptor),technicalSpecInputDescriptors(techInput)).slice(0,260);
    patch.technicalAttributes=visible; patch.requiredAttributes=visible.filter(a=>a.required).slice(0,160);
    try{const sale=await ML.categorySaleTerms(t,categoryId);patch.saleTerms=(Array.isArray(sale)?sale:[]).filter(visibleSaleTerm).slice(0,80).map(saleTermDescriptor);}catch(_){patch.saleTerms=mergedInput.saleTerms||p.saleTerms||[];}
  }
  const attrValues={...(p.attributeValues||{}),...(mergedInput.attributeValues||{}),...(mergedInput.manualAttributes||{})};
  const attributeSources={...(p.attributeSources||{})};
  const knownAttr={BRAND:mergedInput.brand,MODEL:mergedInput.model||mergedInput.seoModelExpanded||mergedInput.seoModel,GTIN:mergedInput.gtin,COLOR:mergedInput.color,MATERIAL:mergedInput.material,VOLTAGE:mergedInput.voltage,CAPACITY:mergedInput.capacity,SIZE:mergedInput.size};
  for(const [aid,val] of Object.entries(knownAttr)){if(clean(val)&&!clean(attrValues[aid])){attrValues[aid]=clean(val);attributeSources[aid]=attributeSources[aid]||((aid==='MODEL'&&!mergedInput.model)?'SEO · busca secundária':'WeDrop');}}
  for(const a of patch.predictedAttributes||[]){if(a?.id&&clean(a?.value_name)&&!clean(attrValues[a.id])){attrValues[a.id]=clean(a.value_name);attributeSources[a.id]=attributeSources[a.id]||'Mercado Livre · categoria';}}
  for(const a of patch.technicalAttributes||[]){if(clean(attrValues[a.id]))continue;const inferred=inferAttributeValue(a,{...mergedInput,...patch});if(inferred){attrValues[a.id]=inferred.value;attributeSources[a.id]=inferred.source;}}
  const categoryAttrIds=new Set((patch.technicalAttributes||[]).map(a=>a.id));
  for(const [aid,val] of Object.entries(research.technicalAttributeValues||{})){if(categoryAttrIds.has(aid)&&!clean(attrValues[aid])&&clean(val)&&(research.evidence?.score||0)>=95){attrValues[aid]=clean(val);attributeSources[aid]='Mercado Livre · produto idêntico';}}
  for(const aid of Object.keys(mergedInput.manualAttributes||{})){if(clean(mergedInput.manualAttributes[aid]))attributeSources[aid]='Manual';}
  patch.attributeValues=attrValues; patch.attributeSources=attributeSources;
  const saleTermValues={...(p.saleTermValues||{}),...(mergedInput.saleTermValues||{}),...(mergedInput.manualSaleTerms||{})}; patch.saleTermValues=saleTermValues;
  const modelAttr=attrs.find(a=>a.id==='MODEL'); const modelMaxLength=n(modelAttr?.value_max_length,120)||120;
  let categoryDetail=null; try{if(categoryId)categoryDetail=await ML.categoryDetails(t,categoryId);}catch{}
  if(categoryDetail?.name)patch.category_name=clean(categoryDetail.name);
  const titleMaxLength=n(categoryDetail?.settings?.max_title_length,60)||60;
  let trendData=[];try{trendData=await ML.trends(t,{site:SITE,categoryId});}catch{}
  let marketListings=[];try{if(sourceName){const sr=await ML.searchItems(t,{site:SITE,q:sourceName,categoryId:categoryId||undefined,limit:30});marketListings=(sr?.results||[]).slice(0,30);}}catch{}
  const seasonal=CE.seasonalContext();
  const seoProfile=SEO.buildSeoProfile({...mergedInput,...patch},{maxTitleLength:titleMaxLength,maxModelLength:modelMaxLength,trends:trendData||[],listings:marketListings,supplierCategory:clean(mergedInput.supplier_category||supplierAttrValue(mergedInput,'Categoria')),seasonal});
  if(seoProfile.title)patch.seoTitle=seoProfile.title;
  patch.seoModelExpanded=seoProfile.secondary||clean(mergedInput.model)||patch.seoModel||''; patch.seoModel=patch.seoModelExpanded;
  patch.seoKeywordsPrimary=seoProfile.primaryKeywords; patch.seoKeywordsSecondary=seoProfile.secondaryKeywords;
  patch.seoAnalysis={marketTerms:seoProfile.marketTerms,trendTerms:seoProfile.trendTerms,seasonalTerms:seoProfile.seasonalTerms||[],competitorTitles:seoProfile.relevantCompetitorTitles||[],titleMaxLength,modelMaxLength,updatedAt:new Date().toISOString()};
  patch.seoResearch={trends:seoProfile.trendTerms,seasonal,updatedAt:new Date().toISOString()}; patch.modelMaxLength=modelMaxLength; patch.titleMaxLength=titleMaxLength;
  // Descrição: manual/protegida nunca é alterada. Descrições automáticas antigas/fracas são refeitas
  // automaticamente usando os dados atuais do fornecedor e da ficha técnica.
  const currentDescription=preserveMultiline(mergedInput.description);
  const currentDescriptionSource=clean(mergedInput.descriptionSource||p.descriptionSource||'auto');
  const currentDescriptionLocked=Boolean(mergedInput.descriptionLocked||p.descriptionLocked);
  if(currentDescription && (currentDescriptionLocked||currentDescriptionSource==='manual'||SEO.isOptimizedDescription(currentDescription))){
    patch.description=currentDescription;
    patch.descriptionSource=currentDescriptionSource||'manual';
    patch.descriptionLocked=currentDescriptionLocked;
  }else{
    patch.description=SEO.buildDescription({...mergedInput,...patch,description:'',descriptionLocked:false,descriptionSource:'auto'});
    patch.descriptionSource='auto';
    patch.descriptionLocked=false;
    patch.descriptionVersion=2;
  }
  patch.catalogPolicy=await catalogPolicy(patch.domain_id,{token:t,title:sourceName||patch.seoTitle||mergedInput.product||p.product||'',productIdentifier:clean(mergedInput.gtin||mergedInput.ean||p.gtin||p.ean||'')});
  if(['unknown','unverified'].includes(String(patch.catalogPolicy?.status||''))) enrichmentWarnings.push(patch.catalogPolicy?.reason||'Política de catálogo ainda não confirmada.');
  patch.enrichmentWarnings=[...new Set(enrichmentWarnings)];
  const full={...p,...mergedInput,...patch,manualAttributes:mergedInput.manualAttributes||p.manualAttributes||{},manualSaleTerms:mergedInput.manualSaleTerms||p.manualSaleTerms||{}};
  patch.technicalCoverage=technicalCoverage(full); patch.publicationAudit=publicationFieldAudit({...full,technicalCoverage:patch.technicalCoverage}); patch.mlFormSchema=buildMlFormSchema({...full,...patch}); patch.quality=quality({...full,...patch});
  return patch;
}
function onlyDigits(v){ return String(v||'').replace(/\D/g,''); }
function supplierOriginZip(p){
  const attrs=p?.supplierAttributes||{};
  for(const [k,v] of Object.entries(attrs)){
    const nk=clean(k).toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'');
    if(!/(cep|zip|postal)/.test(nk)) continue;
    if(!/(origem|galpao|fornecedor|warehouse|deposito|expedicao|envio)/.test(nk)) continue;
    const z=onlyDigits(v); if(z.length===8) return z;
  }
  return '';
}
function addressTypes(a){
  const raw=a?.types||a?.type||[]; const arr=Array.isArray(raw)?raw:[raw];
  return arr.map(x=>typeof x==='string'?x:(x?.name||x?.type||'')).map(x=>clean(x).toLowerCase());
}
async function resolveCommercialOrigin(t,user,settings,p={}){
  const envZip=onlyDigits(process.env.WEDROP_ORIGIN_ZIP_CODE); if(envZip.length===8) return {zipCode:envZip,source:'WeDrop · CEP do galpão configurado',automatic:true};
  const supplierZip=supplierOriginZip(p); if(supplierZip) return {zipCode:supplierZip,source:'WeDrop · catálogo do fornecedor',automatic:true};
  try{
    const raw=await ML.userAddresses(t,user.id); const list=Array.isArray(raw)?raw:(Array.isArray(raw?.addresses)?raw.addresses:[raw].filter(Boolean));
    const active=list.filter(a=>String(a?.status||'active').toLowerCase()!=='inactive');
    const shipping=active.find(a=>addressTypes(a).includes('envio'))||active.find(a=>addressTypes(a).includes('default_selling_address'))||active[0];
    const z=onlyDigits(shipping?.zip_code); if(z.length===8) return {zipCode:z,source:'Mercado Livre · endereço de envio cadastrado',addressLine:clean(shipping?.address_line||''),automatic:true,addressId:shipping?.id||null};
  }catch(_){}
  try{
    const subs=await ML.flexSubscriptions(t,{site:SITE,userId:user.id}); const flex=(Array.isArray(subs)?subs:[]).find(x=>String(x?.mode||'').toUpperCase()==='FLEX');
    const z=onlyDigits(flex?.origin?.zip_code); if(z.length===8) return {zipCode:z,source:'Mercado Livre · origem do Flex',addressLine:clean(flex?.origin?.address_line||''),automatic:true,serviceId:flex?.service_id||null};
  }catch(_){}
  const old=onlyDigits(settings.originZipCode); if(old.length===8) return {zipCode:old,source:'Configuração anterior do Publisher',automatic:false};
  return {zipCode:'',source:'Origem não localizada automaticamente',automatic:true,missing:true};
}
function logisticsFromPreferences(raw){
  const out=[]; const rows=Array.isArray(raw?.logistics)?raw.logistics:[];
  for(const row of rows){
    const mode=clean(row?.mode||'me2')||'me2';
    for(const type of (Array.isArray(row?.types)?row.types:[])){
      const t=clean(type); if(t&&!out.some(x=>x.type===t&&x.mode===mode))out.push({type:t,mode});
    }
  }
  const priority=['drop_off','xd_drop_off','cross_docking','self_service','fulfillment','default','custom'];
  return out.sort((a,b)=>priority.indexOf(a.type)-priority.indexOf(b.type));
}
function logisticLabel(type){ return ({drop_off:'Mercado Envios / Drop off',xd_drop_off:'Mercado Envios Places',cross_docking:'Coleta Mercado Livre',self_service:'Envios Flex',fulfillment:'Mercado Envios Full',default:'Logística padrão',custom:'Envio personalizado'})[type]||type||'Automática'; }
async function logisticsContext(t,user,categoryId){
  let preferences=null, options=[]; try{preferences=await ML.categoryShippingPreferences(t,categoryId); options=logisticsFromPreferences(preferences);}catch(_){}
  if(!options.length) options=[{type:'drop_off',mode:'me2'}];
  let flexSubscription=false; try{const subs=await ML.flexSubscriptions(t,{site:SITE,userId:user.id});flexSubscription=(Array.isArray(subs)?subs:[]).some(x=>String(x?.mode||'').toUpperCase()==='FLEX'&&['in','active','activating'].includes(String(x?.status||'').toLowerCase()));}catch(_){}
  return {options,preferences,flexSubscription};
}
async function analyzeCommercial(p,body={}){
  const t=await token(); const settings=store.getSettings(); const user=await ML.me(t);
  let working=p;
  if(!working.category_id||!working.domain_id||!working.catalogPolicy||['unknown','unverified'].includes(String(working.catalogPolicy?.status||''))){ const ep=await enrichProduct(working,{}); working={...working,...ep}; await store.updateProduct(p.id,ep); }
  // A precificação não depende mais de o operador digitar um preço. Primeiro atualizamos o sinal de mercado,
  // depois calculamos um preço-base a partir do custo WeDrop + margem + reserva de campanha + possível ADS.
  let marketOpportunity=working.marketOpportunity||null;
  if(body.refreshMarket!==false && (!marketOpportunity||!n(marketOpportunity.marketPrice))){
    try{marketOpportunity=await scanOpportunityProduct(working,t,user,{...settings,adsRate:0}); working={...working,marketOpportunity}; await store.updateProduct(p.id,{marketOpportunity});}catch(_){ }
  }
  const targetMargin=CE.clampPct(body.margin!=null?body.margin:settings.targetMargin,5,70);
  const campaignReservePct=CE.clampPct(body.campaignReservePct!=null?body.campaignReservePct:(settings.pricingCampaignReservePct??settings.promotionTargetDiscount??10),0,60);
  const marketLikelyAds=n(marketOpportunity?.score)>=55;
  const adsReserveRate=CE.clampPct(body.adsRate!=null?body.adsRate:(marketLikelyAds?n(settings.adsPrePriceReservePct,5):0),0,45);
  const computedBase=CE.suggestBasePrice({cost:working.cost,targetMargin,taxRate:settings.taxRate,adsRate:adsReserveRate,campaignReservePct,estimatedFeePct:16,minPrice:Math.max(8,n(working.cost)+0.01)});
  const basePrice=n(body.price)>0?n(body.price):computedBase;
  if(basePrice<=0) throw new Error('Custo do fornecedor ausente. Atualize a SKU no catálogo WeDrop para calcular o preço automaticamente.');
  const threshold=n(settings.freeShippingThreshold,79)||79;
  const candidates=CE.priceCandidates(basePrice,{threshold,minPrice:Math.max(8,n(working.cost)+0.01),wide:!(n(body.price)>0)});
  const dims=CE.dimensionsParam(working); const origin=await resolveCommercialOrigin(t,user,settings,working); const lctx=await logisticsContext(t,user,working.category_id);
  let logisticOptions=lctx.options.filter(x=>['me2','me1','custom','not_specified'].includes(x.mode));
  if(body.logistic_type){ logisticOptions=[{type:clean(body.logistic_type),mode:clean(body.shipping_mode||'me2')}]; }
  const errors=[]; const logisticProbes=[];
  if(dims){
    const probePrices=[basePrice,threshold-.01,threshold+.01].map(x=>Math.round(x*100)/100).filter((x,i,a)=>x>0&&a.indexOf(x)===i);
    for(const opt of logisticOptions.slice(0,6)){
      for(const pp of probePrices){
        const freeShipping=pp>=threshold; let listingRaw,shippingRaw;
        try{listingRaw=await ML.listingPrices(t,{site:SITE,price:pp,listingType:'gold_special',categoryId:working.category_id,logisticType:opt.type,shippingMode:opt.mode});
          shippingRaw=await ML.shippingOptions(t,{userId:user.id,dimensions:dims,itemPrice:pp,listingType:'gold_special',mode:opt.mode,condition:'new',logisticType:opt.type,freeShipping,categoryId:working.category_id,zipCode:origin.zipCode||undefined});
          logisticProbes.push(CE.scenario({price:pp,listingType:'gold_special',listingRaw,shippingRaw,cost:working.cost,taxRate:settings.taxRate,adsRate:adsReserveRate,freeShipping,logisticType:opt.type,shippingMode:opt.mode}));
        }catch(e){errors.push(`logística ${opt.type}/${pp}: ${safeError(e)}`);}
      }
    }
  }
  const bestProbe=CE.pickBest(logisticProbes,targetMargin);
  let selected=bestProbe?{type:bestProbe.logisticType,mode:bestProbe.shippingMode}:null;
  if(!selected){ selected=logisticOptions.find(x=>x.type==='drop_off')||logisticOptions[0]||{type:'drop_off',mode:'me2'}; }
  const logisticType=selected.type, shippingMode=selected.mode;
  const scenarios=[];
  for(const price of candidates){
    for(const listingType of ['gold_special','gold_pro']){
      let listingRaw; try{ listingRaw=await ML.listingPrices(t,{site:SITE,price,listingType,categoryId:working.category_id,logisticType,shippingMode}); }catch(e){errors.push(`listing ${price}/${listingType}: ${safeError(e)}`);continue;}
      const freeVariants=Math.abs(price-threshold)<=1.01?[false,true]:[price>=threshold];
      for(const freeShipping of freeVariants){
        let shippingRaw=null;
        if(dims){ try{shippingRaw=await ML.shippingOptions(t,{userId:user.id,dimensions:dims,itemPrice:price,listingType,mode:shippingMode,condition:'new',logisticType,freeShipping,categoryId:working.category_id,zipCode:origin.zipCode||undefined});}catch(e){errors.push(`frete ${price}/${listingType}/${freeShipping}/${logisticType}: ${safeError(e)}`);} }
        scenarios.push(CE.scenario({price,listingType,listingRaw,shippingRaw,cost:working.cost,taxRate:settings.taxRate,adsRate:adsReserveRate,freeShipping,logisticType,shippingMode}));
      }
    }
  }
  const best=CE.pickBest(scenarios,targetMargin);
  const safe=scenarios.filter(x=>x.margin>=targetMargin).sort((a,b)=>a.price-b.price||b.profit-a.profit)[0]||null;
  const thresholdScenarios=scenarios.filter(x=>Math.abs(x.price-threshold)<=1.01).sort((a,b)=>b.profit-a.profit);
  const logisticsComparison=[];
  for(const opt of logisticOptions){ const rows=logisticProbes.filter(x=>x.logisticType===opt.type&&x.shippingMode===opt.mode); const bx=CE.pickBest(rows,targetMargin); logisticsComparison.push({type:opt.type,mode:opt.mode,label:logisticLabel(opt.type),available:rows.length>0,best:bx?{price:bx.price,profit:bx.profit,margin:bx.margin,shipping:bx.shipping,freeShipping:bx.freeShipping}:null,selected:opt.type===logisticType&&opt.mode===shippingMode}); }
  let highlights=null; try{highlights=await ML.highlights(t,{site:SITE,categoryId:working.category_id});}catch{}
  const recommendedScenario=safe||best;
  const pricingRecommendation=CE.pricingRecommendation({product:working,scenario:recommendedScenario,targetMargin,campaignReservePct,adsReservePct:adsReserveRate});
  const result={
    analyzedAt:new Date().toISOString(),basePrice,autoBasePrice:n(body.price)<=0,targetMargin,campaignReservePct,adsReserveRate,threshold,logisticsAutomatic:!body.logistic_type,origin,logisticType,logisticLabel:logisticLabel(logisticType),shippingMode,availableLogistics:logisticOptions,logisticsComparison,flexSubscription:lctx.flexSubscription,dimensions:dims||null,shippingComplete:Boolean(dims)&&scenarios.some(x=>x.shippingRaw),
    scenarios:scenarios.sort((a,b)=>a.price-b.price||a.listingType.localeCompare(b.listingType)||Number(a.freeShipping)-Number(b.freeShipping)),
    bestScenario:best,competitiveSafeScenario:safe,recommendedScenario,pricingRecommendation,thresholdScenarios:thresholdScenarios.slice(0,8),errors:errors.slice(0,30),catalogPolicy:working.catalogPolicy,
    marketOpportunity:marketOpportunity||null,bestSellers:highlights?.content?.slice(0,20)||[],seasonal:working.seoResearch?.seasonal||CE.seasonalContext(),
    flexDecisionRequired:logisticType==='self_service'
  };
  result.adsRecommendation=AdsEngine.potential({...working,marketOpportunity:marketOpportunity||working.marketOpportunity,commercialAnalysis:result},{...settings,adsMinMargin:settings.adsMinMargin||10,adsTargetRoas:settings.adsTargetRoas||6});
  return result;
}
function commercialPatchFromResult(p,result){
  return {commercialAnalysis:result,analysis:{classic:result.bestScenario?.listingType==='gold_special'?result.bestScenario:null,premium:result.bestScenario?.listingType==='gold_pro'?result.bestScenario:null,best:result.bestScenario?.listingType},priceRecommendation:result.pricingRecommendation||{grossUploadPrice:result.recommendedScenario?.price||result.bestScenario?.price||p.price,minimumSalePrice:result.recommendedScenario?.price||result.bestScenario?.price||p.price,targetMargin:result.targetMargin||store.getSettings().targetMargin},adsRecommendation:result.adsRecommendation||null,marketOpportunity:result.marketOpportunity||p.marketOpportunity||null,status:'analisado-comercialmente'};
}


function isoDay(d){ return new Date(d).toISOString().slice(0,10); }
function publishedProducts(){ return store.getProducts().filter(p=>p.ml_item_id&&String(p.status||'').toLowerCase()==='publicado'); }
function availabilityOk(p){ const a=clean(p?.availability_status).toLowerCase(); if(a==='unavailable')return false; if(p?.stock_quantity_known===true)return n(p.stock)>0; return a==='available'||n(p.stock)>0; }

function pricingPlanFromAnalysis(p,settings,item={}){
  const analysis=p?.commercialAnalysis; if(!analysis?.scenarios?.length)return {safe:false,reason:'Análise comercial pendente.'};
  if(!analysis.shippingComplete)return {safe:false,reason:'Frete ainda não validado com dimensões suficientes.'};
  const minMargin=n(settings.pricingMinMargin,10);
  const currentListing=clean(item?.listing_type_id||p?.listing_type_id||analysis?.recommendedScenario?.listingType||'gold_special');
  const threshold=n(settings.freeShippingThreshold,79)||79;
  // Para automação de preço usamos apenas o cenário logístico que corresponderia ao preço real:
  // abaixo do degrau sem frete grátis; no/ acima do degrau com frete grátis.
  let rows=(analysis.scenarios||[]).filter(x=>x.listingType===currentListing&&Boolean(x.freeShipping)===(n(x.price)>=threshold)&&n(x.margin)>=minMargin&&n(x.price)>n(p.cost));
  if(!rows.length) rows=(analysis.scenarios||[]).filter(x=>Boolean(x.freeShipping)===(n(x.price)>=threshold)&&n(x.margin)>=minMargin&&n(x.price)>n(p.cost));
  rows=rows.sort((a,b)=>n(a.price)-n(b.price)||n(b.profit)-n(a.profit));
  if(!rows.length)return {safe:false,reason:`Nenhum preço testado preserva margem mínima de ${minMargin}%.`,listingType:currentListing};
  const below=rows.filter(x=>n(x.price)<threshold),above=rows.filter(x=>n(x.price)>=threshold);
  const boundarySafe=[threshold-.01,threshold,threshold+.01].every(v=>(analysis.scenarios||[]).some(x=>x.listingType===currentListing&&Math.abs(n(x.price)-v)<.011&&Boolean(x.freeShipping)===(v>=threshold)&&n(x.margin)>=minMargin));
  const anchor=n(analysis.recommendedScenario?.price||item?.price||p.price);
  let zone=rows;
  if(!boundarySafe&&below.length&&above.length) zone=anchor>=threshold?above:below;
  if(!zone.length)zone=rows;
  const minPrice=n(zone[0].price), maxPrice=n(zone[zone.length-1].price);
  return {safe:true,minPrice,maxPrice,listingType:currentListing,minMargin,rows:zone.length,threshold,boundarySafe,crossesThreshold:minPrice<threshold&&maxPrice>=threshold,reason:boundarySafe?'Faixa calculada usando tarifa, frete, impostos, margem e degrau de frete validado.':'Faixa mantida em um único lado do degrau de frete para evitar perda de margem.'};
}

async function scanPricingAutomation({autoApply=false,itemId=null}={}){
  const t=await token(),settings=store.getSettings(),user=await ML.me(t),errors=[],rows=[];
  const products=publishedProducts().filter(p=>!itemId||String(p.ml_item_id)===String(itemId));
  for(const base of products.slice(0,120)){
    let p=base,item=null,existing=null,rules=null;
    try{
      if(!availabilityOk(p)){rows.push({productId:p.id,sku:p.sku,itemId:p.ml_item_id,status:'BLOCKED',reason:'SKU indisponível/sem estoque.'});continue;}
      item=await ML.itemDetails(t,p.ml_item_id);
      if(!p.commercialAnalysis?.scenarios?.length){const a=await analyzeCommercial(p,{price:n(item?.price||p.price)});await store.updateProduct(p.id,{commercialAnalysis:a,priceRecommendation:a.pricingRecommendation||{grossUploadPrice:a.recommendedScenario?.price||p.price,minimumSalePrice:a.recommendedScenario?.price||p.price,targetMargin:a.targetMargin}});p={...p,commercialAnalysis:a,priceRecommendation:a.pricingRecommendation||p.priceRecommendation};}
      const plan=pricingPlanFromAnalysis(p,settings,item);
      if(!plan.safe){rows.push({productId:p.id,sku:p.sku,itemId:p.ml_item_id,status:'BLOCKED',reason:plan.reason,plan});continue;}
      try{rules=await ML.pricingAutomationRules(t,p.ml_item_id);}catch(e){rows.push({productId:p.id,sku:p.sku,itemId:p.ml_item_id,status:'NOT_ELIGIBLE',reason:safeError(e),plan});continue;}
      const availableRules=(rules?.rules||[]).map(x=>x.rule_id).filter(Boolean);const preferred=clean(settings.pricingRule||'INT_EXT');const ruleId=availableRules.includes(preferred)?preferred:(availableRules[0]||'');
      if(!ruleId){rows.push({productId:p.id,sku:p.sku,itemId:p.ml_item_id,status:'NOT_ELIGIBLE',reason:'Mercado Livre não retornou regra de automatização para este item.',plan});continue;}
      try{existing=await ML.pricingAutomationGet(t,p.ml_item_id);}catch(e){if(![404,400,412].includes(Number(e.response?.status)))errors.push({sku:p.sku,itemId:p.ml_item_id,stage:'get',error:safeError(e)});}
      const payload={rule_id:ruleId,min_price:Number(plan.minPrice.toFixed(2))};if(plan.maxPrice>plan.minPrice)payload.max_price=Number(plan.maxPrice.toFixed(2));
      const row={productId:p.id,sku:p.sku,product:p.product,itemId:p.ml_item_id,currentPrice:n(item?.price||p.price),ruleId,availableRules,plan,existing:existing||null,status:existing?.status||'READY',action:existing?'UPDATE':'CREATE',payload};
      if(autoApply&&settings.autoPricingEnabled){try{const applied=existing?await ML.pricingAutomationUpdate(t,p.ml_item_id,payload):await ML.pricingAutomationCreate(t,p.ml_item_id,payload);row.applied=applied;row.status=applied?.status||'ACTIVE';row.action='APPLIED';}catch(e){row.status='ERROR';row.error=safeError(e);errors.push({sku:p.sku,itemId:p.ml_item_id,stage:'apply',error:safeError(e)});}}
      rows.push(row);
    }catch(e){rows.push({productId:p.id,sku:p.sku,itemId:p.ml_item_id,status:'ERROR',reason:safeError(e)});errors.push({sku:p.sku,itemId:p.ml_item_id,error:safeError(e)});}
  }
  const data={lastScanAt:new Date().toISOString(),sellerId:user.id,rows,errors};await store.setPricingAutomation(data);return data;
}

async function applyPricingRows(rowIds=[]){
  const t=await token(),state=store.getPricingAutomation(),out=[],errors=[];
  for(const row of (state.rows||[]).filter(x=>!rowIds.length||rowIds.includes(x.itemId)||rowIds.includes(x.productId))){
    if(!['READY','ACTIVE','PAUSED'].includes(String(row.status||'').toUpperCase())&&!['CREATE','UPDATE'].includes(row.action))continue;
    try{let existing=null;try{existing=await ML.pricingAutomationGet(t,row.itemId)}catch{};const applied=existing?await ML.pricingAutomationUpdate(t,row.itemId,row.payload):await ML.pricingAutomationCreate(t,row.itemId,row.payload);row.status=applied?.status||'ACTIVE';row.applied=applied;row.action='APPLIED';out.push({itemId:row.itemId,sku:row.sku,applied});}catch(e){row.status='ERROR';row.error=safeError(e);errors.push({itemId:row.itemId,sku:row.sku,error:safeError(e)});}
  }
  await store.setPricingAutomation({...state,rows:state.rows,errors:[...(state.errors||[]),...errors],lastApplyAt:new Date().toISOString()});return {ok:true,applied:out,errors};
}

function adsDateRange(days=14){const to=new Date(),from=new Date(to.getTime()-Math.max(1,days)*86400000);return {dateFrom:isoDay(from),dateTo:isoDay(to)};}
async function resolvePadsAdvertiser(t){const raw=await ML.adsAdvertisers(t);const list=raw?.advertisers||raw?.results||[];return list.find(x=>String(x.site_id||x.advertiser_site_id||'').toUpperCase()===SITE)||list[0]||null;}
function adsCampaignPrefix(settings={}){return clean(settings.adsCampaignPrefix||'Rede Achados BR - ADS -')||'Rede Achados BR - ADS -';}
function adsCampaignNameForProduct(p,settings={}){const sku=clean(p?.sku||p?.ml_item_id||p?.id||'SKU').replace(/[^A-Za-z0-9._-]+/g,' ').trim();return `${adsCampaignPrefix(settings)}${sku}`.slice(0,90);}
function isPublisherAdsCampaign(campaign,settings={}){const name=clean(campaign?.name);if(!name)return false;return name.startsWith(adsCampaignPrefix(settings))||name===clean(settings.adsCampaignName||'Rede Achados BR - Automático');}
async function adsCampaignContext(t,advertiser,settings){const range=adsDateRange(Math.max(14,n(settings.adsAttributionDays,14)));const raw=await ML.adsCampaigns(t,{site:advertiser.site_id||SITE,advertiserId:advertiser.advertiser_id,dateFrom:range.dateFrom,dateTo:range.dateTo});return {campaigns:raw?.results||[],range};}
async function getOrCreateSkuAdsCampaign(t,advertiser,settings,p,plan,campaigns=[],{create=true}={}){
  const name=adsCampaignNameForProduct(p,settings);let campaign=campaigns.find(x=>clean(x.name)===name)||null;
  const budget=n(plan?.dailyBudget),roas=AdsEngine.clamp(plan?.roasTarget||settings.adsTargetRoas||6,1,35);
  if(!campaign&&!create)return {campaign:null,name};
  if(budget<=0)throw new Error(`Defina um orçamento diário para a SKU ${p.sku||p.id}.`);
  if(!campaign){campaign=await ML.adsCreateCampaign(t,{site:advertiser.site_id||SITE,advertiserId:advertiser.advertiser_id,payload:{name,status:'active',budget:Number(budget.toFixed(2)),strategy:'profitability',channel:'marketplace',roas_target:Number(roas.toFixed(2))}});campaigns.push(campaign);return {campaign,name,created:true};}
  const changed=Math.abs(n(campaign.budget)-budget)>.009||Math.abs(n(campaign.roas_target)-roas)>.009||String(campaign.status||'').toLowerCase()!=='active';
  if(changed){campaign=await ML.adsUpdateCampaign(t,{site:advertiser.site_id||SITE,campaignId:campaign.id,payload:{budget:Number(budget.toFixed(2)),roas_target:Number(roas.toFixed(2)),status:'active',strategy:'profitability'}});const i=campaigns.findIndex(x=>String(x.id)===String(campaign.id));if(i>=0)campaigns[i]=campaign;}
  return {campaign,name,created:false};
}
function localAdsCandidateRows(){
  const settings=store.getSettings(),state=store.getAds(),existing=new Map((state.rows||[]).map(r=>[String(r.productId),r])),rows=[];
  const candidates=store.getProducts().filter(p=>p.commercialAnalysis?.recommendedScenario||p.priceRecommendation||p.adsRecommendation);
  for(const p of candidates){
    const saved=store.getAdsPlan(p.id)||{};const plan=AdsEngine.normalizedPlan(p,settings,saved);const old=existing.get(String(p.id));
    if(old){rows.push({...old,plan,potential:plan.potential});existing.delete(String(p.id));continue;}
    const published=Boolean(p.ml_item_id);rows.push({productId:p.id,sku:p.sku,product:p.product||p.seoTitle,itemId:p.ml_item_id||null,adGroupId:null,metrics:{},plan,potential:plan.potential,decision:{action:plan.potential.eligible?(published?'WAIT':'PREPARED'):'BLOCK',label:plan.potential.eligible?(published?'AGUARDANDO PRODUCT ADS':'PRONTO APÓS PUBLICAÇÃO'):'NÃO PRIORIZAR ADS',reason:plan.potential.reason,economics:plan.potential.economics},action:plan.potential.eligible?(published?'WAIT':'PREPARED'):'BLOCK',status:plan.potential.eligible?(published?'AGUARDANDO PRODUCT ADS':'PRONTO APÓS PUBLICAÇÃO'):'NÃO PRIORIZAR ADS'});
  }
  rows.push(...existing.values());
  return rows.sort((a,b)=>n(b.potential?.score||b.plan?.potential?.score)-n(a.potential?.score||a.plan?.potential?.score));
}
function adsSettingsForClient(){const s=store.getSettings();return {autoAdsEnabled:Boolean(s.autoAdsEnabled),adsCampaignName:s.adsCampaignName||'Rede Achados BR - Automático',adsCampaignPrefix:adsCampaignPrefix(s),adsDailyBudget:n(s.adsDailyBudget),adsTargetRoas:n(s.adsTargetRoas,6),adsMinMargin:n(s.adsMinMargin,10),adsAttributionDays:n(s.adsAttributionDays,14),adsMinClicksBeforePause:n(s.adsMinClicksBeforePause,30),adsMaxProducts:n(s.adsMaxProducts,20),adsPrePriceReservePct:n(s.adsPrePriceReservePct,5)};}
async function scanAdsAutomation({autoApply=false,itemId=null,inventory=null}={}){
  const t=await token(),settings=store.getSettings(),errors=[],rows=[];let advertiser=null,permissionOk=true,permissionMessage='';
  const inventoryRows=(Array.isArray(inventory)?inventory:(store.getMonitoring().accountInventory||[])).filter(x=>x?.itemId&&(!itemId||String(x.itemId)===String(itemId)));
  const emptyAudit=()=>inventoryRows.map(inv=>({sku:inv.sku||inv.itemId,itemId:inv.itemId,title:inv.title||'',metrics:{},active:false,status:'not_running',adGroupId:null,campaignId:null,campaignName:'',externalAccountItem:true,checkedAt:new Date().toISOString()}));
  try{advertiser=await resolvePadsAdvertiser(t);}catch(e){permissionOk=false;permissionMessage=safeError(e);await store.setAds({lastScanAt:new Date().toISOString(),rows:localAdsCandidateRows(),auditRows:emptyAudit(),errors:[{stage:'advertiser',error:permissionMessage}],permissionOk:false,permissionMessage});throw Object.assign(new Error(`Publicidade sem acesso: ${permissionMessage}. Habilite Publicidade como Leitura e escrita no DevCenter e reconecte o Mercado Livre.`),{status:e.response?.status||403});}
  if(!advertiser){const msg='Conta sem advertiser Product Ads disponível.';const data={lastScanAt:new Date().toISOString(),rows:localAdsCandidateRows(),auditRows:emptyAudit(),errors:[{stage:'advertiser',error:msg}],permissionOk:true,permissionMessage:msg};await store.setAds(data);return {...store.getAds(),settings:adsSettingsForClient()};}
  const ctx=await adsCampaignContext(t,advertiser,settings);const campaigns=ctx.campaigns,campaignById=new Map(campaigns.map(c=>[String(c.id),c]));
  let products=store.getProducts().filter(p=>(p.commercialAnalysis?.recommendedScenario||p.priceRecommendation||p.adsRecommendation)&&(!itemId||String(p.ml_item_id||'')===String(itemId)));
  if(!itemId)products=products.sort((a,b)=>n(b.marketOpportunity?.score)-n(a.marketOpportunity?.score)||n(b.adsRecommendation?.score)-n(a.adsRecommendation?.score)).slice(0,Math.max(20,n(settings.adsMaxProducts,20),100));
  const localIds=products.map(p=>p.ml_item_id).filter(Boolean).map(String),allIds=[...new Set([...localIds,...inventoryRows.map(x=>String(x.itemId)).filter(Boolean)])];let adGroups=[];
  for(let i=0;i<allIds.length;i+=40){try{const raw=await ML.adsAdGroupsByItems(t,{site:advertiser.site_id||SITE,advertiserId:advertiser.advertiser_id,itemIds:allIds.slice(i,i+40),dateFrom:ctx.range.dateFrom,dateTo:ctx.range.dateTo,metrics:true});adGroups.push(...(raw?.results||[]));}catch(e){errors.push({stage:'ad-groups',items:allIds.slice(i,i+40),error:safeError(e)});}}
  const byExternal=new Map(adGroups.map(x=>[String(x.ad_group_external_id||x.item_id||''),x]));const plans={...store.getAdsPlans()};
  for(const p of products){
    const ag=p.ml_item_id?byExternal.get(String(p.ml_item_id))||null:null;let metrics=ag?.metrics||{};const saved=plans[String(p.id)]||{};let plan=AdsEngine.normalizedPlan(p,settings,saved);const potential=plan.potential;
    if(!saved.updatedAt){plans[String(p.id)]={...plan,updatedAt:new Date().toISOString()};}
    const agCampaign=n(ag?.campaign_id,0),campaignObj=agCampaign?campaignById.get(String(agCampaign))||null:null;const appOwned=Boolean(campaignObj&&isPublisherAdsCampaign(campaignObj,settings));
    if(plan.active&&plan.unlimitedBudget===false&&plan.activatedAt&&ag?.id){try{const detail=await ML.adsAdGroupDetail(t,{site:advertiser.site_id||SITE,adGroupId:ag.id||ag.ad_group_id,dateFrom:isoDay(plan.activatedAt),dateTo:isoDay(new Date())});if(detail?.metrics)metrics=detail.metrics;}catch(e){errors.push({sku:p.sku,stage:'budget-metrics',error:safeError(e)});}}
    let d;
    if(!potential.eligible)d={action:'BLOCK',label:'NÃO PRIORIZAR ADS',reason:potential.reason,economics:potential.economics};
    else if(!p.ml_item_id)d={action:'PREPARED',label:'PRONTO APÓS PUBLICAÇÃO',reason:'Preço já preparado com reserva de ADS. Publique o anúncio e depois selecione para ativar Product Ads.',economics:potential.economics};
    else d=AdsEngine.decision({product:p,adGroup:ag,metrics,settings:{...settings,adsTargetRoas:plan.roasTarget}});
    if(agCampaign>0&&!appOwned){d={...d,action:'EXTERNAL',label:'OUTRA CAMPANHA',reason:`Este Ad Group já pertence à campanha ${campaignObj?.name||agCampaign}. O Publisher não altera campanhas manuais/existentes.`};}
    const stopReason=AdsEngine.planStopReason(plan,metrics);
    if(stopReason)d={...d,action:appOwned?'PAUSE':'BLOCK',label:appOwned?'PAUSAR PELO LIMITE':'LIMITE ATINGIDO',reason:stopReason};
    const row={productId:p.id,sku:p.sku,product:p.product||p.seoTitle,itemId:p.ml_item_id||null,adGroupId:ag?.id||ag?.ad_group_id||null,adGroup:ag,campaignId:agCampaign||null,campaignName:campaignObj?.name||plan.campaignName||'',campaignOwnedByPublisher:appOwned,decision:d,metrics,plan,potential,status:d.label,action:d.action};
    if(autoApply&&settings.autoAdsEnabled&&plan.active&&row.adGroupId){
      try{
        if(stopReason||d.action==='PAUSE'){
          if(appOwned){row.applied=await ML.adsUpdateAdGroup(t,{site:advertiser.site_id||SITE,adGroupId:row.adGroupId,status:'paused',campaignId:agCampaign});row.status='PAUSADO AUTOMATICAMENTE';plan={...plan,active:false,pausedAt:new Date().toISOString()};plans[String(p.id)]={...plan,updatedAt:new Date().toISOString()};}
        }else if(potential.eligible&&!['EXTERNAL','BLOCK'].includes(d.action)){
          const own=await getOrCreateSkuAdsCampaign(t,advertiser,settings,p,plan,campaigns,{create:true});campaignById.set(String(own.campaign.id),own.campaign);row.applied=await ML.adsUpdateAdGroup(t,{site:advertiser.site_id||SITE,adGroupId:row.adGroupId,status:'active',campaignId:own.campaign.id});row.campaignId=own.campaign.id;row.campaignName=own.name;row.campaignOwnedByPublisher=true;row.status='ATIVO · GESTÃO AUTOMÁTICA';plan={...plan,active:true,campaignId:own.campaign.id,campaignName:own.name,activatedAt:plan.activatedAt||new Date().toISOString(),pausedAt:null};plans[String(p.id)]={...plan,updatedAt:new Date().toISOString()};
        }
      }catch(e){row.status='ERRO';row.error=safeError(e);errors.push({sku:p.sku,itemId:p.ml_item_id,stage:'auto-apply',error:safeError(e)});}
    }
    row.plan=plan;rows.push(row);
  }
  // V1.8.48: auditoria de ADS cobre todos os anúncios da conta, inclusive SKUs antigas que não nasceram no Publisher.
  // Esses registros são somente leitura; automação continua limitada às SKUs gerenciadas pelo Publisher.
  const localIdSet=new Set(store.getProducts().map(p=>String(p.ml_item_id||'')).filter(Boolean));
  const auditRows=inventoryRows.map(inv=>{
    const ag=byExternal.get(String(inv.itemId))||null,metrics=ag?.metrics||{},campaignId=n(ag?.campaign_id,0)||null,campaignObj=campaignId?campaignById.get(String(campaignId))||null:null;
    const rawStatus=clean(ag?.status||ag?.state||ag?.ad_group_status||'');const active=Boolean(ag)&&!['paused','inactive','disabled','deleted'].includes(rawStatus.toLowerCase());
    return {sku:inv.sku||inv.itemId,itemId:inv.itemId,title:inv.title||'',metrics,active,status:rawStatus|| (ag?'active':'not_running'),adGroupId:ag?.id||ag?.ad_group_id||null,campaignId,campaignName:campaignObj?.name||'',campaignOwnedByPublisher:Boolean(campaignObj&&isPublisherAdsCampaign(campaignObj,settings)),externalAccountItem:!localIdSet.has(String(inv.itemId)),checkedAt:new Date().toISOString()};
  });
  await store.setAdsPlans(plans);const data={lastScanAt:new Date().toISOString(),advertiser,campaign:null,rows,auditRows,errors,permissionOk,permissionMessage,campaigns};await store.setAds(data);return {...store.getAds(),settings:adsSettingsForClient()};
}
async function publishSelectedAds(productIds=[]){
  const latest=await scanAdsAutomation({autoApply:false});const t=await token(),settings=store.getSettings(),advertiser=latest.advertiser;if(!advertiser)throw new Error('Product Ads não disponível nesta conta.');
  const ctx=await adsCampaignContext(t,advertiser,settings);const campaigns=ctx.campaigns;const wanted=new Set((productIds||[]).map(String));const targets=(latest.rows||[]).filter(r=>wanted.size?wanted.has(String(r.productId)):Boolean(r.plan?.selected));const results=[],plans={...store.getAdsPlans()};
  for(const row of targets){
    const p=store.findProduct(row.productId,row.sku);if(!p)continue;let plan=AdsEngine.normalizedPlan(p,settings,plans[String(p.id)]||row.plan||{});
    try{
      if(!plan.potential?.eligible)throw new Error(`SKU ${p.sku}: análise não recomenda ADS neste momento.`);
      if(!p.ml_item_id)throw new Error(`SKU ${p.sku}: publique o anúncio no Mercado Livre antes de ativar ADS.`);
      if(!row.adGroupId)throw new Error(`SKU ${p.sku}: Ad Group do Product Ads ainda não foi localizado. Faça nova análise após o anúncio ficar elegível.`);
      if(row.campaignId&&!row.campaignOwnedByPublisher)throw new Error(`SKU ${p.sku}: já está em uma campanha externa/manual. O Publisher não vai movê-la automaticamente.`);
      if(n(plan.dailyBudget)<=0)throw new Error(`SKU ${p.sku}: orçamento diário precisa ser maior que zero.`);
      const own=await getOrCreateSkuAdsCampaign(t,advertiser,settings,p,plan,campaigns,{create:true});const applied=await ML.adsUpdateAdGroup(t,{site:advertiser.site_id||SITE,adGroupId:row.adGroupId,status:'active',campaignId:own.campaign.id});
      plan={...plan,selected:true,active:true,campaignId:own.campaign.id,campaignName:own.name,activatedAt:plan.activatedAt||new Date().toISOString(),pausedAt:null};plans[String(p.id)]={...plan,updatedAt:new Date().toISOString()};results.push({ok:true,productId:p.id,sku:p.sku,campaignId:own.campaign.id,campaignName:own.name,applied});
    }catch(e){results.push({ok:false,productId:p.id,sku:p.sku,error:safeError(e)});}
  }
  await store.setAdsPlans(plans);const refreshed=await scanAdsAutomation({autoApply:false});return {...refreshed,publishResults:results,published:results.filter(x=>x.ok).length,failed:results.filter(x=>!x.ok).length};
}

async function refreshVariationGroups(){
  const catalog=store.getSupplierCatalog();
  const groups=Variations.detectGroups(catalog.products||[]);
  await store.setVariationGroups(groups);
  const current=store.getProducts();
  if(current.length){ const annotated=Variations.annotateProducts(current,groups); await store.setProducts(annotated); }
  return groups;
}
function marketIds(r){return [r?.id,r?.catalog_product_id,r?.user_product_id].filter(Boolean).map(String);}
async function scanOpportunityProduct(sp,t,user,settings){
  let categoryId=clean(sp.category_id),domainId='';
  if(!categoryId){ try{const pred=await ML.categoryPredictor(t,sp.product); categoryId=pred?.[0]?.category_id||''; domainId=pred?.[0]?.domain_id||'';}catch{} }
  let search={results:[]}; try{search=await ML.searchItems(t,{site:SITE,q:sp.product,categoryId,limit:25});}catch(e){return {sku:sp.sku,product:sp.product,cost:n(sp.cost),categoryId,error:safeError(e),score:0,curve:null};}
  const ranked=(search.results||[]).map(r=>({raw:r,matchScore:Opportunity.similarity(sp.product,r.title||'')})).filter(x=>x.matchScore>=.28).sort((a,b)=>b.matchScore-a.matchScore).slice(0,12);
  const prices=ranked.map(x=>n(x.raw.price)).filter(x=>x>0); const marketPrice=Opportunity.median(prices);
  const best=ranked[0]?.raw||null; const currentSoldQuantity=n(best?.sold_quantity,-1);
  if(best?.id&&currentSoldQuantity>=0) store.recordMarketSnapshot(String(best.id),currentSoldQuantity,{sku:sp.sku,title:best.title||'',price:n(best.price)});
  const imported30=n(sp.sales_30d,-1); const hist=best?.id?store.getMarketHistory(String(best.id)):[]; const delta30=Opportunity.salesDelta(hist,30); const sales30=imported30>=0?imported30:delta30;
  let highlights=null,highlightPosition=null; if(categoryId){try{highlights=await ML.highlights(t,{site:SITE,categoryId});const ids=new Set(ranked.flatMap(x=>marketIds(x.raw)));const hit=(highlights?.content||[]).find(x=>ids.has(String(x.id)));if(hit)highlightPosition=n(hit.position)||null;}catch{}}
  let scenario=null,shippingComplete=false;
  if(marketPrice>0&&n(sp.cost)>0&&categoryId){
    try{
      const listingRaw=await ML.listingPrices(t,{site:SITE,price:marketPrice,listingType:'gold_special',categoryId,logisticType:settings.logisticType||'drop_off',shippingMode:settings.shippingMode||'me2'});
      let shippingRaw=null; const dims=CE.dimensionsParam(sp); const freeShipping=marketPrice>=n(settings.freeShippingThreshold,79);
      if(dims){try{shippingRaw=await ML.shippingOptions(t,{userId:user.id,dimensions:dims,itemPrice:marketPrice,listingType:'gold_special',mode:settings.shippingMode||'me2',condition:'new',logisticType:settings.logisticType||'drop_off',freeShipping,categoryId,zipCode:settings.originZipCode||undefined});shippingComplete=true;}catch{}}
      scenario=CE.scenario({price:marketPrice,listingType:'gold_special',listingRaw,shippingRaw,cost:sp.cost,taxRate:settings.taxRate,adsRate:settings.adsRate,freeShipping});
    }catch{}
  }
  const result={sku:sp.sku,product:sp.product,cost:n(sp.cost),categoryId,domainId,marketPrice:Number(marketPrice.toFixed(2)),matchScore:ranked[0]?.matchScore||0,marketItemId:best?.id||null,marketTitle:best?.title||'',currentSoldQuantity:currentSoldQuantity>=0?currentSoldQuantity:null,sales30:sales30==null?null:sales30,curve:sales30==null?null:Opportunity.curve(sales30),curveSource:imported30>=0?'fornecedor/importado':(delta30!=null?'snapshot-30d':'aguardando-historico'),highlightPosition, demandSignal:Opportunity.demandLabel({highlightPosition,currentSoldQuantity:currentSoldQuantity>=0?currentSoldQuantity:null,sales30}),estimatedProfit:scenario?.profit||0,estimatedMargin:scenario?.margin||0,shippingComplete,competitors:ranked.slice(0,5).map(x=>({id:x.raw.id,title:x.raw.title,price:n(x.raw.price),sold_quantity:x.raw.sold_quantity??null,match:Number(x.matchScore.toFixed(2))}))};
  result.score=Opportunity.score({...result});
  result.status=result.score>=65?'ALTA OPORTUNIDADE':result.score>=45?'OPORTUNIDADE':'MONITORAR';
  return result;
}
async function buildKitSuggestions(limit=12){
  const t=await token(), settings=store.getSettings(), user=await ML.me(t); const scan=store.getOpportunityScan();
  const oppBySku=new Map((scan.results||[]).map(x=>[String(x.sku),x]));
  const catalog=store.getSupplierCatalog(); const workBySku=new Map(store.getProducts().map(p=>[String(p.sku),p])); const enriched=(catalog.products||[]).map(p=>({...p,...(workBySku.get(String(p.sku))||{}),marketOpportunity:oppBySku.get(String(p.sku))||null}));
  const candidates=KitEngine.candidatePairs(enriched,Math.min(40,limit*4)); const out=[];
  for(const c of candidates.slice(0,limit)){
    try{
      const sr=await ML.searchItems(t,{site:SITE,q:c.query,limit:20}); const prices=(sr.results||[]).map(x=>n(x.price)).filter(x=>x>0); const marketKitPrice=Opportunity.median(prices)||Number((c.basePrice*.95).toFixed(2));
      const mainOpp=oppBySku.get(String(c.components[0].sku)); const categoryId=mainOpp?.categoryId||c.components[0].category_id||'';
      let scenario=null,shippingVerified=false; if(categoryId&&marketKitPrice){const dims=c.dimensions?CE.dimensionsParam(c.dimensions):'';const freeShipping=marketKitPrice>=n(settings.freeShippingThreshold,79);const scenarios=[];for(const listingType of ['gold_special','gold_pro']){try{const listingRaw=await ML.listingPrices(t,{site:SITE,price:marketKitPrice,listingType,categoryId,logisticType:settings.logisticType||'drop_off',shippingMode:settings.shippingMode||'me2'});let shippingRaw=null;if(dims)try{shippingRaw=await ML.shippingOptions(t,{userId:user.id,dimensions:dims,itemPrice:marketKitPrice,listingType,mode:settings.shippingMode||'me2',condition:'new',logisticType:settings.logisticType||'drop_off',freeShipping,categoryId,zipCode:settings.originZipCode||undefined});shippingVerified=true;}catch{}scenarios.push(CE.scenario({price:marketKitPrice,listingType,listingRaw,shippingRaw,cost:c.cost,taxRate:settings.taxRate,adsRate:settings.adsRate,freeShipping}));}catch{}}scenario=CE.pickBest(scenarios,n(settings.targetMargin,18));}
      const componentOpps=c.components.map(p=>oppBySku.get(String(p.sku))).filter(Boolean);const marketDataComplete=componentOpps.length===c.components.length;const individualProfit=componentOpps.reduce((sum,o)=>sum+n(o.estimatedProfit),0); const ev=KitEngine.evaluate({candidate:c,marketKitPrice,scenario,individualProfit,targetMargin:n(settings.targetMargin,18)});if(!marketDataComplete)ev.risk.push('Execute o Scanner de Mercado para todos os componentes');if(!shippingVerified)ev.risk.push('Frete do kit ainda não validado pela API');const viable=ev.viable&&marketDataComplete&&shippingVerified;
      out.push({id:c.id,bucket:c.bucket,components:c.components.map(p=>({sku:p.sku,product:p.product,cost:n(p.cost),user_product_id:p.user_product_id||null})),query:c.query,cost:c.cost,marketKitPrice,scenario:scenario?{price:scenario.price,profit:scenario.profit,margin:scenario.margin,shipping:scenario.shipping,fee:scenario.fee,listingType:scenario.listingType,name:scenario.name}:null,individualProfit,viable,gain:ev.gain,risk:[...new Set(ev.risk)],dimensions:c.dimensions,requiresEligibilityValidation:true});
    }catch(e){out.push({id:c.id,bucket:c.bucket,components:c.components.map(p=>({sku:p.sku,product:p.product})),viable:false,risk:[safeError(e)]});}
  }
  out.sort((a,b)=>Number(b.viable)-Number(a.viable)||n(b.gain)-n(a.gain)); await store.setKitSuggestions(out); return out;
}


function isoRange(days=30){
  const to=new Date(); const from=new Date(to.getTime()-Math.max(1,days)*86400000);
  return {from:from.toISOString(),to:to.toISOString(),days:Math.max(1,days)};
}
async function fetchOrdersRange(t,userId,{from,to,maxOrders=500}){
  const all=[]; let offset=0; const limit=50;
  while(all.length<maxOrders){
    const d=await ML.ordersSearch(t,{sellerId:userId,from,to,offset,limit});
    const rows=d?.results||[]; all.push(...rows); if(rows.length<limit||all.length>=n(d?.paging?.total,0))break; offset+=limit;
  }
  return all.slice(0,maxOrders);
}
async function mapShipmentMeta(t,orders){
  const orderShipments=new Map(), shipmentMeta=new Map(), errors=[];
  const work=async o=>{
    try{
      let sh=await ML.orderShipments(t,o.id); if(!Array.isArray(sh))sh=sh?[sh]:[];
      sh=sh.filter(x=>String(x.type||'forward')==='forward'); orderShipments.set(String(o.id),sh.map(x=>String(x.id)));
      for(const x of sh){const sid=String(x.id);if(!shipmentMeta.has(sid))shipmentMeta.set(sid,{...x,id:sid,costs:null});}
    }catch(e){errors.push({orderId:String(o.id),stage:'shipments',error:safeError(e)});orderShipments.set(String(o.id),[]);}
  };
  for(let i=0;i<orders.length;i+=5)await Promise.all(orders.slice(i,i+5).map(work));
  const metas=[...shipmentMeta.values()];
  for(let i=0;i<metas.length;i+=5)await Promise.all(metas.slice(i,i+5).map(async m=>{try{m.costs=await ML.shipmentCosts(t,m.id)}catch(e){errors.push({shipmentId:m.id,stage:'shipment-costs',error:safeError(e)})}}));
  return {orderShipments,shipmentMeta,errors};
}
function dailySeries(lines){
  const m=new Map(); for(const l of lines){const day=String(l.date||'').slice(0,10);if(!day)continue;const x=m.get(day)||{date:day,gross:0,net:0,receivable:0,units:0};x.gross+=n(l.gross);x.net+=n(l.netProfit);x.receivable+=n(l.mlReceivable);x.units+=n(l.quantity);m.set(day,x)}
  return [...m.values()].sort((a,b)=>a.date.localeCompare(b.date)).map(x=>({...x,gross:Accounting.money2(x.gross),net:Accounting.money2(x.net),receivable:Accounting.money2(x.receivable)}));
}
function adsMetricsForProduct(p){const row=(store.getAds().rows||[]).find(r=>String(r.productId||'')===String(p?.id||'')||String(r.itemId||'')===String(p?.ml_item_id||''));return row?.metrics||{}}
function enrichAccountingWithRealAds(summary){
  const rows=summary?.products||[];const adsState=store.getAds();const adsActualAvailable=Boolean(adsState?.lastScanAt);let totalActual=0,totalAdjusted=0;
  for(const x of rows){const p=store.getProducts().find(p=>String(p.sku||'')===String(x.sku||'')||String(p.ml_item_id||'')===String(x.itemId||''));const actual=Accounting.money2(Monitoring.metric(adsMetricsForProduct(p),'cost'));x.adsActual=adsActualAvailable?actual:null;x.netAfterAdsActual=adsActualAvailable?Accounting.money2(n(x.net)+n(x.ads)-actual):null;x.marginAfterAdsActual=adsActualAvailable&&n(x.gross)>0?Accounting.money2(x.netAfterAdsActual/n(x.gross)*100):null;if(adsActualAvailable){totalActual+=actual;totalAdjusted+=x.netAfterAdsActual;}}
  if(summary?.total){summary.total.adsActual=adsActualAvailable?Accounting.money2(totalActual):null;summary.total.netAfterAdsActual=adsActualAvailable?Accounting.money2(totalAdjusted):null;summary.total.marginAfterAdsActual=adsActualAvailable&&n(summary.total.gross)>0?Accounting.money2(totalAdjusted/n(summary.total.gross)*100):null;summary.total.adsActualAvailable=adsActualAvailable;summary.total.financialStatus=!summary.total.costDataComplete?'CUSTO_INCOMPLETO':adsActualAvailable?'CALCULADO_COM_ADS_REAL':'ADS_ESTIMADO';}
  return summary;
}
function currentPromotionInfo(promos=[],hours=24){
  const rows=Array.isArray(promos)?promos:[];
  // Mercado Livre: started/active = promoção efetivamente ativa; pending = programada, ainda não iniciada.
  const active=rows.filter(x=>['started','active'].includes(String(x.status||'').toLowerCase()));
  const scheduled=rows.filter(x=>String(x.status||'').toLowerCase()==='pending');
  const candidates=rows.filter(x=>String(x.status||'').toLowerCase()==='candidate');
  let soon=null;
  for(const x of active){const d=new Date(x.end_date||x.finish_date||x.date_to||0);if(!Number.isFinite(d.getTime()))continue;const h=(d-Date.now())/3600000;if(h>=0&&h<=hours&&(!soon||h<soon.hoursLeft))soon={hoursLeft:h,finishDate:d.toISOString(),type:x.type||x.promotion_type||'',name:x.name||''};}
  return {activeCount:active.length,scheduledCount:scheduled.length,candidateCount:candidates.length,noneActive:active.length===0,hasScheduled:scheduled.length>0,expiringSoon:Boolean(soon),...(soon||{})};
}
async function buildPostPublicationReceipt(product,{item=null,mode='live'}={}){
  const t=await token();const settings=store.getSettings();const current=item||product?.ml_item_id?await ML.itemDetails(t,(item?.id||product.ml_item_id)):{};let sale=null,promos=[],flexRaw=null,fee=0,shipping=0;
  try{if(current?.id)sale=await ML.salePrice(t,current.id)}catch(_){};try{if(current?.id)promos=await ML.promotionsForItem(t,current.id)||[]}catch(_){};try{if(current?.id)flexRaw=await ML.flexStatus(t,current.id)}catch(_){}
  const price=Monitoring.extractSalePrice(sale,current?.price||product?.priceRecommendation?.grossUploadPrice||product?.price);const listingType=current?.listing_type_id||product?.listing_type_id||product?.commercialAnalysis?.recommendedScenario?.listingType||'gold_special';
  try{const lr=await ML.listingPrices(t,{site:SITE,price,listingType,categoryId:current?.category_id||product.category_id,logisticType:current?.shipping?.logistic_type||settings.logisticType,shippingMode:current?.shipping?.mode||settings.shippingMode});fee=CE.feeFromListing(lr)}catch(_){fee=n(product?.commercialAnalysis?.recommendedScenario?.fee||product?.commercialAnalysis?.bestScenario?.fee)}
  try{const dims=CE.dimensionsParam(product);if(dims){const me=await ML.me(t);const sr=await ML.shippingOptions(t,{userId:me.id,itemId:current?.id,dimensions:dims,itemPrice:price,listingType,mode:current?.shipping?.mode||settings.shippingMode,condition:current?.condition||'new',logisticType:current?.shipping?.logistic_type||settings.logisticType,freeShipping:Boolean(current?.shipping?.free_shipping),categoryId:current?.category_id||product.category_id,zipCode:settings.originZipCode||undefined});shipping=CE.extractSellerShippingCost(sr)}}catch(_){shipping=n(product?.commercialAnalysis?.recommendedScenario?.shipping||product?.commercialAnalysis?.bestScenario?.shipping)}
  return Monitoring.buildReceipt({product,item:current||{},salePriceRaw:sale,promotions:promos,fee,shipping,flexRaw,adsMetrics:adsMetricsForProduct(product),settings,mode,source:'Mercado Livre API + WeDrop'});
}
async function syncAccounting(days=30){
  const t=await token(), user=await ML.me(t), range=isoRange(days), settings=store.getSettings();
  const orders=(await fetchOrdersRange(t,user.id,{from:range.from,to:range.to,maxOrders:500})).filter(o=>!['cancelled','invalid'].includes(String(o.status||'')));
  const {orderShipments,shipmentMeta,errors}=await mapShipmentMeta(t,orders);
  const grossByOrder=new Map(orders.map(o=>[String(o.id),Accounting.orderGross(o)]));
  const ordersByShipment=new Map();
  for(const [oid,sids] of orderShipments.entries())for(const sid of sids){const a=ordersByShipment.get(sid)||[];a.push(oid);ordersByShipment.set(sid,a)}
  const supplier=store.getSupplierCatalog(), workProducts=store.getProducts(), lines=[];
  for(const order of orders){
    const oid=String(order.id), items=order.order_items||[], og=Math.max(.01,Accounting.orderGross(order)); let orderShipping=0, firstShipment=null;
    for(const sid of orderShipments.get(oid)||[]){const meta=shipmentMeta.get(sid); if(!meta)continue; firstShipment ||= meta; const total=Accounting.shippingSellerCost(meta.costs); const peers=ordersByShipment.get(sid)||[oid]; const peerGross=peers.reduce((sum,x)=>sum+n(grossByOrder.get(x)),0)||og; orderShipping+=total*(og/peerGross);}
    const itemGross=items.map(oi=>n(oi.unit_price||oi.full_unit_price)*Math.max(1,n(oi.quantity,1))); const sumItem=itemGross.reduce((a,b)=>a+b,0)||og; const marketplaceFee=n(order.marketplace_fee,-1);
    items.forEach((oi,idx)=>{const share=orderShipping*(itemGross[idx]/sumItem);const feeAlloc=marketplaceFee>=0?marketplaceFee*(itemGross[idx]/sumItem):null;const line=Accounting.lineFromItem({order,oi,shipmentAlloc:share,feeAlloc,settings,supplierCatalog:supplier,workProducts,shipmentMeta:firstShipment||{}});const wp=workProducts.find(p=>String(p.sku||'')===String(line.sku||'')||String(p.ml_item_id||'')===String(line.itemId||''));const projected=wp?.commercialAnalysis?.recommendedScenario||wp?.commercialAnalysis?.bestScenario||null;line.diagnosis=Accounting.diagnose(line,projected);lines.push(line);});
  }
  let billing={available:false,error:null,periods:null};
  try{billing.periods=await ML.billingPeriods(t,{group:'ML',documentType:'BILL',limit:3});billing.available=true;}catch(e){billing.error=safeError(e);}
  const summary=enrichAccountingWithRealAds(Accounting.aggregate(lines,workProducts)); const data={lastSyncAt:new Date().toISOString(),range,orderCount:orders.length,lines,summary,daily:dailySeries(lines),billing,errors,adsSource:store.getAds().lastScanAt?'Product Ads API':'estimativa/configuração'}; await store.setAccounting(data); await store.addJob({id:id(),type:'accounting-sync',status:'sucesso',orders:orders.length,lines:lines.length,days:range.days,at:new Date().toISOString()}); return data;
}

const imageQueue=[]; let imageWorkerRunning=false;
function enqueueImages(productId,reason='manual'){
  if(!imageQueue.some(x=>x.productId===productId)) imageQueue.push({productId,reason,queuedAt:new Date().toISOString()});
  runImageWorker().catch(e=>console.error('Image worker',e));
}
async function runImageWorker(){
  if(imageWorkerRunning) return; imageWorkerRunning=true;
  try{
    while(imageQueue.length){
      const job=imageQueue.shift(); const p=store.getProducts().find(x=>x.id===job.productId); if(!p) continue;
      try{
        await store.updateProduct(p.id,{imageStudio:{...(p.imageStudio||{}),status:'generating',approvedCount:0,total:9,items:[],startedAt:new Date().toISOString()}});
        await store.addJob({id:id(),type:'ai-images',status:'iniciado',sku:p.sku,at:new Date().toISOString()});
        const items=await ImageStudio.generateSet(p, async progress=>{
          const current=store.getProducts().find(x=>x.id===p.id); const prev=current?.imageStudio?.items||[];
          if(progress.slot){ const next=prev.filter(x=>x.slot!==progress.slot).concat(progress).sort((a,b)=>a.slot-b.slot); const approvedCount=next.filter(x=>x.status==='approved').length; await store.updateProduct(p.id,{imageStudio:{...(current?.imageStudio||{}),status:'generating',approvedCount,total:9,items:next,updatedAt:new Date().toISOString()}}); }
        });
        const approvedCount=items.filter(x=>x.status==='approved').length; const status=approvedCount===9?'approved':'review';
        const current=store.getProducts().find(x=>x.id===p.id); const generated=items.filter(x=>x.path).map(x=>`${BASE}${x.path}`);
        const patch={imageStudio:{status,approvedCount,total:9,items,updatedAt:new Date().toISOString()},generatedImages:generated,status:status==='approved'?'fotos-prontas':current.status};
        const merged={...current,...patch}; patch.quality=quality(merged); await store.updateProduct(p.id,patch);
        await store.addJob({id:id(),type:'ai-images',status,statusDetail:`${approvedCount}/9 aprovadas`,sku:p.sku,at:new Date().toISOString()});
      }catch(e){ const current=store.getProducts().find(x=>x.id===p.id); await store.updateProduct(p.id,{imageStudio:{...(current?.imageStudio||{}),status:'error',error:safeError(e),updatedAt:new Date().toISOString()}}); await store.addJob({id:id(),type:'ai-images',status:'erro',sku:p.sku,error:safeError(e),at:new Date().toISOString()}); }
    }
  } finally { imageWorkerRunning=false; }
}

app.get('/health',async(req,res)=>{
  const db0=store.getDbState?.()||{};
  if(db0.configured&&db0.initialized&&db0.connected===false)await store.ensureConnected?.(0);
  const database=store.getDbState?.()||null;
  res.json({ok:true,version:'1.8.76',persistence:store.pool?'postgres':'local-file',database,databaseOperational:!database?.configured||Boolean(database?.initialized&&database?.connected!==false)});
});
app.get('/connect/mercadolivre',(req,res,next)=>{ if(!req.session?.operator?.id)return res.redirect('/?login=1'); if(!process.env.ML_CLIENT_ID||!process.env.ML_CLIENT_SECRET) return res.status(503).send('Configure ML_CLIENT_ID e ML_CLIENT_SECRET no Render.'); const state=crypto.randomBytes(24).toString('hex'); const p=ML.pkce(); req.session.mlOAuth={state,verifier:p.verifier,created:Date.now()}; req.session.save((err)=>{ if(err) return next(err); res.redirect(ML.authUrl({clientId:process.env.ML_CLIENT_ID,redirectUri:REDIRECT,state,challenge:p.challenge})); }); });
app.get('/auth/mercadolivre/callback',async(req,res)=>{ try{ const {code,state}=req.query; const o=req.session.mlOAuth; if(!o||!code||!state||state!==o.state) throw new Error('OAuth state inválido. Inicie novamente pelo Publisher.'); const data=await ML.exchangeCode({clientId:process.env.ML_CLIENT_ID,clientSecret:process.env.ML_CLIENT_SECRET,redirectUri:REDIRECT,code,verifier:o.verifier}); await store.setTokens(data); delete req.session.mlOAuth; res.redirect('/?connected=1'); }catch(e){res.status(500).send(`<h2>Falha ao conectar Mercado Livre</h2><pre>${safeError(e)}</pre><a href='/'>Voltar</a>`);} });
app.post('/webhooks/mercadolivre',(req,res)=>{ const notification={id:id(),topic:clean(req.body?.topic||req.body?._id||'unknown'),resource:clean(req.body?.resource||''),userId:req.body?.user_id||null,applicationId:req.body?.application_id||null,sent:new Date().toISOString(),payload:req.body}; store.addMonitoringNotification(notification).catch(()=>{});store.addJob({id:id(),type:'webhook',status:'recebido',payload:req.body,at:new Date().toISOString()}).catch(()=>{});res.sendStatus(200);setTimeout(()=>{if(store.getSettings().monitoringEnabled&&store.getTokens())runMonitoring({source:`webhook:${notification.topic}`,mode:'fast'}).catch(()=>{})},1500); });

app.get('/api/auth/status',(req,res)=>{
  const users=store.getUsers(); const op=req.session?.operator||null;
  res.json({authenticated:Boolean(op?.id),operator:op?{id:op.id,name:op.name,username:op.username,role:op.role,loginAt:op.loginAt,loginEventId:op.loginEventId}:null,setupRequired:users.length===0,setupCodeRequired:Boolean(process.env.APP_SETUP_CODE),mlConnected:Boolean(store.getTokens()),version:'1.8.76'});
});
app.post('/api/auth/setup',async(req,res)=>{
  try{
    if(store.getUsers().length)return res.status(409).json({error:'O primeiro operador já foi criado. Faça login.'});
    if(process.env.APP_SETUP_CODE&&String(req.body?.setupCode||'')!==String(process.env.APP_SETUP_CODE))return res.status(403).json({error:'Código de configuração inválido.'});
    const name=clean(req.body?.name),username=clean(req.body?.username).toLowerCase(),password=String(req.body?.password||'');
    if(name.length<2||username.length<3||password.length<8)return res.status(400).json({error:'Informe nome, usuário com 3+ caracteres e senha com pelo menos 8 caracteres.'});
    const user={id:id(),name,username,passwordHash:passwordHash(password),role:'admin',active:true,createdAt:new Date().toISOString(),source:'first-setup'};await store.addUser(user);
    const event={id:id(),userId:user.id,name:user.name,username:user.username,at:new Date().toISOString(),kind:'setup-login'};await store.recordLogin(event);
    req.session.operator={...publicOperator(user),loginAt:event.at,loginEventId:event.id};req.session.save(()=>{});
    res.json({ok:true,operator:req.session.operator,firstAccess:true});
  }catch(e){res.status(500).json({error:safeError(e)})}
});
app.post('/api/auth/login',async(req,res)=>{
  try{
    const username=clean(req.body?.username).toLowerCase(),password=String(req.body?.password||'');
    const user=store.getUsers().find(x=>x.active!==false&&String(x.username||'').toLowerCase()===username);
    if(!user||!passwordMatches(password,user.passwordHash))return res.status(401).json({error:'Usuário ou senha inválidos.'});
    const event={id:id(),userId:user.id,name:user.name,username:user.username,at:new Date().toISOString(),kind:'login'};await store.recordLogin(event);await store.updateUser(user.id,{lastLoginAt:event.at});
    req.session.operator={...publicOperator(user),loginAt:event.at,loginEventId:event.id};req.session.save(()=>{});
    res.json({ok:true,operator:req.session.operator,cycle:DailyOps.currentCycle(store.getSettings())});
  }catch(e){res.status(500).json({error:safeError(e)})}
});
app.post('/api/auth/logout',(req,res)=>{req.session.destroy(()=>res.json({ok:true}));});
app.use('/api',(req,res,next)=>{if(req.path.startsWith('/auth/'))return next();return requireOperator(req,res,next)});

app.get('/api/auth/users',requireAdmin,(req,res)=>{res.json({users:store.getUsers().map(u=>({...publicOperator(u),active:u.active!==false,createdAt:u.createdAt||null,lastLoginAt:u.lastLoginAt||null}))})});
app.post('/api/auth/users',requireAdmin,async(req,res)=>{try{const name=clean(req.body?.name),username=clean(req.body?.username).toLowerCase(),password=String(req.body?.password||'');if(name.length<2||username.length<3||password.length<8)return res.status(400).json({error:'Informe nome, usuário com 3+ caracteres e senha com pelo menos 8 caracteres.'});if(store.getUsers().some(u=>String(u.username||'').toLowerCase()===username))return res.status(409).json({error:'Esse usuário já existe.'});const user={id:id(),name,username,passwordHash:passwordHash(password),role:req.body?.role==='admin'?'admin':'operator',active:true,createdAt:new Date().toISOString(),createdBy:req.session.operator.id};await store.addUser(user);res.json({ok:true,user:{...publicOperator(user),active:true,createdAt:user.createdAt}})}catch(e){res.status(500).json({error:safeError(e)})}});
app.post('/api/auth/users/:id/toggle',requireAdmin,async(req,res)=>{try{const user=store.getUsers().find(u=>String(u.id)===String(req.params.id));if(!user)return res.status(404).json({error:'Operador não encontrado.'});if(String(user.id)===String(req.session.operator.id)&&user.active!==false)return res.status(400).json({error:'Você não pode desativar seu próprio acesso durante a sessão.'});const out=await store.updateUser(user.id,{active:user.active===false});res.json({ok:true,user:{...publicOperator(out),active:out.active!==false,createdAt:out.createdAt,lastLoginAt:out.lastLoginAt||null}})}catch(e){res.status(500).json({error:safeError(e)})}});




async function projectPromotion(product,promo,item,t){
  const settings=store.getSettings();
  const original=Promotion.originalPrice(promo,product,item);
  const promoPrice=Promotion.candidateBuyerPrice(promo,product,item,settings.promotionTargetDiscount);
  const discount=Promotion.discountPct(promo,product,item,promoPrice);
  const support=Promotion.supportAmount(promo,product,item);
  const type=promo.type||promo.promotion_type||'UNKNOWN';
  const status=String(promo.status||'').toLowerCase();
  const base={promoPrice,originalPrice:original,discountPct:discount,supportAmount:support,projectedProfit:null,projectedMargin:null,fee:null,shipping:null,eligible:false,recommendation:'REVISAR',reason:''};
  if(['started','active'].includes(status)) return {...base,recommendation:'ATIVA',reason:'Promoção ativa e confirmada no Mercado Livre.'};
  if(status==='pending') return {...base,recommendation:'PROGRAMADA',reason:'Adesão confirmada no Mercado Livre; campanha aguardando início.'};
  if(status!=='candidate') return {...base,recommendation:'MONITORAR',reason:`Status ${status||'não informado'}.`};
  const manualReason=Promotion.manualOnlyReason(type);
  if(!promoPrice){return {...base,recommendation:'REVISAR',reason:manualReason||'Mercado Livre não retornou preço promocional suficiente para projetar margem.'};}
  try{
    const listingType=item?.listing_type_id||product.commercialAnalysis?.recommendedScenario?.listingType||product.commercialAnalysis?.bestScenario?.listingType||'gold_special';
    const categoryId=item?.category_id||product.category_id;
    const listingRaw=await ML.listingPrices(t,{site:SITE,price:promoPrice,listingType,categoryId,logisticType:store.getSettings().logisticType,shippingMode:store.getSettings().shippingMode});
    let shippingRaw=null;
    const dims=CE.dimensionsParam(product), freeShipping=Boolean(item?.shipping?.free_shipping ?? promoPrice>=n(settings.freeShippingThreshold,79));
    if(freeShipping&&dims){try{const tk=store.getTokens();shippingRaw=await ML.shippingOptions(t,{userId:tk?.user_id,dimensions:dims,itemPrice:promoPrice,listingType,mode:settings.shippingMode,condition:item?.condition||'new',logisticType:settings.logisticType,freeShipping,categoryId,zipCode:settings.originZipCode||undefined});}catch(_){} }
    const sc=CE.scenario({price:promoPrice,listingType,listingRaw,shippingRaw,cost:n(product.cost),taxRate:n(settings.taxRate),adsRate:n(settings.adsRate),freeShipping});
    const projectedProfit=Math.round((sc.profit+support)*100)/100;
    const effectiveRevenue=Math.max(.01,promoPrice+support);
    const projectedMargin=Math.round((projectedProfit/effectiveRevenue*100)*100)/100;
    const minMargin=n(settings.promotionMinMargin,settings.targetMargin||18), maxDiscount=n(settings.promotionMaxDiscount,20);
    let recommendation='APTA',reason=`Margem projetada ${projectedMargin.toFixed(1)}% ≥ mínimo ${minMargin.toFixed(1)}%.`;
    if(projectedMargin<minMargin){recommendation='NÃO ENTRAR';reason=`Margem projetada ${projectedMargin.toFixed(1)}% abaixo do mínimo ${minMargin.toFixed(1)}%.`;}
    else if(discount>maxDiscount){recommendation='REVISAR';reason=`Desconto ${discount.toFixed(1)}% supera o limite automático ${maxDiscount.toFixed(1)}%.`;}
    else if(manualReason){recommendation='REVISAR';reason=manualReason;}
    const eligible=recommendation==='APTA'&&Promotion.safeAutoType(type);
    return {...base,promoPrice,discountPct:discount,supportAmount:support,projectedProfit,projectedMargin,fee:sc.fee,shipping:sc.shipping,eligible,recommendation,reason,listingType,freeShipping};
  }catch(e){return {...base,recommendation:'REVISAR',reason:`Falha ao simular custos: ${safeError(e)}`};}
}

async function applyPromotionRow(row,t){
  if(!row||row.status!=='candidate') throw new Error('A promoção não está mais como candidata. Atualize a varredura.');
  if(!row.eligible) throw new Error(row.reason||'Promoção não passou pela margem mínima.');
  if(!Promotion.safeAutoType(row.type)) throw new Error('Este tipo exige revisão manual antes da adesão.');
  const body=Promotion.applyBody(row);
  if(['SMART','PRICE_MATCHING'].includes(row.type)&&!body.offer_id) throw new Error('Campanha exige offer_id/candidate id e ele não foi retornado pela API.');
  if(!body.promotion_id && row.type!=='PRICE_DISCOUNT') throw new Error('Promotion ID não disponível. Atualize a varredura.');
  return ML.addPromotionItem(t,row.itemId,body);
}

function promotionMatchesRow(row,promo={}){
  const rowType=String(row?.type||'').toUpperCase(),promoType=String(promo?.type||promo?.promotion_type||'').toUpperCase();
  const rowId=String(row?.promotionId||row?.raw?.id||row?.raw?.promotion_id||''),promoId=String(promo?.id||promo?.promotion_id||'');
  if(rowId&&promoId)return rowId===promoId&&(!rowType||!promoType||rowType===promoType);
  return Boolean(rowType&&promoType&&rowType===promoType);
}
async function verifyAppliedPromotion(row,t,{attempts=3,delayMs=650}={}){
  let lastStatus='',lastPromo=null,lastError='';
  for(let attempt=1;attempt<=attempts;attempt++){
    try{
      const promos=await ML.promotionsForItem(t,row.itemId)||[];
      const matches=(Array.isArray(promos)?promos:[]).filter(p=>promotionMatchesRow(row,p));
      const promo=matches.find(p=>['started','active','pending'].includes(String(p.status||'').toLowerCase()))||matches[0]||null;
      if(promo){
        lastPromo=promo;lastStatus=String(promo.status||'').toLowerCase();row.raw=promo;row.status=lastStatus||row.status;row.lastVerifiedAt=new Date().toISOString();
        if(['started','active'].includes(lastStatus)){row.recommendation='ATIVA';row.reason='Aplicação confirmada: promoção ativa no Mercado Livre.';row.eligible=false;return {confirmed:true,state:'active',status:lastStatus,promo};}
        if(lastStatus==='pending'){row.recommendation='PROGRAMADA';row.reason='Aplicação confirmada: campanha programada no Mercado Livre e aguardando início.';row.eligible=false;return {confirmed:true,state:'scheduled',status:lastStatus,promo};}
      }
    }catch(e){lastError=safeError(e)}
    if(attempt<attempts)await new Promise(resolve=>setTimeout(resolve,delayMs));
  }
  row.status='sent';row.recommendation='ENVIADA';row.reason='Adesão enviada com sucesso. O Mercado Livre ainda está processando a confirmação; a próxima varredura atualizará o status.';row.eligible=false;row.lastVerifiedAt=new Date().toISOString();
  return {confirmed:false,state:'processing',status:lastStatus||'sent',promo:lastPromo,error:lastError||null};
}

async function scanPromotions({autoApply=false,itemId=null}={}){
  const t=await token(), me=await ML.me(t), settings=store.getSettings();
  const previousPromotions=store.getPromotions(), previousSelected=new Set((previousPromotions.rows||[]).filter(r=>r?.selected).map(r=>String(r.id))), previousRows=new Map((previousPromotions.rows||[]).map(r=>[String(r.id||''),r]));
  let campaigns=[]; try{const c=await ML.sellerPromotions(t,me.id);campaigns=c?.results||[];}catch(_){}
  const products=store.getProducts().filter(p=>p.ml_item_id&&(!itemId||p.ml_item_id===itemId));
  const rows=[],errors=[],applied=[];
  for(const p of products){
    try{
      const item=await ML.itemDetails(t,p.ml_item_id);
      let promos=[]; try{promos=await ML.promotionsForItem(t,p.ml_item_id)||[];}catch(e){errors.push({sku:p.sku,itemId:p.ml_item_id,error:safeError(e)});continue;}
      if(!Array.isArray(promos)||!promos.length){rows.push({id:`${p.ml_item_id}|NONE`,productId:p.id,itemId:p.ml_item_id,sku:p.sku,title:p.product||p.seoTitle,type:'NONE',typeLabel:'Sem promoção elegível',status:'none',recommendation:'AGUARDAR',reason:'Nenhuma promoção elegível retornada pelo Mercado Livre neste momento.',originalPrice:n(item.price||p.price),raw:{},selected:previousSelected.has(`${p.ml_item_id}|NONE`)});continue;}
      for(const promo of promos){
        const type=promo.type||promo.promotion_type||'UNKNOWN',promotionId=promo.id||promo.promotion_id||null;
        const projection=await projectPromotion(p,promo,item,t);
        const row={id:`${p.ml_item_id}|${type}|${promotionId||promo.ref_id||promo.name||promo.status}`,productId:p.id,itemId:p.ml_item_id,sku:p.sku,title:p.product||p.seoTitle,promotionId,type,typeLabel:Promotion.typeLabel(type),name:promo.name||campaigns.find(c=>c.id===promotionId)?.name||'',status:String(promo.status||'').toLowerCase(),startDate:promo.start_date||campaigns.find(c=>c.id===promotionId)?.start_date||null,finishDate:promo.end_date||promo.finish_date||campaigns.find(c=>c.id===promotionId)?.finish_date||null,raw:promo,...projection,selected:previousSelected.has(`${p.ml_item_id}|${type}|${promotionId||promo.ref_id||promo.name||promo.status}`)};
        const prev=previousRows.get(String(row.id));const prevTs=new Date(prev?.lastVerifiedAt||previousPromotions.lastApplyAt||0).getTime();
        if(row.status==='candidate'&&prev?.recommendation==='ENVIADA'&&Number.isFinite(prevTs)&&(Date.now()-prevTs)<10*60*1000){row.eligible=false;row.selected=false;row.recommendation='ENVIADA';row.reason='Adesão já enviada recentemente. Aguardando o Mercado Livre concluir a atualização para evitar envio duplicado.';row.lastVerifiedAt=prev.lastVerifiedAt||previousPromotions.lastApplyAt||new Date().toISOString();}
        rows.push(row);
        if(autoApply&&settings.autoPromotionsEnabled&&row.eligible){try{const out=await applyPromotionRow(row,t);const verification=await verifyAppliedPromotion(row,t);applied.push({rowId:row.id,itemId:row.itemId,type:row.type,out,verification});}catch(e){errors.push({sku:p.sku,itemId:p.ml_item_id,type,error:safeError(e)})}}
      }
    }catch(e){errors.push({sku:p.sku,itemId:p.ml_item_id,error:safeError(e)});}
  }
  const finalRows=itemId?[...(previousPromotions.rows||[]).filter(r=>String(r.itemId||'')!==String(itemId)),...rows]:rows;
  const data={...previousPromotions,lastScanAt:new Date().toISOString(),rows:finalRows,campaigns,selfCampaigns:previousPromotions.selfCampaigns||[],errors,applied};
  await store.setPromotions(data); return store.getPromotions();
}


function skuFromMlItem(item={}){
  const attrs=Array.isArray(item.attributes)?item.attributes:[];
  const a=attrs.find(x=>['SELLER_SKU','SKU'].includes(String(x?.id||'').toUpperCase()));
  return clean(item.seller_custom_field||item.seller_sku||a?.value_name||a?.value_id||'');
}
function userProductIdFromMlItem(item={}){
  const direct=clean(item.user_product_id||'');if(direct)return direct;
  const vars=Array.isArray(item.variations)?item.variations:[];
  const ids=[...new Set(vars.map(v=>clean(v?.user_product_id||'')).filter(Boolean))];
  return ids.length===1?ids[0]:'';
}
async function allSellerItemIds(t,userId,{tags=null,max=1000}={}){
  const ids=[];let offset=0,total=1;const page=100;
  while(ids.length<Math.min(5000,max)&&offset<total){
    const d=await ML.userItemsSearch(t,{userId,tags,limit:page,offset});
    const r=Array.isArray(d?.results)?d.results:[];ids.push(...r.map(String));total=Number(d?.paging?.total||ids.length);if(!r.length)break;offset+=r.length;if(r.length<page)break;
  }
  return [...new Set(ids)].slice(0,max);
}
async function bulkItemDetails(t,ids=[]){
  // A API /items/bulk aceita no máximo 20 IDs por chamada. Usar 50 fazia a chamada
  // falhar e acionava o fallback item-a-item, multiplicando o tempo da rotina.
  const out=[];for(let i=0;i<ids.length;i+=20){const part=ids.slice(i,i+20);try{const rows=await ML.itemsBulk(t,part);for(const x of rows||[]){const body=x?.body||x;if(body?.id)out.push(body)}}catch(_){for(const itemId of part){try{out.push(await ML.itemDetails(t,itemId))}catch(__){}}}}
  return out;
}
async function scanAccountInventory({t=null,me=null,max=1000}={}){
  t=t||await token();me=me||await ML.me(t);const ids=await allSellerItemIds(t,me.id,{max});const details=await bulkItemDetails(t,ids);const eligibleIds=await allSellerItemIds(t,me.id,{tags:'catalog_listing_eligible',max});const eligibleSet=new Set(eligibleIds);
  const rows=details.map(item=>({itemId:item.id,userProductId:userProductIdFromMlItem(item),sku:skuFromMlItem(item),title:item.title||'',status:item.status||'',subStatus:Array.isArray(item.sub_status)?item.sub_status:[],availableQuantity:n(item.available_quantity),price:n(item.price),listingType:item.listing_type_id||'',catalogListing:Boolean(item.catalog_listing),catalogEligible:eligibleSet.has(String(item.id))||Array.isArray(item.tags)&&item.tags.includes('catalog_listing_eligible'),catalogProductId:item.catalog_product_id||'',domainId:item.domain_id||'',permalink:item.permalink||'',itemRelations:Array.isArray(item.item_relations)?item.item_relations:[],catalogBoost:Array.isArray(item.tags)&&item.tags.includes('catalog_boost'),freeShipping:Boolean(item.shipping?.free_shipping),logisticType:item.shipping?.logistic_type||'',shippingMode:item.shipping?.mode||'',dateCreated:item.date_created||null,updatedAt:item.last_updated||null,stopTime:item.stop_time||null,tags:Array.isArray(item.tags)?item.tags:[]}));
  const byId=new Map(rows.map(x=>[String(x.itemId),x]));const eligible=eligibleIds.map(itemId=>byId.get(String(itemId))||{itemId:String(itemId),sku:'',title:'',status:'',catalogListing:false,catalogEligible:true,catalogEligibilityStatus:'READY_FOR_OPTIN'}).map(x=>({...x,catalogEligibilityStatus:x.catalogListing?'ALREADY_OPTED_IN':'READY_FOR_OPTIN'}));
  return {rows,eligible,scannedAt:new Date().toISOString(),sellerId:me.id};
}
function localDayKey(tz='America/Sao_Paulo',date=new Date()){
  try{const parts=new Intl.DateTimeFormat('en-CA',{timeZone:tz,year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(date);const m=Object.fromEntries(parts.map(x=>[x.type,x.value]));return `${m.year}-${m.month}-${m.day}`}catch(_){return date.toISOString().slice(0,10)}
}
function localMinuteOfDay(tz='America/Sao_Paulo',date=new Date()){
  try{const parts=new Intl.DateTimeFormat('en-GB',{timeZone:tz,hour:'2-digit',minute:'2-digit',hour12:false}).formatToParts(date);const m=Object.fromEntries(parts.map(x=>[x.type,x.value]));return Number(m.hour)*60+Number(m.minute)}catch(_){return date.getHours()*60+date.getMinutes()}
}
function timeToMinute(v='08:15'){const m=String(v||'08:15').match(/^(\d{1,2}):(\d{2})$/);return m?Math.max(0,Math.min(1439,Number(m[1])*60+Number(m[2]))):495}
function sellerListUrl(itemId='',sku=''){
  const q=clean(itemId||sku||'');if(!q)return 'https://www.mercadolivre.com.br/anuncios/lista';
  return `https://www.mercadolivre.com.br/anuncios/lista?filters=OMNI_ACTIVE%7COMNI_INACTIVE%7CCHANNEL_NO_PROXIMITY_AND_NO_MP_MERCHANTS&page=1&search=${encodeURIComponent(q)}&sort=DEFAULT`;
}
function sellerEditUrl(itemId='',userProductId=''){
  // V1.8.76: NÃO inventar URL /anuncios/MLBU.../modificar.
  // A Central OMNI adiciona segmentos opacos (bomni/variation/.../user_product_item_detail)
  // que não são derivados com segurança da API pública. O link correto deve nascer da própria Central.
  // Mantemos esta função por compatibilidade, mas ela só aceita uma URL completa já conhecida.
  const candidate=clean(userProductId);
  if(/^https:\/\/vendedores\.mercadolivre\.com\.br\/anuncios\//i.test(candidate))return candidate;
  return '';
}
function normalizeSignalText(v=''){return String(v??'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/\s+/g,' ').trim()}
function catalogProductVerificationPending(pending=[]){
  return (Array.isArray(pending)?pending:[]).some(issue=>{
    const text=normalizeSignalText([issue?.key,issue?.title,issue?.label,issue?.bucket,issue?.variable].filter(Boolean).join(' '));
    return /verifi\w* (?:o )?produto.*catalog/.test(text)||/produto.*catalog.*suger/.test(text)||/catalog.*product.*verif/.test(text);
  });
}
function auditLinks({itemId='',userProductId='',sku='',permalink='',context='' }={}){
  const item=clean(itemId),up=clean(userProductId),code=clean(sku),publicUrl=clean(permalink),listUrl=sellerListUrl(item,code),editUrl=sellerEditUrl(item,up);
  const resolveEditUrl=item?`/api/ml/open-edit?itemId=${encodeURIComponent(item)}`:'';
  return {publicUrl,editUrl,resolveEditUrl,listUrl,context:clean(context||'seller-center')};
}
async function recordOperationAudit(entry={}){
  const state=store.getMonitoring();const at=entry.at||new Date().toISOString();const row={id:entry.id||id(),category:entry.category||'monitor',action:entry.action||entry.type||'ACTION',sku:clean(entry.sku),itemId:clean(entry.itemId),title:clean(entry.title),status:entry.status||'info',confirmed:Boolean(entry.confirmed),source:entry.source||'system',message:clean(entry.message),reason:clean(entry.reason),before:entry.before||null,after:entry.after||null,verification:entry.verification||null,links:entry.links||auditLinks(entry),details:entry.details||null,at};
  const auditTrail=[row,...(state.auditTrail||[])].slice(0,500);await store.setMonitoring({...state,auditTrail});return row;
}
async function catalogRequirementForItem(t,item={}){
  const tags=(Array.isArray(item.tags)?item.tags:[]).map(String);
  const hard=tags.find(x=>['opt_obey','catalog_only_restricted','catalog_forewarning'].includes(x));
  if(hard)return {known:true,mandatory:true,reason:hard==='catalog_only_restricted'?'Categoria exclusiva de catálogo.':hard==='opt_obey'?'Mercado Livre marcou o item como catálogo obrigatório.':'O anúncio recebeu aviso prévio de obrigatoriedade de catálogo.',signal:hard};
  const productId=clean(item.catalogProductId||item.catalog_product_id||'');
  if(productId){
    try{
      const prod=await ML.productDetails(t,productId);const strategy=clean(prod?.listing_strategy||prod?.settings?.listing_strategy||'').toLowerCase();
      if(strategy==='catalog_required')return {known:true,mandatory:true,reason:'O produto associado possui listing_strategy=catalog_required.',signal:'catalog_required',productId};
      if(strategy)return {known:true,mandatory:false,reason:`Estratégia do produto: ${strategy}.`,signal:strategy,productId};
    }catch(e){return {known:false,mandatory:false,reason:`Não foi possível confirmar a estratégia do produto de catálogo: ${safeError(e)}`,signal:'product-check-failed',productId};}
  }
  return {known:false,mandatory:false,reason:'A API confirmou elegibilidade, mas não retornou evidência suficiente para classificar a participação como opcional com segurança.',signal:'unverified'};
}
let catalogGuardRunning=false;
async function runCatalogGuard({source='manual',autoApply=true,t=null,me=null,snapshot=null}={}){
  if(catalogGuardRunning)return store.getMonitoring().catalogGuard||{};
  catalogGuardRunning=true;
  try{
    const settings=store.getSettings();t=t||await token();me=me||await ML.me(t);snapshot=snapshot||await scanAccountInventory({t,me,max:1500});
    const rows=[...(snapshot.rows||[])],byId=new Map(rows.map(x=>[String(x.itemId),x]));const errors=[],actions=[],optionalEligible=[],mandatory=[],unknown=[],autoCatalog=[],productVerificationRequired=[],auditEntries=[],ignoredNoStock=[],ignoredInactive=[];
    const eligibleBase=snapshot.eligible||[];
    const enriched=[];
    for(let i=0;i<eligibleBase.length;i+=4){
      const part=eligibleBase.slice(i,i+4);
      const checked=await Promise.all(part.map(async base=>{
        const row=byId.get(String(base.itemId))||base;let eligibility=null;
        try{eligibility=await ML.catalogEligibility(t,row.itemId)}catch(e){errors.push({itemId:row.itemId,sku:row.sku,stage:'catalog-eligibility',error:safeError(e)})}
        const status=clean(eligibility?.status||row.catalogEligibilityStatus||'READY_FOROPTIN')||'READY_FOROPTIN';
        const req=await catalogRequirementForItem(t,row);
        return {...row,catalogEligibilityStatus:status,catalogEligibility:eligibility||null,catalogMandatory:req.mandatory,catalogRequirementKnown:req.known,catalogRequirementReason:req.reason,catalogRequirementSignal:req.signal};
      }));
      enriched.push(...checked);
    }
    for(const row of enriched){
      const st=clean(row.status).toLowerCase(),qty=n(row.availableQuantity);
      if(qty<=0){ignoredNoStock.push(row);continue;}
      if(st!=='active'){ignoredInactive.push(row);continue;}
      if(row.catalogMandatory)mandatory.push(row);
      else if(row.catalogRequirementKnown&&row.catalogEligibilityStatus==='READY_FOROPTIN'&&!row.catalogListing)optionalEligible.push(row);
      else unknown.push(row);
    }
    // V1.8.76: "Verificar produto" deixa de ser inferido por status/catalog_product_id.
    // Só entra na fila quando o /performance do próprio anúncio contém o objetivo explícito
    // de verificar o produto de catálogo. Assim anúncios inativos/sem estoque ficam fora.
    const monitorRowsByItem=new Map((store.getMonitoring().rows||[]).filter(x=>x?.itemId).map(x=>[String(x.itemId),x]));
    for(const row of enriched){
      const st=clean(row.status).toLowerCase(),hasStock=n(row.availableQuantity)>0;
      if(row.catalogListing||st!=='active'||!hasStock)continue;
      let perfRow=monitorRowsByItem.get(String(row.itemId))||null;
      let pending=Array.isArray(perfRow?.qualityPending)?perfRow.qualityPending:[];
      const perfAge=perfRow?.lastCheckedAt?Date.now()-new Date(perfRow.lastCheckedAt).getTime():Infinity;
      // O ciclo diário acabou de conferir qualidade; reutilize essa leitura. Fora desse cenário,
      // relê /performance para evitar tarefa falsa baseada em dado antigo.
      if(perfAge>15*60*1000||!Array.isArray(perfRow?.qualityPending)){
        try{
          const perf=Monitoring.performanceSummary(await ML.itemPerformance(t,row.itemId)||{});
          pending=perf.pending||[];
        }catch(e){errors.push({itemId:row.itemId,sku:row.sku,stage:'verify-product-performance',error:safeError(e)});continue;}
      }
      if(!catalogProductVerificationPending(pending))continue;
      productVerificationRequired.push({...row,verificationReason:'O objetivo oficial de qualidade do Mercado Livre mostra “Verificar produto”. Esta é a única condição que cria esta tarefa. Anúncios inativos ou sem estoque são ignorados.',verificationSource:'Mercado Livre /performance'});
    }
    // V1.8.76: a auditoria visível não é mais poluída por classificações passivas
    // (READY_FOROPTIN / catálogo obrigatório). Mostramos somente SKUs que realmente exigem
    // “Verificar produto” e ações remotas efetivamente executadas.
    for(const row of productVerificationRequired){
      auditEntries.push({id:id(),category:'catalog',action:'PRODUCT_VERIFICATION_REQUIRED',sku:row.sku,itemId:row.itemId,userProductId:row.userProductId,title:row.title,status:'manual_required',confirmed:false,source,message:'O Mercado Livre está exibindo o objetivo “Verificar produto” nesta SKU.',reason:'Esta é uma pendência real e acionável. A SKU está ativa e possui estoque.',before:{status:row.status,availableQuantity:row.availableQuantity,catalogListing:Boolean(row.catalogListing)},after:{action:'aguardando fluxo Verificar produto'},verification:{remoteConfirmed:true,manualActionRequired:true},links:auditLinks({...row,context:'product-verification'}),at:new Date().toISOString()});
    }
    const policy=clean(settings.catalogParticipationPolicy||'avoid_optional');
    const boosted=rows.filter(x=>x.catalogListing&&x.catalogBoost&&clean(x.status).toLowerCase()==='active');
    for(const cat of boosted){
      const relationIds=(cat.itemRelations||[]).map(r=>String(r?.id||r)).filter(Boolean);
      let traditional=relationIds.map(id=>byId.get(id)).find(x=>x&&!x.catalogListing&&clean(x.status).toLowerCase()==='active')||null;
      if(!traditional&&relationIds.length){for(const rid of relationIds){try{const raw=await ML.itemDetails(t,rid);if(raw&&!raw.catalog_listing&&clean(raw.status).toLowerCase()==='active'){traditional={itemId:raw.id,sku:skuFromMlItem(raw),title:raw.title||'',status:raw.status,catalogListing:false,catalogProductId:raw.catalog_product_id||'',domainId:raw.domain_id||'',tags:Array.isArray(raw.tags)?raw.tags:[]};break}}catch(e){errors.push({itemId:rid,stage:'catalog-relation',error:safeError(e)})}}}
      if(!traditional){autoCatalog.push({...cat,guardStatus:'review',guardReason:'Catálogo automático detectado, mas não há anúncio tradicional ativo confirmado para manter as vendas. Nenhuma ação remota foi feita.'});continue;}
      const req=await catalogRequirementForItem(t,traditional);
      if(req.mandatory){autoCatalog.push({...cat,guardStatus:'mandatory',guardReason:req.reason,traditionalItemId:traditional.itemId});continue;}
      if(!req.known){autoCatalog.push({...cat,guardStatus:'review',guardReason:req.reason,traditionalItemId:traditional.itemId});continue;}
      if(policy==='avoid_optional'&&settings.catalogAutoPauseBoostedOptional!==false&&autoApply){
        try{
          const beforeStatus=clean(cat.status||'active').toLowerCase();await ML.updateItem(t,cat.itemId,{status:'paused'});let verified=null,verifyError=null;
          try{verified=await ML.itemDetails(t,cat.itemId)}catch(ve){verifyError=safeError(ve)}
          const afterStatus=clean(verified?.status||'').toLowerCase();const confirmed=afterStatus==='paused';cat.status=confirmed?'paused':cat.status;
          const action={type:'PAUSE_OPTIONAL_CATALOG_BOOST',itemId:cat.itemId,sku:cat.sku||traditional.sku,traditionalItemId:traditional.itemId,status:confirmed?'success':'applied_unverified',confirmed,at:new Date().toISOString(),beforeStatus,afterStatus:afterStatus||'unknown',verifyError,links:auditLinks({...cat,context:'catalog-boost'})};actions.push(action);
          auditEntries.push({id:id(),category:'catalog',action:'PAUSE_OPTIONAL_CATALOG_BOOST',sku:cat.sku||traditional.sku,itemId:cat.itemId,title:cat.title,status:confirmed?'confirmed':'applied_unverified',confirmed,source,message:confirmed?'Catálogo opcional criado automaticamente foi pausado e confirmado no Mercado Livre.':'Comando de pausa enviado, mas a confirmação remota ainda não retornou status paused.',reason:'Política Rede Achados: evitar catálogo quando opcional e preservar o anúncio tradicional ativo.',before:{status:beforeStatus,catalogListing:true,catalogBoost:true},after:{status:afterStatus||'aguardando confirmação',traditionalItemId:traditional.itemId},verification:{remoteConfirmed:confirmed,error:verifyError},links:action.links,at:action.at});
          autoCatalog.push({...cat,guardStatus:confirmed?'paused':'applied_unverified',guardReason:confirmed?'Publicação de catálogo criada automaticamente foi pausada e confirmada; o anúncio tradicional ativo foi preservado.':'Pausa enviada ao Mercado Livre; aguardando confirmação remota.',traditionalItemId:traditional.itemId});
        }
        catch(e){const msg=safeError(e);errors.push({itemId:cat.itemId,stage:'pause-catalog-boost',error:msg});auditEntries.push({id:id(),category:'catalog',action:'PAUSE_OPTIONAL_CATALOG_BOOST',sku:cat.sku||traditional.sku,itemId:cat.itemId,title:cat.title,status:'failed',confirmed:false,source,message:'Falha ao pausar catálogo opcional.',reason:msg,before:{status:cat.status,catalogListing:true,catalogBoost:true},after:null,verification:{remoteConfirmed:false,error:msg},links:auditLinks({...cat,context:'catalog-boost'}),at:new Date().toISOString()});autoCatalog.push({...cat,guardStatus:'error',guardReason:`Não foi possível pausar a publicação de catálogo: ${msg}`,traditionalItemId:traditional.itemId});}
      }else {autoCatalog.push({...cat,guardStatus:'detected',guardReason:'Catálogo automático opcional detectado; automação de pausa está desativada.',traditionalItemId:traditional.itemId});auditEntries.push({id:id(),category:'catalog',action:'CATALOG_BOOST_DETECTED',sku:cat.sku||traditional.sku,itemId:cat.itemId,title:cat.title,status:'manual_required',confirmed:false,source,message:'Catálogo automático opcional detectado, mas a pausa automática está desativada.',before:{status:cat.status,catalogListing:true,catalogBoost:true},after:null,verification:{remoteConfirmed:true,manualActionRequired:true},links:auditLinks({...cat,context:'catalog-boost'}),at:new Date().toISOString()});}
    }
    const tz=settings.dailyTimezone||'America/Sao_Paulo';const guard={lastRunAt:new Date().toISOString(),lastDailyDate:localDayKey(tz),source,policy,enabled:settings.catalogAutoGuardEnabled!==false,autoPauseBoostedOptional:settings.catalogAutoPauseBoostedOptional!==false,optionalEligible,mandatory,unknown,autoCatalog,productVerificationRequired,actions,errors,ignoredNoStockCount:ignoredNoStock.length,ignoredInactiveCount:ignoredInactive.length,manualDeclineRequired:0,optionalProtected:optionalEligible.length,manualDeclineReason:'A fila operacional de catálogo contém somente anúncios ativos, com estoque e com o objetivo explícito “Verificar produto”. READY_FOROPTIN, catálogo obrigatório e anúncios sem estoque não viram tarefa.'};
    const current=store.getMonitoring();const runAudit={id:id(),category:'catalog',action:'CATALOG_GUARD_RUN',sku:'',itemId:'',title:'Busca por “Verificar produto”',status:errors.length?'partial':'confirmed',confirmed:errors.length===0,source,message:`${productVerificationRequired.length} SKU(s) com “Verificar produto” · ${ignoredNoStock.length} sem estoque ignorada(s) · ${ignoredInactive.length} inativa(s) ignorada(s) · ${actions.length} ação(ões) remota(s).`,reason:errors.length?`${errors.length} consulta(s) falharam e serão repetidas.`:'A fila foi reconstruída somente com pendências acionáveis.',before:null,after:{verifyProduct:productVerificationRequired.length,ignoredNoStock:ignoredNoStock.length,ignoredInactive:ignoredInactive.length,automaticActions:actions.length,errors:errors.length},verification:{remoteConfirmed:errors.length===0},links:{publicUrl:'',editUrl:'',resolveEditUrl:'',listUrl:'https://www.mercadolivre.com.br/anuncios/lista',context:'catalog-run'},at:new Date().toISOString()};const auditTrail=[runAudit,...auditEntries,...(current.auditTrail||[])].slice(0,500);await store.setMonitoring({...current,accountInventory:rows,catalogEligible:enriched,catalogGuard:guard,auditTrail,accountInventoryScannedAt:snapshot.scannedAt||current.accountInventoryScannedAt});await store.addJob({id:id(),type:'catalog-guard',status:errors.length?'parcial':'sucesso',source,verifyProduct:productVerificationRequired.length,ignoredNoStock:ignoredNoStock.length,ignoredInactive:ignoredInactive.length,actions:actions.length,at:new Date().toISOString()});
    return guard;
  } finally {catalogGuardRunning=false}
}
async function maybeRunCatalogGuard({source='timer'}={}){
  const settings=store.getSettings();if(settings.catalogAutoGuardEnabled===false||!store.getTokens())return null;
  const m=store.getMonitoring(),guard=m.catalogGuard||{},tz=settings.dailyTimezone||'America/Sao_Paulo',today=localDayKey(tz),nowMin=localMinuteOfDay(tz),dueMin=timeToMinute(settings.catalogDailyCheckTime||'08:15');
  if(guard.lastDailyDate===today||nowMin<dueMin)return guard;
  return runCatalogGuard({source:`${source}:daily-catalog`,autoApply:true});
}
async function opsContext({fresh=false}={}){
  let monitoring=store.getMonitoring();const age=monitoring.accountInventoryScannedAt?Date.now()-new Date(monitoring.accountInventoryScannedAt).getTime():Infinity;
  if(fresh||!Array.isArray(monitoring.accountInventory)||age>10*60*1000){try{const snap=await scanAccountInventory({max:1500});monitoring=await store.setMonitoring({...monitoring,accountInventory:snap.rows,catalogEligible:snap.eligible,accountInventoryScannedAt:snap.scannedAt});}catch(_){} }
  return {products:store.getProducts(),inventory:monitoring.accountInventory||[],catalogEligible:monitoring.catalogEligible||[],monitoring,accounting:store.getAccounting(),ads:store.getAds(),promotions:store.getPromotions(),receipts:store.getPublicationReceipts(),settings:store.getSettings()};
}

const monitorRunJobs=new Map();
function monitorJobPublic(job){if(!job)return null;const {result,...safe}=job;return safe}
function monitorJobUpdate(jobId,patch={}){const job=monitorRunJobs.get(jobId);if(!job)return null;Object.assign(job,patch,{updatedAt:new Date().toISOString(),lastHeartbeatAt:new Date().toISOString()});monitorRunJobs.set(jobId,job);return job}
function monitorPct(base,done,total,span){return Math.max(0,Math.min(100,Math.round(base+(total?done/total*span:span))))}
async function runMonitoringCore({source='manual',onProgress=null,concurrency=2,mode='full'}={}){
  const progress=(patch={})=>{try{onProgress&&onProgress({...patch,lastHeartbeatAt:new Date().toISOString()})}catch(_){}};
  const settings=store.getSettings(),previous=store.getMonitoring(),errors=[],rows=[],alerts=[];progress({phase:'connecting',stage:'Conectando ao Mercado Livre',message:'Validando sessão e preparando a varredura.',percent:1,completed:0,total:0,failed:0});
  const t=await token();const me=await ML.me(t);const visitDays=Math.max(1,n(settings.monitoringVisitWindowDays,7));const dormantDays=Math.max(7,n(settings.monitoringDormantDays,14));const cooldowns=previous.optimizationCooldowns||{};
  let accountInventory=previous.accountInventory||[],catalogEligible=previous.catalogEligible||[],accountInventoryScannedAt=previous.accountInventoryScannedAt||null;
  let newAccountItems=Array.isArray(previous.newAccountItems)?previous.newAccountItems:[];
  const previousInventoryIds=new Set((previous.accountInventory||[]).map(x=>String(x.itemId||'')).filter(Boolean));
  progress({phase:'inventory',stage:'Inventário da conta',message:'Lendo TODOS os anúncios diretamente da conta Mercado Livre — ativos, pausados e inativos.',percent:3});
  try{
    const snap=await scanAccountInventory({t,me,max:1500});accountInventory=snap.rows;catalogEligible=snap.eligible;accountInventoryScannedAt=snap.scannedAt;
    if(previousInventoryIds.size){
      const detected=accountInventory.filter(x=>x?.itemId&&!previousInventoryIds.has(String(x.itemId))).map(x=>({...x,detectedAt:new Date().toISOString(),source:'mercadolivre-account'}));
      if(detected.length){const m=new Map(newAccountItems.map(x=>[String(x.itemId),x]));for(const x of detected)m.set(String(x.itemId),x);newAccountItems=[...m.values()].slice(-100);}
    }
  }catch(e){errors.push({stage:'account-inventory',error:safeError(e)})}
  const localPublishedIds=new Set(store.getProducts().map(p=>String(p.ml_item_id||'')).filter(Boolean));
  const externalAccountItems=accountInventory.filter(x=>x?.itemId&&!localPublishedIds.has(String(x.itemId))).map(x=>({itemId:x.itemId,sku:x.sku||'',title:x.title||'',status:x.status||'',detectedAt:x.detectedAt||null}));
  // Modo rápido da Rotina do Dia: atualiza o inventário inteiro por endpoints da própria conta ML
  // e libera a interface. A planilha/catálogo local NÃO limita quais anúncios serão conferidos.
  if(mode==='fast'){
    const data={...previous,lastFastRunAt:new Date().toISOString(),lastFastSource:source,accountInventory,catalogEligible,accountInventoryScannedAt,newAccountItems,externalAccountItems,errors:[...(previous.errors||[]).filter(x=>x?.stage!=='account-inventory'),...errors]};
    await store.setMonitoring(data);
    progress({phase:'done',stage:'Inventário atualizado',message:`${accountInventory.length} anúncio(s) sincronizados via API em modo rápido.`,percent:100,completed:accountInventory.length,total:accountInventory.length,failed:errors.length});
    return store.getMonitoring();
  }
  progress({phase:'ads',stage:'Product Ads',message:'Atualizando campanhas e métricas de ADS.',percent:7});
  try{await scanAdsAutomation({autoApply:false,inventory:accountInventory})}catch(e){errors.push({stage:'ads',error:safeError(e)})}
  const adsRows=store.getAds().rows||[],accountRows=store.getAccounting().summary?.products||[];const published=store.getProducts().filter(p=>p.ml_item_id);
  const prevBySku=new Map((previous.rows||[]).map(x=>[String(x.sku||x.itemId),x]));let completed=0,failed=0;
  const total=published.length;
  progress({phase:'items',stage:'Anúncios publicados',message:total?`Preparando ${total} SKU(s) para análise.`:'Nenhuma SKU publicada no Publisher.',percent:10,completed,total,failed});
  async function processPublishedProduct(p,index){
    const sku=p.sku||p.ml_item_id;const currentBase=10;const span=78;
    const tick=(stage,message)=>progress({phase:'items',stage,sku,index:index+1,current:completed,total,failed,percent:monitorPct(currentBase,completed,total,span),message});
    try{
      tick('Dados do anúncio',`Consultando ${sku} no Mercado Livre.`);
      const item=await ML.itemDetails(t,p.ml_item_id);const to=new Date(),from=new Date(to.getTime()-visitDays*86400000);const dormFrom=new Date(to.getTime()-dormantDays*86400000);
      tick('Preço · promoção · Flex · qualidade',`Buscando dados comerciais e score oficial de ${sku}.`);
      const tasks=[
        ['sale',()=>ML.salePrice(t,p.ml_item_id)],['promos',()=>ML.promotionsForItem(t,p.ml_item_id)],['flex',()=>ML.flexStatus(t,p.ml_item_id)],['performance',()=>ML.itemPerformance(t,p.ml_item_id)],['visits',()=>ML.itemVisits(t,{itemId:p.ml_item_id,dateFrom:from.toISOString(),dateTo:to.toISOString()})]
      ];
      if(dormantDays!==visitDays)tasks.push(['dormant-visits',()=>ML.itemVisits(t,{itemId:p.ml_item_id,dateFrom:dormFrom.toISOString(),dateTo:to.toISOString()})]);
      const settled=await Promise.allSettled(tasks.map(([,fn])=>fn()));const vals={};
      settled.forEach((r,i)=>{const stage=tasks[i][0];if(r.status==='fulfilled')vals[stage]=r.value;else errors.push({sku:p.sku,stage,error:safeError(r.reason)})});
      const sale=vals.sale||null,promos=Array.isArray(vals.promos)?vals.promos:[],flexRaw=vals.flex||null,performanceRaw=vals.performance||null,visitsRaw=vals.visits||null,dormantVisitsRaw=dormantDays===visitDays?visitsRaw:(vals['dormant-visits']||null);
      const currentPrice=Monitoring.extractSalePrice(sale,item.price||p.price);const dims=CE.dimensionsParam(p);let shippingCost=n(p.commercialAnalysis?.recommendedScenario?.shipping||p.commercialAnalysis?.bestScenario?.shipping);
      if(dims){tick('Frete',`Recotando frete e margem de ${sku}.`);try{const shippingRaw=await ML.shippingOptions(t,{userId:me.id,itemId:p.ml_item_id,dimensions:dims,itemPrice:currentPrice,listingType:item.listing_type_id||p.listing_type_id||'gold_special',mode:item.shipping?.mode||settings.shippingMode,condition:item.condition||'new',logisticType:item.shipping?.logistic_type||settings.logisticType,freeShipping:Boolean(item.shipping?.free_shipping),categoryId:item.category_id||p.category_id,zipCode:settings.originZipCode||undefined});shippingCost=CE.extractSellerShippingCost(shippingRaw)}catch(e){errors.push({sku:p.sku,stage:'shipping-quote',error:safeError(e)})}}
      const adsRow=adsRows.find(r=>String(r.productId)===String(p.id)||String(r.itemId)===String(p.ml_item_id))||{};const ads=adsRow.metrics||{};const acc=accountRows.find(x=>String(x.sku||'')===String(p.sku||'')||String(x.itemId||'')===String(p.ml_item_id||''))||{};const prev=prevBySku.get(String(p.sku||p.ml_item_id));const promo=currentPromotionInfo(promos,n(settings.monitoringPromotionExpiryHours,24));
      const perf=Monitoring.performanceSummary(performanceRaw||{});const createdAt=item.date_created||p.published_at||null;const daysOnline=createdAt?Math.max(0,(Date.now()-new Date(createdAt).getTime())/86400000):0;
      const stockProduct=p;let stockSnap=null,stockError='';
      try{stockSnap=await remoteStockSnapshot(t,stockProduct,item,me,settings)}catch(e){stockError=safeError(e);errors.push({sku:p.sku,stage:'stock',error:stockError})}
      const effectiveAvailable=stockSnap?.marketRemote!=null?n(stockSnap.marketRemote):stockSnap?.remote!=null?n(stockSnap.remote):StockEngine.legacyRemoteQuantity(item);const waitingStock=Monitoring.isOutOfStock({status:item.status,subStatus:item.sub_status,availableQuantity:effectiveAvailable});
      const productReconcilePatch={};
      if(Number.isFinite(Number(effectiveAvailable))){
        const remoteQty=Math.max(0,Math.floor(n(effectiveAvailable,0)));
        Object.assign(productReconcilePatch,{stock:remoteQty,stock_quantity_known:true,stock_source:'mercadolivre_remote',stockAuthority:'mercadolivre',ml_available_quantity:remoteQty,ml_stock_source:stockSnap?.marketSource||stockSnap?.market?.source||stockSnap?.mode||'mercadolivre',ml_stock_checked_at:new Date().toISOString(),availability_status:remoteQty>0?'available':'unavailable',availability_raw:`Mercado Livre: ${remoteQty} unidade(s)`,publishedStockTarget:remoteQty});
      }
      const row={productId:p.id,sku:p.sku,itemId:p.ml_item_id,title:item.title||p.seoTitle||p.product,permalink:item.permalink||'',status:item.status||'',subStatus:Array.isArray(item.sub_status)?item.sub_status:[],availableQuantity:effectiveAvailable,stockSource:stockSnap?.marketSource||stockSnap?.market?.source||stockSnap?.mode||'mercadolivre',stockExpected:effectiveAvailable,stockMatches:true,stockError,stopTime:item.stop_time||null,createdAt,daysOnline,currentPrice,listingType:item.listing_type_id||p.listing_type_id,freeShipping:Boolean(item.shipping?.free_shipping),logisticType:item.shipping?.logistic_type||'',flex:Monitoring.isFlex(item,flexRaw),shippingCost:Accounting.money2(shippingCost),previousShippingCost:prev?.shippingCost??null,shippingChanged:Boolean(prev&&Math.abs(n(prev.shippingCost)-shippingCost)>.5),previousPrice:prev?.currentPrice??null,priceChanged:Boolean(prev&&Math.abs(n(prev.currentPrice)-currentPrice)>.01),visits:Monitoring.visitsTotal(visitsRaw),visitWindowDays:visitDays,dormantVisits:Monitoring.visitsTotal(dormantVisitsRaw),dormantWindowDays:dormantDays,salesUnits:n(acc.units),orders:n(acc.orders),promotion:promo,ads,adsMeta:{adGroupId:adsRow.adGroupId||null,campaignId:adsRow.campaignId||null,campaignName:adsRow.campaignName||'',campaignOwnedByPublisher:Boolean(adsRow.campaignOwnedByPublisher),status:clean(adsRow.adGroup?.status||''),planActive:adsRow.plan?.active!==false},qualityScore:perf.score,qualityLevel:perf.level,qualityPending:perf.pending,qualityCalculatedAt:perf.calculatedAt,qualitySource:perf.rawAvailable?'Mercado Livre /performance':'indisponível',waitingStock,cartAbandonmentAvailable:false,lastCheckedAt:new Date().toISOString()};
      const remoteState=publicationRemoteState(item);const remoteSubs=Array.isArray(item.sub_status)?item.sub_status:[];
      if(clean(p.ml_status)!==clean(item.status)||JSON.stringify(p.ml_sub_status||[])!==JSON.stringify(remoteSubs)||clean(p.ml_permalink)!==clean(item.permalink)||p.publicationState?.code!==remoteState.code){
        Object.assign(productReconcilePatch,{status:'publicado',ml_status:item.status||'',ml_sub_status:remoteSubs,ml_permalink:item.permalink||p.ml_permalink||'',publicationState:remoteState,lastPublicationReconcileAt:new Date().toISOString()});
      }
      if(Object.keys(productReconcilePatch).length)await store.updateProduct(p.id,productReconcilePatch).catch(()=>{});
      row.alerts=Monitoring.alertsForRow(row,settings).filter(a=>{const until=cooldowns[`${row.sku}:${a.type}`];return !until||new Date(until).getTime()<=Date.now()}).map(a=>a.type==='QUALIDADE_BAIXA'?{...a,qualityPlan:Monitoring.qualityRepairPlan(row,p,item)}:a);return row;
    }catch(e){failed++;const code=e.response?.status===404?'ITEM_NAO_ENCONTRADO':'MONITOR_ERROR';errors.push({sku:p.sku,stage:'item',error:safeError(e)});return {productId:p.id,sku:p.sku,itemId:p.ml_item_id,title:p.seoTitle||p.product,status:code,lastCheckedAt:new Date().toISOString(),alerts:[{id:`${p.sku}:${code}`,sku:p.sku,type:code,severity:'critical',title:code==='ITEM_NAO_ENCONTRADO'?'Anúncio não encontrado no Mercado Livre':'Falha ao monitorar anúncio',message:safeError(e),action:'REVISAR ANÚNCIO',createdAt:new Date().toISOString()}]};}
    finally{completed++;progress({phase:'items',stage:'SKU concluída',sku,current:completed,total,failed,percent:monitorPct(currentBase,completed,total,span),message:`${completed} de ${total} SKU(s) analisadas.`});}
  }
  const limit=Math.max(1,Math.min(4,Number(concurrency)||3));
  for(let i=0;i<published.length;i+=limit){const batch=published.slice(i,i+limit);const result=await Promise.all(batch.map((p,j)=>processPublishedProduct(p,i+j)));for(const row of result){alerts.push(...(row.alerts||[]));rows.push(row)}}
  progress({phase:'external',stage:'Anúncios externos',message:'Conferindo itens existentes na conta que não nasceram no Publisher.',percent:90,completed,total,failed});
  const localItemIds=new Set(published.map(p=>String(p.ml_item_id||'')).filter(Boolean));const prevInv=new Map((previous.accountInventory||[]).map(x=>[String(x.itemId),x]));const prevRowsByItem=new Map((previous.rows||[]).map(x=>[String(x.itemId||''),x]));const externalItems=accountInventory.filter(inv=>!localItemIds.has(String(inv.itemId)));
  let externalDone=0;async function processExternal(inv){const prev=prevInv.get(String(inv.itemId)),prevRow=prevRowsByItem.get(String(inv.itemId));let perf={score:prevRow?.qualityScore??null,level:prevRow?.qualityLevel||'',pending:prevRow?.qualityPending||[],calculatedAt:prevRow?.qualityCalculatedAt||null,rawAvailable:Number.isFinite(Number(prevRow?.qualityScore))};const age=prevRow?.lastCheckedAt?Date.now()-new Date(prevRow.lastCheckedAt).getTime():Infinity;if(age>6*60*60*1000||!perf.rawAvailable){try{perf=Monitoring.performanceSummary(await ML.itemPerformance(t,inv.itemId)||{})}catch(e){errors.push({sku:inv.sku||inv.itemId,stage:'external-performance',error:safeError(e)})}}const basic={productId:'',sku:inv.sku||inv.itemId,itemId:inv.itemId,title:inv.title,permalink:inv.permalink||'',status:inv.status,subStatus:Array.isArray(inv.subStatus)?inv.subStatus:[],availableQuantity:n(inv.availableQuantity),currentPrice:n(inv.price),previousPrice:prev?.price??null,priceChanged:Boolean(prev&&Math.abs(n(prev.price)-n(inv.price))>.01),shippingCost:0,previousShippingCost:null,shippingChanged:false,visits:0,visitWindowDays:visitDays,salesUnits:0,orders:0,promotion:{noneActive:false,activeCount:0},ads:{},flex:String(inv.logisticType||'').toLowerCase()==='self_service',catalogEligible:Boolean(inv.catalogEligible),catalogListing:Boolean(inv.catalogListing),externalAccountItem:true,qualityScore:perf.score,qualityLevel:perf.level,qualityPending:perf.pending,qualityCalculatedAt:perf.calculatedAt,qualitySource:perf.rawAvailable?'Mercado Livre /performance':'indisponível',lastCheckedAt:new Date().toISOString()};basic.waitingStock=Monitoring.isOutOfStock(basic);basic.inactiveReason=basic.waitingStock?'OUT_OF_STOCK':(String(basic.status||'').toLowerCase()!=='active'?'ACTION_REQUIRED':'');basic.alerts=Monitoring.alertsForRow(basic,settings).filter(a=>['ITEM_STATUS','PRECO_MUDOU','QUALIDADE_BAIXA'].includes(a.type)).map(a=>a.type==='QUALIDADE_BAIXA'?{...a,qualityPlan:Monitoring.qualityRepairPlan(basic,null,{sold_quantity:0})}:a);externalDone++;progress({phase:'external',stage:'Qualidade dos anúncios da conta',sku:basic.sku,percent:90+Math.round((externalItems.length?externalDone/externalItems.length:1)*5),message:`${externalDone} de ${externalItems.length} anúncio(s) externos conferidos.`,completed,total,failed});return basic}
  for(let i=0;i<externalItems.length;i+=4){const part=externalItems.slice(i,i+4);const result=await Promise.all(part.map(processExternal));for(const basic of result){alerts.push(...(basic.alerts||[]));rows.push(basic)}}
  progress({phase:'finalizing',stage:'Consolidando alertas',message:'Ordenando saúde, qualidade, ADS, promoções e pendências.',percent:96,completed,total,failed});
  const unique=[];const seen=new Set();for(const a of alerts){const k=String(a.id||`${a.sku}:${a.type}:${a.message}`);if(seen.has(k))continue;seen.add(k);unique.push(a)}
  const activeCooldowns=Object.fromEntries(Object.entries(cooldowns).filter(([,until])=>new Date(until).getTime()>Date.now()));const deepAt=new Date().toISOString();const data={lastRunAt:deepAt,lastDeepRunAt:deepAt,source,rows,alerts:unique.slice(0,300),notifications:previous.notifications||[],resolutions:previous.resolutions||[],optimizationCooldowns:activeCooldowns,errors,accountInventory,catalogEligible,accountInventoryScannedAt,newAccountItems,externalAccountItems,commercialAudit:previous.commercialAudit||null,cartAbandonmentAvailable:false,cartNote:'A API pública do Mercado Livre não expõe evento/contagem de carrinho abandonado por SKU. O Publisher usa visitas, vendas e métricas de ADS para detectar baixa conversão e recomendar ações.'};await store.setMonitoring(data);await store.addJob({id:id(),type:'monitoring',status:'sucesso',products:rows.length,alerts:unique.length,source,at:new Date().toISOString()});progress({phase:'done',stage:'Concluído',message:`${rows.length} anúncio(s) verificados · ${unique.length} alerta(s) · ${errors.length} falha(s) de consulta.`,percent:100,completed:total,total,failed});return store.getMonitoring();
}
let monitoringInFlight=null,monitoringFastInFlight=null;
async function runMonitoring(opts={}){
  const fast=opts.mode==='fast';
  // A rotina rápida nunca espera uma varredura profunda já em andamento: usa o último
  // estado conhecido e evita transformar uma consulta operacional em espera de minutos.
  if(fast&&monitoringInFlight){
    try{opts.onProgress&&opts.onProgress({phase:'shared',stage:'Monitor profundo já em execução',message:'Usando o snapshot atual enquanto o Monitor 24/7 continua em segundo plano.',percent:100,lastHeartbeatAt:new Date().toISOString()})}catch(_){}
    return store.getMonitoring();
  }
  if(fast&&monitoringFastInFlight)return monitoringFastInFlight;
  if(!fast&&monitoringInFlight){
    try{opts.onProgress&&opts.onProgress({phase:'shared',stage:'Monitor já em execução',message:'Reutilizando a varredura que já está em andamento para evitar carga duplicada.',percent:5,lastHeartbeatAt:new Date().toISOString()})}catch(_){}
    return monitoringInFlight;
  }
  const task=runMonitoringCore({...opts,concurrency:fast?1:Math.max(1,Math.min(2,Number(opts.concurrency)||2)),mode:fast?'fast':'full'});
  if(fast)monitoringFastInFlight=task;else monitoringInFlight=task;
  try{return await task}finally{if(fast&&monitoringFastInFlight===task)monitoringFastInFlight=null;if(!fast&&monitoringInFlight===task)monitoringInFlight=null}
}
app.get('/api/publication-receipts',(req,res)=>res.json({rows:store.getPublicationReceipts()}));
app.get('/api/monitoring',(req,res)=>res.json({...store.getMonitoring(),settings:{monitoringEnabled:Boolean(store.getSettings().monitoringEnabled),monitoringIntervalMinutes:n(store.getSettings().monitoringIntervalMinutes,15),monitoringVisitWindowDays:n(store.getSettings().monitoringVisitWindowDays,7),monitoringPromotionExpiryHours:n(store.getSettings().monitoringPromotionExpiryHours,24),monitoringMinVisits:n(store.getSettings().monitoringMinVisits,50),monitoringMinAdsClicks:n(store.getSettings().monitoringMinAdsClicks,20),monitoringDormantDays:n(store.getSettings().monitoringDormantDays,14),monitoringDormantMaxVisits:n(store.getSettings().monitoringDormantMaxVisits,3),monitoringQualityMinScore:n(store.getSettings().monitoringQualityMinScore,90),dailyQualityCriticalScore:n(store.getSettings().dailyQualityCriticalScore,80),dailyQualityReviewMaxScore:n(store.getSettings().dailyQualityReviewMaxScore,95),catalogAutoGuardEnabled:store.getSettings().catalogAutoGuardEnabled!==false,catalogDailyCheckTime:store.getSettings().catalogDailyCheckTime||'08:15',catalogAutoPauseBoostedOptional:store.getSettings().catalogAutoPauseBoostedOptional!==false},runtime:{alwaysOnRequired:true,note:'Para varredura contínua por timer, o Web Service precisa permanecer ativo. Instâncias gratuitas do Render podem entrar em sleep; webhooks continuam sendo a fonte em tempo real quando o serviço recebe as notificações.'}}));
app.get('/api/monitoring/audit',(req,res)=>{const limit=Math.max(1,Math.min(500,n(req.query.limit,200)));res.json({rows:(store.getMonitoring().auditTrail||[]).slice(0,limit),count:(store.getMonitoring().auditTrail||[]).length});});
app.post('/api/monitoring/run',async(req,res)=>{try{res.json(await runMonitoring({source:'manual'}))}catch(e){res.status(e.status||500).json({error:safeError(e),details:e.response?.data})}});
app.post('/api/monitoring/run/start',(req,res)=>{
  const active=[...monitorRunJobs.values()].find(j=>j.status==='running');if(active)return res.json({ok:true,reused:true,job:monitorJobPublic(active)});
  const jobId=`monitor-${id()}`;const job={id:jobId,status:'running',phase:'queued',stage:'Preparando',message:'Iniciando análise dos anúncios.',percent:0,completed:0,total:0,failed:0,sku:null,startedAt:new Date().toISOString(),updatedAt:new Date().toISOString(),lastHeartbeatAt:new Date().toISOString()};monitorRunJobs.set(jobId,job);
  setImmediate(async()=>{try{await runMonitoring({source:'manual-progress',concurrency:3,onProgress:p=>monitorJobUpdate(jobId,p)});monitorJobUpdate(jobId,{status:'done',percent:100,phase:'done',stage:'Concluído',message:'Análise concluída. Atualizando a tela.'});}catch(e){monitorJobUpdate(jobId,{status:'error',phase:'error',stage:'Erro na análise',message:safeError(e),error:safeError(e)});}finally{setTimeout(()=>monitorRunJobs.delete(jobId),20*60*1000).unref?.();}});
  res.json({ok:true,reused:false,job:monitorJobPublic(job)});
});
app.get('/api/monitoring/run/:jobId',(req,res)=>{const job=monitorRunJobs.get(String(req.params.jobId||''));if(!job)return res.status(404).json({error:'Execução do monitor não encontrada ou já expirada.'});res.json(monitorJobPublic(job));});
app.post('/api/monitoring/settings',async(req,res)=>{const current=store.getSettings();const checkTime=/^([01]?\d|2[0-3]):[0-5]\d$/.test(String(req.body?.catalogDailyCheckTime||''))?String(req.body.catalogDailyCheckTime).padStart(5,'0'):(current.catalogDailyCheckTime||'08:15');const s=await store.setSettings({monitoringEnabled:Boolean(req.body?.monitoringEnabled),monitoringIntervalMinutes:Math.max(5,Math.min(360,n(req.body?.monitoringIntervalMinutes,15))),monitoringVisitWindowDays:Math.max(1,Math.min(90,n(req.body?.monitoringVisitWindowDays,7))),monitoringPromotionExpiryHours:Math.max(1,Math.min(168,n(req.body?.monitoringPromotionExpiryHours,24))),monitoringMinVisits:Math.max(10,n(req.body?.monitoringMinVisits,50)),monitoringMinAdsClicks:Math.max(5,n(req.body?.monitoringMinAdsClicks,20)),monitoringDormantDays:Math.max(7,Math.min(90,n(req.body?.monitoringDormantDays,14))),monitoringDormantMaxVisits:Math.max(0,Math.min(100,n(req.body?.monitoringDormantMaxVisits,3))),monitoringQualityMinScore:Math.max(50,Math.min(100,n(req.body?.monitoringQualityMinScore,90))),catalogAutoGuardEnabled:req.body?.catalogAutoGuardEnabled!==undefined?Boolean(req.body.catalogAutoGuardEnabled):current.catalogAutoGuardEnabled!==false,catalogDailyCheckTime:checkTime,catalogAutoPauseBoostedOptional:req.body?.catalogAutoPauseBoostedOptional!==undefined?Boolean(req.body.catalogAutoPauseBoostedOptional):current.catalogAutoPauseBoostedOptional!==false});res.json(s)});


function monitorAlertContext(alertId){
  const state=store.getMonitoring();const a=(state.alerts||[]).find(x=>String(x.id)===String(alertId));if(!a)return {state,alert:null,row:null,product:null};
  const row=(state.rows||[]).find(x=>String(x.sku||'')===String(a.sku||'')||(a.itemId&&String(x.itemId||'')===String(a.itemId)))||null;
  const product=row?.productId?findProductRef(row.productId,a.sku):findProductRef(a.sku,a.sku);
  return {state,alert:a,row,product};
}
function monitoringRouteFor(type,product,row){
  if(['QUALIDADE_BAIXA'].includes(type))return {view:product?'products':'monitor',productId:product?.id||'',sku:row?.sku||'',label:product?'Completar qualidade oficial da publicação':'Corrigir qualidade da SKU antiga com WeDrop + Mercado Livre'};
  if(['ANUNCIO_PARADO'].includes(type))return {view:'commercial',productId:product?.id||'',sku:row?.sku||'',label:'Otimizar anúncio parado'};
  if(['CTR_BAIXO'].includes(type))return {view:'images',productId:product?.id||'',sku:row?.sku||'',label:'Revisar capa/foto principal e título'};
  if(['CVR_BAIXO','CONVERSAO_BAIXA','FRETE_MUDOU','PRECO_MUDOU'].includes(type))return {view:'commercial',productId:product?.id||'',sku:row?.sku||'',label:'Revisar preço, frete e margem'};
  if(['SEM_PROMOCAO','PROMO_TERMINANDO'].includes(type))return {view:'promos',productId:product?.id||'',sku:row?.sku||'',label:'Revisar/aderir promoção segura'};
  if(['ADS_SEM_VENDA','ROAS_BAIXO'].includes(type))return {view:'ads',productId:product?.id||'',sku:row?.sku||'',label:'Revisar Product Ads'};
  return {view:product?'products':'monitor',productId:product?.id||'',sku:row?.sku||'',label:'Revisar anúncio'};
}
async function recordMonitorResolution(entry){
  const state=store.getMonitoring();const resolutions=[entry,...(state.resolutions||[])].slice(0,250);const audit={id:id(),category:'monitor',action:entry.type,sku:entry.sku,itemId:entry.itemId,title:entry.title||'',status:entry.resolved?'confirmed':entry.status||'review',confirmed:Boolean(entry.resolved),source:'monitor-auto-fix',message:entry.message,reason:entry.details?.requiresManual?'Alteração automática segura não disponível; seguir orientação guiada.':'',before:entry.before||null,after:entry.after||null,verification:entry.verification||{remoteConfirmed:Boolean(entry.resolved),observationHours:entry.details?.observationHours||0,observationMinutes:entry.details?.observationMinutes||0},links:entry.links||auditLinks({itemId:entry.itemId,sku:entry.sku,permalink:entry.permalink||'',context:entry.type==='QUALIDADE_BAIXA'?'quality':'monitor-fix'}),details:entry.details||null,at:entry.at};const auditTrail=[audit,...(state.auditTrail||[])].slice(0,500);await store.setMonitoring({...state,resolutions,auditTrail});
  await store.addJob({id:id(),type:'monitor-auto-fix',status:entry.resolved?'resolvido':entry.status||'revisar',sku:entry.sku,action:entry.type,detail:entry.message,at:entry.at});
}

function normalizeQualityName(v){return clean(v).normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^a-z0-9]+/g,' ').trim()}
function mlAttributeValue(item,id){
  const a=(Array.isArray(item?.attributes)?item.attributes:[]).find(x=>String(x?.id||'').toUpperCase()===String(id||'').toUpperCase());
  return clean(a?.value_name||a?.value_struct?.number||a?.values?.[0]?.name||'');
}
function legacyQualityBase(row,item){
  const supplier=store.findSupplierSku(row?.sku);
  const base0=initializeProductShape({
    sku:row?.sku||item?.seller_sku||item?.id||'',
    product:item?.title||row?.title||supplier?.product||'',
    category_id:item?.category_id||supplier?.category_id||'',
    gtin:mlAttributeValue(item,'GTIN')||supplier?.gtin||'',
    brand:mlAttributeValue(item,'BRAND')||supplier?.brand||'',
    model:mlAttributeValue(item,'MODEL')||supplier?.model||'',
    color:mlAttributeValue(item,'COLOR')||supplier?.color||'',
    material:mlAttributeValue(item,'MATERIAL')||supplier?.material||'',
    stock:Math.max(0,n(row?.availableQuantity,0)),
    images:(item?.pictures||[]).map(x=>clean(x?.secure_url||x?.url)).filter(Boolean),
    supplierAttributes:supplier?.supplierAttributes||{}
  },'legacy-quality');
  const base=supplier?initializeProductShape(SupplierCatalog.mergeIntoProduct(base0,supplier),'legacy-quality-wedrop'):base0;
  return {base,supplier};
}
async function qualityAttributeRepair(t,row,item,product=null,{evidenceValues={}}={}){
  const external=!product;
  const legacy=external?legacyQualityBase(row,item):null;
  const supplier=legacy?.supplier||store.findSupplierSku(row?.sku);
  let base=external?legacy.base:{...product,sku:product?.sku||row?.sku||'',category_id:item?.category_id||product?.category_id||''};
  if(supplier){
    // V1.8.76: a ficha atual da WeDrop é a fonte factual prioritária para medidas, peso, EAN,
    // marca, modelo e demais dados do fornecedor. Não reutilizar um snapshot antigo da SKU.
    base=initializeProductShape(SupplierCatalog.refreshFromSupplier(base,supplier),external?'legacy-quality-wedrop':'quality-wedrop');
    if(product?.id){
      const factual=['product','cost','gtin','brand','model','color','material','dimensions','height_cm','width_cm','length_cm','diameter_cm','weight_g','packaging_image_url','features','package_content','video_url','supplier_category','supplierAttributes','catalogMatch'];
      const factualPatch={};for(const k of factual)if(base[k]!==undefined)factualPatch[k]=base[k];
      await store.updateProduct(product.id,factualPatch).catch(()=>{});
    }
  }
  let research={patch:{},technicalAttributeValues:{},status:'not_run',evidence:null};
  try{research=await researchMissingProductData(base,t)}catch(e){research={patch:{},technicalAttributeValues:{},status:'error',evidence:null,error:safeError(e)}}
  const merged={...base,...(research.patch||{})};
  let catalogValues={};
  if(item?.catalog_product_id){try{catalogValues=Research.attributeValueMap(await ML.productDetails(t,item.catalog_product_id))}catch(_){} }
  const schemaInfo=await qualityTechnicalSchema(t,item);
  const schema=schemaInfo.schema||[];let catalogQuality=null;try{catalogQuality=await ML.catalogQualityStatus(t,row.itemId)}catch(_){}
  if(!schema.length)return {changed:false,manual:true,reason:'O Mercado Livre não retornou a ficha técnica desta categoria para validação.',supplierFound:Boolean(supplier),researchStatus:research.status,attributeVerification:{complete:false,missing:catalogQualityMissing(catalogQuality||{},[]),schemaUnavailable:true,catalogQuality}};
  const targetMissing=qualityMissingAttributes(schema,item,catalogQuality),targetIds=new Set(targetMissing.map(x=>String(x.id)));
  const evidenceIds=new Set(Object.keys(evidenceValues||{}).map(String));
  let perfBefore=null;try{perfBefore=Monitoring.performanceSummary(await ML.itemPerformance(t,row.itemId,{fresh:true})||{})}catch(_){perfBefore=null}
  const genericAttributesPendingBefore=(Array.isArray(perfBefore?.pending)?perfBefore.pending:[]).some(x=>Monitoring.qualityIssueKind(x)==='attributes');
  const existing=itemAttributeMap(item),candidates=new Map(),sources=new Map();
  const add=(id,value,source,desc=null)=>{id=String(id||'');value=clean(value);if(!id||!value||candidates.has(id))return;const qualityFlagged=targetIds.has(id),operatorEvidence=evidenceIds.has(id);if(clean(existing.get(id))&&!qualityFlagged&&!operatorEvidence)return;const d=desc||schema.find(x=>String(x.id)===id);const payload=attributePayloadForDescriptor(d||{id},value);if(!payload)return;candidates.set(id,payload);sources.set(id,source)};
  for(const a of schema){
    const id=String(a.id||'');if(!id)continue;const qualityFlagged=targetIds.has(id),operatorEvidence=evidenceIds.has(id),currentValue=clean(existing.get(id));if(currentValue&&!qualityFlagged&&!operatorEvidence)continue;
    const inferred=inferAttributeValue(a,merged);
    // Se o ML disser apenas "CARACTERÍSTICAS" sem revelar o atributo, preencher automaticamente
    // os fatos de alta confiança que já existem no catálogo WeDrop (ex.: Altura/Largura/Comprimento).
    // Campos semanticamente diferentes como MAX_WEIGHT_SUPPORTED não passam por esta regra.
    const supplierHighConfidence=Boolean(genericAttributesPendingBefore&&inferred?.confidence==='high'&&String(inferred?.source||'').startsWith('WeDrop'));
    if(!a.required&&!qualityFlagged&&!operatorEvidence&&!supplierHighConfidence)continue;
    // Evidência enviada pelo operador tem prioridade quando o ML marcou o atributo como
    // ausente/baixa qualidade OU quando /performance mantém CARACTERÍSTICAS pendente
    // sem revelar o ID exato e o operador fornece o dado em um print/texto.
    const evidence=evidenceValues?.[id];if(clean(evidence?.value||evidence))add(id,evidence?.value||evidence,evidence?.source||'Print enviado pelo operador',a);
    if(candidates.has(id))continue;
    if(inferred)add(id,inferred.value,inferred.source,a);
    if(candidates.has(id))continue;
    if(clean(catalogValues[id]))add(id,catalogValues[id],'Mercado Livre · produto de catálogo vinculado',a);
    if(candidates.has(id))continue;
    if(clean(research.technicalAttributeValues?.[id])&&(research.evidence?.score||0)>=95)add(id,research.technicalAttributeValues[id],'Mercado Livre · produto idêntico confirmado',a);
    if(candidates.has(id))continue;
    const fixed=normalizeAttrTags(a.tags).fixed&&Array.isArray(a.values)&&a.values.length===1?a.values[0]:null;if(fixed?.name)add(id,fixed.name,'Mercado Livre · valor fixo da categoria',a);
  }
  const attrs=[...candidates.values()].slice(0,60);let updateError='';
  if(attrs.length){try{await ML.updateItem(t,row.itemId,{attributes:attrs})}catch(e){updateError=safeError(e)}}
  let after=item;try{after=await ML.itemDetails(t,row.itemId)}catch(_){ }
  const afterSchema=await qualityTechnicalSchema(t,after).catch(()=>schemaInfo);let catalogQualityAfter=null;try{catalogQualityAfter=await ML.catalogQualityStatus(t,row.itemId,{fresh:true})}catch(_){catalogQualityAfter=catalogQuality}
  const missing=qualityMissingAttributes(afterSchema.schema||schema,after,catalogQualityAfter);
  const incompleteTag=(Array.isArray(after?.tags)?after.tags:[]).includes('incomplete_technical_specs');
  let perf=null;try{perf=Monitoring.performanceSummary(await ML.itemPerformance(t,row.itemId,{fresh:true})||{})}catch(_){perf=null}
  const scoreAfter=Number.isFinite(Number(perf?.score))?Number(perf.score):null;
  const pendingNow=Array.isArray(perf?.pending)?perf.pending:[];
  const attributePending=pendingNow.filter(x=>Monitoring.qualityIssueKind(x)==='attributes');
  const performanceStillNeedsAttributes=attributePending.length>0;
  // V1.8.76: mesmo quando /performance retorna somente a palavra genérica CARACTERÍSTICAS,
  // o Publisher monta os campos editáveis da categoria e os entrega na própria tela para o operador.
  // Primeiro tentamos achar o atributo exato dentro do payload de /performance; se ele não vier,
  // priorizamos campos obrigatórios/condicionais ainda em branco e, por último, os candidatos de maior relevância.
  const manualFieldsRaw=missing.length?missing:(performanceStillNeedsAttributes?performanceAttributeManualFields(afterSchema.schema||schema,after,attributePending):[]);
  const manualFields=decorateManualFieldsWithSupplier(manualFieldsRaw,merged,Boolean(supplier));
  const manualFieldMode=manualFields.some(x=>x.manualFieldMode==='exact')?'exact':manualFields.some(x=>x.manualFieldMode==='required')?'required':manualFields.length?'candidate':'none';
  const maxReviewScore=Math.max(80,Math.min(99,n(store.getSettings().dailyQualityReviewMaxScore,95)));
  const scoreStillInReview=Number.isFinite(Number(scoreAfter))&&Number(scoreAfter)<=maxReviewScore;
  const catalogAllComplete=catalogQualityAfter?.adoption_status?.all?.complete;
  // Não basta catalog_quality dizer que não há missing_attributes. Se /performance ainda
  // mantém CARACTERÍSTICAS em PENDING, a etapa continua aberta e deve pedir evidência.
  const complete=missing.length===0&&!incompleteTag&&(catalogAllComplete!==false)&&!performanceStillNeedsAttributes;
  const waitingRecalc=missing.length===0&&!performanceStillNeedsAttributes&&incompleteTag;
  const applied=attrs.map(a=>({id:a.id,value:a.value_name||a.value_id||'',source:sources.get(String(a.id))||'fonte confirmada'}));
  let reason='';
  if(updateError)reason=`O Mercado Livre recusou parte da atualização: ${updateError}`;
  else if(missing.length)reason=`Ainda faltam ${missing.length} característica(s) que o Mercado Livre exige para a ficha técnica: ${missing.map(x=>x.name).join(', ')}.`;
  else if(performanceStillNeedsAttributes&&manualFields.length)reason=`O Mercado Livre ainda mantém CARACTERÍSTICAS como pendente${scoreAfter!=null?` e a qualidade está em ${Math.round(scoreAfter)}/100`:''}. O Publisher trouxe ${manualFields.length} campo(s) editável(is) para esta tela; preencha o valor correto abaixo e eu valido novamente no Mercado Livre.`;
  else if(performanceStillNeedsAttributes)reason=`O Mercado Livre ainda mantém CARACTERÍSTICAS como pendente${scoreAfter!=null?` e a qualidade está em ${Math.round(scoreAfter)}/100`:''}, mas não foi possível montar um campo editável desta categoria. Abra o anúncio pelo atalho e confira a seção de características.`;
  else if(waitingRecalc)reason='Os campos obrigatórios foram preenchidos, mas o Mercado Livre ainda mantém a tag de ficha técnica incompleta. A etapa ficará aguardando recálculo.';
  else if(scoreStillInReview)reason=`A ficha técnica não tem mais pendência de CARACTERÍSTICAS, mas a qualidade geral ainda está em ${Math.round(scoreAfter)}/100 por outra ação de qualidade. Esta etapa de características está validada; o Orientador deve seguir para a próxima causa.`;
  else reason=`Ficha técnica relida e validada no Mercado Livre${scoreAfter!=null?` · qualidade atual ${Math.round(scoreAfter)}/100`:''}.`;
  const editUrl=sellerEditUrl(row.itemId);
  const evidenceRequest=(missing.length||performanceStillNeedsAttributes)?{required:true,missing,manualFields,manualFieldMode,directEntry:manualFields.length>0,editUrl,reason:missing.length?'missing_attributes':'performance_characteristics_pending',attributePending,solution:manualFields.length?'Preencha diretamente os campos mostrados no Publisher. Se precisar confirmar o dado, você ainda pode colar um print/texto da WeDrop/fabricante; depois o sistema grava e valida de novo no Mercado Livre.':'Abra o anúncio no Mercado Livre pelo atalho para identificar a característica pendente e depois informe o valor ao Publisher.'}:null;
  return {changed:attrs.length>0&&!updateError,manual:Boolean(updateError||missing.length||performanceStillNeedsAttributes),waiting:waitingRecalc,complete,reason,attributes:applied,supplierFound:Boolean(supplier),researchStatus:research.status,evidence:research.evidence||null,evidenceRequest,attributeVerification:{complete,waitingRecalc,incompleteTechnicalSpecs:incompleteTag,missing,manualFields,manualFieldMode,editUrl,attributePending,performanceAttributesPending:performanceStillNeedsAttributes,scoreStillInReview,catalogQuality:catalogQualityAfter,catalogQualityReason:catalogQualityAfter?.adoption_status?.quality_reason||catalogQualityAfter?.quality_reason||'',scoreBefore:Number.isFinite(Number(row?.qualityScore))?Number(row.qualityScore):null,scoreAfter,pending:pendingNow,checkedAt:new Date().toISOString(),technicalInputAvailable:Boolean(afterSchema.technicalInputAvailable)}};
}
async function legacyQualityAttributeRepair(t,row,item){return qualityAttributeRepair(t,row,item,null)}
function visionAttributeEvidence(vision={},schema=[]){
  const allowed=new Map((schema||[]).map(a=>[String(a.id),a])),out={};
  for(const x of Array.isArray(vision?.target_attributes)?vision.target_attributes:[]){const id=String(x?.id||'');if(!allowed.has(id)||!clean(x?.value))continue;out[id]={value:clean(x.value),source:'Print/texto enviado pelo operador'};}
  const capture=supplierVisionPatch(vision),synthetic={...capture.patch,supplierAttributes:capture.supplierAttributes||{}};
  for(const a of schema||[]){if(out[a.id])continue;const inferred=inferAttributeValue(a,synthetic);if(inferred?.value)out[a.id]={value:inferred.value,source:'Print/texto enviado pelo operador'};}
  const named=Object.entries(vision?.other_attributes||{}).map(([name,value])=>({key:normalizeQualityName(name),value:clean(value)})).filter(x=>x.key&&x.value);
  for(const a of schema||[]){if(out[a.id])continue;const k=normalizeQualityName(a.name||a.id),hit=named.find(x=>x.key===k||(x.key.length>=5&&k.length>=5&&(x.key.includes(k)||k.includes(x.key))));if(hit)out[a.id]={value:hit.value,source:'Print/texto enviado pelo operador'};}
  return out;
}

function ocrTextLines(raw=''){
  return String(raw||'').replace(/\r/g,'\n').split(/\n+/).map(x=>clean(x.replace(/^[\s•·▪◦*-]+/,'').replace(/\s+/g,' '))).filter(Boolean).slice(0,500);
}
function ocrDescriptorAliases(a={}){
  const id=String(a.id||'').toUpperCase(),name=normalizeQualityName(a.name||a.id),out=[name];
  const add=(...xs)=>xs.forEach(x=>{const n=normalizeQualityName(x);if(n&&!out.includes(n))out.push(n)});
  if(/WIDTH/.test(id)||/largura/.test(name))add('largura','largura total','largura do produto','largura montada','width');
  if(/HEIGHT/.test(id)||/altura/.test(name))add('altura','altura total','altura do produto','altura montada','height');
  if(/LENGTH/.test(id)||/comprimento/.test(name))add('comprimento','comprimento total','comprimento do produto','length');
  if(/DEPTH/.test(id)||/profundidade/.test(name))add('profundidade','depth');
  if(/DIAMETER/.test(id)||/diametro/.test(name))add('diametro','diâmetro','diametro total');
  if(/WEIGHT/.test(id)||/peso/.test(name))add('peso','peso do produto','peso liquido','peso líquido','weight');
  if(/MATERIAL/.test(id)||/material|composicao/.test(name))add('material','composição','composicao');
  if(/COLOR/.test(id)||/\bcor\b/.test(name))add('cor','color');
  if(/BRAND/.test(id)||/marca/.test(name))add('marca','brand');
  if(/MODEL/.test(id)||/modelo/.test(name))add('modelo','model');
  if(/VOLTAGE/.test(id)||/voltagem|tensao/.test(name))add('voltagem','tensão','tensao','voltage');
  if(/POWER/.test(id)||/potencia/.test(name))add('potência','potencia','power');
  if(/CAPACITY/.test(id)||/capacidade/.test(name))add('capacidade','capacity');
  if(/NUMBER_OF_PIECES|QUANTITY/.test(id)||/quantidade.*pec/.test(name))add('quantidade de peças','quantidade de pecas','número de peças','numero de pecas');
  if(/GTIN/.test(id)||/gtin|codigo universal|código universal/.test(name))add('gtin','ean','código universal','codigo universal','código de barras','codigo de barras');
  if(/INMETRO/.test(id)||/inmetro|certifica|registro/.test(name))add('inmetro','registro inmetro','certificação inmetro','certificacao inmetro');
  return out.filter(Boolean).sort((a,b)=>b.length-a.length);
}
function ocrLineValue(line,a={}){
  const raw=clean(line);if(!raw)return '';
  const nl=normalizeQualityName(raw),aliases=ocrDescriptorAliases(a);
  for(const alias of aliases){
    if(!alias)continue;
    if(nl===alias)continue;
    if(nl.startsWith(alias+' ')){
      const words=raw.split(/\s+/),count=alias.split(/\s+/).length;let tail=words.slice(count).join(' ').replace(/^[:=\-–—]+\s*/,'').trim();
      if(tail)return tail;
    }
    const sep=raw.match(/^(.{2,80}?)\s*[:=]\s*(.+)$/);if(sep){const label=normalizeQualityName(sep[1]);if(label===alias||label.includes(alias)||alias.includes(label))return clean(sep[2]);}
  }
  return '';
}
function ocrDimensionValue(raw,a={}){
  const name=normalizeQualityName(a.name||a.id),id=String(a.id||'').toUpperCase();
  let labels=[];
  if(/WIDTH/.test(id)||/largura/.test(name))labels=['largura(?:\\s+total|\\s+do\\s+produto|\\s+montada)?','width'];
  else if(/HEIGHT/.test(id)||/altura/.test(name))labels=['altura(?:\\s+total|\\s+do\\s+produto|\\s+montada)?','height'];
  else if(/LENGTH/.test(id)||/comprimento/.test(name))labels=['comprimento(?:\\s+total|\\s+do\\s+produto)?','length'];
  else if(/DEPTH/.test(id)||/profundidade/.test(name))labels=['profundidade','depth'];
  else if(/DIAMETER/.test(id)||/diametro/.test(name))labels=['di[âa]metro(?:\\s+total)?','diameter'];
  else if(/WEIGHT/.test(id)||/peso/.test(name))labels=['peso(?:\\s+do\\s+produto|\\s+l[ií]quido)?','weight'];
  if(!labels.length)return '';
  for(const label of labels){
    let m=String(raw).match(new RegExp(`${label}\\s*[:=\\-]?\\s*(\\d+(?:[.,]\\d+)?)\\s*(mm|cm|m|g|kg)?`,'iu'));if(m)return `${m[1]}${m[2]?` ${m[2]}`:''}`;
    m=String(raw).match(new RegExp(`(\\d+(?:[.,]\\d+)?)\\s*(mm|cm|m|g|kg)\\s*(?:de\\s*)?${label}`,'iu'));if(m)return `${m[1]} ${m[2]}`;
  }
  return '';
}
function manualAttributeEvidence(rawValues={},schema=[],sourceKey='operador'){
  const input=rawValues&&typeof rawValues==='object'&&!Array.isArray(rawValues)?rawValues:{},byId=new Map((schema||[]).map(a=>[String(a.id),a])),evidenceValues={},matched=[],rejected=[];
  const sourceLabels={wedrop:'WeDrop · informado pelo operador',fabricante:'Fabricante · informado pelo operador',mercado_livre:'Mercado Livre · informado pelo operador',operador:'Informado manualmente pelo operador'};
  const source=sourceLabels[String(sourceKey||'').toLowerCase()]||sourceLabels.operador;
  for(const [rawId,rawValue] of Object.entries(input)){
    const id=String(rawId||''),a=byId.get(id),value=clean(rawValue);if(!id||!a||!value)continue;
    const norm=normAttr(value),type=clean(a.value_type).toLowerCase(),allowed=Array.isArray(a.values)?a.values:[];
    if(norm==='nao se aplica'){
      const exact=allowed.find(v=>normAttr(v?.name)==='nao se aplica');
      if(!exact){rejected.push({id,name:a.name||id,value,reason:'O Mercado Livre não oferece “Não se aplica” para este campo.'});continue;}
    }
    if(norm==='nao disponivel'&&['number','number_unit','date'].includes(type)){rejected.push({id,name:a.name||id,value,reason:'Este campo exige um valor numérico/data; “Não disponível” não é aceito.'});continue;}
    const normalized=normalizeMlAttributeValue(id,value,a),payload=attributePayloadForDescriptor(a,normalized);
    if(!payload){rejected.push({id,name:a.name||id,value,reason:'Valor não pôde ser convertido para o formato aceito pelo Mercado Livre.'});continue;}
    const resolved=clean(payload.value_name||allowed.find(v=>String(v.id)===String(payload.value_id))?.name||normalized);
    if(!resolved){rejected.push({id,name:a.name||id,value,reason:'Valor vazio após normalização.'});continue;}
    evidenceValues[id]={value:resolved,source};matched.push({id,name:a.name||id,value:resolved,method:'manual_direct',source});
  }
  return {evidenceValues,matched,rejected};
}

function localOcrAttributeEvidence(rawText='',schema=[]){
  const raw=String(rawText||'').slice(0,30000),lines=ocrTextLines(raw),evidenceValues={},matched=[];
  for(const a of Array.isArray(schema)?schema:[]){
    const id=String(a?.id||'');if(!id)continue;
    let candidate=ocrDimensionValue(raw,a),method=candidate?'dimension':'line';
    if(!candidate){for(const line of lines){candidate=ocrLineValue(line,a);if(candidate)break;}}
    if(!candidate&&Array.isArray(a.values)&&a.values.length){
      const aliases=ocrDescriptorAliases(a);const relevant=lines.find(line=>aliases.some(alias=>normalizeQualityName(line).includes(alias)));
      if(relevant){const nr=normalizeQualityName(relevant);const hit=a.values.find(v=>nr.includes(normalizeQualityName(v?.name)));if(hit?.name){candidate=hit.name;method='allowed_value';}}
    }
    if(!candidate)continue;
    const normalized=normalizeMlAttributeValue(id,candidate,a);if(!normalized)continue;
    const payload=attributePayloadForDescriptor(a,normalized);if(!payload)continue;
    const safeValue=clean(payload.value_name||normalized);if(!safeValue&&!payload.value_id)continue;
    evidenceValues[id]={value:safeValue||clean((a.values||[]).find(v=>String(v.id)===String(payload.value_id))?.name),source:'OCR local do print'};
    matched.push({id,name:a.name||id,value:evidenceValues[id].value,method});
  }
  return {engine:'tesseract_local+deterministic_match',evidenceValues,matched,rawText:raw.slice(0,12000)};
}

async function applyMonitoringFix(alertId,{confirm=false}={}){
  if(!confirm)throw Object.assign(new Error('Confirme a correção antes de alterar a operação.'),{status:400});
  const {alert:a,row,product:p}=monitorAlertContext(alertId);if(!a||!row)throw Object.assign(new Error('Alerta não encontrado. Execute o monitor novamente.'),{status:404});
  const t=await token();let message='',changed=false,route=monitoringRouteFor(a.type,p,row),details={};
  if(a.type==='ITEM_STATUS'){
    let item=await ML.itemDetails(t,row.itemId),pp=p?await refreshProductStockFromSupplier(p):null,user=await ML.me(t),stockSnap=null;
    if(pp){
      try{
        stockSnap=await remoteStockSnapshot(t,pp,item,user,store.getSettings());details.stockBefore=stockSnap;
        const target=desiredStockTarget(pp);details.stockTarget=target;
        if(target.quantity>0&&!stockSnap.matches&&n(item.sold_quantity,0)<=0){
          details.execution=[...(details.execution||[]),{step:'Estoque',status:'EXECUTANDO',detail:`Sincronizar estoque remoto ${stockSnap.remote??'indisponível'} → ${target.quantity}.`}];
          const synced=await syncRemoteStockToTarget(t,pp,item,user,store.getSettings()); stockSnap=synced.snap; item=synced.item||await ML.itemDetails(t,row.itemId); changed=changed||Boolean(synced.changed);
          details.stockAfter=stockSnap;details.execution.push({step:'Estoque',status:synced.ok?'FEITO':synced.manual?'AÇÃO MANUAL':synced.waiting?'AGUARDANDO':'FALHOU',detail:synced.ok?`Estoque confirmado em ${stockSnap.remote} unidade(s).`:(synced.reason||`Mercado Livre ainda mostra ${stockSnap.remote??'indisponível'} unidade(s).`)});
          if(!synced.ok&&synced.manual)details.requiresManual=true;
        }
      }catch(e){details.stockError=safeError(e);details.execution=[...(details.execution||[]),{step:'Estoque',status:'FALHOU',detail:safeError(e)}];}
    }
    const status=clean(item.status).toLowerCase(),subs=(item.sub_status||[]).map(clean).filter(Boolean);const blocker=subs.some(x=>/(under_review|forbidden|warning|suspend|fraud|moderation|closed_by_admin|deleted)/i.test(x));
    const effectiveQty=stockSnap?.remote!=null?n(stockSnap.remote):n(item.available_quantity);details.effectiveStock=effectiveQty;details.stockSource=stockSnap?.mode||'available_quantity';
    if(status==='paused'&&effectiveQty>0&&!blocker){
      details.execution=[...(details.execution||[]),{step:'Status do anúncio',status:'EXECUTANDO',detail:`Reativar anúncio com estoque confirmado em ${effectiveQty}.`}];
      await ML.updateItem(t,row.itemId,{status:'active'}); await new Promise(r=>setTimeout(r,700)); item=await ML.itemDetails(t,row.itemId);changed=true;
      const active=clean(item.status).toLowerCase()==='active';details.remoteConfirmed=active;details.execution.push({step:'Status do anúncio',status:active?'FEITO':'AGUARDANDO',detail:active?'Anúncio confirmado como active.':`Mercado Livre ainda retorna ${item.status}.`});message=active?'Estoque e status corrigidos e confirmados no Mercado Livre.':'Estoque corrigido; reativação enviada e aguardando confirmação do Mercado Livre.';
    }else if(status==='active'&&effectiveQty>0){details.remoteConfirmed=true;message=`Anúncio ativo com ${effectiveQty} unidade(s) confirmadas.`;}
    else if(status==='paused'&&effectiveQty<=0){const target=pp?desiredStockTarget(pp):{quantity:0}; if(target.quantity>0){message=`O fornecedor/local indica ${target.quantity} unidade(s), mas o estoque remoto ainda não foi confirmado. A SKU permanece em correção, não como “sem estoque”.`;details.requiresManual=Boolean(details.stockError);details.stockSyncPending=!details.stockError;}else{message='Fornecedor e Mercado Livre estão sem estoque confirmado. A SKU ficará em observação até o estoque voltar.';details.waitingStock=true;details.supplierOutOfStock=true;}}
    else{message=`Não é seguro reativar automaticamente. Status ${status||'desconhecido'}${subs.length?` · ${subs.join(', ')}`:''}.`;details.requiresManual=true;}
  }else if(['FRETE_MUDOU','PRECO_MUDOU','CVR_BAIXO','CONVERSAO_BAIXA'].includes(a.type)){
    if(!p)throw Object.assign(new Error('Esta SKU não está cadastrada no Publisher para recalcular preço/frete automaticamente.'),{status:422});
    const analysis=await analyzeCommercial(p,{refreshMarket:true});const patch=commercialPatchFromResult(p,analysis);const current=store.getProducts().find(x=>String(x.id)===String(p.id))||p;const merged={...current,...patch};patch.quality=quality(merged);patch.readiness=productReadiness({...merged,quality:patch.quality});await store.updateProduct(p.id,patch);changed=true;
    const recommended=n(patch.priceRecommendation?.grossUploadPrice||analysis.pricingRecommendation?.grossUploadPrice||analysis.recommendedScenario?.price);const activePromo=Number(row.promotion?.activeCount||0)>0;
    if(a.type==='FRETE_MUDOU'&&recommended>0&&!activePromo&&Math.abs(recommended-n(row.currentPrice))>.01){await ML.updateItem(t,row.itemId,{price:Number(recommended.toFixed(2))});message=`Frete/margem recalculados e preço do anúncio ajustado para R$ ${recommended.toFixed(2)}.`;details.remotePriceChanged=true;}
    else{message=activePromo?'Preço/frete recalculados. Há promoção ativa; o sistema preservou o preço remoto e abriu revisão comercial para não quebrar a oferta.':'Preço, frete e margem foram recalculados. Revise a recomendação comercial antes de alterar conteúdo/preço adicional.';details.reanalyzed=true;}
  }else if(['SEM_PROMOCAO','PROMO_TERMINANDO'].includes(a.type)){
    const state=await scanPromotions({autoApply:false,itemId:row.itemId});const eligible=(state.rows||[]).filter(x=>String(x.itemId)===String(row.itemId)&&x.eligible&&x.status==='candidate').sort((x,y)=>n(y.projectedMargin)-n(x.projectedMargin));
    if(eligible.length){const chosen=eligible[0];const out=await applyPromotionRow(chosen,t);changed=true;message=`Promoção segura aplicada: ${chosen.typeLabel||chosen.type} · margem projetada ${n(chosen.projectedMargin).toFixed(1)}%.`;details.promotion={rowId:chosen.id,type:chosen.type,promoPrice:chosen.promoPrice,projectedMargin:chosen.projectedMargin,out};}
    else{message='Nenhuma promoção candidata passou pelas regras de margem/segurança. Abra Promoções para revisar as alternativas disponíveis.';details.requiresManual=true;}
  }else if(['ADS_SEM_VENDA','ROAS_BAIXO'].includes(a.type)){
    const ar=(store.getAds().rows||[]).find(x=>String(x.itemId||'')===String(row.itemId||'')||String(x.productId||'')===String(row.productId||''));
    if(ar?.adGroupId&&ar.campaignOwnedByPublisher){await ML.adsUpdateAdGroup(t,{site:SITE,adGroupId:ar.adGroupId,status:'paused',campaignId:ar.campaignId});if(p){const plan=store.getAdsPlan(p.id)||{};await store.setAdsPlan(p.id,{...plan,active:false,pausedAt:new Date().toISOString(),updatedAt:new Date().toISOString()});}changed=true;message='Product Ads desta SKU foi pausado para interromper gasto enquanto a oferta é corrigida.';details.adGroupId=ar.adGroupId;}
    else{message='O ADS não é gerenciado pelo Publisher ou não há Ad Group identificável. Abra ADS Automático para revisar sem alterar campanha externa.';details.requiresManual=true;}
  }else if(a.type==='ANUNCIO_PARADO'){
    if(!p)throw Object.assign(new Error('Esta SKU precisa estar cadastrada no Publisher para otimização automática.'),{status:422});
    const beforeTitle=clean(p.seoTitle||p.product);let enriched=null;try{enriched=await enrichProduct(p,{})}catch(e){details.enrichmentError=safeError(e)}
    if(enriched){const patch={...enriched};delete patch.id;await store.updateProduct(p.id,patch);details.seoReanalyzed=true;}
    const fresh=store.getProducts().find(x=>String(x.id)===String(p.id))||p;const newTitle=clean(fresh.seoTitle||fresh.product).slice(0,n(fresh.titleMaxLength,60)||60);const item=await ML.itemDetails(t,row.itemId);
    if(newTitle&&newTitle!==clean(item.title)&&n(item.sold_quantity)<=0){try{await ML.updateItem(t,row.itemId,{title:newTitle});changed=true;details.titleChanged={from:item.title,to:newTitle};}catch(e){details.titleError=safeError(e)}}
    try{const analysis=await analyzeCommercial(fresh,{refreshMarket:true});const patch=commercialPatchFromResult(fresh,analysis);const current=store.getProducts().find(x=>String(x.id)===String(p.id))||fresh;const merged={...current,...patch};patch.quality=quality(merged);patch.readiness=productReadiness({...merged,quality:patch.quality});await store.updateProduct(p.id,patch);details.commercialReanalyzed=true;}catch(e){details.commercialError=safeError(e)}
    if(Number(row.promotion?.activeCount||0)===0){try{const ps=await scanPromotions({autoApply:false,itemId:row.itemId});const eligible=(ps.rows||[]).filter(x=>String(x.itemId)===String(row.itemId)&&x.eligible&&x.status==='candidate').sort((x,y)=>n(y.projectedMargin)-n(x.projectedMargin));if(eligible[0]){await applyPromotionRow(eligible[0],t);changed=true;details.promotionApplied={type:eligible[0].type,projectedMargin:eligible[0].projectedMargin};}}catch(e){details.promotionError=safeError(e)}}
    const state=store.getMonitoring();const optimizationCooldowns={...(state.optimizationCooldowns||{}),[`${a.sku}:ANUNCIO_PARADO`]:new Date(Date.now()+72*60*60*1000).toISOString()};await store.setMonitoring({...state,optimizationCooldowns});message=`Otimização concluída para ${a.sku}. SEO/preço/frete foram reanalisados${details.titleChanged?' e o título foi atualizado':''}${details.promotionApplied?' e uma promoção segura foi aplicada':''}. A SKU ficará 72 h em observação antes de voltar à fila.`;changed=true;details.observationHours=72;
  }else if(a.type==='QUALIDADE_BAIXA'){
    const item=await ML.itemDetails(t,row.itemId);
    if(!p){
      const plan=Monitoring.qualityRepairPlan(row,null,item),compact=plan.compactActions||[];details.qualityPlan=plan;details.risks=plan.risks;details.externalItem=true;details.legacySources=['Catálogo WeDrop','Mercado Livre'];details.applied=[];details.notApplied=[];details.execution=[];let remoteChanged=false;
      const manual=[];let attributesHandled=false;
      for(const action of compact){
        if(action.kind==='attributes'){
          // Primárias e secundárias podem aparecer separadas na tela, mas a consulta/reparo
          // da ficha técnica é uma única operação remota. Evita gravar os mesmos atributos duas vezes.
          if(attributesHandled)continue;attributesHandled=true;
          const repaired=await legacyQualityAttributeRepair(t,row,item);details.legacyAttributeRepair=repaired;details.attributeVerification=repaired.attributeVerification;details.evidenceRequest=repaired.evidenceRequest||null;
          if(repaired.changed)remoteChanged=true;
          if(repaired.complete){details.attributeResolved=true;details.applied.push('CARACTERÍSTICAS');details.execution.push({step:'CARACTERÍSTICAS',status:'FEITO',detail:`Ficha técnica relida e validada no Mercado Livre. ${repaired.attributes?.length||0} característica(s) foram preenchidas nesta execução.${repaired.attributeVerification?.scoreAfter!=null?` Qualidade atual ${Math.round(repaired.attributeVerification.scoreAfter)}/100.`:''}`});}
          else if(repaired.waiting){details.execution.push({step:'CARACTERÍSTICAS',status:'AGUARDANDO',detail:repaired.reason});details.notApplied.push('CARACTERÍSTICAS · aguardando recálculo');}
          else{manual.push('CARACTERÍSTICAS');details.notApplied.push('CARACTERÍSTICAS');details.execution.push({step:'CARACTERÍSTICAS',status:repaired.evidenceRequest?.required?'PRECISO DE INFORMAÇÃO':'AÇÃO MANUAL',detail:repaired.reason||'Ainda existem campos da ficha técnica sem informação confiável.'});}
        }else{
          manual.push(action.label);details.notApplied.push(action.label);
          const guidance=action.kind==='pictures'
            ?'Revisar a foto do anúncio antigo e substituir somente por imagem fiel e confirmada do mesmo produto.'
            :action.kind==='video'
              ?'Revisar/associar o Clip ou vídeo correto deste produto. O sistema deve abrir a etapa guiada e nunca substituir vídeo por conteúdo de outra SKU.'
              :action.kind==='description'
                ?'Revisar a descrição atual usando somente dados confirmados do produto.'
                :'Revisar o título atual; se o anúncio já tiver vendas, respeitar a restrição do Mercado Livre.';
          details.execution.push({step:action.label,status:'AÇÃO MANUAL',detail:guidance});
        }
      }
      if(!compact.length){manual.push('QUALIDADE');details.execution.push({step:'QUALIDADE',status:'AGUARDANDO',detail:'O Mercado Livre informou score baixo, mas ainda não retornou qual das quatro correções deve ser feita. A próxima varredura consultará /performance novamente.'});}
      details.requiresManual=manual.length>0;changed=remoteChanged;
      const maxScore=Math.max(80,Math.min(99,n(store.getSettings().dailyQualityReviewMaxScore,95))),scoreAfter=details.attributeVerification?.scoreAfter;
      details.qualityResolved=Boolean(details.attributeVerification?.complete&&!details.requiresManual&&Number.isFinite(Number(scoreAfter))&&Number(scoreAfter)>maxScore);
      if(remoteChanged){details.observationMinutes=details.qualityResolved?0:30;message=`SKU antiga tratada sem exigir cadastro prévio no Publisher. Corrigido automaticamente: ${details.applied.join(', ')}.${manual.length?` Ainda precisa de ação manual: ${manual.join(', ')}.`:' Aguardando o Mercado Livre recalcular e confirmar a qualidade.'}`;}
      else message=`SKU antiga analisada diretamente. ${manual.length?`Precisa corrigir: ${manual.join(', ')}.`:'Aguardando detalhamento do Mercado Livre.'} O sistema tentou usar WeDrop e Mercado Livre antes de encaminhar qualquer etapa para MANUAL.`;
    }else{
    const plan=Monitoring.qualityRepairPlan(row,p,item);details.qualityPlan=plan;details.applied=[];details.notApplied=[];let remoteChanged=false;
    const hasKind=kind=>plan.auto.some(x=>x.kind===kind);
    if(hasKind('pictures')){
      try{await ML.updateItem(t,row.itemId,{pictures:p.generatedImages.slice(0,12).map(source=>({source}))});remoteChanged=true;details.picturesSynced=p.generatedImages.length;details.applied.push('Fotos aprovadas sincronizadas com o Mercado Livre.');}
      catch(e){details.picturesError=safeError(e);details.notApplied.push(`Fotos: ${safeError(e)}`)}
    }
    if(hasKind('title')){
      const seoTitle=clean(p.seoTitle||p.product).slice(0,n(p.titleMaxLength,60)||60);
      if(seoTitle&&seoTitle!==clean(item.title)){try{await ML.updateItem(t,row.itemId,{title:seoTitle});remoteChanged=true;details.titleChanged={from:item.title,to:seoTitle};details.applied.push('Título SEO atualizado.');}catch(e){details.titleError=safeError(e);details.notApplied.push(`Título: ${safeError(e)}`)}}
    }
    if(hasKind('description')&&clean(p.description)){
      try{await ML.updateDescription(t,row.itemId,p.description);remoteChanged=true;details.descriptionUpdated=true;details.applied.push('Descrição atualizada.');}
      catch(e){details.descriptionError=safeError(e);details.notApplied.push(`Descrição: ${safeError(e)}`)}
    }
    if((plan.compactActions||[]).some(x=>x.kind==='attributes')){
      const repaired=await qualityAttributeRepair(t,row,item,p);details.attributeRepair=repaired;details.attributeVerification=repaired.attributeVerification;details.evidenceRequest=repaired.evidenceRequest||null;
      if(repaired.changed)remoteChanged=true;
      if(repaired.complete){details.attributeResolved=true;details.attributesUpdated=(repaired.attributes||[]).map(x=>x.id);details.applied.push(`Ficha técnica relida e validada (${repaired.attributes?.length||0} atributo(s) preenchido(s) nesta execução).`);details.execution=[...(details.execution||[]),{step:'CARACTERÍSTICAS',status:'FEITO',detail:repaired.reason}];}
      else if(repaired.waiting){details.notApplied.push(`Ficha técnica: ${repaired.reason}`);details.execution=[...(details.execution||[]),{step:'CARACTERÍSTICAS',status:'AGUARDANDO',detail:repaired.reason}];}
      else{details.attributesError=repaired.reason;details.notApplied.push(`Ficha técnica: ${repaired.reason}`);details.requiresManual=true;details.execution=[...(details.execution||[]),{step:'CARACTERÍSTICAS',status:repaired.evidenceRequest?.required?'PRECISO DE INFORMAÇÃO':'AÇÃO MANUAL',detail:repaired.reason}];}
    }
    const remainingGuided=(plan.guided||[]).filter(x=>!(x.kind==='attributes'&&details.attributeVerification));
    if(remainingGuided.length){details.guided=remainingGuided;details.requiresManual=true;}
    if(plan.risks.length)details.risks=plan.risks;
    try{
      const perfNow=Monitoring.performanceSummary(await ML.itemPerformance(t,row.itemId)||{});details.qualityAfter={score:perfNow.score,level:perfNow.level,pending:perfNow.pending,checkedAt:new Date().toISOString()};
      const maxScore=Math.max(80,Math.min(99,n(store.getSettings().dailyQualityReviewMaxScore,95)));
      const attrsOk=!details.attributeVerification||details.attributeVerification.complete===true;
      details.qualityResolved=attrsOk&&!details.requiresManual&&Number.isFinite(Number(perfNow.score))&&Number(perfNow.score)>maxScore;
    }catch(_){details.qualityResolved=false;}
    if(plan.republicationCandidate){
      details.republicationCandidate=true;
      details.republicationAdvice='Como o score está muito baixo e o anúncio ainda não tem vendas, se as pendências estruturais não puderem ser corrigidas no anúncio atual, a opção segura é preparar uma nova publicação completa e somente depois encerrar a antiga. O sistema não exclui automaticamente.';
    }else if(plan.hasSales&&n(row.qualityScore)<70){
      details.republicationAdvice='Este anúncio já tem vendas. Não será encerrado/republicado automaticamente porque isso pode perder histórico e sinais acumulados. Primeiro corrigimos tudo que a API permitir e preservamos o item.';
    }
    changed=remoteChanged;const state=store.getMonitoring();
    if(remoteChanged){
      const optimizationCooldowns={...(state.optimizationCooldowns||{}),[`${a.sku}:QUALIDADE_BAIXA`]:new Date(Date.now()+30*60*1000).toISOString()};await store.setMonitoring({...state,optimizationCooldowns});
      message=`Correção de qualidade enviada ao Mercado Livre: ${details.applied.join(' ')} A pontuação /performance pode levar alguns minutos para recalcular.`;
      if(details.guided?.length)message+=` Ainda há ${details.guided.length} etapa(s) que exigem revisão guiada.`;
      details.observationMinutes=30;
    }else{
      details.requiresManual=true;
      const why=(plan.guided||[]).map(x=>`${x.label}: ${x.reason}`).join(' ');
      message=`Não havia alteração remota segura para aplicar automaticamente. ${why||'O Mercado Livre não retornou uma ação automática aplicável.'}`;
      if(details.republicationAdvice)message+=` ${details.republicationAdvice}`;
    }
    }
    // V1.8.76 — se CARACTERÍSTICAS foi validada, essa causa sai da fila imediatamente.
    // A nota geral pode continuar em 80–95 enquanto o Mercado Livre recalcula ou por outra causa;
    // isso não pode prender o operador na mesma correção já concluída.
    if(details.attributeResolved){
      const verified=details.attributeVerification||{},stateNow=store.getMonitoring(),checkedAt=verified.checkedAt||new Date().toISOString();
      const rawPending=Array.isArray(verified.pending)?verified.pending:(Array.isArray(details.qualityAfter?.pending)?details.qualityAfter.pending:(Array.isArray(row.qualityPending)?row.qualityPending:[]));
      const filteredPending=rawPending.filter(issue=>Monitoring.qualityIssueKind(issue)!=='attributes');
      const scoreCandidate=Number.isFinite(Number(verified.scoreAfter))?Number(verified.scoreAfter):(Number.isFinite(Number(details.qualityAfter?.score))?Number(details.qualityAfter.score):row.qualityScore);
      const rowAfter={...row,qualityScore:scoreCandidate,qualityPending:filteredPending,qualityCalculatedAt:checkedAt,lastQualityCheckedAt:checkedAt,lastCheckedAt:checkedAt,qualityAttributeResolvedAt:checkedAt};
      const remainingQualityActions=DailyOps.qualityActionLabels(rowAfter);details.remainingQualityActions=remainingQualityActions;
      const rowsNow=[...(stateNow.rows||[])],rowIdx=rowsNow.findIndex(x=>(row.itemId&&String(x.itemId||'')===String(row.itemId))||String(x.sku||'')===String(row.sku||''));
      if(rowIdx>=0)rowsNow[rowIdx]=rowAfter;else rowsNow.push(rowAfter);
      const sameQualityAlert=x=>String(x.type||'')==='QUALIDADE_BAIXA'&&((row.itemId&&String(x.itemId||'')===String(row.itemId))||String(x.sku||'')===String(row.sku||''));
      const keepAlerts=(stateNow.alerts||[]).filter(x=>!sameQualityAlert(x));
      const refreshedQuality=remainingQualityActions.length?Monitoring.alertsForRow(rowAfter,store.getSettings()).filter(x=>x.type==='QUALIDADE_BAIXA').map(x=>({...x,itemId:row.itemId,qualityPlan:Monitoring.qualityRepairPlan(rowAfter,p||null,item)})):[];
      const alertMap=new Map();for(const x of [...refreshedQuality,...keepAlerts])alertMap.set(String(x.id||`${x.sku}:${x.type}`),x);
      await store.setMonitoring({...stateNow,rows:rowsNow,alerts:[...alertMap.values()].slice(0,300)});
      const explicitBlockers=Boolean(details.evidenceRequest?.required)||(Array.isArray(details.guided)&&details.guided.length>0)||(Array.isArray(details.notApplied)&&details.notApplied.length>0);
      if(!remainingQualityActions.length&&!explicitBlockers){
        details.requiresManual=false;details.qualityResolved=true;details.observationMinutes=0;
        message=`CARACTERÍSTICAS validada no Mercado Livre${Number.isFinite(Number(scoreCandidate))?` · qualidade atual ${Math.round(Number(scoreCandidate))}/100`:''}. Esta causa saiu da fila e o Orientador seguirá para a próxima SKU/ação; a nota geral continuará sendo acompanhada em segundo plano.`;
      }else if(remainingQualityActions.length){
        message=`CARACTERÍSTICAS concluída e retirada da fila. Próxima causa de qualidade desta SKU: ${remainingQualityActions.join(', ')}.`;
      }
    }
  }else if(a.type==='CTR_BAIXO'){
    message='A causa provável está em capa/título. A alteração automática de imagem/título não será feita sem revisão visual; abri a etapa exata da SKU para corrigir com segurança.';details.requiresManual=true;
  }else{
    message='Este alerta exige revisão guiada. O sistema abriu a etapa mais adequada e manteve o alerta até a causa realmente desaparecer.';details.requiresManual=true;
  }
  // Toda correção devolve um comprovante legível do que realmente foi executado.
  if(!Array.isArray(details.execution)||!details.execution.length){
    details.execution=[];
    if(Array.isArray(details.applied)&&details.applied.length){for(const x of details.applied)details.execution.push({step:'Correção aplicada',status:'FEITO',detail:String(x)});}
    if(Array.isArray(details.notApplied)&&details.notApplied.length){for(const x of details.notApplied)details.execution.push({step:'Correção não aplicada',status:'FALHOU',detail:String(x)});}
    if(!details.execution.length){
      if(details.requiresManual)details.execution.push({step:'Revisão necessária',status:'AÇÃO MANUAL',detail:message});
      else if(changed)details.execution.push({step:'Correção remota',status:'FEITO',detail:message});
      else details.execution.push({step:'Validação',status:'AGUARDANDO',detail:message});
    }
  }
  // V1.8.48: a correção não bloqueia mais a tela aguardando uma varredura completa da conta.
  // A confirmação imediata da própria ação decide o retorno; o monitor completo roda em segundo plano.
  const resolved=a.type==='ITEM_STATUS'
    ?Boolean(details.remoteConfirmed)||Boolean(details.supplierOutOfStock)
    :a.type==='QUALIDADE_BAIXA'
      ?Boolean(details.qualityResolved===true)
      :Boolean(details.waitingStock)||Boolean(details.observationHours)||Boolean(details.observationMinutes)||Boolean(changed&&!details.requiresManual);
  let latest=store.getMonitoring();
  if(resolved){latest={...latest,alerts:(latest.alerts||[]).filter(x=>String(x.id)!==String(a.id))};await store.setMonitoring(latest)}
  setImmediate(()=>runMonitoring({source:`background-after-fix:${a.type}`,concurrency:2}).catch(()=>{}));
  const entry={id:id(),alertId:a.id,sku:a.sku,itemId:row.itemId,title:row.title||p?.product||'',permalink:row.permalink||'',type:a.type,changed,resolved,status:resolved?'resolvido':details.requiresManual?'revisar':'aplicado',message,route,details,before:{status:row.status,price:row.currentPrice,shippingCost:row.shippingCost,qualityScore:row.qualityScore},after:details.waitingStock?{status:'out_of_stock_observation'}:details.observationMinutes?{status:'aguardando_recálculo',minutes:details.observationMinutes}:details.observationHours?{status:'em_observação',hours:details.observationHours}:changed?{status:'alteração_aplicada'}:{status:'sem_alteração_remota'},verification:{remoteConfirmed:resolved&&!details.observationMinutes&&!details.observationHours,observationMinutes:details.observationMinutes||0,observationHours:details.observationHours||0,requiresManual:Boolean(details.requiresManual)},links:auditLinks({itemId:row.itemId,sku:a.sku,permalink:row.permalink||'',context:a.type==='QUALIDADE_BAIXA'?'quality':'monitor-fix'}),at:new Date().toISOString()};await recordMonitorResolution(entry);
  latest=store.getMonitoring();return {ok:true,changed,resolved,message,route,details,links:entry.links,monitoring:latest,nextAlert:(latest.alerts||[])[0]||null};
}
function monitoringCorrectionPlan(alertId){
  const {alert:a,row,product:p}=monitorAlertContext(alertId);if(!a||!row)return null;
  const target=p?desiredStockTarget(p):null,actions=[];let diagnosis=a.message||a.title||'Pendência detectada.';
  const add=(step,detail,verify='Consultar novamente o Mercado Livre após executar.')=>actions.push({step,detail,verify});
  if(a.type==='ITEM_STATUS'){
    add('1. Conferir estoque real',`Comparar estoque do fornecedor/local (${target?.quantity??'não disponível'}) com o estoque remoto correto (${row.stockSource==='multiwarehouse'?'User Product / seller_warehouse':'anúncio'}: ${row.availableQuantity??'não disponível'}).`,'Confirmar a quantidade remota depois da leitura.');
    if(target&&Number(row.availableQuantity)!==Number(target.quantity))add('2. Corrigir estoque',`Se não houver vendas que impeçam reposição, sincronizar ${row.availableQuantity??0} → ${target.quantity} unidade(s).`,'Ler novamente o estoque remoto e exigir a quantidade esperada.');
    add('3. Corrigir status',`Se houver estoque confirmado e não existir bloqueio de moderação, reativar o anúncio ${row.itemId}.`,'Consultar o item e confirmar status active.');
  }else if(['FRETE_MUDOU','PRECO_MUDOU','CVR_BAIXO','CONVERSAO_BAIXA'].includes(a.type)){add('1. Recotar frete','Consultar frete atual e recalcular custo, tarifa, margem e preço seguro.');add('2. Proteger margem','Atualizar preço remoto apenas quando não houver promoção/automação que torne a alteração insegura.','Confirmar o preço remoto após a alteração.');}
  else if(['SEM_PROMOCAO','PROMO_TERMINANDO'].includes(a.type)){add('1. Consultar promoções','Buscar campanhas elegíveis para esta SKU.');add('2. Aplicar oferta segura','Escolher somente opção que preserve a margem mínima.','Consultar promoções novamente e confirmar a adesão.');}
  else if(['ADS_SEM_VENDA','ROAS_BAIXO'].includes(a.type)){add('1. Proteger orçamento','Pausar o Ad Group somente se ele for gerenciado pelo Publisher.','Confirmar o estado enviado ao Product Ads.');}
  else if(a.type==='ANUNCIO_PARADO'){add('1. Reanalisar oferta','Recalcular SEO, preço, frete e margem.');add('2. Otimizar com segurança','Atualizar título somente sem vendas e aplicar promoção apenas se houver margem.','Colocar a SKU em observação de 72 h.');}
  else if(a.type==='QUALIDADE_BAIXA'){
    const qp=a.qualityPlan||Monitoring.qualityRepairPlan(row,p||null,{}),compact=qp.compactActions||[];
    diagnosis=`Qualidade ${Math.round(Number(row.qualityScore||0))}/100.${compact.length?` Corrigir: ${compact.map(x=>x.label).join(', ')}.`:' Aguardando o Mercado Livre detalhar a pendência.'}`;
    for(const x of compact){
      const auto=(qp.auto||[]).find(y=>y.kind===x.kind),guided=(qp.guided||[]).find(y=>y.kind===x.kind);
      if(x.kind==='attributes')add('CARACTERÍSTICAS','Consultar a ficha oficial da categoria, inclusive technical_specs/input e atributos condicionais; preencher com WeDrop, catálogo/produto idêntico e dados confiáveis do Mercado Livre. Se ainda faltar campo, pedir print/texto ao operador.','Reler o anúncio e confirmar que não há atributo técnico obrigatório/relevante pendente antes de concluir.');
      else if(auto)add(x.label,auto.reason,'Consultar novamente /performance depois da correção.');
      else add(x.label,guided?.reason||'Executar revisão guiada desta parte do anúncio.','Validar manualmente e consultar novamente /performance.');
    }
    if(!compact.length)add('ATUALIZAR ANÁLISE','Consultar novamente /performance antes de alterar o anúncio.','A próxima leitura deve identificar FOTO, CARACTERÍSTICAS, DESCRIÇÃO ou TÍTULO.');
  }
  else add('Revisar pendência',a.solution||a.message||'Abrir a etapa correspondente e validar a correção.');
  return {alertId:a.id,sku:a.sku,itemId:row.itemId,type:a.type,title:a.title,diagnosis,before:{status:row.status,stock:row.availableQuantity,stockSource:row.stockSource,stockExpected:row.stockExpected,price:row.currentPrice,shipping:row.shippingCost,quality:row.qualityScore},actions,route:monitoringRouteFor(a.type,p,row)};
}
app.get('/api/monitoring/fix/plan',(req,res)=>{const plan=monitoringCorrectionPlan(clean(req.query.alertId));if(!plan)return res.status(404).json({error:'Alerta não encontrado. Execute o monitor novamente.'});res.json({ok:true,plan});});

app.post('/api/monitoring/quality/attribute-evidence',imageUpload.single('image'),async(req,res)=>{
  try{
    const alertId=clean(req.body?.alertId),text=clean(req.body?.text),ocrText=clean(req.body?.ocrText),combinedText=[text,ocrText].filter(Boolean).join('\n');if(!alertId)return res.status(400).json({error:'Alerta de qualidade não informado.'});
    let manualValues={};try{manualValues=JSON.parse(String(req.body?.manualValues||'{}'))}catch(_){manualValues={}}
    const hasManualValues=Object.values(manualValues||{}).some(v=>Boolean(clean(v)));
    if(!req.file&&!combinedText&&!hasManualValues)return res.status(400).json({error:'Digite o valor do campo pendente, envie um print ou cole a informação do produto.'});
    const {alert:a,row,product:p}=monitorAlertContext(alertId);if(!a||!row||a.type!=='QUALIDADE_BAIXA')return res.status(404).json({error:'Pendência de qualidade não encontrada. Atualize a rotina.'});
    const t=await token(),item=await ML.itemDetails(t,row.itemId),schemaInfo=await qualityTechnicalSchema(t,item);let cq=null;try{cq=await ML.catalogQualityStatus(t,row.itemId,{fresh:true})}catch(_){}const missingBefore=qualityMissingAttributes(schemaInfo.schema,item,cq);
    let perfBefore=null;try{perfBefore=Monitoring.performanceSummary(await ML.itemPerformance(t,row.itemId,{fresh:true})||{})}catch(_){}
    const attributePendingBefore=(perfBefore?.pending||[]).filter(x=>Monitoring.qualityIssueKind(x)==='attributes');
    const supplierBefore=store.findSupplierSku(row?.sku);let assistBase=p?{...p}:{...legacyQualityBase(row,item).base};
    if(supplierBefore)assistBase=initializeProductShape(SupplierCatalog.refreshFromSupplier(assistBase,supplierBefore),'quality-evidence-wedrop');
    const manualFieldsBeforeRaw=missingBefore.length?missingBefore:(attributePendingBefore.length?performanceAttributeManualFields(schemaInfo.schema||[],item,attributePendingBefore):[]);
    const manualFieldsBefore=decorateManualFieldsWithSupplier(manualFieldsBeforeRaw,assistBase,Boolean(supplierBefore));
    const manualIds=new Set(manualFieldsBefore.map(x=>String(x.id)));
    let targetAttributes=(schemaInfo.schema||[]).filter(a=>manualIds.has(String(a.id)));
    // Para OCR em print/texto mantemos a ficha completa como apoio somente quando não há
    // nenhum campo manual identificável. Para digitação direta, os IDs exibidos na tela
    // sempre são os mesmos que serão enviados ao Mercado Livre.
    if(!targetAttributes.length&&attributePendingBefore.length)targetAttributes=(schemaInfo.schema||[]).slice(0,80);
    if(!targetAttributes.length&&!attributePendingBefore.length){
      const settingsNow=store.getSettings(),scoreNow=Number.isFinite(Number(perfBefore?.score))?Number(perfBefore.score):null,checkedAt=new Date().toISOString();
      const rowAfter={...row,qualityScore:scoreNow??row.qualityScore,qualityPending:perfBefore?.pending||[],qualityCalculatedAt:perfBefore?.calculatedAt||checkedAt,lastQualityCheckedAt:checkedAt,lastCheckedAt:checkedAt};
      const remaining=DailyOps.qualityActionLabels(rowAfter),st=store.getMonitoring(),rowsNow=[...(st.rows||[])],idx=rowsNow.findIndex(x=>(row.itemId&&String(x.itemId||'')===String(row.itemId))||String(x.sku||'')===String(row.sku||''));
      if(idx>=0)rowsNow[idx]=rowAfter;else rowsNow.push(rowAfter);
      const sameQualityAlert=x=>String(x.type||'')==='QUALIDADE_BAIXA'&&((row.itemId&&String(x.itemId||'')===String(row.itemId))||String(x.sku||'')===String(row.sku||''));
      const keepAlerts=(st.alerts||[]).filter(x=>!sameQualityAlert(x));
      const refreshedQuality=remaining.length?Monitoring.alertsForRow(rowAfter,settingsNow).filter(x=>x.type==='QUALIDADE_BAIXA').map(x=>({...x,itemId:row.itemId,qualityPlan:Monitoring.qualityRepairPlan(rowAfter,p,item)})):[];
      await store.setMonitoring({...st,rows:rowsNow,alerts:[...refreshedQuality,...keepAlerts].slice(0,300)});
      return res.json({ok:true,attributeResolved:true,qualityResolved:Boolean(scoreNow!=null&&scoreNow>Math.max(80,Math.min(99,n(settingsNow.dailyQualityReviewMaxScore,95)))),remainingQualityActions:remaining,message:remaining.length?`CARACTERÍSTICAS já estava resolvida. Próxima causa de qualidade: ${remaining.join(', ')}.`:'A ficha técnica já não possui pendência de CARACTERÍSTICAS no Mercado Livre.',verification:{complete:!(Array.isArray(item.tags)&&item.tags.includes('incomplete_technical_specs')),missing:[],manualFields:[],attributePending:[],performanceAttributesPending:false,scoreAfter:scoreNow,pending:perfBefore?.pending||[],checkedAt}});
    }
    // V1.8.76: o caminho de evidência não depende mais da OpenAI.
    // O navegador faz OCR local e envia somente o texto; o servidor faz o casamento determinístico
    // contra os atributos oficiais da categoria. Texto digitado pelo operador usa o mesmo caminho.
    const manualDirect=manualAttributeEvidence(manualValues,targetAttributes,req.body?.evidenceSource||'operador');
    const localOcr=localOcrAttributeEvidence(combinedText,targetAttributes),evidenceValues={...localOcr.evidenceValues,...manualDirect.evidenceValues},found=Object.keys(evidenceValues);
    const matched=[...(localOcr.matched||[]),...(manualDirect.matched||[])];
    if(!found.length){const names=manualFieldsBefore.map(x=>x.name).filter(Boolean),rejected=manualDirect.rejected||[];return res.json({ok:false,needsEvidence:true,message:rejected.length?`Não consegui aplicar o valor informado: ${rejected.map(x=>`${x.name}: ${x.reason}`).join(' · ')}`:names.length?`Ainda preciso do valor correto para: ${names.join(', ')}. Preencha diretamente o campo exibido na tela e clique em validar.`:'O Mercado Livre ainda mantém CARACTERÍSTICAS pendente. Use o atalho para abrir o anúncio e confira a seção de características.',verification:{complete:false,missing:missingBefore,manualFields:manualFieldsBefore,manualFieldMode:manualFieldsBefore.some(x=>x.manualFieldMode==='exact')?'exact':manualFieldsBefore.some(x=>x.manualFieldMode==='required')?'required':manualFieldsBefore.length?'candidate':'none',editUrl:sellerEditUrl(row.itemId),attributePending:attributePendingBefore,performanceAttributesPending:attributePendingBefore.length>0},missing:missingBefore,manualFields:manualFieldsBefore,rejected,ocr:{engine:localOcr.engine,matched,textPreview:localOcr.rawText.slice(0,1200)}});}
    if(p){const manualAttributes={...(p.manualAttributes||{})},attributeSources={...(p.attributeSources||{})};for(const [id,x] of Object.entries(evidenceValues)){manualAttributes[id]=x.value;attributeSources[id]=x.source;}await store.updateProduct(p.id,{manualAttributes,attributeSources});}
    const repaired=await qualityAttributeRepair(t,row,item,p,{evidenceValues});
    const verification=repaired.attributeVerification||{},settingsNow=store.getSettings(),maxScore=Math.max(80,Math.min(99,n(settingsNow.dailyQualityReviewMaxScore,95))),scoreAfter=verification.scoreAfter;
    const missingAfter=Array.isArray(verification.missing)?verification.missing:[],pendingAfter=Array.isArray(verification.pending)?verification.pending:(Array.isArray(row.qualityPending)?row.qualityPending:[]);
    const attributeResolved=Boolean(repaired.complete&&!verification.performanceAttributesPending&&missingAfter.length===0);
    const qualityResolved=Boolean(attributeResolved&&Number.isFinite(Number(scoreAfter))&&Number(scoreAfter)>maxScore);
    let remainingQualityActions=[];
    if(attributeResolved){
      // A correção de CARACTERÍSTICAS precisa desaparecer imediatamente da fila, mesmo que
      // a nota geral continue baixa por FOTO/VÍDEO/TÍTULO. Atualizamos a linha e o alerta
      // com o /performance recém-lido antes da varredura de fundo.
      const st=store.getMonitoring(),checkedAt=verification.checkedAt||new Date().toISOString();
      const rowAfter={...row,qualityScore:Number.isFinite(Number(scoreAfter))?Number(scoreAfter):row.qualityScore,qualityPending:pendingAfter,qualityCalculatedAt:checkedAt,lastQualityCheckedAt:checkedAt,lastCheckedAt:checkedAt};
      remainingQualityActions=DailyOps.qualityActionLabels(rowAfter);
      const rowsNow=[...(st.rows||[])],idx=rowsNow.findIndex(x=>(row.itemId&&String(x.itemId||'')===String(row.itemId))||String(x.sku||'')===String(row.sku||''));
      if(idx>=0)rowsNow[idx]=rowAfter;else rowsNow.push(rowAfter);
      const sameQualityAlert=x=>String(x.type||'')==='QUALIDADE_BAIXA'&&((row.itemId&&String(x.itemId||'')===String(row.itemId))||String(x.sku||'')===String(row.sku||''));
      const keepAlerts=(st.alerts||[]).filter(x=>!sameQualityAlert(x));
      const refreshedQuality=remainingQualityActions.length?Monitoring.alertsForRow(rowAfter,settingsNow).filter(x=>x.type==='QUALIDADE_BAIXA').map(x=>({...x,itemId:row.itemId,qualityPlan:Monitoring.qualityRepairPlan(rowAfter,p,item)})):[];
      const alertMap=new Map();for(const x of [...refreshedQuality,...keepAlerts])alertMap.set(String(x.id||`${x.sku}:${x.type}`),x);
      await store.setMonitoring({...st,rows:rowsNow,alerts:[...alertMap.values()].slice(0,300)});
    }
    await store.addJob({id:id(),type:'quality-attribute-evidence',status:attributeResolved?'resolvido':repaired.complete?'aguardando-score':'revisar',sku:a.sku,itemId:row.itemId,fields:found,remainingQualityActions,at:new Date().toISOString()});
    setImmediate(()=>runMonitoring({source:'quality-evidence-background',mode:'fast'}).catch(()=>{}));
    const nameById=new Map((schemaInfo.schema||[]).map(x=>[String(x.id),x.name||x.id]));
    const filled=(repaired.attributes||[]).map(x=>({...x,name:nameById.get(String(x.id))||x.id}));
    const resolvedMessage=remainingQualityActions.length?`Características validadas. Próxima causa de qualidade: ${remainingQualityActions.join(', ')}.`:'Características validadas no Mercado Livre; esta correção saiu da fila.';
    res.json({ok:true,attributeResolved,qualityResolved,remainingQualityActions,needsEvidence:Boolean(!attributeResolved&&repaired.evidenceRequest?.required),message:attributeResolved?resolvedMessage:repaired.reason,verification:repaired.attributeVerification,evidenceRequest:attributeResolved?null:(repaired.evidenceRequest||null),attributes:filled,filled,missing:missingAfter,ocr:{engine:localOcr.engine,matched,textPreview:localOcr.rawText.slice(0,1200)},manualRejected:manualDirect.rejected||[]});
  }catch(e){res.status(e.status||500).json({error:safeError(e),details:e.response?.data})}
});

app.post('/api/catalog-guard/product-verification/confirm',async(req,res)=>{try{
  const itemId=clean(req.body?.itemId);if(!itemId)return res.status(400).json({error:'Informe o MLB do anúncio.'});
  const t=await token(),item=await ML.itemDetails(t,itemId);let eligibility=null;try{eligibility=await ML.catalogEligibility(t,itemId)}catch(_){}
  const status=clean(item.status).toLowerCase(),catalogListing=Boolean(item.catalog_listing),eligStatus=clean(eligibility?.status||''),available=n(item.available_quantity);
  const subs=(Array.isArray(item.sub_status)?item.sub_status:[]).map(x=>clean(x).toLowerCase());
  const links=auditLinks({itemId,userProductId:userProductIdFromMlItem(item),sku:skuFromMlItem(item),permalink:item.permalink,context:'product-verification'});
  const current=store.getMonitoring(),guard=current.catalogGuard||{};
  // Se o anúncio ficou inativo/sem estoque, ele não pertence a esta fila. Remova qualquer tarefa antiga.
  if(available<=0||(status!=='active'&&subs.includes('out_of_stock'))){
    const pending=(guard.productVerificationRequired||[]).filter(x=>String(x.itemId)!==String(itemId));
    await store.setMonitoring({...current,catalogGuard:{...guard,productVerificationRequired:pending,lastProductVerificationAt:new Date().toISOString()}});
    return res.json({ok:true,confirmed:true,ignored:true,status,availableQuantity:available,message:'Retirado da fila: anúncio sem estoque/inativo. Nenhuma ação de “Verificar produto” é necessária agora.',links});
  }
  let perf;try{perf=Monitoring.performanceSummary(await ML.itemPerformance(t,itemId)||{})}catch(e){return res.status(502).json({error:`Não consegui confirmar o objetivo “Verificar produto” no Mercado Livre: ${safeError(e)}`})}
  const stillPending=catalogProductVerificationPending(perf.pending||[]);
  const confirmed=status==='active'&&!catalogListing&&!stillPending;
  if(!confirmed)return res.json({ok:true,confirmed:false,status,catalogListing,eligibilityStatus:eligStatus,verifyProductPending:stillPending,message:stillPending?'O Mercado Livre ainda mostra o objetivo “Verificar produto”. Aguarde a automação concluir e a próxima releitura.':`O objetivo saiu da qualidade, mas o anúncio ainda não ficou no estado esperado (${status||'desconhecido'}).`,links});
  const pending=(guard.productVerificationRequired||[]).filter(x=>String(x.itemId)!==String(itemId));
  await store.setMonitoring({...current,catalogGuard:{...guard,productVerificationRequired:pending,lastProductVerificationAt:new Date().toISOString()}});
  await recordOperationAudit({category:'catalog',action:'PRODUCT_VERIFICATION_CONFIRMED',sku:skuFromMlItem(item),itemId,title:item.title,status:'confirmed',confirmed:true,source:'seller-center-helper',message:'O objetivo “Verificar produto” desapareceu do /performance e o anúncio permaneceu ativo fora do catálogo.',after:{status,catalogListing,eligibilityStatus:eligStatus,verifyProductPending:false},links});
  return res.json({ok:true,confirmed:true,status,catalogListing,eligibilityStatus:eligStatus,verifyProductPending:false,message:'Verificação concluída: o objetivo “Verificar produto” saiu da qualidade do anúncio.',links});
}catch(e){res.status(e.status||500).json({error:safeError(e),details:e.response?.data})}});

app.get('/api/ml/open-edit',async(req,res)=>{try{
  const itemId=clean(req.query?.itemId);if(!itemId)return res.status(400).send('Informe o itemId.');
  const t=await token(),item=await ML.itemDetails(t,itemId),sku=skuFromMlItem(item),up=userProductIdFromMlItem(item);
  // V1.8.76: a rota profunda de edição OMNI contém tokens/segmentos gerados pela própria Central.
  // Abrir /anuncios/MLBU.../modificar diretamente causa 404. Portanto começamos pela lista oficial,
  // filtrada pelo MLB exato; o Helper encontra o cartão correto e usa o href real renderizado pelo ML.
  let url=sellerListUrl(item.id,sku);
  if(req.query?.auto==='verify-product'){
    const marker=new URLSearchParams({
      'ra-auto-verify-product':'1',
      'ra-run':`${Date.now()}-${String(item.id||'')}`,
      'ra-item':String(item.id||''),
      'ra-sku':String(sku||''),
      'ra-up':String(up||''),
      'ra-title':String(item.title||'').slice(0,140)
    }).toString();
    url+=`#${marker}`;
  }
  return res.redirect(302,url);
}catch(e){return res.status(e.status||500).send(`Não foi possível localizar o anúncio no Mercado Livre: ${safeError(e)}`)}});

app.get('/api/catalog-guard',(req,res)=>{const settings=store.getSettings(),guard=store.getMonitoring().catalogGuard||{};res.json({guard,settings:{catalogParticipationPolicy:settings.catalogParticipationPolicy||'avoid_optional',catalogAutoGuardEnabled:settings.catalogAutoGuardEnabled!==false,catalogDailyCheckTime:settings.catalogDailyCheckTime||'08:15',catalogAutoPauseBoostedOptional:settings.catalogAutoPauseBoostedOptional!==false}})});
app.post('/api/catalog-guard/run',async(req,res)=>{try{const guard=await runCatalogGuard({source:'manual',autoApply:req.body?.autoApply!==false});res.json({ok:true,guard})}catch(e){res.status(e.status||500).json({error:safeError(e),details:e.response?.data})}});
app.post('/api/catalog-guard/settings',async(req,res)=>{try{const current=store.getSettings(),v=String(req.body?.catalogDailyCheckTime||current.catalogDailyCheckTime||'08:15');if(!/^([01]?\d|2[0-3]):[0-5]\d$/.test(v))return res.status(400).json({error:'Horário diário inválido.'});const settings=await store.setSettings({catalogParticipationPolicy:'avoid_optional',catalogAutoGuardEnabled:req.body?.catalogAutoGuardEnabled!==false,catalogDailyCheckTime:v.padStart(5,'0'),catalogAutoPauseBoostedOptional:req.body?.catalogAutoPauseBoostedOptional!==false});res.json({ok:true,settings})}catch(e){res.status(500).json({error:safeError(e)})}});
app.post('/api/monitoring/fix',async(req,res)=>{try{res.json(await applyMonitoringFix(clean(req.body?.alertId),{confirm:Boolean(req.body?.confirm)}))}catch(e){res.status(e.status||500).json({error:safeError(e),details:e.response?.data})}});

app.post('/api/ops/query',async(req,res)=>{try{const question=clean(req.body?.question||'');if(!question)return res.status(400).json({error:'Digite uma pergunta sobre a operação.'});const fresh=/(agora|atualize|verifique|confira|elegi|catalog|anuncio|anúncio)/i.test(question);const ctx=await opsContext({fresh});const answer=OpsCopilot.answer(question,ctx);await store.addJob({id:id(),type:'ops-copilot-query',status:'sucesso',question,at:new Date().toISOString()});res.json({...answer,question,generatedAt:new Date().toISOString(),catalogPolicy:store.getSettings().catalogParticipationPolicy||'avoid_optional'});}catch(e){res.status(e.status||500).json({error:safeError(e),details:e.response?.data})}});
app.post('/api/ops/action',async(req,res)=>{try{const type=clean(req.body?.type);if(type==='SET_CATALOG_POLICY_AVOID_OPTIONAL'){const settings=await store.setSettings({catalogParticipationPolicy:'avoid_optional'});await store.addJob({id:id(),type:'ops-action',status:'sucesso',action:type,at:new Date().toISOString()});return res.json({ok:true,message:'Política salva: o Publisher continuará fora do catálogo quando a participação for opcional. A elegibilidade é definida pelo Mercado Livre e não é alterada remotamente.',settings:{catalogParticipationPolicy:settings.catalogParticipationPolicy}})}if(type==='RUN_MONITOR')return res.json({ok:true,message:'Monitor atualizado.',monitoring:await runMonitoring({source:'ops-copilot'})});if(type==='SYNC_ACCOUNTING')return res.json({ok:true,message:'Contabilidade sincronizada.',accounting:await syncAccounting(30)});return res.status(400).json({error:'Ação não suportada ou exige fluxo específico.'});}catch(e){res.status(e.status||500).json({error:safeError(e),details:e.response?.data})}});
app.get('/api/ops/overview',async(req,res)=>{try{const ctx=await opsContext({fresh:req.query.fresh==='1'});res.json({inventoryCount:ctx.inventory.length,catalogEligibleCount:ctx.catalogEligible.length,alerts:(ctx.monitoring.alerts||[]).length,products:ctx.products.length,lastMonitorAt:ctx.monitoring.lastRunAt||null,inventoryScannedAt:ctx.monitoring.accountInventoryScannedAt||null,catalogParticipationPolicy:ctx.settings.catalogParticipationPolicy||'avoid_optional',catalogGuard:ctx.monitoring.catalogGuard||null});}catch(e){res.status(e.status||500).json({error:safeError(e)})}});


function commercialAuditProduct(inv={}){
  const products=store.getProducts();
  const local=products.find(p=>String(p.ml_item_id||'')===String(inv.itemId||'')||(inv.sku&&String(p.sku||'').toLowerCase()===String(inv.sku||'').toLowerCase()))||null;
  const supplier=inv.sku?store.findSupplierSku(inv.sku):null;
  const minimumSalePrice=n(local?.priceRecommendation?.minimumSalePrice||local?.commercialAnalysis?.pricingRecommendation?.minimumSalePrice||0);
  const grossReference=n(local?.priceRecommendation?.grossUploadPrice||local?.commercialAnalysis?.pricingRecommendation?.grossUploadPrice||0);
  return {local,supplier,minimumSalePrice,grossReference,baselineSource:minimumSalePrice>0?'Publisher · margem/frete validados':supplier?.cost>0?'WeDrop disponível · baseline comercial ainda não calculado':'sem baseline de margem'};
}
function commercialIssueBase(inv={},type,label,message,solution,view){return {id:`${inv.itemId||inv.sku}:${type}`,sku:inv.sku||inv.itemId,itemId:inv.itemId||'',title:inv.title||'',type,label,message,solution,view,permalink:inv.permalink||'',createdAt:new Date().toISOString()}}
// Revisão comercial de todas as SKUs continua ativa, agora em lotes incrementais e não bloqueantes.
async function scanCommercialAlignment({source='daily',inventory:providedInventory=null,onProgress=null,concurrency=12,mergeExisting=false,totalOverride=0,recordJob=true}={}){
  const t=await token(),me=await ML.me(t),settings=store.getSettings(),errors=[],issues=[],rows=[];
  const progress=(patch={})=>{try{onProgress&&onProgress({...patch,at:new Date().toISOString()})}catch(_){}};
  let monitoring=store.getMonitoring(),inventory=Array.isArray(providedInventory)&&providedInventory.length?providedInventory:(Array.isArray(monitoring.accountInventory)?monitoring.accountInventory:[]);
  if(!inventory.length){const snap=await scanAccountInventory({t,me,max:1500});inventory=snap.rows;monitoring=await store.setMonitoring({...monitoring,accountInventory:inventory,accountInventoryScannedAt:snap.scannedAt});}
  const adsState=store.getAds();const adsAudit=Array.isArray(adsState.auditRows)?adsState.auditRows:[];const adsByItem=new Map(adsAudit.map(x=>[String(x.itemId||''),x]));
  const prevAudit=monitoring.commercialAudit||{},prevByItem=new Map((prevAudit.rows||[]).map(x=>[String(x.itemId||''),x]));
  let reviewed=0,completed=0;
  async function inspect(inv){
    const {local,supplier,minimumSalePrice,grossReference,baselineSource}=commercialAuditProduct(inv);const status=clean(inv.status).toLowerCase();
    const out={sku:inv.sku||inv.itemId,itemId:inv.itemId,title:inv.title||'',status,baselineSource,minimumSalePrice,grossReference,priceChecked:false,promotionChecked:false,discountChecked:false,adsChecked:false,issues:[],checkedAt:new Date().toISOString(),externalAccountItem:!local};
    if(['closed','deleted'].includes(status)){out.priceChecked=out.promotionChecked=out.discountChecked=out.adsChecked=true;out.skipped='anúncio encerrado';reviewed++;return out;}
    let sale=null,promos=[];
    const q=await Promise.allSettled([ML.salePrice(t,inv.itemId),ML.promotionsForItem(t,inv.itemId)]);
    if(q[0].status==='fulfilled')sale=q[0].value;else errors.push({sku:out.sku,itemId:inv.itemId,stage:'commercial-price',error:safeError(q[0].reason)});
    if(q[1].status==='fulfilled')promos=Array.isArray(q[1].value)?q[1].value:[];else errors.push({sku:out.sku,itemId:inv.itemId,stage:'commercial-promotions',error:safeError(q[1].reason)});
    const saleAmount=Monitoring.extractSalePrice(sale,n(inv.price));const regularAmount=n(sale?.regular_amount||sale?.regularAmount||0);const standardPrice=regularAmount>saleAmount?regularAmount:saleAmount;const promoApiPrice=Monitoring.promotionPrice(promos,standardPrice);const discountPrice=(saleAmount>0&&standardPrice>saleAmount?saleAmount:0)||promoApiPrice;const effectivePrice=saleAmount>0?saleAmount:(discountPrice||standardPrice);const promo=currentPromotionInfo(promos,n(settings.monitoringPromotionExpiryHours,24));
    out.currentPrice=standardPrice;out.salePrice=effectivePrice;out.promotionPrice=promoApiPrice;out.discountPrice=discountPrice;out.effectivePrice=effectivePrice;out.promotionActiveCount=promo.activeCount||0;out.promotionScheduledCount=promo.scheduledCount||0;out.promotionCandidateCount=promo.candidateCount||0;out.priceChecked=q[0].status==='fulfilled';out.promotionChecked=q[1].status==='fulfilled';out.discountChecked=out.priceChecked&&out.promotionChecked;
    if(standardPrice<=0){out.issues.push(commercialIssueBase(inv,'PRICE_INVALID','PREÇO','Preço de venda atual não pôde ser confirmado ou está zerado.','Confirmar o preço atual no Mercado Livre e corrigir antes de manter promoção ou ADS ativo.','pricing'));}
    if(minimumSalePrice>0&&standardPrice>0&&standardPrice+0.01<minimumSalePrice){let auto=false;try{auto=(await pricingAutomationState(t,inv.itemId)).active}catch(e){errors.push({sku:out.sku,itemId:inv.itemId,stage:'pricing-automation',error:safeError(e)})}out.pricingAutomationActive=auto;out.issues.push(commercialIssueBase(inv,'PRICE_BELOW_MIN','PREÇO',`Preço padrão R$ ${standardPrice.toFixed(2)} está abaixo do mínimo seguro R$ ${minimumSalePrice.toFixed(2)} calculado pelo Publisher.`,auto?'Revisar a automação de preços ativa; não enviar PUT /items presumindo alteração de preço.':'Recalcular preço/frete/margem e corrigir o preço somente após confirmar a margem mínima.','pricing'));}
    if(discountPrice>0&&minimumSalePrice>0&&effectivePrice+0.01<minimumSalePrice){out.issues.push(commercialIssueBase(inv,'DISCOUNT_BELOW_MIN','DESCONTO',`Preço efetivo com desconto R$ ${effectivePrice.toFixed(2)} ficou abaixo do mínimo seguro R$ ${minimumSalePrice.toFixed(2)}.`,`Revisar ou remover o desconto/promoção que derrubou a margem abaixo do limite.`, 'promos'));}
    if(promo.expiringSoon&&!promo.hasScheduled){out.issues.push(commercialIssueBase(inv,'PROMO_EXPIRING','PROMOÇÃO',`Promoção atual termina em aproximadamente ${Math.max(0,promo.hoursLeft).toFixed(1)} h.`,'Aplicar somente uma próxima oferta segura, se houver. Quando não existir campanha segura, o Publisher apenas monitora e não bloqueia a rotina.','promos'));}
    const ad=adsByItem.get(String(inv.itemId))||null;out.adsChecked=adsState.permissionOk===false?false:true;out.adsActive=Boolean(ad?.active);out.adsStatus=ad?.status||'not_running';out.adsMetrics=ad?.metrics||{};
    if(ad?.active){
      const clicks=Monitoring.metric(ad.metrics,'clicks'),prints=Monitoring.metric(ad.metrics,'prints'),cost=Monitoring.metric(ad.metrics,'cost'),units=Monitoring.metric(ad.metrics,'units_quantity','UNITS_QUANTITY'),roas=Monitoring.metric(ad.metrics,'roas'),ctr=Monitoring.metric(ad.metrics,'ctr'),cvr=Monitoring.metric(ad.metrics,'cvr'),minClicks=Math.max(5,n(settings.monitoringMinAdsClicks,20));
      if(cost>0&&clicks>=minClicks&&units<=0)out.issues.push(commercialIssueBase(inv,'ADS_NO_SALES','ADS',`${Math.round(clicks)} clique(s) e R$ ${cost.toFixed(2)} de gasto sem venda atribuída.`,'Reduzir/pausar ADS e corrigir a oferta antes de aumentar orçamento.','ads'));
      if(cost>0&&roas>0&&roas<n(settings.adsTargetRoas,6))out.issues.push(commercialIssueBase(inv,'ADS_LOW_ROAS','ADS',`ROAS ${roas.toFixed(2)}x abaixo da meta ${n(settings.adsTargetRoas,6).toFixed(2)}x.`,'Ajustar orçamento/ROAS alvo e confirmar margem líquida por SKU antes de escalar.','ads'));
      if(prints>=500&&ctr>0&&ctr<0.4)out.issues.push(commercialIssueBase(inv,'ADS_LOW_CTR','ADS',`CTR ${ctr.toFixed(2)}% com ${Math.round(prints)} impressões.`,'Revisar capa e título antes de ampliar o investimento em ADS.','ads'));
      if(clicks>=minClicks&&cvr>0&&cvr<1)out.issues.push(commercialIssueBase(inv,'ADS_LOW_CVR','ADS',`CVR ${cvr.toFixed(2)}% após ${Math.round(clicks)} cliques.`,'Revisar preço final, frete, promoção e confiança da oferta antes de ampliar ADS.','ads'));
      if(minimumSalePrice>0&&effectivePrice>0&&effectivePrice+0.01<minimumSalePrice)out.issues.push(commercialIssueBase(inv,'ADS_MARGIN_RISK','ADS',`ADS está ativo enquanto o preço efetivo R$ ${effectivePrice.toFixed(2)} está abaixo do mínimo seguro R$ ${minimumSalePrice.toFixed(2)}.`,'Pausar ou limitar ADS até corrigir preço/desconto e recuperar a margem mínima.','ads'));
    }
    const prev=prevByItem.get(String(inv.itemId));out.priceChanged=Boolean(prev&&Math.abs(n(prev.currentPrice)-standardPrice)>.01);
    reviewed++;return out;
  }
  const targets=inventory.filter(x=>x?.itemId);const limit=Math.max(4,Math.min(12,Number(concurrency)||12));let cursor=0;
  progress({done:0,total:targets.length,percent:0,stage:'Revisão comercial',message:`Iniciando revisão de ${targets.length} anúncio(s).`});
  async function worker(){
    while(true){const idx=cursor++;if(idx>=targets.length)return;const inv=targets[idx];let row;
      try{row=await inspect(inv)}catch(e){errors.push({sku:inv.sku||inv.itemId,itemId:inv.itemId,stage:'commercial-audit',error:safeError(e)});reviewed++;row={sku:inv.sku||inv.itemId,itemId:inv.itemId,title:inv.title||'',status:inv.status||'',priceChecked:false,promotionChecked:false,discountChecked:false,adsChecked:false,issues:[],error:safeError(e),checkedAt:new Date().toISOString()};}
      rows[idx]=row;completed++;progress({done:completed,total:targets.length,percent:targets.length?Math.round(completed/targets.length*100):100,stage:'Revisão comercial',sku:row.sku,message:`${completed}/${targets.length} anúncio(s) revisados.`});
    }
  }
  await Promise.all(Array.from({length:Math.min(limit,Math.max(1,targets.length))},()=>worker()));
  let compactRows=rows.filter(Boolean);
  if(mergeExisting){const merged=new Map((prevAudit.rows||[]).map(r=>[String(r.itemId||r.sku||''),r]));for(const r of compactRows)merged.set(String(r.itemId||r.sku||''),r);compactRows=[...merged.values()];}
  const allIssues=[];const seen=new Set();for(const r of compactRows)for(const issue of r.issues||[]){const k=`${issue.itemId}:${issue.type}`;if(seen.has(k))continue;seen.add(k);allIssues.push(issue)}
  const mergedErrors=mergeExisting?[...(prevAudit.errors||[]),...errors].slice(-500):errors;
  const verified=compactRows.filter(r=>!r.error&&r.priceChecked&&r.promotionChecked&&r.discountChecked&&r.adsChecked).length;const totalCount=Math.max(Number(totalOverride)||0,targets.length);const audit={lastRunAt:new Date().toISOString(),lastProgressAt:new Date().toISOString(),source,total:totalCount,reviewed:compactRows.length,verified,aligned:compactRows.filter(r=>!r.error&&r.priceChecked&&r.promotionChecked&&r.discountChecked&&r.adsChecked&&!(r.issues||[]).length).length,issues:allIssues,rows:compactRows,errors:mergedErrors,scope:['PREÇO','PROMOÇÕES','DESCONTOS','ADS'],note:'A auditoria comercial é incremental e cobre todas as SKUs da conta. A fila é atualizada a cada lote; o operador não precisa aguardar a conta inteira para começar as correções; ausência de promoção ou ADS, por si só, não é tratada como erro.'};
  const fresh=store.getMonitoring();await store.setMonitoring({...fresh,commercialAudit:audit});if(recordJob)await store.addJob({id:id(),type:mergeExisting?'commercial-audit-batch':'commercial-audit-all-skus',status:errors.length?'parcial':'sucesso',reviewed:compactRows.length,total:totalCount,issues:allIssues.length,source,at:audit.lastRunAt});return audit;
}


async function scanQualityOnly({source='daily-quality',inventory=[],onProgress=null,concurrency=8}={}){
  const t=await token(),settings=store.getSettings(),before=store.getMonitoring();
  const targets=(Array.isArray(inventory)?inventory:[]).filter(x=>x?.itemId&&!['closed','deleted'].includes(clean(x.status).toLowerCase()));
  const prevByItem=new Map((before.rows||[]).map(r=>[String(r.itemId||''),r]));
  const localIds=new Set(store.getProducts().map(p=>String(p.ml_item_id||'')).filter(Boolean));
  const results=[],errors=[];let cursor=0,done=0;
  const progress=(patch={})=>{try{onProgress&&onProgress({...patch,done,total:targets.length,at:new Date().toISOString()})}catch(_){}};
  async function inspect(inv){
    const prev=prevByItem.get(String(inv.itemId))||{};let perf=null;
    try{perf=Monitoring.performanceSummary(await ML.itemPerformance(t,inv.itemId)||{})}
    catch(e){errors.push({sku:inv.sku||inv.itemId,itemId:inv.itemId,stage:'quality-performance',error:safeError(e)});perf={score:prev.qualityScore??null,level:prev.qualityLevel||'',pending:prev.qualityPending||[],calculatedAt:prev.qualityCalculatedAt||null,rawAvailable:Number.isFinite(Number(prev.qualityScore))};}
    const row={...prev,productId:prev.productId||'',sku:inv.sku||prev.sku||inv.itemId,itemId:inv.itemId,title:inv.title||prev.title||'',permalink:inv.permalink||prev.permalink||'',status:inv.status||prev.status||'',subStatus:Array.isArray(inv.subStatus)?inv.subStatus:(prev.subStatus||[]),availableQuantity:Number.isFinite(Number(inv.availableQuantity))?Number(inv.availableQuantity):Number(prev.availableQuantity||0),externalAccountItem:!localIds.has(String(inv.itemId)),qualityScore:perf.score,qualityLevel:perf.level,qualityPending:perf.pending,qualityCalculatedAt:perf.calculatedAt,qualitySource:perf.rawAvailable?'Mercado Livre /performance':'indisponível',lastQualityCheckedAt:new Date().toISOString(),lastCheckedAt:prev.lastCheckedAt||new Date().toISOString()};
    row.waitingStock=Monitoring.isOutOfStock(row);done++;progress({sku:row.sku,stage:'Qualidade dos anúncios',message:`${done}/${targets.length} anúncios com qualidade conferida.`});return row;
  }
  const limit=Math.max(2,Math.min(10,Number(concurrency)||8));
  async function worker(){while(true){const idx=cursor++;if(idx>=targets.length)return;try{results[idx]=await inspect(targets[idx])}catch(e){errors.push({sku:targets[idx]?.sku||targets[idx]?.itemId,itemId:targets[idx]?.itemId,stage:'quality-audit',error:safeError(e)});done++;progress({sku:targets[idx]?.sku||'',stage:'Qualidade dos anúncios',message:`${done}/${targets.length} anúncios com qualidade conferida.`});}}}
  await Promise.all(Array.from({length:Math.min(limit,targets.length||1)},worker));
  const latest=store.getMonitoring(),merged=new Map((latest.rows||[]).map(r=>[String(r.itemId||r.sku||''),r]));for(const r of results.filter(Boolean))merged.set(String(r.itemId||r.sku||''),r);
  const targetIds=new Set(targets.map(x=>String(x.itemId)));const keepAlerts=(latest.alerts||[]).filter(a=>!(String(a.type)==='QUALIDADE_BAIXA'&&targetIds.has(String(a.itemId||''))));const qualityAlerts=[];
  for(const row of results.filter(Boolean))for(const a of Monitoring.alertsForRow(row,settings).filter(x=>x.type==='QUALIDADE_BAIXA'))qualityAlerts.push({...a,itemId:row.itemId});
  const alertMap=new Map();for(const a of [...qualityAlerts,...keepAlerts])alertMap.set(String(a.id||`${a.sku}:${a.type}`),a);
  const scores=results.filter(r=>Number.isFinite(Number(r?.qualityScore))),critical=scores.filter(r=>Number(r.qualityScore)<Number(settings.dailyQualityCriticalScore||80)).length,improve=scores.filter(r=>Number(r.qualityScore)>=Number(settings.dailyQualityCriticalScore||80)&&Number(r.qualityScore)<=Number(settings.dailyQualityReviewMaxScore||95)).length;
  await store.setMonitoring({...latest,rows:[...merged.values()],alerts:[...alertMap.values()].slice(0,300),lastQualityAuditAt:new Date().toISOString(),lastQualityAuditSource:source,qualityAudit:{lastRunAt:new Date().toISOString(),reviewed:results.filter(Boolean).length,total:targets.length,critical,improve,errors}});
  return {reviewed:results.filter(Boolean).length,total:targets.length,critical,improve,errors};
}

function dailyOpsPayload(cycleInfo=null){
  const settings=store.getSettings(),state=store.getDailyOps(),ci=cycleInfo||DailyOps.dueCycle(settings,state),day=state.days?.[ci.dayKey]||{},saved=day[ci.cycle]||{};
  const monitoringRaw=store.getMonitoring(),inventory=monitoringRaw.accountInventory||[],invById=new Map(inventory.map(x=>[String(x.itemId||''),x]));
  const guardRaw=monitoringRaw.catalogGuard||{},cleanVerify=(guardRaw.productVerificationRequired||[]).filter(x=>{const inv=invById.get(String(x.itemId||''))||x;return clean(inv.status).toLowerCase()==='active'&&n(inv.availableQuantity)>0;});
  const monitoring={...monitoringRaw,catalogGuard:{...guardRaw,productVerificationRequired:cleanVerify}};
  const ctx={monitoring,inventory,products:store.getProducts(),ads:store.getAds(),promotions:store.getPromotions(),accounting:store.getAccounting(),settings};
  const tasks=DailyOps.buildTasks(ci.cycle,ctx).map(t=>({...t,completed:t.kind==='catalogVerify'?false:Boolean(saved.completedTasks?.[t.key]),completedAt:t.kind==='catalogVerify'?null:(saved.completedTasks?.[t.key]?.at||null)}));
  const summary=DailyOps.summary(ci.cycle,ctx,tasks);
  const corePending=tasks.filter(t=>t.required!==false&&!t.completed&&!t.autoComplete),growthPending=tasks.filter(t=>t.required===false&&!t.completed&&!t.autoComplete);
  const nextTask=corePending[0]||growthPending[0]||null;
  const statuses={};for(const c of ['morning','afternoon','evening'])statuses[c]={completed:Boolean(day?.[c]?.completedAt),completedAt:day?.[c]?.completedAt||null,startedAt:day?.[c]?.startedAt||null};
  return {cycle:ci,settings:{dailyGuideEnabled:settings.dailyGuideEnabled!==false,dailyGuidePopupsEnabled:settings.dailyGuidePopupsEnabled!==false,dailyTimezone:settings.dailyTimezone||'America/Sao_Paulo',dailyMorningTime:settings.dailyMorningTime||'08:00',dailyAfternoonTime:settings.dailyAfternoonTime||'14:00',dailyEveningTime:settings.dailyEveningTime||'18:30',dailyNewProductGoal:n(settings.dailyNewProductGoal,2),dailyNewProductStretchGoal:n(settings.dailyNewProductStretchGoal,5),dailyQualityCriticalScore:n(settings.dailyQualityCriticalScore,80),dailyQualityReviewMaxScore:n(settings.dailyQualityReviewMaxScore,95)},session:{...saved,completedTasks:saved.completedTasks||{}},cycleStatuses:statuses,tasks,summary,pendingCount:corePending.length+growthPending.length,corePendingCount:corePending.length,growthPendingCount:growthPending.length,nextTaskKey:nextTask?.key||null,coreComplete:corePending.length===0,operator:reqSafeOperatorPlaceholder};
}
const reqSafeOperatorPlaceholder=null;
app.get('/api/daily-ops',(req,res)=>{
  try{const out=dailyOpsPayload();out.operator=req.session?.operator||null;res.json(out)}catch(e){res.status(500).json({error:safeError(e)})}
});
let dailyRoutinePromise=null;
let dailyRoutineJob={status:'idle',percent:0,stage:'Aguardando',message:'Nenhuma atualização rápida em execução.',startedAt:null,updatedAt:null,finishedAt:null,error:null,cycle:null};
let dailyBackgroundPromise=null;
let dailyBackgroundJob={status:'idle',percent:0,stage:'Aguardando',message:'Auditoria de fundo ainda não iniciada.',done:0,total:0,currentSku:'',issues:0,errors:0,startedAt:null,updatedAt:null,finishedAt:null,cycle:null};
function dailyBackgroundPublic(){return {...dailyBackgroundJob,running:dailyBackgroundJob.status==='running'}}
function dailyBackgroundUpdate(patch={}){dailyBackgroundJob={...dailyBackgroundJob,...patch,updatedAt:new Date().toISOString()};return dailyBackgroundJob}
function dailyRoutinePublic(){return {...dailyRoutineJob,running:dailyRoutineJob.status==='running',usable:['ready','done'].includes(dailyRoutineJob.status),background:dailyBackgroundPublic()}}
function dailyRoutineUpdate(patch={}){dailyRoutineJob={...dailyRoutineJob,...patch,updatedAt:new Date().toISOString()};return dailyRoutineJob}
function waitMs(ms){return new Promise(resolve=>setTimeout(resolve,ms))}
async function withSoftDeadline(promise,ms,label){let timer;try{return await Promise.race([promise,new Promise((_,reject)=>{timer=setTimeout(()=>reject(new Error(`${label} excedeu ${Math.round(ms/1000)}s; usando o último estado salvo e continuando em segundo plano.`)),ms);timer.unref?.();})])}finally{clearTimeout(timer)}}

function commercialPriorityOrder(inventory=[]){
  const mon=store.getMonitoring(),prev=mon.commercialAudit||{},issueIds=new Set((prev.issues||[]).map(x=>String(x.itemId||''))),ads=store.getAds(),activeAds=new Set((ads.auditRows||[]).filter(x=>x.active).map(x=>String(x.itemId||'')));
  return [...inventory].filter(x=>x?.itemId).sort((a,b)=>{
    const score=x=>issueIds.has(String(x.itemId))?0:activeAds.has(String(x.itemId))?1:String(x.status||'').toLowerCase()!=='active'?2:3;
    return score(a)-score(b);
  });
}
async function startDailyBackgroundWork({ci,inventory=[]}={}){
  if(dailyBackgroundPromise)return dailyBackgroundPromise;
  const settings=store.getSettings(),targets=commercialPriorityOrder(inventory),total=targets.length,batchSize=20;
  dailyBackgroundJob={status:'running',percent:1,stage:'Product Ads',message:`Agora: conferindo ADS de ${total} anúncio(s). Depois: promoções/preço → qualidade → fechamento. Nenhuma alteração será feita sem confirmação.`,done:0,total,currentSku:'',issues:0,errors:0,startedAt:new Date().toISOString(),updatedAt:new Date().toISOString(),finishedAt:null,cycle:ci?.cycle||null};
  let task;
  task=(async()=>{
    try{
      // 1) ADS: leitura em lote da conta inteira. Não altera campanhas.
      try{
        dailyBackgroundUpdate({stage:'1/4 · Product Ads',percent:6,message:`Conferindo Product Ads de ${total} anúncio(s) diretamente no Mercado Livre.`});
        await scanAdsAutomation({autoApply:false,inventory:targets});
        const ads=store.getAds(),active=(ads.auditRows||[]).filter(x=>x.active).length;
        dailyBackgroundUpdate({stage:'1/4 · Product Ads concluído',percent:15,message:`ADS conferido: ${active} anúncio(s) com Ad Group ativo. Agora vou conferir preço, promoção e desconto.`});
      }catch(e){dailyBackgroundUpdate({errors:(dailyBackgroundJob.errors||0)+1,stage:'1/4 · Product Ads',message:`ADS não pôde ser concluído: ${safeError(e)}. Vou continuar as demais etapas.`});}

      // 2) Comercial: preço + promoções + descontos. Atualiza a fila a cada lote.
      for(let offset=0;offset<total;offset+=batchSize){
        const batch=targets.slice(offset,offset+batchSize);
        await scanCommercialAlignment({source:`daily-bg:${ci?.cycle||'current'}`,inventory:batch,concurrency:8,mergeExisting:true,totalOverride:total,recordJob:false,onProgress:p=>{
          const overall=Math.min(total,offset+(p.done||0)),mon=store.getMonitoring(),audit=mon.commercialAudit||{};
          const fraction=total?overall/total:1;
          dailyBackgroundUpdate({stage:'2/4 · Preço · promoções · descontos',done:overall,total,percent:15+Math.round(fraction*50),currentSku:p.sku||'',issues:(audit.issues||[]).length,errors:(audit.errors||[]).length,message:`Agora: ${overall}/${total} anúncios comerciais conferidos${p.sku?` · ${p.sku}`:''}. Depois vou conferir qualidade.`});
        }});
        const mon=store.getMonitoring(),audit=mon.commercialAudit||{};
        dailyBackgroundUpdate({done:Math.min(total,offset+batch.length),total,percent:15+Math.round((total?Math.min(total,offset+batch.length)/total:1)*50),issues:(audit.issues||[]).length,errors:(audit.errors||[]).length,message:`Preço/promoções: ${Math.min(total,offset+batch.length)}/${total} · ${(audit.issues||[]).length} ponto(s) para revisar.`});
        await waitMs(150);
      }

      // 3) Qualidade: usa /performance para todos os anúncios da conta, inclusive os que não nasceram no Publisher.
      let quality={reviewed:0,total,critical:0,improve:0,errors:[]};
      try{
        dailyBackgroundUpdate({stage:'3/4 · Qualidade dos anúncios',percent:68,message:`Conferindo qualidade oficial dos ${total} anúncios. Título, foto, vídeo e características entram na orientação.`});
        quality=await scanQualityOnly({source:`daily-quality:${ci?.cycle||'current'}`,inventory:targets,concurrency:8,onProgress:p=>{
          const fraction=p.total?p.done/p.total:1;
          dailyBackgroundUpdate({stage:'3/4 · Qualidade dos anúncios',done:p.done,total:p.total,percent:68+Math.round(fraction*20),currentSku:p.sku||'',message:`Qualidade: ${p.done}/${p.total}${p.sku?` · ${p.sku}`:''}. Correções confirmadas entram na fila do orientador.`});
        }});
      }catch(e){dailyBackgroundUpdate({errors:(dailyBackgroundJob.errors||0)+1,stage:'3/4 · Qualidade',message:`Qualidade não pôde ser concluída: ${safeError(e)}.`});}

      // 4) Catálogo e contabilidade são leitura/fechamento. A abertura guiada não altera remotamente sem confirmação.
      if(settings.catalogAutoGuardEnabled!==false){
        dailyBackgroundUpdate({stage:'4/4 · Verificar produto / catálogo',percent:92,message:'Conferindo pendências “Verificar produto” e elegibilidade de catálogo. Nenhuma confirmação de produto será feita sem sua ação.'});
        try{const t=await token(),me=await ML.me(t),mon=store.getMonitoring();await runCatalogGuard({source:`daily-background:${ci?.cycle||'current'}`,autoApply:false,t,me,snapshot:{rows:mon.accountInventory||[],eligible:mon.catalogEligible||[],scannedAt:mon.accountInventoryScannedAt||null,sellerId:me.id}})}catch(e){dailyBackgroundUpdate({errors:(dailyBackgroundJob.errors||0)+1,message:`Verificar produto / catálogo: ${safeError(e)}`})}
      }
      const acc=store.getAccounting(),accAge=acc?.lastSyncAt?Date.now()-new Date(acc.lastSyncAt).getTime():Infinity;
      if(ci?.cycle==='evening'||accAge>2*60*60*1000){dailyBackgroundUpdate({stage:'4/4 · Resultado financeiro',percent:96,message:'Atualizando o resultado financeiro. Isso não bloqueia as ações já liberadas.'});try{await syncAccounting(ci?.cycle==='evening'?7:1)}catch(e){dailyBackgroundUpdate({errors:(dailyBackgroundJob.errors||0)+1,message:`Contabilidade: ${safeError(e)}`})}}
      const mon=store.getMonitoring(),audit=mon.commercialAudit||{},qualityState=mon.qualityAudit||quality,attention=(audit.issues||[]).length+Number(qualityState.critical||0)+Number(qualityState.improve||0),allErrors=(audit.errors||[]).length+Number((qualityState.errors||[]).length||0);
      dailyBackgroundUpdate({status:'done',percent:100,stage:'Conta conferida',message:`Conferência concluída: ${total} anúncio(s) · ${attention} ponto(s) para sua atenção. O orientador mostrará um de cada vez.`,done:total,total,issues:attention,errors:allErrors,finishedAt:new Date().toISOString(),currentSku:''});
      await store.addJob({id:id(),type:'guided-account-audit',status:allErrors?'parcial':'sucesso',reviewed:total,total,issues:attention,source:`daily-bg:${ci?.cycle||'current'}`,at:new Date().toISOString()});
    }catch(e){dailyBackgroundUpdate({status:'error',stage:'Auditoria interrompida',message:safeError(e),error:safeError(e),finishedAt:new Date().toISOString()});}
    finally{if(dailyBackgroundPromise===task)dailyBackgroundPromise=null}
  })();
  dailyBackgroundPromise=task;return task;
}

async function executeDailyRoutine({ci,operator}){
  const errors=[],stages=[];let fastMonitoring=null;
  if(store.getTokens()){
    dailyRoutineUpdate({stage:'Sincronização rápida da conta',percent:20,message:'Lendo inventário, status e estoque por chamadas em lote.'});stages.push('Sincronização rápida da conta');
    try{fastMonitoring=await withSoftDeadline(runMonitoring({source:`daily-fast:${ci.cycle}`,mode:'fast'}),45000,'Sincronização rápida')}catch(e){errors.push({stage:'Sincronização rápida da conta',error:safeError(e)});fastMonitoring=store.getMonitoring()}
  }else errors.push({stage:'mercadolivre',error:'Mercado Livre não conectado.'});
  const inventory=Array.isArray(fastMonitoring?.accountInventory)?fastMonitoring.accountInventory:(store.getMonitoring().accountInventory||[]);
  dailyRoutineUpdate({status:'running',stage:'Painel pronto',percent:85,message:`${inventory.length} anúncio(s) disponíveis. Consolidando a próxima ação; a auditoria profunda seguirá separadamente.`});
  const state=store.getDailyOps(),day=state.days?.[ci.dayKey]||{},prev=day[ci.cycle]||{},startedAt=prev.startedAt||new Date().toISOString(),completedTasks={...(prev.completedTasks||{})};
  const mon=store.getMonitoring(),ctx={monitoring:mon,inventory:mon.accountInventory||[],products:store.getProducts(),ads:store.getAds(),promotions:store.getPromotions(),accounting:store.getAccounting(),settings:store.getSettings()};
  const tasks=DailyOps.buildTasks(ci.cycle,ctx);for(const t of tasks)if(t.autoComplete&&!completedTasks[t.key])completedTasks[t.key]={at:new Date().toISOString(),auto:true};
  const cycleState={...prev,startedAt,lastRunAt:new Date().toISOString(),operatorId:operator.id||null,operatorName:operator.name||'',completedTasks,errors,stages};
  await store.updateDailyDay(ci.dayKey,{[ci.cycle]:cycleState});await store.setDailyOps({...store.getDailyOps(),lastCycleRunAt:new Date().toISOString(),lastCycle:ci.cycle});
  if(store.getTokens()&&inventory.length)startDailyBackgroundWork({ci,inventory}).catch(()=>{});
  return {errors,stages,inventoryCount:inventory.length};
}

app.get('/api/daily-ops/run-status',(req,res)=>res.json(dailyRoutinePublic()));
app.post('/api/daily-ops/run',async(req,res)=>{
  const settings=store.getSettings(),ci=DailyOps.dueCycle(settings,store.getDailyOps()),operator=req.session?.operator||{};
  if(dailyRoutinePromise)return res.status(202).json({accepted:true,reused:true,job:dailyRoutinePublic()});
  dailyRoutineJob={status:'running',percent:1,stage:'Iniciando',message:'Atualizando apenas o necessário para liberar sua próxima ação.',startedAt:new Date().toISOString(),updatedAt:new Date().toISOString(),finishedAt:null,error:null,cycle:ci.cycle};
  let task;task=(async()=>{try{const result=await executeDailyRoutine({ci,operator});dailyRoutineUpdate({status:'done',percent:100,stage:'Painel pronto',message:`Rotina operacional pronta com ${result.inventoryCount||0} anúncio(s). Siga a próxima ação; a auditoria de fundo é independente.`,finishedAt:new Date().toISOString(),errors:result.errors,stages:result.stages});}catch(e){dailyRoutineUpdate({status:'error',stage:'Falha',message:safeError(e),error:safeError(e),finishedAt:new Date().toISOString()});}finally{if(dailyRoutinePromise===task)dailyRoutinePromise=null}})();
  dailyRoutinePromise=task;res.status(202).json({accepted:true,reused:false,job:dailyRoutinePublic()});
});
app.post('/api/daily-ops/task/complete',async(req,res)=>{
  try{const settings=store.getSettings(),ci=DailyOps.dueCycle(settings,store.getDailyOps()),key=clean(req.body?.key);if(!key)return res.status(400).json({error:'Tarefa inválida.'});
    if(key==='account-new-items'){const mon=store.getMonitoring();await store.setMonitoring({...mon,newAccountItems:[],newAccountItemsAcknowledgedAt:new Date().toISOString()});}
    const state=store.getDailyOps(),day=state.days?.[ci.dayKey]||{},prev=day[ci.cycle]||{};const completedTasks={...(prev.completedTasks||{}),[key]:{at:new Date().toISOString(),operatorId:req.session?.operator?.id||null,operatorName:req.session?.operator?.name||''}};const fresh=dailyOpsPayload(ci),requiredKeys=fresh.tasks.filter(t=>t.required!==false&&!t.autoComplete).map(t=>t.key),complete=requiredKeys.every(k=>completedTasks[k]);const cycleState={...prev,startedAt:prev.startedAt||new Date().toISOString(),completedTasks,completedAt:complete?new Date().toISOString():prev.completedAt||null,operatorId:req.session?.operator?.id||null,operatorName:req.session?.operator?.name||''};await store.updateDailyDay(ci.dayKey,{[ci.cycle]:cycleState});const out=dailyOpsPayload();out.operator=req.session?.operator||null;res.json(out)}catch(e){res.status(500).json({error:safeError(e)})}
});
app.post('/api/daily-ops/settings',async(req,res)=>{
  try{const validTime=v=>/^([01]?\d|2[0-3]):[0-5]\d$/.test(String(v||''));const current=store.getSettings();const patch={dailyGuideEnabled:req.body?.dailyGuideEnabled!==false,dailyGuidePopupsEnabled:req.body?.dailyGuidePopupsEnabled!==false};for(const [k,def] of [['dailyMorningTime','08:00'],['dailyAfternoonTime','14:00'],['dailyEveningTime','18:30']]){const v=String(req.body?.[k]??current[k]??def);if(!validTime(v))return res.status(400).json({error:`Horário inválido em ${k}.`});patch[k]=v.padStart(5,'0')}patch.dailyTimezone=clean(req.body?.dailyTimezone||current.dailyTimezone||'America/Sao_Paulo');patch.dailyNewProductGoal=Math.max(0,Math.min(50,Math.round(n(req.body?.dailyNewProductGoal,current.dailyNewProductGoal??2))));patch.dailyNewProductStretchGoal=Math.max(patch.dailyNewProductGoal,Math.min(100,Math.round(n(req.body?.dailyNewProductStretchGoal,current.dailyNewProductStretchGoal??5))));const out=await store.setSettings(patch);res.json({ok:true,settings:out})}catch(e){res.status(500).json({error:safeError(e)})}
});


app.post('/api/guide/event',async(req,res)=>{try{const op=req.session?.operator||{};const type=clean(req.body?.type||'guide-event');const entry={id:id(),type:'operator-guide',eventType:type,operatorId:op.id||null,operatorName:op.name||op.username||'',taskKey:clean(req.body?.taskKey||''),view:clean(req.body?.view||''),sku:clean(req.body?.sku||''),at:new Date().toISOString()};await store.addJob(entry);res.json({ok:true})}catch(e){res.status(500).json({error:safeError(e)})}});

app.get('/api/status',async(req,res)=>{ let connected=false,user=null,error=null; try{const t=await token(); connected=true; user=await ML.me(t);}catch(e){error=safeError(e)} const supplier=store.getSupplierCatalog(); res.json({connected,user,error,site:SITE,version:'1.8.76',livePublish:process.env.ML_LIVE_PUBLISH_ENABLED==='true',redirectUri:REDIRECT,productCount:store.getProducts().length,persistence:persistenceInfo(),database:store.getDbState?.()||null,supplierCatalog:{configured:Boolean(supplier?.products?.length),count:supplier?.products?.length||0,meta:supplier?.meta||null,persistentMaster:true,expires:false},imageAIConfigured:Boolean(process.env.OPENAI_API_KEY),autoGenerateImages:process.env.AUTO_GENERATE_IMAGES==='true',imageGenerationMode:store.getSettings().imageGenerationMode||'manual',videoVisualAIConfigured:Boolean(process.env.OPENAI_API_KEY),requireAIImages:process.env.REQUIRE_AI_IMAGES!=='false',marketProUrl:process.env.MARKETPRO_GALLERY_URL||'https://drive-vid-gallery.lovable.app/'}); });
app.get('/api/products',(req,res)=>res.json(store.getProducts()));
app.get('/api/persistence',(req,res)=>res.json({...persistenceInfo(),products:store.getProducts().length}));
app.post('/api/state/restore-products',async(req,res)=>{try{
  const current=store.getProducts(); const force=Boolean(req.body?.force); if(current.length&&!force)return res.json({ok:true,restored:0,skipped:true,reason:'Servidor já possui produtos salvos.'});
  const rows=Array.isArray(req.body?.products)?req.body.products.slice(0,250):[]; if(!rows.length)return res.status(400).json({error:'Backup local sem produtos para restaurar.'});
  const restored=rows.filter(x=>x&&x.sku).map(x=>initializeProductShape({...x,id:x.id||id(),source:'browser-recovery'},'browser-recovery'));
  await store.mergeProducts(restored,{replace:force});
  res.json({ok:true,restored:restored.length,persistence:persistenceInfo()});
}catch(e){res.status(400).json({error:safeError(e)})}});
app.post('/api/publication-guards/scan',async(req,res)=>{try{
  const ids=Array.isArray(req.body?.ids)?req.body.ids.map(String):null;
  const result=await refreshPublicationGuards({ids,remote:req.body?.remote!==false});
  res.json({ok:true,count:result.length,blocked:result.filter(x=>x.blocked).length,outOfStock:result.filter(x=>x.code==='OUT_OF_STOCK').length,alreadyPublished:result.filter(x=>String(x.code).startsWith('ALREADY_PUBLISHED')||x.code==='LINKED_EXISTING_ML').length,reconciled:result.filter(x=>x.reconciled).length,result});
}catch(e){res.status(e.status||500).json({error:safeError(e)})}});

app.post('/api/products/:id/adopt-existing',async(req,res)=>{try{
  let p=store.findProduct(req.params.id,req.params.id);if(!p)return res.status(404).json({error:'Produto não encontrado.'});
  const t=await token(),user=await ML.me(t);
  let guard=null;
  if(p.ml_item_id)guard={existingItems:[p.ml_item_id],code:'ALREADY_PUBLISHED_LOCAL'};
  else guard=await remotePublicationGuard(p,t,user.id);
  if(!Array.isArray(guard?.existingItems)||guard.existingItems.length!==1)return res.status(409).json({error:guard?.existingItems?.length>1?'Mais de um anúncio foi encontrado para esta SKU. Selecione o MLB correto manualmente.':'Nenhum anúncio único foi localizado para vincular.',guard});
  const out=await reconcileExistingPublication(p,guard,t);
  p=store.findProduct(p.id,p.sku)||p;
  if(p.ml_item_id&&store.getSettings().postPublishPipelineEnabled!==false)await buildPostPublishCorrectionPlan(p,{persist:true}).catch(()=>null);
  res.json({ok:true,reconciled:Boolean(out?.ok),partial:Boolean(out?.partial),itemId:p.ml_item_id||guard.existingItems[0],remoteStock:out?.marketStock?.quantity??null,error:out?.error||null,product:p});
}catch(e){res.status(e.status||500).json({error:safeError(e)})}});


app.get('/api/supplier-catalog/status',(req,res)=>{
  const c=store.getSupplierCatalog();
  const freshness=supplierFreshness(); res.json({configured:Boolean(c.products?.length),persistent:Boolean(process.env.DATABASE_URL),persistentMaster:true,expires:false,updatePolicy:'incremental',count:c.products?.length||0,meta:c.meta||null,freshness,remoteRefreshConfigured:Boolean(process.env.WEDROP_CATALOG_URL),history:(c.history||[]).slice(-5).reverse(),variationGroups:store.getVariationGroups().length,sample:(c.products||[]).slice(0,5).map(p=>({sku:p.sku,product:p.product,cost:p.cost,stock:p.stock,stock_quantity_known:p.stock_quantity_known,availability_status:p.availability_status,availability_raw:p.availability_raw,images:p.images?.length||0}))});
});
app.post('/api/supplier-catalog/upload',upload.single('file'),async(req,res)=>{try{
  if(!req.file)return res.status(400).json({error:'Envie o Excel/CSV mestre do fornecedor.'});
  const wb=XLSX.read(req.file.buffer,{type:'buffer'}); const chosen=SupplierCatalog.chooseCatalogSheet(wb,XLSX);
  if(!chosen.products.length)return res.status(422).json({error:'Não encontrei nenhuma coluna de SKU/código no catálogo. Envie o arquivo do fornecedor e confira o cabeçalho.'});
  const meta={sourceName:req.file.originalname,sheetName:chosen.sheetName,productCount:chosen.products.length,headers:chosen.headers,hash:SupplierCatalog.catalogHash(chosen.products),uploadedAt:new Date().toISOString()};
  await store.setSupplierCatalog(meta,chosen.products); const groups=await refreshVariationGroups();
  res.json({ok:true,persistent:Boolean(process.env.DATABASE_URL),...meta,variationGroups:groups.length,sample:chosen.products.slice(0,5).map(p=>({sku:p.sku,product:p.product,cost:p.cost,images:p.images.length}))});
}catch(e){res.status(400).json({error:safeError(e)})}});
app.post('/api/supplier-catalog/update',upload.single('file'),async(req,res)=>{try{
  if(!req.file)return res.status(400).json({error:'Envie a nova versão do catálogo WeDrop.'});
  const wb=XLSX.read(req.file.buffer,{type:'buffer'}); const chosen=SupplierCatalog.chooseCatalogSheet(wb,XLSX); if(!chosen.products.length)return res.status(422).json({error:'Não encontrei SKUs no catálogo atualizado.'});
  const current=store.getSupplierCatalog(); let mode=clean(req.body?.mode||'merge').toLowerCase(); if(!['merge','replace'].includes(mode))mode='merge'; const merged=mode==='replace'?{products:chosen.products,stats:{previous:current.products?.length||0,incoming:chosen.products.length,total:chosen.products.length,added:0,updated:0,unchanged:0,removed:Math.max(0,(current.products?.length||0)-chosen.products.length)}}:SupplierCatalog.mergeCatalog(current.products||[],chosen.products);
  const meta={sourceName:req.file.originalname,sheetName:chosen.sheetName,productCount:merged.products.length,headers:chosen.headers,hash:SupplierCatalog.catalogHash(merged.products),uploadedAt:new Date().toISOString(),updateMode:mode};
  await store.updateSupplierCatalog(meta,merged.products,merged.stats); const groups=await refreshVariationGroups();
  const cur=store.getProducts();let reconciled=0; if(cur.length){const next=cur.map(p=>{const sp=store.findSupplierSku(p.sku);if(sp){reconciled++;return initializeProductShape(SupplierCatalog.refreshFromSupplier(p,sp),'supplier-catalog');}return initializeProductShape({...p,stock:0,catalogMatch:{found:false,sku:p.sku||'',matchedAt:new Date().toISOString(),missingFromLatestSnapshot:true},status:'bloqueado-sem-estoque'},'supplier-catalog-missing');});const annotated=Variations.annotateProducts(next,groups).map(p=>({...p,publicationGuard:localPublicationGuard(p)}));await store.setProducts(annotated);await refreshPublicationGuards({ids:annotated.map(x=>x.id),remote:true});}
  res.json({ok:true,mode,stats:merged.stats,variationGroups:groups.length,reconciled,meta});
}catch(e){res.status(400).json({error:safeError(e)})}});
async function refreshSupplierFromRemote(){
  const url=clean(process.env.WEDROP_CATALOG_URL); if(!url) throw Object.assign(new Error('WEDROP_CATALOG_URL não configurada no Render.'),{status:412});
  const headers={}; if(process.env.WEDROP_CATALOG_BEARER_TOKEN)headers.Authorization=`Bearer ${process.env.WEDROP_CATALOG_BEARER_TOKEN}`;
  const r=await axios.get(url,{responseType:'arraybuffer',timeout:90000,maxContentLength:120*1024*1024,headers});
  const wb=XLSX.read(Buffer.from(r.data),{type:'buffer'}); const chosen=SupplierCatalog.chooseCatalogSheet(wb,XLSX); if(!chosen.products.length)throw new Error('O arquivo remoto não contém SKUs reconhecíveis.');
  const current=store.getSupplierCatalog(); const merged=SupplierCatalog.mergeCatalog(current.products||[],chosen.products); const meta={sourceName:'WeDrop remoto',sourceUrl:url,sheetName:chosen.sheetName,productCount:merged.products.length,headers:chosen.headers,hash:SupplierCatalog.catalogHash(merged.products),uploadedAt:new Date().toISOString(),updateMode:'merge',automatic:true};
  await store.updateSupplierCatalog(meta,merged.products,{...merged.stats,mode:'merge'}); await refreshVariationGroups();
  const cur=store.getProducts(); if(cur.length){const next=cur.map(p=>{const sp=store.findSupplierSku(p.sku);return sp?initializeProductShape(SupplierCatalog.refreshFromSupplier(p,sp),'supplier-catalog'):initializeProductShape({...p,stock:0,catalogMatch:{found:false,sku:p.sku||'',matchedAt:new Date().toISOString(),missingFromLatestSnapshot:true},status:'bloqueado-sem-estoque'},'supplier-catalog-missing')});await store.setProducts(Variations.annotateProducts(next,store.getVariationGroups()).map(p=>({...p,publicationGuard:localPublicationGuard(p)})));await refreshPublicationGuards({ids:next.map(x=>x.id),remote:true});}
  return {ok:true,count:store.getSupplierCatalog().products?.length||0,added:merged?.stats?.added||0,updated:merged?.stats?.updated||0,meta,freshness:supplierFreshness()};
}
app.post('/api/supplier-catalog/refresh-remote',async(req,res)=>{try{res.json(await refreshSupplierFromRemote())}catch(e){res.status(e.status||500).json({error:safeError(e)})}});

app.get('/api/supplier-catalog/lookup',(req,res)=>{const sku=clean(req.query.sku);if(!sku)return res.status(400).json({error:'Informe a SKU.'});const p=store.findSupplierSku(sku);if(!p)return res.status(404).json({error:'SKU não encontrada no catálogo mestre.',sku});res.json({ok:true,product:p});});
app.post('/api/supplier-catalog/reconcile',async(req,res)=>{const current=store.getProducts();let found=0;const products=current.map(p=>{const sp=store.findSupplierSku(p.sku);if(sp){found++;return initializeProductShape(SupplierCatalog.refreshFromSupplier(p,sp),'supplier-catalog');}return initializeProductShape({...p,stock:0,catalogMatch:{found:false,sku:p.sku||'',matchedAt:new Date().toISOString(),missingFromLatestSnapshot:true},status:'bloqueado-sem-estoque'},'supplier-catalog-missing')});const annotated=Variations.annotateProducts(products,store.getVariationGroups()).map(p=>({...p,publicationGuard:localPublicationGuard(p)}));await store.setProducts(annotated);const guards=await refreshPublicationGuards({ids:annotated.map(x=>x.id),remote:true});res.json({ok:true,count:annotated.length,found,missing:annotated.length-found,guards:{blocked:guards.filter(x=>x.blocked).length,outOfStock:guards.filter(x=>x.code==='OUT_OF_STOCK').length,alreadyPublished:guards.filter(x=>String(x.code).startsWith('ALREADY_PUBLISHED')).length}});});
app.get('/api/variations/groups',(req,res)=>res.json({groups:store.getVariationGroups(),count:store.getVariationGroups().length}));
app.post('/api/variations/detect',async(req,res)=>{try{const groups=await refreshVariationGroups();res.json({ok:true,count:groups.length,groups});}catch(e){res.status(500).json({error:safeError(e)})}});
app.post('/api/variations/:groupId/prepare',async(req,res)=>{try{const group=store.getVariationGroups().find(x=>x.id===req.params.groupId);if(!group)return res.status(404).json({error:'Grupo de variação não encontrado'});const t=await token();const user=await ML.me(t);const mode=(user.tags||[]).includes('user_product_seller')?'user_products':'legacy_variations';let categoryId='';try{categoryId=(await ML.categoryPredictor(t,group.familyName))?.[0]?.category_id||'';}catch{}let attrs=[];if(categoryId)try{attrs=await ML.categoryAttributes(t,categoryId)}catch{}const allowed=new Map(attrs.filter(a=>a.tags?.allow_variations||a.hierarchy==='CHILD_PK').map(a=>[a.id,a]));const variants=group.variants.map(v=>({...v,attrs:v.attrs.filter(a=>allowed.has(a.id)||['COLOR','SIZE','VOLTAGE'].includes(a.id))}));const preview={mode,userProductSeller:mode==='user_products',familyName:group.familyName,categoryId,attributes:[...allowed.keys()],variants};res.json({ok:true,preview,note:mode==='user_products'?'Cada variante será publicada como User Product da mesma família, com family_name comum e atributos CHILD_PK.':'O seller ainda usa modelo legado: será necessária publicação com array variations e imagens por variação.'});}catch(e){res.status(500).json({error:safeError(e)})}});
app.get('/api/opportunities',(req,res)=>res.json(store.getOpportunityScan()));
app.post('/api/opportunities/scan',async(req,res)=>{try{const limit=Math.min(50,Math.max(1,n(req.body?.limit,10))),offset=Math.max(0,n(req.body?.offset,0));const catalog=store.getSupplierCatalog();if(!catalog.products?.length)return res.status(412).json({error:'Cadastre o catálogo WeDrop primeiro.'});const t=await token(),user=await ML.me(t),settings=store.getSettings();const targets=catalog.products.slice(offset,offset+limit);const results=[];for(const sp of targets){try{results.push(await scanOpportunityProduct(sp,t,user,settings));}catch(e){results.push({sku:sp.sku,product:sp.product,cost:n(sp.cost),score:0,status:'ERRO NA ANÁLISE',error:safeError(e),marketPrice:0,estimatedProfit:0,estimatedMargin:0})}}await store.saveMarketSnapshots();results.sort((a,b)=>n(b.score)-n(a.score)||n(b.estimatedProfit)-n(a.estimatedProfit));const shortlist=Opportunity.shortlist(results,{minScore:45});const scan={scannedAt:new Date().toISOString(),offset,limit,count:results.length,totalCatalog:catalog.products.length,matchedCount:results.filter(x=>n(x.marketPrice)>0).length,opportunityCount:shortlist.length,highOpportunityCount:results.filter(x=>n(x.score)>=65&&n(x.marketPrice)>0).length,errorCount:results.filter(x=>x.error).length,results,shortlist};await store.setOpportunityScan(scan);res.json(scan);}catch(e){res.status(500).json({error:safeError(e)})}});
app.post('/api/opportunities/import',async(req,res)=>{try{const skus=SupplierCatalog.parseSkuText(req.body?.skus||[]);if(!skus.length)return res.status(400).json({error:'Selecione SKUs do Scanner.'});let found=0;const products=skus.map((sku,i)=>{const sp=store.findSupplierSku(sku);if(sp)found++;const opp=(store.getOpportunityScan().results||[]).find(x=>String(x.sku)===String(sku));return importSkuPreservingProgress(sku,i,{marketOpportunity:opp||undefined,status:sp?'selecionado-pelo-scanner':'sku-nao-encontrada'});});const groups=store.getVariationGroups();const annotated=Variations.annotateProducts(products,groups).map(p=>({...p,publicationGuard:localPublicationGuard(p)}));await store.mergeProducts(annotated);const mergedIds=annotated.map(a=>store.findProduct('',a.sku)?.id||a.id);const guardResult=await refreshPublicationGuards({ids:mergedIds,remote:true});const autoImages=queueAutoImages(store.getProducts().filter(x=>mergedIds.includes(x.id)&&!x.publicationGuard?.blocked));res.json({ok:true,count:annotated.length,found,autoImages,preservedProgress:true,guards:{blocked:guardResult.filter(x=>x.blocked).length,outOfStock:guardResult.filter(x=>x.code==='OUT_OF_STOCK').length,alreadyPublished:guardResult.filter(x=>String(x.code).startsWith('ALREADY_PUBLISHED')).length},products:store.getProducts()});}catch(e){res.status(400).json({error:safeError(e)})}});
app.get('/api/kits/suggestions',(req,res)=>res.json({items:store.getKitSuggestions(),count:store.getKitSuggestions().length}));
app.post('/api/kits/generate',async(req,res)=>{try{const items=await buildKitSuggestions(Math.min(20,Math.max(1,n(req.body?.limit,10))));res.json({ok:true,count:items.length,items});}catch(e){res.status(500).json({error:safeError(e)})}});
app.post('/api/kits/:id/publish',async(req,res)=>{try{const k=store.getKitSuggestions().find(x=>x.id===req.params.id);if(!k)return res.status(404).json({error:'Sugestão de kit não encontrada'});if(!k.viable)return res.status(422).json({error:'Kit não aprovado pela análise de margem/risco.'});const components=k.components||[];if(components.length<2||components.length>6)return res.status(422).json({error:'Kit precisa ter de 2 a 6 componentes.'});if(components.some(x=>!x.user_product_id))return res.status(422).json({error:'Publique primeiro os componentes individuais e sincronize seus user_product_id antes de criar o kit virtual.'});const payload={family_name:`Kit ${components.map(x=>x.product).join(' + ')}`.slice(0,120),channels:['marketplace'],currency_id:'BRL',listing_type_id:'gold_special',price:k.scenario?.price||k.marketKitPrice,bundle:{type:'kit',components:components.map(x=>({type:'user_product',user_product_id:x.user_product_id,quantity:1,automatic_price:null}))}};if(process.env.ML_LIVE_PUBLISH_ENABLED!=='true')return res.json({ok:true,mode:'simulation',payload});const t=await token();const created=await ML.createKit(t,payload);res.json({ok:true,mode:'live',created});}catch(e){res.status(e.status||500).json({error:safeError(e),details:e.response?.data})}});

app.post('/api/import/skus',async(req,res)=>{try{
  const skus=SupplierCatalog.parseSkuText(req.body?.skus||req.body?.items||[]); if(!skus.length)return res.status(400).json({error:'Informe pelo menos uma SKU.'});
  const c=store.getSupplierCatalog(); if(!c.products?.length)return res.status(412).json({error:'Cadastre primeiro o Excel mestre do fornecedor em Catálogo fornecedor.'});
  let found=0; const missing=[]; const products=skus.map((sku,i)=>{const supplier=store.findSupplierSku(sku);if(supplier)found++;else missing.push(sku);return importSkuPreservingProgress(sku,i);});
  const annotated=Variations.annotateProducts(products,store.getVariationGroups()).map(p=>({...p,publicationGuard:localPublicationGuard(p)})); await store.mergeProducts(annotated);
  const mergedIds=annotated.map(a=>store.findProduct('',a.sku)?.id||a.id); const guardResult=await refreshPublicationGuards({ids:mergedIds,remote:true}); const autoImages=queueAutoImages(store.getProducts().filter(x=>mergedIds.includes(x.id)&&!x.publicationGuard?.blocked));
  res.json({ok:true,count:annotated.length,found,missing:missing.length,missingSkus:missing,autoImages,preservedProgress:true,guards:{blocked:guardResult.filter(x=>x.blocked).length,outOfStock:guardResult.filter(x=>x.code==='OUT_OF_STOCK').length,alreadyPublished:guardResult.filter(x=>String(x.code).startsWith('ALREADY_PUBLISHED')).length},products:store.getProducts()});
}catch(e){res.status(400).json({error:safeError(e)})}});
app.post('/api/import',upload.single('file'),async(req,res)=>{ try{if(!req.file) return res.status(400).json({error:'Envie um arquivo CSV ou XLSX.'}); const wb=XLSX.read(req.file.buffer,{type:'buffer'}); const rows=XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]],{defval:''}); let found=0;const missing=[];const products=rows.map((row,i)=>{const base=normalizeRow(row,i);const supplier=base.sku?store.findSupplierSku(base.sku):null;if(supplier)found++;else if(base.sku)missing.push(base.sku);return initializeProductShape(SupplierCatalog.mergeIntoProduct(base,supplier),supplier?'supplier-catalog':'import')}); const annotated=Variations.annotateProducts(products,store.getVariationGroups()).map(p=>({...p,publicationGuard:localPublicationGuard(p)})); await store.mergeProducts(annotated); const mergedIds=annotated.map(a=>store.findProduct('',a.sku)?.id||a.id); const guardResult=await refreshPublicationGuards({ids:mergedIds,remote:true}); const autoImages=queueAutoImages(store.getProducts().filter(x=>mergedIds.includes(x.id)&&!x.publicationGuard?.blocked)); res.json({ok:true,count:annotated.length,catalogMatches:found,preservedProgress:true,catalogMissing:missing.length,missingSkus:missing,autoImages,guards:{blocked:guardResult.filter(x=>x.blocked).length,outOfStock:guardResult.filter(x=>x.code==='OUT_OF_STOCK').length,alreadyPublished:guardResult.filter(x=>String(x.code).startsWith('ALREADY_PUBLISHED')).length},products:store.getProducts()});}catch(e){res.status(400).json({error:safeError(e)})} });
app.post('/api/products/:id/enrich',async(req,res)=>{
  try{
    const p=productRefFromReq(req);
    if(!p)return res.status(404).json({error:'Produto não encontrado'});
    const patch=await enrichProduct(p,req.body||{});
    const merged={...p,...patch};
    const q=quality(merged);
    const readiness=productReadiness({...merged,quality:q});
    const out=await store.updateProduct(p.id,{...patch,quality:q,readiness});
    res.json(out);
  }catch(e){res.status(e.status||500).json({error:safeError(e),details:e.response?.data})}
});
app.post('/api/products/:id/supplier-details/parse',async(req,res)=>{
  try{
    const p=productRefFromReq(req);if(!p)return res.status(404).json({error:'Produto não encontrado'});
    const text=String(req.body?.text||'');if(text.trim().length<30)return res.status(400).json({error:'Copie o conteúdo da página do produto na WeDrop e tente novamente.'});
    const parsed=SupplierCatalog.parseSupplierDetailText(text);
    if(!parsed.found?.length)return res.status(422).json({error:'Não encontrei especificações reconhecíveis no texto copiado. Copie a área que contém Itens inclusos e Especificações.'});
    const supplierAttributes={...(p.supplierAttributes||{}),...(parsed.supplierAttributes||{})};
    let base={...p,...parsed.patch,supplierAttributes};
    // Se a descrição era automática, permite reconstruí-la com os novos dados do fornecedor. Descrição editada pelo usuário nunca é apagada.
    if(!p.descriptionLocked){base.description='';base.descriptionSource='auto';}
    let patch={...parsed.patch,supplierAttributes};
    try{const enriched=await enrichProduct(base,{});patch={...patch,...enriched,supplierAttributes};}catch(_){patch.description=base.description||SEO.buildDescription({...base,description:''});}
    const merged={...p,...patch,supplierAttributes};patch.technicalCoverage=technicalCoverage(merged);patch.publicationAudit=publicationFieldAudit({...merged,technicalCoverage:patch.technicalCoverage});patch.mlFormSchema=buildMlFormSchema({...merged,...patch});patch.quality=quality({...merged,...patch});patch.readiness=productReadiness({...merged,...patch,quality:patch.quality});
    const out=await store.updateProduct(p.id,patch);res.json({ok:true,found:parsed.found,product:out});
  }catch(e){res.status(e.status||500).json({error:safeError(e),details:e.response?.data})}
});

app.post('/api/products/:id/supplier-details/vision',imageUpload.single('image'),async(req,res)=>{
  try{
    const p=productRefFromReq(req);if(!p)return res.status(404).json({error:'Produto não encontrado'});
    const text=String(req.body?.text||'');
    if(!req.file&&text.trim().length<30)return res.status(400).json({error:'Envie um print da WeDrop e/ou cole a descrição/especificações do fornecedor.'});
    let parsedText={patch:{},supplierAttributes:{},found:[]};if(text.trim().length>=20)parsedText=SupplierCatalog.parseSupplierDetailText(text);
    let vision={};if(req.file){vision=await SupplierVision.extract({buffer:req.file.buffer,mimetype:req.file.mimetype,text,product:p});}
    const fromVision=supplierVisionPatch(vision);
    const patch0={...parsedText.patch,...fromVision.patch};
    const supplierAttributes={...(p.supplierAttributes||{}),...(parsedText.supplierAttributes||{}),...(fromVision.supplierAttributes||{})};
    const fields=[...new Set([...(parsedText.found||[]),...(fromVision.found||[])])];
    let base={...p,...patch0,supplierAttributes};if(!p.descriptionLocked){base.description='';base.descriptionSource='auto';}
    let patch={...patch0,supplierAttributes,supplierDetailCapture:{source:req.file?'WeDrop · print + descrição':'WeDrop · descrição',capturedAt:new Date().toISOString(),fields,evidence:Array.isArray(vision.evidence)?vision.evidence.slice(0,12):[],shippingDimensionsSource:clean(vision.shipping_dimensions_source)}};
    try{const enriched=await enrichProduct(base,{});patch={...patch,...enriched,supplierAttributes,supplierDetailCapture:patch.supplierDetailCapture};}catch(_){patch.description=base.description||SEO.buildDescription({...base,description:''});}
    // Dados logísticos extraídos da WeDrop prevalecem sobre enriquecimentos posteriores.
    for(const f of ['height_cm','width_cm','length_cm','diameter_cm','weight_g'])if(n(patch0[f],0)>0)patch[f]=f==='weight_g'?Math.round(n(patch0[f],0)):n(patch0[f],0);
    if(patch.height_cm&&patch.width_cm&&patch.length_cm)patch.dimensions=`${patch.height_cm} cm altura x ${patch.width_cm} cm largura x ${patch.length_cm} cm comprimento`;
    const freightChanged=['height_cm','width_cm','length_cm','weight_g'].some(f=>n(patch[f],0)>0&&n(patch[f],0)!==n(p[f],0));
    if(freightChanged&&p.commercialAnalysis)patch.commercialAnalysis={...p.commercialAnalysis,shippingComplete:false,shippingStale:true,shippingStaleAt:new Date().toISOString()};
    const merged={...p,...patch,supplierAttributes};patch.technicalCoverage=technicalCoverage(merged);patch.publicationAudit=publicationFieldAudit({...merged,technicalCoverage:patch.technicalCoverage});patch.mlFormSchema=buildMlFormSchema({...merged,...patch});patch.quality=quality({...merged,...patch});patch.readiness=productReadiness({...merged,...patch,quality:patch.quality});
    const out=await store.updateProduct(p.id,patch);res.json({ok:true,found:fields,visionUsed:Boolean(req.file),extracted:vision,product:out});
  }catch(e){res.status(e.status||500).json({error:safeError(e),details:e.response?.data})}
});

app.post('/api/products/:id/resolve',async(req,res)=>{
  try{
    const p=productRefFromReq(req); if(!p)return res.status(404).json({error:'Produto não encontrado'});
    const allowed=['product','gtin','brand','model','category_id','seoTitle','seoModelExpanded','dimensions','height_cm','width_cm','length_cm','diameter_cm','weight_g']; const manual={};
    for(const f of allowed){if(req.body?.[f]!==undefined)manual[f]=clean(req.body[f]);}
    for(const f of ['height_cm','width_cm','length_cm','diameter_cm','weight_g']){if(req.body?.[f]!==undefined){const val=n(req.body[f],0);manual[f]=val>0?(f==='weight_g'?Math.round(val):val):'';}}
    if(manual.height_cm&&manual.width_cm&&manual.length_cm)manual.dimensions=`${manual.height_cm} cm altura x ${manual.width_cm} cm largura x ${manual.length_cm} cm comprimento`;
    if(req.body?.description!==undefined){manual.description=preserveMultiline(req.body.description);manual.descriptionLocked=true;manual.descriptionSource='manual';}
    if(req.body?.regenerateDescription===true){manual.description='';manual.descriptionLocked=false;manual.descriptionSource='auto';}
    if(manual.model)manual.modelVerified=true;
    const listingInput=req.body?.listingProfile&&typeof req.body.listingProfile==='object'?req.body.listingProfile:{};
    const listingProfile={...(p.listingProfile||{condition:'new',local_pick_up:false})};
    if(listingInput.condition!==undefined)listingProfile.condition=clean(listingInput.condition)||'new';if(listingInput.local_pick_up!==undefined)listingProfile.local_pick_up=Boolean(listingInput.local_pick_up);
    const incomingAttrs=req.body?.attributes&&typeof req.body.attributes==='object'?req.body.attributes:{};
    const manualAttributes={...(p.manualAttributes||{})}; for(const [k,v] of Object.entries(incomingAttrs)){const cv=clean(v);if(cv)manualAttributes[clean(k)]=cv;else delete manualAttributes[clean(k)];}
    const incomingSale=req.body?.saleTerms&&typeof req.body.saleTerms==='object'?req.body.saleTerms:{};
    const manualSaleTerms={...(p.manualSaleTerms||{})};for(const [k,v] of Object.entries(incomingSale)){const cv=clean(v);if(cv)manualSaleTerms[clean(k)]=cv;else delete manualSaleTerms[clean(k)];}
    const regenerateDescription=req.body?.regenerateDescription===true;
    const base={...p,...manual,listingProfile,manualAttributes,manualSaleTerms};
    const enriched=await enrichProduct(base,{});
    // Em regeneração, a descrição criada no enrichProduct deve prevalecer. Antes, manual.description=''
    // sobrescrevia o texto recém-gerado e o campo voltava vazio na tela.
    const manualWithoutDescription={...manual};delete manualWithoutDescription.description;delete manualWithoutDescription.descriptionLocked;delete manualWithoutDescription.descriptionSource;
    const finalPatch={...enriched,...(regenerateDescription?manualWithoutDescription:manual),listingProfile,manualAttributes,manualSaleTerms,attributeValues:{...(enriched.attributeValues||{}),...manualAttributes},saleTermValues:{...(enriched.saleTermValues||{}),...manualSaleTerms}};
    if(manual.seoTitle)finalPatch.seoTitle=manual.seoTitle.slice(0,n(enriched.titleMaxLength,60)||60);
    if(manual.seoModelExpanded)finalPatch.seoModelExpanded=manual.seoModelExpanded.slice(0,n(enriched.modelMaxLength,120)||120);
    if(regenerateDescription){
      finalPatch.description=preserveMultiline(enriched.description)||SEO.buildDescription({...base,...enriched,description:'',descriptionLocked:false,descriptionSource:'auto'});
      finalPatch.descriptionLocked=false;finalPatch.descriptionSource='auto';finalPatch.descriptionVersion=2;
    }else if(req.body?.description!==undefined){
      finalPatch.description=preserveMultiline(req.body.description);finalPatch.descriptionLocked=true;finalPatch.descriptionSource='manual';finalPatch.descriptionVersion=2;
    }
    const freightChanged=['height_cm','width_cm','length_cm','weight_g'].some(f=>req.body?.[f]!==undefined&&n(finalPatch[f],0)!==n(p[f],0));
    if(freightChanged&&p.commercialAnalysis)finalPatch.commercialAnalysis={...p.commercialAnalysis,shippingComplete:false,shippingStale:true,shippingStaleAt:new Date().toISOString()};
    finalPatch.attributeSources={...(enriched.attributeSources||p.attributeSources||{})};for(const aid of Object.keys(manualAttributes))finalPatch.attributeSources[aid]='Manual';
    const merged={...p,...finalPatch};finalPatch.technicalCoverage=technicalCoverage(merged);finalPatch.publicationAudit=publicationFieldAudit({...merged,technicalCoverage:finalPatch.technicalCoverage});finalPatch.mlFormSchema=buildMlFormSchema({...merged,...finalPatch});finalPatch.quality=quality({...merged,...finalPatch});finalPatch.readiness=productReadiness({...merged,...finalPatch,quality:finalPatch.quality});
    const out=await store.updateProduct(p.id,finalPatch);res.json(out);
  }catch(e){res.status(e.status||500).json({error:safeError(e),details:e.response?.data})}
});
app.get('/api/products/:id/images/plan',(req,res)=>{const p=productRefFromReq(req);if(!p)return res.status(404).json({error:'Produto não encontrado'});res.json({plan:ImageStudio.plan(p),imageStudio:p.imageStudio||null});});
app.post('/api/products/:id/images/generate',async(req,res)=>{const p=productRefFromReq(req);if(!p)return res.status(404).json({error:'Produto não encontrado'});if(!process.env.OPENAI_API_KEY)return res.status(503).json({error:'Configure OPENAI_API_KEY no Render.'});enqueueImages(p.id,'manual');await store.updateProduct(p.id,{imageStudio:{...(p.imageStudio||{}),status:'queued',approvedCount:p.imageStudio?.approvedCount||0,total:9,items:p.imageStudio?.items||[],queuedAt:new Date().toISOString()}});res.json({ok:true,status:'queued'});});
app.post('/api/images/generate-all',async(req,res)=>{if(!process.env.OPENAI_API_KEY)return res.status(503).json({error:'Configure OPENAI_API_KEY no Render.'});const targets=store.getProducts().filter(p=>(p.images||[]).length>0&&!localPublicationGuard(p).blocked&&!p.publicationGuard?.blocked);targets.forEach(p=>enqueueImages(p.id,'manual-batch'));res.json({ok:true,queued:targets.length,skipped:store.getProducts().length-targets.length});});

app.get('/api/products/:id/images/manual-prompts',(req,res)=>{const p=productRefFromReq(req);if(!p)return res.status(404).json({error:'Produto não encontrado'});res.json({ok:true,sku:p.sku,title:p.seoTitle||p.product,prompts:ImageStudio.manualPromptText(p),plan:ImageStudio.plan(p).map(x=>({slot:x.slot,title:x.title,overlay:x.overlay||[],requiresPackaging:Boolean(x.requiresPackaging)}))});});

app.post('/api/products/:id/images/manual',imageUpload.array('files',9),async(req,res)=>{try{const p=productRefFromReq(req);if(!p)return res.status(404).json({error:'Produto não encontrado'});if(!req.files?.length)return res.status(400).json({error:'Selecione pelo menos uma imagem.'});const requestedSlots=String(req.body?.slots||'').split(',').map(x=>Number(x)).filter(x=>x>=1&&x<=9);const files=[...req.files].sort((a,b)=>String(a.originalname||'').localeCompare(String(b.originalname||''),undefined,{numeric:true}));const current=store.getProducts().find(x=>x.id===p.id)||p;let items=[...(current.imageStudio?.items||[])];const saved=[];for(let i=0;i<files.length;i++){let slot=requestedSlots[i];if(!slot){const m=String(files[i].originalname||'').match(/(?:^|[^0-9])0?([1-9])(?:[^0-9]|$)/);slot=m?Number(m[1]):i+1;}if(slot<1||slot>9)continue;const item=await ImageStudio.saveManualImage(current,files[i].buffer,slot);items=items.filter(x=>x.slot!==slot).concat(item).sort((a,b)=>a.slot-b.slot);saved.push(item);}const approvedCount=items.filter(x=>x.status==='approved').length;const studioStatus=approvedCount===9?'approved':'review';const generatedImages=items.filter(x=>x.status==='approved'&&x.path).sort((a,b)=>a.slot-b.slot).map(x=>`${BASE}${x.path}`);const merged={...current,imageStudio:{...(current.imageStudio||{}),status:studioStatus,approvedCount,total:9,items,mode:'manual',updatedAt:new Date().toISOString()},generatedImages};const q=quality(merged);const readiness=productReadiness({...merged,quality:q});await store.updateProduct(current.id,{imageStudio:merged.imageStudio,generatedImages,quality:q,readiness,imageGenerationMode:'manual'});await store.addJob({id:id(),type:'manual-images',status:'revisar',sku:current.sku,statusDetail:`${saved.length} imagem(ns) enviada(s) para revisão manual`,at:new Date().toISOString()});res.json({ok:true,saved:saved.length,approvedCount,items});}catch(e){res.status(400).json({error:safeError(e)})}});

app.post('/api/products/:id/images/swap',async(req,res)=>{try{
  const p=productRefFromReq(req);if(!p)return res.status(404).json({error:'Produto não encontrado'});
  const fromSlot=Number(req.body?.fromSlot),toSlot=Number(req.body?.toSlot);
  if(!Number.isInteger(fromSlot)||!Number.isInteger(toSlot)||fromSlot<1||fromSlot>9||toSlot<1||toSlot>9)return res.status(400).json({error:'Posições inválidas. Use números de 1 a 9.'});
  if(fromSlot===toSlot)return res.json({ok:true,noChange:true,approvedCount:p.imageStudio?.approvedCount||0});
  let items=[...(p.imageStudio?.items||[])];
  const from=items.find(x=>Number(x.slot)===fromSlot),to=items.find(x=>Number(x.slot)===toSlot);
  if(!from)return res.status(404).json({error:`Não existe foto na posição ${String(fromSlot).padStart(2,'0')}.`});
  items=items.filter(x=>Number(x.slot)!==fromSlot&&Number(x.slot)!==toSlot);
  items.push({...from,slot:toSlot,reorderedAt:new Date().toISOString()});
  let movedOnly=true;
  if(to){items.push({...to,slot:fromSlot,reorderedAt:new Date().toISOString()});movedOnly=false;}
  items.sort((a,b)=>Number(a.slot)-Number(b.slot));
  const approvedCount=items.filter(x=>x.status==='approved').length;
  const studioStatus=approvedCount===9?'approved':items.length?'review':'pending';
  const generatedImages=items.filter(x=>x.status==='approved'&&x.path).sort((a,b)=>a.slot-b.slot).map(x=>`${BASE}${x.path}`);
  const merged={...p,imageStudio:{...(p.imageStudio||{}),status:studioStatus,approvedCount,total:9,items,updatedAt:new Date().toISOString()},generatedImages};
  const q=quality(merged);const readiness=productReadiness({...merged,quality:q});
  await store.updateProduct(p.id,{imageStudio:merged.imageStudio,generatedImages,quality:q,readiness});
  await store.addJob({id:id(),type:'image-reorder',status:'concluido',sku:p.sku,statusDetail:movedOnly?`Foto ${fromSlot} movida para ${toSlot}`:`Fotos ${fromSlot} e ${toSlot} trocaram de posição`,at:new Date().toISOString()});
  res.json({ok:true,fromSlot,toSlot,movedOnly,approvedCount,items});
}catch(e){res.status(400).json({error:safeError(e)})}});

app.post('/api/products/:id/images/manual/approve',async(req,res)=>{try{const p=productRefFromReq(req);if(!p)return res.status(404).json({error:'Produto não encontrado'});const requested=Array.isArray(req.body?.slots)?req.body.slots.map(Number).filter(x=>x>=1&&x<=9):[];const approveAll=Boolean(req.body?.all);let items=(p.imageStudio?.items||[]).map(x=>{if(x.source!=='manual-chatgpt-plus'||!x.path)return x;if(approveAll||requested.includes(Number(x.slot)))return {...x,status:'approved',approvedAt:new Date().toISOString(),fidelity:{score:'manual',pass:true,manualReview:true,issues:[]}};return x;});const approvedCount=items.filter(x=>x.status==='approved').length;const studioStatus=approvedCount===9?'approved':'review';const generatedImages=items.filter(x=>x.status==='approved'&&x.path).sort((a,b)=>a.slot-b.slot).map(x=>`${BASE}${x.path}`);const merged={...p,imageStudio:{...(p.imageStudio||{}),status:studioStatus,approvedCount,total:9,items,mode:'manual',updatedAt:new Date().toISOString()},generatedImages,status:approvedCount===9?'fotos-prontas':p.status};const q=quality(merged);const readiness=productReadiness({...merged,quality:q});const out=await store.updateProduct(p.id,{imageStudio:merged.imageStudio,generatedImages,status:merged.status,quality:q,readiness,imageGenerationMode:'manual'});res.json({ok:true,approvedCount,imageStudio:out.imageStudio});}catch(e){res.status(400).json({error:safeError(e)})}});

app.delete('/api/products/:id/images/manual/:slot',async(req,res)=>{try{const p=productRefFromReq(req);if(!p)return res.status(404).json({error:'Produto não encontrado'});const slot=Number(req.params.slot);let items=(p.imageStudio?.items||[]).filter(x=>Number(x.slot)!==slot);const approvedCount=items.filter(x=>x.status==='approved').length;const generatedImages=items.filter(x=>x.status==='approved'&&x.path).sort((a,b)=>a.slot-b.slot).map(x=>`${BASE}${x.path}`);const studioStatus=approvedCount===9?'approved':items.length?'review':'pending';const merged={...p,imageStudio:{...(p.imageStudio||{}),status:studioStatus,approvedCount,total:9,items,mode:'manual',updatedAt:new Date().toISOString()},generatedImages};const q=quality(merged);const readiness=productReadiness({...merged,quality:q});await store.updateProduct(p.id,{imageStudio:merged.imageStudio,generatedImages,quality:q,readiness});res.json({ok:true,approvedCount});}catch(e){res.status(400).json({error:safeError(e)})}});

app.get('/api/commercial/context',async(req,res)=>{try{const t=await token();const settings=store.getSettings();const user=await ML.me(t);const origin=await resolveCommercialOrigin(t,user,settings,{});res.json({origin,automaticLogistics:true,flexActivationAutomatic:false});}catch(e){res.status(e.status||500).json({error:safeError(e)})}});
app.post('/api/products/:id/commercial-analyze',async(req,res)=>{try{const p=productRefFromReq(req);if(!p)return res.status(404).json({error:'Produto não encontrado'});const result=await analyzeCommercial(p,req.body||{});const current=store.getProducts().find(x=>x.id===p.id)||p;const patch=commercialPatchFromResult(p,result);const merged={...current,...patch};patch.quality=quality(merged);patch.readiness=productReadiness({...merged,quality:patch.quality});await store.updateProduct(p.id,patch);res.json(result);}catch(e){res.status(e.status||500).json({error:safeError(e),details:e.response?.data})}});
app.get('/api/products/:id/price-preview',(req,res)=>{const p=productRefFromReq(req);if(!p)return res.status(404).json({error:'Produto não encontrado'});const rec=p.priceRecommendation||p.commercialAnalysis?.pricingRecommendation;if(!rec)return res.status(412).json({error:'Execute primeiro a análise comercial automática.'});const margin=CE.clampPct(req.query.margin!=null?req.query.margin:rec.targetMargin,5,70);res.json({ok:true,preview:CE.previewFromRecommendation(rec,margin),sku:p.sku});});
app.post('/api/commercial/analyze-all',async(req,res)=>{const limit=Math.min(10,Math.max(1,n(req.body?.limit,5)));const targets=store.getProducts().filter(p=>!localPublicationGuard(p).blocked&&!p.publicationGuard?.blocked).slice(0,limit);const result=[];for(const p of targets){try{const analysis=await analyzeCommercial(p,{});const current=store.getProducts().find(x=>x.id===p.id)||p;const patch=commercialPatchFromResult(p,analysis);const merged={...current,...patch};patch.quality=quality(merged);patch.readiness=productReadiness({...merged,quality:patch.quality});await store.updateProduct(p.id,patch);result.push({id:p.id,sku:p.sku,ok:true,grossUploadPrice:patch.priceRecommendation?.grossUploadPrice,adsPotential:patch.adsRecommendation?.score});}catch(e){result.push({id:p.id,sku:p.sku,ok:false,error:safeError(e)})}}res.json({ok:true,count:result.length,result});});
app.post('/api/products/:id/analyze',async(req,res)=>{try{const p=productRefFromReq(req);if(!p)return res.status(404).json({error:'Produto não encontrado'});const result=await analyzeCommercial(p,req.body||{});const current=store.getProducts().find(x=>x.id===p.id)||p;const patch=commercialPatchFromResult(p,result);const merged={...current,...patch};patch.quality=quality(merged);patch.readiness=productReadiness({...merged,quality:patch.quality});await store.updateProduct(p.id,patch);res.json(result);}catch(e){res.status(e.status||500).json({error:safeError(e),details:e.response?.data})}});

app.get('/api/products/:id/video/search',async(req,res)=>{try{const p=productRefFromReq(req);if(!p)return res.status(404).json({error:'Produto não encontrado'});const q=clean(req.query.q||'');const data=await MarketPro.search(p,q);res.json({ok:true,product:{id:p.id,sku:p.sku,title:p.product||p.seoTitle,referenceImages:(p.images||[]).slice(0,3)},visualAIConfigured:Boolean(process.env.OPENAI_API_KEY),...data});}catch(e){res.status(500).json({error:safeError(e)})}});
app.post('/api/products/:id/video/visual-match',async(req,res)=>{try{const p=productRefFromReq(req);if(!p)return res.status(404).json({error:'Produto não encontrado'});const candidates=Array.isArray(req.body?.candidates)?req.body.candidates:[];const results=await VideoMatcher.analyze(p,candidates);res.json({ok:true,results});}catch(e){res.status(e.status||500).json({error:safeError(e)})}});
app.post('/api/products/:id/video/upload',videoUpload.single('video'),async(req,res)=>{try{const p=productRefFromReq(req);if(!p)return res.status(404).json({error:'Produto não encontrado'});if(!req.file?.buffer)return res.status(400).json({error:'Selecione um arquivo de vídeo.'});const ext=/quicktime/i.test(req.file.mimetype||'')?'mov':'mp4';const safeSku=clean(p.sku||p.id).replace(/[^A-Za-z0-9_-]+/g,'-').slice(0,70)||'produto';const name=`${safeSku}-${Date.now()}-${crypto.randomBytes(3).toString('hex')}.${ext}`;fs.writeFileSync(path.join(MANUAL_VIDEO_DIR,name),req.file.buffer);const video_url=`/generated/manual-videos/${name}`;const manualVideo={source:'manual-upload',name:req.file.originalname||name,size:req.file.size,mimetype:req.file.mimetype||'video/mp4',uploadedAt:new Date().toISOString(),path:video_url};const merged={...p,video_url,manualVideo,videoReviewed:true,marketproVideo:null};const q=quality(merged);await store.updateProduct(p.id,{video_url,manualVideo,videoReviewed:true,marketproVideo:null,quality:q,readiness:productReadiness({...merged,quality:q})});res.json({ok:true,video:manualVideo,video_url});}catch(e){res.status(500).json({error:safeError(e)})}});
app.post('/api/products/:id/video/select',async(req,res)=>{const p=productRefFromReq(req);if(!p)return res.status(404).json({error:'Produto não encontrado'});const v=req.body||{};if(!v.id||!v.title)return res.status(400).json({error:'Selecione um vídeo válido.'});const selected={id:String(v.id),title:clean(v.title),score:n(v.score),selectedAt:new Date().toISOString(),streamUrl:`${BASE}/api/marketpro/video?id=${encodeURIComponent(v.id)}`};const merged={...p,marketproVideo:selected,videoReviewed:true};const q=quality(merged);const patch={marketproVideo:selected,video_url:'',manualVideo:null,videoReviewed:true,quality:q,readiness:productReadiness({...merged,video_url:'',manualVideo:null,quality:q})};await store.updateProduct(p.id,patch);res.json({ok:true,video:selected});});
app.post('/api/products/:id/video/review',async(req,res)=>{const p=productRefFromReq(req);if(!p)return res.status(404).json({error:'Produto não encontrado'});const videoReviewed=Boolean(req.body?.reviewed);const merged={...p,videoReviewed};const q=quality(merged);const out=await store.updateProduct(p.id,{videoReviewed,quality:q,readiness:productReadiness({...merged,quality:q})});res.json(out);});
app.get('/api/marketpro/video',async(req,res)=>{try{const vid=String(req.query.id||'');if(!/^[A-Za-z0-9_-]{8,200}$/.test(vid))return res.status(400).json({error:'ID de vídeo inválido.'});await MarketPro.stream(vid,String(req.headers.range||''),res);}catch(e){if(!res.headersSent)res.status(400).json({error:safeError(e)})}});

app.post('/api/products/:id/publish',async(req,res)=>{ try{
  let p=productRefFromReq(req); if(!p)return res.status(404).json({error:'Produto não encontrado'});
  const tGuard=await token(); const meGuard=await ML.me(tGuard); const guard=await remotePublicationGuard(p,tGuard,meGuard.id);
  if(guard.blocked){
    if(['ALREADY_PUBLISHED_LOCAL','ALREADY_PUBLISHED_ML'].includes(guard.code)){
      const reconciled=await reconcileExistingPublication(p,guard,tGuard);
      if(reconciled?.ok){
        const linked=store.findProduct(p.id,p.sku)||{...p,...reconciled.patch};
        let receipt=null;
        try{
          const existingReceipts=store.getPublicationReceipts?.()||[];
          receipt=existingReceipts.find(r=>String(r.itemId||'')===String(reconciled.item.id||''))||null;
          if(!receipt){receipt=await buildPostPublicationReceipt(linked,{item:reconciled.item,mode:'live'});await store.addPublicationReceipt(receipt);}
        }catch(e){console.warn('[PUBLICAÇÃO] recibo na reconciliação:',safeError(e));}
        setTimeout(()=>runMonitoring({source:'post-publish-reconcile',mode:'fast'}).catch(()=>{}),5000); if(store.getSettings().postPublishPipelineEnabled!==false)setTimeout(()=>{const cur=store.findProduct(p.id,p.sku);if(cur?.ml_item_id)buildPostPublishCorrectionPlan(cur,{persist:true}).catch(()=>{});},8000);
        return res.json({ok:true,mode:'live',reconciled:true,alreadyExisted:true,created:reconciled.item,receipt,publicationState:reconciled.remote,message:reconciled.remote.message});
      }
    }
    await store.updateProduct(p.id,{publicationGuard:guard,status:guard.code==='OUT_OF_STOCK'?'bloqueado-sem-estoque':'bloqueado-ja-publicada'});
    return res.status(422).json({error:guard.label,reason:guard.reason,existingItems:guard.existingItems||[]});
  }
  p={...p,publicationGuard:guard}; await store.updateProduct(p.id,{publicationGuard:guard});
  const q=quality(p); const ready=productReadiness({...p,quality:q});
  if(process.env.REQUIRE_AI_IMAGES!=='false' && !q.aiReady)return res.status(422).json({error:`9 fotos ainda não aprovadas (${p.imageStudio?.approvedCount||0}/9).`});
  const catalogStatus=String(p.catalogPolicy?.status||'unknown');
  if(['unknown','unverified'].includes(catalogStatus))return res.status(422).json({error:'Publicação bloqueada: a validação de catálogo ainda não foi concluída. Reanalise a SKU antes de publicar.',catalogStatus,reason:p.catalogPolicy?.reason||'catálogo não validado'});
  if(p.catalogPolicy?.blocked)return res.status(422).json({error:`Publicação bloqueada pela política de catálogo: ${p.catalogPolicy.reason}`});
  if(process.env.REQUIRE_VIDEO_REVIEW!=='false' && !p.videoReviewed&&!p.marketproVideo?.id&&!p.video_url)return res.status(422).json({error:'Revise/selecione um vídeo no MarketPro antes de publicar.'});
  if(!p.commercialAnalysis?.bestScenario)return res.status(422).json({error:'Execute a Inteligência Comercial antes de publicar.'});
  const tech=technicalCoverage(p); if(tech.requiredMissing.length)return res.status(422).json({error:`Ficha técnica obrigatória incompleta (${tech.requiredFilled}/${tech.requiredTotal}). Preencha: ${tech.requiredMissing.slice(0,8).map(x=>x.name).join(', ')}`});
  if(!p.commercialAnalysis?.shippingComplete)return res.status(422).json({error:'Cotação de frete incompleta. Informe altura, largura, comprimento e peso em gramas.'});
  if(q.score<80)return res.status(422).json({error:`Qualidade insuficiente (${q.score}%). Pendências: ${q.issues.join(', ')}`});

  const chosen=p.commercialAnalysis.recommendedScenario||p.commercialAnalysis.bestScenario;
  const listing=req.body.listing_type_id||chosen.listingType||'gold_special';
  const autoGross=n(p.priceRecommendation?.grossUploadPrice||p.commercialAnalysis?.pricingRecommendation?.grossUploadPrice);
  const finalPrice=n(req.body.price||autoGross||chosen.price||p.price);
  const condition=clean(p.listingProfile?.condition)||'new';
  const userProductSeller=Array.isArray(meGuard?.tags)&&meGuard.tags.includes('user_product_seller');
  const warehouseManagement=StockEngine.usesWarehouseManagement(meGuard);
  const livePublish=process.env.ML_LIVE_PUBLISH_ENABLED==='true';
  let mlPictureMeta=null;
  if(livePublish){
    try{mlPictureMeta=await prepareMlPictures(p,tGuard);}
    catch(e){return res.status(422).json({error:`Fotos não foram enviadas ao Mercado Livre. A publicação foi bloqueada antes de criar o anúncio: ${safeError(e)}`,code:'PICTURE_UPLOAD_FAILED'});}
  }
  const picturePayload=mlPictureMeta?.ids?.length?mlPictureMeta.ids.map(id=>({id})):((p.generatedImages&&p.generatedImages.length===9)?p.generatedImages:(p.images||[])).map(source=>({source}));
  const payload={site_id:SITE,category_id:p.category_id,price:finalPrice,currency_id:'BRL',buying_mode:'buy_it_now',condition,listing_type_id:listing,pictures:picturePayload,shipping:{free_shipping:Boolean(finalPrice>=n(p.commercialAnalysis?.threshold,store.getSettings().freeShippingThreshold||79)?true:chosen.freeShipping),local_pick_up:Boolean(p.listingProfile?.local_pick_up)},attributes:[]};
  let stockPlan={mode:'legacy',available_quantity:publishQuantity(p)};
  if(warehouseManagement){
    let stores=[];try{stores=await ML.userStoresSearch(tGuard,meGuard.id);}catch(e){return res.status(e.status||502).json({error:`Não foi possível consultar os depósitos de estoque do Mercado Livre: ${safeError(e)}`});}
    try{stockPlan=StockEngine.buildInitialStock({user:meGuard,stores,quantity:publishQuantity(p),preferredStoreId:preferredWarehouseStoreId(store.getSettings())});}
    catch(e){return res.status(422).json({error:safeError(e),code:e.code||'WAREHOUSE_CONFIG_REQUIRED',availableStores:e.availableStores||[],hint:'Defina ML_PRIMARY_WAREHOUSE_STORE_ID no Render quando houver mais de um depósito ativo.'});}
    payload.channels=['marketplace'];payload.stock_locations=stockPlan.stock_locations;
  }else payload.available_quantity=stockPlan.available_quantity;
  if(userProductSeller)payload.family_name=publicationFamilyName(p); else payload.title=(p.seoTitle||p.product).slice(0,n(p.titleMaxLength,60)||60);

  const addAttr=(id,value,valueId=null,descriptor=null)=>{id=clean(id).toUpperCase();value=normalizeMlAttributeValue(id,value,descriptor);valueId=clean(valueId);if(!id||(!value&&!valueId)||payload.attributes.some(a=>a.id===id))return;const row={id};if(valueId)row.value_id=valueId;if(value)row.value_name=value;payload.attributes.push(row);};
  addAttr('SELLER_SKU',p.sku); addAttr('GTIN',p.gtin); addAttr('BRAND',p.brand); addAttr('MODEL',effectiveAttributeValue(p,'MODEL'));
  for(const [aid,val] of Object.entries({...p.attributeValues,...p.manualAttributes}))addAttr(aid,val);
  for(const a of p.predictedAttributes||[]){if(a?.id&&(a?.value_name||a?.value_id)&&!payload.attributes.some(x=>x.id===String(a.id).toUpperCase()))addAttr(a.id,a.value_name,a.value_id);}

  const saleTerms=[];for(const st of (p.saleTerms||[])){const v=clean(p.manualSaleTerms?.[st.id]??p.saleTermValues?.[st.id]??'');if(v)saleTerms.push({id:st.id,value_name:v});}if(saleTerms.length)payload.sale_terms=saleTerms;

  // Pré-validação oficial, sempre fresca, imediatamente antes do POST /items.
  let freshAttrs=[],freshSaleTerms=[];
  try{[freshAttrs,freshSaleTerms]=await Promise.all([ML.categoryAttributes(tGuard,p.category_id),ML.categorySaleTerms(tGuard,p.category_id).catch(()=>[])]);}catch(e){return res.status(e.status||502).json({error:`Não foi possível atualizar os campos obrigatórios da categoria antes de publicar: ${safeError(e)}`});}
  if(freshAttrs.some(a=>String(a?.id).toUpperCase()==='ITEM_CONDITION'))addAttr('ITEM_CONDITION',condition==='new'?'Novo':condition==='used'?'Usado':'Recondicionado',itemConditionValueId(condition));

  const autoFillAttr=(a)=>{const aid=String(a?.id||'').toUpperCase();const v=effectiveAttributeValue(p,aid);if(v)addAttr(aid,v,null,a);};
  const freshAttrMap=new Map(freshAttrs.map(a=>[String(a?.id||'').toUpperCase(),a]));
  payload.attributes=payload.attributes.map(row=>({...row,value_name:row.value_name?normalizeMlAttributeValue(row.id,row.value_name,freshAttrMap.get(String(row.id||'').toUpperCase())):row.value_name}));
  const normalizedNumericRows=payload.attributes.filter(a=>{const d=freshAttrMap.get(String(a.id||'').toUpperCase());return a.value_name&&['number','number_unit'].includes(clean(d?.value_type).toLowerCase());});
  if(normalizedNumericRows.length)await store.addJob({id:id(),type:'publish-normalize-attributes',status:'concluido',sku:p.sku,normalized:normalizedNumericRows.map(a=>({id:a.id,value:a.value_name,valueType:freshAttrMap.get(String(a.id||'').toUpperCase())?.value_type||null})),at:new Date().toISOString()});
  const requiredFresh=freshAttrs.filter(a=>a?.tags?.required||(condition==='new'&&a?.tags?.new_required));
  requiredFresh.forEach(autoFillAttr);
  const missingFresh=requiredFresh.filter(a=>!hasPayloadAttribute(payload,a.id));
  if(missingFresh.length){const names=missingFresh.slice(0,12).map(a=>a.name||a.id);await store.addJob({id:id(),type:'publish-preflight',status:'bloqueado',sku:p.sku,reason:'required_attributes',missing:names,at:new Date().toISOString()});return res.status(422).json({error:`Mercado Livre exige campos obrigatórios atualizados antes da publicação: ${names.join(', ')}. Abra Revisar dados da SKU para completar.`,missingFields:missingFresh.map(a=>a.id),publicationMode:warehouseManagement?'multiwarehouse':userProductSeller?'user_products':'legacy'});}

  const requiredSale=(freshSaleTerms||[]).filter(st=>st?.tags?.required||(condition==='new'&&st?.tags?.new_required));
  for(const st of requiredSale){if(saleTerms.some(x=>x.id===st.id))continue;if(String(st.id).toUpperCase()==='MANUFACTURING_TIME'&&stockIsAvailable(p)){saleTerms.push({id:st.id,value_name:'0 dias'});}}
  const missingSale=requiredSale.filter(st=>!saleTerms.some(x=>x.id===st.id&&clean(x.value_name)));
  if(missingSale.length){const names=missingSale.slice(0,12).map(a=>a.name||a.id);return res.status(422).json({error:`Mercado Livre exige condição(ões) de venda antes da publicação: ${names.join(', ')}. Abra Revisar dados da SKU para completar.`,missingFields:missingSale.map(a=>a.id),publicationMode:warehouseManagement?'multiwarehouse':userProductSeller?'user_products':'legacy'});}
  if(saleTerms.length)payload.sale_terms=saleTerms; else delete payload.sale_terms;

  // Atributos conditional_required podem mudar conforme marca/GTIN/condição. O ML exige esta consulta antes da criação.
  let conditional={required_attributes:[]};
  try{const conditionalPayload={...payload,title:(p.seoTitle||p.product).slice(0,n(p.titleMaxLength,60)||60),description:{plain_text:preserveMultiline(p.description)||''}};conditional=await ML.categoryConditionalAttributes(tGuard,p.category_id,conditionalPayload)||{required_attributes:[]};}catch(e){await store.addJob({id:id(),type:'publish-preflight-conditional',status:'aviso',sku:p.sku,error:safeError(e),at:new Date().toISOString()});}
  const conditionalReq=Array.isArray(conditional?.required_attributes)?conditional.required_attributes:[];
  conditionalReq.forEach(autoFillAttr);
  const missingConditional=conditionalReq.filter(a=>!hasPayloadAttribute(payload,a.id));
  if(missingConditional.length){const names=missingConditional.slice(0,12).map(a=>a.name||a.id);await store.addJob({id:id(),type:'publish-preflight',status:'bloqueado',sku:p.sku,reason:'conditional_required',missing:names,at:new Date().toISOString()});return res.status(422).json({error:`O Mercado Livre informou que esta SKU precisa de campo(s) condicional(is): ${names.join(', ')}. Preencha esses dados e tente novamente.`,missingFields:missingConditional.map(a=>a.id),publicationMode:warehouseManagement?'multiwarehouse':userProductSeller?'user_products':'legacy'});}

  const preview={...payload,publicationMode:warehouseManagement?'multiwarehouse':userProductSeller?'user_products':'legacy',sellerTags:meGuard?.tags||[],displayTitle:p.seoTitle||p.product,descriptionAfterCreate:p.description,marketproVideo:p.marketproVideo||null,videoNote:p.marketproVideo?'Vídeo selecionado e preparado para o fluxo de Clips. O Marketplace não aceita mais video_id do YouTube; anexo automático depende do endpoint de Clips habilitado para a conta.':'Sem vídeo selecionado.',readiness:ready,conditionalRequired:conditionalReq.map(a=>({id:a.id,name:a.name||a.id}))};
  const live=livePublish;
  if(live&&!req.body?.confirm_live)return res.status(409).json({error:'Publicação real ativa, mas falta confirmação explícita. Atualize a tela e confirme PUBLICAR NO MERCADO LIVRE.'});
  if(!live){const receipt=Monitoring.buildReceipt({product:{...p,price:finalPrice},item:{id:'SIMULACAO',title:p.seoTitle||p.product,price:finalPrice,listing_type_id:listing,shipping:{free_shipping:payload.shipping.free_shipping,logistic_type:p.commercialAnalysis?.recommendedScenario?.logisticType||store.getSettings().logisticType,mode:store.getSettings().shippingMode}},fee:n(chosen.fee),shipping:n(chosen.shipping),adsMetrics:adsMetricsForProduct(p),settings:store.getSettings(),mode:'simulation',source:'prévia antes da publicação'});await store.addPublicationReceipt(receipt);await store.addJob({id:id(),type:'publish-preview',status:'simulado',sku:p.sku,payload:preview,at:new Date().toISOString()});return res.json({ok:true,mode:'simulation',message:'Payload validado com o modelo correto da conta, atributos condicionais, preço/frete e vídeo.',payload:preview,receipt});}

  let created;
  try{created=warehouseManagement?await ML.createMultiwarehouseItem(tGuard,payload):await ML.createItem(tGuard,payload);}catch(e){const detail=mlPublishErrorDetails(e.response?.data||{});await store.addJob({id:id(),type:'publish',status:'erro',sku:p.sku,error:detail.message,codes:detail.codes,missingFields:detail.missingFields,mlDetails:e.response?.data||null,publicationMode:warehouseManagement?'multiwarehouse':userProductSeller?'user_products':'legacy',at:new Date().toISOString()});return res.status(e.status||e.response?.status||500).json({error:detail.message,code:detail.codes?.[0]||clean(e.response?.data?.error),missingFields:detail.missingFields,publicationMode:warehouseManagement?'multiwarehouse':userProductSeller?'user_products':'legacy',details:e.response?.data});}
  if(p.description)try{await ML.createDescription(tGuard,created.id,p.description)}catch(e){await store.addJob({id:id(),type:'description',status:'erro',sku:p.sku,item_id:created.id,error:safeError(e),at:new Date().toISOString()})}
  // A partir daqui o Mercado Livre JÁ criou o anúncio. Uma oscilação do PostgreSQL não pode
  // transformar sucesso remoto em "falha" para o operador, pois isso induziria nova publicação.
  let persistenceWarning=null;
  const createdRemoteState=publicationRemoteState(created);
  const publishPatch={status:'publicado',publishedStockTarget:publishQuantity(p),publishedStockMode:warehouseManagement?'multiwarehouse':'legacy',publishedWarehouse:stockPlan.warehouse||null,ml_item_id:created.id,user_product_id:created.user_product_id||p.user_product_id||null,family_name:created.family_name||payload.family_name||p.family_name||null,price:finalPrice,publishedAt:new Date().toISOString(),listing_type_id:payload.listing_type_id,publicationModel:warehouseManagement?'multiwarehouse':userProductSeller?'user_products':'legacy',ml_status:created.status||'',ml_sub_status:Array.isArray(created.sub_status)?created.sub_status:[],ml_permalink:created.permalink||p.ml_permalink||'',publicationState:createdRemoteState,lastPublicationReconcileAt:new Date().toISOString()};
  try{await store.updateProduct(p.id,publishPatch)}
  catch(dbErr){
    persistenceWarning='O anúncio foi criado no Mercado Livre e recebeu MLB, mas o PostgreSQL oscilou ao gravar o retorno. A gravação local está em recuperação automática; NÃO publique novamente.';
    console.error('[PUBLICAÇÃO] MLB criado; persistência local pendente:',created.id,safeError(dbErr));
    store.schedulePersistenceRetry?.(`publicacao-${created.id}`,2000);
  }
  const publishedProduct=store.findProduct(p.id,p.sku)||{...p,...publishPatch};let receipt=null;
  try{receipt=await buildPostPublicationReceipt(publishedProduct,{item:created,mode:'live'});await store.addPublicationReceipt(receipt)}
  catch(e){console.warn('[PUBLICAÇÃO] recibo local pendente:',created.id,safeError(e));store.schedulePersistenceRetry?.(`recibo-${created.id}`,3000)}
  const autoSettings=store.getSettings(); if(autoSettings.autoPromotionsEnabled&&autoSettings.postPublishAutoPromotionEnabled===false)setTimeout(()=>scanPromotions({autoApply:true,itemId:created.id}).catch(()=>{}),30000); if(autoSettings.autoPricingEnabled)setTimeout(()=>scanPricingAutomation({autoApply:true,itemId:created.id}).catch(()=>{}),45000); if(autoSettings.autoAdsEnabled)setTimeout(()=>scanAdsAutomation({autoApply:true,itemId:created.id}).catch(()=>{}),60000);
  try{await store.addJob({id:id(),type:'publish',status:'sucesso',sku:p.sku,item_id:created.id,user_product_id:created.user_product_id||null,publicationMode:warehouseManagement?'multiwarehouse':userProductSeller?'user_products':'legacy',persistenceWarning,at:new Date().toISOString()})}
  catch(e){store.schedulePersistenceRetry?.(`job-publicacao-${created.id}`,3000)}
  setTimeout(()=>runMonitoring({source:'post-publish',mode:'fast'}).catch(()=>{}),5000); if(store.getSettings().postPublishPipelineEnabled!==false)setTimeout(()=>{const cur=store.findProduct(p.id,p.sku);if(cur?.ml_item_id)buildPostPublishCorrectionPlan(cur,{persist:true}).catch(()=>{});},8000);
  res.json({ok:true,mode:'live',publicationMode:warehouseManagement?'multiwarehouse':userProductSeller?'user_products':'legacy',created,receipt,persistenceWarning,publicationState:createdRemoteState,message:createdRemoteState.message});
}catch(e){const detail=mlPublishErrorDetails(e.response?.data||{});await store.addJob({id:id(),type:'publish',status:'erro',error:detail.message||safeError(e),at:new Date().toISOString()});res.status(e.status||e.response?.status||500).json({error:detail.message||safeError(e),details:e.response?.data})} });



app.post('/api/products/:id/reconcile-publication',async(req,res)=>{try{
  let p=productRefFromReq(req);if(!p)return res.status(404).json({error:'Produto não encontrado'});
  const t=await token(),user=await ML.me(t);let result=null;
  if(p.ml_item_id){
    result=await reconcileExistingPublication(p,{existingItems:[p.ml_item_id]},t);
  }else{
    const guard=await remotePublicationGuard(p,t,user.id);
    if(guard?.code==='ALREADY_PUBLISHED_ML'&&Array.isArray(guard.existingItems)&&guard.existingItems.length===1)result=await reconcileExistingPublication(p,guard,t);
    else return res.json({ok:true,reconciled:false,guard,product:p,message:guard?.existingItems?.length>1?'Há mais de um anúncio para esta SKU; não foi possível vincular automaticamente.':'Nenhum anúncio publicado foi localizado para esta SKU.'});
  }
  p=store.findProduct(p.id,p.sku)||p;
  const plan=p.ml_item_id?await buildPostPublishCorrectionPlan(p,{persist:true}).catch(()=>null):null;
  p=store.findProduct(p.id,p.sku)||p;
  res.json({ok:true,reconciled:Boolean(result?.ok),partial:Boolean(result?.partial),itemId:p.ml_item_id||null,publicationState:p.publicationState||result?.remote||null,plan,product:p});
}catch(e){res.status(e.status||500).json({error:safeError(e),details:e.response?.data||null})}});

app.post('/api/products/:id/remote-stock/refresh',async(req,res)=>{try{
  const p=productRefFromReq(req);if(!p)return res.status(404).json({error:'Produto não encontrado'});
  if(!p.ml_item_id)return res.status(422).json({error:'Esta SKU ainda não possui um MLB vinculado.'});
  const t=await token(),user=await ML.me(t);let item=await ML.itemDetails(t,p.ml_item_id),market=await marketStockSnapshot(t,p,item,user);
  if(Math.max(0,Math.floor(n(market.quantity,0)))===0){await new Promise(r=>setTimeout(r,1100));item=await ML.itemDetails(t,p.ml_item_id);const retry=await marketStockSnapshot(t,p,item,user);if(n(retry.quantity,0)>=n(market.quantity,0))market=retry;}
  const qty=Math.max(0,Math.floor(n(market.quantity,0)));
  const patch={stock:qty,stock_quantity_known:true,stock_source:'mercadolivre_remote',stockAuthority:'mercadolivre',ml_available_quantity:qty,ml_stock_source:market.source,ml_stock_checked_at:new Date().toISOString(),ml_stock_details:market,publishedStockTarget:qty,availability_status:qty>0?'available':'unavailable',availability_raw:`Mercado Livre: ${qty} unidade(s)`};
  await store.updateProduct(p.id,patch);
  res.json({ok:true,sku:p.sku,itemId:p.ml_item_id,quantity:qty,source:market.source,details:market});
}catch(e){res.status(e.status||500).json({error:safeError(e),details:e.response?.data||null})}});

app.get('/api/products/:id/post-publish/plan',async(req,res)=>{try{
  const p=productRefFromReq(req);if(!p)return res.status(404).json({error:'Produto não encontrado'});
  if(!p.ml_item_id)return res.status(422).json({error:'Esta SKU ainda não possui um MLB publicado.'});
  const plan=await buildPostPublishCorrectionPlan(p,{persist:true});
  res.json({ok:true,plan});
}catch(e){res.status(e.status||500).json({error:safeError(e),details:e.response?.data||null})}});

app.post('/api/products/:id/post-publish/run',async(req,res)=>{try{
  const p=productRefFromReq(req);if(!p)return res.status(404).json({error:'Produto não encontrado'});
  if(!p.ml_item_id)return res.status(422).json({error:'Esta SKU ainda não possui um MLB publicado.'});
  const plan=await buildPostPublishCorrectionPlan(p,{persist:true});
  if(plan.actions.length&&req.body?.confirm!==true)return res.status(409).json({error:'Confirme o plano de correções antes de executar.',code:'CORRECTION_PLAN_CONFIRM_REQUIRED',plan});
  await store.updateProduct(p.id,{postPublishExecutionApprovedAt:new Date().toISOString(),postPublishCorrectionPlan:plan});
  let out;
  try{out=await runPostPublishPipeline(p.id,{source:'manual-approved',forcePictures:Boolean(req.body?.forcePictures),forceStock:Boolean(req.body?.forceStock)});}
  finally{await store.updateProduct(p.id,{postPublishExecutionApprovedAt:null,postPublishExecutionConsumedAt:new Date().toISOString()}).catch(()=>{});}
  res.json({ok:true,plan,pipeline:out});
}catch(e){res.status(e.status||500).json({error:safeError(e),details:e.response?.data||null})}});

app.get('/api/post-publish/status/:id',(req,res)=>{const p=productRefFromReq(req);if(!p)return res.status(404).json({error:'Produto não encontrado'});res.json({ok:true,itemId:p.ml_item_id||null,pipeline:p.postPublishPipeline||null,plan:p.postPublishCorrectionPlan||null});});
app.post('/api/products/:id/post-publish/clip-confirm',async(req,res)=>{try{const p=productRefFromReq(req);if(!p)return res.status(404).json({error:'Produto não encontrado'});if(!p.ml_item_id)return res.status(422).json({error:'SKU ainda não publicada.'});const at=new Date().toISOString();const pipeline={...(p.postPublishPipeline||{}),itemId:p.ml_item_id,sku:p.sku,steps:{...(p.postPublishPipeline?.steps||{})},updatedAt:at};pipeline.steps.video=postStep('DONE',`Clip confirmado pelo operador em ${new Date(at).toLocaleString('pt-BR')}.`,{manualConfirmation:true,confirmedAt:at});pipeline.status=postPipelineOverall(pipeline.steps);if(['DONE','ACTION_REQUIRED'].includes(pipeline.status))pipeline.completedAt=at;await store.updateProduct(p.id,{clipManualConfirmedAt:at,postPublishPipeline:pipeline,postPublishExecutionApprovedAt:null});const fresh=store.findProduct(p.id,p.sku)||{...p,clipManualConfirmedAt:at,postPublishPipeline:pipeline};const plan=await buildPostPublishCorrectionPlan(fresh,{persist:true}).catch(()=>null);res.json({ok:true,confirmedAt:at,pipeline,plan});}catch(e){res.status(e.status||500).json({error:safeError(e)})}});
app.get('/api/warehouses',async(req,res)=>{try{const t=await token(),user=await ML.me(t),warehouseManagement=StockEngine.usesWarehouseManagement(user);let stores=[];if(warehouseManagement)stores=StockEngine.normalizeStores(await ML.userStoresSearch(t,user.id));res.json({ok:true,warehouseManagement,multiwarehouse:StockEngine.usesMultiwarehouse(user),preferredStoreId:preferredWarehouseStoreId(store.getSettings()),stores});}catch(e){res.status(e.status||500).json({error:safeError(e),details:e.response?.data||null})}});

app.get('/api/promotions',(req,res)=>res.json({...store.getPromotions(),settings:{promotionMinMargin:store.getSettings().promotionMinMargin,promotionMaxDiscount:store.getSettings().promotionMaxDiscount,promotionTargetDiscount:store.getSettings().promotionTargetDiscount,autoPromotionsEnabled:Boolean(store.getSettings().autoPromotionsEnabled)}}));
app.post('/api/promotions/scan',async(req,res)=>{try{const data=await scanPromotions({autoApply:Boolean(req.body?.autoApply),itemId:clean(req.body?.itemId||'')||null});res.json(data)}catch(e){res.status(e.status||500).json({error:safeError(e),details:e.response?.data})}});
app.post('/api/promotions/settings',async(req,res)=>{const out=await store.setSettings({promotionMinMargin:n(req.body?.promotionMinMargin,18),promotionMaxDiscount:n(req.body?.promotionMaxDiscount,20),promotionTargetDiscount:n(req.body?.promotionTargetDiscount,10),autoPromotionsEnabled:Boolean(req.body?.autoPromotionsEnabled)});res.json(out)});
app.post('/api/promotions/selection',async(req,res)=>{try{
  const state=store.getPromotions(),rows=(state.rows||[]).map(r=>({...r}));
  const requested=new Set((Array.isArray(req.body?.rowIds)?req.body.rowIds:[]).map(String));
  if(req.body?.selectEligible===true){for(const row of rows)row.selected=Boolean(row.eligible&&row.recommendation==='APTA');}
  else if(req.body?.clear===true){for(const row of rows)row.selected=false;}
  else{for(const row of rows)row.selected=requested.has(String(row.id));}
  const next={...state,rows,selectionUpdatedAt:new Date().toISOString()};await store.setPromotions(next);
  res.json(next);
}catch(e){res.status(400).json({error:safeError(e)})}});

app.post('/api/promotions/routine/resolve',async(req,res)=>{
  try{
    const itemId=clean(req.body?.itemId||''),preferredRowId=clean(req.body?.rowId||'');
    if(!itemId)return res.status(400).json({error:'Item do Mercado Livre não informado para a rotina de promoção.'});
    let promotions=await scanPromotions({autoApply:false,itemId});
    const same=()=> (promotions.rows||[]).filter(r=>String(r.itemId||'')===String(itemId));
    let scheduled=same().find(r=>String(r.status||'').toLowerCase()==='pending'||String(r.recommendation||'').toUpperCase()==='PROGRAMADA');
    if(scheduled){
      const mon=store.getMonitoring(),inv=(mon.accountInventory||[]).find(x=>String(x.itemId||'')===String(itemId));
      if(inv)try{await scanCommercialAlignment({source:'promo-routine-scheduled',providedInventory:[inv],concurrency:1,mergeExisting:true,totalOverride:1,recordJob:false})}catch(_){}
      return res.json({ok:true,resolved:true,action:'already-scheduled',message:`A próxima promoção já está programada no Mercado Livre${scheduled.name?` · ${scheduled.name}`:''}. Nenhuma ação manual é necessária.`,promotion:scheduled,promotions:store.getPromotions()});
    }
    let candidates=same().filter(r=>r.eligible&&String(r.recommendation||'').toUpperCase()==='APTA'&&String(r.status||'').toLowerCase()==='candidate').sort((a,b)=>n(b.projectedMargin)-n(a.projectedMargin));
    let row=preferredRowId?candidates.find(r=>String(r.id)===String(preferredRowId)):null;row=row||candidates[0]||null;
    if(!row){
      const mon=store.getMonitoring(),inv=(mon.accountInventory||[]).find(x=>String(x.itemId||'')===String(itemId));
      if(inv)try{await scanCommercialAlignment({source:'promo-routine-no-safe-offer',providedInventory:[inv],concurrency:1,mergeExisting:true,totalOverride:1,recordJob:false})}catch(_){}
      return res.json({ok:true,resolved:true,action:'no-safe-offer',message:'Não existe outra promoção segura para esta SKU agora. O Publisher não aplicou desconto com prejuízo e retirou esta etapa da rotina; o monitor continuará acompanhando novas campanhas.',promotions:store.getPromotions()});
    }
    const t=await token(),applied=await applyPromotionRow(row,t),verification=await verifyAppliedPromotion(row,t);
    promotions=await store.setPromotions({...promotions,rows:promotions.rows,lastApplyAt:new Date().toISOString()});
    const mon=store.getMonitoring(),inv=(mon.accountInventory||[]).find(x=>String(x.itemId||'')===String(itemId));
    if(inv)try{await scanCommercialAlignment({source:'promo-routine-applied',providedInventory:[inv],concurrency:1,mergeExisting:true,totalOverride:1,recordJob:false})}catch(_){}
    const state=verification?.state==='scheduled'?'programada':verification?.state==='active'?'ativa':'enviada';
    return res.json({ok:true,resolved:true,action:'applied',message:`Promoção segura ${state} no Mercado Livre${row.name?` · ${row.name}`:''}. Margem projetada ${n(row.projectedMargin).toFixed(1)}%.`,promotion:row,applied,verification,promotions:store.getPromotions()});
  }catch(e){res.status(e.status||500).json({error:safeError(e),details:e.response?.data})}
});

app.post('/api/promotions/apply',async(req,res)=>{try{const state=store.getPromotions();let ids=Array.isArray(req.body?.rowIds)?req.body.rowIds.map(String):[];if(!ids.length)ids=(state.rows||[]).filter(r=>r?.selected&&r?.eligible&&r?.recommendation==='APTA').map(r=>String(r.id));if(!ids.length)return res.status(400).json({error:'Nenhuma promoção apta está selecionada no servidor. Use “Selecionar aptas” ou marque uma promoção segura.'});const t=await token(),out=[],errors=[];for(const rid of ids){const row=(state.rows||[]).find(x=>String(x.id)===String(rid));if(!row){errors.push({rowId:rid,error:'Promoção não encontrada na última varredura.'});continue;}try{const applied=await applyPromotionRow(row,t);row.selected=false;const verification=await verifyAppliedPromotion(row,t);out.push({rowId:rid,itemId:row.itemId,type:row.type,applied,verification});}catch(e){errors.push({rowId:rid,itemId:row.itemId,type:row.type,error:safeError(e)})}}await store.setPromotions({...state,rows:state.rows,errors:[...(state.errors||[]),...errors],lastApplyAt:new Date().toISOString()});res.json({ok:true,applied:out,errors,promotions:store.getPromotions()});}catch(e){res.status(e.status||500).json({error:safeError(e),details:e.response?.data})}});
app.post('/api/promotions/seller-campaign',async(req,res)=>{try{const name=clean(req.body?.name);const start=new Date(req.body?.start_date),finish=new Date(req.body?.finish_date),target=n(req.body?.targetDiscount,10);if(!name)return res.status(400).json({error:'Informe o nome da campanha.'});if(!Number.isFinite(start.getTime())||!Number.isFinite(finish.getTime())||finish<=start)return res.status(400).json({error:'Datas inválidas.'});if((finish-start)>14*86400000)return res.status(400).json({error:'Campanha do vendedor pode ter no máximo 14 dias.'});const t=await token();const payload={promotion_type:'SELLER_CAMPAIGN',name,sub_type:'FLEXIBLE_PERCENTAGE',start_date:start.toISOString(),finish_date:finish.toISOString()};const created=await ML.createSellerCampaign(t,payload);const st=store.getPromotions();const self=[...(st.selfCampaigns||[]),{id:created.id||created.promotion_id,name,targetDiscount:target,start_date:payload.start_date,finish_date:payload.finish_date,createdAt:new Date().toISOString()}].slice(-30);await store.setPromotions({...st,selfCampaigns:self});await store.setSettings({promotionTargetDiscount:target});res.json({ok:true,created,targetDiscount:target});}catch(e){res.status(e.status||500).json({error:safeError(e),details:e.response?.data})}});


// --- Automatização oficial de preços ---
app.get('/api/pricing-automation',(req,res)=>res.json({...store.getPricingAutomation(),settings:{autoPricingEnabled:Boolean(store.getSettings().autoPricingEnabled),pricingRule:store.getSettings().pricingRule||'INT_EXT',pricingMinMargin:n(store.getSettings().pricingMinMargin,10),pricingCampaignReservePct:n(store.getSettings().pricingCampaignReservePct,10)}}));
app.post('/api/pricing-automation/settings',async(req,res)=>{const current=store.getSettings();const rule=['INT_EXT','INT'].includes(clean(req.body?.pricingRule))?clean(req.body.pricingRule):(current.pricingRule||'INT_EXT');const out=await store.setSettings({autoPricingEnabled:req.body?.autoPricingEnabled!=null?Boolean(req.body.autoPricingEnabled):current.autoPricingEnabled,pricingRule:rule,pricingMinMargin:req.body?.pricingMinMargin!=null?n(req.body.pricingMinMargin,10):current.pricingMinMargin,pricingCampaignReservePct:req.body?.pricingCampaignReservePct!=null?CE.clampPct(req.body.pricingCampaignReservePct,0,60):current.pricingCampaignReservePct});res.json(out)});
app.post('/api/pricing-automation/scan',async(req,res)=>{try{const data=await scanPricingAutomation({autoApply:Boolean(req.body?.autoApply)});res.json(data)}catch(e){res.status(e.status||500).json({error:safeError(e),details:e.response?.data})}});
app.post('/api/pricing-automation/apply',async(req,res)=>{try{res.json(await applyPricingRows(Array.isArray(req.body?.rowIds)?req.body.rowIds:[]))}catch(e){res.status(e.status||500).json({error:safeError(e),details:e.response?.data})}});

// --- Product Ads por SKU: potencial, pré-configuração e publicação seletiva ---
app.get('/api/ads',(req,res)=>res.json({...store.getAds(),rows:localAdsCandidateRows(),settings:adsSettingsForClient()}));
app.post('/api/ads/settings',async(req,res)=>{const current=store.getSettings();const out=await store.setSettings({autoAdsEnabled:req.body?.autoAdsEnabled!=null?Boolean(req.body.autoAdsEnabled):current.autoAdsEnabled,adsCampaignName:clean(req.body?.adsCampaignName||current.adsCampaignName||'Rede Achados BR - Automático'),adsCampaignPrefix:clean(req.body?.adsCampaignPrefix||current.adsCampaignPrefix||'Rede Achados BR - ADS -'),adsDailyBudget:req.body?.adsDailyBudget!=null?Math.max(0,n(req.body.adsDailyBudget)):current.adsDailyBudget,adsTargetRoas:AdsEngine.clamp(req.body?.adsTargetRoas!=null?req.body.adsTargetRoas:current.adsTargetRoas||6,1,35),adsMinMargin:req.body?.adsMinMargin!=null?n(req.body.adsMinMargin,10):current.adsMinMargin,adsAttributionDays:Math.max(1,n(req.body?.adsAttributionDays,current.adsAttributionDays||14)),adsMinClicksBeforePause:Math.max(1,n(req.body?.adsMinClicksBeforePause,current.adsMinClicksBeforePause||30)),adsMaxProducts:Math.max(1,Math.min(100,n(req.body?.adsMaxProducts,current.adsMaxProducts||20))),adsPrePriceReservePct:req.body?.adsPrePriceReservePct!=null?CE.clampPct(req.body.adsPrePriceReservePct,0,45):current.adsPrePriceReservePct});res.json(out)});
app.post('/api/ads/plan/:productId',async(req,res)=>{try{const p=findProductRef(req.params.productId,req.body?.sku||'');if(!p)return res.status(404).json({error:'Produto não encontrado. O SKU pode ser enviado junto para recuperação da referência.'});const settings=store.getSettings(),current=store.getAdsPlan(p.id)||{},input={...current};for(const k of ['selected','active','unlimitedEnd','unlimitedBudget','endDate','totalBudget','dailyBudget','roasTarget'])if(req.body?.[k]!=null)input[k]=req.body[k];input.selected=Boolean(input.selected);if(req.body?.active!=null)input.active=Boolean(req.body.active);if(req.body?.unlimitedEnd!=null)input.unlimitedEnd=Boolean(req.body.unlimitedEnd);if(req.body?.unlimitedBudget!=null)input.unlimitedBudget=Boolean(req.body.unlimitedBudget);input.roasTarget=AdsEngine.clamp(input.roasTarget||settings.adsTargetRoas||6,1,35);input.dailyBudget=Math.max(0,n(input.dailyBudget));input.totalBudget=Math.max(0,n(input.totalBudget));const plan=AdsEngine.normalizedPlan(p,settings,input);await store.setAdsPlan(p.id,plan);res.json({ok:true,productId:p.id,sku:p.sku,plan});}catch(e){res.status(400).json({error:safeError(e)})}});
app.post('/api/ads/plans',async(req,res)=>{try{const settings=store.getSettings(),plans={...store.getAdsPlans()};if(req.body?.selectPotential){for(const p of store.getProducts()){if(!(p.commercialAnalysis?.recommendedScenario||p.adsRecommendation))continue;const plan=AdsEngine.normalizedPlan(p,settings,plans[String(p.id)]||{});plans[String(p.id)]={...plan,selected:Boolean(plan.potential?.eligible),updatedAt:new Date().toISOString()};}}for(const item of (Array.isArray(req.body?.plans)?req.body.plans:[])){const p=findProductRef(item.productId,item.sku||'');if(!p)continue;const merged={...(plans[String(p.id)]||{}),...item};plans[String(p.id)]={...AdsEngine.normalizedPlan(p,settings,merged),updatedAt:new Date().toISOString()};}await store.setAdsPlans(plans);res.json({ok:true,rows:localAdsCandidateRows(),plans});}catch(e){res.status(400).json({error:safeError(e)})}});
app.post('/api/ads/scan',async(req,res)=>{try{const data=await scanAdsAutomation({autoApply:Boolean(req.body?.autoApply)});res.json(data)}catch(e){res.status(e.status||500).json({error:safeError(e),details:e.response?.data})}});
app.post('/api/ads/publish-selected',async(req,res)=>{try{const ids=Array.isArray(req.body?.productIds)?req.body.productIds.map(String):[];const data=await publishSelectedAds(ids);res.json(data)}catch(e){res.status(e.status||500).json({error:safeError(e),details:e.response?.data})}});
app.post('/api/ads/run',async(req,res)=>{try{const data=await scanAdsAutomation({autoApply:true});res.json(data)}catch(e){res.status(e.status||500).json({error:safeError(e),details:e.response?.data})}});

app.get('/api/accounting',(req,res)=>res.json(store.getAccounting()));
app.post('/api/accounting/sync',async(req,res)=>{try{const days=Math.min(180,Math.max(1,n(req.body?.days,30)));const data=await syncAccounting(days);res.json(data);}catch(e){res.status(e.status||500).json({error:safeError(e),details:e.response?.data})}});
app.get('/api/accounting/export.csv',(req,res)=>{const a=store.getAccounting();const rows=(a.summary?.products||[]).map(x=>({SKU:x.sku,Produto:x.title,Unidades:x.units,Pedidos:x.orders,Faturamento_Bruto:x.gross,Comissao_Tarifas:x.fees,Frete_Vendedor:x.shipping,Custo_Produto:x.cogs,Impostos_Estimados:x.tax,Ads_Estimado:x.ads,Ads_Real_Product_Ads:x.adsActual??'',Recebivel_Mercado_Pago:x.receivable,Lucro_Antes_ADS_Real:x.net,Lucro_Final_Calculado:x.netAfterAdsActual??x.net,Margem_Percentual:x.margin,Margem_Final_Percentual:x.marginAfterAdsActual??x.margin,Custo_WeDrop_Incompleto_Unidades:x.unknownCostUnits||0,Preco_Medio:x.avgPrice,Ponto_Equilibrio_Unitario:x.breakEvenUnit,Vendas_Premium:x.premiumSales,Vendas_Flex:x.flexSales,Vendas_Frete_Gratis:x.freeShippingSales,Vendas_Prejuizo:x.lossSales}));const ws=XLSX.utils.json_to_sheet(rows);const csv=XLSX.utils.sheet_to_csv(ws,{FS:';'});res.setHeader('content-disposition','attachment; filename="RELATORIO_CONTABILIDADE_ML.csv"');res.type('text/csv; charset=utf-8').send('\ufeff'+csv);});

app.get('/api/jobs',(req,res)=>res.json(store.getJobs()));
app.get('/api/settings',(req,res)=>res.json(store.getSettings()));
app.post('/api/settings',async(req,res)=>{const current=store.getSettings();const mode=['auto','manual'].includes(clean(req.body.imageGenerationMode))?clean(req.body.imageGenerationMode):current.imageGenerationMode;const out=await store.setSettings({taxRate:req.body.taxRate!=null?n(req.body.taxRate):current.taxRate,targetMargin:req.body.targetMargin!=null?n(req.body.targetMargin,18):current.targetMargin,adsRate:req.body.adsRate!=null?n(req.body.adsRate):current.adsRate,shippingMode:clean(req.body.shippingMode||current.shippingMode||'me2'),logisticType:clean(req.body.logisticType||current.logisticType||'drop_off'),freeShippingThreshold:req.body.freeShippingThreshold!=null?n(req.body.freeShippingThreshold,79):current.freeShippingThreshold,originZipCode:req.body.originZipCode!=null?clean(req.body.originZipCode):current.originZipCode,requireVideoReview:req.body.requireVideoReview!=null?req.body.requireVideoReview!==false:current.requireVideoReview,promotionMinMargin:req.body.promotionMinMargin!=null?n(req.body.promotionMinMargin,18):current.promotionMinMargin,promotionMaxDiscount:req.body.promotionMaxDiscount!=null?n(req.body.promotionMaxDiscount,20):current.promotionMaxDiscount,promotionTargetDiscount:req.body.promotionTargetDiscount!=null?n(req.body.promotionTargetDiscount,10):current.promotionTargetDiscount,autoPromotionsEnabled:req.body.autoPromotionsEnabled!=null?Boolean(req.body.autoPromotionsEnabled):current.autoPromotionsEnabled,autoPricingEnabled:req.body.autoPricingEnabled!=null?Boolean(req.body.autoPricingEnabled):current.autoPricingEnabled,pricingRule:req.body.pricingRule!=null?clean(req.body.pricingRule):current.pricingRule,pricingMinMargin:req.body.pricingMinMargin!=null?n(req.body.pricingMinMargin,10):current.pricingMinMargin,autoAdsEnabled:req.body.autoAdsEnabled!=null?Boolean(req.body.autoAdsEnabled):current.autoAdsEnabled,adsCampaignName:req.body.adsCampaignName!=null?clean(req.body.adsCampaignName):current.adsCampaignName,adsDailyBudget:req.body.adsDailyBudget!=null?n(req.body.adsDailyBudget):current.adsDailyBudget,adsTargetRoas:req.body.adsTargetRoas!=null?AdsEngine.clamp(req.body.adsTargetRoas,1,35):current.adsTargetRoas,adsMinMargin:req.body.adsMinMargin!=null?n(req.body.adsMinMargin,10):current.adsMinMargin,adsMaxProducts:req.body.adsMaxProducts!=null?Math.max(1,Math.min(100,n(req.body.adsMaxProducts,20))):current.adsMaxProducts,pricingCampaignReservePct:req.body.pricingCampaignReservePct!=null?CE.clampPct(req.body.pricingCampaignReservePct,0,60):current.pricingCampaignReservePct,adsPrePriceReservePct:req.body.adsPrePriceReservePct!=null?CE.clampPct(req.body.adsPrePriceReservePct,0,45):current.adsPrePriceReservePct,monitoringEnabled:req.body.monitoringEnabled!=null?Boolean(req.body.monitoringEnabled):current.monitoringEnabled,monitoringIntervalMinutes:req.body.monitoringIntervalMinutes!=null?Math.max(5,Math.min(360,n(req.body.monitoringIntervalMinutes,15))):current.monitoringIntervalMinutes,monitoringVisitWindowDays:req.body.monitoringVisitWindowDays!=null?Math.max(1,Math.min(90,n(req.body.monitoringVisitWindowDays,7))):current.monitoringVisitWindowDays,monitoringDormantDays:req.body.monitoringDormantDays!=null?Math.max(7,Math.min(90,n(req.body.monitoringDormantDays,14))):current.monitoringDormantDays,monitoringDormantMaxVisits:req.body.monitoringDormantMaxVisits!=null?Math.max(0,Math.min(100,n(req.body.monitoringDormantMaxVisits,3))):current.monitoringDormantMaxVisits,monitoringQualityMinScore:req.body.monitoringQualityMinScore!=null?Math.max(50,Math.min(100,n(req.body.monitoringQualityMinScore,90))):current.monitoringQualityMinScore,postPublishPipelineEnabled:req.body.postPublishPipelineEnabled!=null?Boolean(req.body.postPublishPipelineEnabled):current.postPublishPipelineEnabled,postPublishAutoPictures:req.body.postPublishAutoPictures!=null?Boolean(req.body.postPublishAutoPictures):current.postPublishAutoPictures,postPublishAutoFlexEnabled:req.body.postPublishAutoFlexEnabled!=null?Boolean(req.body.postPublishAutoFlexEnabled):current.postPublishAutoFlexEnabled,postPublishAutoPromotionEnabled:req.body.postPublishAutoPromotionEnabled!=null?Boolean(req.body.postPublishAutoPromotionEnabled):current.postPublishAutoPromotionEnabled,postPublishPromotionDiscountPct:req.body.postPublishPromotionDiscountPct!=null?Math.max(5,Math.min(30,n(req.body.postPublishPromotionDiscountPct,10))):current.postPublishPromotionDiscountPct,postPublishRetrySeconds:req.body.postPublishRetrySeconds!=null?Math.max(20,Math.min(300,n(req.body.postPublishRetrySeconds,45))):current.postPublishRetrySeconds,primaryWarehouseStoreId:req.body.primaryWarehouseStoreId!=null?clean(req.body.primaryWarehouseStoreId):current.primaryWarehouseStoreId,imageGenerationMode:mode});res.json(out)});
app.get('/api/template-skus',(req,res)=>{ const rows=[{SKU:'SKU001'},{SKU:'SKU002'},{SKU:'SKU003'}]; const wb=XLSX.utils.book_new(); XLSX.utils.book_append_sheet(wb,XLSX.utils.json_to_sheet(rows),'SKUs'); const buf=XLSX.write(wb,{type:'buffer',bookType:'xlsx'}); res.setHeader('content-disposition','attachment; filename="MODELO_SOMENTE_SKUS.xlsx"'); res.type('application/vnd.openxmlformats-officedocument.spreadsheetml.sheet').send(buf); });
app.get('/api/template',(req,res)=>{ const rows=[{SKU:'SKU001',Produto:'Mop Spray com Reservatório',Custo:25.99,Preço:69.90,Estoque:20,GTIN:'',Marca:'',Modelo:'',Cor:'Cinza',Material:'Plástico e microfibra',Dimensoes:'120 cm altura x 40 cm largura',Altura_cm:120,Largura_cm:40,Comprimento_cm:'',Diametro_cm:'',Peso_g:1200,Categoria_ID:'',Imagens:'https://exemplo.com/foto1.jpg;https://exemplo.com/foto2.jpg;https://exemplo.com/foto3.jpg',Embalagem_URL:'https://exemplo.com/embalagem.jpg',Caracteristicas:'Reservatório integrado; Cabeça articulada; Pano de microfibra',Conteudo:'1 mop + 2 refis',Video_URL:''}]; const wb=XLSX.utils.book_new(); XLSX.utils.book_append_sheet(wb,XLSX.utils.json_to_sheet(rows),'Produtos'); const buf=XLSX.write(wb,{type:'buffer',bookType:'xlsx'}); res.setHeader('content-disposition','attachment; filename="MODELO_IMPORTACAO_ML.xlsx"'); res.type('application/vnd.openxmlformats-officedocument.spreadsheetml.sheet').send(buf); });
app.use((err,req,res,next)=>{
  if(err instanceof multer.MulterError){
    if(err.code==='LIMIT_FILE_SIZE'){ if(req.path.includes('/images/manual'))return res.status(413).json({error:'Imagem acima de 25 MB. Reduza o arquivo e tente novamente.'}); return res.status(413).json({error:'Catálogo maior que 100 MB. Exporte a planilha em XLSX/CSV menor ou divida o catálogo antes de enviar.'}); }
    return res.status(400).json({error:`Falha no upload: ${err.message}`});
  }
  if(err){
    console.error('Erro não tratado:',err);
    return res.status(err.status||500).json({error:safeError(err)});
  }
  next();
});

app.get('*',(req,res)=>res.sendFile(path.join(__dirname,'..','public','index.html')));

let operationalWorkersStarted=false;
let persistentBootstrapInFlight=false;
let persistentBootstrapTimer=null;

async function startOperationalWorkers(){
  if(operationalWorkersStarted)return;
  await ensureSeedOperator();
  if(store.getSupplierCatalog().products?.length&&!store.getVariationGroups().length) await refreshVariationGroups();
  for(const p of store.getProducts()){ if(['queued','generating'].includes(p.imageStudio?.status)) enqueueImages(p.id,'resume'); }
  const promoTimer=setInterval(()=>{if(dailyRoutinePromise)return;if(store.getSettings().autoPromotionsEnabled&&store.getTokens())scanPromotions({autoApply:true}).catch(()=>{});},6*60*60*1000);promoTimer.unref?.();
  const priceTimer=setInterval(()=>{if(dailyRoutinePromise)return;if(store.getSettings().autoPricingEnabled&&store.getTokens())scanPricingAutomation({autoApply:true}).catch(()=>{});},6*60*60*1000);priceTimer.unref?.();
  const adsTimer=setInterval(()=>{if(dailyRoutinePromise)return;if(store.getSettings().autoAdsEnabled&&store.getTokens())scanAdsAutomation({autoApply:true}).catch(()=>{});},6*60*60*1000);adsTimer.unref?.();
  const monitorTimer=setInterval(()=>{if(dailyRoutinePromise)return;const s=store.getSettings(),m=store.getMonitoring(),now=Date.now();const fastEvery=Math.max(5,n(s.monitoringIntervalMinutes,15))*60000,deepEvery=4*60*60*1000;const fastDue=!m.lastFastRunAt||now-new Date(m.lastFastRunAt).getTime()>=fastEvery;const deepAt=m.lastDeepRunAt||m.lastRunAt;const deepDue=!deepAt||now-new Date(deepAt).getTime()>=deepEvery;if(!s.monitoringEnabled||!store.getTokens())return;if(deepDue)runMonitoring({source:'timer-deep'}).catch(()=>{});else if(fastDue)runMonitoring({source:'timer-fast',mode:'fast'}).catch(()=>{});},5*60*1000);monitorTimer.unref?.();
  const catalogGuardTimer=setInterval(()=>{if(dailyRoutinePromise)return;maybeRunCatalogGuard({source:'timer'}).catch(e=>console.warn('Catalog guard:',safeError(e)));},5*60*1000);catalogGuardTimer.unref?.();
  const postPublishTimer=setInterval(()=>{
    if(dailyRoutinePromise)return;
    const st=store.getSettings(); if(st.postPublishPipelineEnabled===false||!store.getTokens())return;
    const pending=store.getProducts().filter(p=>p.ml_item_id&&(!p.postPublishPipeline||['PENDING','WAITING','ERROR','ACTION_REQUIRED'].includes(String(p.postPublishPipeline?.status||'PENDING')))).slice(0,1);
    pending.forEach(async p=>{
      // V1.8.76: autorização é de uso único. Nunca reutilizar por horas/dias uma aprovação antiga.
      // O timer faz somente leitura/reconciliação; mudanças remotas exigem nova ação explícita ou automação própria habilitada.
      if(p.postPublishExecutionApprovedAt&&!postPublishApprovalIsFresh(p)){await store.updateProduct(p.id,{postPublishExecutionApprovedAt:null,postPublishExecutionExpiredAt:new Date().toISOString()}).catch(()=>{});}
      buildPostPublishCorrectionPlan(store.findProduct(p.id,p.sku)||p,{persist:true}).catch(e=>console.warn('[POST-PUBLISH-PLAN]',p.sku,safeError(e)));
    });
  },Math.max(60,n(store.getSettings().postPublishRetrySeconds,45))*1000);postPublishTimer.unref?.();

  if(store.getSettings().monitoringEnabled&&store.getTokens()){setTimeout(()=>runMonitoring({source:'startup-fast',mode:'fast'}).catch(()=>{}),12000);setTimeout(()=>{const m=store.getMonitoring(),deepAt=m.lastDeepRunAt||m.lastRunAt;if(!deepAt||Date.now()-new Date(deepAt).getTime()>=4*60*60*1000)runMonitoring({source:'startup-deep'}).catch(()=>{});},90000);}
  if(store.getSettings().catalogAutoGuardEnabled!==false&&store.getTokens())setTimeout(()=>maybeRunCatalogGuard({source:'startup'}).catch(()=>{}),18000);
  if(process.env.WEDROP_CATALOG_URL&&store.getSettings().supplierCatalogAutoRefresh===true){
    const catTimer=setInterval(()=>refreshSupplierFromRemote().catch(e=>console.warn('WeDrop auto refresh:',safeError(e))),6*60*60*1000);catTimer.unref?.();
  }
  operationalWorkersStarted=true;
  console.log('[BOOT] Estado persistente carregado; operação completa liberada.');
}

function schedulePersistentBootstrap(delay=5000){
  clearTimeout(persistentBootstrapTimer);
  persistentBootstrapTimer=setTimeout(()=>bootstrapPersistentState(),delay);
  persistentBootstrapTimer.unref?.();
}

async function bootstrapPersistentState(){
  if(persistentBootstrapInFlight||databaseBootReady()&&operationalWorkersStarted)return;
  persistentBootstrapInFlight=true;
  try{
    if(!databaseBootReady())await store.init();
    await startOperationalWorkers();
  }catch(e){
    console.error('[BOOT] PostgreSQL indisponível; servidor permanece online e tentará novamente:',safeError(e));
    schedulePersistentBootstrap(5000);
  }finally{
    persistentBootstrapInFlight=false;
  }
}

// O HTTP sobe primeiro. Assim um restart temporário do PostgreSQL não transforma o deploy do
// Render em Failed/502. Enquanto o banco não voltar, /health permanece 200 e as APIs retornam 503
// amigável, sem cair para armazenamento local.
// Heartbeat leve: detecta recuperação/queda do pool mesmo quando nenhum operador está clicando.
const dbHeartbeat=setInterval(async()=>{
  if(!store.pool||!store.getDbState?.().initialized)return;
  await store.ensureConnected?.(1);
},10000);
dbHeartbeat.unref?.();

app.listen(PORT,()=>{
  console.log(`RA ML Publisher Pro v1.8.76 em ${PORT}`);
  bootstrapPersistentState();
});
