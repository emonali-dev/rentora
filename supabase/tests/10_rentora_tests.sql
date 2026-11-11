-- Rentora security and behaviour tests. Every output line must start with 'ok'.
\set ON_ERROR_STOP 0
create or replace function pg_temp.expect_fail(sql text, label text) returns text language plpgsql as $$
begin execute sql; return 'FAIL (allowed): '||label; exception when others then return 'ok blocked: '||label||' -> '||sqlerrm; end $$;
create or replace function pg_temp.expect_ok(sql text, label text) returns text language plpgsql as $$
begin execute sql; return 'ok allowed: '||label; exception when others then return 'FAIL (blocked): '||label||' -> '||sqlerrm; end $$;
create or replace function pg_temp.check(cond boolean, label text) returns text language sql as $$
select case when cond then 'ok '||label else 'FAIL '||label end $$;
create or replace function pg_temp.as_user(uid text) returns void language plpgsql as $$
begin perform set_config('request.jwt.claim.sub', uid, false); perform set_config('request.jwt.claims', json_build_object('sub',uid)::text, false); end $$;
grant execute on all functions in schema pg_temp to anon, authenticated;

reset role;
insert into auth.users(id, email, email_confirmed_at) values
 ('a0000000-0000-4000-8000-000000000001','owner.a@test.bd', now()),
 ('b0000000-0000-4000-8000-000000000002','owner.b@test.bd', now()),
 ('c0000000-0000-4000-8000-000000000003','manager@test.bd', now()),
 ('d0000000-0000-4000-8000-000000000004','accountant@test.bd', now()),
 ('e0000000-0000-4000-8000-000000000005','Tenant@Test.bd', now()),
 ('f0000000-0000-4000-8000-000000000006','admin@siddiqiya.test', now()),
 ('90000000-0000-4000-8000-000000000007','outsider@test.bd', now());
insert into public.platform_admins(user_id) values ('f0000000-0000-4000-8000-000000000006');

-- ---------- anon ----------
set role anon; select pg_temp.as_user('');
select pg_temp.check((select count(*) from public.plans) = 3, 'anon sees the 3 public plans');
select pg_temp.expect_fail($q$select count(*) from public.organizations$q$, 'anon reads organizations');
select pg_temp.expect_fail($q$select count(*) from public.tenants$q$, 'anon reads tenants');
select pg_temp.expect_fail($q$select public.create_organization('X')$q$, 'anon creates organization');

-- ---------- owner A signs up ----------
set role authenticated; select pg_temp.as_user('a0000000-0000-4000-8000-000000000001');
select set_config('t.orgA', public.create_organization('Rahman Properties','01711000000','Mirpur, Dhaka')::text, false) \gset
select pg_temp.check((select status from public.organizations where id = current_setting('t.orgA')::uuid) = 'trial', 'new account starts on trial');
select pg_temp.check(public.org_writable(current_setting('t.orgA')::uuid), 'trial account is writable');
select pg_temp.expect_fail($q$update public.organizations set status='active', current_period_end=now()+interval '10 years' where id = current_setting('t.orgA')::uuid$q$, 'owner extends own subscription');
select pg_temp.expect_fail($q$update public.organizations set plan_code='premium' where id = current_setting('t.orgA')::uuid$q$, 'owner upgrades own plan for free');
select pg_temp.expect_ok($q$update public.organizations set name='Rahman Properties Ltd' where id = current_setting('t.orgA')::uuid$q$, 'owner renames business');
select pg_temp.expect_fail($q$insert into public.organizations(name) values ('Direct')$q$, 'direct insert of organization');

-- hierarchy: property > building > flat > room
with x as (insert into public.properties(org_id,name,address) values (current_setting('t.orgA')::uuid,'Rahman Villa','Mirpur 10') returning id) select set_config('t.prop', id::text, false) from x \gset
with x as (insert into public.buildings(org_id,property_id,name,floors) values (current_setting('t.orgA')::uuid,current_setting('t.prop')::uuid,'Building A',6) returning id) select set_config('t.bld', id::text, false) from x \gset
with x as (insert into public.units(org_id,building_id,kind,name,floor,rent_amount) values (current_setting('t.orgA')::uuid,current_setting('t.bld')::uuid,'flat','2A','2',15000) returning id) select set_config('t.flat', id::text, false) from x \gset
with x as (insert into public.units(org_id,building_id,parent_unit_id,kind,name,rent_amount) values (current_setting('t.orgA')::uuid,current_setting('t.bld')::uuid,current_setting('t.flat')::uuid,'room','Room 1',5000) returning id) select set_config('t.room', id::text, false) from x \gset
select pg_temp.check((select count(*) from public.units where org_id = current_setting('t.orgA')::uuid) = 2, 'flat and room created');
select pg_temp.expect_fail($q$insert into public.units(org_id,building_id,parent_unit_id,kind,name) values (current_setting('t.orgA')::uuid,current_setting('t.bld')::uuid,current_setting('t.room')::uuid,'room','Nested')$q$, 'room inside a room');

