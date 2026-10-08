-- Tabellen voor feedback en leerregels van de Aanvragen-app.
-- Uitvoeren in Supabase (Hub-project) onder SQL Editor. Veilig om opnieuw uit te voeren.

create table if not exists public.aanvragen_regels (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  regel text not null check (char_length(regel) between 5 and 600),
  bucket text,
  actief boolean not null default true,
  bron_deal_id bigint,
  aangemaakt_door text
);

create table if not exists public.aanvragen_feedback (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  deal_id bigint not null,
  bucket text,
  beoordeling smallint not null check (beoordeling in (-1, 1)),
  toelichting text check (char_length(toelichting) <= 2000),
  regel_id uuid references public.aanvragen_regels(id) on delete set null,
  gegeven_door text
);

-- Alleen de server (service_role) mag erbij. Geen policies voor gewone gebruikers.
alter table public.aanvragen_regels enable row level security;
alter table public.aanvragen_feedback enable row level security;
grant select, insert, update, delete on table public.aanvragen_regels to service_role;
grant select, insert, update, delete on table public.aanvragen_feedback to service_role;
