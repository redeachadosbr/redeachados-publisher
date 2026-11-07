import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {classifyPendingImageEditor} from '../shopeePendingImageEditor.js';
import {findKitDraftsLinkedToItemId} from '../shopeeKitDraftStore.js';

const id='58214696269';
const saved={kitSku:'KIT-C02317261-TRC0726',itemId:id,
 mainSku:'C02317261',title:'Kit Garrafa Térmica e Canecas',
 publication:'local_draft',components:['C02317261','TRC0726'],optimized:false};

test('kit confirmado pelo Item ID abre o kit certo, mesmo sem Kit no título',()=>{
 const route=classifyPendingImageEditor({itemId:id,sku:'C02317261',
  title:'Garrafa térmica completa',linkedKits:[saved]});
 assert.equal(route.kind,'kit');
 assert.equal(route.kitSku,saved.kitSku);
 assert.equal(route.itemId,id);
 assert.equal(route.mainSku,'C02317261');
 assert.equal(route.editable,true);
 assert.equal(route.linkSource,'saved_item_id');
});

test('anúncio individual mantém o otimizador normal; não inferir kit por SKU compartilhada',()=>{
 const route=classifyPendingImageEditor({itemId:'58214696270',sku:'C02317261',
  title:'Garrafa Térmica Individual',linkedKits:[saved]});
 assert.equal(route.kind,'single');
 assert.equal(route.kitSku,undefined);
});

test('Kit no título sem vínculo abre triagem de kits, não escolhe outro rascunho',()=>{
 const route=classifyPendingImageEditor({itemId:'58214696270',
  sku:'C02317261',title:'Kit Garrafa Térmica 190ml 4 Canecas',linkedKits:[saved]});
 assert.equal(route.kind,'kit-unlinked');
 assert.equal(route.kitSku,undefined);
 assert.equal(route.linkSource,'title_only_unverified');
});

test('anúncio da imagem sem rascunho mantém SKU e Item ID para edição direta',()=>{
 const route=classifyPendingImageEditor({itemId:'58214696269',sku:'C02317261',
  title:'Kit Garrafa Térmica 190ml 4 Canecas Vidro Preto Prático Moderno Durável',
  linkedKits:[]});
 assert.equal(route.kind,'kit-unlinked');
 assert.equal(route.itemId,'58214696269');
 assert.equal(route.sku,'C02317261');
 assert.equal(route.kitSku,undefined);
});

