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

-- Board widgets: where each one sits, plus whatever data its own type needs.
-- Mirrors BoardWidget in types/index.ts.
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

-- Give every new user a profile row, with first_name taken from signup.
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

-- Calendar display settings, kept on the profile so the board widget and the
-- calendar page can share them.
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

-- Which external calendar account is connected, and how its sync is going.
-- Tokens are deliberately not stored here -- see calendar_connection_secrets.
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

-- Appearance settings. The color columns only apply when the theme is
-- 'custom'; Light/Dark/System use built-in palettes instead.
alter table profiles
  add column appearance_theme text not null default 'light',
  add column appearance_color_board text,
  add column appearance_color_board_line text,
  add column appearance_color_paper text,
  add column appearance_color_paper_edge text,
  add column appearance_color_ink text,
  add column appearance_color_ink_soft text,
  add column appearance_color_pin_todo text,
  add column appearance_color_pin_note text,
  add column appearance_color_pin_timer text,
  add column appearance_color_pin_image text,
  add column appearance_color_pin_calendar text;

-- Every editable setting moves here, leaving `profiles` as identity only.
-- Column names drop their old calendar_/appearance_ prefixes.
create table user_preferences (
  user_id uuid primary key references auth.users(id) on delete cascade,

  -- Pomodoro
  focus_seconds integer not null default 1500,
  short_break_seconds integer not null default 300,
  long_break_seconds integer not null default 900,
  long_break_interval integer not null default 4,
  auto_start_breaks boolean not null default false,
  auto_start_focus boolean not null default false,

  -- Calendar
  week_start smallint not null default 0,
  date_format text not null default 'MM/DD/YYYY',
  time_format text not null default '12h',
  time_zone text,
  default_event_duration integer not null default 60,

  -- Appearance
  theme text not null default 'light',
  color_board text,
  color_board_line text,
  color_paper text,
  color_paper_edge text,
  color_ink text,
  color_ink_soft text,
  color_pin_todo text,
  color_pin_note text,
  color_pin_timer text,
  color_pin_image text,
  color_pin_calendar text,

  -- Tasks: cleared by "Don't ask again" in the Today widget's delete confirmation.
  confirm_task_delete boolean not null default true,

  created_at timestamptz not null default now()
);

-- Backfill from the columns that used to live on `profiles`.
insert into user_preferences (
  user_id,
  focus_seconds, short_break_seconds, long_break_seconds,
  long_break_interval, auto_start_breaks, auto_start_focus,
  week_start, date_format, time_format, time_zone, default_event_duration,
  theme, color_board, color_board_line, color_paper, color_paper_edge,
  color_ink, color_ink_soft, color_pin_todo, color_pin_note,
  color_pin_timer, color_pin_image, color_pin_calendar
)
select
  id,
  focus_seconds, short_break_seconds, long_break_seconds,
  long_break_interval, auto_start_breaks, auto_start_focus,
  calendar_week_start, calendar_date_format, calendar_time_format,
  calendar_time_zone, calendar_default_event_duration,
  appearance_theme, appearance_color_board, appearance_color_board_line,
  appearance_color_paper, appearance_color_paper_edge, appearance_color_ink,
  appearance_color_ink_soft, appearance_color_pin_todo,
  appearance_color_pin_note, appearance_color_pin_timer,
  appearance_color_pin_image, appearance_color_pin_calendar
from profiles
on conflict (user_id) do nothing;

alter table user_preferences enable row level security;

create policy "Users manage own preferences"
on user_preferences for all
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

-- New signups get a profile row and a preferences row (all defaults).
create or replace function public.handle_new_user()
returns trigger as $$
begin
  insert into public.profiles (id, first_name)
  values (new.id, new.raw_user_meta_data->>'first_name');

  insert into public.user_preferences (user_id)
  values (new.id);

  return new;
end;
$$ language plpgsql security definer;

-- Preferences have moved -- `profiles` keeps only identity data.
alter table profiles
  drop column focus_seconds,
  drop column short_break_seconds,
  drop column long_break_seconds,
  drop column long_break_interval,
  drop column auto_start_breaks,
  drop column auto_start_focus,
  drop column calendar_week_start,
  drop column calendar_date_format,
  drop column calendar_time_format,
  drop column calendar_time_zone,
  drop column calendar_default_event_duration,
  drop column appearance_theme,
  drop column appearance_color_board,
  drop column appearance_color_board_line,
  drop column appearance_color_paper,
  drop column appearance_color_paper_edge,
  drop column appearance_color_ink,
  drop column appearance_color_ink_soft,
  drop column appearance_color_pin_todo,
  drop column appearance_color_pin_note,
  drop column appearance_color_pin_timer,
  drop column appearance_color_pin_image,
  drop column appearance_color_pin_calendar;

