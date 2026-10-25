import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {
 validateVariationName,variationImagePrompt,validateVariationDetails,reviewedVariationEvidence,variationSupplierIdentity,buildVariationPayload
} from '../shopeeVariationMedia.js';

const asset={storagePath:'123/456/0/variations/fe30c932-1122-44ab-88dd-aabb99887766.png',
 mime:'image/png',sha256:'a'.repeat(64)};
const details={type:'Cor',options:[{
 name:'Rosa',price:745.99,stock:1,sku:'SUPER-CAR-ROSA',noGtin:true,gtin:'',
 stockConfirmed:true,photoConfirmed:true,asset
}]};
test('publicação usa estoque 1 e o image_id correto por opção',()=>{
 const checked=validateVariationDetails(details,{requirePhotos:true});
 const payload=buildVariationPayload('58221125342',checked,['image-rose-123']);
 assert.equal(payload.model[0].seller_stock[0].stock,1);
 assert.equal(payload.model[0].original_price,745.99);
 assert.equal(payload.model[0].model_sku,'SUPER-CAR-ROSA');
 assert.equal(payload.tier_variation[0].option_list[0].image.image_id,'image-rose-123');
 assert.equal(payload.standardise_tier_variation[0].variation_id,0);
 assert.equal(payload.standardise_tier_variation[0].variation_option_list[0].variation_option_name,'Rosa');
 assert.ok(!('gtin_code' in payload.model[0]));
});
test('confirmação física e foto são indispensáveis antes de aplicar',()=>{
 assert.throws(()=>validateVariationDetails({...details,options:[{...details.options[0],stockConfirmed:false}]},{requirePhotos:true}),/Confirme/);
 assert.throws(()=>validateVariationDetails({...details,options:[{...details.options[0],photoConfirmed:false}]},{requirePhotos:true}),/Confirme/);
 assert.throws(()=>validateVariationDetails({...details,options:[{...details.options[0],asset:null}]},{requirePhotos:true}),/Foto pendente/);
 assert.throws(()=>validateVariationDetails({...details,options:[{...details.options[0],stock:0}]},{requirePhotos:true}),/pelo menos 1/);
});
test('rejeita GTIN inválido, duplicatas e SKUs iguais',()=>{
 assert.throws(()=>validateVariationDetails({...details,options:[{...details.options[0],noGtin:false,gtin:'abc'}]}),/GTIN/);
 assert.throws(()=>validateVariationDetails({...details,options:[details.options[0],{...details.options[0],name:'rosa'}]}),/repetidas/);
 assert.throws(()=>validateVariationDetails({...details,options:[details.options[0],{...details.options[0],name:'Azul'}]}),/SKU diferente/);
});
test('prompt preserva geometria e solicita apenas a característica da opção',()=>{
 const p=variationImagePrompt({title:'Moto Elétrica Infantil 6V Vintage'},'Cor','Rosa');
 assert.match(p,/1200x1200/);
 assert.match(p,/Cor = Rosa/);
 assert.match(p,/SOMENTE a característica/);
 assert.match(p,/geometria/);
});
test('interface contém upload, geração, prévia e confirmação de estoque',()=>{
 const html=readFileSync(new URL('../public/index.html',import.meta.url),'utf8');
 const js=readFileSync(new URL('../public/optimizer-variations.js',import.meta.url),'utf8');
 const app=readFileSync(new URL('../public/app.js',import.meta.url),'utf8');
 assert.match(html,/optimizer-variations\.js\?v=[\d.]+/);
 assert.match(js,/Gerar foto IA/);
 assert.match(js,/Incluir foto/);
 assert.match(js,/Estoque \(mínimo 1\)/);
 assert.match(js,/Confirmei pelo fornecedor/);
 assert.doesNotMatch(js,/\/api\/shopee\/optimizer\/variants\/apply/);
 assert.doesNotMatch(js,/Aplicar variações na Shopee|Conferir envio pela API/);
 assert.match(js,/prévia e execução únicas/);
 assert.match(js,/saveDraft:persist/);
 assert.match(app,/await globalThis\.RedeVariants\.saveDraft\(\)/);
 assert.match(app,/optimizerSaveChecklistReview/);
 assert.match(app,/\/api\/shopee\/optimizer\/execution\/prepare/);
 assert.match(app,/RedeVariants\?\.load/);
});

