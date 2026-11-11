// Rentora owner dashboard (landlord, manager, accountant).
import { getClient, IS_DEMO, exitDemo, html, raw, esc, $, $$, n, tk, monthLabel, shortMonth, dateBn, todayISO, monthStart, addMonths, LABEL, chip, icon,
  toast, run, errText, openSheet, formSheet, confirmSheet, field, opts, initTheme, toggleTheme, poweredBy, demoBanner, download, printDoc, bnDigits, langButton } from './core.js';

initTheme(); demoBanner();
const S = { db: null, user: null, orgs: [], org: null, role: null, month: monthStart(), d: {}, settings: {}, plans: [] };
const view = () => $('#view');

const NAV = [
  { id: 'home', t: 'ড্যাশবোর্ড', i: 'home' },
  { id: 'property', t: 'সম্পত্তি ও ইউনিট', short: 'সম্পত্তি', i: 'building' },
  { id: 'tenants', t: 'ভাড়াটিয়া', i: 'users' },
  { id: 'bills', t: 'ইনভয়েস ও বিল', short: 'বিল', i: 'receipt' },
  { id: 'money', t: 'আয়-ব্যয়', i: 'wallet' },
  { id: 'reports', t: 'লাভ-ক্ষতি রিপোর্ট', short: 'রিপোর্ট', i: 'chart' },
  { id: 'messages', t: 'SMS ও WhatsApp', i: 'message' },
  { id: 'plan', t: 'সাবস্ক্রিপশন', i: 'crown' },
  { id: 'settings', t: 'সেটিংস', i: 'settings' },
];
const can = { manage: () => ['owner', 'manager'].includes(S.role), owner: () => S.role === 'owner' };

// ---------------- Boot ----------------
async function boot() {
  S.db = await getClient();
  const { data: { session } } = await S.db.auth.getSession();
  if (!session) { location.replace('login.html'); return; }
  S.user = session.user;
  S.db.auth.onAuthStateChange((ev) => { if (ev === 'SIGNED_OUT') location.replace('login.html'); });
  const { data: admin } = await S.db.from('platform_admins').select('user_id').eq('user_id', S.user.id);
  const { data: members, error } = await S.db.from('org_members').select('*').eq('user_id', S.user.id);
  if (error) { view().innerHTML = String(html`<div class="empty"><p>${errText(error)}</p></div>`); return; }
  if (!members.length) {
    if (admin?.length) { location.replace('admin.html'); return; }
    const { data: linked } = await S.db.rpc('link_my_tenant_records');
    const { data: myT } = await S.db.from('tenants').select('id').eq('user_id', S.user.id);
    if (linked > 0 || myT?.length) { location.replace('tenant.html'); return; }
    return onboarding();
  }
  const ids = members.map(m => m.org_id);
  const { data: orgs } = await S.db.from('organizations').select('*').in('id', ids);
  S.orgs = orgs; S.members = members;
  let saved = null; try { saved = localStorage.getItem('rentora_org'); } catch {}
  await selectOrg(orgs.find(o => o.id === saved)?.id || orgs[0].id);
  const sw = $('#orgSwitch');
  if (orgs.length > 1) { sw.hidden = false; sw.innerHTML = String(opts(Object.fromEntries(orgs.map(o => [o.id, o.name])), S.org.id)); sw.onchange = () => selectOrg(sw.value).then(route); }
  if (admin?.length) S.isAdmin = true;
  chrome();
  window.addEventListener('hashchange', route);
  route();
}

async function selectOrg(id) {
  S.org = S.orgs.find(o => o.id === id); S.role = S.members.find(m => m.org_id === id).role;
  try { localStorage.setItem('rentora_org', id); } catch {}
  await loadAll();
}
async function fetchAll(table, order = 'created_at') {
  let out = [], from = 0;
  for (;;) {
    let q = S.db.from(table).select('*').eq('org_id', S.org.id).order(order, { ascending: true });
    if (q.range) q = q.range(from, from + 999);
    const { data, error } = await q; if (error) throw error;
    out = out.concat(data); if (!q.range || data.length < 1000) break; from += 1000;
  }
  return out;
}
async function loadAll() {
  const [properties, buildings, units, tenants, leases, invoices, payments] = await Promise.all(
    ['properties', 'buildings', 'units', 'tenants', 'leases', 'invoices', 'payments'].map(t => fetchAll(t)));
  Object.assign(S.d, { properties, buildings, units, tenants, leases, invoices, payments });
  const [{ data: org }, { data: st }, { data: plans }] = await Promise.all([
    S.db.from('organizations').select('*').eq('id', S.org.id).single(), S.db.from('platform_settings').select('*').limit(1), S.db.from('plans').select('*').order('sort')]);
  if (org) { S.org = org; S.orgs = S.orgs.map(o => o.id === org.id ? org : o); }
  S.settings = st?.[0] || {}; S.plans = plans || [];
}
const refresh = async () => { await loadAll(); route(); };

// ---------------- Chrome ----------------
function chrome() {
  const name = S.user.user_metadata?.full_name || S.user.email;
  $('#sideUser').innerHTML = String(html`<div style="color:#fff;font-weight:600">${name}</div><div style="color:#bcd8ca">${LABEL.role[S.role]} · ${S.org.name}</div>`);
  $('#sidePowered').innerHTML = String(poweredBy());
  $('#themeBtn').innerHTML = String(icon('moon')); $('#themeBtn').onclick = toggleTheme;
  if (!$('#langBtn')) { const lb = langButton(); lb.id = 'langBtn'; $('#themeBtn').before(lb); }
  $('#fab').innerHTML = String(html`${icon('cash')}<span>ভাড়া আদায় করুন</span>`); $('#fab').setAttribute('aria-label', 'ভাড়া আদায় করুন'); $('#fab').onclick = () => paymentSheet();
  $('#payBtnTop').innerHTML = String(html`${icon('cash')}<span>ভাড়া আদায় করুন</span>`); $('#payBtnTop').onclick = () => paymentSheet();
  $('#payBtnTop').hidden = matchMedia('(max-width: 900px)').matches;
  trialBar();
}
function navRender(cur) {
  $('#sideNav').innerHTML = NAV.map(x => String(html`<a href="#${x.id}" ${x.id === cur ? raw('aria-current="page"') : ''}>${icon(x.i)}<span>${x.t}</span></a>`)).join('')
    + String(html`<a href="#" id="logoutLink">${icon('logout')}<span>লগ আউট</span></a>`);
  $('#logoutLink').onclick = e => { e.preventDefault(); logout(); };
  const bot = [NAV[0], NAV[1], null, NAV[2], { id: 'more', t: 'আরও', i: 'more' }];
  $('#bottomNav').innerHTML = bot.map(x => x ? String(html`<a href="#${x.id}" ${(x.id === cur || (x.id === 'more' && !['home', 'property', 'tenants'].includes(cur))) ? raw('aria-current="page"') : ''}>${icon(x.i)}<span>${x.short || x.t}</span></a>`) : String(html`<span class="spacer" aria-hidden="true">আদায় করুন</span>`)).join('');
  $('#bottomNav a[href="#more"]').onclick = e => { e.preventDefault(); moreSheet(); };
}
function moreSheet() {
  const d = openSheet({ title: 'আরও', body: html`<div class="list">${NAV.slice(3).map(x => html`<a class="list-row click" href="#${x.id}" style="text-decoration:none;color:inherit"><span style="display:flex;gap:.7rem;align-items:center">${icon(x.i)}<b>${x.t}</b></span><span></span></a>`)}
    <button class="list-row click" id="mLogout" style="border:0;background:none;text-align:left;width:100%"><span style="display:flex;gap:.7rem;align-items:center">${icon('logout')}<b>লগ আউট</b></span><span></span></button></div>
    <p class="small muted" style="margin-top:1rem;text-align:center">${poweredBy()}</p>` });
  $$('a', d).forEach(a => a.addEventListener('click', () => d.close()));
  $('#mLogout', d).onclick = logout;
}
async function logout() { await S.db.auth.signOut(); exitDemo(); location.replace('login.html'); }
function writable() {
  const g = (S.settings.grace_days ?? 3) * 864e5, o = S.org;
  return (o.status === 'trial' && Date.parse(o.trial_ends_at) + g > Date.now()) || (o.status === 'active' && Date.parse(o.current_period_end) + g > Date.now());
}
function trialBar() {
  const o = S.org, bar = $('#trialBar'); const days = d => Math.ceil((Date.parse(d) - Date.now()) / 864e5);
  if (!writable()) { bar.className = 'trial-bar expired'; bar.hidden = false; bar.innerHTML = String(html`<b>সাবস্ক্রিপশনের মেয়াদ শেষ।</b><span>তথ্য দেখা যাবে, কিন্তু নতুন কিছু যোগ করা যাবে না।</span><a class="btn sm gold" href="#plan">নবায়ন করুন</a>`); return; }
  if (o.status === 'trial') { bar.className = 'trial-bar'; bar.hidden = false; bar.innerHTML = String(html`<span>ফ্রি ট্রায়ালের <b>${n(Math.max(0, days(o.trial_ends_at)))} দিন</b> বাকি।</span><a class="link-btn" href="#plan">প্যাকেজ বেছে নিন</a>`); return; }
  const left = days(o.current_period_end);
  if (left <= 5) { bar.className = 'trial-bar'; bar.hidden = false; bar.innerHTML = String(html`<span>সাবস্ক্রিপশন <b>${n(Math.max(0, left))} দিনের</b> মধ্যে শেষ হবে।</span><a class="link-btn" href="#plan">নবায়ন করুন</a>`); return; }
  bar.hidden = true;
}

// ---------------- Lookups ----------------
const by = (arr, id) => arr.find(x => x.id === id);
const U = id => by(S.d.units, id), T = id => by(S.d.tenants, id), B = id => by(S.d.buildings, id), PR = id => by(S.d.properties, id);
const unitName = (u, withBld = true) => { if (!u) return '—'; const p = u.parent_unit_id ? U(u.parent_unit_id) : null; return (withBld ? (B(u.building_id)?.name + ' · ') : '') + (p ? p.name + ' › ' : '') + u.name; };
const activeLease = unitId => S.d.leases.find(l => l.unit_id === unitId && l.status === 'active');
const leaseOfTenant = tid => S.d.leases.find(l => l.tenant_id === tid && l.status === 'active');
const due = i => Number(i.subtotal) - Number(i.paid_amount);
const isOverdue = i => ['unpaid', 'partial'].includes(i.status) && i.due_date < todayISO();
const invStatus = i => isOverdue(i) ? 'overdue' : i.status;
const openInvoices = () => S.d.invoices.filter(i => ['unpaid', 'partial'].includes(i.status));
const guard = () => { if (!writable()) { toast('সাবস্ক্রিপশনের মেয়াদ শেষ। নবায়ন করুন।', true); return false; } if (!can.manage()) { toast('এই কাজের অনুমতি শুধু মালিক ও ম্যানেজারের।', true); return false; } return true; };

// ---------------- Router ----------------
const ROUTES = { home: pageHome, property: pageProperty, tenants: pageTenants, bills: pageBills, money: pageMoney, reports: pageReports, messages: pageMessages, plan: pagePlan, settings: pageSettings };
async function route() {
  const id = (location.hash.slice(1) || 'home').split('/')[0];
  const r = ROUTES[id] ? id : 'home';
  navRender(r);
  $('#pageTitle').textContent = NAV.find(x => x.id === r).t;
  document.title = NAV.find(x => x.id === r).t + ' — Rentora';
  trialBar();
  try { await ROUTES[r](); } catch (e) { console.error(e); view().innerHTML = String(html`<div class="empty"><p>${errText(e)}</p><button class="btn" onclick="location.reload()">আবার চেষ্টা করুন</button></div>`); }
}
const monthPicker = (id = 'monthSel') => html`<div class="seg" role="group" aria-label="মাস">
  <button type="button" data-m="-1" aria-label="আগের মাস">‹</button><button type="button" aria-pressed="true" id="${id}" style="min-width:9.5rem">${monthLabel(S.month)}</button><button type="button" data-m="1" aria-label="পরের মাস">›</button></div>`;
function wireMonth(el, cb) { $$('[data-m]', el).forEach(b => b.onclick = () => { S.month = addMonths(S.month, Number(b.dataset.m)); cb(); }); }
const emptyState = (ic, title, text, btn) => html`<div class="empty"><div class="art">${icon(ic, 'icon" style="width:34px;height:34px')}</div><h3>${title}</h3><p>${text}</p>${btn || ''}</div>`;

