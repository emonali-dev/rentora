// Tenant portal: my home, what I owe, my invoices and receipts.
import { getClient, exitDemo, html, raw, esc, $, $$, n, tk, monthLabel, dateBn, LABEL, chip, icon, openSheet, initTheme, toggleTheme, poweredBy, demoBanner, printDoc, bnDigits, todayISO, errText } from './core.js';

initTheme(); demoBanner();
const db = await getClient();
const { data: { session } } = await db.auth.getSession();
if (!session) location.replace('index.html');
$('#themeBtn').innerHTML = String(icon('moon')); $('#themeBtn').onclick = toggleTheme;
$('#logoutBtn').onclick = async () => { await db.auth.signOut(); exitDemo(); location.replace('index.html'); };

await db.rpc('link_my_tenant_records');
const uid = session.user.id;
const { data: me } = await db.from('tenants').select('*').eq('user_id', uid);
if (!me?.length) {
  $('#view').innerHTML = String(html`<section class="panel" style="max-width:560px;margin:2rem auto"><div class="empty"><div class="art">${icon('home')}</div><h2>এখনো কোনো বাসা যুক্ত হয়নি</h2>
    <p>আপনার বাড়িওয়ালাকে Rentora-তে আপনার এই ইমেইলটি দিতে বলুন: <b>${session.user.email}</b>। তিনি যোগ করলে এখানে আপনার বিল ও রসিদ দেখা যাবে।</p>
    <a class="btn" href="app.html">আমি বাড়িওয়ালা — নিজের অ্যাকাউন্ট খুলব</a></div></section>`);
} else {
  const tIds = me.map(t => t.id);
  const [{ data: leases }, { data: invoices }, { data: payments }, { data: units }, { data: buildings }, { data: properties }, { data: orgs }] = await Promise.all([
    db.from('leases').select('*').in('tenant_id', tIds), db.from('invoices').select('*').in('tenant_id', tIds).order('period', { ascending: false }),
    db.from('payments').select('*').in('tenant_id', tIds).order('paid_on', { ascending: false }), db.from('units').select('*'), db.from('buildings').select('*'), db.from('properties').select('*'), db.from('organizations').select('*')]);
  const U = id => units.find(x => x.id === id), B = id => buildings.find(x => x.id === id), P = id => properties.find(x => x.id === id), O = id => orgs.find(x => x.id === id);
  const place = u => u ? `${P(B(u.building_id)?.property_id)?.name || ''}, ${B(u.building_id)?.name || ''} · ${u.name}` : '';
  const due = i => Number(i.subtotal) - Number(i.paid_amount);
  const valid = invoices.filter(i => i.status !== 'void');
  const open = valid.filter(i => ['unpaid', 'partial'].includes(i.status));
  const totalDue = open.reduce((s, i) => s + due(i), 0);
  const nextDue = [...open].sort((a, b) => a.due_date.localeCompare(b.due_date))[0];
  const active = leases.filter(l => l.status === 'active');
  $('#view').innerHTML = String(html`
    <p class="muted" style="margin-bottom:.8rem">আসসালামু আলাইকুম, <b>${me[0].full_name}</b></p>
    <section class="ledger-hero"><div class="row"><div><div class="label">${totalDue > 0 ? 'আপনার মোট বকেয়া' : 'সব ভাড়া পরিশোধিত'}</div><div class="big num">${tk(totalDue)}</div></div>
      ${nextDue ? html`<div class="of">শেষ তারিখ ${dateBn(nextDue.due_date)}${nextDue.due_date < todayISO() ? ' — পার হয়ে গেছে' : ''}</div>` : ''}</div>
      <div class="hero-figs">${active.map(l => html`<div><span class="label">${O(l.org_id)?.name}</span><b>${place(U(l.unit_id))}</b><span class="label num">মাসিক ভাড়া ${tk(l.monthly_rent)} · প্রতি মাসের ${n(l.due_day)} তারিখের মধ্যে</span></div>`)}</div></section>
    ${active.length && O(active[0].org_id)?.phone ? html`<p class="small muted" style="margin:.8rem 0">বাড়িওয়ালার সাথে যোগাযোগ: <a href="tel:${O(active[0].org_id).phone}">${bnDigits(O(active[0].org_id).phone)}</a></p>` : ''}
    <section class="panel" style="margin-top:1rem"><h2 style="margin-bottom:.4rem">ইনভয়েস</h2>
      ${valid.length ? html`<div class="list">${valid.map(i => html`<div class="list-row click" data-inv="${i.id}"><div><div class="title">${monthLabel(i.period)}</div><div class="sub">${i.invoice_no} · শেষ তারিখ ${dateBn(i.due_date)}</div></div>
        <div class="right"><b class="num">${tk(i.subtotal)}</b>${chip(['unpaid', 'partial'].includes(i.status) && i.due_date < todayISO() ? 'overdue' : i.status)}</div></div>`)}</div>` : html`<p class="muted">এখনো কোনো ইনভয়েস নেই।</p>`}</section>
    <section class="panel"><h2 style="margin-bottom:.4rem">টাকা জমার রসিদ</h2>
      ${payments.length ? html`<div class="list">${payments.map(p => html`<div class="list-row click" data-pay="${p.id}"><div><div class="title">${p.receipt_no}</div><div class="sub">${dateBn(p.paid_on)} · ${LABEL.method[p.method]}</div></div><div class="right"><b class="num">${tk(p.amount)}</b></div></div>`)}</div>` : html`<p class="muted">এখনো কোনো রসিদ নেই।</p>`}</section>
    <p class="small muted" style="text-align:center;margin-top:1.5rem">Rentora · ${poweredBy()}</p>`);

  const head = (org, title, no) => `<div class="doc-head"><div><h2>${esc(org?.name || '')}</h2><div>${esc(org?.address || '')}</div></div><div style="text-align:right"><h2>${esc(title)}</h2><div>${esc(no)}</div></div></div>`;
  $$('[data-inv]').forEach(r => r.onclick = async () => {
    const i = invoices.find(x => x.id === r.dataset.inv);
    const { data: items, error } = await db.from('invoice_items').select('*').eq('invoice_id', i.id).order('created_at');
    if (error) return alertSheet(errText(error));
    const doc = `<div class="doc">${head(O(i.org_id), 'ইনভয়েস', i.invoice_no)}<div>${esc(me.find(t => t.id === i.tenant_id)?.full_name)} — ${esc(place(U(i.unit_id)))}<br>মাস: <b>${esc(monthLabel(i.period))}</b> · শেষ তারিখ: <b>${esc(dateBn(i.due_date))}</b></div>
      <table><tbody>${items.map(x => `<tr><td>${esc(x.description)}</td><td class="r">${esc(tk(x.amount))}</td></tr>`).join('')}<tr class="total"><td>মোট</td><td class="r">${esc(tk(i.subtotal))}</td></tr><tr><td>পরিশোধিত</td><td class="r">${esc(tk(i.paid_amount))}</td></tr><tr><td><b>বকেয়া</b></td><td class="r"><b>${esc(tk(due(i)))}</b></td></tr></tbody></table>
      <span class="stamp ${i.status === 'paid' ? '' : 'unpaid'}">${esc(LABEL.status[i.status])}</span><div class="foot"><span></span><span>Rentora · Powered by SIDDIQIYA Technology</span></div></div>`;
    const d = openSheet({ wide: true, title: 'ইনভয়েস ' + i.invoice_no, body: raw(doc), foot: html`<button class="btn" data-print>${icon('print')}প্রিন্ট / PDF</button>` });
    $('[data-print]', d).onclick = () => printDoc(doc);
  });
  $$('[data-pay]').forEach(r => r.onclick = () => {
    const p = payments.find(x => x.id === r.dataset.pay), i = invoices.find(x => x.id === p.invoice_id);
    const doc = `<div class="doc">${head(O(p.org_id), 'টাকা জমার রসিদ', p.receipt_no)}<p><b>${esc(tk(p.amount))}</b> জমা হয়েছে, ${esc(dateBn(p.paid_on))} তারিখে (${esc(LABEL.method[p.method])})।</p>
      <table><tbody><tr><td>ইনভয়েস</td><td class="r">${esc(i?.invoice_no || '')} (${esc(i ? monthLabel(i.period) : '')})</td></tr><tr class="total"><td>জমা</td><td class="r">${esc(tk(p.amount))}</td></tr></tbody></table>
      <span class="stamp">গৃহীত</span><div class="foot"><span></span><span>Rentora · Powered by SIDDIQIYA Technology</span></div></div>`;
    const d = openSheet({ wide: true, title: 'রসিদ ' + p.receipt_no, body: raw(doc), foot: html`<button class="btn" data-print>${icon('print')}প্রিন্ট / PDF</button>` });
    $('[data-print]', d).onclick = () => printDoc(doc);
  });
}
function alertSheet(msg) { openSheet({ title: 'সমস্যা', body: html`<p>${msg}</p>` }); }
