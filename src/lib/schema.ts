// The whole database. db.ts applies it when SCHEMA_VERSION is newer than the one recorded, so
// every statement has to be safe to run again; a change bumps the version and only ever adds.
//
// Row-level security is switched on with no policies: Thanos reaches the database as its owner,
// which RLS doesn't bind, while a host that also serves tables over an API (Supabase does) shows
// these to nobody else.

export const SCHEMA_VERSION = 5;

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

-- Version 2: where a card came from, and drafts waiting for an admin, made from the lab's chat
-- by scripts/import-slack.ts. A draft's thread is kept only until someone decides on it.
alter table cards add column if not exists source text not null default '';

create table if not exists drafts (
  id uuid primary key default gen_random_uuid(),
  lab_id uuid not null references labs(id) on delete cascade,
  origin text not null,
  question text not null,
  answer text not null,
  topic text not null default 'other',
  tags text not null default '',
  source text not null default '',
  thread text not null default '',
  dated timestamptz,
  status text not null default 'waiting' check (status in ('waiting', 'kept', 'dropped')),
  created_at timestamptz not null default now(),
  decided_by uuid references people(id) on delete set null,
  decided_at timestamptz,
  card_id uuid references cards(id) on delete set null,
  unique (lab_id, origin)
);
create index if not exists drafts_waiting on drafts (lab_id, status, dated);

-- Version 3: the people who run a hosted Thanos see no lab unless its admins let them in, until
-- support_until. And a lab can name people by email (its first admin, say), who are in it when
-- they first sign in, so whoever starts a lab for someone else needn't join it.
alter table labs add column if not exists support_until timestamptz;

create table if not exists invites (
  lab_id uuid not null references labs(id) on delete cascade,
  email text not null,
  role text not null default 'member' check (role in ('admin', 'member')),
  created_at timestamptz not null default now(),
  primary key (lab_id, email)
);

-- Version 4: which network address asked for a sign-in link (hashed), for a limit per place.
alter table login_links add column if not exists ip_hash text not null default '';
create index if not exists login_links_by_place on login_links (ip_hash, created_at desc);

-- Version 5: projects, and the lab over time. A project has a page with its status and years,
-- who is on it, its code, where its data lives, its Slack channel, its papers and the cards about
-- it, and keeps every version, as a card does. Its repositories and places are one a line, and
-- its papers a list in JSON, each with what doi.org said of it. People on it who aren't in
-- Thanos are kept by name (others). A member's left_at is when they became an alum, for the
-- lab's History. Project drafts come from the lab's GitHub and Slack and wait for an admin.
alter table members add column if not exists left_at timestamptz;

create table if not exists projects (
  id uuid primary key default gen_random_uuid(),
  lab_id uuid not null references labs(id) on delete cascade,
  slug text not null,
  name text not null,
  status text not null default 'active' check (status in ('active', 'paused', 'done', 'published')),
  summary text not null default '',
  started int,
  ended int,
  others text not null default '',
  repos text not null default '',
  data text not null default '',
  slack text not null default '',
  papers text not null default '[]',
  source text not null default '',
  created_by uuid references people(id) on delete set null,
  updated_by uuid references people(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  removed_at timestamptz,
  unique (lab_id, slug)
);

create table if not exists project_people (
  project_id uuid not null references projects(id) on delete cascade,
  person_id uuid not null references people(id) on delete cascade,
  primary key (project_id, person_id)
);

create table if not exists project_versions (
  id bigint generated always as identity primary key,
  project_id uuid not null references projects(id) on delete cascade,
  snapshot text not null,
  note text not null default '',
  edited_by uuid references people(id) on delete set null,
  edited_at timestamptz not null default now()
);
create index if not exists project_versions_by_project on project_versions (project_id, edited_at desc);

alter table cards add column if not exists project_id uuid references projects(id) on delete set null;
alter table revisions add column if not exists project_id uuid references projects(id) on delete set null;
create index if not exists cards_by_project on cards (project_id) where project_id is not null;

create table if not exists project_drafts (
  id uuid primary key default gen_random_uuid(),
  lab_id uuid not null references labs(id) on delete cascade,
  origin text not null,
  name text not null,
  summary text not null default '',
  status text not null default 'active' check (status in ('active', 'paused', 'done', 'published')),
  started int,
  ended int,
  people text not null default '',
  repos text not null default '',
  data text not null default '',
  slack text not null default '',
  papers text not null default '',
  source text not null default '',
  evidence text not null default '',
  state text not null default 'waiting' check (state in ('waiting', 'kept', 'dropped')),
  created_at timestamptz not null default now(),
  decided_by uuid references people(id) on delete set null,
  decided_at timestamptz,
  project_id uuid references projects(id) on delete set null,
  unique (lab_id, origin)
);
create index if not exists project_drafts_waiting on project_drafts (lab_id, state, started);

alter table people enable row level security;
alter table labs enable row level security;
alter table members enable row level security;
alter table cards enable row level security;
alter table revisions enable row level security;
alter table reactions enable row level security;
alter table login_links enable row level security;
alter table sessions enable row level security;
alter table drafts enable row level security;
alter table invites enable row level security;
alter table projects enable row level security;
alter table project_people enable row level security;
alter table project_versions enable row level security;
alter table project_drafts enable row level security;
`;
