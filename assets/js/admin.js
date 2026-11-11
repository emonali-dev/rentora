// Super Admin (SIDDIQIYA Technology): customers, subscriptions, payment verification, plans, platform settings.
import { getClient, exitDemo, html, raw, $, $$, n, tk, dateBn, LABEL, chip, icon, run, formSheet, confirmSheet, field, opts, initTheme, toggleTheme, poweredBy, demoBanner, bnDigits, toast , langButton } from './core.js';

initTheme(); demoBanner();
const db = await getClient();
const { data: { session } } = await db.auth.getSession();
if (!session) location.replace('login.html');
$('#themeBtn').innerHTML = String(icon('moon')); $('#themeBtn').onclick = toggleTheme; { const lb = langButton(); $('#themeBtn').before(lb); }
$('#logoutBtn').onclick = async () => { await db.auth.signOut(); exitDemo(); location.replace('login.html'); };
const { data: adm } = await db.from('platform_admins').select('user_id').eq('user_id', session.user.id);
let tab = location.hash.slice(1) || 'overview';
const TABS = { overview: 'সারসংক্ষেপ', customers: 'গ্রাহক', payments: 'পেমেন্ট যাচাই', plans: 'প্যাকেজ', settings: 'সেটিংস' };
const iso = v => v ? String(v).slice(0, 10) : '';

if (!adm?.length) {
  $('#view').innerHTML = String(html`<div class="empty"><h2>অনুমতি নেই</h2><p>এই পাতা শুধু SIDDIQIYA Technology-র Super Admin-দের জন্য।</p><a class="btn" href="app.html">ড্যাশবোর্ডে ফিরে যান</a></div>`);
} else draw();

async function draw() {
  const v = $('#view');
  v.innerHTML = String(html`<div class="toolbar"><div class="seg" id="tabs">${Object.entries(TABS).map(([k, t]) => html`<button type="button" data-t="${k}" aria-pressed="${k === tab}">${t}</button>`)}</div></div><div id="body"></div>
    <p class="small muted" style="text-align:center;margin-top:2rem">বাসা ম্যানেজার · ${poweredBy()}</p>`);
  $$('#tabs button').forEach(b => b.onclick = () => { tab = b.dataset.t; history.replaceState(null, '', '#' + tab); draw(); });
  await ({ overview, customers, payments, plans, settings })[tab]();
}

async function overview() {
  const s = await run(db.rpc('admin_overview'));
  $('#body').innerHTML = String(html`
    <section class="ledger-hero"><div class="row"><div><div class="label">এ মাসের সাবস্ক্রিপশন আয়</div><div class="big num">${tk(s.revenue_month)}</div></div><div class="of">মোট আয় ${tk(s.revenue_total)}</div></div></section>
    <div class="stats" style="margin-top:1rem">
      <div class="stat"><b class="num">${n(s.customers)}</b><span>মোট গ্রাহক</span></div><div class="stat"><b class="num">${n(s.active)}</b><span>পেইড ও চালু</span></div>
      <div class="stat"><b class="num">${n(s.trial)}</b><span>ট্রায়ালে</span></div><div class="stat ${s.expired ? 'warn' : ''}"><b class="num">${n(s.expired)}</b><span>মেয়াদ শেষ/স্থগিত</span></div>
      <a class="stat ${s.pending_payments ? 'warn' : ''}" href="#payments" data-go="payments" style="text-decoration:none;color:inherit"><b class="num">${n(s.pending_payments)}</b><span>যাচাই বাকি পেমেন্ট</span></a>
      <div class="stat"><b class="num">${n(s.units)}</b><span>মোট ইউনিট</span></div><div class="stat"><b class="num">${n(s.queued_messages)}</b><span>পাঠানোর অপেক্ষায় বার্তা</span></div></div>`);
  $('[data-go]').onclick = e => { e.preventDefault(); tab = 'payments'; draw(); };
}

