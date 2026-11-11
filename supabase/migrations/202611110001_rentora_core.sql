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
