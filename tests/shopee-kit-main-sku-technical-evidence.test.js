import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {kitPrincipalTechnicalEvidence} from '../shopeeKitTechnicalEvidence.js';
import {supplierAttributeSuggestions} from '../shopeeSupplierEvidenceFacts.js';

const kitSku='KIT-107500-GH643-TRC0366',sku='107500',itemId='987654';
const primary=[
 'Coqueteleira fabricada em aço inoxidável.',
 'Capacidade: 500 ml','Peso: 210 g',
 'Dimensões: 22cm de altura x 8,5cm de largura x 8,5cm de comprimento'
].join('\n');
const draft={kitSku,skus:['107500','GH643','TRC0366'],
 creative:{manualFacts:{'107500':primary,'GH643':'Capacidade: 350 ml','TRC0366':'Capacidade: 150 ml'}},
 optimization:{kitSku,mainSku:sku,itemId}};
const link={kitSku,mainSku:sku,itemId};
const attr=(id,name,opts={})=>({id,name,inputType:3,validationType:2,values:[],options:[],...opts});
const supplier={source_file:'catalogo.csv',supplier_sku:sku,
 product_data:{name:'Coqueteleira Drinks Inox 500 ml'}};

test('ficha do KIT considera somente a SKU principal e preserva evidencia existente',()=>{
 const combined=kitPrincipalTechnicalEvidence({kitDraft:draft,kitLink:link,sku,itemId,
  sourceText:'Indicação: Drinks em casa'});
 assert.match(combined,/500 ml/);
 assert.match(combined,/Indicação: Drinks em casa/);
 assert.doesNotMatch(combined,/350 ml|150 ml/);
 assert.equal(kitPrincipalTechnicalEvidence({kitDraft:draft,kitLink:link,sku:'GH643',itemId,sourceText:'original'}),'original');
 assert.equal(kitPrincipalTechnicalEvidence({kitDraft:draft,kitLink:link,sku,itemId:'999',sourceText:'original'}),'original');
 assert.equal(kitPrincipalTechnicalEvidence({kitDraft:{...draft,optimization:{...link,itemId:'123'}},kitLink:link,sku,itemId,sourceText:'original'}),'original');
 assert.equal(kitPrincipalTechnicalEvidence({kitDraft:draft,kitLink:link,sku,itemId,sourceText:primary}),primary);
});

test('Volume Capacity aceita ml da SKU principal, peso e material declarados',()=>{
 const attributes=[
  attr(1,'Volume Capacity',{validationType:3,formatType:2,allowedUnits:['ML','L']}),
  attr(2,'Material'),attr(3,'Product Weight'),
  attr(4,'Dimension (L x W x H)'),attr(5,'Cup Capacity')];
 const sourceText=kitPrincipalTechnicalEvidence({kitDraft:draft,kitLink:link,sku,itemId});
 const res=supplierAttributeSuggestions({attributes,supplier,sourceText,
  productDescription:'KIT: Forma 150 ml e 2 copos 350 ml'});
 const byId=id=>res.suggestions.find(x=>x.attributeId===id)?.values?.[0];
 assert.deepEqual({value:byId(1)?.valueName,unit:byId(1)?.unit},{value:'500',unit:'ML'});
 assert.equal(byId(2)?.valueName,'aco inoxidavel');
 assert.equal(byId(3)?.valueName,'210 g');
 assert.equal(byId(4)?.valueName,'8.5 x 8.5 x 22 cm');
 assert.equal(byId(5),undefined,'coqueteleira nao e copo');
 assert(!JSON.stringify(res.suggestions).includes('350 ml'));
 assert(!JSON.stringify(res.suggestions).includes('150 ml'));
});

test('nao atribuir unidade nao aprovada pela categoria',()=>{
 const res=supplierAttributeSuggestions({supplier,sourceText:primary,
  attributes:[attr(8,'Volume Capacity',{formatType:2,validationType:3,allowedUnits:['KG']})]});
 assert.equal(res.suggestions.length,0);
 assert.match(res.unresolved[0]?.reason||'',/unidade/i);
});

test('rota tecnicas integra a fonte do kit somente no rascunho, sem alterar origem',()=>{
 const server=readFileSync(new URL('../server.js',import.meta.url),'utf8');
 assert.match(server,/kitPrincipalTechnicalEvidence\(/);
 assert.match(server,/sourceText:technicalSourceText/);
 assert.match(server,/sourceText:sourceEvidence\.sourceText\}\)/);
});
