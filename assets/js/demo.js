// Demo backend: an in-memory stand-in for Supabase with realistic sample data.
// It mirrors the real database functions closely enough to try every screen. Nothing is saved.
const uid = () => (crypto.randomUUID ? crypto.randomUUID() : 'id-' + Math.random().toString(36).slice(2) + Date.now().toString(36));
const today = () => new Date(Date.now() + 6 * 3600e3).toISOString().slice(0, 10);
const mStart = d => d.slice(0, 7) + '-01';
const addM = (iso, k) => { const [y, m] = iso.split('-').map(Number); return new Date(Date.UTC(y, m - 1 + k, 1)).toISOString().slice(0, 10); };
const addD = (iso, k) => new Date(Date.parse(iso) + k * 864e5).toISOString().slice(0, 10);
const now = () => new Date().toISOString();

const USERS = {
  owner: { id: 'u-owner', email: 'owner@demo.bashamanager', name: 'আব্দুর রহমান' },
  tenant: { id: 'u-tenant', email: 'karim@demo.bashamanager', name: 'করিম আহমেদ' },
  admin: { id: 'u-admin', email: 'admin@siddiqiya.demo', name: 'Super Admin' },
};

function seed() {
  const db = { plans: [], platform_settings: [], organizations: [], org_members: [], profiles: [], properties: [], buildings: [], units: [], tenants: [], leases: [],
    utility_bills: [], invoices: [], invoice_items: [], payments: [], ledger_entries: [], notification_outbox: [], subscription_payments: [], audit_log: [], platform_admins: [], counters: {} };
  db.plans = [
    { code: 'basic', name: 'Basic', name_bn: 'বেসিক', monthly_price: 299, yearly_price: 2990, max_units: 15, features: ['১৫টি ইউনিট পর্যন্ত', 'ভাড়া ও বকেয়া হিসাব', 'ইনভয়েস ও রসিদ', 'ইউটিলিটি বিল'], active: true, sort: 1 },
    { code: 'standard', name: 'Standard', name_bn: 'স্ট্যান্ডার্ড', monthly_price: 599, yearly_price: 5990, max_units: 60, features: ['৬০টি ইউনিট পর্যন্ত', 'বেসিকের সবকিছু', 'ভাড়াটিয়া পোর্টাল', 'আয়-ব্যয় রিপোর্ট', 'টিম মেম্বার'], active: true, sort: 2 },
    { code: 'premium', name: 'Premium', name_bn: 'প্রিমিয়াম', monthly_price: 1199, yearly_price: 11990, max_units: null, features: ['আনলিমিটেড ইউনিট', 'স্ট্যান্ডার্ডের সবকিছু', 'SMS/WhatsApp রিমাইন্ডার', 'অগ্রাধিকার সাপোর্ট'], active: true, sort: 3 },
  ];
  db.platform_settings = [{ id: true, trial_days: 14, grace_days: 3, bkash_number: '01778662833', nagad_number: '01778662833', rocket_number: null, bank_details: null, support_phone: '01778662833' }];
  db.platform_admins = [{ user_id: USERS.admin.id }];
  const org = { id: 'org-1', name: 'রহমান প্রপার্টিজ', phone: '01711000000', address: 'মিরপুর ১০, ঢাকা', plan_code: 'standard', billing_cycle: 'monthly', status: 'trial',
    trial_ends_at: addD(today(), 9) + 'T00:00:00Z', current_period_end: null, invoice_prefix: 'INV', receipt_prefix: 'RCP', default_due_day: 10, sms_enabled: true, whatsapp_enabled: false, created_at: addD(today(), -5) };
  db.organizations.push(org,
    { id: 'org-2', name: 'Green View Apartments', phone: '01819000000', address: 'উত্তরা, ঢাকা', plan_code: 'premium', billing_cycle: 'yearly', status: 'active', trial_ends_at: null, current_period_end: addD(today(), 200) + 'T00:00:00Z', invoice_prefix: 'GV', receipt_prefix: 'GVR', default_due_day: 5, sms_enabled: true, whatsapp_enabled: true, created_at: addD(today(), -160) },
    { id: 'org-3', name: 'Chowdhury Mansion', phone: '01912000000', address: 'চট্টগ্রাম', plan_code: 'basic', billing_cycle: 'monthly', status: 'active', trial_ends_at: null, current_period_end: addD(today(), -6) + 'T00:00:00Z', invoice_prefix: 'INV', receipt_prefix: 'RCP', default_due_day: 10, sms_enabled: false, whatsapp_enabled: false, created_at: addD(today(), -70) });
  db.org_members.push({ org_id: 'org-1', user_id: USERS.owner.id, role: 'owner' }, { org_id: 'org-1', user_id: 'u-mgr', role: 'manager' });
  db.profiles.push({ user_id: USERS.owner.id, full_name: USERS.owner.name, phone: '01711000000' }, { user_id: 'u-mgr', full_name: 'জসিম উদ্দিন', phone: '01733000000' });
  db.subscription_payments.push(
    { id: uid(), org_id: 'org-1', plan_code: 'standard', billing_cycle: 'monthly', amount: 599, method: 'bkash', trx_id: 'BK7H3K9Q2L', status: 'pending', created_at: addD(today(), -1) + 'T09:12:00Z' },
    { id: uid(), org_id: 'org-2', plan_code: 'premium', billing_cycle: 'yearly', amount: 11990, method: 'nagad', trx_id: '73NG81KQ', status: 'approved', reviewed_at: addD(today(), -165) + 'T10:00:00Z', created_at: addD(today(), -165) + 'T08:00:00Z' });

  const P1 = { id: 'p-1', org_id: 'org-1', name: 'রহমান ভিলা', address: 'রোড ৫, মিরপুর ১০', kind: 'residential' };
  const P2 = { id: 'p-2', org_id: 'org-1', name: 'রহমান মার্কেট', address: 'মেইন রোড, কাজীপাড়া', kind: 'commercial' };
  db.properties.push(P1, P2);
  db.buildings.push({ id: 'b-1', org_id: 'org-1', property_id: 'p-1', name: 'ভবন A', floors: 5 }, { id: 'b-2', org_id: 'org-1', property_id: 'p-1', name: 'ভবন B', floors: 3 }, { id: 'b-3', org_id: 'org-1', property_id: 'p-2', name: 'নিচতলা', floors: 1 });
  const U = (id, b, name, kind, floor, rent, parent = null, bedrooms = null) => db.units.push({ id, org_id: 'org-1', building_id: b, parent_unit_id: parent, kind, name, floor, bedrooms, size_sqft: null, rent_amount: rent, status: 'vacant', notes: null });
  U('u1', 'b-1', '1A', 'flat', '১', 14000, null, 3); U('u2', 'b-1', '1B', 'flat', '১', 12000, null, 2); U('u3', 'b-1', '2A', 'flat', '২', 15000, null, 3); U('u4', 'b-1', '2B', 'flat', '২', 12500, null, 2);
  U('u5', 'b-1', '3A', 'flat', '৩', 15000, null, 3); U('u6', 'b-1', '3B', 'flat', '৩', 12500, null, 2); U('u7', 'b-1', '4A', 'flat', '৪', 16000, null, 3); U('u8', 'b-1', '4B', 'flat', '৪', 13000, null, 2);
  U('u9', 'b-2', '1A', 'flat', '১', 11000, null, 2); U('u10', 'b-2', 'রুম ১', 'room', '২', 4500, null); U('u11', 'b-2', 'রুম ২', 'room', '২', 4500, null); U('u12', 'b-2', '2A', 'flat', '২', 10000, null, 2);
  U('u13', 'b-3', 'দোকান ১', 'shop', 'নিচ', 18000); U('u14', 'b-3', 'দোকান ২', 'shop', 'নিচ', 16000); U('u15', 'b-3', 'দোকান ৩', 'shop', 'নিচ', 16000);
  const people = [['করিম আহমেদ', '01722000001', 'karim@demo.bashamanager', 'u3'], ['সালমা বেগম', '01722000002', null, 'u1'], ['তানভীর হাসান', '01722000003', null, 'u2'], ['নুসরাত জাহান', '01722000004', null, 'u4'],
    ['মোঃ রফিকুল ইসলাম', '01722000005', null, 'u5'], ['ফারহানা আক্তার', '01722000006', null, 'u7'], ['জাহিদ হোসেন', '01722000007', null, 'u9'], ['রাকিব (ছাত্র)', '01722000008', null, 'u10'],
    ['মিতু ফার্মেসি', '01722000009', null, 'u13'], ['আল-আমিন স্টোর', '01722000010', null, 'u14'], ['শাহানা পারভীন', '01722000011', null, 'u8']];
  people.forEach(([name, phone, email, unit], i) => {
    const t = { id: 't' + (i + 1), org_id: 'org-1', full_name: name, phone, email, nid_number: null, address: null, occupation: null, family_members: null, emergency_name: null, emergency_phone: null, user_id: email ? USERS.tenant.id : null, notes: null, active: true, created_at: addD(today(), -400) };
    db.tenants.push(t);
    const u = db.units.find(x => x.id === unit);
    db.leases.push({ id: 'l' + (i + 1), org_id: 'org-1', tenant_id: t.id, unit_id: unit, start_date: addM(mStart(today()), -(6 + i)), end_date: null, monthly_rent: u.rent_amount, security_deposit: u.rent_amount * 2, due_day: 10, status: 'active', notes: null });
    u.status = 'occupied';
  });
  db.units.find(x => x.id === 'u12').status = 'maintenance';
  return db;
}