test('kit sem rascunho abre editor completo da Shopee sem inventar composição',()=>{
 const app=readFileSync(new URL('../public/app.js',import.meta.url),'utf8');
 const kits=readFileSync(new URL('../public/kit-builder.js',import.meta.url),'utf8');
 const css=readFileSync(new URL('../public/kit-builder.css',import.meta.url),'utf8');
 const html=readFileSync(new URL('../public/index.html',import.meta.url),'utf8');
 assert.match(app,/RAOpenPendingKitDirectEditor=\(editor,mount\)=>/);
 assert.match(app,/void optimizerRunAudit\(id,sku,modelId\)/);
 assert.match(app,/if\(isPendingKitDirect\(sku,id\)\)/);
 assert.match(app,/optimizerWorkflowOpen\('images'\)/);
 assert.match(app,/scope\.value='all';scope\.disabled=false/);
 assert.match(app,/if\(!isPendingKitDirect\(expectedSku,item\)\)/);
 assert.match(app,/const execution=\$\('#optimizerShowExecution'\);if\(execution\)execution\.hidden=false/);
 assert.match(app,/const forward=\$\('#optimizerWorkflowNext'\);if\(forward\)forward\.hidden=false/);
 assert.match(app,/Para alterar PREÇO ou DESCONTO deste kit/);
 assert.match(app,/RAClosePendingKitDirectEditor/);
 assert.match(kits,/kitShowPendingLinkChoice\(handoff\)/);
 assert.match(kits,/RAOpenPendingKitDirectEditor\?\.\(handoff,mount\)/);
 assert.match(kits,/Otimizar anúncio existente — kit/);
 assert.match(kits,/const wizard=\$\('#kitWizard'\);if\(wizard\)wizard\.hidden=true/);
 assert.match(kits,/const wizard=\$\('#kitWizard'\);if\(wizard\)wizard\.hidden=false/);
 assert.match(kits,/imagens, vídeo, título SEO, ficha técnica, descrição, variações e dados fiscais/);
 assert.doesNotMatch(kits,/Não há uma composição salva, editável e compatível/);
 assert.doesNotMatch(css,/#kitPendingDirectEditor #optimizerWorkflowCards > :not\(\[data-stage="images"\]\)/);
 assert.doesNotMatch(css,/#kitPendingDirectEditor #optimizerShowExecution,/);
 assert.match(css,/#tab-kits #kitWizard\[hidden\]\{display:none!important\}/);
 assert.match(css,/#tab-kits \.kit-pending-direct-mount #optimizerWorkflowCards/);
 assert.match(html,/app\.js\?v=3\.5\.69-finance-paid-ledger/);
});
test('vínculo duplicado em dois kits bloqueia seleção arbitrária',()=>{
 const route=classifyPendingImageEditor({itemId:id,sku:'C02317261',title:'Kit Canecas',
  linkedKits:[saved,{...saved,kitSku:'KIT-C02317261-TRC0688'}]});
 assert.equal(route.kind,'ambiguous');
 assert.equal(route.kitSkus.length,2);
});

test('kit já publicado permite revisar o anúncio existente sem publicar outro',()=>{
 const route=classifyPendingImageEditor({itemId:id,title:'Conjunto de utensílios',
  linkedKits:[{...saved,publication:'published'}]});
 assert.equal(route.kind,'kit');
 assert.equal(route.editable,true);
});

test('a busca de kits consulta somente vínculos de Item ID da loja e inclui lotes antigos',async()=>{
 const originalFetch=globalThis.fetch,oldUrl=process.env.SUPABASE_URL,
  oldKey=process.env.SUPABASE_SECRET_KEY;
 process.env.SUPABASE_URL='https://fake.supabase.co';
 process.env.SUPABASE_SECRET_KEY='fake-server-key';
 const urls=[];
 globalThis.fetch=async(url)=>{
  const u=String(url);urls.push(u);
  assert.match(u,/shop_id=eq\.123/);
  assert.match(u,/itemId=eq\.58214696269/);
  let result=[];
  if(u.includes('draft->optimization->>itemId='))result=[{
   kit_sku:saved.kitSku,component_skus:saved.components,updated_at:'2026-11-01',
   draft:{creative:{title:saved.title},optimization:{itemId:id,sku:saved.mainSku},
    publication:{status:'local_draft'},kit:{components:[{sku:saved.mainSku}]}}
  }];
  return new Response(JSON.stringify(result),{status:200,
   headers:{'Content-Type':'application/json'}});
 };
 try{
  const found=await findKitDraftsLinkedToItemId(123,id);
  assert.equal(urls.length,3);
  assert.equal(found.length,1);
  assert.equal(found[0].kitSku,saved.kitSku);
  assert.equal(found[0].mainSku,saved.mainSku);
  await assert.rejects(()=>findKitDraftsLinkedToItemId(123,'invalid'),/Item ID inválido/);
 }finally{
  globalThis.fetch=originalFetch;
  if(oldUrl===undefined)delete process.env.SUPABASE_URL;
  else process.env.SUPABASE_URL=oldUrl;
  if(oldKey===undefined)delete process.env.SUPABASE_SECRET_KEY;
  else process.env.SUPABASE_SECRET_KEY=oldKey;
 }
});

test('otimização pendente confirma Shopee antes de escolher editor e não altera anúncios',()=>{
 const ui=readFileSync(new URL('../public/pending-images.js',import.meta.url),'utf8');
 const app=readFileSync(new URL('../public/app.js',import.meta.url),'utf8');
 const kits=readFileSync(new URL('../public/kit-builder.js',import.meta.url),'utf8');
 const server=readFileSync(new URL('../server.js',import.meta.url),'utf8');
 assert.match(ui,/verifyItem\(row\.itemId,\{force:true\}\)/);
 assert.match(ui,/pending-images\/editor\?/);
 assert.match(ui,/RAOpenPendingImageKit/);
 assert.match(ui,/RAOpenPendingImageSku\(row\.sku\)/);
 assert.match(ui,/editor\.kind==='kit-unlinked'/);
 assert.match(app,/RAOpenPendingImageKit=editor/);
 assert.match(app,/setTab\('kits'\)/);
 assert.match(kits,/__RA_PENDING_IMAGE_KIT_HANDOFF/);
 assert.match(kits,/kitWizardSetStage\(2,\{scroll:true\}\)/);
 assert.match(kits,/resumeLiveVerifiedTarget/);
 assert.match(kits,/kitShowPendingLinkChoice/);
 assert.match(kits,/savedIds\.includes\(itemId\)/);
 assert.doesNotMatch(kits,/document\.querySelector\('a\[data-tab="kits"\]'\)\?\.addEventListener/);
 assert.match(server,/findKitDraftsLinkedToItemId\(auth\.shopId,itemId\)/);
 assert.match(server,/get_item_base_info/);
 assert.doesNotMatch(ui,/\/api\/shopee\/ads\//);
});

test('kit sem composição recupera a etapa 01 e o formulário WeDrop original',()=>{
 const app=readFileSync(new URL('../public/app.js',import.meta.url),'utf8');
 const kit=readFileSync(new URL('../public/kit-builder.js',import.meta.url),'utf8');
 const css=readFileSync(new URL('../public/kit-builder.css',import.meta.url),'utf8');
 assert.match(kit,/kitPendingDirectSourceStep/);
 assert.match(kit,/01 · Informações da WeDrop/);
 assert.match(kit,/sourceMount\.id='kitPendingDirectSourceMount'/);
 assert.match(app,/sourceMount\.append\(sourcePanel\)/);
 assert.match(app,/pendingKitDirectSourceHome\.insertBefore\(sourcePanel/);
 assert.match(app,/const stageOffset=directKit\?1:0/);
 assert.match(css,/#tab-kits \.kit-pending-source-step #optimizerSourcePanel/);
 assert.match(app,/optimizerSourceAction\('text'/);
});
