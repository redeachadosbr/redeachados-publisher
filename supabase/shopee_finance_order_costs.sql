-- Financeiro Shopee / Rede Achados BR
-- Custos de compra declarados por PEDIDO, isolados por loja.
-- Esta tabela nao e um extrato automatico da WeDrop; exigir referencia da compra.
-- Importante: desde 30/10/2026 novas tabelas nao recebem grants automaticos
-- na Data API Supabase. Somente o backend com service_role tem acesso.
create table if not exists public.shopee_finance_order_costs (
  shop_id bigint not null check (shop_id > 0),
  order_sn text not null check (length(order_sn) between 8 and 65),
  supplier_cost numeric(14,2) not null check (supplier_cost >= 0),
  supplier_credit numeric(14,2) not null default 0 check (supplier_credit >= 0),
  external_expense numeric(14,2) not null default 0 check (external_expense >= 0),
  source_reference text not null check (length(btrim(source_reference)) between 3 and 140),
  updated_at timestamptz not null default now(),
  primary key (shop_id, order_sn)
);
alter table public.shopee_finance_order_costs enable row level security;
revoke all on table public.shopee_finance_order_costs from public, anon, authenticated;
grant select, insert, update on table public.shopee_finance_order_costs to service_role;
comment on table public.shopee_finance_order_costs is
  'Custos efetivos declarados por pedido com referencia de compra/nota WeDrop; sem PII ou credenciais. A referencia nao constitui validacao independente.';
