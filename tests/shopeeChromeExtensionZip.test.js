import test from 'node:test';
import assert from 'node:assert/strict';
import {chromeExtensionZip} from '../shopeeChromeExtensionZip.js';
test('pacote ZIP de extensão contém manifest e scripts com assinaturas válidas',()=>{
 const zip=chromeExtensionZip();
 assert.equal(zip.readUInt32LE(0),0x04034b50);
 assert.equal(zip.readUInt32LE(zip.length-22),0x06054b50);
 assert.equal(zip.readUInt16LE(zip.length-22+10),5);
 for(const name of ['manifest.json','background.js','manager.js','visible-offers.js'])
  assert.ok(zip.includes(Buffer.from(name)),name);
 assert.ok(zip.length>5000);
});
