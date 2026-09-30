// SKU handling is shared by import, lookup and manual variation links.
// Keep IDs and SKUs as text, including leading zeroes.
export function normalizeSku(value) {
  return String(value ?? '').normalize('NFKC')
    .replace(/[\u200B-\u200D\uFEFF]/g, '')
    .replace(/[‐‑‒–—−]/g, '-').replace(/\s+/g, '').toUpperCase();
}

const text = value => String(value ?? '').trim();
const headerText = value => text(value).normalize('NFD')
  .replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
const headers = {
  id: ['id do produto', 'product id', 'item id', 'et title product id'],
  name: ['nome do produto', 'product name', 'et title product name'],
  parent: ['sku de referencia', 'sku principal', 'sku pai', 'parent sku', 'et title parent sku'],
  variation: ['sku da variacao', 'sku de variacao', 'sku variacao', 'sku do modelo', 'sku modelo', 'variation sku', 'model sku', 'seller sku', 'et title model sku', 'et title variation sku'],
  description: ['descricao do produto', 'product description', 'et title product description'],
  variationName: ['nome da variacao', 'variacao', 'nome do modelo', 'variation name', 'model name'],
  variationId: ['id da variacao', 'id do modelo', 'variation id', 'model id']
};

function sheetHeader(rows) {
  for (let i = 0; i < Math.min(rows.length, 30); i++) {
    const cells = (rows[i] || []).map(headerText);
    const indices = Object.fromEntries(Object.entries(headers).map(([key, names]) =>
      [key, cells.findIndex(cell => names.includes(cell))]));
    const genericSku = cells.indexOf('sku');
    if (indices.parent < 0 && indices.variation < 0) indices.parent = genericSku;
    else if (indices.parent >= 0 && indices.variation < 0) indices.variation = genericSku;
    if (indices.id >= 0 && (indices.name >= 0 || indices.variation >= 0)) return { row: i, ...indices };
  }
  return null;
}

function uniqueSkus(values) {
  const result = new Map();
  for (const value of values) {
    const clean = text(value), key = normalizeSku(clean);
    if (key && !result.has(key)) result.set(key, clean);
  }
  return [...result.values()];
}

function productSkus(catalog, product) {
  return uniqueSkus([
    product.sku, ...(product.skus || []), ...(product.variations || []).map(v => v.sku),
    ...(catalog.manualSkuAliases || []).filter(a => String(a.productId) === String(product.id)).map(a => a.sku)
  ]);
}

function skuIndex(catalog) {
  const index = new Map();
  for (const product of catalog.products || []) {
    for (const sku of productSkus(catalog, product)) {
      const key = normalizeSku(sku);
      if (!index.has(key)) index.set(key, []);
      index.get(key).push({ product, matchedSku: sku });
    }
  }
  return index;
}

export function catalogStats(catalog) {
  const index = skuIndex(catalog);
  const variationSkus = new Set();
  for (const p of catalog.products || []) {
    for (const sku of productSkus(catalog, p)) {
      if (normalizeSku(sku) !== normalizeSku(p.sku)) variationSkus.add(normalizeSku(sku));
    }
  }
  return {
    count: (catalog.products || []).length,
    skuCount: index.size,
    variationSkuCount: variationSkus.size,
    duplicateSkuCount: [...index.values()].filter(items => items.length > 1).length
  };
}

export function lookupCatalogSku(catalog, sku, productId = '') {
  const key = normalizeSku(sku);
  if (!key) return null;
  const matches = skuIndex(catalog).get(key) || [];
  if (!matches.length) return null;
  const selectedId = text(productId);
  let match;
  if (selectedId) {
    match = matches.find(item => String(item.product.id) === selectedId);
    if (!match) throw new Error('O anúncio escolhido não está vinculado a esta SKU. Faça a busca novamente.');
  } else if (matches.length > 1) {
    const error = new Error(`Esta SKU aparece em ${matches.length} anúncios. Escolha o produto correto abaixo.`);
    error.code = 'SKU_AMBIGUOUS';
    error.candidates = matches.map(({product}) => ({id:product.id, name:product.name, sku:product.sku, url:product.url}));
    throw error;
  } else match = matches[0];
  return {...match.product, matchedSku:match.matchedSku,
    matchType:normalizeSku(match.product.sku) === key ? 'exact' : 'variation'};
}

