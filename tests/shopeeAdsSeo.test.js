import test from 'node:test';
import assert from 'node:assert/strict';
import {rankAdsCandidates} from '../shopeeAdsSeo.js';
test('triagem Ads sugere ROAS e orçamento somente quando margem e estoque são positivos',()=>{
 const catalog=[{itemId:'1',sku:'A',title:'Produto A',stock:10,status:'NORMAL'},{itemId:'2',sku:'B',title:'Produto B',stock:0,status:'NORMAL'}];
 const plans=[{itemId:'1',sku:'A',updatedAt:new Date().toISOString(),quote:{unitCost:20,customerPrice:50,netMarginPct:20,netProfit:10,marketResearch:{verified:true,count:3}}},{itemId:'2',sku:'B',quote:{unitCost:5,customerPrice:10,netMarginPct:20,netProfit:2}}];
 const out=rankAdsCandidates(catalog,plans);
 assert.equal(out.length,1);assert.equal(out[0].sku,'A');
 assert.ok(out[0].roasTarget>out[0].breakEvenRoasEstimate);
 assert.ok(out[0].suggestedDailyBudget>0);
 assert.equal(out[0].signals.visitsAvailable,false);
});
test('triagem nunca inventa métricas sem planos reais',()=>{
 assert.deepEqual(rankAdsCandidates([{itemId:'1',sku:'A',stock:10,status:'NORMAL'}],[]),[]);
});
