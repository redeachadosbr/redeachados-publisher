'use strict';
const { createWorker } = require('tesseract.js');
const target = process.argv[2];
(async () => {
  if (!target) process.exit(2);
  const worker = await createWorker('por');
  try {
    const out = await worker.recognize(target);
    process.stdout.write(String(out?.data?.text || '').slice(0,50000));
  } finally { await worker.terminate(); }
})().catch(err => { process.stderr.write(String(err?.message || err).slice(0,300));process.exit(1); });