// ---------------- Home ----------------
async function pageHome() {
  const { data: s } = await S.db.rpc('dashboard_summary', { p_org: S.org.id, p_month: S.month });
  const m = S.month, inv = S.d.invoices.filter(i => i.period === m && i.status !== 'void');
  const pct = s.invoiced > 0 ? Math.min(100, Math.round(s.collected / s.invoiced * 100)) : 0;
  const maxBar = Math.max(1, ...s.trend.map(t => Math.max(t.income, t.expense)));
  const leasesNoInv = S.d.leases.filter(l => l.status === 'active' && l.start_date <= addMonths(m, 1) && !inv.some(i => i.lease_id === l.id));
  // ledger tiles grouped by building (top-level units and rooms)
  const groups = S.d.buildings.map(b => ({ b, units: S.d.units.filter(u => u.building_id === b.id).sort((a, c) => a.name.localeCompare(c.name, 'bn', { numeric: true })) })).filter(g => g.units.length);
  const tile = u => {
    const l = activeLease(u.id), i = l && inv.find(x => x.lease_id === l.id);
    let st = 'vacant', a = u.status === 'maintenance' ? 'মেরামত চলছে' : 'খালি', who = u.status === 'maintenance' ? '' : 'ভাড়াটিয়া নেই';
    if (l) { who = T(l.tenant_id)?.full_name; if (!i) { st = 'unbilled'; a = 'ইনভয়েস হয়নি'; } else if (i.status === 'paid') { st = 'paid'; a = 'পরিশোধিত ' + tk(i.subtotal); } else { st = i.status === 'partial' ? 'partial' : 'due'; a = 'বকেয়া ' + tk(due(i)); } }
    return html`<button class="tile ${st}" data-unit="${u.id}" type="button"><span class="u">${u.parent_unit_id ? U(u.parent_unit_id)?.name + ' › ' : ''}${u.name}</span><span class="t">${who}</span><span class="a num">${a}</span></button>`;
  };
  const recent = [...S.d.payments].sort((a, b) => (b.paid_on + b.created_at).localeCompare(a.paid_on + a.created_at)).slice(0, 6);
  const steps = [
    ['বাড়ি বা মার্কেট যোগ করুন', S.d.properties.length > 0, '#property'],
    ['ফ্ল্যাট, দোকান বা রুম যোগ করুন', S.d.units.length > 0, '#property'],
    ['ভাড়াটিয়া বসান', S.d.leases.some(l => l.status === 'active'), '#tenants'],
    ['প্রথম ইনভয়েস তৈরি করুন', S.d.invoices.length > 0, '#bills'],
    ['প্রথম ভাড়া আদায় করুন', S.d.payments.length > 0, null],
  ];
  const doneN = steps.filter(x => x[1]).length, nextStep = steps.find(x => !x[1]);
  const guide = doneN < steps.length && can.manage() ? html`<section class="panel start-guide"><div class="panel-head"><div><h2>শুরু করার ধাপ</h2><p class="muted small">${n(steps.length)}টির মধ্যে ${n(doneN)}টি সম্পন্ন — বাকিগুলো করলেই Rentora পুরোপুরি কাজ শুরু করবে।</p></div>
      <div class="meter" style="background:var(--surface-2);width:160px"><i style="width:${doneN / steps.length * 100}%"></i></div></div>
    <ol class="steps-list">${steps.map(([t, ok, href]) => html`<li class="${ok ? 'done' : (nextStep && nextStep[0] === t ? 'next' : '')}">${ok ? html`<span>${t}</span>` : href ? html`<a href="${href}">${t}</a>` : html`<button type="button" class="link-btn" data-pay-first>${t}</button>`}</li>`)}</ol></section>` : '';
  view().innerHTML = String(html`
    ${guide}
    <div class="toolbar">${monthPicker()}<span class="grow"></span>
      ${leasesNoInv.length && can.manage() ? html`<button class="btn primary" id="genBtn">${icon('receipt')}${monthLabel(m)}-এর ${n(leasesNoInv.length)}টি ইনভয়েস তৈরি করুন</button>` : ''}</div>
    <section class="ledger-hero" aria-label="এই মাসের আদায়">
      <div class="row"><div><div class="label">${monthLabel(m)}-এ আদায় হয়েছে</div><div class="big num">${tk(s.collected)}</div></div>
        <div class="of">মোট বিল ${tk(s.invoiced)} · ${n(pct)}%</div></div>
      <div class="meter" role="meter" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${pct}" aria-label="আদায়ের হার"><i style="width:${pct}%"></i></div>
      <div class="hero-figs"><div><span class="label">এই মাসের বকেয়া</span><b class="num">${tk(s.month_due)}</b></div><div><span class="label">মোট বকেয়া</span><b class="num">${tk(s.total_due)}</b></div>
        <div><span class="label">এ মাসের খরচ</span><b class="num">${tk(s.expense)}</b></div><div><span class="label">নিট আয়</span><b class="num">${tk(s.income - s.expense)}</b></div></div>
    </section>
    <div class="stats" style="margin-top:1rem">
      <a class="stat ${s.overdue_count ? 'warn' : ''}" href="#bills" style="text-decoration:none;color:inherit"><b class="num">${n(s.overdue_count)}</b><span>মেয়াদোত্তীর্ণ ইনভয়েস</span></a>
      <div class="stat"><b class="num">${n(s.occupied)}/${n(s.units)}</b><span>ইউনিট ভাড়া দেওয়া</span></div>
      <div class="stat"><b class="num">${n(s.vacant)}</b><span>খালি ইউনিট</span></div>
      <div class="stat"><b class="num">${n(s.tenants)}</b><span>সক্রিয় ভাড়াটিয়া</span></div>
    </div>
    <div class="cols" style="margin-top:1rem">
      <section class="panel"><div class="panel-head"><h2>ভাড়ার খাতা — ${monthLabel(m)}</h2>
        <div class="legend"><span><i style="background:var(--paid)"></i>পরিশোধিত</span><span><i style="background:var(--partial)"></i>আংশিক</span><span><i style="background:var(--due)"></i>বকেয়া</span><span><i style="background:var(--gold)"></i>ইনভয়েস হয়নি</span><span><i style="background:var(--vacant)"></i>খালি</span></div></div>
        ${groups.length ? groups.map(g => html`<div class="group-title">${PR(g.b.property_id)?.name} · ${g.b.name}</div><div class="khata">${g.units.map(tile)}</div>`)
          : emptyState('building', 'এখনো কোনো ইউনিট নেই', 'প্রথমে আপনার বাড়ি, ভবন আর ফ্ল্যাট যোগ করুন। তারপর প্রতিটি ফ্ল্যাটের ভাড়ার অবস্থা এখানে দেখা যাবে।', html`<a class="btn primary" href="#property">${icon('plus')}সম্পত্তি যোগ করুন</a>`)}
      </section>
      <div class="stack">
        <section class="panel"><div class="panel-head"><h3>আয় বনাম খরচ</h3><div class="legend"><span><i style="background:var(--paid)"></i>আয়</span><span><i style="background:var(--gold)"></i>খরচ</span></div></div>
          ${maxBar <= 1 ? html`<p class="muted" style="padding:2.5rem 0;text-align:center">ভাড়া আদায় বা খরচ লিখলে গত ৬ মাসের হিসাব এখানে দেখা যাবে।</p>` : ''}<div class="bars" ${maxBar <= 1 ? raw('hidden') : ''}>${s.trend.map(t => html`<div class="m" title="${monthLabel(t.month + '-01')}: আয় ${tk(t.income)}, খরচ ${tk(t.expense)}"><div class="pair"><i class="inc" style="height:${t.income / maxBar * 100}%"></i><i class="exp" style="height:${t.expense / maxBar * 100}%"></i></div><small>${shortMonth(t.month + '-01')}</small></div>`)}</div></section>
        <section class="panel"><div class="panel-head"><h3>সাম্প্রতিক আদায়</h3><a class="link-btn small" href="#bills">সব দেখুন</a></div>
          ${recent.length ? html`<div class="list">${recent.map(p => { const i = by(S.d.invoices, p.invoice_id); return html`<div class="list-row click" data-receipt="${p.id}"><div><div class="title">${T(p.tenant_id)?.full_name}</div><div class="sub">${unitName(U(i?.unit_id), false)} · ${LABEL.method[p.method]} · ${dateBn(p.paid_on)}</div></div><div class="right"><b class="num">${tk(p.amount)}</b></div></div>`; })}</div>`
            : html`<p class="muted">এখনো কোনো ভাড়া আদায় হয়নি।</p>`}</section>
      </div>
    </div>`);
  wireMonth(view(), pageHome);
  $('#genBtn')?.addEventListener('click', generateInvoices);
  $('[data-pay-first]')?.addEventListener('click', () => paymentSheet());
  $$('[data-unit]').forEach(b => b.onclick = () => unitSheet(b.dataset.unit));
  $$('[data-receipt]').forEach(r => r.onclick = () => receiptSheet(r.dataset.receipt));
}
async function generateInvoices() {
  if (!guard()) return;
  const c = await run(S.db.rpc('generate_monthly_invoices', { p_org: S.org.id, p_period: S.month }));
  toast(c ? `${monthLabel(S.month)}-এর ${n(c)}টি ইনভয়েস তৈরি হয়েছে` : 'নতুন কোনো ইনভয়েস তৈরির দরকার নেই');
  await refresh();
}

// ---------------- Unit sheet (from ledger tile) ----------------
function unitSheet(unitId) {
  const u = U(unitId), l = activeLease(unitId), t = l && T(l.tenant_id);
  const invs = l ? S.d.invoices.filter(i => i.lease_id === l.id && i.status !== 'void').sort((a, b) => b.period.localeCompare(a.period)) : [];
  const d = openSheet({ title: unitName(u), body: html`
    <dl class="kv"><dt>ধরন</dt><dd>${LABEL.kind[u.kind]}</dd><dt>ভাড়া</dt><dd class="num">${tk(l?.monthly_rent ?? u.rent_amount)}</dd><dt>অবস্থা</dt><dd>${chip(u.status)}</dd>
      ${t ? html`<dt>ভাড়াটিয়া</dt><dd>${t.full_name}</dd><dt>মোবাইল</dt><dd><a href="tel:${t.phone}">${bnDigits(t.phone)}</a></dd><dt>চুক্তি শুরু</dt><dd>${dateBn(l.start_date)}</dd><dt>জামানত</dt><dd class="num">${tk(l.security_deposit)}</dd>` : ''}</dl>
    ${invs.length ? html`<h3 style="margin:1.2rem 0 .3rem">ইনভয়েস</h3><div class="list">${invs.slice(0, 6).map(i => html`<div class="list-row click" data-inv="${i.id}"><div><div class="title">${monthLabel(i.period)}</div><div class="sub">${i.invoice_no}</div></div><div class="right"><b class="num">${tk(i.subtotal)}</b>${chip(invStatus(i))}</div></div>`)}</div>` : ''}`,
    foot: l ? html`<button class="btn" data-tenant="${t.id}">ভাড়াটিয়ার বিস্তারিত</button>${invs.some(i => i.status !== 'paid') ? html`<button class="btn gold" data-pay>${icon('cash')}ভাড়া আদায় করুন</button>` : ''}`
      : (can.manage() && u.status !== 'maintenance' ? html`<button class="btn primary" data-lease>${icon('plus')}ভাড়াটিয়া বসান</button>` : '') });
  $$('[data-inv]', d).forEach(r => r.onclick = () => { d.close(); invoiceSheet(r.dataset.inv); });
  $('[data-tenant]', d)?.addEventListener('click', () => { d.close(); tenantSheet(t.id); });
  $('[data-pay]', d)?.addEventListener('click', () => { d.close(); paymentSheet(invs.find(i => i.status !== 'paid').id); });
  $('[data-lease]', d)?.addEventListener('click', () => { d.close(); leaseSheet({ unitId }); });
}

