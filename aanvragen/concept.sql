-- Bewaart het laatste conceptantwoord per aanvraag, zodat het bij heropenen niet opnieuw geschreven hoeft te worden.
-- Veilig om opnieuw uit te voeren.
create table if not exists public.aanvragen_concept (
  deal_id bigint primary key,
  hash text not null,
  bucket text,
  lang text,
  extra text,
  onderwerp text,
  tekst text not null,
  kopjes jsonb,
  model text,
  bijgewerkt timestamptz not null default now()
);
alter table public.aanvragen_concept enable row level security;
grant select, insert, update, delete on table public.aanvragen_concept to service_role;
