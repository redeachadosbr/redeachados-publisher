import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {buildManualKitFinalization} from '../shopeeKitDraftStore.js';

const kitSku='KIT-894090-895189';
const sku='895189',itemId='5822790994',modelId='0';
const current=()=>({
 kit:{kitSku,components:[{sku},{sku:'894090'}]},
 optimization:{kitSku,sku,mainSku:sku,itemId,modelId},
 publication:{status:'local_draft',itemId:null},
 optimizationFinalization:null
});
const valid={kitSku,sku,itemId,modelId,confirmed:true};

test('confirmação manual mantém o status distinto da auditoria oficial',()=>{
 const result=buildManualKitFinalization(current(),valid);
 assert.equal(result.alreadyFinalized,false);
 assert.equal(result.finalization.status,'manual_confirmed');
 assert.equal(result.finalization.source,'seller_manual_confirmation');
 assert.equal(result.finalization.officialAuditVerified,false);
 assert.equal(result.finalization.marketplaceUpdated,false);
 assert.equal(result.finalization.itemId,itemId);
 assert.ok(Date.parse(result.finalization.confirmedAt));
});

test('exige clique explícito no checkbox, mesmo com anúncio vinculado',()=>{
 assert.throws(()=>buildManualKitFinalization(current(),{...valid,confirmed:false}),/Marque a confirmação/);
 assert.throws(()=>buildManualKitFinalization(current(),{...valid,confirmed:undefined}),/Marque a confirmação/);
});

test('não admite Item ID, SKU, modelo ou kit divergentes',()=>{
 for(const change of [
  {itemId:'123456789'},{sku:'894090'},{modelId:'1'},
  {kitSku:'KIT-111111-222222'},{itemId:'abc'}
 ]){
  const input={...valid,...change};
  const msg=()=>buildManualKitFinalization(current(),input);
  assert.throws(msg);
 }
});

test('não conclui sem vínculo previamente salvo nem publicação formal/duvidosa',()=>{
 const missing=current();missing.optimization=null;
 assert.throws(()=>buildManualKitFinalization(missing,valid),/vincule/);
 const publishing=current();publishing.publication.status='uncertain';
 assert.throws(()=>buildManualKitFinalization(publishing,valid),/publicação formal ou incerta/);
 const formal=current();formal.publication.itemId='123';
 assert.throws(()=>buildManualKitFinalization(formal,valid),/publicação formal ou incerta/);
});

test('não converte verificação oficial em manual e repete confirmação com idempotência',()=>{
 const alreadyVerified=current();alreadyVerified.optimizationFinalization={status:'verified',itemId};
 assert.throws(()=>buildManualKitFinalization(alreadyVerified,valid),/verificado oficialmente/);
 const first=buildManualKitFinalization(current(),valid).finalization;
 const repeated=current();repeated.optimizationFinalization=first;
 assert.deepEqual(buildManualKitFinalization(repeated,valid),{
  finalization:first,alreadyFinalized:true
 });
 const mismatched=current();mismatched.optimizationFinalization={...first,itemId:'987654321'};
 assert.throws(()=>buildManualKitFinalization(mismatched,valid),/outro Item ID/);
});

test('interface expõe checkbox, ação manual e tratamento visual distinto',()=>{
 const html=readFileSync(new URL('../public/index.html',import.meta.url),'utf8');
 const ui=readFileSync(new URL('../public/kit-builder.js',import.meta.url),'utf8');
 const server=readFileSync(new URL('../server.js',import.meta.url),'utf8');
 for(const id of ['kitWizardManualCheck','kitWizardManualComplete','kitWizardManualStatus'])
  assert.match(html,new RegExp('id="'+id+'"'));
 assert.match(ui,/manual-complete/);
 assert.match(ui,/CONCLUÍDO MANUALMENTE/);
 assert.match(server,/marketplaceUpdated:false/);
 assert.match(server,/officialAuditVerified:false/);
 assert.match(server,/pendingJob\?\.state/);
 assert.match(server,/authStore\.load\(\)/);
});

test('opção manual aceita apenas vínculo persistido e recente do kit, nunca handoff temporário',()=>{
 const ui=readFileSync(new URL('../public/kit-builder.js',import.meta.url),'utf8');
 const optimizer=readFileSync(new URL('../public/kit-existing-optimization.js',import.meta.url),'utf8');
 assert.match(ui,/const link=prepared\?\.optimization\?\.itemId\?prepared\.optimization:null/);
 assert.match(ui,/prepared\.optimization=result\.link/);
 assert.match(optimizer,/link:\{\.\.\.identity,mainSku:sku\}/);
});

test('consentimento não passa entre kits e check local indisponível não invalida conclusão durável',()=>{
 const ui=readFileSync(new URL('../public/kit-builder.js',import.meta.url),'utf8');
 assert.match(ui,/if\(manualCheck\)manualCheck\.checked=false/);
 assert.match(ui,/let localCheckSaved=true/);
 assert.match(ui,/catch\{localCheckSaved=false;\}/);
});
