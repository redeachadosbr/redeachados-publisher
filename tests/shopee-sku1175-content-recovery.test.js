import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {composeShopeeDescription,isGenericShopeeDescription} from '../shopeeDescriptionComposer.js';
import {validateContentRules,validateReview,codePointCount} from '../shopeeOptimizationWorkflow.js';
import {getWorkflowReview,saveWorkflowReview} from '../shopeeOptimizationWorkflowStore.js';

const root=new URL('../',import.meta.url);
const text=path=>readFileSync(new URL(path,root),'utf8');
const sku='1175';
const name='Bola Futebol Infantil Vinil N2 DDG5102 Macia Inflável Criança 3+ Sortida';
const supplier={supplier_sku:sku,product_data:{
 name,brand:'DDG',catalogMeasurements:{heightCm:'8',widthCm:'8',lengthCm:'8'}
}};
const sourceText=[
 'Marca: DDM Toys',
 'Material: Vinil (PVC)',
 'Tamanho: Nº 2',
 'Cor: Sortida',
 'Indicação de idade: +3 anos',
 'Enchimento: Inflável (enviada vazia)',
 'Registro INMETRO: 012166/2025',
 'Conteúdo: 01 Bola de Futebol Infantil Nº 2'
].join('\n');

test('títulos curtos válidos passam sem truncar emoji; somente mais de 120 bloqueia',()=>{
 const short='Bola Futebol Infantil Nº 2 de Vinil ⚽';
 assert.equal(validateReview({stage:'seo',reviewed:true,title:short}).title,short);
 assert.throws(()=>validateReview({stage:'seo',reviewed:true,title:'Bola '.repeat(30)}),/120/);
 assert.equal(codePointCount('⚽'),1);
});

test('sugestões não incluem códigos internos; manter tamanhos e potências pesquisáveis',()=>{
 const input=text('public/title-studio.js')
  .replace("globalThis.ShopeeTitleStudio={open};",
           "globalThis.ShopeeTitleStudio={open,cleanForTest:withoutInternalCode};");
 const context={};
 new Function('globalThis',input)(context);
 const cleaned=context.ShopeeTitleStudio.cleanForTest(name+' SKU 1175','1175');
 assert.doesNotMatch(cleaned,/DDG5102|1175/);
 assert.match(cleaned,/N2/);
 assert.match(context.ShopeeTitleStudio.cleanForTest('Passadeira a Vapor 800W 127V',''),/800W 127V/);
});

test('SKU 1175 recebe descrição específica com prova da fonte e medida logística distinguida',()=>{
 const result=composeShopeeDescription({record:{title:name,description:''},supplier,sourceText});
 assert.equal(result.valid,true);
 assert.ok(result.characterCount>=1400&&result.characterCount<=1440);
 validateContentRules({description:result.description});
 for(const term of ['vinil (PVC)','Nº 2','3 anos','enviada vazia','012166/2025','cadastro logístico','8 × 8 × 8 cm'])
   assert.ok(result.description.includes(term),'falta '+term);
 assert.doesNotMatch(result.description,/diâmetro inflado[:\s]+\d+/i);
 assert.match(result.description,/INMETRO informado pelo fornecedor/);
 assert.ok(result.warnings.some(x=>x.includes('Divergência de marca')));
 assert.ok(result.warnings.some(x=>x.includes('não verificado em base oficial')));
});

test('modelo genérico antigo é identificável, mas texto manual não é removido',()=>{
 const legacy=[
  '✨ Descrição do produto',
  '✨ Conheça Bola, uma opção para quem busca praticidade e quer conferir as características do produto',
  '1. ✨ Informações reunidas em um anúncio',
  '7. Consulte dados e medidas'
 ].join('\n');
 assert.equal(isGenericShopeeDescription(legacy),true);
 assert.equal(isGenericShopeeDescription('Descrição autoral da Bola Nº 2 em vinil e PVC'),false);
 const server=text('server.js');
 assert.match(server,/staleGeneric&&composed\.valid/);
 assert.match(server,/descriptionOrigin!=='manual'/);
 assert.match(server,/previousGeneratedDescription:storedDescription/);
 assert.match(server,/stage:'description',reviewed:false/);
});

test('salvar textos manuais não perde outro estágio e invalidar aprovação só quando mudou',async()=>{
 const previous={url:process.env.SUPABASE_URL,key:process.env.SUPABASE_SECRET_KEY,fetch:globalThis.fetch};
 process.env.SUPABASE_URL='https://fixture.supabase.co';
 process.env.SUPABASE_SECRET_KEY='fixture-secret';
 let row={shop_id:8,item_id:58271056583,model_id:0,sku,
  review_state:{stages:{seo:{reviewed:true},description:{reviewed:true},
   fiscal:{reviewed:true}},tax:{ncm:'95066200'},draftTitle:'Título antigo',
   draftDescription:'Descrição antiga'}};
 globalThis.fetch=async (_url,options={})=>{
  if(options.method==='POST'){
   row=JSON.parse(options.body)[0];
   return new Response(null,{status:201});
  }
  return new Response(JSON.stringify([{sku,review_state:row.review_state,
   updated_at:'2026-10-21T19:59:00Z'}]),{status:200});
 };
 try{
  const changed='Bola Futebol Infantil Nº 2 ⚽';
  await saveWorkflowReview(8,58271056583,0,sku,{stage:'seo',reviewed:false,title:changed,titleOrigin:'manual'});
  await saveWorkflowReview(8,58271056583,0,sku,{stage:'description',reviewed:false,
   description:'Texto digitado manualmente',descriptionOrigin:'manual'});
  const saved=await getWorkflowReview(8,58271056583,0);
  assert.equal(saved.review_state.draftTitle,changed);
  assert.equal(saved.review_state.draftDescription,'Texto digitado manualmente');
  assert.equal(saved.review_state.descriptionOrigin,'manual');
  assert.equal(saved.review_state.stages.seo.reviewed,false);
  assert.equal(saved.review_state.stages.description.reviewed,false);
  assert.equal(saved.review_state.stages.fiscal.reviewed,true);
  assert.equal(saved.review_state.tax.ncm,'95066200');
 }finally{
  globalThis.fetch=previous.fetch;
  if(previous.url===undefined)delete process.env.SUPABASE_URL;else process.env.SUPABASE_URL=previous.url;
  if(previous.key===undefined)delete process.env.SUPABASE_SECRET_KEY;else process.env.SUPABASE_SECRET_KEY=previous.key;
 }
});

test('UI de digitação e transição usa autosave e recuperação local por SKU',()=>{
 const js=text('public/app.js'),html=text('public/index.html');
 const server=text('server.js');
 assert.match(js,/function optimizerContentRemember\(\)/);
 assert.match(js,/function optimizerContentRestore\(w\)/);
 assert.match(js,/optimizerContentQueue=/);
 assert.match(js,/localStorage\.setItem\(optimizerContentKey/);
 assert.match(js,/optimizerContentRestore\(data\)/);
 assert.match(js,/await optimizerContentFlush\(\)/);
 assert.match(js,/dispatchEvent\(new Event\('input'/);
 assert.match(server,/\/api\/shopee\/optimizer\/workflow\/content-draft/);
 assert.match(server,/stage,reviewed:false/);
 assert.match(html,/\/app\.js\?v=1\.20\./);
});
