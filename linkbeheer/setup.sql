-- ================================================================
-- Hub: Linkbeheer (opgeslagen URL's met label en AI-samenvatting)
-- Voer dit uit via Lovable-chat: "Run this SQL in my Supabase project"
-- of via het Supabase SQL-tabblad.
-- ================================================================

-- 1. Labels (los beheerd zodat je uit een lijst kunt kiezen of nieuwe kunt maken)
create table if not exists link_labels (
  id      uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade not null,
  name    text not null,
  constraint link_labels_uq unique (user_id, name)
);

alter table link_labels enable row level security;

drop policy if exists "link_labels_self" on link_labels;
create policy "link_labels_self" on link_labels
  for all
  using  (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- 2. Mappen (platte structuur, geen nesting: een link zit in maximaal 1 map)
create table if not exists link_folders (
  id      uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade not null,
  name    text not null,
  constraint link_folders_uq unique (user_id, name)
);

alter table link_folders enable row level security;

drop policy if exists "link_folders_self" on link_folders;
create policy "link_folders_self" on link_folders
  for all
  using  (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- 3. Opgeslagen links
create table if not exists saved_links (
  id           uuid        primary key default gen_random_uuid(),
  user_id      uuid        references auth.users(id) on delete cascade not null,
  url          text        not null,
  title        text        default null,
  summary      text        default null,
  label        text        default null,
  folder_id    uuid        references link_folders(id) on delete set null,
  done         boolean     not null default false,
  created_at   timestamptz not null default now(),
  done_at      timestamptz default null
);

alter table saved_links enable row level security;

drop policy if exists "saved_links_self" on saved_links;
create policy "saved_links_self" on saved_links
  for all
  using  (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create index if not exists saved_links_user_created_idx
  on saved_links (user_id, created_at desc);

-- Als je deze tabel al eerder had aangemaakt (zonder folder_id), voegt dit 'm alsnog toe:
alter table saved_links add column if not exists folder_id uuid references link_folders(id) on delete set null;

-- Voorgestelde label (op basis van de AI-samenvatting), alleen gezet als er
-- bij toevoegen nog geen label was gekozen. Los van 'label' zodat een suggestie
-- weggewuifd kan worden zonder het echte label aan te tasten.
alter table saved_links add column if not exists suggested_label text default null;

-- Eigen notitie: waarom bewaar je deze link (in tegenstelling tot 'summary',
-- dat is de AI-samenvatting van de pagina zelf). Optioneel, door de gebruiker
-- zelf ingevuld bij toevoegen of later.
alter table saved_links add column if not exists note text default null;

-- ================================================================
-- 5. Labels vervangen mappen: een link kan meerdere labels tegelijk hebben
-- (in plaats van precies 1 label + optioneel 1 map). Mappen (link_folders)
-- en het losse label-tekstveld (saved_links.label) blijven bestaan als data,
-- maar worden niet meer gebruikt door de app zodra deze migratie is gedraaid.
-- ================================================================

create table if not exists saved_link_labels (
  link_id  uuid references saved_links(id) on delete cascade not null,
  label_id uuid references link_labels(id) on delete cascade not null,
  primary key (link_id, label_id)
);

alter table saved_link_labels enable row level security;

drop policy if exists "saved_link_labels_self" on saved_link_labels;
create policy "saved_link_labels_self" on saved_link_labels
  for all
  using (exists (select 1 from saved_links l where l.id = link_id and l.user_id = auth.uid()))
  with check (exists (select 1 from saved_links l where l.id = link_id and l.user_id = auth.uid()));

grant select, insert, update, delete on saved_link_labels to anon, authenticated;

-- Migratie stap A: bestaand label-tekstveld omzetten naar een koppeling
insert into saved_link_labels (link_id, label_id)
select sl.id, ll.id
from saved_links sl
join link_labels ll on ll.user_id = sl.user_id and ll.name = sl.label
where sl.label is not null
on conflict do nothing;

-- Migratie stap B: elke map wordt een label met dezelfde naam, links uit die
-- map krijgen dat label. Veilig om opnieuw te draaien (on conflict do nothing).
insert into link_labels (user_id, name)
select distinct lf.user_id, lf.name
from link_folders lf
on conflict (user_id, name) do nothing;

insert into saved_link_labels (link_id, label_id)
select sl.id, ll.id
from saved_links sl
join link_folders lf on lf.id = sl.folder_id
join link_labels ll on ll.user_id = sl.user_id and ll.name = lf.name
where sl.folder_id is not null
on conflict do nothing;

-- 6. Tabelrechten voor de anon/authenticated rollen (de rollen die de Supabase-JS
-- library gebruikt namens ingelogde gebruikers). Zonder dit geeft de app
-- "permission denied for table ..." ook al staan de RLS-policies goed:
-- RLS bepaalt WELKE rijen zichtbaar zijn, deze grants bepalen OF de rol de
-- tabel mag aanraken. Tabellen die je via de SQL Editor aanmaakt krijgen deze
-- rechten niet automatisch (in tegenstelling tot tabellen via de Table Editor UI).
grant select, insert, update, delete on link_labels       to anon, authenticated;
grant select, insert, update, delete on link_folders      to anon, authenticated;
grant select, insert, update, delete on saved_links       to anon, authenticated;
grant select, insert, update, delete on saved_link_labels to anon, authenticated;
