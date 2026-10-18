create table if not exists public.shopee_wedrop_products (
  shop_id bigint not null check (shop_id > 0),
  supplier_sku text not null check (length(supplier_sku) between 1 and 140),
  product_data jsonb not null check (jsonb_typeof(product_data) = 'object'),
  source_file text not null,
  source_line integer not null check (source_line > 1),
  source_hash text not null default '',
  imported_at timestamptz not null default now(),
  primary key (shop_id, supplier_sku)
);
alter table public.shopee_wedrop_products enable row level security;
revoke all on public.shopee_wedrop_products from public, anon, authenticated;
grant select, insert, update, delete on public.shopee_wedrop_products to service_role;
comment on table public.shopee_wedrop_products is 'WeDrop source facts by exact supplier SKU; only the Shopee backend can access. Measurements remain raw and unconfirmed.';
