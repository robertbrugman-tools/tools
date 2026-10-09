-- Handmatig gekozen bakjes van de Aanvragen-app. Veilig om opnieuw uit te voeren.
-- Is al uitgevoerd in het Hub-project (robertbrugman) op 2026-10-09.
create table if not exists public.aanvragen_bakje (
  deal_id bigint primary key,
  bucket text not null,
  automatisch text,
  door text,
  bijgewerkt timestamptz not null default now()
);
alter table public.aanvragen_bakje enable row level security;
grant select, insert, update, delete on table public.aanvragen_bakje to service_role;
