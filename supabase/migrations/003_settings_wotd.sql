-- ============================================================
-- USER SETTINGS
-- ============================================================
create table if not exists public.user_settings (
  user_id               uuid primary key references public.user_profiles(id) on delete cascade,

  -- Word of the Day
  wotd_enabled          boolean not null default true,

  -- Study reminders
  reminder_enabled      boolean not null default true,
  reminder_mode         text not null default 'window'
                          check (reminder_mode in ('window', 'specific')),
  reminder_window       text default 'evening'
                          check (reminder_window in ('morning', 'afternoon', 'evening')),
  reminder_time         text default '20:00',  -- HH:MM, used when mode = 'specific'
  reminder_repeat_count int not null default 1  -- how many times to re-notify if dismissed (1-3)
                          check (reminder_repeat_count between 1 and 3),
  reminder_repeat_gap   int not null default 30, -- minutes between repeat reminders

  updated_at            timestamptz not null default now()
);

alter table public.user_settings enable row level security;
create policy "own_settings" on public.user_settings for all using (auth.uid() = user_id);

-- ============================================================
-- WORD OF THE DAY
-- ============================================================
create table if not exists public.word_of_the_day (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references public.user_profiles(id) on delete cascade,
  word_id     uuid not null references public.words(id) on delete cascade,
  date        date not null default current_date,
  seen        boolean not null default false,
  created_at  timestamptz not null default now(),
  unique (user_id, date)
);

create index if not exists wotd_user_date_idx on public.word_of_the_day(user_id, date desc);

alter table public.word_of_the_day enable row level security;
create policy "own_wotd" on public.word_of_the_day for all using (auth.uid() = user_id);

-- ============================================================
-- Auto-create settings row when user profile is created
-- ============================================================
create or replace function public.create_default_settings()
returns trigger language plpgsql security definer as $$
begin
  insert into public.user_settings (user_id) values (new.id) on conflict do nothing;
  return new;
end;
$$;

drop trigger if exists on_profile_created on public.user_profiles;
create trigger on_profile_created
  after insert on public.user_profiles
  for each row execute function public.create_default_settings();