// ---------------- Property tree ----------------
async function pageProperty() {
  const props = S.d.properties;
  view().innerHTML = String(html`
    <div class="toolbar"><p class="muted grow">বাড়ি › ভবন › ফ্ল্যাট/দোকান › রুম — এভাবে আপনার সব সম্পত্তি সাজিয়ে রাখুন।</p>${can.manage() ? html`<button class="btn primary" id="addProp">${icon('plus')}নতুন সম্পত্তি</button>` : ''}</div>
    ${props.length ? props.map(p => { const blds = S.d.buildings.filter(b => b.property_id === p.id); return html`
      <section class="tree-prop"><header><div><h2>${p.name}</h2><div class="muted small">${LABEL.propKind[p.kind]}${p.address ? ' · ' + p.address : ''}</div></div>
        ${can.manage() ? html`<div style="display:flex;gap:.4rem;flex-wrap:wrap"><button class="btn sm" data-edit-prop="${p.id}">সম্পাদনা</button><button class="btn sm primary" data-add-bld="${p.id}">${icon('plus')}ভবন</button></div>` : ''}</header>
        ${blds.length ? blds.map(b => { const top = S.d.units.filter(u => u.building_id === b.id && !u.parent_unit_id).sort((x, y) => x.name.localeCompare(y.name, 'bn', { numeric: true })); return html`
          <div class="tree-bld"><header><div><h3>${b.name}</h3><span class="muted small">${b.floors ? n(b.floors) + ' তলা · ' : ''}${n(S.d.units.filter(u => u.building_id === b.id).length)}টি ইউনিট</span></div>
            ${can.manage() ? html`<div style="display:flex;gap:.4rem;flex-wrap:wrap"><button class="btn sm" data-edit-bld="${b.id}">সম্পাদনা</button><button class="btn sm primary" data-add-unit="${b.id}">${icon('plus')}ইউনিট</button></div>` : ''}</header>
            ${top.length ? html`<div class="units">${top.map(u => { const rooms = S.d.units.filter(r => r.parent_unit_id === u.id); const l = activeLease(u.id); return html`
              <div class="unit-card"><div style="display:flex;justify-content:space-between;gap:.5rem;align-items:center"><span><b>${u.name}</b> <span class="muted small">${LABEL.kind[u.kind]}</span></span>${chip(u.status)}</div>
                <span class="muted small">${u.floor ? 'তলা ' + u.floor + ' · ' : ''}ভাড়া <span class="num">${tk(u.rent_amount)}</span></span>
                <span class="small">${l ? T(l.tenant_id)?.full_name : ''}</span>
                ${rooms.length || (can.manage() && u.kind === 'flat') ? html`<div class="rooms">${rooms.map(r => html`<button type="button" data-unit-open="${r.id}">${r.name} ${r.status === 'occupied' ? '●' : '○'}</button>`)}${can.manage() && u.kind === 'flat' ? html`<button type="button" data-add-room="${u.id}">+ রুম</button>` : ''}</div>` : ''}
                <div style="display:flex;gap:.4rem;margin-top:.3rem;flex-wrap:wrap"><button class="btn sm" data-unit-open="${u.id}">দেখুন</button>${can.manage() ? html`<button class="btn sm ghost" data-edit-unit="${u.id}">সম্পাদনা</button>` : ''}</div></div>`; })}</div>`
              : html`<p class="muted small">এই ভবনে এখনো কোনো ফ্ল্যাট বা দোকান যোগ করা হয়নি।</p>`}
          </div>`; }) : html`<div class="tree-bld"><p class="muted">এই সম্পত্তিতে একটি ভবন যোগ করুন। একটিমাত্র বাড়ি হলে ভবনের নাম "মূল ভবন" দিতে পারেন।</p></div>`}
      </section>`; }) : emptyState('building', 'আপনার প্রথম সম্পত্তি যোগ করুন', 'বাড়ি বা মার্কেটের নাম ও ঠিকানা দিন। এরপর ভবন, ফ্ল্যাট, দোকান ও রুম যোগ করতে পারবেন।', can.manage() ? html`<button class="btn primary" id="addProp2">${icon('plus')}সম্পত্তি যোগ করুন</button>` : '')}`);
  $('#addProp')?.addEventListener('click', () => propSheet()); $('#addProp2')?.addEventListener('click', () => propSheet());
  $$('[data-edit-prop]').forEach(b => b.onclick = () => propSheet(by(S.d.properties, b.dataset.editProp)));
  $$('[data-add-bld]').forEach(b => b.onclick = () => bldSheet({ property_id: b.dataset.addBld }));
  $$('[data-edit-bld]').forEach(b => b.onclick = () => bldSheet(B(b.dataset.editBld)));
  $$('[data-add-unit]').forEach(b => b.onclick = () => unitEditSheet({ building_id: b.dataset.addUnit }));
  $$('[data-add-room]').forEach(b => b.onclick = () => { const p = U(b.dataset.addRoom); unitEditSheet({ building_id: p.building_id, parent_unit_id: p.id, kind: 'room' }); });
  $$('[data-edit-unit]').forEach(b => b.onclick = () => unitEditSheet(U(b.dataset.editUnit)));
  $$('[data-unit-open]').forEach(b => b.onclick = () => unitSheet(b.dataset.unitOpen));
}
function delBtn(id) { return can.owner() && id ? html`<button type="button" class="btn danger sm" data-del style="margin-right:auto">মুছে ফেলুন</button>` : ''; }
function wireDelete(d, table, id, label) {
  $('[data-del]', d)?.addEventListener('click', async () => {
    if (!await confirmSheet(`"${label}" মুছে ফেলবেন? এর ভেতরের সব তথ্যও মুছে যাবে।`, 'মুছে ফেলুন')) return;
    await run(S.db.from(table).delete().eq('id', id), 'মুছে ফেলা হয়েছে'); d.close(); refresh();
  });
}
function propSheet(p = {}) {
  if (!guard()) return;
  const d = formSheet({ title: p.id ? 'সম্পত্তি সম্পাদনা' : 'নতুন সম্পত্তি', fields: html`
    ${field('নাম', html`<input class="input" name="name" required maxlength="120" value="${p.name || ''}" placeholder="যেমন: রহমান ভিলা">`)}
    ${field('ঠিকানা', html`<input class="input" name="address" maxlength="300" value="${p.address || ''}" placeholder="রোড, এলাকা, শহর">`)}
    ${field('ধরন', html`<select class="input" name="kind">${opts(LABEL.propKind, p.kind || 'residential')}</select>`)}
    ${delBtn(p.id)}`,
    onSubmit: async v => { const row = { name: v.name.trim(), address: v.address.trim() || null, kind: v.kind };
      await run(p.id ? S.db.from('properties').update(row).eq('id', p.id) : S.db.from('properties').insert({ ...row, org_id: S.org.id }), 'সংরক্ষণ হয়েছে'); refresh(); } });
  wireDelete(d, 'properties', p.id, p.name);
}
function bldSheet(b = {}) {
  if (!guard()) return;
  const d = formSheet({ title: b.id ? 'ভবন সম্পাদনা' : 'নতুন ভবন', fields: html`
    ${field('ভবনের নাম', html`<input class="input" name="name" required maxlength="120" value="${b.name || ''}" placeholder="যেমন: ভবন A বা মূল ভবন">`)}
    ${field('মোট তলা', html`<input class="input" name="floors" type="number" min="1" max="200" value="${b.floors || ''}">`)}
    ${delBtn(b.id)}`,
    onSubmit: async v => { const row = { name: v.name.trim(), floors: v.floors ? Number(v.floors) : null };
      await run(b.id ? S.db.from('buildings').update(row).eq('id', b.id) : S.db.from('buildings').insert({ ...row, property_id: b.property_id, org_id: S.org.id }), 'সংরক্ষণ হয়েছে'); refresh(); } });
  wireDelete(d, 'buildings', b.id, b.name);
}
function unitEditSheet(u = {}) {
  if (!guard()) return;
  const kinds = u.parent_unit_id || u.kind === 'room' ? { room: 'রুম' } : { flat: 'ফ্ল্যাট', shop: 'দোকান', office: 'অফিস', garage: 'গ্যারেজ', room: 'রুম (আলাদা)', other: 'অন্যান্য' };
  const d = formSheet({ title: u.id ? 'ইউনিট সম্পাদনা' : (u.parent_unit_id ? `${U(u.parent_unit_id).name}-এ নতুন রুম` : 'নতুন ইউনিট'), fields: html`
    <div class="grid-2">${field('ধরন', html`<select class="input" name="kind">${opts(kinds, u.kind || 'flat')}</select>`)}
      ${field('নাম/নম্বর', html`<input class="input" name="name" required maxlength="60" value="${u.name || ''}" placeholder="যেমন: 2A বা রুম ১">`)}</div>
    <div class="grid-2">${field('মাসিক ভাড়া (৳)', html`<input class="input" name="rent_amount" type="number" min="0" step="1" required value="${u.rent_amount ?? ''}">`)}
      ${field('তলা', html`<input class="input" name="floor" maxlength="20" value="${u.floor || ''}">`)}</div>
    <div class="grid-2">${field('বেডরুম', html`<input class="input" name="bedrooms" type="number" min="0" max="50" value="${u.bedrooms ?? ''}">`)}
      ${field('আয়তন (বর্গফুট)', html`<input class="input" name="size_sqft" type="number" min="1" value="${u.size_sqft ?? ''}">`)}</div>
    ${u.id ? field('অবস্থা', html`<select class="input" name="status">${opts(activeLease(u.id) ? { occupied: 'ভাড়া দেওয়া' } : { vacant: 'খালি', maintenance: 'মেরামত চলছে' }, u.status)}</select>`) : ''}
    ${delBtn(u.id)}`,
    onSubmit: async v => {
      const row = { kind: v.kind, name: v.name.trim(), rent_amount: Number(v.rent_amount), floor: v.floor.trim() || null, bedrooms: v.bedrooms ? Number(v.bedrooms) : null, size_sqft: v.size_sqft ? Number(v.size_sqft) : null };
      if (v.status) row.status = v.status;
      await run(u.id ? S.db.from('units').update(row).eq('id', u.id) : S.db.from('units').insert({ ...row, building_id: u.building_id, parent_unit_id: u.parent_unit_id || null, org_id: S.org.id }), 'সংরক্ষণ হয়েছে'); refresh(); } });
  wireDelete(d, 'units', u.id, u.name);
}

