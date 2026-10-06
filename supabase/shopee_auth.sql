-- Rede Achados BR - Persistência segura da autorização Shopee
create table if not exists public.shopee_auth (
  id text primary key,
  shop_id bigint not null,
  shop_ids jsonb not null default '[]'::jsonb,
  access_token text not null,
  refresh_token text not null,
  expires_at bigint not null default 0,
  connected_at timestamptz,
  last_refresh_at timestamptz,
  mode text not null default 'sandbox',
  partner_id bigint not null default 0,
  updated_at timestamptz not null default now()
);

alter table public.shopee_auth enable row level security;

comment on table public.shopee_auth is
'Credenciais OAuth da Shopee. Acesso somente pelo backend usando chave secreta/service role.';
