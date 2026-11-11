-- Rentora business functions (all checks done server-side).

create or replace function public.next_number(p_org uuid, p_kind text) returns text
language plpgsql security definer set search_path = public as $$
declare v_year int := extract(year from public.bd_today()); v_n int; v_prefix text;
begin
  insert into public.counters(org_id, kind, year, next_value) values (p_org, p_kind, v_year, 2)
  on conflict (org_id, kind, year) do update set next_value = counters.next_value + 1
  returning next_value - 1 into v_n;
  select case when p_kind = 'invoice' then invoice_prefix else receipt_prefix end into v_prefix from public.organizations where id = p_org;
  return v_prefix || '-' || v_year || '-' || lpad(v_n::text, 5, '0');
end $$;

-- Sign-up: a landlord creates their business account and starts a free trial.
create or replace function public.create_organization(p_name text, p_phone text default null, p_address text default null)
returns uuid language plpgsql security definer set search_path = public as $$
declare v_id uuid; v_days int;
begin
  if auth.uid() is null then raise exception 'লগইন করুন' using errcode = '28000'; end if;
  if (select count(*) from public.org_members where user_id = auth.uid() and role = 'owner') >= 3 then
    raise exception 'একজন ব্যবহারকারী সর্বোচ্চ ৩টি অ্যাকাউন্ট খুলতে পারেন' using errcode = 'P0001';
  end if;
  select trial_days into v_days from public.platform_settings;
  insert into public.organizations(name, phone, address, status, trial_ends_at, created_by)
  values (trim(p_name), nullif(trim(p_phone),''), nullif(trim(p_address),''), 'trial', now() + make_interval(days => v_days), auth.uid())
  returning id into v_id;
  insert into public.org_members(org_id, user_id, role) values (v_id, auth.uid(), 'owner');
  insert into public.audit_log(org_id, actor, action, entity, entity_id) values (v_id, auth.uid(), 'create', 'organizations', v_id);
  return v_id;
end $$;

-- Owner adds a team member who already has a Rentora login.
create or replace function public.add_org_member(p_org uuid, p_email text, p_role text)
returns void language plpgsql security definer set search_path = public as $$
declare v_user uuid;
begin
  perform public.require_writable(p_org, array['owner']);
  if p_role not in ('manager','accountant') then raise exception 'ভূমিকা সঠিক নয়' using errcode = '22023'; end if;
  select id into v_user from auth.users where lower(email) = lower(trim(p_email));
  if v_user is null then raise exception 'এই ইমেইলে কোনো Rentora অ্যাকাউন্ট নেই। আগে সাইন আপ করতে বলুন।' using errcode = 'P0002'; end if;
  insert into public.org_members(org_id, user_id, role) values (p_org, v_user, p_role)
  on conflict (org_id, user_id) do update set role = excluded.role where org_members.role <> 'owner';
  insert into public.audit_log(org_id, actor, action, entity, entity_id, details) values (p_org, auth.uid(), 'add_member', 'org_members', v_user, jsonb_build_object('role', p_role));
end $$;

