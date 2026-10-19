import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

test('auxiliary WeDrop source read failure cannot abort SKU workflow and still provides official category steps',()=>{
 const server=readFileSync(new URL('../server.js',import.meta.url),'utf8');
 const start=server.indexOf("app.get('/api/shopee/optimizer/workflow',mustLogin");
 const end=server.indexOf("// Reference material belongs",start);
 assert.ok(start>=0&&end>start);
 const workflow=server.slice(start,end);
 assert.match(workflow,/sourceEvidence=\{sku,sourceText:'',screenshots:\[\],updatedAt:null\}/);
 assert.match(workflow,/try\s*\{\s*sourceEvidence=await readShopeeSourceEvidence/);
 assert.match(workflow,/catch\(error\)\s*\{\s*sourceEvidenceWarning=/);
 assert.match(workflow,/sourceEvidence,sourceEvidenceWarning,sourceFacts:evidenceFacts/);
 assert.match(workflow,/res\.json\(\{ok:true,readOnlyMarketplace:true/);
 assert.match(workflow,/stages,/);
 assert.ok(workflow.indexOf('res.json(')>workflow.indexOf('catch(error)'));
});
test('seller is shown storage warning without 0/6 hard failure',()=>{
 const app=readFileSync(new URL('../public/app.js',import.meta.url),'utf8');
 assert.match(app,/if\(data\.sourceEvidenceWarning\)\{/);
 assert.match(app,/optimizerSourceNotice\(data\.sourceEvidenceWarning,'warning'\)/);
});