// ---------------- Tenants ----------------
async function pageTenants() {
  let q = '', filter = 'active';
  const draw = () => {
    const list = S.d.tenants.filter(t => (filter === 'all' || (filter === 'active' ? t.active : !t.active)) && (!q || (t.full_name + t.phone + (t.email || '')).toLowerCase().includes(q)))
      .sort((a, b) => a.full_name.localeCompare(b.full_name, 'bn'));
    $('#tList').innerHTML = list.length ? String(html`<div class="list">${list.map(t => { const l = leaseOfTenant(t.id); const d = S.d.invoices.filter(i => i.tenant_id === t.id && ['unpaid', 'partial'].includes(i.status)).reduce((s, i) => s + due(i), 0);
      return html`<div class="list-row click" data-t="${t.id}"><div><div class="title">${t.full_name}</div><div class="sub">${l ? unitName(U(l.unit_id)) : 'কোনো ইউনিটে নেই'} · ${bnDigits(t.phone)}</div></div>
        <div class="right">${d > 0 ? html`<b class="num" style="color:var(--due)">বকেয়া ${tk(d)}</b>` : html`<span class="chip paid">বকেয়া নেই</span>`}</div></div>`; })}</div>`)
      : String(emptyState('users', q ? 'কাউকে পাওয়া যায়নি' : 'এখনো কোনো ভাড়াটিয়া নেই', q ? 'নাম বা মোবাইল নম্বর আবার লিখে দেখুন।' : 'ভাড়াটিয়ার নাম, মোবাইল আর NID দিয়ে যোগ করুন, তারপর তাকে একটি ফ্ল্যাটে বসান।'));
    $$('[data-t]').forEach(r => r.onclick = () => tenantSheet(r.dataset.t));
  };
  view().innerHTML = String(html`<div class="toolbar"><input class="input grow" id="tSearch" type="search" placeholder="নাম বা মোবাইল দিয়ে খুঁজুন" aria-label="খুঁজুন">
    <div class="seg" id="tFilter"><button type="button" data-f="active" aria-pressed="true">সক্রিয়</button><button type="button" data-f="inactive">পুরনো</button><button type="button" data-f="all">সব</button></div>
    ${can.manage() ? html`<button class="btn primary" id="addT">${icon('plus')}নতুন ভাড়াটিয়া</button>` : ''}</div><section class="panel" id="tList"></section>`);
  $('#tSearch').oninput = e => { q = e.target.value.trim().toLowerCase(); draw(); };
  $$('#tFilter button').forEach(b => b.onclick = () => { filter = b.dataset.f; $$('#tFilter button').forEach(x => x.setAttribute('aria-pressed', x === b)); draw(); });
  $('#addT')?.addEventListener('click', () => tenantEditSheet());
  draw();
}
function tenantEditSheet(t = {}, after) {
  if (!guard()) return;
  const dlg = formSheet({ title: t.id ? 'ভাড়াটিয়ার তথ্য সম্পাদনা' : 'নতুন ভাড়াটিয়া', fields: html`
    <div class="grid-2">${field('পুরো নাম', html`<input class="input" name="full_name" required minlength="2" maxlength="120" value="${t.full_name || ''}">`)}
      ${field('মোবাইল', html`<input class="input" name="phone" required inputmode="tel" pattern="\\+?[0-9 \\-]{6,20}" value="${t.phone || ''}" placeholder="01XXXXXXXXX">`)}</div>
    <div class="grid-2">${field('ইমেইল', html`<input class="input" name="email" type="email" value="${t.email || ''}">`, 'দিলে ভাড়াটিয়া এই ইমেইলে লগইন করে নিজের বিল ও রসিদ দেখতে পারবেন।')}
      ${field('জাতীয় পরিচয়পত্র (NID)', html`<input class="input" name="nid_number" inputmode="numeric" pattern="[0-9]{10,17}" value="${t.nid_number || ''}">`)}</div>
    <div class="grid-2">${field('পেশা', html`<input class="input" name="occupation" maxlength="120" value="${t.occupation || ''}">`)}
      ${field('পরিবারের সদস্য', html`<input class="input" name="family_members" type="number" min="1" max="50" value="${t.family_members ?? ''}">`)}</div>
    ${field('স্থায়ী ঠিকানা', html`<input class="input" name="address" maxlength="300" value="${t.address || ''}">`)}
    <div class="grid-2">${field('জরুরি যোগাযোগ (নাম)', html`<input class="input" name="emergency_name" maxlength="120" value="${t.emergency_name || ''}">`)}
      ${field('জরুরি মোবাইল', html`<input class="input" name="emergency_phone" inputmode="tel" pattern="\\+?[0-9 \\-]{6,20}" value="${t.emergency_phone || ''}">`)}</div>
    ${field('নোট', html`<textarea class="input" name="notes" maxlength="1000">${t.notes || ''}</textarea>`)}
    ${t.id && can.owner() && !S.d.leases.some(l => l.tenant_id === t.id) && !S.d.invoices.some(i => i.tenant_id === t.id) ? html`<button type="button" class="btn danger sm" data-del style="justify-self:start">ভাড়াটিয়া মুছে ফেলুন</button>` : ''}`,
    onSubmit: async v => {
      const row = { full_name: v.full_name.trim(), phone: v.phone.trim(), email: v.email.trim() || null, nid_number: v.nid_number.trim() || null, occupation: v.occupation.trim() || null,
        family_members: v.family_members ? Number(v.family_members) : null, address: v.address.trim() || null, emergency_name: v.emergency_name.trim() || null, emergency_phone: v.emergency_phone.trim() || null, notes: v.notes.trim() || null };
      const res = await run(t.id ? S.db.from('tenants').update(row).eq('id', t.id) : S.db.from('tenants').insert({ ...row, org_id: S.org.id }).select().single(), 'সংরক্ষণ হয়েছে');
      await loadAll(); if (after) after(res?.id || t.id); else route();
    } });
  if (t.id) wireDelete(dlg, 'tenants', t.id, t.full_name);
}
function tenantSheet(id) {
  const t = T(id), l = leaseOfTenant(id), invs = S.d.invoices.filter(i => i.tenant_id === id && i.status !== 'void').sort((a, b) => b.period.localeCompare(a.period));
  const pays = S.d.payments.filter(p => p.tenant_id === id).sort((a, b) => b.paid_on.localeCompare(a.paid_on));
  const totalDue = invs.filter(i => i.status !== 'paid').reduce((s, i) => s + due(i), 0);
  const d = openSheet({ wide: true, title: t.full_name, body: html`
    <div class="cols two">
      <dl class="kv"><dt>মোবাইল</dt><dd><a href="tel:${t.phone}">${bnDigits(t.phone)}</a></dd><dt>ইমেইল</dt><dd>${t.email || '—'}</dd><dt>NID</dt><dd>${t.nid_number ? bnDigits(t.nid_number) : '—'}</dd>
        <dt>পেশা</dt><dd>${t.occupation || '—'}</dd><dt>সদস্য</dt><dd>${t.family_members ? n(t.family_members) : '—'}</dd><dt>জরুরি</dt><dd>${t.emergency_name || '—'} ${t.emergency_phone ? bnDigits(t.emergency_phone) : ''}</dd>
        <dt>পোর্টাল</dt><dd>${t.user_id ? chip('active', 'লগইন করেছেন') : t.email ? chip('pending', 'আমন্ত্রণের অপেক্ষায়') : chip('void', 'ইমেইল নেই')}</dd></dl>
      <div class="panel" style="background:var(--surface-2)">${l ? html`<b>${unitName(U(l.unit_id))}</b><dl class="kv small" style="margin-top:.5rem"><dt>মাসিক ভাড়া</dt><dd class="num">${tk(l.monthly_rent)}</dd><dt>জামানত</dt><dd class="num">${tk(l.security_deposit)}</dd><dt>শুরু</dt><dd>${dateBn(l.start_date)}</dd><dt>ভাড়ার শেষ দিন</dt><dd>প্রতি মাসের ${n(l.due_day)} তারিখ</dd></dl>`
        : html`<p class="muted">এই ভাড়াটিয়া এখন কোনো ইউনিটে নেই।</p>`}
        <p style="margin-top:.8rem">মোট বকেয়া: <b class="num" style="color:${totalDue ? 'var(--due)' : 'var(--paid)'}">${tk(totalDue)}</b></p></div></div>
    <h3 style="margin:1.2rem 0 .3rem">ইনভয়েস</h3>
    ${invs.length ? html`<div class="table-wrap"><table class="t"><thead><tr><th>মাস</th><th>নম্বর</th><th class="r">মোট</th><th class="r">বকেয়া</th><th>অবস্থা</th></tr></thead><tbody>${invs.map(i => html`<tr class="click" data-inv="${i.id}"><td>${monthLabel(i.period)}</td><td>${i.invoice_no}</td><td class="r num">${tk(i.subtotal)}</td><td class="r num">${tk(due(i))}</td><td>${chip(invStatus(i))}</td></tr>`)}</tbody></table></div>` : html`<p class="muted">কোনো ইনভয়েস নেই।</p>`}
    ${pays.length ? html`<h3 style="margin:1.2rem 0 .3rem">রসিদ</h3><div class="list">${pays.slice(0, 8).map(p => html`<div class="list-row click" data-receipt="${p.id}"><div><div class="title">${p.receipt_no}</div><div class="sub">${dateBn(p.paid_on)} · ${LABEL.method[p.method]}</div></div><div class="right"><b class="num">${tk(p.amount)}</b></div></div>`)}</div>` : ''}`,
    foot: html`${can.manage() ? html`<button class="btn" data-edit>তথ্য সম্পাদনা</button>${l ? html`<button class="btn" data-editlease>চুক্তি সম্পাদনা</button><button class="btn danger" data-end>চুক্তি শেষ</button>` : html`<button class="btn primary" data-lease>ইউনিটে বসান</button>`}` : ''}
      ${totalDue > 0 ? html`<a class="btn" target="_blank" rel="noopener" href="${waLink(t.phone, `প্রিয় ${t.full_name}, আপনার মোট বকেয়া ৳${totalDue}। অনুগ্রহ করে দ্রুত পরিশোধ করুন। — ${S.org.name}`)}">WhatsApp রিমাইন্ডার</a><button class="btn gold" data-pay>${icon('cash')}ভাড়া আদায় করুন</button>` : ''}` });
  $$('[data-inv]', d).forEach(r => r.onclick = () => { d.close(); invoiceSheet(r.dataset.inv); });
  $$('[data-receipt]', d).forEach(r => r.onclick = () => { d.close(); receiptSheet(r.dataset.receipt); });
  $('[data-edit]', d)?.addEventListener('click', () => { d.close(); tenantEditSheet(t); });
  $('[data-lease]', d)?.addEventListener('click', () => { d.close(); leaseSheet({ tenantId: id }); });
  $('[data-end]', d)?.addEventListener('click', () => { d.close(); endLeaseSheet(l); });
  $('[data-editlease]', d)?.addEventListener('click', () => { d.close(); leaseEditSheet(l); });
  $('[data-pay]', d)?.addEventListener('click', () => { d.close(); paymentSheet(invs.find(i => i.status !== 'paid')?.id); });
}
function leaseSheet({ unitId, tenantId }) {
  if (!guard()) return;
  const freeUnits = S.d.units.filter(u => !activeLease(u.id) && u.status !== 'maintenance');
  const freeTenants = S.d.tenants.filter(t => t.active && !leaseOfTenant(t.id));
  if (!freeUnits.length) { toast('কোনো খালি ইউনিট নেই। আগে ইউনিট যোগ করুন বা কারো চুক্তি শেষ করুন।', true); return; }
  const unitOpts = Object.fromEntries(freeUnits.map(u => [u.id, `${unitName(u)} — ${tk(u.rent_amount)}`]));
  const tenOpts = { '': 'নির্বাচন করুন', __new: '+ নতুন ভাড়াটিয়া যোগ করুন', ...Object.fromEntries(freeTenants.map(t => [t.id, `${t.full_name} (${t.phone})`])) };
  const d = formSheet({ title: 'ভাড়াটিয়া বসান (চুক্তি শুরু)', submit: 'চুক্তি শুরু করুন', fields: html`
    ${field('ইউনিট', html`<select class="input" name="unit_id" required>${opts(unitOpts, unitId)}</select>`)}
    ${field('ভাড়াটিয়া', html`<select class="input" name="tenant_id" required>${opts(tenOpts, tenantId || '')}</select>`)}
    <div class="grid-2">${field('মাসিক ভাড়া (৳)', html`<input class="input" name="monthly_rent" type="number" min="0" required value="${(unitId ? U(unitId) : freeUnits[0]).rent_amount}">`)}
      ${field('জামানত/অগ্রিম (৳)', html`<input class="input" name="security_deposit" type="number" min="0" value="0">`)}</div>
    <div class="grid-2">${field('চুক্তি শুরুর তারিখ', html`<input class="input" name="start_date" type="date" required value="${todayISO()}">`)}
      ${field('প্রতি মাসে ভাড়া দেওয়ার শেষ তারিখ', html`<input class="input" name="due_day" type="number" min="1" max="28" required value="${S.org.default_due_day || 10}">`, '১ থেকে ২৮ এর মধ্যে')}</div>`,
    onSubmit: async v => {
      if (v.tenant_id === '__new' || !v.tenant_id) throw new Error('ভাড়াটিয়া নির্বাচন করুন');
      await run(S.db.from('leases').insert({ org_id: S.org.id, unit_id: v.unit_id, tenant_id: v.tenant_id, monthly_rent: Number(v.monthly_rent), security_deposit: Number(v.security_deposit || 0), start_date: v.start_date, due_day: Number(v.due_day), status: 'active' }), 'চুক্তি শুরু হয়েছে');
      await refresh();
    } });
  const uSel = $('[name=unit_id]', d), tSel = $('[name=tenant_id]', d);
  uSel.onchange = () => { $('[name=monthly_rent]', d).value = U(uSel.value).rent_amount; };
  tSel.onchange = () => { if (tSel.value === '__new') { const u = uSel.value; d.close(); tenantEditSheet({}, newId => leaseSheet({ unitId: u, tenantId: newId })); } };
}
function leaseEditSheet(l) {
  if (!guard()) return;
  formSheet({ title: 'চুক্তি সম্পাদনা — ' + unitName(U(l.unit_id)), fields: html`<p class="small muted">নতুন ভাড়া পরের ইনভয়েস থেকে কার্যকর হবে। আগের ইনভয়েস বদলাবে না।</p>
    <div class="grid-2">${field('মাসিক ভাড়া (৳)', html`<input class="input" name="monthly_rent" type="number" min="0" required value="${l.monthly_rent}">`)}
      ${field('জামানত/অগ্রিম (৳)', html`<input class="input" name="security_deposit" type="number" min="0" value="${l.security_deposit}">`)}</div>
    <div class="grid-2">${field('প্রতি মাসে ভাড়া দেওয়ার শেষ তারিখ', html`<input class="input" name="due_day" type="number" min="1" max="28" required value="${l.due_day}">`, '১ থেকে ২৮ এর মধ্যে')}
      ${field('চুক্তি শুরুর তারিখ', html`<input class="input" name="start_date" type="date" required value="${l.start_date}">`)}</div>
    ${field('নোট', html`<textarea class="input" name="notes" maxlength="1000">${l.notes || ''}</textarea>`)}`,
    onSubmit: async v => { await run(S.db.from('leases').update({ monthly_rent: Number(v.monthly_rent), security_deposit: Number(v.security_deposit || 0), due_day: Number(v.due_day), start_date: v.start_date, notes: v.notes.trim() || null }).eq('id', l.id), 'চুক্তি সংরক্ষণ হয়েছে'); await refresh(); } });
}
function endLeaseSheet(l) {
  if (!guard()) return;
  formSheet({ title: 'চুক্তি শেষ করুন', submit: 'চুক্তি শেষ করুন', fields: html`<p>${T(l.tenant_id).full_name} — ${unitName(U(l.unit_id))}। চুক্তি শেষ হলে ইউনিটটি খালি দেখাবে। পুরনো ইনভয়েস ও রসিদ থেকে যাবে।</p>
    ${field('শেষ তারিখ', html`<input class="input" name="end_date" type="date" required value="${todayISO()}" min="${l.start_date}">`)}
    <label style="display:flex;gap:.5rem;align-items:center"><input type="checkbox" name="deactivate" checked> ভাড়াটিয়াকে "পুরনো" তালিকায় সরান</label>`,
    onSubmit: async v => {
      await run(S.db.from('leases').update({ status: 'ended', end_date: v.end_date }).eq('id', l.id));
      if (v.deactivate) await run(S.db.from('tenants').update({ active: false }).eq('id', l.tenant_id));
      toast('চুক্তি শেষ হয়েছে'); await refresh();
    } });
}

