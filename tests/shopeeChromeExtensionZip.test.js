import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {chromeExtensionZip,chromeExtensionVersion} from '../shopeeChromeExtensionZip.js';
test('pacote ZIP de extensão contém manifest e scripts com assinaturas válidas',()=>{
 const zip=chromeExtensionZip();
 assert.equal(zip.readUInt32LE(0),0x04034b50);
 assert.equal(zip.readUInt32LE(zip.length-22),0x06054b50);
 assert.equal(zip.readUInt16LE(zip.length-22+10),5);
 for(const name of ['manifest.json','background.js','manager.js','visible-offers.js'])
  assert.ok(zip.includes(Buffer.from(name)),name);
 assert.ok(zip.length>5000);
});

test('ZIP e link do Manager sempre concordam com o manifesto da extensão',()=>{
 const manifest=JSON.parse(readFileSync(new URL('../chrome-extension-shopee/manifest.json',import.meta.url),'utf8'));
 const page=readFileSync(new URL('../public/index.html',import.meta.url),'utf8');
 const server=readFileSync(new URL('../server.js',import.meta.url),'utf8');
 const zip=chromeExtensionZip();
 assert.equal(chromeExtensionVersion(),manifest.version);
 assert.ok(zip.includes(Buffer.from('"version": "'+manifest.version+'"')));
 assert.ok(page.includes('Baixar extensão '+manifest.version));
 assert.match(server,/chrome-extension-version/);
 assert.match(server,/filename="redeachados-shopee-chrome-'.*chromeExtensionVersion/);
});
