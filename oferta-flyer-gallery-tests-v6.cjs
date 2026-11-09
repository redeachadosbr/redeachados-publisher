'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const browser={};
vm.runInNewContext(fs.readFileSync('oferta-flyer-gallery-v6.js','utf8'),browser,{timeout:3000});
const G=browser.OBFlyerGalleryV6;
assert.ok(G&&typeof G.group==='function','gallery module loads and exports grouping logic');
const url='https://edge.osuper.com.br/valid-signature/0x330/smart/https://osuper-ecommerce-fortatacadista.s3.sa-east-1.amazonaws.com/8234fc56-campanha17577pagina1.jpeg';
const other='https://edge.osuper.com.br/another/0x330/smart/https://osuper-ecommerce-fortatacadista.s3.sa-east-1.amazonaws.com/2dcb6794-campanha17435pagina1.jpeg';
const doc=(id,sid,asset,source,extras={})=>({
 id,store_id:sid,network:'Fort Atacadista',
 title:'SC_Fort_Semanal 2ed_09 a 12_NOV_26_Blume_Inda_Jara',
 asset_url:asset,
 starts_on:'2026-11-09',ends_on:'2026-11-12',
 source_url:source,valid_now:true,...extras});
const stores=[
 {id:'BLU-026',rede:'Fort Atacadista',filial:'Blumenau Itoupava',url_ofertas:'https://www.fortatacadista.com.br/encartes/sc/blumenau/blumenau-195'},
 {id:'BLU-027',rede:'Fort Atacadista',filial:'Blumenau Norte',url_ofertas:'https://www.fortatacadista.com.br/encartes/sc/blumenau/blumenau-480'}
];
const inputs=[
 doc(85,'BLU-026',url,stores[0].url_ofertas),
 doc(91,'BLU-027',url,stores[1].url_ofertas),
 doc(86,'BLU-026',other,stores[0].url_ofertas,{ends_on:'2026-11-15'}),
 doc(5,'BLU-027','',stores[1].url_ofertas),
 doc(7,'BLU-027','https://example.com/not-an-image',stores[1].url_ofertas),
 doc(10,'BLU-026',url,stores[0].url_ofertas,{ends_on:'2026-11-08',valid_now:false}),
 doc(11,'BLU-026',url,stores[0].url_ofertas,{starts_on:null,ends_on:null,valid_now:false})
];
const active=G.group(inputs,stores,{day:'2026-11-09'});
assert.equal(active.length,2,'current image covers group by publication, not branch');
const weekly=active.find(x=>x.cover===url);
assert.ok(weekly,'weekly Fort cover available');
assert.equal(weekly.itemCount,2,'both branches represented in one cover card');
assert.equal(weekly.links.length,2,'exact official link per branch');
assert.ok(weekly.links.some(x=>x.url.endsWith('blumenau-195')));
assert.ok(weekly.links.some(x=>x.url.endsWith('blumenau-480')));
assert.equal(weekly.current,true);
assert.equal(weekly.ends_on,'2026-11-12');
assert.equal(G.prettyDate(weekly.ends_on),'12 NOV 2026');
assert.equal(G.isValid(doc(1,'BLU-026',url,stores[0].url_ofertas),'2026-11-13'),false);
assert.equal(G.isValid(doc(1,'BLU-026',url,stores[0].url_ofertas,{ends_on:null}),'2026-11-09'),false);
assert.equal(G.imageUrl(doc(1,'BLU-026','javascript:alert(1)',stores[0].url_ofertas)),null,'deny untrusted URL scheme');
assert.equal(G.imageUrl(doc(1,'BLU-026','https://example.com/page',stores[0].url_ofertas)),null,'gallery only includes real image documents');
const all=G.group(inputs,stores,{day:'2026-11-09',validOnly:false});
assert.ok(all.length>=3,'all documents include historic and undated covers separately');
const noExternal=G.group([doc(101,'BLU-026',url,'javascript:alert(1)')],[],{day:'2026-11-09'});
assert.equal(noExternal[0].links.length,0,'never build javascript external links');
const root=fs.readFileSync('bootstrap_oferta.py','utf8');
assert.ok(root.includes('static/ob-flyer-gallery-v6.js'));
assert.ok(root.includes('static/ob-flyer-gallery-v6.css'));
const main=fs.readFileSync('oferta-flyer-gallery-v6.js','utf8');
assert.ok(main.includes('data-obf-market'), 'direct market link exists');
assert.ok(main.includes('data-obf-store'), 'store switcher exists');
assert.ok(main.includes('data-obf-save'), 'favorites exist');
assert.ok(main.includes('data-obf-view'), 'cover zoom exists');
assert.ok(main.includes('data-obf-share'), 'sharing action exists');
assert.ok(main.includes('obfDialog'), 'accessible image viewer exists');
const css=fs.readFileSync('oferta-flyer-gallery-v6.css','utf8');
assert.ok(css.includes('background:linear-gradient')&&css.includes('.sidebar'));
assert.ok(css.includes('.obf-cover-button')&&css.includes('.obf-grid'));
console.log('OB_V6_FLYERS_VALIDITY_FILIAL_DEDUP_AND_ACTIONS_PASS');