// ---------------- Bills ----------------
async function pageBills() {
  let tab = (location.hash.split('/')[1]) || 'invoices', status = 'all';
  const draw = async () => {
    const m = S.month;
    $('#billBody').innerHTML = '';
    if (tab === 'invoices') {
      const list = S.d.invoices.filter(i => i.period === m && (status === 'all' || (status === 'overdue' ? isOverdue(i) : i.status === status)))
        .sort((a, b) => unitName(U(a.unit_id)).localeCompare(unitName(U(b.unit_id)), 'bn', { numeric: true }));
      const allOpen = openInvoices().filter(isOverdue);
      $('#billBody').innerHTML = String(html`
        <div class="toolbar"><div class="seg" id="stF">${Object.entries({ all: 'সব', unpaid: 'বকেয়া', partial: 'আংশিক', paid: 'পরিশোধিত', overdue: 'মেয়াদোত্তীর্ণ', void: 'বাতিল' }).map(([k, v]) => html`<button type="button" data-s="${k}" aria-pressed="${k === status}">${v}</button>`)}</div><span class="grow"></span>
          ${can.manage() ? html`<button class="btn primary" id="gen">${icon('receipt')}এ মাসের ইনভয়েস তৈরি</button>` : ''}</div>
        ${allOpen.length ? html`<p class="small" style="margin-bottom:.8rem;color:var(--due)">সব মাস মিলিয়ে ${n(allOpen.length)}টি ইনভয়েসের শেষ তারিখ পার হয়ে গেছে, মোট বকেয়া ${tk(allOpen.reduce((s, i) => s + due(i), 0))}।</p>` : ''}
        <section class="panel">${list.length ? html`<div class="table-wrap"><table class="t"><thead><tr><th>ইউনিট</th><th>ভাড়াটিয়া</th><th>নম্বর</th><th>শেষ তারিখ</th><th class="r">মোট</th><th class="r">বকেয়া</th><th>অবস্থা</th></tr></thead>
          <tbody>${list.map(i => html`<tr class="click" data-inv="${i.id}"><td><b>${unitName(U(i.unit_id))}</b></td><td>${T(i.tenant_id)?.full_name}</td><td>${i.invoice_no}</td><td>${dateBn(i.due_date)}</td><td class="r num">${tk(i.subtotal)}</td><td class="r num">${tk(due(i))}</td><td>${chip(invStatus(i))}</td></tr>`)}</tbody></table></div>`
          : emptyState('receipt', `${monthLabel(m)}-এ কোনো ইনভয়েস নেই`, 'চলমান চুক্তিগুলোর জন্য এক ক্লিকে এ মাসের ইনভয়েস তৈরি করুন। ভাড়ার সাথে এ মাসের বিদ্যুৎ, গ্যাস, পানির বিলও যোগ হবে।')}</section>`);
      $$('#stF button').forEach(b => b.onclick = () => { status = b.dataset.s; draw(); });
      $('#gen')?.addEventListener('click', generateInvoices);
      $$('[data-inv]').forEach(r => r.onclick = () => invoiceSheet(r.dataset.inv));
    } else {
      const { data: bills } = await S.db.from('utility_bills').select('*').eq('org_id', S.org.id).eq('period', m);
      const total = bills.reduce((s, b) => s + Number(b.amount), 0);
      $('#billBody').innerHTML = String(html`<div class="toolbar"><p class="muted grow">মিটার রিডিং আর ইউনিট রেট দিলে বিল নিজে থেকে হিসাব হবে। ইনভয়েস তৈরির সময় এ মাসের বিলগুলো ভাড়ার সাথে যোগ হয়ে যাবে।</p>
        ${can.manage() ? html`<button class="btn primary" id="addU">${icon('bolt')}বিল যোগ করুন</button>` : ''}</div>
        <section class="panel">${bills.length ? html`<div class="table-wrap"><table class="t"><thead><tr><th>ইউনিট</th><th>বিল</th><th>রিডিং</th><th class="r">রেট</th><th class="r">টাকা</th><th>ইনভয়েস</th><th></th></tr></thead>
          <tbody>${bills.sort((a, b) => unitName(U(a.unit_id)).localeCompare(unitName(U(b.unit_id)), 'bn', { numeric: true })).map(b => html`<tr><td><b>${unitName(U(b.unit_id))}</b></td><td>${LABEL.util[b.kind]}</td>
            <td class="num">${b.prev_reading != null ? n(b.prev_reading) + ' → ' + n(b.curr_reading) + ' (' + n(b.curr_reading - b.prev_reading) + ')' : '—'}</td><td class="r num">${b.rate != null ? n(b.rate) : '—'}</td><td class="r num">${tk(b.amount)}</td>
            <td>${b.invoice_id ? chip('approved', 'যুক্ত') : chip('pending', 'বাকি')}</td><td>${!b.invoice_id && can.manage() ? html`<button class="btn sm ghost danger" data-del-u="${b.id}">মুছুন</button>` : ''}</td></tr>`)}
            <tr><td colspan="4"><b>মোট</b></td><td class="r num"><b>${tk(total)}</b></td><td colspan="2"></td></tr></tbody></table></div>`
          : emptyState('bolt', `${monthLabel(m)}-এর কোনো ইউটিলিটি বিল নেই`, 'বিদ্যুৎ, গ্যাস, পানি, সার্ভিস চার্জ বা ইন্টারনেট বিল ইউনিট অনুযায়ী যোগ করুন।')}</section>`);
      $('#addU')?.addEventListener('click', () => utilitySheet());
      $$('[data-del-u]').forEach(b => b.onclick = async () => { if (await confirmSheet('এই বিলটি মুছে ফেলবেন?', 'মুছুন')) { await run(S.db.from('utility_bills').delete().eq('id', b.dataset.delU), 'মুছে ফেলা হয়েছে'); draw(); } });
    }
  };
  view().innerHTML = String(html`<div class="toolbar">${monthPicker()}<div class="seg" id="tabs"><button type="button" data-tab="invoices" aria-pressed="${tab === 'invoices'}">ইনভয়েস</button><button type="button" data-tab="utility" aria-pressed="${tab === 'utility'}">ইউটিলিটি বিল</button></div></div><div id="billBody"></div>`);
  wireMonth(view(), () => { $('#monthSel').textContent = monthLabel(S.month); draw(); });
  $$('#tabs button').forEach(b => b.onclick = () => { tab = b.dataset.tab; $$('#tabs button').forEach(x => x.setAttribute('aria-pressed', x === b)); history.replaceState(null, '', '#bills/' + tab); draw(); });
  await draw();
}
function utilitySheet() {
  if (!guard()) return;
  const units = S.d.units.filter(u => activeLease(u.id)).sort((a, b) => unitName(a).localeCompare(unitName(b), 'bn', { numeric: true }));
  if (!units.length) { toast('ভাড়া দেওয়া কোনো ইউনিট নেই।', true); return; }
  const d = formSheet({ title: `${monthLabel(S.month)}-এর ইউটিলিটি বিল`, submit: 'বিল যোগ করুন', fields: html`
    <div class="grid-2">${field('ইউনিট', html`<select class="input" name="unit_id" required>${opts(Object.fromEntries(units.map(u => [u.id, unitName(u) + ' — ' + T(activeLease(u.id).tenant_id).full_name])))}</select>`)}
      ${field('বিলের ধরন', html`<select class="input" name="kind">${opts(LABEL.util, 'electricity')}</select>`)}</div>
    <div class="grid-3">${field('আগের রিডিং', html`<input class="input" name="prev_reading" type="number" min="0" step="0.01">`)}${field('বর্তমান রিডিং', html`<input class="input" name="curr_reading" type="number" min="0" step="0.01">`)}${field('প্রতি ইউনিট রেট (৳)', html`<input class="input" name="rate" type="number" min="0" step="0.0001">`)}</div>
    ${field('মোট টাকা (৳)', html`<input class="input" name="amount" type="number" min="0" step="0.01" placeholder="রিডিং দিলে নিজে হিসাব হবে">`, 'নির্দিষ্ট অঙ্কের বিল হলে (যেমন গ্যাস ১০৮০ টাকা) শুধু এই ঘরটি পূরণ করুন।')}
    <p class="small muted" id="calc"></p>`,
    onSubmit: async v => {
      const r = x => v[x] === '' ? null : Number(v[x]);
      if (r('amount') == null && (r('prev_reading') == null || r('curr_reading') == null || r('rate') == null)) throw new Error('মোট টাকা দিন, অথবা আগের-বর্তমান রিডিং ও রেট দিন।');
      if (r('prev_reading') != null && r('curr_reading') != null && r('curr_reading') < r('prev_reading')) throw new Error('বর্তমান রিডিং আগের রিডিংয়ের চেয়ে কম হতে পারে না।');
      await run(S.db.from('utility_bills').insert({ org_id: S.org.id, unit_id: v.unit_id, kind: v.kind, period: S.month, prev_reading: r('prev_reading'), curr_reading: r('curr_reading'), rate: r('rate'), amount: r('amount') ?? 0 }), 'বিল যোগ হয়েছে');
      route();
    } });
  const calc = () => { const p = +$('[name=prev_reading]', d).value, c = +$('[name=curr_reading]', d).value, rt = +$('[name=rate]', d).value; $('#calc', d).textContent = c > p && rt ? `${n(c - p)} ইউনিট × ${n(rt)} = ${tk(Math.round((c - p) * rt * 100) / 100)}` : ''; };
  $$('input', d).forEach(i => i.addEventListener('input', calc));
}

// ---------------- Invoice & receipt ----------------
async function invoiceSheet(id) {
  const i = by(S.d.invoices, id); const { data: items } = await S.db.from('invoice_items').select('*').eq('invoice_id', id).order('created_at');
  const t = T(i.tenant_id), u = U(i.unit_id), pays = S.d.payments.filter(p => p.invoice_id === id);
  const editable = can.manage() && ['unpaid', 'partial'].includes(i.status);
  const doc = invoiceDoc(i, items, t, u, pays);
  const d = openSheet({ wide: true, title: `ইনভয়েস ${i.invoice_no}`, body: html`${raw(doc)}
    ${editable ? html`<div style="display:flex;gap:.5rem;flex-wrap:wrap;margin-top:1rem"><button class="btn sm" data-add-item="other">+ অতিরিক্ত চার্জ</button><button class="btn sm" data-add-item="late_fee">+ বিলম্ব ফি</button><button class="btn sm" data-add-item="discount">+ ছাড়</button></div>` : ''}
    ${pays.length ? html`<h3 style="margin:1.2rem 0 .3rem">আদায়</h3><div class="list">${pays.map(p => html`<div class="list-row click" data-receipt="${p.id}"><div><div class="title">${p.receipt_no}</div><div class="sub">${dateBn(p.paid_on)} · ${LABEL.method[p.method]}${p.reference ? ' · ' + p.reference : ''}</div></div><div class="right"><b class="num">${tk(p.amount)}</b></div></div>`)}</div>` : ''}`,
    foot: html`${can.owner() && i.status === 'unpaid' && !pays.length ? html`<button class="btn danger" data-void style="margin-right:auto">বাতিল</button>` : ''}
      <button class="btn" data-print>${icon('print')}প্রিন্ট / PDF</button>
      <a class="btn" target="_blank" rel="noopener" href="${waLink(t.phone, invoiceText(i, items, t, u))}">WhatsApp-এ পাঠান</a>
      ${['unpaid', 'partial'].includes(i.status) ? html`<button class="btn gold" data-pay>${icon('cash')}ভাড়া আদায় করুন</button>` : ''}` });
  $('[data-print]', d).onclick = () => printDoc(doc);
  $('[data-pay]', d)?.addEventListener('click', () => { d.close(); paymentSheet(id); });
  $$('[data-receipt]', d).forEach(r => r.onclick = () => { d.close(); receiptSheet(r.dataset.receipt); });
  $$('[data-add-item]', d).forEach(b => b.onclick = () => { d.close(); itemSheet(i, b.dataset.addItem); });
  $('[data-void]', d)?.addEventListener('click', async () => {
    if (!await confirmSheet('ইনভয়েসটি বাতিল করবেন? যুক্ত ইউটিলিটি বিল আবার পরের ইনভয়েসে যোগ করা যাবে।', 'বাতিল করুন')) return;
    await run(S.db.rpc('void_invoice', { p_invoice: id, p_reason: 'মালিক বাতিল করেছেন' }), 'ইনভয়েস বাতিল হয়েছে'); d.close(); refresh();
  });
}
function itemSheet(inv, kind) {
  if (!guard()) return;
  const titles = { other: 'অতিরিক্ত চার্জ', late_fee: 'বিলম্ব ফি', discount: 'ছাড়' };
  formSheet({ title: titles[kind] + ' যোগ করুন', fields: html`${field('বিবরণ', html`<input class="input" name="description" required maxlength="200" value="${titles[kind]}">`)}${field('টাকা (৳)', html`<input class="input" name="amount" type="number" min="1" step="0.01" required>`)}`,
    onSubmit: async v => { const amt = Math.abs(Number(v.amount)) * (kind === 'discount' ? -1 : 1);
      await run(S.db.from('invoice_items').insert({ org_id: S.org.id, invoice_id: inv.id, kind, description: v.description.trim(), amount: amt }), 'যোগ হয়েছে'); await loadAll(); invoiceSheet(inv.id); } });
}
function docHead(title, no) {
  return `<div class="doc-head"><div><h2>${esc(S.org.name)}</h2><div>${esc(S.org.address || '')}</div><div>${esc(S.org.phone ? 'মোবাইল: ' + bnDigits(S.org.phone) : '')}</div></div>
    <div style="text-align:right"><h2>${esc(title)}</h2><div>${esc(no)}</div></div></div>`;
}
function invoiceDoc(i, items, t, u, pays) {
  return `<div class="doc">${docHead('ইনভয়েস', i.invoice_no)}
    <div style="display:flex;justify-content:space-between;gap:1rem;flex-wrap:wrap"><div><b>${esc(t.full_name)}</b><br>${esc(unitName(u))}<br>মোবাইল: ${esc(bnDigits(t.phone))}</div>
      <div style="text-align:right">মাস: <b>${esc(monthLabel(i.period))}</b><br>ইস্যু: ${esc(dateBn(i.issue_date))}<br>শেষ তারিখ: <b>${esc(dateBn(i.due_date))}</b></div></div>
    <table><thead><tr><th>বিবরণ</th><th class="r">টাকা</th></tr></thead><tbody>${items.map(x => `<tr><td>${esc(bnDigits(x.description))}</td><td class="r">${esc(tk(x.amount))}</td></tr>`).join('')}
      <tr class="total"><td>মোট</td><td class="r">${esc(tk(i.subtotal))}</td></tr><tr><td>পরিশোধিত</td><td class="r">${esc(tk(i.paid_amount))}</td></tr><tr><td><b>বকেয়া</b></td><td class="r"><b>${esc(tk(due(i)))}</b></td></tr></tbody></table>
    <span class="stamp ${i.status === 'paid' ? '' : 'unpaid'}">${esc(i.status === 'void' ? 'বাতিল' : LABEL.status[i.status])}</span>
    <div class="foot"><span>${pays.length ? 'রসিদ: ' + esc(pays.map(p => p.receipt_no).join(', ')) : ''}</span><span>Rentora · Powered by SIDDIQIYA Technology</span></div></div>`;
}
function invoiceText(i, items, t, u) {
  return `${S.org.name}\nইনভয়েস ${i.invoice_no} (${monthLabel(i.period)})\n${t.full_name}, ${unitName(u)}\n` + items.map(x => `• ${x.description}: ৳${x.amount}`).join('\n') +
    `\nমোট: ৳${i.subtotal}\nবকেয়া: ৳${due(i)}\nশেষ তারিখ: ${dateBn(i.due_date)}`;
}
function receiptSheet(pid) {
  const p = by(S.d.payments, pid), i = by(S.d.invoices, p.invoice_id), t = T(p.tenant_id), u = U(i.unit_id);
  const doc = `<div class="doc">${docHead('টাকা প্রাপ্তির রসিদ', p.receipt_no)}
    <p>প্রাপ্তি স্বীকার করা যাচ্ছে যে <b>${esc(t.full_name)}</b> (${esc(unitName(u))}) এর কাছ থেকে <b>${esc(tk(p.amount))}</b> বুঝে পেয়েছি।</p>
    <table><tbody><tr><td>ইনভয়েস</td><td class="r">${esc(i.invoice_no)} (${esc(monthLabel(i.period))})</td></tr><tr><td>তারিখ</td><td class="r">${esc(dateBn(p.paid_on))}</td></tr>
      <tr><td>মাধ্যম</td><td class="r">${esc(LABEL.method[p.method])}${p.reference ? ' — ' + esc(p.reference) : ''}</td></tr><tr class="total"><td>আদায়</td><td class="r">${esc(tk(p.amount))}</td></tr>
      <tr><td>ইনভয়েসের বাকি</td><td class="r">${esc(tk(due(i)))}</td></tr></tbody></table>
    <span class="stamp">${esc(due(i) > 0 ? 'আংশিক' : 'পরিশোধিত')}</span>
    <div class="foot"><span>স্বাক্ষর: ____________</span><span>Rentora · Powered by SIDDIQIYA Technology</span></div></div>`;
  const d = openSheet({ wide: true, title: 'রসিদ ' + p.receipt_no, body: raw(doc), foot: html`${can.owner() ? html`<button class="btn danger" data-delpay style="margin-right:auto">ভুল পেমেন্ট মুছুন</button>` : ''}<button class="btn" data-print>${icon('print')}প্রিন্ট / PDF</button>
    <a class="btn primary" target="_blank" rel="noopener" href="${waLink(t.phone, `${S.org.name}\nরসিদ ${p.receipt_no}\n${t.full_name}, ${unitName(u)}\nজমা: ৳${p.amount} (${LABEL.method[p.method]})\nতারিখ: ${dateBn(p.paid_on)}\nবাকি: ৳${due(i)}\nধন্যবাদ।`)}">WhatsApp-এ রসিদ পাঠান</a>` });
  $('[data-print]', d).onclick = () => printDoc(doc);
  $('[data-delpay]', d)?.addEventListener('click', () => { d.close(); formSheet({ title: 'ভুল পেমেন্ট মুছুন', submit: 'পেমেন্ট মুছুন', fields: html`
    <p>${p.receipt_no} — ${tk(p.amount)} মুছে ফেললে ইনভয়েসের বকেয়া আবার ফিরে আসবে, আর আয়ের হিসাব থেকেও বাদ যাবে। মুছে ফেলা পেমেন্টের রেকর্ড অডিট লগে থেকে যাবে।</p>
    ${field('মুছে ফেলার কারণ', html`<input class="input" name="reason" required minlength="3" maxlength="300" placeholder="যেমন: ভুল অঙ্ক লেখা হয়েছিল">`)}`,
    onSubmit: async v => { await run(S.db.rpc('delete_payment', { p_payment: p.id, p_reason: v.reason.trim() }), 'পেমেন্ট মুছে ফেলা হয়েছে'); await refresh(); } }); });
}
function waLink(phone, text) { let p = String(phone || '').replace(/\D/g, ''); if (p.startsWith('0')) p = '88' + p; return `https://wa.me/${p}?text=${encodeURIComponent(text)}`; }

