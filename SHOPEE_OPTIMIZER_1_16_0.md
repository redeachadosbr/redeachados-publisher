# Shopee Manager 1.16.0

The WeDrop importer previously saved only costs. The optimizer also hid category fields without predefined choices, and reused existing listing text as its draft. This release makes those gaps visible and editable.

- Official 16-column WeDrop imports preserve source filename, line, hash, exact SKU, NCM/CEST/EAN and raw product facts in the private `shopee_wedrop_products` table. Importing unchanged costs still backfills metadata. Conflicting duplicate SKUs cannot supply automatic fiscal facts.
- Fiscal suggestions use the matched supplier row and the store's saved instructions. Measurement units remain product-specific. Raw supplier weights/dimensions are not automatically converted or treated as assembled product measurements.
- All category attributes appear, including free text, date/numeric inputs, official units, multiple values and dependent fields. The backend validates the current Shopee schema and evidence before preparing a write; unrelated fields remain preserved.
- Title approval requires exactly 120 Unicode codepoints. Description approval requires 1400–1440 codepoints, the five configured sections, five numbered FAQ entries and ten numbered reasons. Emoji counting is consistent in the editor and execution preflight. A/B drafts and research notes can be retained in the SKU review.
- Execution warnings list unresolved category fields. Reviewed fields and the imported video can proceed without asserting that unknown age/certification data was completed.

Validation: 198 automated tests pass, including unchanged-cost metadata import, leading zeros, ambiguous duplicate SKU isolation, stale SKU links, free/multiple/unit category fields, dependent required fields and emoji boundaries. The Supabase migration was applied with RLS and service-role-only grants.

Scope: `redeachados-publisher`, branch `shopee-service`, Render `redeachados-shopee`. No marketplace prices, inventory or promotions changed by this release. The application does not claim to research competitors or generate AI text itself: the prepared SKU copy and accessible source notes are reviewed inputs to the execution flow.

TRC1525 source findings: WeDrop NCM 95069900, brand Top Rio, EAN 7908722915257. Raw spreadsheet mass 2600 in the kg column and 33 × 13 × 36 cm require clarification; the current listing states assembled dimensions of 43 cm height × 135 cm width × 88 cm length and capacity 210 L. Recommended age and certification require supporting product documentation.
