import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const read=p=>readFileSync(new URL(p,import.meta.url),'utf8');
test('auto image failures do not lock manual import and never loop forever on duplicate photos',()=>{
 const js=read('../public/app.js'),html=read('../public/index.html');
 assert.match(js,/function optimizerChatBridgeRelease\(/);
 assert.match(js,/optimizerChatBridgeRelease\('Envio antigo interrompido/);
 assert.match(js,/if\(job\.stopped\)/);
 assert.match(js,/job\.complete\|\|job\.stopped/);
 assert.match(js,/if\(other\)throw Error/);
 assert.match(js,/optimizerChatBridgeAck\(m,false/);
 assert.match(js,/correctionDrop\.addEventListener\('paste'/);
 assert.match(js,/correctionDrop\.addEventListener\('drop'/);
 assert.match(html,/id="optimizerImageCorrectionDropzone"/);
 assert.match(html,/app\\.js\\?v=1\\.21\\./);
});
