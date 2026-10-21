import test from 'node:test';
import assert from 'node:assert/strict';
import {suggestFiscalMeasureUnit} from '../shopeeFiscalMeasure.js';
test('kit, jogo e unidade são sugeridos sem converter a indicação em aprovação fiscal',()=>{
 assert.equal(suggestFiscalMeasureUnit('Kit Porta Temperos 12 potes').unit,'KIT');
 assert.equal(suggestFiscalMeasureUnit('Jogo de Chaves 40 peças').unit,'JOGO');
 assert.equal(suggestFiscalMeasureUnit('Garrafa Térmica 900ml').unit,'UN');
 assert.equal(suggestFiscalMeasureUnit('Kit Jogo de Ferramentas').unit,null);
 assert.equal(suggestFiscalMeasureUnit('JOGO DE CHAVES').unit,'JOGO');
});