-- tenant + lease
with x as (insert into public.tenants(org_id,full_name,phone,email,nid_number) values (current_setting('t.orgA')::uuid,'Karim Ahmed','01722000000','tenant@test.bd','1234567890') returning id) select set_config('t.ten', id::text, false) from x \gset
with x as (insert into public.leases(org_id,tenant_id,unit_id,start_date,monthly_rent,security_deposit,due_day) values (current_setting('t.orgA')::uuid,current_setting('t.ten')::uuid,current_setting('t.flat')::uuid,date_trunc('month',public.bd_today())::date,15000,30000,10) returning id) select set_config('t.lease', id::text, false) from x \gset
select pg_temp.check((select status from public.units where id = current_setting('t.flat')::uuid) = 'occupied', 'active lease marks flat occupied');
select pg_temp.expect_fail($q$insert into public.leases(org_id,tenant_id,unit_id,start_date,monthly_rent) values (current_setting('t.orgA')::uuid,current_setting('t.ten')::uuid,current_setting('t.flat')::uuid,public.bd_today(),1)$q$, 'second active lease on same flat');
select pg_temp.expect_fail($q$insert into public.tenants(org_id,full_name,phone) values (current_setting('t.orgA')::uuid,'Bad','abc')$q$, 'invalid phone');

-- utilities: meter reading computes amount
insert into public.utility_bills(org_id,unit_id,kind,period,prev_reading,curr_reading,rate,amount) values
 (current_setting('t.orgA')::uuid,current_setting('t.flat')::uuid,'electricity',date_trunc('month',public.bd_today())::date,1000,1120,8.5,0),
 (current_setting('t.orgA')::uuid,current_setting('t.flat')::uuid,'gas',date_trunc('month',public.bd_today())::date,null,null,null,1080);
select pg_temp.check((select amount from public.utility_bills where kind='electricity') = 1020, 'electricity 120 units x 8.5 = 1020');

-- invoices
select pg_temp.check(public.generate_monthly_invoices(current_setting('t.orgA')::uuid, public.bd_today()) = 1, 'one invoice generated');
select pg_temp.check(public.generate_monthly_invoices(current_setting('t.orgA')::uuid, public.bd_today()) = 0, 'running again creates no duplicate');
select set_config('t.inv', (select id::text from public.invoices where lease_id = current_setting('t.lease')::uuid), false) \gset
select pg_temp.check((select subtotal from public.invoices where id = current_setting('t.inv')::uuid) = 17100, 'invoice total = rent 15000 + electricity 1020 + gas 1080');
select pg_temp.check((select invoice_no from public.invoices where id = current_setting('t.inv')::uuid) ~ '^INV-[0-9]{4}-00001$', 'invoice number format');
select pg_temp.check((select count(*) from public.utility_bills where invoice_id = current_setting('t.inv')::uuid) = 2, 'utility bills linked to invoice');
select pg_temp.expect_fail($q$update public.utility_bills set amount = 1 where kind='gas'$q$, 'edit an invoiced utility bill');
select pg_temp.expect_fail($q$update public.invoices set subtotal = 1 where id = current_setting('t.inv')::uuid$q$, 'edit invoice total directly');
select pg_temp.expect_fail($q$update public.invoices set status = 'paid' where id = current_setting('t.inv')::uuid$q$, 'mark invoice paid directly');
select pg_temp.expect_fail($q$insert into public.payments(org_id,invoice_id,tenant_id,amount,method,paid_on,receipt_no) values (current_setting('t.orgA')::uuid,current_setting('t.inv')::uuid,current_setting('t.ten')::uuid,17100,'cash',public.bd_today(),'X')$q$, 'insert payment directly');
select pg_temp.expect_ok($q$insert into public.invoice_items(org_id,invoice_id,kind,description,amount) values (current_setting('t.orgA')::uuid,current_setting('t.inv')::uuid,'discount','ছাড়',-100)$q$, 'add a discount line');
select pg_temp.check((select subtotal from public.invoices where id = current_setting('t.inv')::uuid) = 17000, 'discount recalculates total');
select pg_temp.expect_fail($q$insert into public.invoice_items(org_id,invoice_id,kind,description,amount) values (current_setting('t.orgA')::uuid,current_setting('t.inv')::uuid,'rent','extra rent',1)$q$, 'add rent line by hand');

