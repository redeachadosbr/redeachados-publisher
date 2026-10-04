'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { createRequire } = require('node:module');

const req = createRequire(__filename);
const required = [
  ['tesseract.js', '7.0.0'],
  ['tesseract.js-core', '7.0.0'],
  ['@tesseract.js-data/por', null],
  ['@tesseract.js-data/eng', null],
];

const errors = [];
for (const [name, expected] of required) {
  try {
    const pkgFile = req.resolve(`${name}/package.json`);
    const pkg = JSON.parse(fs.readFileSync(pkgFile, 'utf8'));
    if (expected && pkg.version !== expected) {
      errors.push(`${name}: versão ${pkg.version}; esperado ${expected}`);
    }
  } catch (err) {
    errors.push(`${name}: não encontrado (${err.code || err.message})`);
  }
}

if (errors.length) {
  console.error('[OCR CHECK] Falha na instalação OCR:');
  for (const error of errors) console.error(`- ${error}`);
  process.exit(1);
}

console.log('[OCR CHECK] Dependências OCR instaladas corretamente.');
