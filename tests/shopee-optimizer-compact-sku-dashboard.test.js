import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';

const html=readFileSync(new URL('../public/index.html',import.meta.url),'utf8');
const app=readFileSync(new URL('../public/app.js',import.meta.url),'utf8');
const module=readFileSync(new URL('../public/optimizer-dashboard.js',import.meta.url),'utf8');
function nodes(){
 const cache=new Map(),actions={};
 function node(tag='div'){
  return {tag,children:[],hidden:false,textContent:'',style:{},dataset:{},attrs:{},
   addEventListener(type,fn){this['on'+type]=fn},
   setAttribute(k,v){this.attrs[k]=String(v)},
   getAttribute(k){return this.attrs[k]||null},
   removeAttribute(k){delete this.attrs[k]},
   append(...children){this.children.push(...children)},
   replaceChildren(...children){this.children=[...children]},
   scrollIntoView(){actions.scrolled=this.tag},
   focus(){actions.focused=true},
   querySelector(){return {open:false}}
  };
 }
 const document={
  createElement:tag=>node(tag),
  getElementById:id=>{if(!cache.has(id))cache.set(id,node(id));return cache.get(id)}
 };
 const window={};
 runInNewContext(module,{window,document,console,Number,Math,String,Object});
 return {window,document,cache,actions};
}
const workflow={
 sku:'TRC1525',itemId:'22095398152',modelId:'0',
 productTitle:'Piscina Inflável Infantil Quadrada Azul Top Rio 210 Litros',
 imageUrls:['https://cf.shopee.com.br/file/piscina'],
 imageCount:5,categoryId:'123',
 supplierProduct:{name:'Piscina Inflável - Azul',brand:'Top Rio',
   catalogMeasurements:{heightCm:13,widthCm:33,lengthCm:36}},
 sourceFacts:{metrics:[{name:'Dimensões do produto (A × L × C)',value:'43 x 135 x 88 cm'},
    {name:'Capacidade',value:'210 litros'}]},
 attributes:[{name:'Material',values:[{name:'Plástico'}]},{name:'Marca',values:[{name:'Novo'}]}],
 stages:[
  {key:'images',name:'Imagens comerciais',reviewed:false,skipped:false},
  {key:'video',name:'Vídeo',reviewed:true,skipped:false},
  {key:'technical',name:'Ficha técnica',reviewed:false,skipped:false},
  {key:'fiscal',name:'Informações fiscais',reviewed:true,skipped:false}
 ],
 taxSuggestion:{ncm:'95069900',same_state_cfop:'5106',csosn:'102',origin:'2'},
 taxDraft:{ncm:'95069900',cest:''}
};
test('new dashboard is integrated without removing existing workflow, fiscal batch, and API execution',()=>{
 assert.match(html,/id="optimizerSkuDashboard"/);
 assert.match(html,/src="\/optimizer-dashboard\.js\?v=1\.20\.11"/);
 assert.ok(html.indexOf('/optimizer-dashboard.js')<html.indexOf('/app.js?v=1.20.11'));
 assert.match(html,/id="optimizerWorkflowPanel"/);
 assert.match(html,/id="optimizerExecutionLaunch"/);
 assert.match(html,/id="optimizerFiscalBatchExecute"/);
 assert.match(app,/OptimizerSkuDashboard\?\.workflow\?\.\(data\)/);
 assert.match(app,/OptimizerSkuDashboard\?\.execution\?\.\(progress,job\)/);
 assert.match(app,/OptimizerSkuDashboard\?\.reset\?\.\(\)/);
 assert.doesNotMatch(module,/fetch\(|XMLHttpRequest|update_item|execute\//);
});
test('render reads official SKU and rectangular title, never fake round pool or mock prices',()=>{
 const p=nodes();
 p.window.OptimizerSkuDashboard.bind({openStage:key=>p.actions.stage=key,openExecution:()=>p.actions.execution=true});
 p.window.OptimizerSkuDashboard.workflow(workflow);
 const get=id=>p.document.getElementById(id);
 assert.equal(get('optimizerSkuDashboard').hidden,false);
 assert.equal(get('optimizerDashSku').textContent,'TRC1525');
 assert.match(get('optimizerDashTitle').textContent,/Quadrada/);
 assert.doesNotMatch(get('optimizerDashTitle').textContent,/Redonda/);
 assert.equal(get('optimizerDashImages').textContent,'5 / 9');
 assert.match(get('optimizerDashImageCaption').textContent,/não representam imagens geradas/);
 assert.equal(get('optimizerDashReviewed').textContent,'2 / 4');
 assert.equal(get('optimizerDashTechnicalStatus').textContent,'A revisar');
 assert.equal(get('optimizerDashFiscalStatus').textContent,'Salvo no Motor Matriz');
 assert.equal(get('optimizerDashImage').src,'https://cf.shopee.com.br/file/piscina');
 assert.ok(get('optimizerDashFacts').children.some(x=>x.children[1]?.textContent==='43 x 135 x 88 cm'));
 assert.ok(get('optimizerDashFacts').children.some(x=>x.children[1]?.textContent==='13 × 33 × 36 cm'));
 assert.match(get('optimizerDashFacts').children.find(x=>x.children[1]?.textContent==='13 × 33 × 36 cm').children[2].textContent,/Não confundir/);
 get('optimizerDashTechnicalOpen').onclick();
 assert.equal(p.actions.stage,'technical');
 get('optimizerDashFiscalBatchOpen').onclick();
 assert.equal(p.actions.execution,true);
 assert.equal(get('optimizerFiscalBatch').open,true);
});
test('images in media do not masquerade as published; API verified marks confirmation',()=>{
 const p=nodes();const q=p.document.getElementById;
 p.window.OptimizerSkuDashboard.bind({openStage:()=>{},openExecution:()=>{}});
 p.window.OptimizerSkuDashboard.workflow(workflow);
 p.window.OptimizerSkuDashboard.execution({
  hasStarted:true,imagesTotal:9,imagesUploaded:2,imagesPublished:0,
  verified:false,message:'2 imagens enviadas à mídia Shopee; anúncio ainda não atualizado.'
 },{state:'running'});
 assert.equal(q('optimizerDashImages').textContent,'2 / 9');
 assert.match(q('optimizerDashImageCaption').textContent,/0 publicadas/);
 assert.equal(q('optimizerDashStatus').textContent,'Em andamento');
 p.window.OptimizerSkuDashboard.execution({
  hasStarted:true,imagesTotal:9,imagesUploaded:9,imagesPublished:9,
  verified:true,message:'Atualização verificada pela Shopee.'
 },{state:'verified'});
 assert.match(q('optimizerDashImageCaption').textContent,/confirmadas/);
 assert.equal(q('optimizerDashStatus').textContent,'Confirmado na Shopee');
 p.window.OptimizerSkuDashboard.reset();
 assert.equal(q('optimizerSkuDashboard').hidden,true);
});