-- Board movement preference, edited from Settings > Board. When on, the
-- board's Rnd widgets snap to the grid formed by the board-texture dots.
alter table user_preferences
  add column snap_to_grid boolean not null default false;

-- Today-widget clearing (Settings > Board > Today): by hand, or once a day at
-- a set time. The last-run date stops it clearing twice in one day.
alter table user_preferences
  add column today_clear_mode text not null default 'manual',
  add column today_clear_time text not null default '18:00',
  add column today_clear_time_zone text,
  add column today_clear_scope text not null default 'completed',
  add column today_last_auto_clear_date date;

-- Google sync groundwork: where an event came from, what its id is over
-- there, and whether it's an all-day event with no particular time.
alter table calendar_events
  add column source text not null default 'local',
  add column external_id text,
  add column all_day boolean not null default false;

-- A repeating event is one row: starts_at/ends_at are its first occurrence,
-- and recurrence_rule describes how it repeats. Null when it doesn't.
alter table calendar_events
  add column recurrence_rule text;

-- Today-widget sorting (Settings > Board > Today): when on, finished tasks
-- drop below unfinished ones instead of staying where they were.
alter table user_preferences
  add column today_sort_completed_to_bottom boolean not null default false;

-- Two-way sync groundwork: `dirty` flags local changes not yet sent to
-- Google, and `deleted_at` hides a deleted row until that delete is sent.
alter table calendar_events
  add column dirty boolean not null default false,
  add column deleted_at timestamptz;

-- The time zone an event was written in, as Google reports it. Only needed
-- to work out a repeating event's occurrences; null for events made here.
alter table calendar_events
  add column event_time_zone text;

-- Lets a user have several calendars instead of events hanging off user_id.
-- is_primary is the default one; external_calendar_id links it to Google.
create table calendars (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  color text,
  is_primary boolean not null default false,
  external_calendar_id text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- At most one primary calendar per user.
create unique index calendars_user_primary_idx
  on calendars (user_id)
  where is_primary;

alter table calendars enable row level security;

create policy "Users manage own calendars"
on calendars for all
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

-- Backfill: every existing user gets a default calendar, and every existing
-- event attaches to it.
insert into calendars (user_id, name, is_primary)
select id, 'My Calendar', true
from auth.users;

alter table calendar_events
  add column calendar_id uuid references calendars(id) on delete cascade;

update calendar_events ce
set calendar_id = c.id
from calendars c
where c.user_id = ce.user_id and c.is_primary;

alter table calendar_events
  alter column calendar_id set not null;

create index calendar_events_calendar_id_idx
  on calendar_events (calendar_id);

-- New signups also get a primary calendar, same as their profile and
-- preferences row.
create or replace function public.handle_new_user()
returns trigger as $$
begin
  insert into public.profiles (id, first_name)
  values (new.id, new.raw_user_meta_data->>'first_name');

  insert into public.user_preferences (user_id)
  values (new.id);

  insert into public.calendars (user_id, name, is_primary)
  values (new.id, 'My Calendar', true);

  return new;
end;
$$ language plpgsql security definer;

-- Keeps updated_at correct on every write, whatever changed the row --
-- sync compares it with Google's own timestamp to settle conflicts.
create function public.set_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

create trigger calendar_events_set_updated_at
  before update on calendar_events
  for each row execute function public.set_updated_at();

create trigger calendar_connections_set_updated_at
  before update on calendar_connections
  for each row execute function public.set_updated_at();

create trigger calendars_set_updated_at
  before update on calendars
  for each row execute function public.set_updated_at();

-- A single occurrence of a repeating event, edited or cancelled on its own.
-- master_event_id is the series; original_start_time picks the occurrence.
create table calendar_event_exceptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  master_event_id uuid not null references calendar_events(id) on delete cascade,
  original_start_time timestamptz not null,
  is_cancelled boolean not null default false,
  title text,
  description text,
  location text,
  starts_at timestamptz,
  ends_at timestamptz,
  all_day boolean,
  external_id text,
  dirty boolean not null default true,
  deleted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (master_event_id, original_start_time),
  constraint calendar_event_exceptions_modified_fields_check check (
    is_cancelled or (
      title is not null and starts_at is not null and ends_at is not null
      and ends_at > starts_at
    )
  )
);

create index calendar_event_exceptions_master_event_id_idx
  on calendar_event_exceptions (master_event_id);

