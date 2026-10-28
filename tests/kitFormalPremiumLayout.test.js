import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
const html=fs.readFileSync(new URL('../public/index.html',import.meta.url),'utf8');
const css=fs.readFileSync(new URL('../public/kit-builder.css',import.meta.url),'utf8');

test('Kit Formal: barra de seis etapas mantida e quatro cartões na área correta',()=>{
 const start=html.indexOf('id="kitPublishPanel"');
 const end=html.indexOf('id="kitDiscountNext"',start);
 const area=html.slice(start,end);
 assert.ok(start>0&&end>start);
 assert.match(area,/class="kit-publish-steps"/);
 assert.equal((area.match(/<b>0[1-6]<\/b>/g)||[]).length,6);
 for(const id of ['kitVideoPanel','kitLogisticsSmartImport','kitPublishGuide','kitPublishCheck',
 'kitMainSku','kitLogisticId','kitWeightKg','kitLengthCm','kitWidthCm','kitHeightCm',
 'kitLogisticsAutofill','kitVideoFile','kitVideoSendShopee','kitVideoDownload',
 'kitVideoRemove','kitVideoInclude','kitSendPhotos','kitPublishPreview',
 'kitPublishFreshness','kitPublishStatus','kitPublishGuideNext'])
  assert.equal((area.match(new RegExp('id="'+id+'"','g'))||[]).length,1,id);
 assert.match(area,/class="kit-formal-workspace"/);
 assert.match(area,/class="kit-formal-logistics-card"/);
 assert.match(area,/class="kit-formal-assistant-card"/);
 assert.match(html,/id="kitPublishExecute"/);
 assert.match(html,/id="kitDiscountExecute"/);
});

test('Design do Kit Formal escopado ao editor: desktop 2x2 e responsivo',()=>{
 assert.match(css,/#tab-kits #kitDetail \.kit-formal-workspace\{/);
 assert.match(css,/grid-template-areas:"video logistics" "smart assistant"/);
 assert.match(css,/@media\(max-width:1320px\)/);
 assert.match(css,/#tab-kits #kitDetail \.kit-formal-assistant-card #kitPublishPreview/);
});