-- payments
select pg_temp.expect_fail($q$select public.record_payment(current_setting('t.inv')::uuid, 99999, 'cash')$q$, 'overpayment');
select pg_temp.expect_fail($q$select public.record_payment(current_setting('t.inv')::uuid, -5, 'cash')$q$, 'negative payment');
select pg_temp.check((public.record_payment(current_setting('t.inv')::uuid, 10000, 'bkash', 'TRX123')->>'status') = 'partial', 'partial payment');
select pg_temp.check((public.record_payment(current_setting('t.inv')::uuid, 7000, 'cash')->>'status') = 'paid', 'full payment marks paid');
select pg_temp.check((select receipt_no from public.payments order by created_at desc, receipt_no desc limit 1) ~ '^RCP-[0-9]{4}-00002$', 'receipt numbering');
select pg_temp.check((select sum(amount) from public.ledger_entries where entry_type='income') = 17000, 'payments recorded as income');
select pg_temp.expect_fail($q$insert into public.invoice_items(org_id,invoice_id,kind,description,amount) values (current_setting('t.orgA')::uuid,current_setting('t.inv')::uuid,'other','late',50)$q$, 'change a paid invoice');
select pg_temp.expect_fail($q$select public.void_invoice(current_setting('t.inv')::uuid,'x')$q$, 'void a paid invoice');
delete from public.ledger_entries where payment_id is not null;
select pg_temp.check((select count(*) from public.ledger_entries where payment_id is not null) = 2, 'automatic income rows still there');
select pg_temp.expect_ok($q$insert into public.ledger_entries(org_id,entry_type,category,amount,entry_date,property_id) values (current_setting('t.orgA')::uuid,'expense','মেরামত',2500,public.bd_today(),current_setting('t.prop')::uuid)$q$, 'record an expense');
select pg_temp.check((public.dashboard_summary(current_setting('t.orgA')::uuid)->>'collected')::numeric = 17000, 'dashboard collected');
select pg_temp.check((public.dashboard_summary(current_setting('t.orgA')::uuid)->>'expense')::numeric = 2500, 'dashboard expense');
select pg_temp.check(jsonb_array_length(public.dashboard_summary(current_setting('t.orgA')::uuid)->'trend') = 6, 'dashboard 6-month trend');

-- team
select pg_temp.expect_ok($q$select public.add_org_member(current_setting('t.orgA')::uuid,'manager@test.bd','manager')$q$, 'owner adds manager');
select pg_temp.expect_ok($q$select public.add_org_member(current_setting('t.orgA')::uuid,'accountant@test.bd','accountant')$q$, 'owner adds accountant');
select pg_temp.expect_fail($q$select public.add_org_member(current_setting('t.orgA')::uuid,'nobody@test.bd','manager')$q$, 'add unknown email');
select pg_temp.expect_fail($q$select public.add_org_member(current_setting('t.orgA')::uuid,'outsider@test.bd','owner')$q$, 'add a second owner');

-- ---------- manager ----------
select pg_temp.as_user('c0000000-0000-4000-8000-000000000003');
select pg_temp.check((select count(*) from public.tenants) = 1, 'manager sees org tenants');
select pg_temp.expect_ok($q$update public.units set rent_amount = 16000 where id = current_setting('t.flat')::uuid$q$, 'manager edits rent');
select pg_temp.expect_fail($q$select public.add_org_member(current_setting('t.orgA')::uuid,'outsider@test.bd','manager')$q$, 'manager adds members');
select pg_temp.check((select count(*) from public.audit_log) = 0, 'manager cannot read audit log');
-- delete is owner-only: policy silently filters, so the row must survive
delete from public.properties where id = current_setting('t.prop')::uuid;
select pg_temp.check((select count(*) from public.properties) = 1, 'manager cannot delete property');

-- ---------- accountant ----------
select pg_temp.as_user('d0000000-0000-4000-8000-000000000004');
select pg_temp.expect_fail($q$insert into public.tenants(org_id,full_name,phone) values (current_setting('t.orgA')::uuid,'New Tenant','01733000000')$q$, 'accountant adds tenant');
select pg_temp.expect_ok($q$insert into public.ledger_entries(org_id,entry_type,category,amount,entry_date) values (current_setting('t.orgA')::uuid,'income','পার্কিং',500,public.bd_today())$q$, 'accountant records other income');
select pg_temp.expect_fail($q$select public.generate_monthly_invoices(current_setting('t.orgA')::uuid, public.bd_today())$q$, 'accountant generates invoices');

