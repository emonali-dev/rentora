-- Rentora access control: helper functions, triggers and Row Level Security.

-- ============ Helpers ============
create or replace function public.bd_today() returns date language sql stable
as $$ select (now() at time zone 'Asia/Dhaka')::date $$;

create or replace function public.is_platform_admin() returns boolean
language sql stable security definer set search_path = public
as $$ select exists(select 1 from public.platform_admins where user_id = auth.uid()) $$;

create or replace function public.has_org_role(p_org uuid, p_roles text[] default array['owner','manager','accountant'])
returns boolean language sql stable security definer set search_path = public
as $$ select exists(select 1 from public.org_members where org_id = p_org and user_id = auth.uid() and role = any(p_roles)) $$;

-- Is the organization allowed to make changes? (trial not over, or paid period not over, plus grace days)
create or replace function public.org_writable(p_org uuid) returns boolean
language sql stable security definer set search_path = public
as $$
  select exists(
    select 1 from public.organizations o, public.platform_settings s
    where o.id = p_org and (
      (o.status = 'trial'  and o.trial_ends_at      + make_interval(days => s.grace_days) > now()) or
      (o.status = 'active' and o.current_period_end + make_interval(days => s.grace_days) > now())))
$$;

create or replace function public.can_manage(p_org uuid) returns boolean
language sql stable security definer set search_path = public
as $$ select public.has_org_role(p_org, array['owner','manager']) and public.org_writable(p_org) $$;

create or replace function public.my_tenant_ids() returns setof uuid
language sql stable security definer set search_path = public
as $$ select id from public.tenants where user_id = auth.uid() $$;

create or replace function public.require_writable(p_org uuid, p_roles text[]) returns void
language plpgsql stable security definer set search_path = public as $$
begin
  if auth.uid() is null then raise exception 'লগইন করুন' using errcode = '28000'; end if;
  if not public.has_org_role(p_org, p_roles) then raise exception 'এই কাজের অনুমতি নেই' using errcode = '42501'; end if;
  if not public.org_writable(p_org) then raise exception 'সাবস্ক্রিপশনের মেয়াদ শেষ। নবায়ন করুন।' using errcode = 'P0001'; end if;
end $$;

-- ============ Generic triggers ============
create or replace function public.audit_trigger() returns trigger
language plpgsql security definer set search_path = public as $$
declare r record; v jsonb;
begin
  if tg_op = 'DELETE' then r := old; else r := new; end if;
  v := case when tg_op = 'UPDATE' then jsonb_build_object('before', to_jsonb(old), 'after', to_jsonb(new)) else to_jsonb(r) end;
  insert into public.audit_log(org_id, actor, action, entity, entity_id, details)
  values (r.org_id, auth.uid(), lower(tg_op), tg_table_name, r.id, v);
  return null;
end $$;

do $$ declare t text; begin
  foreach t in array array['properties','buildings','units','tenants','leases','utility_bills','invoices','payments','ledger_entries'] loop
    execute format('create trigger audit_%1$s after insert or update or delete on public.%1$I for each row execute function public.audit_trigger()', t);
  end loop;
end $$;

-- Plan limit on units (rooms inside a flat count as units too)
create or replace function public.enforce_unit_limit() returns trigger
language plpgsql security definer set search_path = public as $$
declare v_max int;
begin
  select p.max_units into v_max from public.organizations o join public.plans p on p.code = o.plan_code where o.id = new.org_id;
  if v_max is not null and (select count(*) from public.units where org_id = new.org_id) >= v_max then
    raise exception 'আপনার প্যাকেজে সর্বোচ্চ % টি ইউনিট রাখা যায়। প্যাকেজ আপগ্রেড করুন।', v_max using errcode = 'P0001';
  end if;
  return new;
end $$;
create trigger units_limit before insert on public.units for each row execute function public.enforce_unit_limit();

-- A room's parent must be a flat in the same building
create or replace function public.check_unit_parent() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.parent_unit_id is not null and not exists(
     select 1 from public.units where id = new.parent_unit_id and building_id = new.building_id and parent_unit_id is null) then
    raise exception 'রুমটি অবশ্যই একই বিল্ডিংয়ের কোনো ফ্ল্যাটের ভেতরে হতে হবে' using errcode = '23514';
  end if;
  return new;
end $$;
create trigger units_parent before insert or update of parent_unit_id, building_id on public.units for each row execute function public.check_unit_parent();

-- Unit occupancy follows active leases
create or replace function public.sync_unit_status() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if tg_op in ('UPDATE','DELETE') then
    update public.units set status = 'vacant'
     where id = old.unit_id and status = 'occupied'
       and not exists(select 1 from public.leases where unit_id = old.unit_id and status = 'active');
  end if;
  if tg_op in ('INSERT','UPDATE') and new.status = 'active' then
    update public.units set status = 'occupied' where id = new.unit_id;
  end if;
  return null;