export function linkCatalogSku(catalog, productId, sku, extra = {}) {
  const id = text(productId), clean = text(sku), key = normalizeSku(clean);
  if (!/^\d+$/.test(id)) throw new Error('Informe o ID numérico do produto na Shopee.');
  const product = (catalog.products || []).find(p => String(p.id) === id);
  if (!product) throw new Error('Este ID de produto não está no catálogo. Atualize a planilha primeiro.');
  if (!key || clean.length > 128) throw new Error('Informe uma SKU de variação válida, com até 128 caracteres.');
  const other = (skuIndex(catalog).get(key) || []).find(item => String(item.product.id) !== id);
  if (other) throw new Error(`Esta SKU já está vinculada ao anúncio ${other.product.id}. Confira os códigos antes de criar o vínculo.`);
  const aliases = (catalog.manualSkuAliases || []).filter(a => normalizeSku(a.sku) !== key);
  if (normalizeSku(product.sku) !== key) aliases.push({productId:id, sku:clean,
    variationName:text(extra.variationName), source:text(extra.source) || 'manual'});
  return {...catalog, manualSkuAliases:aliases};
}

// XLSX decoding stays in server.js. This function receives every worksheet as
// a matrix of displayed cell values, making import behavior independently testable.
export function parseCatalogSheets(sheets, {filename = 'catalogo-shopee.xlsx', previous = {}, importedAt = new Date().toISOString()} = {}) {
  const found = sheets.map(sheet => ({...sheet, header:sheetHeader(sheet.rows)})).filter(sheet => sheet.header);
  if (!found.length) throw new Error('Esta planilha não parece ser a exportação de Informações básicas da Shopee: faltam as colunas ID do Produto + Nome do Produto (ou ID do Produto + SKU da variação). Baixe a planilha em Central do Vendedor > Meus Produtos > Editar em massa > Informações básicas e tente novamente.');
  const hasProductNames = found.some(sheet => sheet.header.name >= 0);
  const hasVariationColumn = found.some(sheet => sheet.header.variation >= 0);
  const shopId = text(previous.shopId) || '852701218';
  const previousById = new Map((previous.products || []).map(p => [String(p.id), p]));
  const products = new Map();
  if (!hasProductNames) {
    for (const p of previous.products || []) products.set(String(p.id), {...p,
      skus:[...(p.skus || [])], variations:[...(p.variations || [])]});
  }
  let validRows = 0;
  for (const {rows, header:h} of found) {
    let lastId = '';
    for (const row of rows.slice(h.row + 1)) {
      const get = key => h[key] >= 0 ? text(row[h[key]]) : '';
      const rawId = get('id'), variantSku = get('variation');
      // A continuation row is accepted only inside an explicit variation table.
      const id = rawId || (h.variation >= 0 && variantSku ? lastId : '');
      if (!/^\d+$/.test(id)) { if (rawId) lastId = ''; continue; }
      lastId = id;
      if (!get('name') && !get('parent') && !variantSku) continue;
      validRows++;
      let p = products.get(id);
      if (!p) {
        const old = previousById.get(id);
        p = {id, sku:old?.sku || '', name:old?.name || '', description:old?.description || '',
          url:`https://shopee.com.br/product/${shopId}/${id}/`, skus:[], variations:[]};
        // A basic-info export cannot remove variations it does not contain.
        if (!hasVariationColumn && old) {
          p.skus = (old.skus || []).filter(sku => normalizeSku(sku) !== normalizeSku(old.sku));
          p.variations = [...(old.variations || [])];
        }
        products.set(id, p);
      }
      if (get('name')) p.name = get('name');
      if (h.description >= 0 && (get('description') || get('name'))) p.description = get('description');
      if (get('parent')) {
        if (normalizeSku(get('parent')) !== normalizeSku(p.sku)) {
          p.skus = p.skus.filter(sku => normalizeSku(sku) !== normalizeSku(p.sku));
        }
        p.sku = get('parent');
      }
      if (variantSku) {
        p.variations = p.variations.filter(v => normalizeSku(v.sku) !== normalizeSku(variantSku));
        p.variations.push({sku:variantSku, name:get('variationName'), id:get('variationId')});
      }
    }
  }
  if (!validRows) throw new Error('Nenhum produto válido foi encontrado no arquivo.');
  const list = [...products.values()];
  if (list.some(p => !p.name)) throw new Error('Há variações sem nome de produto. Importe primeiro a planilha de informações básicas correspondente.');
  for (const p of list) p.skus = uniqueSkus([p.sku, ...(p.variations || []).map(v => v.sku), ...(p.skus || [])]);
  const validIds = new Set(list.map(p => p.id));
  return {schemaVersion:2, shopId, importedAt, sourceFile:filename, count:list.length,
    manualSkuAliases:(previous.manualSkuAliases || []).filter(a => validIds.has(String(a.productId))), products:list};
}
