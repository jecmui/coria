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

-- Appearance settings. Color columns are only meaningful when
-- appearance_theme = 'custom' -- Light/Dark/System resolve to built-in
-- palettes in code instead. Nullable, falling back to the light defaults in
-- code, same as calendar_time_zone above.
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

-- User preferences: every editable setting now lives here instead of on
-- `profiles`, which is back to being identity only (first_name). Column names
-- drop the old `calendar_`/`appearance_` prefixes -- the table itself is the
-- namespace now. Colors stay nullable and are only meaningful when
-- theme = 'custom', same as before.
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

-- Today-widget clearing, edited from Settings > Board > Today. "manual" leaves
-- clearing to right-clicking the Today widget; "automatic" also clears it on
-- its own once a day at today_clear_time (in today_clear_time_zone), either
-- every focused task or just the done ones per today_clear_scope.
-- today_last_auto_clear_date records the last date the automatic clear ran
-- (client-evaluated, since there's no backend scheduler) so it only fires
-- once per day even across reloads.
alter table user_preferences
  add column today_clear_mode text not null default 'manual',
  add column today_clear_time text not null default '18:00',
  add column today_clear_time_zone text,
  add column today_clear_scope text not null default 'completed',
  add column today_last_auto_clear_date date;