// ---------------- Record payment ----------------
function paymentSheet(invoiceId) {
  if (!writable()) { toast('সাবস্ক্রিপশনের মেয়াদ শেষ। নবায়ন করুন।', true); return; }
  const open = openInvoices().sort((a, b) => a.period.localeCompare(b.period));
  if (!open.length) { toast('কোনো বকেয়া ইনভয়েস নেই। আগে এ মাসের ইনভয়েস তৈরি করুন।'); return; }
  const optMap = Object.fromEntries(open.map(i => [i.id, `${unitName(U(i.unit_id))} — ${T(i.tenant_id)?.full_name} — ${monthLabel(i.period)} — বকেয়া ${tk(due(i))}`]));
  const first = invoiceId && optMap[invoiceId] ? invoiceId : open[0].id;
  const d = formSheet({ title: 'ভাড়া আদায় করুন', submit: 'আদায় করুন ও রসিদ তৈরি', fields: html`
    ${field('কোন ইনভয়েসের টাকা', html`<select class="input" name="invoice" required>${opts(optMap, first)}</select>`)}
    ${field('টাকার পরিমাণ (৳)', html`<input class="input" name="amount" type="number" min="1" step="0.01" required value="${due(by(S.d.invoices, first))}" style="font-size:1.4rem;font-weight:700">`)}
    <div class="field"><span>কীভাবে পেলেন</span><div class="seg" id="mSeg" style="width:100%">${['cash', 'bkash', 'nagad', 'rocket', 'bank'].map((k, j) => html`<button type="button" data-k="${k}" aria-pressed="${j === 0}">${LABEL.method[k]}</button>`)}</div><input type="hidden" name="method" value="cash"></div>
    <div class="grid-2">${field('ট্রানজেকশন আইডি / নোট', html`<input class="input" name="reference" maxlength="80">`)}${field('তারিখ', html`<input class="input" name="paid_on" type="date" required max="${todayISO()}" value="${todayISO()}">`)}</div>`,
    onSubmit: async v => {
      const r = await run(S.db.rpc('record_payment', { p_invoice: v.invoice, p_amount: Number(v.amount), p_method: v.method, p_reference: v.reference || null, p_paid_on: v.paid_on }));
      toast(`আদায় হয়েছে। রসিদ ${r.receipt_no}`); await loadAll(); route(); receiptSheet(r.payment_id);
    } });
  const sel = $('[name=invoice]', d); sel.onchange = () => { $('[name=amount]', d).value = due(by(S.d.invoices, sel.value)); };
  $$('#mSeg button', d).forEach(b => b.onclick = () => { $$('#mSeg button', d).forEach(x => x.setAttribute('aria-pressed', x === b)); $('[name=method]', d).value = b.dataset.k; });
}

// ---------------- Income & expense ----------------
async function pageMoney() {
  const m = S.month, end = addMonths(m, 1);
  const { data: rows } = await S.db.from('ledger_entries').select('*').eq('org_id', S.org.id).gte('entry_date', m).lt('entry_date', end).order('entry_date', { ascending: false });
  const inc = rows.filter(r => r.entry_type === 'income'), exp = rows.filter(r => r.entry_type === 'expense');
  const sum = a => a.reduce((s, r) => s + Number(r.amount), 0);
  const cats = {}; exp.forEach(r => cats[r.category] = (cats[r.category] || 0) + Number(r.amount));
  const maxC = Math.max(1, ...Object.values(cats));
  const steps = [
    ['বাড়ি বা মার্কেট যোগ করুন', S.d.properties.length > 0, '#property'],
    ['ফ্ল্যাট, দোকান বা রুম যোগ করুন', S.d.units.length > 0, '#property'],
    ['ভাড়াটিয়া বসান', S.d.leases.some(l => l.status === 'active'), '#tenants'],
    ['প্রথম ইনভয়েস তৈরি করুন', S.d.invoices.length > 0, '#bills'],
    ['প্রথম ভাড়া আদায় করুন', S.d.payments.length > 0, null],
  ];
  const doneN = steps.filter(x => x[1]).length, nextStep = steps.find(x => !x[1]);
  const guide = doneN < steps.length && can.manage() ? html`<section class="panel start-guide"><div class="panel-head"><div><h2>শুরু করার ধাপ</h2><p class="muted small">${n(steps.length)}টির মধ্যে ${n(doneN)}টি সম্পন্ন — বাকিগুলো করলেই Rentora পুরোপুরি কাজ শুরু করবে।</p></div>
      <div class="meter" style="background:var(--surface-2);width:160px"><i style="width:${doneN / steps.length * 100}%"></i></div></div>
    <ol class="steps-list">${steps.map(([t, ok, href]) => html`<li class="${ok ? 'done' : (nextStep && nextStep[0] === t ? 'next' : '')}">${ok ? html`<span>${t}</span>` : href ? html`<a href="${href}">${t}</a>` : html`<button type="button" class="link-btn" data-pay-first>${t}</button>`}</li>`)}</ol></section>` : '';
  view().innerHTML = String(html`
    ${guide}
    <div class="toolbar">${monthPicker()}<span class="grow"></span><button class="btn" id="csv">${icon('download')}CSV</button>
      <button class="btn" id="addInc">${icon('plus')}আয়</button><button class="btn primary" id="addExp">${icon('plus')}খরচ</button></div>
    <div class="stats"><div class="stat"><b class="num" style="color:var(--paid)">${tk(sum(inc))}</b><span>মোট আয়</span></div><div class="stat"><b class="num">${tk(sum(exp))}</b><span>মোট খরচ</span></div>
      <div class="stat"><b class="num">${tk(sum(inc) - sum(exp))}</b><span>নিট লাভ</span></div><div class="stat"><b class="num">${n(rows.length)}</b><span>লেনদেন</span></div></div>
    <div class="cols" style="margin-top:1rem">
      <section class="panel"><h3 style="margin-bottom:.5rem">লেনদেন — ${monthLabel(m)}</h3>
        ${rows.length ? html`<div class="list">${rows.map(r => html`<div class="list-row ${r.payment_id ? '' : 'click'}" ${r.payment_id ? '' : raw(`data-led="${esc(r.id)}"`)}><div><div class="title">${r.category}</div><div class="sub">${dateBn(r.entry_date)}${r.property_id ? ' · ' + PR(r.property_id)?.name : ''}${r.description ? ' · ' + r.description : ''}${r.payment_id ? ' · স্বয়ংক্রিয়' : ''}</div></div>
          <div class="right"><b class="num" style="color:${r.entry_type === 'income' ? 'var(--paid)' : 'var(--ink)'}">${r.entry_type === 'income' ? '+' : '−'}${tk(r.amount)}</b></div></div>`)}</div>`
          : emptyState('wallet', 'এ মাসে কোনো লেনদেন নেই', 'ভাড়া আদায় করলে আয় নিজে থেকেই এখানে যোগ হবে। মেরামত, বেতন, বিলের মতো খরচ হাতে যোগ করুন।')}</section>
      <section class="panel"><h3 style="margin-bottom:.8rem">খরচের খাত</h3>${Object.keys(cats).length ? html`<div style="display:grid;gap:.7rem">${Object.entries(cats).sort((a, b) => b[1] - a[1]).map(([c, v]) => html`<div><div style="display:flex;justify-content:space-between"><span>${c}</span><b class="num">${tk(v)}</b></div><div class="meter" style="background:var(--surface-2);height:8px;margin-top:.3rem"><i style="width:${v / maxC * 100}%"></i></div></div>`)}</div>` : html`<p class="muted">কোনো খরচ নেই।</p>`}</section>
    </div>`);
  wireMonth(view(), pageMoney);
  $('#addInc').onclick = () => ledgerSheet({ entry_type: 'income' }); $('#addExp').onclick = () => ledgerSheet({ entry_type: 'expense' });
  $$('[data-led]').forEach(r => r.onclick = () => ledgerSheet(rows.find(x => x.id === r.dataset.led)));
  $('#csv').onclick = () => download(`rentora-${m.slice(0, 7)}.csv`, '﻿' + [['তারিখ', 'ধরন', 'খাত', 'টাকা', 'সম্পত্তি', 'বিবরণ'].join(','), ...rows.map(r => [r.entry_date, r.entry_type === 'income' ? 'আয়' : 'খরচ', r.category, r.amount, PR(r.property_id)?.name || '', r.description || ''].map(x => `"${String(x).replace(/"/g, '""')}"`).join(','))].join('\n'), 'text/csv');
}
function ledgerSheet(r) {
  if (!writable()) { toast('সাবস্ক্রিপশনের মেয়াদ শেষ। নবায়ন করুন।', true); return; }
  const inc = r.entry_type === 'income';
  const catList = inc ? ['পার্কিং', 'অগ্রিম/জামানত', 'সার্ভিস চার্জ', 'অন্যান্য আয়'] : ['মেরামত', 'দারোয়ানের বেতন', 'বিদ্যুৎ (কমন)', 'পানি', 'পরিষ্কার-পরিচ্ছন্নতা', 'হোল্ডিং ট্যাক্স', 'লিফট রক্ষণাবেক্ষণ', 'অন্যান্য খরচ'];
  const d = formSheet({ title: (r.id ? 'সম্পাদনা: ' : 'নতুন ') + (inc ? 'আয়' : 'খরচ'), fields: html`
    <div class="grid-2">${field('খাত', html`<input class="input" name="category" list="cats" required maxlength="60" value="${r.category || ''}"><datalist id="cats">${catList.map(c => html`<option value="${c}">`)}</datalist>`)}
      ${field('টাকা (৳)', html`<input class="input" name="amount" type="number" min="1" step="0.01" required value="${r.amount || ''}">`)}</div>
    <div class="grid-2">${field('তারিখ', html`<input class="input" name="entry_date" type="date" required value="${r.entry_date || todayISO()}">`)}
      ${field('সম্পত্তি', html`<select class="input" name="property_id">${opts({ '': 'সাধারণ', ...Object.fromEntries(S.d.properties.map(p => [p.id, p.name])) }, r.property_id || '')}</select>`)}</div>
    ${field('বিবরণ', html`<input class="input" name="description" maxlength="300" value="${r.description || ''}">`)}
    ${r.id && can.manage() ? html`<button type="button" class="btn danger sm" data-del style="justify-self:start">মুছে ফেলুন</button>` : ''}`,
    onSubmit: async v => { const row = { category: v.category.trim(), amount: Number(v.amount), entry_date: v.entry_date, property_id: v.property_id || null, description: v.description.trim() || null };
      await run(r.id ? S.db.from('ledger_entries').update(row).eq('id', r.id) : S.db.from('ledger_entries').insert({ ...row, entry_type: r.entry_type, org_id: S.org.id }), 'সংরক্ষণ হয়েছে'); pageMoney(); } });
  $('[data-del]', d)?.addEventListener('click', async () => { await run(S.db.from('ledger_entries').delete().eq('id', r.id), 'মুছে ফেলা হয়েছে'); d.close(); pageMoney(); });
}

