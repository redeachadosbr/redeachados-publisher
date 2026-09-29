import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const html=fs.readFileSync(new URL('../public/index.html',import.meta.url),'utf8');
const js=fs.readFileSync(new URL('../public/app.js',import.meta.url),'utf8');
const css=fs.readFileSync(new URL('../public/styles.css',import.meta.url),'utf8');

test('V5.5.3 exposes premium TikTok and Instagram publish buttons',()=>{
  assert.match(html,/class="social-publish-btn tiktok-publish"/);
  assert.match(html,/class="social-publish-btn instagram-publish"/);
  assert.match(css,/\.tiktok-publish\{/);
  assert.match(css,/linear-gradient\(135deg,#833ab4/);
});

test('video results are compact, expandable and limited initially',()=>{
  assert.match(js,/video-result compact/);
  assert.match(js,/video-result-toggle/);
  assert.match(js,/i>=3\?' extra-result hidden'/);
  assert.match(js,/Ver mais \$\{list\.length-3\}/);
  assert.match(css,/\.video-results\{[^}]*max-height:520px/);
});

test('TikTok expired authorization gets reconnect state without changing Instagram control',()=>{
  assert.match(js,/state==='reconnect'/);
  assert.match(js,/Autorização inválida ou expirada/);
  assert.match(js,/setSocialButton\('instagram','loading'\)/);
});
