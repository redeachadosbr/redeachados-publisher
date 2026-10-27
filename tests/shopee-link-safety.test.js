import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';
const server=fs.readFileSync(new URL('../server.js',import.meta.url),'utf8');
const app=fs.readFileSync(new URL('../public/app.js',import.meta.url),'utf8');
test('generic matching requires four relevant words and uniqueness',()=>{assert.match(server,/words\.length<4\|\|top\.score<\.90/);assert.doesNotMatch(server,/if\(n\.includes\(q\)\|\|q\.includes\(n\)\) return 0\.98/);});
test('verified Moto Cross listing is available by exact ID',()=>{assert.match(server,/58221348619/);assert.match(server,/app\.get\('\/api\/catalog\/search'/);});
test('manual link is authoritative for every social channel',()=>{assert.match(app,/function currentMeta\(\).*shopeeUrl:\$\('#shopeeUrl'\)\.value/);assert.doesNotMatch(app,/shopeeUrl:selectedRemoteVideo\?\.catalogProductUrl\|\|/);assert.match(app,/function storyProductLink\(\)\{return String\(\$\('#shopeeUrl'\)/);});
test('publishing requires reviewed URL from own shop',()=>{assert.match(app,/function verifyPublicationLink/);assert.match(app,/if\(!verifyPublicationLink\(\)\)return/);});
