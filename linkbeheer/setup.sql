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

create policy "link_labels_self" on link_labels
  for all
  using  (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- 2. Opgeslagen links
create table if not exists saved_links (
  id           uuid        primary key default gen_random_uuid(),
  user_id      uuid        references auth.users(id) on delete cascade not null,
  url          text        not null,
  title        text        default null,
  summary      text        default null,
  label        text        default null,
  done         boolean     not null default false,
  created_at   timestamptz not null default now(),
  done_at      timestamptz default null
);

alter table saved_links enable row level security;

create policy "saved_links_self" on saved_links
  for all
  using  (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create index if not exists saved_links_user_created_idx
  on saved_links (user_id, created_at desc);
