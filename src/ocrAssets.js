'use strict';

const fs = require('node:fs');
const path = require('node:path');
const {createRequire} = require('node:module');

const RELEASE = '1.8.79';
const ASSET_BASE = `/vendor/ocr/v${RELEASE}`;
// Tesseract 7 also selects relaxed SIMD on recent Chrome versions.
const CORE_VARIANTS = ['', '-lstm', '-simd', '-simd-lstm', '-relaxedsimd', '-relaxedsimd-lstm'];

function resolveInstalledPackage(name, from = __filename) {
  return createRequire(from).resolve(`${name}/package.json`);
}

function inspectOcrInstallation({resolvePackage = resolveInstalledPackage} = {}) {
  const issues = [], files = [];
  function readPackage(name, from) {
    try {
      const filename = resolvePackage(name, from);
      return {filename, directory: path.dirname(filename), ...JSON.parse(fs.readFileSync(filename, 'utf8'))};
    } catch (_) {
      issues.push(`Pacote OCR ausente ou inválido: ${name}. Execute npm install.`);
      return null;
    }
  }
  const client = readPackage('tesseract.js');
  // Resolve FROM Tesseract itself, so npm hoisting/nested dependencies cannot
  // accidentally expose an unrelated core installed at the project root.
  const core = client && readPackage('tesseract.js-core', client.filename);
  if (client && client.version !== '7.0.0') issues.push(`Tesseract ${client.version}: esperado 7.0.0.`);
  if (core && core.version !== '7.0.0') issues.push(`Motor OCR ${core.version}: esperado 7.0.0 para Tesseract 7.`);

  function addFile(directory, filename, url) {
    if (!directory) return;
    const absolute = path.join(directory, filename);
    let available = false;
    try { available = fs.statSync(absolute).isFile() && fs.statSync(absolute).size > 0; } catch (_) {}
    files.push({absolute, url, available});
    if (!available) issues.push(`Arquivo OCR ausente: ${url}`);
  }

  const clientDirectory = client && path.join(client.directory, 'dist');
  addFile(clientDirectory, 'tesseract.min.js', `${ASSET_BASE}/tesseract/tesseract.min.js`);
  addFile(clientDirectory, 'worker.min.js', `${ASSET_BASE}/tesseract/worker.min.js`);
  for (const variant of CORE_VARIANTS) {
    for (const extension of ['wasm.js', 'wasm']) {
      const filename = `tesseract-core${variant}.${extension}`;
      addFile(core?.directory, filename, `${ASSET_BASE}/tesseract-core/${filename}`);
    }
  }
  const languages = {};
  for (const language of ['por', 'eng']) {
    const pkg = readPackage(`@tesseract.js-data/${language}`);
    if (!pkg) continue;
    const directory = path.join(pkg.directory, '4.0.0_best_int');
    const filename = `${language}.traineddata.gz`;
    languages[language] = path.join(directory, filename);
    addFile(directory, filename, `${ASSET_BASE}/tessdata/${filename}`);
  }

  return {
    status: {
      ready: issues.length === 0,
      version: RELEASE,
      engineVersion: client?.version || null,
      coreVersion: core?.version || null,
      issues,
      paths: {
        client: `${ASSET_BASE}/tesseract/tesseract.min.js`,
        worker: `${ASSET_BASE}/tesseract/worker.min.js`,
        core: `${ASSET_BASE}/tesseract-core`,
        languages: `${ASSET_BASE}/tessdata`
      }
    },
    clientDirectory,
    coreDirectory: core?.directory,
    languages,
    files
  };
}

function mountOcrAssets(app, options = {}) {
  const express = require('express');
  const runtime = inspectOcrInstallation(options);
  app.get('/health/ocr', (req, res) => {
    res.set('Cache-Control', 'no-store');
    res.status(runtime.status.ready ? 200 : 503).json(runtime.status);
  });

  function staticRouter(directory) {
    const router = express.Router();
    if (directory) router.use(express.static(directory, {index: false, fallthrough: false, maxAge: '1d'}));
    router.use((req, res) => res.status(404).json({error: 'Arquivo OCR não encontrado.', code: 'OCR_ASSET_MISSING'}));
    router.use((err, req, res, next) => {
      if (res.headersSent) return next(err);
      res.status(err.status === 404 ? 404 : 500).json({error: 'Arquivo OCR indisponível.', code: 'OCR_ASSET_MISSING'});
    });
    return router;
  }
  app.use([`${ASSET_BASE}/tesseract`, '/vendor/tesseract'], staticRouter(runtime.clientDirectory));
  app.use([`${ASSET_BASE}/tesseract-core`, '/vendor/tesseract-core'], staticRouter(runtime.coreDirectory));

  const languages = express.Router();
  for (const [language, filename] of Object.entries(runtime.languages)) {
    languages.get(`/${language}.traineddata.gz`, (req, res, next) => {
      res.type('application/gzip');
      res.set('Cache-Control', 'public, max-age=86400');
      res.sendFile(filename, err => { if (err) next(err); });
    });
  }
  languages.use((req, res) => res.status(404).json({error: 'Idioma OCR não encontrado.', code: 'OCR_LANGUAGE_MISSING'}));
  languages.use((err, req, res, next) => {
    if (res.headersSent) return next(err);
    res.status(err.status === 404 ? 404 : 500).json({error: 'Idioma OCR indisponível.', code: 'OCR_LANGUAGE_MISSING'});
  });
  app.use([`${ASSET_BASE}/tessdata`, '/vendor/tessdata'], languages);
  // A missing OCR asset must NEVER fall through to the SPA's index.html.
  app.use(ASSET_BASE, (req, res) => res.status(404).json({error: 'Arquivo OCR não encontrado.', code: 'OCR_ASSET_MISSING'}));
  return runtime;
}

module.exports = {RELEASE, ASSET_BASE, CORE_VARIANTS, inspectOcrInstallation, mountOcrAssets};
