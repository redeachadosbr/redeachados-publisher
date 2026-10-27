import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const source=fs.readFileSync(new URL('../public/tiktok-delivery.js',import.meta.url),'utf8');
const app=fs.readFileSync(new URL('../public/app.js',import.meta.url),'utf8');
const server=fs.readFileSync(new URL('../server.js',import.meta.url),'utf8');
const html=fs.readFileSync(new URL('../public/index.html',import.meta.url),'utf8');

function setup(){
 const entries=new Map(),elements=new Map();
 const storage={setItem:(k,v)=>entries.set(k,String(v)),getItem:k=>entries.get(k)||null,
  removeItem:k=>entries.delete(k)};
 const doc={getElementById:id=>{
  if(!elements.has(id))elements.set(id,{dataset:{},hidden:false,disabled:false,textContent:'',
    addEventListener(){}});
  return elements.get(id);
 }};
 let scheduled=0;
 const root={};
 vm.runInNewContext(source,{window:root,setTimeout,clearTimeout});
 let stamp=Date.parse('2026-10-27T16:00:00Z');
 const factory=options=>root.PublisherTikTokDelivery.create({
  storage,dom:doc,now:()=>stamp,schedule:()=>++scheduled,cancel:()=>{},...options});
 return {root,storage,doc,entries,elements,factory,advance:delta=>{stamp+=delta},scheduled:()=>scheduled};
}
test('TikTok não confirma entrega somente por ter aceitado os bytes',async()=>{
 const t=setup();
 const statuses=['PROCESSING_UPLOAD','SEND_TO_USER_INBOX'];
 let calls=0;
 const tracker=t.factory({request:async path=>{
  assert.match(path,/^\/api\/status\/v_inbox_file~v2\.123$/);
  return {status:statuses[calls++]};
 }});
 tracker.track({publishId:'v_inbox_file~v2.123',fingerprint:'file:teste.mp4:100:1'});
 assert.equal(tracker.state().state,'processing');
 assert.equal(tracker.isUndelivered('file:teste.mp4:100:1'),true);
 assert.equal(t.doc.getElementById('tiktokDeliveryPanel').hidden,false);
 assert.match(t.doc.getElementById('tiktokDeliveryMessage').textContent,/não.*confirmada/i);
 await tracker.check();
 assert.equal(tracker.state().state,'processing');
 t.advance(620000);
 await tracker.check();
 assert.equal(tracker.state().state,'delivered');
 assert.equal(tracker.isUndelivered('file:teste.mp4:100:1'),false);
 assert.match(t.doc.getElementById('tiktokDeliveryTitle').textContent,/Notificação entregue/);
 assert.ok(t.entries.size>0,'ponto de retomada persistido');
});
test('falha oficial é distinguida de atraso e o painel não reenvia vídeos',async()=>{
 const t=setup();
 const tracker=t.factory({request:async()=>({status:'FAILED',fail_reason:'file_format_check_failed'})});
 tracker.track({publishId:'v_inbox_file~v2.789',fingerprint:'remote:abc'});
 await tracker.check();
 assert.equal(tracker.state().state,'failed');
 assert.match(t.doc.getElementById('tiktokDeliveryMessage').textContent,/file_format_check_failed/);
 const restored=t.factory({request:async()=>({status:'FAILED'})});
 restored.restore();
 assert.equal(restored.state().publishId,'v_inbox_file~v2.789');
 assert.equal(restored.state().state,'failed');
});
test('server grava métricas sem tokens e atualiza histórico somente após consulta TikTok',()=>{
 assert.match(server,/file_transfer_completed bytes=/);
 assert.match(server,/remote_download_completed bytes=/);
 assert.match(server,/status_changed status=/);
 assert.match(server,/row\.status=status/);
 assert.match(server,/deliveryStatus:'PROCESSING_UPLOAD'/);
 assert.doesNotMatch(server,/status:'SENT_TO_TIKTOK_INBOX',mode:'draft/);
});
test('Publisher monitora a entrega sem perder ações TikTok Instagram Stories',()=>{
 assert.match(html,/id="tiktokDeliveryPanel"/);
 assert.match(html,/id="tiktokCheckDeliveryBtn"/);
 assert.match(html,/\/tiktok-delivery\.js\?v=5523-confirm-inbox/);
 assert.match(app,/tiktokDelivery\.track\(\{publishId:r\.publishId/);
 assert.match(app,/tiktokDelivery\.restore\(\)/);
 assert.match(app,/tiktokDelivery\.isUndelivered\(fingerprint\)/);
 assert.match(app,/Arquivo transferido ao TikTok/);
 for(const id of ['publishBtn','instagramPublishBtn','instagramStoryPublishBtn','prepareStoryBtn'])
  assert.ok(html.includes('id="'+id+'"'),id+' preservado');
});
