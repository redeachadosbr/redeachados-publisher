'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const browser={URL}; // vm contexts do not expose the browser URL constructor by default.
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
const directUrl='https://osuper-ecommerce-fortatacadista.s3.sa-east-1.amazonaws.com/8234fc56-campanha17577pagina1.jpeg';
const weekly=active.find(x=>x.cover===directUrl);
assert.ok(weekly,'weekly Fort original-resolution cover available');
assert.equal(weekly.fallback,url,'the old thumbnail remains fallback if S3 blocks direct image');
assert.equal(weekly.rawCover,url,'legacy favorite key retained');
assert.equal(G.imageUrl(doc(1,'BLU-026',url,stores[0].url_ofertas)),directUrl);
assert.equal(G.fullImageUrl(directUrl),directUrl);
assert.equal(G.imageUrl({asset_url:'https://example.com/folder/photo.jpeg'}),'https://example.com/folder/photo.jpeg');
assert.equal(G.imageUrl({asset_url:'https://example.com/page',image_url:directUrl}),directUrl);
const fake='https://edge.osuper.com.br/valid/0x330/smart/https://evil.example/offer.jpeg';
assert.notEqual(G.fullImageUrl(fake),'https://evil.example/offer.jpeg','never unwrap unapproved domains');
assert.equal(G.fullImageUrl('javascript:alert(1)'),null);
assert.equal(typeof G.openImage,'function');
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
const branchUI=fs.readFileSync('oferta-branch-offers-v11.js','utf8');
assert.ok(branchUI.includes('data-ob-branch-flyer'),'branch click opens the in-app image viewer');
assert.ok(branchUI.includes('OBFlyerGalleryV6.openImage'),'branch viewer integrates with gallery');
assert.ok(main.includes('data-obf-zoom')&&main.includes('setZoom(0)'),'zoom controls and fit reset are available');
assert.equal(G.zoomTarget(1,1),1.5);
assert.equal(G.zoomTarget(1.5,1),2);
assert.equal(G.zoomTarget(2,-1),1.5);
assert.equal(G.zoomTarget(4,0),1);
assert.equal(G.zoomTarget(6,1),6);
assert.equal(G.imageQuality(800,1100).low,true);
assert.equal(G.imageQuality(2100,3000).low,false);
assert.ok(main.includes('img.style.width=nextWidth+\'px\''),'pixel-based zoom instead of scaled container percentage');
assert.ok(main.includes('viewport.addEventListener(\'touchmove\'')&&main.includes('viewport.addEventListener(\'wheel\''),'pinch and Ctrl+wheel zoom');
assert.ok(main.indexOf('dlg.showModal()')<main.indexOf('img.src=g.cover;'),'modal opens before measuring its viewport');
assert.ok(main.includes('g.fallback'),'image failure falls back safely');
assert.ok(css.includes('.obf-zoom-controls')&&css.includes('width:min(96vw,1540px)'),'viewer uses near-full width');
console.log('OB_V12_FULL_RESOLUTION_ZOOM_AND_BRANCH_VIEW_PASS');

assert.ok(css.includes('obf-dialog-guidance')&&css.includes('overflow:auto!important'),'viewer allows navigating large source page');
console.log('OB_V16_PIXEL_ZOOM_SOURCE_QUALITY_GUARD_PASS');

const altFood=G.verifiedAlternativeFor({network:'Fort Atacadista',title:'SC Fort Food 09 a 15 NOV 26 Regional',starts_on:'2026-11-09',ends_on:'2026-11-15'});
assert.equal(altFood.width,1550);assert.equal(altFood.height,2353);
assert.equal(G.verifiedAlternativeFor({network:'Fort Atacadista',title:'SC Fort BRF 09 a 22 NOV 26',starts_on:'2026-11-09',ends_on:'2026-11-22'}).height,2194);
assert.equal(G.verifiedAlternativeFor({network:'Fort Atacadista',title:'SC_Fort_Seara_30 a 15_OUT_NOV_26_Regional',starts_on:'2026-10-30',ends_on:'2026-11-15'}).height,2184);
assert.equal(G.verifiedAlternativeFor({network:'Cooper',title:'Food 09',starts_on:'2026-11-09',ends_on:'2026-11-15'}),null);
assert.equal(G.verifiedAlternativeFor({network:'Fort Atacadista',title:'Food 09',starts_on:'2026-11-09',ends_on:'2026-11-16'}),null);
assert.ok(main.includes('id="obfUseAlternate"')&&main.includes('showingAlternate?alternate.image:g.cover'));
assert.ok(css.includes('.obf-alt-tools[hidden]'));
assert.ok(!root.includes('OB_IMAGE_PROBE')&&!root.includes('OB_ALT_CATALOG'),'one-time diagnostics removed from production');
console.log('OB_V17_OPTIONAL_VERIFIED_HIGH_RESOLUTION_SOURCES_PASS');