-- ---------- owner B (another landlord) ----------
select pg_temp.as_user('b0000000-0000-4000-8000-000000000002');
select set_config('t.orgB', public.create_organization('Other Landlord')::text, false) \gset
select pg_temp.check((select count(*) from public.tenants) = 0, 'owner B sees no tenants of A');
select pg_temp.check((select count(*) from public.invoices) = 0, 'owner B sees no invoices of A');
select pg_temp.check((select count(*) from public.organizations) = 1, 'owner B sees only own organization');
select pg_temp.expect_fail($q$insert into public.properties(org_id,name) values (current_setting('t.orgA')::uuid,'Hijack')$q$, 'owner B writes into A');
select pg_temp.expect_fail($q$select public.record_payment(current_setting('t.inv')::uuid, 1, 'cash')$q$, 'owner B records payment on A invoice');
select pg_temp.expect_fail($q$select public.dashboard_summary(current_setting('t.orgA')::uuid)$q$, 'owner B reads A dashboard');
select pg_temp.expect_fail($q$select public.export_org_data(current_setting('t.orgA')::uuid)$q$, 'owner B exports A data');
-- cross-org reference: B's building pointing at A's property
with x as (insert into public.properties(org_id,name) values (current_setting('t.orgB')::uuid,'B House') returning id) select set_config('t.propB', id::text, false) from x \gset
select pg_temp.expect_fail($q$insert into public.buildings(org_id,property_id,name) values (current_setting('t.orgB')::uuid,current_setting('t.prop')::uuid,'Sneaky')$q$, 'link building to another org property');
select pg_temp.expect_fail($q$select public.admin_overview()$q$, 'owner calls super admin overview');
select pg_temp.expect_fail($q$select public.admin_update_org(current_setting('t.orgB')::uuid,'active','premium','yearly',now()+interval '9 years',null)$q$, 'owner calls admin_update_org');

-- ---------- tenant portal ----------
select pg_temp.as_user('e0000000-0000-4000-8000-000000000005');
select pg_temp.check((select count(*) from public.invoices) = 0, 'tenant sees nothing before linking');
select pg_temp.check(public.link_my_tenant_records() = 1, 'tenant linked by verified email (case-insensitive)');
select pg_temp.check((select count(*) from public.invoices) = 1, 'tenant sees own invoice');
select pg_temp.check((select count(*) from public.invoice_items) = 4, 'tenant sees own invoice lines');
select pg_temp.check((select count(*) from public.payments) = 2, 'tenant sees own receipts');
select pg_temp.check((select count(*) from public.units) = 1, 'tenant sees only own flat, not the room');
select pg_temp.check((select count(*) from public.ledger_entries) = 0, 'tenant cannot see landlord accounts');
select pg_temp.check((select count(*) from public.notification_outbox) = 0, 'tenant cannot see message queue');
select pg_temp.expect_fail($q$select public.record_payment(current_setting('t.inv')::uuid, 1, 'cash')$q$, 'tenant records payment');
update public.tenants set full_name = 'Hacked' where user_id = auth.uid();
select pg_temp.check((select full_name from public.tenants) = 'Karim Ahmed', 'tenant cannot edit own tenant record');

-- ---------- outsider ----------
select pg_temp.as_user('90000000-0000-4000-8000-000000000007');
select pg_temp.check(public.link_my_tenant_records() = 0, 'outsider links nothing');
select pg_temp.check((select count(*) from public.invoices) + (select count(*) from public.tenants) + (select count(*) from public.properties) = 0, 'outsider sees nothing');

-- ---------- subscriptions ----------
select pg_temp.as_user('a0000000-0000-4000-8000-000000000001');
select set_config('t.sp', public.submit_subscription_payment(current_setting('t.orgA')::uuid,'standard','yearly','bkash','8N7A6B5C4D')::text, false) \gset
select pg_temp.check((select amount from public.subscription_payments where id = current_setting('t.sp')::uuid) = 5990, 'subscription amount taken from plan, not browser');
select pg_temp.expect_fail($q$select public.submit_subscription_payment(current_setting('t.orgA')::uuid,'standard','yearly','bkash','8N7A6B5C4D')$q$, 'reuse of the same transaction ID');
select pg_temp.expect_fail($q$select public.admin_review_subscription(current_setting('t.sp')::uuid, true)$q$, 'owner approves own payment');

