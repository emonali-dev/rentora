-- Brand rename: Rentora -> বাসা ম্যানেজার (Basha Manager). Only user-visible database messages change.
create or replace function public.add_org_member(p_org uuid, p_email text, p_role text)
returns void language plpgsql security definer set search_path = public as $$
declare v_user uuid;
begin
  perform public.require_writable(p_org, array['owner']);
  if p_role not in ('manager','accountant') then raise exception 'ভূমিকা সঠিক নয়' using errcode = '22023'; end if;
  select id into v_user from auth.users where lower(email) = lower(trim(p_email));
  if v_user is null then raise exception 'এই ইমেইলে কোনো বাসা ম্যানেজার অ্যাকাউন্ট নেই। আগে সাইন আপ করতে বলুন।' using errcode = 'P0002'; end if;
  insert into public.org_members(org_id, user_id, role) values (p_org, v_user, p_role)
  on conflict (org_id, user_id) do update set role = excluded.role where org_members.role <> 'owner';
  insert into public.audit_log(org_id, actor, action, entity, entity_id, details) values (p_org, auth.uid(), 'add_member', 'org_members', v_user, jsonb_build_object('role', p_role));
end $$;
