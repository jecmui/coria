-- reference copy of what was run in Supabase's SQL Editor

-- Tasks: the full backlog, with a flag for what's pulled into "today"
create table tasks (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  title text not null,
  done boolean not null default false,
  focus_today boolean not null default false,
  created_at timestamptz not null default now()
);

-- Board widgets: layout + type-specific data stored as jsonb, mirroring BoardWidget in types/index.ts
create table board_widgets (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  type text not null,
  layout jsonb not null,
  z_index integer not null default 1,
  data jsonb not null,
  created_at timestamptz not null default now()
);

-- Profiles: holds first_name captured at signup, populated via trigger below
create table profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  first_name text,
  created_at timestamptz not null default now()
);

alter table tasks enable row level security;
alter table board_widgets enable row level security;
alter table profiles enable row level security;

create policy "Users manage own tasks"
on tasks for all
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

create policy "Users manage own widgets"
on board_widgets for all
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

create policy "Users manage own profile"
on profiles for all
using (auth.uid() = id)
with check (auth.uid() = id);

-- Auto-create a profile row (with first_name pulled from signup metadata) whenever a new auth user is created
create function public.handle_new_user()
returns trigger as $$
begin
  insert into public.profiles (id, first_name)
  values (new.id, new.raw_user_meta_data->>'first_name');
  return new;
end;
$$ language plpgsql security definer;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- Pomodoro settings, edited from the Settings > Pomodoro page and applied
-- to new Pomodoro widgets when they're added to the board.
alter table profiles
  add column focus_seconds integer not null default 1500,
  add column short_break_seconds integer not null default 300,
  add column long_break_seconds integer not null default 900,
  add column long_break_interval integer not null default 4,
  add column auto_start_breaks boolean not null default false,
  add column auto_start_focus boolean not null default false;

  -- Calendar preferences: display settings are kept on the user's profile so they
-- can be reused by the board widget, full calendar page, and future integrations.
alter table profiles
  add column calendar_week_start smallint not null default 0,
  add column calendar_date_format text not null default 'MM/DD/YYYY',
  add column calendar_time_format text not null default '12h',
  add column calendar_time_zone text,
  add column calendar_default_event_duration integer not null default 60;

-- Local calendar events. Timestamps are stored as timestamptz so future Google
-- Calendar synchronization can safely convert between time zones.
create table calendar_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  title text not null,
  description text not null default '',
  location text not null default '',
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint calendar_events_valid_time check (ends_at > starts_at)
);

create index calendar_events_user_starts_at_idx
  on calendar_events (user_id, starts_at);

alter table calendar_events enable row level security;

create policy "Users manage own calendar events"
on calendar_events for all
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

-- Connection metadata for future external calendar providers. OAuth access and
-- refresh tokens should be kept in a trusted backend, not in a client-readable
-- table. This table records which external calendar is connected and its sync state.
create table calendar_connections (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  provider text not null,
  provider_account_id text,
  external_calendar_id text,
  sync_enabled boolean not null default true,
  last_synced_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, provider)
);

alter table calendar_connections enable row level security;

create policy "Users view own calendar connections"
on calendar_connections for select
using (auth.uid() = user_id);

create policy "Users manage own calendar connections"
on calendar_connections for all
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

-- Drag-reorder position among today's focus tasks, edited from the Today widget.
alter table tasks
  add column sort_order integer not null default 0;

-- Drag-reorder position in the mobile stacked board view. Kept separate from
-- `layout`, which only positions widgets on the free-form desktop canvas.
alter table board_widgets
  add column mobile_order integer not null default 0;