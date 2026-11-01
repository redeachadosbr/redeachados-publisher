import test from 'node:test';
import assert from 'node:assert/strict';
import {supplierProductDimensions,supplierAttributeSuggestions} from '../shopeeSupplierEvidenceFacts.js';
import {legacyCircularDimensionCorrection} from '../shopeeOptimizationWorkflowStore.js';
import {kitPrincipalTechnicalEvidence} from '../shopeeKitTechnicalEvidence.js';

const sku='1.26088.80.0001',kitSku='KIT-126051011000-126088800001-TRC0663';
const itemId='58222014306';
const notes='Para quem busca higiene no banheiro. Foi desenvolvida para higienizar vasos sanitários com eficiência. '+
 'O conjunto possui base com tampa e cabo em aço inox. Itens Inclusos: -01 Escova -01 Suporte '+
 'Especificações: Dimensões: 37cm altura x 9cm diâmetro Tipo: Escova sanitária com suporte '+
 'Indicação: Higienização de vasos sanitários Composição: PP, PET, Ferro e aço inox '+
 'Cor: Branca (matte) Peso: 300g Contém: 01 Escova Sanitária Matte com Suporte - Branca';
const attr=(id,name,inputType=3)=>({id,name,inputType,formatType:0,validationType:0,options:[],values:[],allowedUnits:[]});

test('fatos da SKU principal são lidos somente do kit vinculado/selecionado',()=>{
 const link={kitSku,mainSku:sku,itemId};
 const draft={kitSku,skus:[sku,'1.26051.01.1000','TRC0663'],
  optimization:link,creative:{manualFacts:{[sku]:notes,TRC0663:'Outro produto'}}};
 const combined=kitPrincipalTechnicalEvidence({kitDraft:draft,kitLink:link,sku,itemId,sourceText:''});
 assert.equal(combined,notes);
 assert.equal(kitPrincipalTechnicalEvidence({kitDraft:draft,kitLink:link,sku:'TRC0663',itemId}), '');
});
test('indicação e medidas da escova são convertidas para campos corretos',()=>{
 const dimensions=supplierProductDimensions(notes);
 assert.deepEqual([dimensions?.length,dimensions?.width,dimensions?.height],['9','9','37']);
 assert.equal(dimensions?.derivedFromDiameter,true);
 const fields=[
  attr(100942,'Dimension (L x W x H)'),
  attr(101029,'Indicação de uso'),
  attr(100828,'Atributo da categoria nº 100828'),
  attr(103012,'Modelo')];
 const result=supplierAttributeSuggestions({
  attributes:fields,supplier:{supplier_sku:sku,source_file:'catálogo WeDrop',product_data:{}},
  sourceText:notes,productDescription:''});
 const get=id=>result.suggestions.find(s=>Number(s.attributeId)===id);
 assert.equal(get(100942)?.values?.[0]?.valueName,'9 x 9 x 37 cm');
 assert.match(get(100942)?.evidence||'',/diâmetro/i);
 assert.equal(get(101029)?.values?.[0]?.valueName,'Higienização de vasos sanitários');
 assert.equal(get(100828),undefined,'atributo sem descrição não pode ser inventado');
 assert.equal(get(103012),undefined,'sem código de modelo confirmado');
});
test('não usa dimensões de embalagem para preencher dimensão do produto',()=>{
 assert.equal(supplierProductDimensions('Dimensões da embalagem: 37cm altura x 9cm diâmetro'),null);
});
test('apenas um rascunho antigo equivalente pode ser normalizado, nunca escolhas diferentes',()=>{
 const attrMeta=attr(100942,'Dimension (L x W x H)');
 const suggested={values:[{valueId:0,valueName:'9 x 9 x 37 cm'}],
  evidence:'Dimensões WeDrop: altura e diâmetro; comprimento/largura derivados do diâmetro circular.'};
 const old={enabled:true,userDisabled:false,values:[{valueId:0,valueName:'37cm altura x 9cm diâmetro '}]};
 assert.equal(legacyCircularDimensionCorrection(attrMeta,old,suggested),true);
 assert.equal(legacyCircularDimensionCorrection(attrMeta,{...old,values:[{valueId:0,valueName:'35 x 8 x 8 cm'}]},suggested),false);
 assert.equal(legacyCircularDimensionCorrection(attrMeta,{...old,userDisabled:true},suggested),false);
 assert.equal(legacyCircularDimensionCorrection(attr(100942,'Modelo'),old,suggested),false);
});
