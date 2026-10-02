-- Run Detroit — player accounts and progress
-- Every table is row-level-secured so a signed-in player can only ever
-- read or write their own row.

create table if not exists public.profiles (
  id          uuid primary key references auth.users(id) on delete cascade,
  display_name text not null default 'Player',
  home_court   text not null default 'chandler',
  created_at   timestamptz not null default now()
);

create table if not exists public.player_state (
  user_id      uuid primary key references auth.users(id) on delete cascade,
  points       integer not null default 1250,
  streak       integer not null default 2,
  weeks_active integer not null default 2,
  checked_in_court text,
  checked_in_at    timestamptz,
  shots_fired  boolean not null default false,
  submitted    boolean not null default false,
  stops        boolean[] not null default '{true,false,false}',
  updated_at   timestamptz not null default now()
);

create table if not exists public.check_ins (
  id        bigserial primary key,
  user_id   uuid not null references auth.users(id) on delete cascade,
  court_id  text not null,
  points    integer not null default 0,
  kind      text not null default 'check_in',
  created_at timestamptz not null default now()
);
create index if not exists check_ins_user_idx on public.check_ins (user_id, created_at desc);

alter table public.profiles     enable row level security;
alter table public.player_state enable row level security;
alter table public.check_ins    enable row level security;

drop policy if exists "own profile"       on public.profiles;
drop policy if exists "own state"         on public.player_state;
drop policy if exists "own check ins"     on public.check_ins;

create policy "own profile"   on public.profiles
  for all using (auth.uid() = id)      with check (auth.uid() = id);
create policy "own state"     on public.player_state
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "own check ins" on public.check_ins
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- Give every new account a profile and a starting progress row.
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, display_name)
    values (new.id, coalesce(new.raw_user_meta_data->>'display_name', split_part(coalesce(new.email,'Player'), '@', 1)))
    on conflict (id) do nothing;
  insert into public.player_state (user_id) values (new.id) on conflict (user_id) do nothing;
  return new;
end $$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

create or replace function public.touch_updated_at()
returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end $$;

drop trigger if exists player_state_touch on public.player_state;
create trigger player_state_touch before update on public.player_state
  for each row execute function public.touch_updated_at();

-- Aggregate court standings, readable by any signed-in player.
create or replace view public.court_standings
with (security_invoker = on) as
  select court_id,
         count(*)::int              as check_ins,
         coalesce(sum(points),0)::int as points
  from public.check_ins
  group by court_id;
