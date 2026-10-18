import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {buildStages,descriptionDraft,safeTitle,validateReview,STAGE_IDS} from '../shopeeOptimizationWorkflow.js';
const example={itemId:'22095398152',sku:'TRC1525',selectedModelId:'179732416931',
  title:'Piscina Inflável - Azul',imageCount:5,
  videoStatus:'Não confirmado pela API (não significa ausência de vídeo)',
  categoryId:101725,descriptionPresent:true,
  attributeAudit:{total:9,missingMandatory:0,review:0,attributes:[
    {name:'Dimension (L x W x H)',state:'missing',mandatory:false},
    {name:'Recommended Age',state:'missing',mandatory:false},
    {name:'Material',state:'filled',mandatory:false}
  ]}
};
test('TRC1525 oferece 9 etapas com mídia pendente e atributos não inventados',()=>{
 const stages=buildStages(example);
 assert.equal(stages.length,9);
 assert.deepEqual(stages.map(s=>s.key),[...STAGE_IDS]);
 const images=stages[0],video=stages[1],technical=stages[4];
 assert.equal(images.blocking,true);
 assert.match(images.detail,/5 de 9/);
 assert.equal(video.blocking,false);
 assert.match(video.detail,/Não confirmado/);
 assert.match(technical.detail,/0 obrigatório/);
 assert.match(technical.detail,/2 opcionais/);
 assert.equal(stages.at(-1).blocking,true);
});
test('título e descrição não inventam capacidade, idade nem medidas',()=>{
 assert.equal(safeTitle('  Piscina  Inflável  -  Azul   '),'Piscina Inflável - Azul');
 const d=descriptionDraft(example);
 assert.match(d,/Piscina Inflável - Azul/);
 assert.doesNotMatch(d,/\b(?:1000 litros|120 cm|3 anos|PVC reforçado)\b/i);
 assert.ok(d.length<3000);
});
test('status de revisão salvo não implica aplicação na Shopee',()=>{
 const stages=buildStages(example,{stages:{seo:{reviewed:true,reviewedAt:'2026-10-17T05:00:00Z'}}});
 assert.equal(stages.find(s=>s.key==='seo').reviewed,true);
 assert.equal(stages.find(s=>s.key==='images').status,'attention');
 assert.throws(()=>validateReview({stage:'final',reviewed:true}),/publicação/);
 const title='Piscina Inflável Infantil Quadrada 210 Litros Azul Top Rio 💦 Para Crianças no Quintal ou Jardim, Lazer e Sol no Verão ☀️';
 assert.throws(()=>validateReview({stage:'seo',reviewed:true,title:'Piscina Inflável Azul'}),/120 caracteres/);
 assert.deepEqual(validateReview({stage:'seo',reviewed:true,title}),{
   stage:'seo',reviewed:true,title,description:undefined
 });
 assert.throws(()=>validateReview({stage:'seo',reviewed:false,title:''}),/Título/);
});
test('UI tem controles reais para abrir, copiar e salvar revisão persistente',()=>{
 const html=readFileSync(new URL('../public/index.html',import.meta.url),'utf8');
 const js=readFileSync(new URL('../public/app.js',import.meta.url),'utf8');
 const server=readFileSync(new URL('../server.js',import.meta.url),'utf8');
 for(const id of ['optimizerWorkflowPanel','optimizerWorkflowCounter','optimizerWorkflowCards',
  'optimizerWorkflowEditor','optimizerWorkflowDraft','optimizerWorkflowCopy',
  'optimizerWorkflowReview','optimizerWorkflowStatus']){
    assert.equal((html.match(new RegExp('id="'+id+'"','g'))||[]).length,1,id);
 }
 assert.match(js,/optimizerWorkflowLoad\(data.record\)/);
 assert.match(js,/optimizerWorkflowRender/);
 assert.match(js,/shopee\/optimizer\/workflow\/review/);
 assert.match(server,/app\.get\('\/api\/shopee\/optimizer\/workflow'/);
 assert.match(server,/app\.post\('\/api\/shopee\/optimizer\/workflow\/review'/);
 const route=server.slice(server.indexOf("app.post('/api/shopee/optimizer/workflow/review'"),
   server.indexOf("app.post('/api/shopee/optimizer/execution/prepare'"));
 assert.doesNotMatch(route,/update_item|update_model|update_price|update_discount|saveShopeePricePlan/);
 assert.match(route,/marketplaceUpdated:false/);
});

