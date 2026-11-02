// The whole database. db.ts applies it when SCHEMA_VERSION is newer than the one recorded, so
// every statement has to be safe to run again; a change bumps the version and only ever adds.
//
// Row-level security is switched on with no policies: Thanos reaches the database as its owner,
// which RLS doesn't bind, while a host that also serves tables over an API (Supabase does) shows
// these to nobody else.

export const SCHEMA_VERSION = 1;

export const SCHEMA = `
create table if not exists people (
  id uuid primary key default gen_random_uuid(),
  email text not null unique,
  name text,
  created_at timestamptz not null default now()
);

create table if not exists labs (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  name text not null,
  institution text not null default '',
  website text not null default '',
  github text not null default '',
  domains text not null default '',
  invite_code text not null unique,
  created_at timestamptz not null default now()
);

create table if not exists members (
  lab_id uuid not null references labs(id) on delete cascade,
  person_id uuid not null references people(id) on delete cascade,
  role text not null default 'member' check (role in ('admin', 'member', 'alum')),
  title text not null default '',
  joined_at timestamptz not null default now(),
  primary key (lab_id, person_id)
);

create table if not exists cards (
  id uuid primary key default gen_random_uuid(),
  lab_id uuid not null references labs(id) on delete cascade,
  question text not null,
  answer text not null default '',
  topic text not null default 'other',
  tags text not null default '',
  asked_by uuid references people(id) on delete set null,
  answered_by uuid references people(id) on delete set null,
  updated_by uuid references people(id) on delete set null,
  checked_by uuid references people(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  answered_at timestamptz,
  checked_at timestamptz,
  removed_at timestamptz
);
create index if not exists cards_by_lab on cards (lab_id, updated_at desc);

create table if not exists revisions (
  id bigint generated always as identity primary key,
  card_id uuid not null references cards(id) on delete cascade,
  question text not null,
  answer text not null,
  topic text not null,
  tags text not null,
  note text not null default '',
  edited_by uuid references people(id) on delete set null,
  edited_at timestamptz not null default now()
);
create index if not exists revisions_by_card on revisions (card_id, edited_at desc);

create table if not exists reactions (
  card_id uuid not null references cards(id) on delete cascade,
  person_id uuid not null references people(id) on delete cascade,
  kind text not null check (kind in ('helped', 'wanted')),
  created_at timestamptz not null default now(),
  primary key (card_id, person_id, kind)
);

create table if not exists login_links (
  token_hash text primary key,
  email text not null,
  next text not null default '/',
  expires_at timestamptz not null,
  used_at timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists login_links_by_email on login_links (email, created_at desc);

create table if not exists sessions (
  id_hash text primary key,
  person_id uuid not null references people(id) on delete cascade,
  expires_at timestamptz not null,
  created_at timestamptz not null default now()
);

alter table people enable row level security;
alter table labs enable row level security;
alter table members enable row level security;
alter table cards enable row level security;
alter table revisions enable row level security;
alter table reactions enable row level security;
alter table login_links enable row level security;
alter table sessions enable row level security;
`;
