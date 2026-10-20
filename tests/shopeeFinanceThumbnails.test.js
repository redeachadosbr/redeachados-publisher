import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {matchFinanceAds} from '../financeAdsSweep.js';

function campaign(id,expense,ids,directOrders){
 return {campaignId:id,expense,itemIdList:ids,directOrders,directOrdersObserved:true};
}
test('Fotos da revisão Ads usam somente IDs oficiais sem mudar qualquer despesa ou atribuição',()=>{
 const finance={catalogProducts:[
  {sku:'TRC1525',itemId:'10001'},
  {sku:'AR0235',itemId:'10002'}
 ],skuSummary:[]};
 const ads={campaigns:[
  campaign('22',29.42,['10001'],0),
  campaign('23',21.70,['10001','10002'],2),
  campaign('24',5.90,[],0)
 ]};
 const result=matchFinanceAds(finance,ads);
 assert.equal(result.spendTotal,57.02);
 assert.equal(result.spendWithoutDirectConversions,35.32);
 assert.equal(result.spendUnassigned,21.70);
 assert.equal(result.spendAllocatedToSoldSku,0);
 assert.deepEqual(result.review.map(x=>x.itemIdList),[['10001'],['10001','10002'],[]]);
 assert.deepEqual(result.review.map(x=>x.advertisedItemCount),[1,2,0]);
 assert.ok(result.review[0].situation.includes('Sem venda direta'));
 assert.ok(result.review[1].situation.includes('vários produtos'));
});
test('Imagem de campanha não autoriza ratear Ads para venda individual',()=>{
 const finance={catalogProducts:[{sku:'A1',itemId:'10001'}],skuSummary:[
  {sku:'A1',payout:100,balanceBeforeAds:30}
 ]};
 const out=matchFinanceAds(finance,{campaigns:[campaign('25',20,['10001'],0)]});
 assert.equal(out.spendWithoutDirectConversions,20);
 assert.equal(out.spendAllocatedToSoldSku,0);
 assert.equal(out.skuCosts.length,0);
});
test('Miniaturas usam catálogo seguro e não escolhem anúncio arbitrário se SKU duplicada',()=>{
 const app=readFileSync(new URL('../public/app.js',import.meta.url),'utf8');
 const start=app.indexOf('function financeCatalogPhotoMaps(report){');
 const end=app.indexOf('function financeAdsBySku(report){',start);
 assert.ok(start>0&&end>start,'Helpers de miniatura não encontrados');
 const methods=app.slice(start,end);
 class MockEl{
  constructor(tag){this.tag=tag;this.children=[];this.events={};this.attrs={};this.textContent='';}
  appendChild(x){this.children.push(x);return x}
  append(...xs){this.children.push(...xs)}
  addEventListener(name,fn){this.events[name]=fn}
  remove(){this.removed=true}
 }
 const factory=new Function('financeSkuNode','financeCatalogImage',
  methods+';return {financeCatalogPhotoMaps,financeAuditIdentity,financeAdsPhotos};');
 const helpers=factory((tag,cls,txt)=>{
  const e=new MockEl(tag);e.className=cls||'';e.textContent=txt||'';return e;
 },url=>typeof url==='string'&&url.startsWith('https://cf.shopee.com.br/'));
 const report={catalogProducts:[
  {sku:'DUP',itemId:'1001',name:'Anúncio 1',imageUrl:'https://cf.shopee.com.br/file/1'},
  {sku:'DUP',itemId:'1002',name:'Anúncio 2',imageUrl:'https://cf.shopee.com.br/file/2'},
  {sku:'OK',itemId:'1003',name:'Anúncio certo',imageUrl:'https://cf.shopee.com.br/file/3'}
 ]};
 const maps=helpers.financeCatalogPhotoMaps(report);
 assert.equal(maps.bySkuIds.get('DUP').size,2);
 const uncertain=helpers.financeAuditIdentity({sku:'DUP',skuList:['DUP']},maps);
 assert.equal(uncertain.children[0].children[0].title,'SKU sem anúncio único identificado: DUP');
 assert.equal(uncertain.children[0].children[0].children[0].className,'finance-mini-fallback');
 const correct=helpers.financeAuditIdentity({sku:'OK',skuList:['OK']},maps);
 assert.equal(correct.children[0].children[0].children[0].src,'https://cf.shopee.com.br/file/3');
 const ad=helpers.financeAdsPhotos({itemIdList:['1002','1003'],advertisedItemCount:2},maps);
 assert.equal(ad.children.length,2);
 assert.equal(ad.children[0].children[0].src,'https://cf.shopee.com.br/file/2');
 const noEvidence=helpers.financeAdsPhotos({itemIdList:[],advertisedItemCount:0},maps);
 assert.equal(noEvidence.children[0].children[0].className,'finance-mini-fallback');
});
test('Tabelas preservam sua contabilidade e carregam estilos próprios',()=>{
 const html=readFileSync(new URL('../public/index.html',import.meta.url),'utf8');
 const app=readFileSync(new URL('../public/app.js',import.meta.url),'utf8');
 assert.match(html,/finance-thumbnails\.css\?v=/);
 assert.match(html,/<th>Foto \/ SKU<\/th>/);
 assert.match(app,/financeAuditIdentity\(x,orderPhotos\)/);
 assert.match(app,/financeAdsPhotos\(x,photos\)/);
 assert.match(app,/x\.situation/);
 assert.match(app,/financeCatalogImage\(profile\.imageUrl\)/);
});