test('novo anúncio exige opção original e nova opção no preview; não apaga a cor Vermelha',()=>{
 const server=readFileSync(new URL('../server.js',import.meta.url),'utf8');
 assert.match(server,/Para criar variações sem apagar a opção original/);
 assert.match(server,/Informe a opção original e a nova variação/);
});

test('TUD0887: revisão geral posterior às imagens cobre confirmação por opção',()=>{
 const assetFor=(time,hash)=>({storagePath:'852701218/58221373138/0/variations/'+hash+'.png',
  sha256:hash,savedAt:time});
 const options=[
  {name:'Vermelha',sku:'TUD0887-VERMELHA',supplierSku:'TUD0888',gtin:'7898696008881',
   price:270.99,stock:1,photoConfirmed:false,stockConfirmed:false,
   asset:assetFor('2026-10-25T17:01:18.853Z','f72bae')},
  {name:'Azul',sku:'TUD0887-AZUL',supplierSku:'TUD0887',gtin:'7898696008874',
   price:270.99,stock:1,photoConfirmed:false,stockConfirmed:false,
   asset:assetFor('2026-10-25T16:56:34.127Z','c17b00')}
 ];
 const approvedReview={reviewed:true,reviewedAt:'2026-10-25T17:01:34.599Z'};
 const reviewed={type:'Cor',updatedAt:'2026-10-25T17:01:07.231Z',options};
 assert.equal(reviewedVariationEvidence(reviewed,approvedReview),true);
 assert.equal(validateVariationDetails(reviewed,{requirePhotos:true,approvedReview}).options.length,2);
 assert.throws(()=>validateVariationDetails(reviewed,{requirePhotos:true}),/Confirme foto/);
 assert.equal(reviewedVariationEvidence({...reviewed,updatedAt:'2026-10-25T17:02:00.000Z'},approvedReview),false);
 assert.equal(reviewedVariationEvidence({...reviewed,options:[{...options[0],asset:assetFor('2026-10-25T17:03:00.000Z','new')},options[1]]},approvedReview),false);
 assert.throws(()=>validateVariationDetails({...reviewed,options:[{...options[0],asset:null},options[1]]},{requirePhotos:true,approvedReview}),/Foto pendente/);
});
test('a preparação confere a revisão geral e o vínculo exato SKU/EAN por cor',async()=>{
 const {readFileSync}=await import('node:fs');
 const server=readFileSync(new URL('../server.js',import.meta.url),'utf8');
 const client=readFileSync(new URL('../public/app.js',import.meta.url),'utf8');
 assert.match(server,/approvedReview:reviewState\.stages\?\.variants/);
 assert.match(server,/variationSupplierIdentity\(/);
 assert.match(server,/variationEvidenceApproved\(/);
 assert.match(server,/supplierEan=/);
 assert.match(server,/\^\[0-9\]\{8,14\}\$/);
 assert.doesNotMatch(server,/TUD0887/);
 assert.match(client,/optimizerExecAutoModelPreview\?\.needsBasePriceUpdate/);
 assert.match(server,/fresh\.needsBasePriceUpdate&&req\.body\?\.allowPriceChange!==true/);
});

test('Motor Matriz: SKU e EAN válidos vencem diferenças de título em diversas categorias',()=>{
 const cases=[
  {parentName:'Patinete Infantil 3 Rodas com LED - Azul',
   supplierName:'Patinete Speed Fun com Luzes LED - Vermelha',
   originalOption:'Azul',optionName:'Vermelha',expectedEan:'7898696008881',sourceEan:'7898696008881'},
  {parentName:'Tênis Esportivo Corrida Azul',
   supplierName:'Tênis Casual Conforto Azul',
   originalOption:'Azul',optionName:'Azul',expectedEan:'7891234567890',sourceEan:'7891234567890'},
  {parentName:'Garrafa Térmica 900ml - Preta',
   supplierName:'Garrafa de Água Premium - Branca',
   originalOption:'Preta',optionName:'Branca',expectedEan:'7892222222222',sourceEan:'7892222222222'},
  {parentName:'Brinquedo Patinete 3 Rodas Rosa',
   supplierName:'Brinquedo Patinete 3 Rodas Azul',
   originalOption:'Rosa',optionName:'Azul',expectedEan:'7893333333333',sourceEan:'7893333333333'},
  {parentName:'Bicicleta Infantil Aro 16 Vermelha',
   supplierName:'Bicicleta Infantil Aro 16 Azul',
   originalOption:'Vermelha',optionName:'Azul',expectedEan:'7894444444444',sourceEan:'7894444444444'}
 ];
 for(const input of cases){
  assert.equal(variationSupplierIdentity({...input,reviewed:true}).ok,true,input.supplierName);
 }
});
test('Motor Matriz: nunca aceitar EAN divergente, opção trocada ou aprovação inexistente',()=>{
 const sample={parentName:'Patinete Infantil LED Azul',supplierName:'Patinete Speed Fun Vermelha',
  originalOption:'Azul',optionName:'Vermelha',expectedEan:'7898696008881',sourceEan:'7898696008881'};
 assert.equal(variationSupplierIdentity({...sample,sourceEan:'7898696008874',reviewed:true}).ok,false);
 assert.equal(variationSupplierIdentity({...sample,optionName:'Preta',reviewed:true}).ok,false);
 assert.equal(variationSupplierIdentity({...sample,reviewed:false}).ok,false);
 assert.equal(variationSupplierIdentity({...sample,expectedEan:'',reviewed:true}).ok,false);
 assert.equal(variationSupplierIdentity({...sample,sourceEan:'',reviewed:true}).ok,false);
 const sameTitle={parentName:'Liquidificador Portátil Azul',
  supplierName:'Liquidificador Portátil Vermelho',originalOption:'Azul',
  optionName:'Vermelho',reviewed:false};
 assert.equal(variationSupplierIdentity(sameTitle).ok,true);
});
test('Motor Matriz: aprovação global caduca quando o rascunho ou a foto mudar',()=>{
 const preview={type:'Cor',updatedAt:'2026-10-25T10:00:00Z',options:[
  {name:'Preta',sku:'ABC-P',supplierSku:'SKU-P',price:199.99,stock:1,gtin:'7895555555555',
   photoConfirmed:false,stockConfirmed:false,
   asset:{storagePath:'1/2/0/variations/a.png',sha256:'abc',savedAt:'2026-10-25T10:01:00Z'}},
  {name:'Branca',sku:'ABC-B',supplierSku:'SKU-B',price:199.99,stock:1,gtin:'7896666666666',
   photoConfirmed:false,stockConfirmed:false,
   asset:{storagePath:'1/2/0/variations/b.png',sha256:'def',savedAt:'2026-10-25T10:02:00Z'}}
 ]};
 const reviewed={reviewed:true,reviewedAt:'2026-10-25T10:03:00Z'};
 assert.doesNotThrow(()=>validateVariationDetails(preview,{requirePhotos:true,approvedReview:reviewed}));
 assert.throws(()=>validateVariationDetails({...preview,updatedAt:'2026-10-25T10:04:00Z'},
  {requirePhotos:true,approvedReview:reviewed}),/Confirme foto/);
 assert.throws(()=>validateVariationDetails({...preview,options:[
  {...preview.options[0],asset:{...preview.options[0].asset,savedAt:'2026-10-25T10:05:00Z'}},
  preview.options[1]]},{requirePhotos:true,approvedReview:reviewed}),/Confirme foto/);
});
test('Motor Matriz: desconto e preço bruto não dependem da mudança do preço das variações',async()=>{
 const {readFileSync}=await import('node:fs');
 const server=readFileSync(new URL('../server.js',import.meta.url),'utf8');
 const client=readFileSync(new URL('../public/app.js',import.meta.url),'utf8');
 assert.match(client,/needsBasePriceUpdate\|\|/);
 assert.match(client,/modelPriceChange/);
 assert.match(server,/req\.body\?\.campaignId\|\|approvedCampaignId\|\|/);
 assert.match(server,/fresh\.needsBasePriceUpdate&&req\.body\?\.allowPriceChange!==true/);
});
