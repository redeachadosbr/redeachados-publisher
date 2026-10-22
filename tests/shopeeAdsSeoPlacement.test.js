import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const file=name=>readFileSync(new URL('../public/'+name,import.meta.url),'utf8');
const html=file('index.html'),css=file('ads-premium.css'),js=file('ads-seo.js');
test('SEO de Ads fica somente dentro da página de Shopee Ads, nunca em Otimização',()=>{
 const optimizer=html.slice(html.indexOf('<section class="tabpane" id="tab-optimizer"'),html.indexOf('<section class="tabpane" id="tab-ads"'));
 const ads=html.slice(html.indexOf('<section class="tabpane" id="tab-ads"'),html.indexOf('<section class="tabpane" id="tab-wedrop"'));
 assert.ok(!optimizer.includes('id="adsSeoSection"'));
 assert.ok(optimizer.includes('id="optimizerSku"'));
 assert.ok(optimizer.includes('Centro de otimização'));
 assert.ok(ads.includes('id="adsSeoSection"'));
 assert.ok(ads.includes('id="adsSeoDisclosure"'));
 assert.equal((html.match(/id="adsSeoSection"/g)||[]).length,1);
 assert.equal((html.match(/id="adsSeoRefresh"/g)||[]).length,1);
 assert.ok(ads.includes('id="adsRecommendations"'));
 assert.ok(ads.includes('id="adsReviewPanel"'));
});
test('SEO Ads não ocupa grade principal e só atualiza após expansão',()=>{
 assert.match(css,/#tab-ads #adsSeoDisclosure\.ads-seo-disclosure\{/);
 assert.match(css,/grid-row:8!important/);
 assert.match(html,/ads-premium\.css\?v=2\.4\.0-seo-ads-location/);
 assert.match(html,/ads-seo\.js\?v=6-ads-eligible-counter/);
 assert.match(js,/observer\.observe\(root\)/);
 assert.match(js,/redeAdsOpenOptimizerSku\(sku\)/);
 assert.doesNotMatch(js,/input\.dispatchEvent\(new Event\('input'/);
});

test('monitor avançado só exibe campanhas ativas e não oferece histórico de pausadas',()=>{
 assert.match(js,/filter\(c=>c\.statusGroup==='active'\)/);
 assert.match(js,/Nenhuma campanha ativa\/rodando/);
 assert.doesNotMatch(html,/data-ads-group="inactive"/);
 assert.doesNotMatch(html,/data-ads-group="other"/);
});