async function customers() {
  const rows = await run(db.rpc('admin_customers'));
  const { data: planRows } = await db.from('plans').select('*').order('sort');
  let q = '';
  const paint = () => {
    const list = rows.filter(r => !q || (r.name + (r.owner_email || '') + (r.phone || '')).toLowerCase().includes(q));
    $('#ctable').innerHTML = String(html`<table class="t"><thead><tr><th>গ্রাহক</th><th>প্যাকেজ</th><th>অবস্থা</th><th>মেয়াদ</th><th class="r">ইউনিট</th><th class="r">ভাড়াটিয়া</th><th></th></tr></thead><tbody>
      ${list.map(r => html`<tr><td><b>${r.name}</b><div class="small muted">${r.owner_email} ${r.phone ? '· ' + bnDigits(r.phone) : ''}</div></td>
        <td>${planRows.find(p => p.code === r.plan_code)?.name_bn} <span class="small muted">${r.billing_cycle === 'yearly' ? 'বার্ষিক' : 'মাসিক'}</span></td>
        <td>${r.writable ? chip(r.status) : chip('suspended', r.status === 'suspended' ? 'স্থগিত' : 'মেয়াদ শেষ')}</td>
        <td>${dateBn(r.status === 'trial' ? r.trial_ends_at : r.current_period_end)}</td><td class="r num">${n(r.units)}</td><td class="r num">${n(r.tenants)}</td>
        <td><button class="btn sm" data-edit="${r.id}">পরিবর্তন</button></td></tr>`)}</tbody></table>`);
    $$('[data-edit]').forEach(b => b.onclick = () => editOrg(rows.find(r => r.id === b.dataset.edit), planRows));
  };
  $('#body').innerHTML = String(html`<div class="toolbar"><input class="input grow" type="search" id="cs" placeholder="নাম, ইমেইল বা মোবাইল দিয়ে খুঁজুন"></div><section class="panel"><div class="table-wrap" id="ctable"></div></section>`);
  $('#cs').oninput = e => { q = e.target.value.trim().toLowerCase(); paint(); };
  paint();
}
function editOrg(r, planRows) {
  formSheet({ title: r.name, submit: 'সংরক্ষণ করুন', fields: html`
    <div class="grid-2">${field('অবস্থা', html`<select class="input" name="status">${opts({ trial: 'ট্রায়াল', active: 'চালু (পেইড)', suspended: 'স্থগিত', cancelled: 'বাতিল' }, r.status)}</select>`)}
      ${field('প্যাকেজ', html`<select class="input" name="plan">${opts(Object.fromEntries(planRows.map(p => [p.code, p.name_bn])), r.plan_code)}</select>`)}</div>
    <div class="grid-2">${field('বিলিং', html`<select class="input" name="cycle">${opts({ monthly: 'মাসিক', yearly: 'বার্ষিক' }, r.billing_cycle)}</select>`)}
      ${field('ট্রায়াল শেষ', html`<input class="input" type="date" name="trial" value="${iso(r.trial_ends_at)}">`)}</div>
    ${field('পেইড মেয়াদ শেষ', html`<input class="input" type="date" name="period" value="${iso(r.current_period_end)}">`, 'স্থগিত করলে গ্রাহক তথ্য দেখতে পারবেন, কিন্তু নতুন কিছু যোগ করতে পারবেন না।')}`,
    onSubmit: async v => {
      const d = x => x ? new Date(x + 'T23:59:59+06:00').toISOString() : null;
      if (v.status === 'active' && !v.period) throw new Error('চালু করলে পেইড মেয়াদ শেষের তারিখ দিন।');
      await run(db.rpc('admin_update_org', { p_org: r.id, p_status: v.status, p_plan: v.plan, p_cycle: v.cycle, p_period_end: d(v.period), p_trial_end: d(v.trial) }), 'সংরক্ষণ হয়েছে'); draw();
    } });
}

