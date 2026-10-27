import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const html=fs.readFileSync(new URL('../public/index.html',import.meta.url),'utf8');
const css=fs.readFileSync(new URL('../public/studio-depth.css',import.meta.url),'utf8');
test('Publisher Studio carrega camada 3D após os estilos existentes',()=>{
 const first=html.indexOf('/styles.css?v='),second=html.indexOf('/studio-depth.css?v=');
 assert.ok(first>0&&second>first);
 assert.match(css,/body\.reference-publisher-layout #create \.source-card/);
 assert.match(css,/body\.reference-publisher-layout #create \.sku-card/);
 assert.match(css,/body\.reference-publisher-layout #create \.dropzone/);
 assert.match(css,/body\.reference-publisher-layout #create \.step-number/);
 assert.match(css,/prefers-reduced-motion:reduce/);
});
test('Acabamento mantém ids e eventos existentes',()=>{
 for(const id of ['videoInput','chooseBtn','wedropSku','wedropSearchBtn','dropzone','workArea','publishBtn']){
  assert.equal((html.match(new RegExp('id="'+id+'"','g'))||[]).length,1,id);
 }
 assert.doesNotMatch(css,/display\s*:\s*none\s*!important/);
 assert.doesNotMatch(css,/#loginScreen|#settingsDialog|#channelSettings/);
});