create or replace function public.remove_org_member(p_org uuid, p_user uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  perform public.require_writable(p_org, array['owner']);
  delete from public.org_members where org_id = p_org and user_id = p_user and role <> 'owner';
  insert into public.audit_log(org_id, actor, action, entity, entity_id) values (p_org, auth.uid(), 'remove_member', 'org_members', p_user);
end $$;

create or replace function public.queue_notification(p_org uuid, p_phone text, p_template text, p_body text, p_invoice uuid)
returns void language plpgsql security definer set search_path = public as $$
declare o record;
begin
  select sms_enabled, whatsapp_enabled into o from public.organizations where id = p_org;
  if p_phone is null then return; end if;
  if o.sms_enabled then insert into public.notification_outbox(org_id, channel, to_phone, template, body, related_invoice_id) values (p_org, 'sms', p_phone, p_template, p_body, p_invoice); end if;
  if o.whatsapp_enabled then insert into public.notification_outbox(org_id, channel, to_phone, template, body, related_invoice_id) values (p_org, 'whatsapp', p_phone, p_template, p_body, p_invoice); end if;
end $$;

-- Create the month's rent invoices for every active lease, adding that month's utility bills.
-- Safe to run twice: a lease never gets two invoices for the same month.
create or replace function public.generate_monthly_invoices(p_org uuid, p_period date)
returns int language plpgsql security definer set search_path = public as $$
declare
  v_period date := date_trunc('month', p_period)::date;
  v_end date := (date_trunc('month', p_period) + interval '1 month - 1 day')::date;
  l record; u record; v_inv uuid; v_no text; v_count int := 0; v_total numeric; v_org_name text;
begin
  perform public.require_writable(p_org, array['owner','manager']);
  if v_period > date_trunc('month', public.bd_today() + 40)::date then raise exception 'এত পরের মাসের ইনভয়েস এখন তৈরি করা যাবে না' using errcode = '22023'; end if;
  select name into v_org_name from public.organizations where id = p_org;
  for l in
    select le.*, t.phone, t.full_name, un.name as unit_name from public.leases le
    join public.tenants t on t.id = le.tenant_id join public.units un on un.id = le.unit_id
    where le.org_id = p_org and le.status = 'active' and le.start_date <= v_end and (le.end_date is null or le.end_date >= v_period)
      and not exists(select 1 from public.invoices i where i.lease_id = le.id and i.period = v_period and i.status <> 'void')
    order by un.name
  loop
    v_no := public.next_number(p_org, 'invoice');
    insert into public.invoices(org_id, invoice_no, lease_id, tenant_id, unit_id, period, issue_date, due_date)
    values (p_org, v_no, l.id, l.tenant_id, l.unit_id, v_period, public.bd_today(), v_period + (l.due_day - 1))
    returning id into v_inv;
    insert into public.invoice_items(org_id, invoice_id, kind, description, amount)
    values (p_org, v_inv, 'rent', 'বাসা ভাড়া — ' || to_char(v_period, 'MM/YYYY'), l.monthly_rent);
    for u in select * from public.utility_bills where unit_id = l.unit_id and period = v_period and invoice_id is null loop
      insert into public.invoice_items(org_id, invoice_id, kind, description, amount, utility_bill_id)
      values (p_org, v_inv, u.kind, case u.kind when 'electricity' then 'বিদ্যুৎ বিল' when 'gas' then 'গ্যাস বিল' when 'water' then 'পানির বিল'
        when 'service' then 'সার্ভিস চার্জ' when 'internet' then 'ইন্টারনেট' when 'garbage' then 'ময়লা বিল' else 'অন্যান্য বিল' end
        || coalesce(' (' || u.prev_reading || '→' || u.curr_reading || ')', ''), u.amount, u.id);
      update public.utility_bills set invoice_id = v_inv where id = u.id;
    end loop;
    select subtotal into v_total from public.invoices where id = v_inv;
    perform public.queue_notification(p_org, l.phone, 'invoice_issued',
      format('প্রিয় %s, %s মাসের ভাড়া ও বিল মোট ৳%s। শেষ তারিখ %s। ইনভয়েস %s — %s', l.full_name, to_char(v_period,'MM/YYYY'), v_total, to_char(v_period + (l.due_day - 1),'DD/MM/YYYY'), v_no, v_org_name), v_inv);
    v_count := v_count + 1;
  end loop;
  return v_count;
end $$;

-- Record a rent payment: receipt number, invoice status, income entry and a receipt message.
create or replace function public.record_payment(p_invoice uuid, p_amount numeric, p_method text, p_reference text default null, p_paid_on date default null)
returns jsonb language plpgsql security definer set search_path = public as $$
declare i record; v_receipt text; v_pid uuid; v_prop uuid; t record;
begin
  select * into i from public.invoices where id = p_invoice for update;
  if not found then raise exception 'ইনভয়েস পাওয়া যায়নি' using errcode = 'P0002'; end if;
  perform public.require_writable(i.org_id, array['owner','manager','accountant']);
  if i.status = 'void' then raise exception 'বাতিল ইনভয়েসে টাকা নেওয়া যাবে না' using errcode = 'P0001'; end if;
  if p_amount is null or p_amount <= 0 then raise exception 'টাকার পরিমাণ সঠিক নয়' using errcode = '22023'; end if;
  if p_amount > i.subtotal - i.paid_amount then raise exception 'বকেয়ার (৳%) চেয়ে বেশি টাকা নেওয়া যাবে না', i.subtotal - i.paid_amount using errcode = '22023'; end if;
  if coalesce(p_paid_on, public.bd_today()) > public.bd_today() then raise exception 'ভবিষ্যতের তারিখ দেওয়া যাবে না' using errcode = '22023'; end if;
  v_receipt := public.next_number(i.org_id, 'receipt');
  insert into public.payments(org_id, invoice_id, tenant_id, amount, method, reference, paid_on, receipt_no, received_by)
  values (i.org_id, i.id, i.tenant_id, round(p_amount, 2), p_method, nullif(trim(p_reference),''), coalesce(p_paid_on, public.bd_today()), v_receipt, auth.uid())
  returning id into v_pid;
  perform public.recalc_invoice(i.id);
  select b.property_id into v_prop from public.units u join public.buildings b on b.id = u.building_id where u.id = i.unit_id;
  insert into public.ledger_entries(org_id, entry_type, category, amount, entry_date, property_id, payment_id, description, created_by)
  values (i.org_id, 'income', 'ভাড়া আদায়', round(p_amount, 2), coalesce(p_paid_on, public.bd_today()), v_prop, v_pid, i.invoice_no || ' / ' || v_receipt, auth.uid());
  select full_name, phone into t from public.tenants where id = i.tenant_id;
  perform public.queue_notification(i.org_id, t.phone, 'payment_received',
    format('প্রিয় %s, ৳%s পেয়েছি। রসিদ নং %s। ধন্যবাদ।', t.full_name, round(p_amount,2), v_receipt), i.id);
  return jsonb_build_object('payment_id', v_pid, 'receipt_no', v_receipt,
    'status', (select status from public.invoices where id = i.id), 'due', (select subtotal - paid_amount from public.invoices where id = i.id));
end $$;

create or replace function public.void_invoice(p_invoice uuid, p_reason text)
returns void language plpgsql security definer set search_path = public as $$
declare i record;
begin
  select * into i from public.invoices where id = p_invoice for update;
  if not found then raise exception 'ইনভয়েস পাওয়া যায়নি' using errcode = 'P0002'; end if;
  perform public.require_writable(i.org_id, array['owner']);
  if exists(select 1 from public.payments where invoice_id = p_invoice) then raise exception 'টাকা জমা হওয়া ইনভয়েস বাতিল করা যাবে না' using errcode = 'P0001'; end if;
  update public.utility_bills set invoice_id = null where invoice_id = p_invoice;
  perform set_config('rentora.internal', 'on', true);
  update public.invoice_items set utility_bill_id = null where invoice_id = p_invoice;
  update public.invoices set status = 'void', notes = left(coalesce(nullif(trim(p_reason),''), 'বাতিল'), 500) where id = p_invoice;
  perform set_config('rentora.internal', 'off', true);
end $$;

-- Queue a reminder for every overdue invoice of the organization.
create or replace function public.queue_due_reminders(p_org uuid) returns int
language plpgsql security definer set search_path = public as $$
declare r record; n int := 0;
begin
  perform public.require_writable(p_org, array['owner','manager']);
  for r in select i.id, i.invoice_no, i.subtotal - i.paid_amount as due, t.full_name, t.phone from public.invoices i join public.tenants t on t.id = i.tenant_id
           where i.org_id = p_org and i.status in ('unpaid','partial') and i.due_date < public.bd_today() loop
    perform public.queue_notification(p_org, r.phone, 'due_reminder', format('প্রিয় %s, ইনভয়েস %s এর ৳%s বকেয়া আছে। অনুগ্রহ করে দ্রুত পরিশোধ করুন।', r.full_name, r.invoice_no, r.due), r.id);
    n := n + 1;
  end loop;
  return n;
end $$;

-- Dashboard numbers in one call.
create or replace function public.dashboard_summary(p_org uuid, p_month date default null) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare m date := date_trunc('month', coalesce(p_month, public.bd_today()))::date; me date; r jsonb;
begin
  if not (public.has_org_role(p_org) or public.is_platform_admin()) then raise exception 'এই কাজের অনুমতি নেই' using errcode = '42501'; end if;
  me := (m + interval '1 month - 1 day')::date;
  select jsonb_build_object(
    'properties', (select count(*) from public.properties where org_id = p_org),
    'units', (select count(*) from public.units where org_id = p_org),
    'occupied', (select count(*) from public.units where org_id = p_org and status = 'occupied'),
    'vacant', (select count(*) from public.units where org_id = p_org and status = 'vacant'),
    'tenants', (select count(*) from public.tenants where org_id = p_org and active),
    'invoiced', (select coalesce(sum(subtotal),0) from public.invoices where org_id = p_org and period = m and status <> 'void'),
    'collected', (select coalesce(sum(amount),0) from public.payments where org_id = p_org and paid_on between m and me),
    'month_due', (select coalesce(sum(subtotal - paid_amount),0) from public.invoices where org_id = p_org and period = m and status in ('unpaid','partial')),
    'total_due', (select coalesce(sum(subtotal - paid_amount),0) from public.invoices where org_id = p_org and status in ('unpaid','partial')),
    'overdue_count', (select count(*) from public.invoices where org_id = p_org and status in ('unpaid','partial') and due_date < public.bd_today()),
    'income', (select coalesce(sum(amount),0) from public.ledger_entries where org_id = p_org and entry_type = 'income' and entry_date between m and me),
    'expense', (select coalesce(sum(amount),0) from public.ledger_entries where org_id = p_org and entry_type = 'expense' and entry_date between m and me),
    'trend', (select coalesce(jsonb_agg(x order by x->>'month'),'[]') from (
        select jsonb_build_object('month', to_char(g,'YYYY-MM'),
          'income', (select coalesce(sum(amount),0) from public.ledger_entries where org_id = p_org and entry_type='income' and date_trunc('month',entry_date) = g),
          'expense', (select coalesce(sum(amount),0) from public.ledger_entries where org_id = p_org and entry_type='expense' and date_trunc('month',entry_date) = g)) x
        from generate_series(m - interval '5 months', m, interval '1 month') g) s)
  ) into r;
  return r;
end $$;

-- A tenant who signs up with the email the landlord saved gets linked to their tenant records.
create or replace function public.link_my_tenant_records() returns int
language plpgsql security definer set search_path = public as $$
declare v_email text; n int;
begin
  if auth.uid() is null then raise exception 'লগইন করুন' using errcode = '28000'; end if;
  select email into v_email from auth.users where id = auth.uid() and email_confirmed_at is not null;
  if v_email is null then return 0; end if;
  update public.tenants set user_id = auth.uid() where user_id is null and lower(email) = lower(v_email);
  get diagnostics n = row_count;
  return n;
end $$;

-- Subscription payment (bKash/Nagad/...) submitted by the owner; amount comes from the plan, never the browser.
create or replace function public.submit_subscription_payment(p_org uuid, p_plan text, p_cycle text, p_method text, p_trx text)
returns uuid language plpgsql security definer set search_path = public as $$
declare v_amount numeric; v_id uuid;
begin
  if auth.uid() is null or not public.has_org_role(p_org, array['owner']) then raise exception 'এই কাজের অনুমতি নেই' using errcode = '42501'; end if;
  select case when p_cycle = 'yearly' then yearly_price when p_cycle = 'monthly' then monthly_price end into v_amount from public.plans where code = p_plan and active;
  if v_amount is null then raise exception 'প্যাকেজ বা মেয়াদ সঠিক নয়' using errcode = '22023'; end if;
  if (select count(*) from public.subscription_payments where org_id = p_org and status = 'pending') >= 3 then raise exception 'আগের পেমেন্ট যাচাই হওয়া পর্যন্ত অপেক্ষা করুন' using errcode = 'P0001'; end if;
  insert into public.subscription_payments(org_id, plan_code, billing_cycle, amount, method, trx_id, submitted_by)
  values (p_org, p_plan, p_cycle, v_amount, p_method, upper(trim(p_trx)), auth.uid()) returning id into v_id;
  return v_id;
end $$;

-- ============ Super Admin ============
create or replace function public.admin_review_subscription(p_id uuid, p_approve boolean, p_note text default null)
returns void language plpgsql security definer set search_path = public as $$
declare s record; v_from timestamptz;
begin
  if not public.is_platform_admin() then raise exception 'এই কাজের অনুমতি নেই' using errcode = '42501'; end if;
  select * into s from public.subscription_payments where id = p_id for update;
  if not found or s.status <> 'pending' then raise exception 'পেমেন্টটি অপেক্ষমাণ নয়' using errcode = 'P0001'; end if;
  update public.subscription_payments set status = case when p_approve then 'approved' else 'rejected' end,
    reviewed_by = auth.uid(), reviewed_at = now(), review_note = p_note where id = p_id;
  if p_approve then
    select greatest(now(), coalesce(case when status = 'active' then current_period_end end, now())) into v_from from public.organizations where id = s.org_id;
    update public.organizations set plan_code = s.plan_code, billing_cycle = s.billing_cycle, status = 'active',
      current_period_end = v_from + case when s.billing_cycle = 'yearly' then interval '1 year' else interval '1 month' end
    where id = s.org_id;
  end if;
  insert into public.audit_log(org_id, actor, action, entity, entity_id, details)
  values (s.org_id, auth.uid(), case when p_approve then 'approve' else 'reject' end, 'subscription_payments', p_id, jsonb_build_object('note', p_note));
end $$;

create or replace function public.admin_update_org(p_org uuid, p_status text, p_plan text, p_cycle text, p_period_end timestamptz, p_trial_end timestamptz)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.is_platform_admin() then raise exception 'এই কাজের অনুমতি নেই' using errcode = '42501'; end if;
  update public.organizations set status = p_status, plan_code = p_plan, billing_cycle = p_cycle,
    current_period_end = p_period_end, trial_ends_at = p_trial_end where id = p_org;
  if not found then raise exception 'অ্যাকাউন্ট পাওয়া যায়নি' using errcode = 'P0002'; end if;
  insert into public.audit_log(org_id, actor, action, entity, entity_id, details)
  values (p_org, auth.uid(), 'admin_update', 'organizations', p_org, jsonb_build_object('status',p_status,'plan',p_plan,'cycle',p_cycle,'period_end',p_period_end,'trial_end',p_trial_end));
end $$;

create or replace function public.admin_customers() returns table(
  id uuid, name text, phone text, owner_email text, plan_code text, billing_cycle text, status text,
  trial_ends_at timestamptz, current_period_end timestamptz, units bigint, tenants bigint, created_at timestamptz, writable boolean)
language plpgsql stable security definer set search_path = public as $$
begin
  if not public.is_platform_admin() then raise exception 'এই কাজের অনুমতি নেই' using errcode = '42501'; end if;
  return query select o.id, o.name, o.phone,
    (select u.email::text from public.org_members m join auth.users u on u.id = m.user_id where m.org_id = o.id and m.role = 'owner' limit 1),
    o.plan_code, o.billing_cycle, o.status, o.trial_ends_at, o.current_period_end,
    (select count(*) from public.units where org_id = o.id), (select count(*) from public.tenants where org_id = o.id),
    o.created_at, public.org_writable(o.id)
  from public.organizations o order by o.created_at desc;
end $$;

create or replace function public.admin_overview() returns jsonb
language plpgsql stable security definer set search_path = public as $$
begin
  if not public.is_platform_admin() then raise exception 'এই কাজের অনুমতি নেই' using errcode = '42501'; end if;
  return jsonb_build_object(
    'customers', (select count(*) from public.organizations),
    'active', (select count(*) from public.organizations where status = 'active' and current_period_end > now()),
    'trial', (select count(*) from public.organizations where status = 'trial' and trial_ends_at > now()),
    'expired', (select count(*) from public.organizations o where not public.org_writable(o.id)),
    'pending_payments', (select count(*) from public.subscription_payments where status = 'pending'),
    'revenue_month', (select coalesce(sum(amount),0) from public.subscription_payments where status = 'approved' and reviewed_at >= date_trunc('month', now())),
    'revenue_total', (select coalesce(sum(amount),0) from public.subscription_payments where status = 'approved'),
    'units', (select count(*) from public.units),
    'queued_messages', (select count(*) from public.notification_outbox where status = 'queued'));
end $$;

create or replace function public.admin_save_plan(p_code text, p_name text, p_name_bn text, p_monthly numeric, p_yearly numeric, p_max_units int, p_features jsonb, p_active boolean)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.is_platform_admin() then raise exception 'এই কাজের অনুমতি নেই' using errcode = '42501'; end if;
  insert into public.plans(code, name, name_bn, monthly_price, yearly_price, max_units, features, active)
  values (p_code, p_name, p_name_bn, p_monthly, p_yearly, p_max_units, coalesce(p_features,'[]'), p_active)
  on conflict (code) do update set name = excluded.name, name_bn = excluded.name_bn, monthly_price = excluded.monthly_price,
    yearly_price = excluded.yearly_price, max_units = excluded.max_units, features = excluded.features, active = excluded.active;
end $$;

create or replace function public.admin_save_settings(p_trial_days int, p_grace_days int, p_bkash text, p_nagad text, p_rocket text, p_bank text, p_support text)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.is_platform_admin() then raise exception 'এই কাজের অনুমতি নেই' using errcode = '42501'; end if;
  update public.platform_settings set trial_days = p_trial_days, grace_days = p_grace_days, bkash_number = nullif(trim(p_bkash),''),
    nagad_number = nullif(trim(p_nagad),''), rocket_number = nullif(trim(p_rocket),''), bank_details = nullif(trim(p_bank),''),
    support_phone = nullif(trim(p_support),''), updated_at = now();
end $$;

-- Owner's full data export (JSON) for their own backup.
create or replace function public.export_org_data(p_org uuid) returns jsonb
language plpgsql stable security definer set search_path = public as $$
begin
  if not public.has_org_role(p_org, array['owner']) then raise exception 'এই কাজের অনুমতি নেই' using errcode = '42501'; end if;
  return jsonb_build_object('exported_at', now(), 'organization', (select to_jsonb(o) from public.organizations o where id = p_org),
    'properties', (select coalesce(jsonb_agg(to_jsonb(x)),'[]') from public.properties x where org_id = p_org),
    'buildings', (select coalesce(jsonb_agg(to_jsonb(x)),'[]') from public.buildings x where org_id = p_org),
    'units', (select coalesce(jsonb_agg(to_jsonb(x)),'[]') from public.units x where org_id = p_org),
    'tenants', (select coalesce(jsonb_agg(to_jsonb(x)),'[]') from public.tenants x where org_id = p_org),
    'leases', (select coalesce(jsonb_agg(to_jsonb(x)),'[]') from public.leases x where org_id = p_org),
    'utility_bills', (select coalesce(jsonb_agg(to_jsonb(x)),'[]') from public.utility_bills x where org_id = p_org),
    'invoices', (select coalesce(jsonb_agg(to_jsonb(x)),'[]') from public.invoices x where org_id = p_org),
    'invoice_items', (select coalesce(jsonb_agg(to_jsonb(x)),'[]') from public.invoice_items x where org_id = p_org),
    'payments', (select coalesce(jsonb_agg(to_jsonb(x)),'[]') from public.payments x where org_id = p_org),
    'ledger_entries', (select coalesce(jsonb_agg(to_jsonb(x)),'[]') from public.ledger_entries x where org_id = p_org));
end $$;

-- Only signed-in users may call these; each function checks the caller's role itself.
grant execute on function public.bd_today(), public.is_platform_admin(), public.has_org_role(uuid, text[]), public.org_writable(uuid),
  public.can_manage(uuid), public.my_tenant_ids(),
  public.create_organization(text, text, text), public.add_org_member(uuid, text, text), public.remove_org_member(uuid, uuid),
  public.generate_monthly_invoices(uuid, date), public.record_payment(uuid, numeric, text, text, date), public.void_invoice(uuid, text),
  public.queue_due_reminders(uuid), public.dashboard_summary(uuid, date), public.link_my_tenant_records(),
  public.submit_subscription_payment(uuid, text, text, text, text), public.admin_review_subscription(uuid, boolean, text),
  public.admin_update_org(uuid, text, text, text, timestamptz, timestamptz), public.admin_customers(), public.admin_overview(),
  public.admin_save_plan(text, text, text, numeric, numeric, int, jsonb, boolean),
  public.admin_save_settings(int, int, text, text, text, text, text), public.export_org_data(uuid)
to authenticated;