-- ---------- super admin ----------
select pg_temp.as_user('f0000000-0000-4000-8000-000000000006');
select pg_temp.check((public.admin_overview()->>'customers')::int = 2, 'super admin sees all customers');
select pg_temp.check((select count(*) from public.admin_customers()) = 2, 'customer list');
select pg_temp.check((select owner_email from public.admin_customers() where id = current_setting('t.orgA')::uuid) = 'owner.a@test.bd', 'customer list shows owner email');
select pg_temp.expect_ok($q$select public.admin_review_subscription(current_setting('t.sp')::uuid, true, 'ok')$q$, 'super admin approves payment');
select pg_temp.check((select status = 'active' and plan_code = 'standard' and current_period_end > now() + interval '360 days' from public.organizations where id = current_setting('t.orgA')::uuid), 'approval activates yearly standard plan');
select pg_temp.expect_fail($q$select public.admin_review_subscription(current_setting('t.sp')::uuid, true)$q$, 'approve twice');
select pg_temp.expect_ok($q$select public.admin_update_org(current_setting('t.orgB')::uuid,'suspended','basic','monthly',null,now()-interval '1 day')$q$, 'super admin suspends a customer');

-- ---------- expired / suspended account ----------
select pg_temp.as_user('b0000000-0000-4000-8000-000000000002');
select pg_temp.check(not public.org_writable(current_setting('t.orgB')::uuid), 'suspended account not writable');
select pg_temp.check((select count(*) from public.properties) = 1, 'suspended owner can still read data');
select pg_temp.expect_fail($q$insert into public.properties(org_id,name) values (current_setting('t.orgB')::uuid,'New')$q$, 'suspended owner adds property');

-- ---------- plan limit ----------
reset role;
update public.plans set max_units = 2 where code = 'standard';
set role authenticated; select pg_temp.as_user('a0000000-0000-4000-8000-000000000001');
select pg_temp.expect_fail($q$insert into public.units(org_id,building_id,kind,name) values (current_setting('t.orgA')::uuid,current_setting('t.bld')::uuid,'flat','3A')$q$, 'unit limit of plan');
reset role; update public.plans set max_units = 60 where code = 'standard'; set role authenticated;

-- ---------- notifications prepared ----------
select pg_temp.expect_ok($q$update public.organizations set sms_enabled = true, whatsapp_enabled = true where id = current_setting('t.orgA')::uuid$q$, 'owner enables SMS and WhatsApp');
with x as (insert into public.units(org_id,building_id,kind,name,rent_amount) values (current_setting('t.orgA')::uuid,current_setting('t.bld')::uuid,'flat','3B',12000) returning id) select set_config('t.flat2', id::text, false) from x \gset
with x as (insert into public.tenants(org_id,full_name,phone) values (current_setting('t.orgA')::uuid,'Salma Begum','01755000000') returning id) select set_config('t.ten2', id::text, false) from x \gset
insert into public.leases(org_id,tenant_id,unit_id,start_date,monthly_rent,due_day) values (current_setting('t.orgA')::uuid,current_setting('t.ten2')::uuid,current_setting('t.flat2')::uuid,date_trunc('month',public.bd_today())::date - 40,12000,1);
select pg_temp.check(public.generate_monthly_invoices(current_setting('t.orgA')::uuid, public.bd_today() - 31) = 1, 'back-dated month invoice for new lease only');
select pg_temp.check((select count(*) from public.notification_outbox where template = 'invoice_issued') = 2, 'invoice SMS + WhatsApp queued');
select pg_temp.check(public.queue_due_reminders(current_setting('t.orgA')::uuid) = 1, 'one overdue invoice gets a reminder');
select pg_temp.check((public.dashboard_summary(current_setting('t.orgA')::uuid)->>'overdue_count')::int = 1, 'dashboard counts overdue');
select pg_temp.check((select count(*) from public.audit_log where org_id = current_setting('t.orgA')::uuid) > 10, 'audit trail recorded');
select pg_temp.check(jsonb_array_length(public.export_org_data(current_setting('t.orgA')::uuid)->'invoices') = 2, 'owner export contains invoices');
-- void an unpaid invoice releases nothing paid
select set_config('t.inv2', (select id::text from public.invoices where tenant_id = current_setting('t.ten2')::uuid), false) \gset
select pg_temp.expect_ok($q$select public.void_invoice(current_setting('t.inv2')::uuid,'ভুল')$q$, 'owner voids unpaid invoice');
select pg_temp.check((select status from public.invoices where id = current_setting('t.inv2')::uuid) = 'void', 'invoice is void');
-- ending a lease frees the flat
update public.leases set status = 'ended', end_date = public.bd_today() where tenant_id = current_setting('t.ten2')::uuid;
select pg_temp.check((select status from public.units where id = current_setting('t.flat2')::uuid) = 'vacant', 'ended lease frees unit');