async function payments() {
  const [{ data: rows }, { data: orgs }, { data: planRows }] = await Promise.all([db.from('subscription_payments').select('*').order('created_at', { ascending: false }).limit(200), db.from('organizations').select('id,name'), db.from('plans').select('*')]);
  const pend = rows.filter(r => r.status === 'pending'), done = rows.filter(r => r.status !== 'pending');
  const row = r => html`<div class="list-row"><div><div class="title">${orgs.find(o => o.id === r.org_id)?.name}</div>
    <div class="sub">${planRows.find(p => p.code === r.plan_code)?.name_bn} · ${r.billing_cycle === 'yearly' ? 'বার্ষিক' : 'মাসিক'} · ${LABEL.method[r.method]} · TrxID <b>${r.trx_id}</b> · ${dateBn(r.created_at)}</div></div>
    <div class="right"><b class="num">${tk(r.amount)}</b>${r.status === 'pending' ? html`<div style="display:flex;gap:.4rem"><button class="btn sm danger" data-rej="${r.id}">বাতিল</button><button class="btn sm primary" data-ok="${r.id}">অনুমোদন</button></div>` : chip(r.status)}</div></div>`;
  $('#body').innerHTML = String(html`<section class="panel"><h2 style="margin-bottom:.3rem">যাচাই বাকি (${n(pend.length)})</h2><p class="small muted" style="margin-bottom:.6rem">বিকাশ/নগদ অ্যাপে ট্রানজেকশন আইডি ও টাকার অঙ্ক মিলিয়ে তারপর অনুমোদন দিন। অনুমোদনে গ্রাহকের মেয়াদ নিজে থেকে বাড়বে।</p>
    ${pend.length ? html`<div class="list">${pend.map(row)}</div>` : html`<p class="muted">কোনো পেমেন্ট যাচাইয়ের অপেক্ষায় নেই।</p>`}</section>
    <section class="panel"><h3 style="margin-bottom:.4rem">আগের পেমেন্ট</h3>${done.length ? html`<div class="list">${done.map(row)}</div>` : html`<p class="muted">কিছু নেই।</p>`}</section>`);
  $$('[data-ok]').forEach(b => b.onclick = async () => { if (await confirmSheet('ট্রানজেকশন মিলিয়ে দেখেছেন? অনুমোদন দিলে গ্রাহকের সাবস্ক্রিপশন চালু হবে।', 'অনুমোদন দিন', false)) { await run(db.rpc('admin_review_subscription', { p_id: b.dataset.ok, p_approve: true, p_note: null }), 'অনুমোদন হয়েছে'); draw(); } });
  $$('[data-rej]').forEach(b => b.onclick = () => formSheet({ title: 'পেমেন্ট বাতিল', submit: 'বাতিল করুন', fields: html`${field('কারণ', html`<input class="input" name="note" required maxlength="300" placeholder="যেমন: ট্রানজেকশন আইডি পাওয়া যায়নি">`)}`,
    onSubmit: async v => { await run(db.rpc('admin_review_subscription', { p_id: b.dataset.rej, p_approve: false, p_note: v.note }), 'বাতিল হয়েছে'); draw(); } }));
}

