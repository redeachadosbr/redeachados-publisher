import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';

const source=readFileSync(new URL('../site/ads-sku-rename.js',import.meta.url),'utf8');
const window={};
runInNewContext(source,{window});
const plan=window.RedeAdsSkuRename.plan;
const input=()=>({
 oldSku:'sku-errada',
 newSku:'TRC6808',
 at:'2026-11-12T17:55:00.000Z',
 products:[
  {sku:'SKU-ERRADA',name:'Dispenser',cost:19.5,price:49.9,linkedCampaignIds:['12345'],adsMinRoas:15,updatedAt:'2026-11-10T10:00:00Z'},
  {sku:'ITEM-OUTRO',name:'Outro',cost:10,price:25,linkedCampaignIds:['8765']}
 ],
 editedProduct:{sku:'TRC6808',name:'Dispenser atualizado',cost:19.5,price:49.9},
 changes:[
  {id:'chg1',sku:'SKU-ERRADA',timestamp:'2026-11-10T10:00:00Z',changes:['Capa']},
  {id:'chg2',sku:'ITEM-OUTRO',timestamp:'2026-11-10T11:00:00Z',changes:['Título']}
 ],
 adsSnapshots:[
  {id:'12345|2026-11-01|2026-11-07',sku:'SKU-ERRADA',campaignId:'12345',syncedAt:'2026-11-08T10:00:00Z'},
  {id:'8765|2026-11-01|2026-11-07',sku:'ITEM-OUTRO',campaignId:'8765',syncedAt:'2026-11-08T10:00:00Z'}
 ],
 history:[
  {id:'h1',savedAt:'2026-11-09T10:00:00Z',data:{sku:'SKU-ERRADA',spent:2.89,actual:15.17}},
  {id:'h2',savedAt:'2026-11-09T11:00:00Z',data:{sku:'ITEM-OUTRO',spent:3}}
 ],
 preferences:{'SKU-ERRADA':'12345','ITEM-OUTRO':'8765'},
 profitKeys:{'SKU-ERRADA|12345|2026-11-01|2026-11-07':'75.20','ITEM-OUTRO|8765|2026-11-01|2026-11-07':'11.10'}
});
test('corrige SKU e preserva campanhas, custos e histórico com mesmos IDs',()=>{
 const o=plan(input());
 assert.equal(o.changed,true);
 assert.equal(o.products[0].sku,'TRC6808');
 assert.equal(o.products[0].name,'Dispenser atualizado');
 assert.equal(o.products[0].linkedCampaignIds[0],'12345');
 assert.equal(o.products[0].adsMinRoas,15);
 assert.equal(o.products[0].updatedAt,'2026-11-12T17:55:00.000Z');
 assert.equal(o.changes[0].sku,'TRC6808');
 assert.equal(o.changes[0].id,'chg1');
 assert.equal(o.changes[0].timestamp,'2026-11-10T10:00:00Z');
 assert.equal(o.adsSnapshots[0].sku,'TRC6808');
 assert.equal(o.adsSnapshots[0].id,'12345|2026-11-01|2026-11-07');
 assert.equal(o.history[0].data.sku,'TRC6808');
 assert.equal(o.history[0].data.spent,2.89);
 assert.equal(o.preferences.TRC6808,'12345');
 assert.equal(o.preferences['SKU-ERRADA'],undefined);
 assert.equal(o.profitKeys['TRC6808|12345|2026-11-01|2026-11-07'],'75.20');
 assert.equal(o.profitKeys['SKU-ERRADA|12345|2026-11-01|2026-11-07'],undefined);
});
test('nao modifica outro produto ou os registros dele',()=>{
 const data=input(),o=plan(data);
 assert.equal(o.products[1].sku,'ITEM-OUTRO');
 assert.equal(o.changes[1].sku,'ITEM-OUTRO');
 assert.equal(o.adsSnapshots[1].sku,'ITEM-OUTRO');
 assert.equal(o.history[1].data.sku,'ITEM-OUTRO');
 assert.equal(o.preferences['ITEM-OUTRO'],'8765');
 assert.equal(o.profitKeys['ITEM-OUTRO|8765|2026-11-01|2026-11-07'],'11.10');
 assert.equal(data.products[0].sku,'SKU-ERRADA');
 assert.equal(data.history[0].data.sku,'SKU-ERRADA');
});
test('bloqueia SKU de outro produto sem sobrescrever',()=>{
 const data=input();data.newSku='item-outro';
 assert.throws(()=>plan(data),/já está cadastrada/);
});
test('bloqueia codigo em branco e caracteres invalidos',()=>{
 for(const invalid of ['', '   ', 'ITEM INCORRETO','A'.repeat(71),'ITEM#2']){
  const data=input();data.newSku=invalid;
  assert.throws(()=>plan(data),/SKU/);
 }
});
test('permite sku valida com ponto barra underline e hifen',()=>{
 for(const sku of ['1.26051.01.1000','UD04.0004.012','KIT-ABC_01','ITEM/A']){
  const data=input();data.newSku=sku;
  assert.equal(plan(data).after,sku);
 }
});
test('nao cria produtos em caso de origem ausente',()=>{
 const data=input();data.oldSku='SKU-INEXISTENTE';
 assert.throws(()=>plan(data),/não existe/);
});