// ---------------- Reports (yearly profit & loss, by property, dues ageing) ----------------
let repYear = Number(todayISO().slice(0, 4));
async function pageReports() {
  const y = repYear, from = `${y}-01-01`, to = `${y + 1}-01-01`;
  const { data: rows } = await S.db.from('ledger_entries').select('*').eq('org_id', S.org.id).gte('entry_date', from).lt('entry_date', to);
  const months = Array.from({ length: 12 }, (_, k) => `${y}-${String(k + 1).padStart(2, '0')}`);
  const sum = (a, f = r => r.amount) => a.reduce((s, r) => s + Number(f(r)), 0);
  const billedBy = m => sum(S.d.invoices.filter(i => i.status !== 'void' && i.period.slice(0, 7) === m), i => i.subtotal);
  const table = months.map(m => { const r = rows.filter(x => x.entry_date.slice(0, 7) === m);
    const rent = sum(r.filter(x => x.entry_type === 'income' && x.payment_id)), other = sum(r.filter(x => x.entry_type === 'income' && !x.payment_id)), exp = sum(r.filter(x => x.entry_type === 'expense'));
    return { m, billed: billedBy(m), rent, other, exp, profit: rent + other - exp }; });
  const T = k => sum(table, r => r[k]);
  const props = [...S.d.properties.map(p => ({ id: p.id, name: p.name })), { id: null, name: 'সাধারণ (কোনো সম্পত্তি নয়)' }].map(p => {
    const r = rows.filter(x => (x.property_id || null) === p.id); const inc = sum(r.filter(x => x.entry_type === 'income')), exp = sum(r.filter(x => x.entry_type === 'expense'));
    return { ...p, inc, exp, profit: inc - exp }; }).filter(p => p.inc || p.exp);
  const cats = {}; rows.filter(r => r.entry_type === 'expense').forEach(r => cats[r.category] = (cats[r.category] || 0) + Number(r.amount));
  const today = todayISO(), days = i => Math.floor((Date.parse(today) - Date.parse(i.due_date)) / 864e5);
  const open = openInvoices().filter(i => i.due_date < today);
  const age = [['১–৩০ দিন', i => days(i) <= 30], ['৩১–৬০ দিন', i => days(i) > 30 && days(i) <= 60], ['৬০ দিনের বেশি', i => days(i) > 60]].map(([t, f]) => { const a = open.filter(f); return { t, n: a.length, amt: sum(a, i => due(i)) }; });
  const billedMonths = table.filter(r => r.billed > 0), rate = billedMonths.length ? Math.min(100, Math.round(sum(billedMonths, r => r.rent) / sum(billedMonths, r => r.billed) * 100)) : 0;
  const maxAbs = Math.max(1, ...table.map(r => Math.max(r.rent + r.other, r.exp)));
  view().innerHTML = String(html`
    <div class="toolbar"><div class="seg" role="group" aria-label="বছর"><button type="button" data-y="-1" aria-label="আগের বছর">‹</button><button type="button" aria-pressed="true" style="min-width:6rem">${bnDigits(y)}</button><button type="button" data-y="1" aria-label="পরের বছর">›</button></div>
      <span class="grow"></span><button class="btn" id="repCsv">${icon('download')}CSV</button><button class="btn" id="repPrint">${icon('print')}প্রিন্ট / PDF</button></div>
    <section class="ledger-hero"><div class="row"><div><div class="label">${bnDigits(y)} সালের নিট লাভ</div><div class="big num">${tk(T('profit'))}</div></div><div class="of">আদায়ের হার ${n(rate)}%</div></div>
      <div class="hero-figs"><div><span class="label">মোট বিল</span><b class="num">${tk(T('billed'))}</b></div><div><span class="label">ভাড়া আদায়</span><b class="num">${tk(T('rent'))}</b></div><div><span class="label">অন্যান্য আয়</span><b class="num">${tk(T('other'))}</b></div><div><span class="label">মোট খরচ</span><b class="num">${tk(T('exp'))}</b></div></div></section>
    <section class="panel" style="margin-top:1rem"><div class="panel-head"><h2>মাসভিত্তিক লাভ-ক্ষতি</h2><div class="legend"><span><i style="background:var(--paid)"></i>আয়</span><span><i style="background:var(--gold)"></i>খরচ</span></div></div>
      <div class="bars" style="grid-template-columns:repeat(12,1fr);height:150px">${table.map(r => html`<div class="m" title="${monthLabel(r.m + '-01')}: লাভ ${tk(r.profit)}"><div class="pair"><i class="inc" style="height:${(r.rent + r.other) / maxAbs * 100}%"></i><i class="exp" style="height:${r.exp / maxAbs * 100}%"></i></div><small>${shortMonth(r.m + '-01')}</small></div>`)}</div>
      <div class="table-wrap" style="margin-top:1rem"><table class="t"><thead><tr><th>মাস</th><th class="r">বিল</th><th class="r">ভাড়া আদায়</th><th class="r">অন্যান্য আয়</th><th class="r">খরচ</th><th class="r">লাভ</th></tr></thead><tbody>
        ${table.map(r => html`<tr><td>${monthLabel(r.m + '-01')}</td><td class="r num">${tk(r.billed)}</td><td class="r num">${tk(r.rent)}</td><td class="r num">${tk(r.other)}</td><td class="r num">${tk(r.exp)}</td><td class="r num" style="color:${r.profit < 0 ? 'var(--due)' : 'inherit'};font-weight:700">${tk(r.profit)}</td></tr>`)}
        <tr><td><b>মোট</b></td><td class="r num"><b>${tk(T('billed'))}</b></td><td class="r num"><b>${tk(T('rent'))}</b></td><td class="r num"><b>${tk(T('other'))}</b></td><td class="r num"><b>${tk(T('exp'))}</b></td><td class="r num"><b>${tk(T('profit'))}</b></td></tr></tbody></table></div></section>
    <div class="cols">
      <section class="panel" style="margin-top:1rem"><h3 style="margin-bottom:.6rem">সম্পত্তিভিত্তিক লাভ</h3>${props.length ? html`<div class="table-wrap"><table class="t"><thead><tr><th>সম্পত্তি</th><th class="r">আয়</th><th class="r">খরচ</th><th class="r">লাভ</th></tr></thead><tbody>${props.map(p => html`<tr><td>${p.name}</td><td class="r num">${tk(p.inc)}</td><td class="r num">${tk(p.exp)}</td><td class="r num"><b>${tk(p.profit)}</b></td></tr>`)}</tbody></table></div>` : html`<p class="muted">এ বছরে কোনো লেনদেন নেই।</p>`}
        <h3 style="margin:1.2rem 0 .6rem">খরচের খাত</h3>${Object.keys(cats).length ? html`<div class="list">${Object.entries(cats).sort((a, b) => b[1] - a[1]).map(([c, v]) => html`<div class="list-row"><span>${c}</span><b class="num">${tk(v)}</b></div>`)}</div>` : html`<p class="muted">কোনো খরচ নেই।</p>`}</section>
      <section class="panel" style="margin-top:1rem"><h3 style="margin-bottom:.3rem">বকেয়া কতদিনের</h3><p class="small muted" style="margin-bottom:.6rem">আজ পর্যন্ত শেষ তারিখ পার হওয়া সব ইনভয়েস</p>
        <div class="list">${age.map(a => html`<div class="list-row"><div><div class="title">${a.t}</div><div class="sub">${n(a.n)}টি ইনভয়েস</div></div><b class="num" style="color:${a.amt ? 'var(--due)' : 'inherit'}">${tk(a.amt)}</b></div>`)}</div>
        ${open.length ? html`<h3 style="margin:1.2rem 0 .4rem">সবচেয়ে বেশি বকেয়া</h3><div class="list">${[...open].sort((a, b) => due(b) - due(a)).slice(0, 6).map(i => html`<div class="list-row click" data-inv="${i.id}"><div><div class="title">${T2name(i)}</div><div class="sub">${unitName(U(i.unit_id))} · ${monthLabel(i.period)} · ${n(days(i))} দিন</div></div><b class="num" style="color:var(--due)">${tk(due(i))}</b></div>`)}</div>` : ''}</section>
    </div>`);
  $$('[data-y]').forEach(b => b.onclick = () => { repYear += Number(b.dataset.y); pageReports(); });
  $$('[data-inv]').forEach(r => r.onclick = () => invoiceSheet(r.dataset.inv));
  $('#repCsv').onclick = () => download(`rentora-report-${y}.csv`, '﻿' + [['মাস', 'বিল', 'ভাড়া আদায়', 'অন্যান্য আয়', 'খরচ', 'লাভ'].join(','), ...table.map(r => [r.m, r.billed, r.rent, r.other, r.exp, r.profit].join(',')), ['মোট', T('billed'), T('rent'), T('other'), T('exp'), T('profit')].join(',')].join('\n'), 'text/csv');
  $('#repPrint').onclick = () => printDoc(`<div class="doc">${docHead('লাভ-ক্ষতি রিপোর্ট', String(y))}<table><thead><tr><th>মাস</th><th class="r">বিল</th><th class="r">ভাড়া আদায়</th><th class="r">অন্যান্য আয়</th><th class="r">খরচ</th><th class="r">লাভ</th></tr></thead><tbody>${table.map(r => `<tr><td>${esc(monthLabel(r.m + '-01'))}</td><td class="r">${esc(tk(r.billed))}</td><td class="r">${esc(tk(r.rent))}</td><td class="r">${esc(tk(r.other))}</td><td class="r">${esc(tk(r.exp))}</td><td class="r">${esc(tk(r.profit))}</td></tr>`).join('')}<tr class="total"><td>মোট</td><td class="r">${esc(tk(T('billed')))}</td><td class="r">${esc(tk(T('rent')))}</td><td class="r">${esc(tk(T('other')))}</td><td class="r">${esc(tk(T('exp')))}</td><td class="r">${esc(tk(T('profit')))}</td></tr></tbody></table><div class="foot"><span>তৈরি: ${esc(dateBn(today))}</span><span>Rentora · Powered by SIDDIQIYA Technology</span></div></div>`);
}
const T2name = i => T(i.tenant_id)?.full_name || '—';

// ---------------- Messages ----------------
async function pageMessages() {
  const { data: rows } = await S.db.from('notification_outbox').select('*').eq('org_id', S.org.id).order('created_at', { ascending: false }).limit(100);
  const T2 = { invoice_issued: 'ইনভয়েস', payment_received: 'রসিদ', due_reminder: 'বকেয়া রিমাইন্ডার', custom: 'বার্তা' };
  view().innerHTML = String(html`
    <section class="panel"><div class="panel-head"><div><h2>স্বয়ংক্রিয় বার্তা</h2><p class="muted small">ইনভয়েস তৈরি, ভাড়া আদায় আর বকেয়ার সময় ভাড়াটিয়াকে বার্তা যাবে।</p></div></div>
      <div class="grid-2">
        <label class="panel" style="display:flex;gap:.8rem;align-items:center;cursor:pointer"><input type="checkbox" id="sms" ${S.org.sms_enabled ? raw('checked') : ''} ${can.owner() ? '' : raw('disabled')}><span><b>SMS</b><br><span class="small muted">বাংলাদেশের যেকোনো মোবাইলে</span></span></label>
        <label class="panel" style="display:flex;gap:.8rem;align-items:center;cursor:pointer;margin-top:0"><input type="checkbox" id="wa" ${S.org.whatsapp_enabled ? raw('checked') : ''} ${can.owner() ? '' : raw('disabled')}><span><b>WhatsApp</b><br><span class="small muted">WhatsApp ব্যবহারকারীদের</span></span></label></div>
      <p class="small muted" style="margin-top:.8rem">SMS ও WhatsApp পাঠানোর সংযোগ SIDDIQIYA Technology চালু করবে। চালু না হওয়া পর্যন্ত বার্তাগুলো এখানে জমা থাকবে, আর প্রতিটি বার্তা এক ক্লিকে আপনার নিজের WhatsApp থেকে পাঠাতে পারবেন।</p></section>
    <section class="panel"><div class="panel-head"><h3>বার্তার তালিকা</h3>${can.manage() ? html`<button class="btn primary" id="remind">${icon('bell')}সব বকেয়াদারকে রিমাইন্ডার</button>` : ''}</div>
      ${rows.length ? html`<div class="list">${rows.map(r => html`<div class="list-row"><div><div class="title">${T2[r.template]} · ${r.channel === 'sms' ? 'SMS' : 'WhatsApp'} · ${bnDigits(r.to_phone)}</div><div class="sub">${r.body}</div></div>
        <div class="right">${chip(r.status)}${r.status === 'queued' ? html`<a class="btn sm" target="_blank" rel="noopener" href="${waLink(r.to_phone, r.body)}">নিজে পাঠান</a>` : ''}</div></div>`)}</div>`
        : emptyState('message', 'এখনো কোনো বার্তা নেই', 'SMS বা WhatsApp চালু করুন। এরপর ইনভয়েস তৈরি বা ভাড়া আদায় করলে বার্তা এখানে দেখা যাবে।')}</section>`);
  const save = async (k, v) => { await run(S.db.from('organizations').update({ [k]: v }).eq('id', S.org.id), 'সংরক্ষণ হয়েছে'); S.org[k] = v; };
  $('#sms').onchange = e => save('sms_enabled', e.target.checked); $('#wa').onchange = e => save('whatsapp_enabled', e.target.checked);
  $('#remind')?.addEventListener('click', async () => { if (!guard()) return; if (!S.org.sms_enabled && !S.org.whatsapp_enabled) { toast('আগে SMS অথবা WhatsApp চালু করুন।', true); return; }
    const c = await run(S.db.rpc('queue_due_reminders', { p_org: S.org.id })); toast(c ? `${n(c)}টি বকেয়া ইনভয়েসের রিমাইন্ডার তৈরি হয়েছে` : 'কোনো মেয়াদোত্তীর্ণ বকেয়া নেই'); pageMessages(); });
}