end $$;
create trigger leases_unit_status after insert or update of status, unit_id or delete on public.leases for each row execute function public.sync_unit_status();

-- Utility amount from meter readings when not given explicitly
create or replace function public.utility_amount() returns trigger language plpgsql set search_path = public as $$
begin
  if new.invoice_id is not null and tg_op = 'UPDATE' and old.invoice_id is not distinct from new.invoice_id
     and (new.amount, new.kind, new.period, new.unit_id) is distinct from (old.amount, old.kind, old.period, old.unit_id) then
    raise exception 'ইনভয়েস হয়ে যাওয়া বিল পরিবর্তন করা যাবে না' using errcode = 'P0001';
  end if;
  if (new.amount is null or new.amount = 0) and new.curr_reading is not null and new.prev_reading is not null and new.rate is not null then
    new.amount := round((new.curr_reading - new.prev_reading) * new.rate, 2);
  end if;
  return new;
end $$;
create trigger utility_amount before insert or update on public.utility_bills for each row execute function public.utility_amount();

-- Invoice totals and status always derive from items and payments
create or replace function public.recalc_invoice(p_invoice uuid) returns void
language plpgsql security definer set search_path = public as $$
declare v_sub numeric; v_paid numeric;
begin
  select greatest(coalesce(sum(amount),0),0) into v_sub from public.invoice_items where invoice_id = p_invoice;
  select coalesce(sum(amount),0) into v_paid from public.payments where invoice_id = p_invoice;
  update public.invoices set subtotal = v_sub, paid_amount = v_paid,
    status = case when status = 'void' then 'void'
                  when v_paid >= v_sub and v_sub > 0 then 'paid'
                  when v_paid > 0 then 'partial' else 'unpaid' end
  where id = p_invoice;
end $$;

create or replace function public.invoice_items_changed() returns trigger
language plpgsql security definer set search_path = public as $$
declare v_inv uuid := coalesce(new.invoice_id, old.invoice_id); v_status text;
begin
  select status into v_status from public.invoices where id = v_inv;
  if v_status in ('paid','void') and current_setting('rentora.internal', true) is distinct from 'on' then
    raise exception 'পরিশোধিত বা বাতিল ইনভয়েস পরিবর্তন করা যাবে না' using errcode = 'P0001';
  end if;
  if tg_op = 'DELETE' and old.utility_bill_id is not null then
    update public.utility_bills set invoice_id = null where id = old.utility_bill_id;
  end if;
  perform public.recalc_invoice(v_inv);
  return null;
end $$;
create trigger invoice_items_recalc after insert or update or delete on public.invoice_items for each row execute function public.invoice_items_changed();

-- ============ Row Level Security ============
alter table public.platform_admins enable row level security;
alter table public.plans enable row level security;
alter table public.platform_settings enable row level security;
alter table public.organizations enable row level security;
alter table public.org_members enable row level security;
alter table public.profiles enable row level security;
alter table public.properties enable row level security;
alter table public.buildings enable row level security;
alter table public.units enable row level security;
alter table public.tenants enable row level security;
alter table public.leases enable row level security;
alter table public.utility_bills enable row level security;
alter table public.invoices enable row level security;
alter table public.invoice_items enable row level security;
alter table public.payments enable row level security;
alter table public.ledger_entries enable row level security;
alter table public.notification_outbox enable row level security;
alter table public.subscription_payments enable row level security;
alter table public.audit_log enable row level security;
alter table public.counters enable row level security;

-- Start from nothing, then grant precisely.
revoke all on all tables in schema public from anon, authenticated;
revoke all on all functions in schema public from public, anon, authenticated;
alter default privileges in schema public revoke all on tables from anon, authenticated;
alter default privileges in schema public revoke all on functions from public, anon, authenticated;

grant select on public.plans to anon, authenticated;
grant select on public.platform_settings to authenticated;
grant select on public.platform_admins to authenticated;
grant select on public.organizations to authenticated;
grant update (name, phone, address, invoice_prefix, receipt_prefix, default_due_day, sms_enabled, whatsapp_enabled) on public.organizations to authenticated;
grant select on public.org_members to authenticated;
grant select, insert, update on public.profiles to authenticated;
grant select, insert, update, delete on public.properties, public.buildings, public.units, public.tenants, public.leases, public.utility_bills, public.ledger_entries to authenticated;
grant select on public.invoices, public.payments, public.notification_outbox, public.subscription_payments, public.audit_log to authenticated;
grant select, insert, delete on public.invoice_items to authenticated;
grant update (notes, due_date) on public.invoices to authenticated;
grant update (description, amount) on public.invoice_items to authenticated;

create policy plans_read on public.plans for select using (active);
create policy plans_admin_read on public.plans for select to authenticated using (public.is_platform_admin());
create policy settings_read on public.platform_settings for select to authenticated using (true);
create policy padmin_self on public.platform_admins for select to authenticated using (user_id = auth.uid() or public.is_platform_admin());