async function plans() {
  const { data: rows } = await db.from('plans').select('*').order('sort');
  $('#body').innerHTML = String(html`<div class="toolbar"><p class="muted grow">দাম বদলালে নতুন পেমেন্টে নতুন দাম ধরা হবে। চলমান গ্রাহকের মেয়াদে কোনো প্রভাব পড়বে না।</p><button class="btn primary" id="addP">${icon('plus')}নতুন প্যাকেজ</button></div>
    <div class="plans">${rows.map(p => html`<div class="plan"><div style="display:flex;justify-content:space-between;align-items:center"><h3>${p.name_bn}</h3>${chip(p.active ? 'active' : 'void', p.active ? 'চালু' : 'বন্ধ')}</div>
      <div class="price num">${tk(p.monthly_price)}<span class="small muted"> / মাস</span></div><div class="muted num">${tk(p.yearly_price)} / বছর · ${p.max_units ? n(p.max_units) + 'টি ইউনিট' : 'আনলিমিটেড'}</div>
      <ul>${(p.features || []).map(f => html`<li>${f}</li>`)}</ul><button class="btn" data-p="${p.code}">সম্পাদনা</button></div>`)}</div>`);
  $$('[data-p]').forEach(b => b.onclick = () => planSheet(rows.find(p => p.code === b.dataset.p)));
  $('#addP').onclick = () => planSheet({ active: true, features: [] });
}
function planSheet(p) {
  formSheet({ title: p.code ? 'প্যাকেজ সম্পাদনা' : 'নতুন প্যাকেজ', fields: html`
    <div class="grid-3">${field('কোড', html`<input class="input" name="code" required pattern="[a-z0-9_]{2,30}" value="${p.code || ''}" ${p.code ? raw('readonly') : ''}>`, 'ছোট হাতের ইংরেজি')}${field('নাম (English)', html`<input class="input" name="name" required value="${p.name || ''}">`)}${field('নাম (বাংলা)', html`<input class="input" name="name_bn" required value="${p.name_bn || ''}">`)}</div>
    <div class="grid-3">${field('মাসিক দাম (৳)', html`<input class="input" name="monthly" type="number" min="0" required value="${p.monthly_price ?? ''}">`)}${field('বার্ষিক দাম (৳)', html`<input class="input" name="yearly" type="number" min="0" required value="${p.yearly_price ?? ''}">`)}${field('সর্বোচ্চ ইউনিট', html`<input class="input" name="max" type="number" min="1" value="${p.max_units ?? ''}">`, 'খালি = আনলিমিটেড')}</div>
    ${field('সুবিধা (প্রতি লাইনে একটি)', html`<textarea class="input" name="features">${(p.features || []).join('\n')}</textarea>`)}
    <label style="display:flex;gap:.5rem;align-items:center"><input type="checkbox" name="active" ${p.active ? raw('checked') : ''}> নতুন গ্রাহকদের জন্য চালু</label>`,
    onSubmit: async v => { await run(db.rpc('admin_save_plan', { p_code: v.code, p_name: v.name, p_name_bn: v.name_bn, p_monthly: Number(v.monthly), p_yearly: Number(v.yearly), p_max_units: v.max ? Number(v.max) : null,
      p_features: v.features.split('\n').map(s => s.trim()).filter(Boolean), p_active: !!v.active }), 'সংরক্ষণ হয়েছে'); draw(); } });
}

async function settings() {
  const { data } = await db.from('platform_settings').select('*').limit(1); const s = data[0];
  $('#body').innerHTML = String(html`<section class="panel" style="max-width:720px"><h2 style="margin-bottom:.8rem">প্ল্যাটফর্ম সেটিংস</h2><form class="form" id="sf">
    <div class="grid-2">${field('ফ্রি ট্রায়াল (দিন)', html`<input class="input" name="trial" type="number" min="0" max="90" required value="${s.trial_days}">`)}${field('মেয়াদ শেষের পর সুযোগ (দিন)', html`<input class="input" name="grace" type="number" min="0" max="30" required value="${s.grace_days}">`)}</div>
    <div class="grid-3">${field('বিকাশ নম্বর', html`<input class="input" name="bkash" value="${s.bkash_number || ''}">`)}${field('নগদ নম্বর', html`<input class="input" name="nagad" value="${s.nagad_number || ''}">`)}${field('রকেট নম্বর', html`<input class="input" name="rocket" value="${s.rocket_number || ''}">`)}</div>
    ${field('ব্যাংক তথ্য', html`<textarea class="input" name="bank">${s.bank_details || ''}</textarea>`)}${field('সাপোর্ট মোবাইল', html`<input class="input" name="support" value="${s.support_phone || ''}">`)}
    <button class="btn primary" style="justify-self:start">সংরক্ষণ করুন</button></form></section>`);
  $('#sf').onsubmit = async e => { e.preventDefault(); const v = Object.fromEntries(new FormData(e.target));
    await run(db.rpc('admin_save_settings', { p_trial_days: Number(v.trial), p_grace_days: Number(v.grace), p_bkash: v.bkash, p_nagad: v.nagad, p_rocket: v.rocket, p_bank: v.bank, p_support: v.support }), 'সংরক্ষণ হয়েছে'); };
}