alter table calendar_event_exceptions enable row level security;

create policy "Users manage own calendar event exceptions"
on calendar_event_exceptions for all
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

create trigger calendar_event_exceptions_set_updated_at
  before update on calendar_event_exceptions
  for each row execute function public.set_updated_at();

-- The last event Google sent us, stored as-is: attendees, reminders, and
-- anything else Coria has no column for, so editing here doesn't lose them.
alter table calendar_events
  add column external_raw jsonb;

alter table calendar_event_exceptions
  add column external_raw jsonb;

-- Google sign-in tokens, kept out of the browser-readable tables above.
-- Security is on with no access rule, so only the server key can touch it.
create table calendar_connection_secrets (
  connection_id uuid primary key references calendar_connections(id) on delete cascade,
  access_token text not null,
  refresh_token text not null,
  expires_at timestamptz not null,
  scope text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table calendar_connection_secrets enable row level security;

create trigger calendar_connection_secrets_set_updated_at
  before update on calendar_connection_secrets
  for each row execute function public.set_updated_at();

-- One Google account can hold several calendars, so the link to a specific
-- calendar moves onto `calendars`. Copied across first so nothing is lost.
update calendars c
set external_calendar_id = cc.external_calendar_id
from calendar_connections cc
where cc.user_id = c.user_id
  and c.is_primary
  and cc.external_calendar_id is not null
  and c.external_calendar_id is null;

alter table calendar_connections
  drop column external_calendar_id;

-- Sync checks in on a timer rather than waiting for Google to call us.
-- This is how often to check; last_synced_at above says when it last did.
alter table calendar_connections
  add column poll_interval_seconds integer not null default 300;

-- A short-lived, one-use ticket tying a Google sign-in back to whoever
-- started it, since Google's redirect back to us carries no login session.
create table google_oauth_states (
  state uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now()
);

alter table google_oauth_states enable row level security;

create policy "Users create own oauth state"
on google_oauth_states for insert
with check (auth.uid() = user_id);

-- Where the last sync finished for this calendar, so the next one asks
-- Google only for what has changed since. Null means start from scratch.
alter table calendars
  add column sync_token text;

-- Like calendar_events.dirty: a calendar made here but not yet in Google.
-- Nothing sets it yet, since there's no way to create a calendar in Coria.
alter table calendars
  add column dirty boolean not null default false;

-- Which site the sign-in started from, so we send the user back there
-- afterwards -- before this, signing in on localhost landed on production.
alter table google_oauth_states
  add column return_origin text;

-- Allow an event with no duration: the end may equal the start, just never
-- come before it. Both checks change from `>` to `>=` to match.
alter table calendar_events
  drop constraint calendar_events_valid_time,
  add constraint calendar_events_valid_time check (ends_at >= starts_at);

alter table calendar_event_exceptions
  drop constraint calendar_event_exceptions_modified_fields_check,
  add constraint calendar_event_exceptions_modified_fields_check check (
    is_cancelled or (
      title is not null and starts_at is not null and ends_at is not null
      and ends_at >= starts_at
    )
  );

-- "Manage synced calendars" lets a user pull from any Google calendar they
-- can see. is_writable is false for view-only ones, which Coria won't edit.
alter table calendars
  add column is_writable boolean not null default true;

-- All-day events are plain dates, so they now sit at UTC rather than the
-- user's zone, which could shift them a day. Clearing the token re-pulls.
update calendars set sync_token = null where external_calendar_id is not null;

-- Event color, as a hex string. Null means "use the calendar's color",
-- which is how Google works: an event's own color overrides its calendar's.
alter table calendar_events
  add column color text;

-- When on, a color changed in Coria is written back to Google on the next
-- sync. Off by default, so colors stay local unless the user opts in.
alter table user_preferences
  add column sync_event_colors boolean not null default false;

-- When on, event blocks are filled solid instead of letting the grid show
-- through. Off by default, matching how they've always been drawn.
alter table user_preferences
  add column opaque_events boolean not null default false;

-- The Google calendar this event was last pushed to. Changing an event's
-- calendar_id has to move it at Google too, and a move needs to name where
-- it is now -- which calendar_id no longer says once it has been changed.
alter table calendar_events
  add column synced_calendar_external_id text;

-- Backfill: every already-synced event sits in its own calendar's Google
-- calendar, since until now there was no way to move one.
update calendar_events ce
set synced_calendar_external_id = c.external_calendar_id
from calendars c
where c.id = ce.calendar_id
  and ce.external_id is not null
  and c.external_calendar_id is not null;
