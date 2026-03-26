-- Auto-create a user_profiles row whenever a new auth user is inserted.
-- SECURITY DEFINER bypasses RLS so this works even before the session is active
-- (e.g., when email confirmation is required).
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.user_profiles (
    id,
    display_name,
    starting_level,
    placement_score,
    xp,
    streak_days,
    last_active_at,
    is_premium
  ) values (
    new.id,
    coalesce(
      new.raw_user_meta_data->>'display_name',
      split_part(new.email, '@', 1)
    ),
    'beginner',
    null,
    0,
    0,
    null,
    false
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

-- Drop old trigger if it exists, then recreate
drop trigger if exists on_auth_user_created on auth.users;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();