export function createDemoClient(role) {
  const db = seed();
  const user = USERS[role === 'owner-new' ? 'owner' : role] || null;
  let session = user ? { user: { id: user.id, email: user.email, email_confirmed_at: now(), user_metadata: { full_name: user.name } }, access_token: 'demo' } : null;
  const listeners = [];
  const me = () => session?.user?.id;
  const isAdmin = () => db.platform_admins.some(a => a.user_id === me());
  const memberOrgs = (roles = ['owner', 'manager', 'accountant']) => db.org_members.filter(m => m.user_id === me() && roles.includes(m.role)).map(m => m.org_id);
  const myTenantIds = () => db.tenants.filter(t => t.user_id === me()).map(t => t.id);
  const fail = msg => ({ data: null, error: { message: msg } });

  function visible(table) {
    const rows = db[table] || [];
    if (table === 'plans') return rows.filter(r => r.active || isAdmin());
    if (table === 'platform_settings') return rows;
    if (!me()) return [];
    if (isAdmin()) return rows;
    const orgs = memberOrgs();
    if (table === 'organizations') { const tOrgs = db.tenants.filter(t => t.user_id === me()).map(t => t.org_id); return rows.filter(r => orgs.includes(r.id) || tOrgs.includes(r.id)); }
    if (table === 'platform_admins') return rows.filter(r => r.user_id === me());
    if (table === 'org_members') return rows.filter(r => r.user_id === me() || memberOrgs(['owner']).includes(r.org_id));
    if (table === 'profiles') return rows;
    const mine = rows.filter(r => orgs.includes(r.org_id));
    const tids = myTenantIds(); if (!tids.length) return mine;
    const myLeases = db.leases.filter(l => tids.includes(l.tenant_id));
    const extra = {
      tenants: r => tids.includes(r.id), leases: r => tids.includes(r.tenant_id), invoices: r => tids.includes(r.tenant_id), payments: r => tids.includes(r.tenant_id),
      invoice_items: r => db.invoices.some(i => i.id === r.invoice_id && tids.includes(i.tenant_id)), units: r => myLeases.some(l => l.unit_id === r.id),
      buildings: r => db.units.some(u => u.building_id === r.id && myLeases.some(l => l.unit_id === u.id)),
      properties: r => db.buildings.some(b => b.property_id === r.id && db.units.some(u => u.building_id === b.id && myLeases.some(l => l.unit_id === u.id))),
    }[table];
    return extra ? rows.filter(r => orgs.includes(r.org_id) || extra(r)) : mine;
  }
  function writable(org) {
    const o = db.organizations.find(x => x.id === org); if (!o) return false;
    const g = 3 * 864e5;
    return (o.status === 'trial' && Date.parse(o.trial_ends_at) + g > Date.now()) || (o.status === 'active' && Date.parse(o.current_period_end) + g > Date.now());
  }
  const canManage = org => memberOrgs(['owner', 'manager']).includes(org) && writable(org);
  function nextNo(org, kind) {
    const y = today().slice(0, 4), k = org + kind + y; db.counters[k] = (db.counters[k] || 0) + 1;
    const o = db.organizations.find(x => x.id === org); return `${kind === 'invoice' ? o.invoice_prefix : o.receipt_prefix}-${y}-${String(db.counters[k]).padStart(5, '0')}`;
  }
  function recalc(invId) {
    const inv = db.invoices.find(i => i.id === invId);
    inv.subtotal = Math.max(0, db.invoice_items.filter(x => x.invoice_id === invId).reduce((s, x) => s + Number(x.amount), 0));
    inv.paid_amount = db.payments.filter(p => p.invoice_id === invId).reduce((s, p) => s + Number(p.amount), 0);
    if (inv.status !== 'void') inv.status = inv.paid_amount >= inv.subtotal && inv.subtotal > 0 ? 'paid' : inv.paid_amount > 0 ? 'partial' : 'unpaid';
  }
  function syncUnits() {
    db.units.forEach(u => { const act = db.leases.some(l => l.unit_id === u.id && l.status === 'active'); if (act) u.status = 'occupied'; else if (u.status === 'occupied') u.status = 'vacant'; });
  }
  function queue(org, phone, template, body, inv) {
    const o = db.organizations.find(x => x.id === org); if (!phone) return;
    if (o.sms_enabled) db.notification_outbox.push({ id: uid(), org_id: org, channel: 'sms', to_phone: phone, template, body, status: 'queued', related_invoice_id: inv, attempts: 0, created_at: now() });
    if (o.whatsapp_enabled) db.notification_outbox.push({ id: uid(), org_id: org, channel: 'whatsapp', to_phone: phone, template, body, status: 'queued', related_invoice_id: inv, attempts: 0, created_at: now() });
  }
  const UTIL = { electricity: 'বিদ্যুৎ বিল', gas: 'গ্যাস বিল', water: 'পানির বিল', service: 'সার্ভিস চার্জ', internet: 'ইন্টারনেট', garbage: 'ময়লা বিল', other: 'অন্যান্য বিল' };

  const rpcs = {
    generate_monthly_invoices({ p_org, p_period }) {
      if (!canManage(p_org)) throw new Error('এই কাজের অনুমতি নেই');
      const per = mStart(p_period), end = addD(addM(per, 1), -1); let c = 0;
      db.leases.filter(l => l.org_id === p_org && l.status === 'active' && l.start_date <= end && (!l.end_date || l.end_date >= per) && !db.invoices.some(i => i.lease_id === l.id && i.period === per && i.status !== 'void'))
        .forEach(l => {
          const inv = { id: uid(), org_id: p_org, invoice_no: nextNo(p_org, 'invoice'), lease_id: l.id, tenant_id: l.tenant_id, unit_id: l.unit_id, period: per, issue_date: today(), due_date: addD(per, l.due_day - 1), subtotal: 0, paid_amount: 0, status: 'unpaid', notes: null, created_at: now() };
          db.invoices.push(inv);
          db.invoice_items.push({ id: uid(), org_id: p_org, invoice_id: inv.id, kind: 'rent', description: 'বাসা ভাড়া — ' + per.slice(5, 7) + '/' + per.slice(0, 4), amount: l.monthly_rent });
          db.utility_bills.filter(u => u.unit_id === l.unit_id && u.period === per && !u.invoice_id).forEach(u => {
            db.invoice_items.push({ id: uid(), org_id: p_org, invoice_id: inv.id, kind: u.kind, description: UTIL[u.kind] + (u.prev_reading != null && u.curr_reading != null ? ` (${u.prev_reading}→${u.curr_reading})` : ''), amount: u.amount, utility_bill_id: u.id });
            u.invoice_id = inv.id;
          });
          recalc(inv.id);
          const t = db.tenants.find(x => x.id === l.tenant_id);
          queue(p_org, t.phone, 'invoice_issued', `প্রিয় ${t.full_name}, ${per.slice(5, 7)}/${per.slice(0, 4)} মাসের ভাড়া ও বিল মোট ৳${inv.subtotal}। ইনভয়েস ${inv.invoice_no}`, inv.id);
          c++;
        });
      return c;
    },
    record_payment({ p_invoice, p_amount, p_method, p_reference, p_paid_on }) {
      const i = db.invoices.find(x => x.id === p_invoice); if (!i) throw new Error('ইনভয়েস পাওয়া যায়নি');
      if (!memberOrgs().includes(i.org_id) || !writable(i.org_id)) throw new Error('এই কাজের অনুমতি নেই');
      const amt = Number(p_amount); if (!(amt > 0)) throw new Error('টাকার পরিমাণ সঠিক নয়');
      if (amt > i.subtotal - i.paid_amount + 1e-9) throw new Error(`বকেয়ার (৳${i.subtotal - i.paid_amount}) চেয়ে বেশি টাকা নেওয়া যাবে না`);
      if (i.status === 'void') throw new Error('বাতিল ইনভয়েসে টাকা নেওয়া যাবে না');
      const p = { id: uid(), org_id: i.org_id, invoice_id: i.id, tenant_id: i.tenant_id, amount: amt, method: p_method, reference: p_reference || null, paid_on: p_paid_on || today(), receipt_no: nextNo(i.org_id, 'receipt'), received_by: me(), created_at: now() };
      db.payments.push(p); recalc(i.id);
      const prop = db.buildings.find(b => b.id === db.units.find(u => u.id === i.unit_id)?.building_id)?.property_id || null;
      db.ledger_entries.push({ id: uid(), org_id: i.org_id, entry_type: 'income', category: 'ভাড়া আদায়', amount: amt, entry_date: p.paid_on, property_id: prop, payment_id: p.id, description: i.invoice_no + ' / ' + p.receipt_no, created_at: now() });
      const t = db.tenants.find(x => x.id === i.tenant_id); queue(i.org_id, t.phone, 'payment_received', `প্রিয় ${t.full_name}, ৳${amt} পেয়েছি। রসিদ নং ${p.receipt_no}। ধন্যবাদ।`, i.id);
      return { payment_id: p.id, receipt_no: p.receipt_no, status: i.status, due: i.subtotal - i.paid_amount };
    },
    delete_payment({ p_payment, p_reason }) {
      const p = db.payments.find(x => x.id === p_payment); if (!p) throw new Error('পেমেন্ট পাওয়া যায়নি');
      if (!memberOrgs(['owner']).includes(p.org_id)) throw new Error('এই কাজের অনুমতি নেই');
      if (!p_reason || p_reason.trim().length < 3) throw new Error('মুছে ফেলার কারণ লিখুন');
      db.payments = db.payments.filter(x => x !== p); db.ledger_entries = db.ledger_entries.filter(l => l.payment_id !== p.id); recalc(p.invoice_id); return null;
    },
    void_invoice({ p_invoice, p_reason }) {
      const i = db.invoices.find(x => x.id === p_invoice);
      if (!memberOrgs(['owner']).includes(i.org_id)) throw new Error('এই কাজের অনুমতি নেই');
      if (db.payments.some(p => p.invoice_id === p_invoice)) throw new Error('টাকা জমা হওয়া ইনভয়েস বাতিল করা যাবে না');
      db.utility_bills.filter(u => u.invoice_id === p_invoice).forEach(u => u.invoice_id = null);
      i.status = 'void'; i.notes = p_reason || 'বাতিল'; return null;
    },
    queue_due_reminders({ p_org }) {
      let c = 0; db.invoices.filter(i => i.org_id === p_org && ['unpaid', 'partial'].includes(i.status) && i.due_date < today()).forEach(i => {
        const t = db.tenants.find(x => x.id === i.tenant_id); queue(p_org, t.phone, 'due_reminder', `প্রিয় ${t.full_name}, ইনভয়েস ${i.invoice_no} এর ৳${i.subtotal - i.paid_amount} বকেয়া আছে।`, i.id); c++; });
      return c;
    },
    dashboard_summary({ p_org, p_month }) {
      const m = mStart(p_month || today()), me2 = addD(addM(m, 1), -1);
      const inv = db.invoices.filter(i => i.org_id === p_org && i.status !== 'void'), led = db.ledger_entries.filter(l => l.org_id === p_org);
      const sum = (a, f) => a.reduce((s, x) => s + Number(f(x)), 0);
      return {
        properties: db.properties.filter(x => x.org_id === p_org).length, units: db.units.filter(x => x.org_id === p_org).length,
        occupied: db.units.filter(x => x.org_id === p_org && x.status === 'occupied').length, vacant: db.units.filter(x => x.org_id === p_org && x.status === 'vacant').length,
        tenants: db.tenants.filter(x => x.org_id === p_org && x.active).length,
        invoiced: sum(inv.filter(i => i.period === m), i => i.subtotal), collected: sum(db.payments.filter(p => p.org_id === p_org && p.paid_on >= m && p.paid_on <= me2), p => p.amount),
        month_due: sum(inv.filter(i => i.period === m && i.status !== 'paid'), i => i.subtotal - i.paid_amount), total_due: sum(inv.filter(i => i.status !== 'paid'), i => i.subtotal - i.paid_amount),
        overdue_count: inv.filter(i => i.status !== 'paid' && i.due_date < today()).length,
        income: sum(led.filter(l => l.entry_type === 'income' && l.entry_date >= m && l.entry_date <= me2), l => l.amount),
        expense: sum(led.filter(l => l.entry_type === 'expense' && l.entry_date >= m && l.entry_date <= me2), l => l.amount),
        trend: [-5, -4, -3, -2, -1, 0].map(k => { const g = addM(m, k); return { month: g.slice(0, 7), income: sum(led.filter(l => l.entry_type === 'income' && l.entry_date.slice(0, 7) === g.slice(0, 7)), l => l.amount), expense: sum(led.filter(l => l.entry_type === 'expense' && l.entry_date.slice(0, 7) === g.slice(0, 7)), l => l.amount) }; }),
      };
    },
    create_organization({ p_name, p_phone, p_address }) {
      const id = uid(); db.organizations.push({ id, name: p_name, phone: p_phone || null, address: p_address || null, plan_code: 'basic', billing_cycle: 'monthly', status: 'trial', trial_ends_at: addD(today(), 14) + 'T00:00:00Z', invoice_prefix: 'INV', receipt_prefix: 'RCP', default_due_day: 10, sms_enabled: false, whatsapp_enabled: false, created_at: now() });
      db.org_members.push({ org_id: id, user_id: me(), role: 'owner' }); return id;
    },
    add_org_member({ p_email }) { throw new Error(`ডেমোতে "${p_email}" যোগ করা যাবে না। আসল অ্যাকাউন্টে এখানে টিম মেম্বার যোগ হবে।`); },
    remove_org_member() { return null; },
    link_my_tenant_records() { return 0; },
    submit_subscription_payment({ p_org, p_plan, p_cycle, p_method, p_trx }) {
      const pl = db.plans.find(p => p.code === p_plan); const id = uid();
      if (db.subscription_payments.some(s => s.trx_id === p_trx.toUpperCase() && s.method === p_method)) throw new Error('duplicate key');
      db.subscription_payments.push({ id, org_id: p_org, plan_code: p_plan, billing_cycle: p_cycle, amount: p_cycle === 'yearly' ? pl.yearly_price : pl.monthly_price, method: p_method, trx_id: p_trx.toUpperCase(), status: 'pending', created_at: now() }); return id;
    },
    admin_overview() {
      return { customers: db.organizations.length, active: db.organizations.filter(o => o.status === 'active' && Date.parse(o.current_period_end) > Date.now()).length, trial: db.organizations.filter(o => o.status === 'trial').length,
        expired: db.organizations.filter(o => !writable(o.id)).length, pending_payments: db.subscription_payments.filter(s => s.status === 'pending').length,
        revenue_month: db.subscription_payments.filter(s => s.status === 'approved' && s.reviewed_at >= mStart(today())).reduce((a, s) => a + s.amount, 0),
        revenue_total: db.subscription_payments.filter(s => s.status === 'approved').reduce((a, s) => a + s.amount, 0), units: db.units.length + 140, queued_messages: db.notification_outbox.filter(x => x.status === 'queued').length };
    },
    admin_customers() {
      const owners = { 'org-1': USERS.owner.email, 'org-2': 'greenview@example.com', 'org-3': 'chowdhury@example.com' };
      return db.organizations.map(o => ({ ...o, owner_email: owners[o.id] || '—', units: o.id === 'org-1' ? db.units.length : o.id === 'org-2' ? 96 : 12, tenants: o.id === 'org-1' ? db.tenants.length : o.id === 'org-2' ? 88 : 9, writable: writable(o.id) }));
    },
    admin_review_subscription({ p_id, p_approve, p_note }) {
      const s = db.subscription_payments.find(x => x.id === p_id); s.status = p_approve ? 'approved' : 'rejected'; s.reviewed_at = now(); s.review_note = p_note || null;
      if (p_approve) { const o = db.organizations.find(x => x.id === s.org_id); const from = Math.max(Date.now(), o.status === 'active' ? Date.parse(o.current_period_end) : 0); o.plan_code = s.plan_code; o.billing_cycle = s.billing_cycle; o.status = 'active'; o.current_period_end = new Date(from + (s.billing_cycle === 'yearly' ? 365 : 30) * 864e5).toISOString(); }
      return null;
    },
    admin_update_org({ p_org, p_status, p_plan, p_cycle, p_period_end, p_trial_end }) { Object.assign(db.organizations.find(o => o.id === p_org), { status: p_status, plan_code: p_plan, billing_cycle: p_cycle, current_period_end: p_period_end, trial_ends_at: p_trial_end }); return null; },
    admin_save_plan(a) { const p = db.plans.find(x => x.code === a.p_code) || (db.plans.push({ code: a.p_code }), db.plans.at(-1)); Object.assign(p, { name: a.p_name, name_bn: a.p_name_bn, monthly_price: Number(a.p_monthly), yearly_price: Number(a.p_yearly), max_units: a.p_max_units, features: a.p_features, active: a.p_active }); return null; },
    admin_save_settings(a) { Object.assign(db.platform_settings[0], { trial_days: a.p_trial_days, grace_days: a.p_grace_days, bkash_number: a.p_bkash, nagad_number: a.p_nagad, rocket_number: a.p_rocket, bank_details: a.p_bank, support_phone: a.p_support }); return null; },
    export_org_data({ p_org }) { const out = { exported_at: now() }; ['properties', 'buildings', 'units', 'tenants', 'leases', 'utility_bills', 'invoices', 'invoice_items', 'payments', 'ledger_entries'].forEach(t => out[t] = db[t].filter(r => r.org_id === p_org)); out.organization = db.organizations.find(o => o.id === p_org); return out; },
  };

  // Seed history: utilities, three months of invoices and payments, expenses.
  (function history() {
    const saved = session; session = { user: { id: USERS.owner.id } };
    const cur = mStart(today());
    [-2, -1, 0].forEach(k => {
      const per = addM(cur, k);
      db.leases.forEach((l, i) => { if (i % 2 === 0) db.utility_bills.push({ id: uid(), org_id: 'org-1', unit_id: l.unit_id, kind: 'electricity', period: per, prev_reading: 1000 + i * 40 + (k + 2) * 120, curr_reading: 1120 + i * 40 + (k + 2) * 120, rate: 8.5, amount: 1020, invoice_id: null, created_at: now() }); });
      rpcs.generate_monthly_invoices({ p_org: 'org-1', p_period: per });
      db.invoices.filter(i => i.period === per).forEach((inv, j) => {
        const paidOn = addD(per, 3 + (j % 9));
        if (k < 0 && !(k === -1 && j === 4)) rpcs.record_payment({ p_invoice: inv.id, p_amount: inv.subtotal, p_method: ['cash', 'bkash', 'nagad', 'bank'][j % 4], p_paid_on: paidOn > today() ? today() : paidOn });
        else if (k === 0 && j < 5) rpcs.record_payment({ p_invoice: inv.id, p_amount: inv.subtotal, p_method: ['bkash', 'cash'][j % 2], p_paid_on: today() < addD(per, 2 + j) ? today() : addD(per, 2 + j) });
        else if (k === 0 && j === 5) rpcs.record_payment({ p_invoice: inv.id, p_amount: Math.round(inv.subtotal / 2), p_method: 'cash', p_paid_on: today() });
      });
      [['মেরামত', 6500], ['বিদ্যুৎ (কমন)', 3200], ['দারোয়ানের বেতন', 9000], ['পরিষ্কার-পরিচ্ছন্নতা', 2500]].forEach(([c, a], i) =>
        db.ledger_entries.push({ id: uid(), org_id: 'org-1', entry_type: 'expense', category: c, amount: a + (k + 2) * 300, entry_date: addD(per, 4 + i * 5) > today() ? today() : addD(per, 4 + i * 5), property_id: 'p-1', payment_id: null, description: null, created_at: now() }));
    });
    [-5, -4, -3].forEach(kk => { const pp = addM(cur, kk); db.ledger_entries.push({ id: uid(), org_id: 'org-1', entry_type: 'income', category: 'ভাড়া আদায়', amount: 128000 + kk * 3000, entry_date: addD(pp, 9), property_id: 'p-1', payment_id: 'hist' + kk, description: 'পূর্বের হিসাব', created_at: now() }); db.ledger_entries.push({ id: uid(), org_id: 'org-1', entry_type: 'expense', category: 'রক্ষণাবেক্ষণ', amount: 21000 - kk * 900, entry_date: addD(pp, 12), property_id: 'p-1', payment_id: null, description: null, created_at: now() }); });
    db.notification_outbox.forEach((n, i) => { if (i < db.notification_outbox.length - 6) { n.status = 'sent'; n.sent_at = n.created_at; } });
    db.audit_log = [];
    session = saved;
  })();

  // ---- Query builder ----
  function query(table) {
    const st = { table, op: 'select', filters: [], order: null, limit: null, payload: null, single: false, maybe: false, returning: false };
    const api = {
      select() { if (st.op !== 'select') st.returning = true; return api; },
      insert(p) { st.op = 'insert'; st.payload = p; return api; }, update(p) { st.op = 'update'; st.payload = p; return api; },
      upsert(p) { st.op = 'upsert'; st.payload = p; return api; }, delete() { st.op = 'delete'; return api; },
      eq(c, v) { st.filters.push(r => String(r[c]) === String(v)); return api; }, neq(c, v) { st.filters.push(r => String(r[c]) !== String(v)); return api; },
      in(c, v) { st.filters.push(r => v.map(String).includes(String(r[c]))); return api; }, gte(c, v) { st.filters.push(r => r[c] >= v); return api; }, lte(c, v) { st.filters.push(r => r[c] <= v); return api; },
      lt(c, v) { st.filters.push(r => r[c] < v); return api; }, is(c, v) { st.filters.push(r => (r[c] ?? null) === v); return api; },
      order(c, o = {}) { st.order = [c, o.ascending !== false]; return api; }, limit(k) { st.limit = k; return api; },
      single() { st.single = true; return api; }, maybeSingle() { st.single = true; st.maybe = true; return api; },
      then(res, rej) { return Promise.resolve().then(exec).then(res, rej); },
    };
    function exec() {
      try {
        const rows = db[table]; if (!rows) return fail('unknown table ' + table);
        if (st.op === 'select') {
          let out = visible(table).filter(r => st.filters.every(f => f(r)));
          if (st.order) { const [c, asc] = st.order; out = [...out].sort((a, b) => (a[c] > b[c] ? 1 : a[c] < b[c] ? -1 : 0) * (asc ? 1 : -1)); }
          if (st.limit) out = out.slice(0, st.limit);
          out = out.map(r => ({ ...r }));
          if (st.single) return out.length ? { data: out[0], error: null } : (st.maybe ? { data: null, error: null } : fail('not found'));
          return { data: out, error: null };
        }
        if (!me()) return fail('permission denied');
        const orgOf = r => r.org_id;
        if (st.op === 'insert' || st.op === 'upsert') {
          const list = (Array.isArray(st.payload) ? st.payload : [st.payload]).map(p => ({ id: uid(), created_at: now(), ...p }));
          for (const r of list) {
            if (table === 'profiles') continue;
            if (table === 'ledger_entries' ? !(memberOrgs().includes(orgOf(r)) && writable(orgOf(r))) : !canManage(orgOf(r))) return fail('new row violates row-level security policy');
            if (table === 'units') { const o = db.organizations.find(x => x.id === r.org_id); const max = db.plans.find(p => p.code === o.plan_code)?.max_units; if (max && db.units.filter(u => u.org_id === r.org_id).length >= max) return fail(`আপনার প্যাকেজে সর্বোচ্চ ${max} টি ইউনিট রাখা যায়। প্যাকেজ আপগ্রেড করুন।`); r.status = r.status || 'vacant'; }
            if (table === 'leases') { r.status = r.status || 'active'; if (r.status === 'active' && db.leases.some(l => l.unit_id === r.unit_id && l.status === 'active')) return fail('এই ইউনিটে আগে থেকেই একজন সক্রিয় ভাড়াটিয়া আছে।'); }
            if (table === 'utility_bills') { if ((!r.amount || Number(r.amount) === 0) && r.curr_reading != null && r.prev_reading != null && r.rate != null) r.amount = Math.round((r.curr_reading - r.prev_reading) * r.rate * 100) / 100; if (db.utility_bills.some(u => u.unit_id === r.unit_id && u.kind === r.kind && u.period === r.period)) return fail('duplicate key'); }
            if (table === 'invoice_items') { const inv = db.invoices.find(i => i.id === r.invoice_id); if (['paid', 'void'].includes(inv.status)) return fail('পরিশোধিত বা বাতিল ইনভয়েস পরিবর্তন করা যাবে না'); }
            if (table === 'tenants') r.active = r.active ?? true;
            if (table === 'ledger_entries') r.payment_id = null;
          }
          rows.push(...list);
          if (table === 'invoice_items') list.forEach(r => recalc(r.invoice_id));
          if (table === 'leases') syncUnits();
          const out = list.map(r => ({ ...r }));
          return { data: st.single ? out[0] : out, error: null };
        }
        const targets = rows.filter(r => st.filters.every(f => f(r))).filter(r => table === 'profiles' || table === 'organizations' ? true : (table === 'ledger_entries' ? memberOrgs().includes(r.org_id) && !r.payment_id : canManage(r.org_id)));
        if (st.op === 'update') { targets.forEach(r => Object.assign(r, st.payload)); if (table === 'leases') syncUnits(); return { data: st.single ? targets[0] : targets, error: null }; }
        if (st.op === 'delete') {
          for (const r of targets) {
            if (table === 'units' && db.leases.some(l => l.unit_id === r.id)) return fail('এই ইউনিটে ভাড়াটিয়ার রেকর্ড আছে। আগে চুক্তি শেষ করুন।');
            if (table === 'tenants' && db.leases.some(l => l.tenant_id === r.id)) return fail('এই ভাড়াটিয়ার চুক্তি/ইনভয়েস আছে, তাই মুছে ফেলা যাবে না। নিষ্ক্রিয় করুন।');
          }
          db[table] = rows.filter(r => !targets.includes(r)); return { data: null, error: null };
        }
      } catch (e) { return fail(e.message); }
    }
    return api;
  }

  if (role === 'owner-new') { db.org_members = [{ org_id: 'org-3', user_id: USERS.owner.id, role: 'owner' }]; Object.assign(db.organizations.find(o => o.id === 'org-3'), { name: 'নতুন বাড়িওয়ালা', status: 'trial', trial_ends_at: addD(today(), 14) + 'T00:00:00Z' }); }
  return {
    demo: true,
    from: query,
    rpc: async (name, args = {}) => { try { if (!me() && name !== 'plans') return fail('লগইন করুন'); const f = rpcs[name]; if (!f) return fail('unknown function ' + name); return { data: f(args), error: null }; } catch (e) { return fail(e.message); } },
    auth: {
      getSession: async () => ({ data: { session }, error: null }),
      getUser: async () => ({ data: { user: session?.user || null }, error: null }),
      onAuthStateChange: cb => { listeners.push(cb); return { data: { subscription: { unsubscribe() {} } } }; },
      signInWithPassword: async () => fail('ডেমো মোডে নিচের "ডেমো দেখুন" বাটন ব্যবহার করুন।'),
      signUp: async () => fail('ডেমো মোডে নতুন অ্যাকাউন্ট খোলা যায় না।'),
      resetPasswordForEmail: async () => ({ data: {}, error: null }),
      updateUser: async () => ({ data: {}, error: null }),
      signOut: async () => { session = null; listeners.forEach(cb => cb('SIGNED_OUT', null)); return { error: null }; },
    },
  };
}
