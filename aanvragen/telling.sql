-- Tabellen voor de telling van binnengekomen aanvragen per dag.
-- Uitvoeren in Supabase, project "robertbrugman", onder SQL Editor. Veilig om opnieuw uit te voeren.

create table if not exists public.aanvragen_telling (
  deal_id bigint primary key,
  add_time timestamptz not null,
  dag date not null,
  eerst_gezien timestamptz not null default now()
);
create index if not exists aanvragen_telling_dag_idx on public.aanvragen_telling (dag);

create table if not exists public.aanvragen_telling_status (
  id int primary key check (id = 1),
  laatst_bijgewerkt timestamptz,
  laatste_fout text
);

create or replace view public.aanvragen_telling_per_dag as
  select dag, count(*)::int as aantal from public.aanvragen_telling group by dag;
alter view public.aanvragen_telling_per_dag set (security_invoker = true);

-- Alleen de server (service_role) mag erbij.
alter table public.aanvragen_telling enable row level security;
alter table public.aanvragen_telling_status enable row level security;
grant select, insert, update, delete on table public.aanvragen_telling to service_role;
grant select, insert, update, delete on table public.aanvragen_telling_status to service_role;
grant select on public.aanvragen_telling_per_dag to service_role;
revoke all on public.aanvragen_telling_per_dag from anon, authenticated;
