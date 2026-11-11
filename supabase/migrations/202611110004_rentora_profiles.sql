-- Create a profile row for every new login, using the name given at sign-up.
create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles(user_id, full_name)
  values (new.id, left(nullif(trim(new.raw_user_meta_data->>'full_name'), ''), 120))
  on conflict (user_id) do nothing;
  return new;
end $$;
revoke all on function public.handle_new_user() from public, anon, authenticated;
create trigger rentora_on_auth_user_created after insert on auth.users for each row execute function public.handle_new_user();
