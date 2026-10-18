create table if not exists public.shopee_app_sessions (
  session_key text primary key check (session_key ~ '^[a-f0-9]{64}$'),
  session_data jsonb not null,
  expires_at timestamptz not null,
  updated_at timestamptz not null default now()
);
create index if not exists shopee_app_sessions_expiry on public.shopee_app_sessions(expires_at);
alter table public.shopee_app_sessions enable row level security;
revoke all on public.shopee_app_sessions from anon, authenticated;
grant select, insert, update, delete on public.shopee_app_sessions to service_role;
