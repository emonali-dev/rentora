-- Rentora: complete database (all migrations in order). Run once in a NEW, empty Supabase project's SQL Editor.
-- Generated from supabase/migrations/*.sql — edit the migrations, not this file.

-- ===================== 202611110001_rentora_core.sql =====================
-- Rentora core schema. Powered by SIDDIQIYA Technology.
-- Multi-tenant rental management: every business row belongs to an organization (a landlord's account).
-- Access is enforced by Row Level Security; money-moving actions go through security-definer functions.

-- ============ Reference / platform ============
create table public.platform_admins(
  user_id uuid primary key references auth.users(id) on delete cascade,
  created_at timestamptz not null default now()
);

create table public.plans(
  code text primary key check (code ~ '^[a-z0-9_]{2,30}$'),
  name text not null,
  name_bn text not null,
  monthly_price numeric(12,2) not null check (monthly_price >= 0),
  yearly_price numeric(12,2) not null check (yearly_price >= 0),
  max_units int check (max_units is null or max_units > 0),
  features jsonb not null default '[]',
  active boolean not null default true,
  sort int not null default 0
);
insert into public.plans(code,name,name_bn,monthly_price,yearly_price,max_units,features,sort) values
 ('basic','Basic','বেসিক',299,2990,15,'["১৫টি ইউনিট পর্যন্ত","ভাড়া ও বকেয়া হিসাব","ইনভয়েস ও রসিদ","ইউটিলিটি বিল"]',1),
 ('standard','Standard','স্ট্যান্ডার্ড',599,5990,60,'["৬০টি ইউনিট পর্যন্ত","বেসিকের সবকিছু","ভাড়াটিয়া পোর্টাল","আয়-ব্যয় রিপোর্ট","টিম মেম্বার"]',2),
 ('premium','Premium','প্রিমিয়াম',1199,11990,null,'["আনলিমিটেড ইউনিট","স্ট্যান্ডার্ডের সবকিছু","SMS/WhatsApp রিমাইন্ডার","অগ্রাধিকার সাপোর্ট"]',3);

create table public.platform_settings(
  id boolean primary key default true check (id),
  trial_days int not null default 14 check (trial_days between 0 and 90),
  grace_days int not null default 3 check (grace_days between 0 and 30),
  bkash_number text, nagad_number text, rocket_number text, bank_details text,
  support_phone text default '01778662833',
  updated_at timestamptz not null default now()
);
insert into public.platform_settings default values;

-- ============ Organizations ============
create table public.organizations(
  id uuid primary key default gen_random_uuid(),
  name text not null check (length(trim(name)) between 2 and 120),
  phone text check (phone is null or phone ~ '^\+?[0-9 \-]{6,20}$'),
  address text check (length(address) <= 300),
  plan_code text not null default 'basic' references public.plans(code),
  billing_cycle text not null default 'monthly' check (billing_cycle in ('monthly','yearly')),
  status text not null default 'trial' check (status in ('trial','active','suspended','cancelled')),
  trial_ends_at timestamptz,
  current_period_end timestamptz,
  invoice_prefix text not null default 'INV' check (invoice_prefix ~ '^[A-Z0-9]{2,8}$'),
  receipt_prefix text not null default 'RCP' check (receipt_prefix ~ '^[A-Z0-9]{2,8}$'),
  default_due_day int not null default 10 check (default_due_day between 1 and 28),
  sms_enabled boolean not null default false,
  whatsapp_enabled boolean not null default false,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);

create table public.org_members(
  org_id uuid not null references public.organizations(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null check (role in ('owner','manager','accountant')),
  created_at timestamptz not null default now(),
  primary key (org_id, user_id)
);
create index on public.org_members(user_id);

create table public.profiles(
  user_id uuid primary key references auth.users(id) on delete cascade,
  full_name text check (length(full_name) <= 120),
  phone text check (phone is null or phone ~ '^\+?[0-9 \-]{6,20}$'),
  created_at timestamptz not null default now()
);

-- ============ Property hierarchy: property > building > unit (flat/shop) > room ============
create table public.properties(
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  name text not null check (length(trim(name)) between 1 and 120),
  address text check (length(address) <= 300),
  kind text not null default 'residential' check (kind in ('residential','commercial','mixed')),
  notes text check (length(notes) <= 1000),
  created_at timestamptz not null default now(),
  unique (id, org_id)
);
create index on public.properties(org_id);

create table public.buildings(
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null,
  property_id uuid not null,
  name text not null check (length(trim(name)) between 1 and 120),
  floors int check (floors is null or floors between 1 and 200),
  notes text check (length(notes) <= 1000),
  created_at timestamptz not null default now(),
  foreign key (property_id, org_id) references public.properties(id, org_id) on delete cascade,
  unique (id, org_id)
);
create index on public.buildings(org_id); create index on public.buildings(property_id);

create table public.units(
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null,
  building_id uuid not null,
  parent_unit_id uuid,
  kind text not null default 'flat' check (kind in ('flat','room','shop','office','garage','other')),
  name text not null check (length(trim(name)) between 1 and 60),
  floor text check (length(floor) <= 20),
  bedrooms int check (bedrooms is null or bedrooms between 0 and 50),
  size_sqft numeric(10,2) check (size_sqft is null or size_sqft > 0),
  rent_amount numeric(12,2) not null default 0 check (rent_amount >= 0),
  status text not null default 'vacant' check (status in ('vacant','occupied','maintenance')),
  notes text check (length(notes) <= 1000),
  created_at timestamptz not null default now(),
  foreign key (building_id, org_id) references public.buildings(id, org_id) on delete cascade,
  unique (id, org_id),
  foreign key (parent_unit_id, org_id) references public.units(id, org_id) on delete cascade,
  check (parent_unit_id is null or parent_unit_id <> id),
  unique (building_id, parent_unit_id, name)
);
create index on public.units(org_id); create index on public.units(building_id); create index on public.units(parent_unit_id);

-- ============ Tenants and leases ============
create table public.tenants(
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  full_name text not null check (length(trim(full_name)) between 2 and 120),
  phone text not null check (phone ~ '^\+?[0-9 \-]{6,20}$'),
  email text check (email is null or email ~* '^[^@\s]+@[^@\s]+\.[^@\s]+$'),
  nid_number text check (nid_number is null or nid_number ~ '^[0-9]{10,17}$'),
  address text check (length(address) <= 300),
  occupation text check (length(occupation) <= 120),
  family_members int check (family_members is null or family_members between 1 and 50),
  emergency_name text check (length(emergency_name) <= 120),
  emergency_phone text check (emergency_phone is null or emergency_phone ~ '^\+?[0-9 \-]{6,20}$'),
  user_id uuid references auth.users(id) on delete set null,
  notes text check (length(notes) <= 1000),
  active boolean not null default true,
  created_at timestamptz not null default now(),
  unique (id, org_id)
);
create index on public.tenants(org_id); create index on public.tenants(user_id); create index on public.tenants(lower(email));

create table public.leases(
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null,
  tenant_id uuid not null,
  unit_id uuid not null,
  start_date date not null,
  end_date date,
  monthly_rent numeric(12,2) not null check (monthly_rent >= 0),
  security_deposit numeric(12,2) not null default 0 check (security_deposit >= 0),
  due_day int not null default 10 check (due_day between 1 and 28),
  status text not null default 'active' check (status in ('active','ended')),
  notes text check (length(notes) <= 1000),
  created_at timestamptz not null default now(),
  foreign key (tenant_id, org_id) references public.tenants(id, org_id) on delete restrict,
  foreign key (unit_id, org_id) references public.units(id, org_id) on delete restrict,
  unique (id, org_id),
  check (end_date is null or end_date >= start_date)
);
create unique index leases_one_active_per_unit on public.leases(unit_id) where status = 'active';
create index on public.leases(org_id); create index on public.leases(tenant_id);

-- ============ Billing ============
create table public.utility_bills(
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null,
  unit_id uuid not null,
  kind text not null check (kind in ('electricity','gas','water','service','internet','garbage','other')),
  period date not null check (extract(day from period) = 1),
  prev_reading numeric(14,2) check (prev_reading is null or prev_reading >= 0),
  curr_reading numeric(14,2) check (curr_reading is null or curr_reading >= 0),
  rate numeric(12,4) check (rate is null or rate >= 0),
  amount numeric(12,2) not null check (amount >= 0),
  invoice_id uuid,
  notes text check (length(notes) <= 300),
  created_at timestamptz not null default now(),
  foreign key (unit_id, org_id) references public.units(id, org_id) on delete cascade,
  check (curr_reading is null or prev_reading is null or curr_reading >= prev_reading),
  unique (unit_id, kind, period)
);
create index on public.utility_bills(org_id, period);

create table public.invoices(
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  invoice_no text not null,
  lease_id uuid not null,
  tenant_id uuid not null,
  unit_id uuid not null,
  period date not null check (extract(day from period) = 1),
  issue_date date not null,
  due_date date not null,
  subtotal numeric(12,2) not null default 0 check (subtotal >= 0),
  paid_amount numeric(12,2) not null default 0 check (paid_amount >= 0),
  status text not null default 'unpaid' check (status in ('unpaid','partial','paid','void')),
  notes text check (length(notes) <= 500),
  created_at timestamptz not null default now(),
  foreign key (lease_id, org_id) references public.leases(id, org_id) on delete restrict,
  foreign key (tenant_id, org_id) references public.tenants(id, org_id) on delete restrict,
  foreign key (unit_id, org_id) references public.units(id, org_id) on delete restrict,
  unique (org_id, invoice_no),
  unique (id, org_id)
);
create unique index invoices_one_per_lease_period on public.invoices(lease_id, period) where status <> 'void';
create index on public.invoices(org_id, period); create index on public.invoices(tenant_id); create index on public.invoices(org_id, status, due_date);
alter table public.utility_bills add foreign key (invoice_id) references public.invoices(id) on delete set null;

create table public.invoice_items(
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null,
  invoice_id uuid not null,
  kind text not null check (kind in ('rent','electricity','gas','water','service','internet','garbage','late_fee','discount','other')),
  description text not null check (length(trim(description)) between 1 and 200),
  amount numeric(12,2) not null,
  utility_bill_id uuid unique references public.utility_bills(id) on delete set null,
  created_at timestamptz not null default now(),
  foreign key (invoice_id, org_id) references public.invoices(id, org_id) on delete cascade,
  check ((kind = 'discount' and amount <= 0) or (kind <> 'discount' and amount >= 0))
);
create index on public.invoice_items(invoice_id);

create table public.payments(
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  invoice_id uuid not null,
  tenant_id uuid not null,
  amount numeric(12,2) not null check (amount > 0),
  method text not null check (method in ('cash','bkash','nagad','rocket','bank','card','other')),
  reference text check (length(reference) <= 80),
  paid_on date not null,
  receipt_no text not null,
  received_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  foreign key (invoice_id, org_id) references public.invoices(id, org_id) on delete restrict,
  unique (org_id, receipt_no)
);
create index on public.payments(org_id, paid_on); create index on public.payments(invoice_id); create index on public.payments(tenant_id);

create table public.ledger_entries(
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  entry_type text not null check (entry_type in ('income','expense')),
  category text not null check (length(trim(category)) between 1 and 60),
  amount numeric(12,2) not null check (amount > 0),
  entry_date date not null,
  property_id uuid,
  payment_id uuid unique references public.payments(id) on delete cascade,
  description text check (length(description) <= 300),
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  foreign key (property_id, org_id) references public.properties(id, org_id) on delete set null (property_id)
);
create index on public.ledger_entries(org_id, entry_date);

create table public.notification_outbox(
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  channel text not null check (channel in ('sms','whatsapp')),
  to_phone text not null,
  template text not null check (template in ('invoice_issued','payment_received','due_reminder','custom')),
  body text not null check (length(body) <= 1000),
  status text not null default 'queued' check (status in ('queued','sent','failed','cancelled')),
  related_invoice_id uuid references public.invoices(id) on delete set null,
  attempts int not null default 0,
  last_error text,
  created_at timestamptz not null default now(),
  sent_at timestamptz
);
create index on public.notification_outbox(status, created_at); create index on public.notification_outbox(org_id);

create table public.subscription_payments(
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  plan_code text not null references public.plans(code),
  billing_cycle text not null check (billing_cycle in ('monthly','yearly')),
  amount numeric(12,2) not null check (amount >= 0),
  method text not null check (method in ('bkash','nagad','rocket','bank')),
  trx_id text not null check (trx_id ~ '^[A-Za-z0-9\-]{6,40}$'),
  status text not null default 'pending' check (status in ('pending','approved','rejected')),
  submitted_by uuid references auth.users(id) on delete set null,
  reviewed_by uuid references auth.users(id) on delete set null,
  reviewed_at timestamptz,
  review_note text check (length(review_note) <= 300),
  created_at timestamptz not null default now(),
  unique (method, trx_id)
);
create index on public.subscription_payments(status, created_at);

create table public.audit_log(
  id bigint generated always as identity primary key,
  org_id uuid references public.organizations(id) on delete cascade,
  actor uuid,
  action text not null,
  entity text not null,
  entity_id uuid,
  details jsonb,
  at timestamptz not null default now()
);
create index on public.audit_log(org_id, at desc);

create table public.counters(
  org_id uuid not null references public.organizations(id) on delete cascade,
  kind text not null check (kind in ('invoice','receipt')),
  year int not null,
  next_value int not null default 1,
  primary key (org_id, kind, year)
);

-- ===================== 202611110002_rentora_security.sql =====================
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

-- ===================== 202611110003_rentora_functions.sql =====================
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

-- ===================== 202611110004_rentora_profiles.sql =====================
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

-- ===================== 202611110005_rentora_function_grants.sql =====================
-- Lock down function execution explicitly. On Supabase, new functions in public are executable
-- by anon and authenticated through default privileges owned by another role, so a schema-wide
-- revoke before the functions exist is not enough.
alter function public.bd_today() set search_path = public;

do $$ declare f record; begin
  for f in select p.oid::regprocedure as sig from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public' loop
    execute format('revoke all on function %s from public, anon, authenticated', f.sig);
  end loop;
end $$;

-- Signed-in users: only the app's entry points (each checks role and subscription itself)
-- and the helpers that Row Level Security policies call.
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
-- Not granted to anyone: next_number, queue_notification, recalc_invoice, require_writable and the trigger functions.

-- ===================== 202611120001_rentora_audit_fixes.sql =====================
-- Audit fixes (12 Nov 2026): faster policies, foreign-key indexes, and correcting a wrongly recorded payment.

-- Evaluate auth.uid() once per query instead of once per row.
drop policy padmin_self on public.platform_admins;
create policy padmin_self on public.platform_admins for select to authenticated using (user_id = (select auth.uid()) or public.is_platform_admin());
drop policy members_read on public.org_members;
create policy members_read on public.org_members for select to authenticated using (user_id = (select auth.uid()) or public.has_org_role(org_id, array['owner']) or public.is_platform_admin());
drop policy profile_self on public.profiles;
create policy profile_self on public.profiles for all to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
drop policy profile_admin on public.profiles;
create policy profile_admin on public.profiles for select to authenticated using (public.is_platform_admin()
  or exists(select 1 from public.org_members a join public.org_members b on a.org_id = b.org_id where a.user_id = (select auth.uid()) and b.user_id = profiles.user_id));
drop policy tenants_self on public.tenants;
create policy tenants_self on public.tenants for select to authenticated using (user_id = (select auth.uid()));
drop policy orgs_self on public.organizations;
create policy orgs_self on public.organizations for select to authenticated using (id in (select org_id from public.tenants where user_id = (select auth.uid())));

-- Indexes covering the composite (row, org) foreign keys used for isolation.
create index if not exists buildings_property_org_idx on public.buildings(property_id, org_id);
create index if not exists units_building_org_idx on public.units(building_id, org_id);
create index if not exists units_parent_org_idx on public.units(parent_unit_id, org_id);
create index if not exists leases_tenant_org_idx on public.leases(tenant_id, org_id);
create index if not exists leases_unit_org_idx on public.leases(unit_id, org_id);
create index if not exists invoices_lease_org_idx on public.invoices(lease_id, org_id);
create index if not exists invoices_tenant_org_idx on public.invoices(tenant_id, org_id);
create index if not exists invoices_unit_org_idx on public.invoices(unit_id, org_id);
create index if not exists invoice_items_invoice_org_idx on public.invoice_items(invoice_id, org_id);
create index if not exists payments_invoice_org_idx on public.payments(invoice_id, org_id);
create index if not exists ledger_property_org_idx on public.ledger_entries(property_id, org_id);
create index if not exists utility_unit_org_idx on public.utility_bills(unit_id, org_id);
create index if not exists utility_invoice_idx on public.utility_bills(invoice_id);
create index if not exists outbox_invoice_idx on public.notification_outbox(related_invoice_id);
create index if not exists subpay_org_idx on public.subscription_payments(org_id);
create index if not exists subpay_plan_idx on public.subscription_payments(plan_code);
create index if not exists org_plan_idx on public.organizations(plan_code);

-- Owner removes a payment entered by mistake. The invoice due is restored, the automatic income line
-- is removed with it, and the full payment is kept in the audit log with the reason.
create or replace function public.delete_payment(p_payment uuid, p_reason text)
returns void language plpgsql security definer set search_path = public as $$
declare p record;
begin
  select * into p from public.payments where id = p_payment for update;
  if not found then raise exception 'পেমেন্ট পাওয়া যায়নি' using errcode = 'P0002'; end if;
  perform public.require_writable(p.org_id, array['owner']);
  if length(trim(coalesce(p_reason, ''))) < 3 then raise exception 'মুছে ফেলার কারণ লিখুন' using errcode = '22023'; end if;
  insert into public.audit_log(org_id, actor, action, entity, entity_id, details)
  values (p.org_id, auth.uid(), 'delete_payment', 'payments', p.id, jsonb_build_object('payment', to_jsonb(p), 'reason', left(trim(p_reason), 300)));
  delete from public.payments where id = p_payment;   -- its income line is removed by the foreign key
  perform public.recalc_invoice(p.invoice_id);
end $$;
revoke all on function public.delete_payment(uuid, text) from public, anon;
grant execute on function public.delete_payment(uuid, text) to authenticated;