// ---------------- Subscription ----------------
async function pagePlan() {
  let cycle = S.org.billing_cycle || 'monthly';
  const { data: hist } = can.owner() ? await S.db.from('subscription_payments').select('*').eq('org_id', S.org.id).order('created_at', { ascending: false }) : { data: [] };
  const o = S.org, cur = S.plans.find(p => p.code === o.plan_code);
  const draw = () => {
    view().innerHTML = String(html`
      <section class="panel"><div class="panel-head"><div><h2>${cur?.name_bn} প্যাকেজ</h2><p class="muted">${o.status === 'trial' ? html`ফ্রি ট্রায়াল শেষ হবে ${dateBn(o.trial_ends_at)}` : o.current_period_end ? html`মেয়াদ ${dateBn(o.current_period_end)} পর্যন্ত (${o.billing_cycle === 'yearly' ? 'বার্ষিক' : 'মাসিক'})` : ''}</p></div>${chip(writable() ? o.status : 'suspended', writable() ? undefined : 'মেয়াদ শেষ')}</div>
        <p class="small muted">ব্যবহার: ${n(S.d.units.length)}টি ইউনিট${cur?.max_units ? html` / সর্বোচ্চ ${n(cur.max_units)}টি` : ' (আনলিমিটেড)'}</p></section>
      <div class="toolbar" style="margin-top:1rem"><h3 class="grow">প্যাকেজ বেছে নিন</h3><div class="seg" id="cyc"><button type="button" data-c="monthly" aria-pressed="${cycle === 'monthly'}">মাসিক</button><button type="button" data-c="yearly" aria-pressed="${cycle === 'yearly'}">বার্ষিক (২ মাস ফ্রি)</button></div></div>
      <p class="small muted" style="margin:.2rem 0 .8rem">স্বয়ংক্রিয়ভাবে কোনো টাকা কাটা হয় না। মেয়াদ শেষের আগে আপনাকে মনে করিয়ে দেওয়া হবে, নবায়ন করবেন নিজে।</p>
      <div class="plans">${S.plans.map(p => html`<div class="plan ${p.code === o.plan_code ? 'current' : ''} ${p.code === 'standard' ? 'rec' : ''}">${p.code === 'standard' ? html`<span class="plan-badge">প্রস্তাবিত</span>` : ''}<h3>${p.name_bn}</h3><div class="price num">${tk(cycle === 'yearly' ? p.yearly_price : p.monthly_price)}<span class="small muted"> / ${cycle === 'yearly' ? 'বছর' : 'মাস'}</span></div>
        <p class="small" style="color:var(--paid);font-weight:600">${cycle === 'yearly' && p.monthly_price * 12 > p.yearly_price ? html`বছরে ${tk(p.monthly_price * 12 - p.yearly_price)} সাশ্রয়` : html`দিনে মাত্র ${tk(Math.ceil(p.monthly_price / 30))}`}</p>
        ${p.max_units && S.d.units.length > p.max_units ? html`<p class="small" style="color:var(--due)">আপনার ${n(S.d.units.length)}টি ইউনিট আছে, এই প্যাকেজে সর্বোচ্চ ${n(p.max_units)}টি</p>` : ''}
        <ul>${(p.features || []).map(f => html`<li>${f}</li>`)}</ul>${can.owner() ? html`<button class="btn ${p.code === 'standard' ? 'gold' : 'primary'}" data-buy="${p.code}">${p.code === o.plan_code && o.status === 'active' ? 'নবায়ন করুন' : 'এই প্যাকেজ নিন'}</button>` : ''}</div>`)}</div>
      ${hist.length ? html`<section class="panel" style="margin-top:1rem"><h3 style="margin-bottom:.5rem">পেমেন্টের ইতিহাস</h3><div class="list">${hist.map(h => html`<div class="list-row"><div><div class="title">${S.plans.find(p => p.code === h.plan_code)?.name_bn} · ${h.billing_cycle === 'yearly' ? 'বার্ষিক' : 'মাসিক'}</div><div class="sub">${LABEL.method[h.method]} · ${h.trx_id} · ${dateBn(h.created_at)}</div></div><div class="right"><b class="num">${tk(h.amount)}</b>${chip(h.status)}</div></div>`)}</div></section>` : ''}`);
    $$('#cyc button').forEach(b => b.onclick = () => { cycle = b.dataset.c; draw(); });
    $$('[data-buy]').forEach(b => b.onclick = () => buySheet(b.dataset.buy, cycle));
  };
  draw();
}
function buySheet(code, cycle) {
  const p = S.plans.find(x => x.code === code), amt = cycle === 'yearly' ? p.yearly_price : p.monthly_price, st = S.settings;
  const nums = { bkash: st.bkash_number, nagad: st.nagad_number, rocket: st.rocket_number };
  const methods = Object.fromEntries(Object.entries({ bkash: 'বিকাশ', nagad: 'নগদ (Nagad)', rocket: 'রকেট' }).filter(([k]) => nums[k]));
  if (st.bank_details) methods.bank = 'ব্যাংক';
  if (!Object.keys(methods).length) { toast(`পেমেন্ট নম্বর এখনো সেট করা হয়নি। ${st.support_phone || ''} নম্বরে যোগাযোগ করুন।`, true); return; }
  const d = formSheet({ title: `${p.name_bn} — ${cycle === 'yearly' ? 'বার্ষিক' : 'মাসিক'}`, submit: 'পেমেন্ট জমা দিন', fields: html`
    <div class="panel" style="background:var(--gold-soft);border-color:var(--gold)"><b>ধাপ ১:</b> নিচের নম্বরে <b class="num">${tk(amt)}</b> "Send Money" করুন।
      <dl class="kv" style="margin-top:.5rem">${Object.entries(nums).filter(([, v]) => v).map(([k, v]) => html`<dt>${LABEL.method[k]}</dt><dd class="num" style="display:flex;gap:.5rem;align-items:center;flex-wrap:wrap">${bnDigits(v)} <button type="button" class="btn sm" data-copy="${v}">কপি</button></dd>`)}${st.bank_details ? html`<dt>ব্যাংক</dt><dd>${st.bank_details}</dd>` : ''}</dl></div>
    <p><b>ধাপ ২:</b> যে মাধ্যমে পাঠিয়েছেন আর ট্রানজেকশন আইডি দিন। যাচাইয়ের পর সাবস্ক্রিপশন চালু হবে, সাধারণত কয়েক ঘণ্টার মধ্যে।</p>
    <div class="grid-2">${field('মাধ্যম', html`<select class="input" name="method">${opts(methods)}</select>`)}${field('ট্রানজেকশন আইডি', html`<input class="input" name="trx" required pattern="[A-Za-z0-9\\-]{6,40}" placeholder="যেমন: 8N7A6B5C4D">`)}</div>`,
    onSubmit: async v => { await run(S.db.rpc('submit_subscription_payment', { p_org: S.org.id, p_plan: code, p_cycle: cycle, p_method: v.method, p_trx: v.trx }), 'পেমেন্ট জমা হয়েছে। যাচাইয়ের পর সাবস্ক্রিপশন চালু হবে।'); pagePlan(); } });
  $$('[data-copy]', d).forEach(b => b.onclick = async () => { try { await navigator.clipboard.writeText(b.dataset.copy); toast('নম্বর কপি হয়েছে'); } catch { toast(b.dataset.copy); } });
}

// ---------------- Settings ----------------
async function pageSettings() {
  const o = S.org;
  const { data: mem } = can.owner() ? await S.db.from('org_members').select('*').eq('org_id', o.id) : { data: [] };
  const { data: profs } = mem.length ? await S.db.from('profiles').select('*').in('user_id', mem.map(m => m.user_id)) : { data: [] };
  view().innerHTML = String(html`
    <section class="panel"><h2 style="margin-bottom:.8rem">ব্যবসার তথ্য</h2>
      <form class="form" id="orgForm">
        <div class="grid-2">${field('ব্যবসার নাম', html`<input class="input" name="name" required minlength="2" maxlength="120" value="${o.name}">`, 'ইনভয়েস ও রসিদের ওপরে এই নাম দেখাবে')}${field('মোবাইল', html`<input class="input" name="phone" inputmode="tel" pattern="\\+?[0-9 \\-]{6,20}" value="${o.phone || ''}">`)}</div>
        ${field('ঠিকানা', html`<input class="input" name="address" maxlength="300" value="${o.address || ''}">`)}
        <div class="grid-3">${field('ইনভয়েস নম্বরের শুরু', html`<input class="input" name="invoice_prefix" required pattern="[A-Z0-9]{2,8}" value="${o.invoice_prefix}">`, 'ইংরেজি বড় হাতের অক্ষর')}${field('রসিদ নম্বরের শুরু', html`<input class="input" name="receipt_prefix" required pattern="[A-Z0-9]{2,8}" value="${o.receipt_prefix}">`)}
          ${field('ভাড়ার শেষ তারিখ (ডিফল্ট)', html`<input class="input" name="default_due_day" type="number" min="1" max="28" required value="${o.default_due_day}">`)}</div>
        ${can.owner() ? html`<button class="btn primary" style="justify-self:start">সংরক্ষণ করুন</button>` : html`<p class="muted small">শুধু মালিক এই তথ্য বদলাতে পারেন।</p>`}
      </form></section>
    ${can.owner() ? html`<section class="panel"><div class="panel-head"><div><h2>টিম</h2><p class="muted small">ম্যানেজার সব কাজ করতে পারেন। হিসাবরক্ষক ভাড়া আদায় ও আয়-ব্যয় লিখতে পারেন।</p></div><button class="btn primary" id="addM">${icon('plus')}সদস্য যোগ করুন</button></div>
      <div class="list">${mem.map(m => html`<div class="list-row"><div><div class="title">${profs.find(p => p.user_id === m.user_id)?.full_name || (m.user_id === S.user.id ? (S.user.user_metadata?.full_name || S.user.email) : 'সদস্য')}</div><div class="sub">${LABEL.role[m.role]}</div></div>
        <div class="right">${m.role !== 'owner' ? html`<button class="btn sm danger" data-rm="${m.user_id}">বাদ দিন</button>` : chip('active', 'মালিক')}</div></div>`)}</div></section>
    <section class="panel"><h2 style="margin-bottom:.4rem">ব্যাকআপ</h2><p class="muted small" style="margin-bottom:.8rem">নিজের কাছে একটি কপি রাখতে আপনার সব তথ্য এক ফাইলে ডাউনলোড করুন। মাঝে মাঝে ডাউনলোড করে রাখা ভালো।</p>
      <button class="btn" id="exp">${icon('download')}সব তথ্য ডাউনলোড (JSON)</button></section>` : ''}
    <section class="panel"><h2 style="margin-bottom:.8rem">আমার অ্যাকাউন্ট</h2>
      <dl class="kv"><dt>ইমেইল</dt><dd>${S.user.email}</dd><dt>ভূমিকা</dt><dd>${LABEL.role[S.role]}</dd></dl>
      <div style="display:flex;gap:.6rem;flex-wrap:wrap;margin-top:1rem"><button class="btn" id="pw">${icon('key')}পাসওয়ার্ড বদলান</button><button class="btn" id="th">${icon('moon')}ডার্ক/লাইট মোড</button>${S.isAdmin ? html`<a class="btn" href="admin.html">${icon('crown')}Super Admin</a>` : ''}<button class="btn danger" id="lo">${icon('logout')}লগ আউট</button></div></section>
    <p class="small muted" style="text-align:center;margin-top:1.5rem">Rentora · ${poweredBy()} · সাপোর্ট: ${bnDigits(S.settings.support_phone || '01778662833')}</p>`);
  $('#orgForm').onsubmit = async e => { e.preventDefault(); if (!can.owner()) return; const f = e.target; if (!f.checkValidity()) { f.reportValidity(); return; }
    const v = Object.fromEntries(new FormData(f)); const row = { name: v.name.trim(), phone: v.phone.trim() || null, address: v.address.trim() || null, invoice_prefix: v.invoice_prefix.toUpperCase(), receipt_prefix: v.receipt_prefix.toUpperCase(), default_due_day: Number(v.default_due_day) };
    await run(S.db.from('organizations').update(row).eq('id', o.id), 'সংরক্ষণ হয়েছে'); Object.assign(S.org, row); chrome(); };
  $('#addM')?.addEventListener('click', () => formSheet({ title: 'টিম সদস্য যোগ করুন', submit: 'যোগ করুন', fields: html`<p class="small muted">সদস্যকে আগে Rentora-তে নিজের ইমেইল দিয়ে সাইন আপ করতে বলুন, তারপর সেই ইমেইল এখানে লিখুন।</p>
    ${field('ইমেইল', html`<input class="input" name="email" type="email" required>`)}${field('ভূমিকা', html`<select class="input" name="role">${opts({ manager: 'ম্যানেজার', accountant: 'হিসাবরক্ষক' })}</select>`)}`,
    onSubmit: async v => { await run(S.db.rpc('add_org_member', { p_org: o.id, p_email: v.email.trim(), p_role: v.role }), 'সদস্য যোগ হয়েছে'); pageSettings(); } }));
  $$('[data-rm]').forEach(b => b.onclick = async () => { if (await confirmSheet('এই সদস্যকে টিম থেকে বাদ দেবেন?', 'বাদ দিন')) { await run(S.db.rpc('remove_org_member', { p_org: o.id, p_user: b.dataset.rm }), 'বাদ দেওয়া হয়েছে'); pageSettings(); } });
  $('#exp')?.addEventListener('click', async () => { const data = await run(S.db.rpc('export_org_data', { p_org: o.id })); download(`rentora-backup-${todayISO()}.json`, JSON.stringify(data, null, 2)); });
  $('#pw').onclick = () => formSheet({ title: 'পাসওয়ার্ড বদলান', fields: html`${field('নতুন পাসওয়ার্ড', html`<input class="input" name="pw" type="password" minlength="8" required autocomplete="new-password">`, 'কমপক্ষে ৮ অক্ষর')}`,
    onSubmit: async v => { await run(S.db.auth.updateUser({ password: v.pw }), 'পাসওয়ার্ড বদলানো হয়েছে'); } });
  $('#th').onclick = toggleTheme; $('#lo').onclick = logout;
}

// ---------------- Onboarding (new landlord) ----------------
function onboarding() {
  $('.side').style.display = 'none'; $('#bottomNav').hidden = true; $('#fab').hidden = true; $('#pageTitle').textContent = 'Rentora-তে স্বাগতম';
  view().innerHTML = String(html`<section class="panel" style="max-width:560px;margin:2rem auto"><h2>আপনার ব্যবসার অ্যাকাউন্ট খুলুন</h2>
    <p class="muted" style="margin:.4rem 0 1rem">${n(14)} দিন সম্পূর্ণ ফ্রি। কোনো কার্ড লাগবে না।</p>
    <form class="form" id="ob">${field('বাড়ি বা ব্যবসার নাম', html`<input class="input" name="name" required minlength="2" maxlength="120" placeholder="যেমন: রহমান প্রপার্টিজ">`)}
      ${field('মোবাইল', html`<input class="input" name="phone" inputmode="tel" pattern="\\+?[0-9 \\-]{6,20}" placeholder="01XXXXXXXXX">`)}${field('ঠিকানা', html`<input class="input" name="address" maxlength="300">`)}
      <div class="form-error" hidden></div><button class="btn primary block">শুরু করুন</button></form>
    <p class="small muted" style="margin-top:1rem">ভাড়াটিয়া হিসেবে লগইন করেছেন? আপনার বাড়িওয়ালাকে Rentora-তে আপনার এই ইমেইলটি দিতে বলুন: <b>${S.user.email}</b></p>
    <p style="margin-top:.6rem"><button class="link-btn" id="obOut">লগ আউট</button></p></section>`);
  $('#obOut').onclick = logout;
  $('#ob').onsubmit = async e => { e.preventDefault(); const f = e.target, err = $('.form-error', f); err.hidden = true; if (!f.checkValidity()) { f.reportValidity(); return; }
    const v = Object.fromEntries(new FormData(f));
    const { error } = await S.db.rpc('create_organization', { p_name: v.name.trim(), p_phone: v.phone.trim() || null, p_address: v.address.trim() || null });
    if (error) { err.textContent = errText(error); err.hidden = false; return; }
    location.reload(); };
}

boot();