create policy org_read on public.organizations for select to authenticated using (public.has_org_role(id) or public.is_platform_admin());
create policy org_update on public.organizations for update to authenticated using (public.has_org_role(id, array['owner'])) with check (public.has_org_role(id, array['owner']));

create policy members_read on public.org_members for select to authenticated using (user_id = auth.uid() or public.has_org_role(org_id, array['owner']) or public.is_platform_admin());

create policy profile_self on public.profiles for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy profile_admin on public.profiles for select to authenticated using (public.is_platform_admin()
  or exists(select 1 from public.org_members a join public.org_members b on a.org_id = b.org_id where a.user_id = auth.uid() and b.user_id = profiles.user_id));

-- Business tables: members read; owner/manager with an active subscription write.
do $$ declare t text; begin
  foreach t in array array['properties','buildings','units','tenants','leases','utility_bills'] loop
    execute format('create policy %1$s_read on public.%1$I for select to authenticated using (public.has_org_role(org_id) or public.is_platform_admin())', t);
    execute format('create policy %1$s_ins on public.%1$I for insert to authenticated with check (public.can_manage(org_id))', t);
    execute format('create policy %1$s_upd on public.%1$I for update to authenticated using (public.can_manage(org_id)) with check (public.can_manage(org_id))', t);
    execute format('create policy %1$s_del on public.%1$I for delete to authenticated using (public.has_org_role(org_id, array[''owner'']) and public.org_writable(org_id))', t);
  end loop;
end $$;

-- Ledger: accountants may also record income/expense; automatic rent rows cannot be edited by hand.
create policy ledger_read on public.ledger_entries for select to authenticated using (public.has_org_role(org_id) or public.is_platform_admin());
create policy ledger_ins on public.ledger_entries for insert to authenticated with check (public.has_org_role(org_id) and public.org_writable(org_id) and payment_id is null);
create policy ledger_upd on public.ledger_entries for update to authenticated using (public.has_org_role(org_id) and public.org_writable(org_id) and payment_id is null) with check (payment_id is null);
create policy ledger_del on public.ledger_entries for delete to authenticated using (public.has_org_role(org_id, array['owner','manager']) and public.org_writable(org_id) and payment_id is null);

-- Tenants see their own records in the tenant portal.
create policy tenants_self on public.tenants for select to authenticated using (user_id = auth.uid());
create policy leases_self on public.leases for select to authenticated using (tenant_id in (select public.my_tenant_ids()));
create policy units_self on public.units for select to authenticated using (id in (select unit_id from public.leases where tenant_id in (select public.my_tenant_ids())));
create policy buildings_self on public.buildings for select to authenticated using (id in (select u.building_id from public.units u join public.leases l on l.unit_id = u.id where l.tenant_id in (select public.my_tenant_ids())));
create policy properties_self on public.properties for select to authenticated using (id in (select b.property_id from public.buildings b join public.units u on u.building_id = b.id join public.leases l on l.unit_id = u.id where l.tenant_id in (select public.my_tenant_ids())));
create policy orgs_self on public.organizations for select to authenticated using (id in (select org_id from public.tenants where user_id = auth.uid()));

-- Invoices: created only by functions; members and the invoiced tenant can read.
create policy invoices_read on public.invoices for select to authenticated using (public.has_org_role(org_id) or public.is_platform_admin() or tenant_id in (select public.my_tenant_ids()));
create policy invoices_upd on public.invoices for update to authenticated using (public.can_manage(org_id) and status in ('unpaid','partial')) with check (public.can_manage(org_id));
create policy items_read on public.invoice_items for select to authenticated using (public.has_org_role(org_id) or public.is_platform_admin()
  or invoice_id in (select id from public.invoices where tenant_id in (select public.my_tenant_ids())));
create policy items_ins on public.invoice_items for insert to authenticated with check (public.can_manage(org_id) and utility_bill_id is null and kind <> 'rent');
create policy items_upd on public.invoice_items for update to authenticated using (public.can_manage(org_id) and utility_bill_id is null) with check (public.can_manage(org_id));
create policy items_del on public.invoice_items for delete to authenticated using (public.can_manage(org_id) and utility_bill_id is null and kind <> 'rent');
create policy payments_read on public.payments for select to authenticated using (public.has_org_role(org_id) or public.is_platform_admin() or tenant_id in (select public.my_tenant_ids()));

create policy outbox_read on public.notification_outbox for select to authenticated using (public.has_org_role(org_id, array['owner','manager']) or public.is_platform_admin());
create policy subpay_read on public.subscription_payments for select to authenticated using (public.has_org_role(org_id, array['owner']) or public.is_platform_admin());
create policy audit_read on public.audit_log for select to authenticated using (public.has_org_role(org_id, array['owner']) or public.is_platform_admin());
-- counters: no policies (functions only)
