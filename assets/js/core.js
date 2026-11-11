// বাসা ম্যানেজার shared helpers: data client, formatting, safe HTML, dialogs, toasts, icons.
import { SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, COMPANY, COMPANY_URL } from './config.js';

const params = new URLSearchParams(location.search);
const demoParam = params.get('demo');
// ---------- Language (bn default, en optional) ----------
let langSaved = null; try { langSaved = localStorage.getItem('basha_lang'); } catch {}
export const LANG = langSaved === 'en' ? 'en' : 'bn';
export function setLang(l) { try { localStorage.setItem('basha_lang', l); } catch {} location.reload(); }
document.documentElement.lang = LANG;
document.documentElement.setAttribute('translate', 'no');

// ---------- English translation layer ----------
// The interface is written in Bengali. In English mode every text node and label is translated
// as it appears (pages, dialogs, toasts, printed documents), so no screen can be missed.
const I18N = LANG === 'en' ? await import('./i18n-en.js') : null;
const BN_LETTER = '[\\u0980-\\u09E5\\u09F0-\\u09FF]';
const toLatin = s => s.replace(/[\u09E6-\u09EF]/g, d => String(d.charCodeAt(0) - 0x09E6));
let trMap = null, trRe = null;
if (I18N) {
  trMap = new Map(); for (const [k, v] of I18N.PHRASES) trMap.set(toLatin(k), v);
  const keys = [...trMap.keys()].sort((a, b) => b.length - a.length).map(k => k.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
  trRe = new RegExp(`(?<!${BN_LETTER})(?:${keys.join('|')})(?!${BN_LETTER})`, 'g');
}
export function tr(s) {
  if (!trRe || !s || !/[\u0980-\u09FF]/.test(s)) return s;
  s = toLatin(s);
  const core = s.trim(), whole = trMap.get(core) ?? trMap.get(core.replace(/[।?]$/, ''));
  if (whole !== undefined) return s.replace(core, whole + (trMap.has(core) ? '' : (core.endsWith('?') ? '?' : '.')));
  for (const [re, to] of I18N.RULES) s = s.replace(re, to);
  return s.replace(trRe, m => trMap.get(m));
}
const TR_ATTRS = ['placeholder', 'aria-label', 'title', 'alt'];
function trTree(root) {
  if (root.nodeType === 3) { const t = tr(root.data); if (t !== root.data) root.data = t; return; }
  if (root.nodeType !== 1 || root.closest?.('[data-notr], script, style')) return;
  const w = document.createTreeWalker(root, NodeFilter.SHOW_TEXT | NodeFilter.SHOW_ELEMENT, { acceptNode: n => n.nodeType === 1 && (n.hasAttribute('data-notr') || n.tagName === 'SCRIPT' || n.tagName === 'STYLE') ? NodeFilter.FILTER_REJECT : NodeFilter.FILTER_ACCEPT });
  for (let n = root; n; n = w.nextNode()) {
    if (n.nodeType === 3) { const t = tr(n.data); if (t !== n.data) n.data = t; }
    else if (n.dataset?.en !== undefined && n.textContent !== n.dataset.en) n.textContent = n.dataset.en;
    else for (const a of TR_ATTRS) { const v = n.getAttribute?.(a); if (v) { const t = tr(v); if (t !== v) n.setAttribute(a, t); } }
  }
}
if (I18N) {
  const run = () => { trTree(document.body); document.title = tr(document.title); };
  run();
  new MutationObserver(ms => { for (const m of ms) {
    if (m.type === 'attributes') { const v = m.target.getAttribute(m.attributeName); const t = tr(v); if (v && t !== v) m.target.setAttribute(m.attributeName, t); }
    else for (const n of m.addedNodes) trTree(n);
  } }).observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: TR_ATTRS });
  new MutationObserver(() => { const t = tr(document.title); if (t !== document.title) document.title = t; }).observe(document.querySelector('title') || document.head, { childList: true, subtree: true, characterData: true });
}
if (demoParam) { try { sessionStorage.setItem('basha_demo', demoParam); } catch {} }
let storedDemo = null; try { storedDemo = sessionStorage.getItem('basha_demo'); } catch {}
// Demo mode (sample data in the browser) never runs on the live site.
const DEV_HOST = /^(localhost|127\.0\.0\.1|\[::1\])$/.test(location.hostname) || location.protocol === 'file:';
export const DEMO_ALLOWED = DEV_HOST || !SUPABASE_URL;
export const DEMO_ROLE = DEMO_ALLOWED ? (demoParam || storedDemo || (!SUPABASE_URL ? 'none' : null)) : null;
export const IS_DEMO = !!DEMO_ROLE;

let client;
export async function getClient() {
  if (client) return client;
  if (IS_DEMO) {
    const { createDemoClient } = await import('./demo.js');
    client = createDemoClient(DEMO_ROLE);
  } else {
    const { createClient } = await import('https://esm.sh/@supabase/supabase-js@2.45.4');
    client = createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, { auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true } });
  }
  return client;
}
export function exitDemo() { try { sessionStorage.removeItem('basha_demo'); } catch {} }

// ---------- Safe HTML ----------
const ESC = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
export const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ESC[c]);
class Raw { constructor(s) { this.s = s; } toString() { return this.s; } }
export const raw = s => new Raw(s);
export function html(strings, ...vals) {
  let out = strings[0];
  vals.forEach((v, i) => {
    if (Array.isArray(v)) out += v.map(x => x instanceof Raw ? x.s : esc(x)).join('');
    else out += v instanceof Raw ? v.s : (v === false || v == null ? '' : esc(v));
    out += strings[i + 1];
  });
  return raw(out);
}
export const $ = (s, el = document) => el.querySelector(s);
export const $$ = (s, el = document) => [...el.querySelectorAll(s)];

// ---------- Formatting (Bengali numerals for money and dates) ----------
const bnNum = new Intl.NumberFormat(LANG === 'en' ? 'en-IN' : 'bn-BD', { maximumFractionDigits: 2 });
export const n = v => bnNum.format(Number(v || 0));
export const tk = v => '৳' + bnNum.format(Number(v || 0));
const MONTHS = LANG === 'en'
  ? ['January','February','March','April','May','June','July','August','September','October','November','December']
  : ['জানুয়ারি','ফেব্রুয়ারি','মার্চ','এপ্রিল','মে','জুন','জুলাই','আগস্ট','সেপ্টেম্বর','অক্টোবর','নভেম্বর','ডিসেম্বর'];
const MONTHS_SHORT = LANG === 'en'
  ? ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']
  : ['জানু','ফেব্রু','মার্চ','এপ্রিল','মে','জুন','জুলাই','আগস্ট','সেপ্টে','অক্টো','নভে','ডিসে'];
export const bnDigits = s => LANG === 'en' ? String(s) : String(s).replace(/[0-9]/g, d => '০১২৩৪৫৬৭৮৯'[d]);
export function monthLabel(iso) { const [y, m] = String(iso).split('-'); return `${MONTHS[Number(m) - 1]} ${bnDigits(y)}`; }
export function shortMonth(iso) { const [, m] = String(iso).split('-'); return MONTHS_SHORT[Number(m) - 1]; }
export function dateBn(iso) { if (!iso) return '—'; const [y, m, d] = String(iso).slice(0, 10).split('-'); return bnDigits(`${d}/${m}/${y}`); }
export function todayISO() { const d = new Date(Date.now() + 6 * 3600e3); return d.toISOString().slice(0, 10); } // Asia/Dhaka
export function monthStart(iso = todayISO()) { return iso.slice(0, 7) + '-01'; }
export function addMonths(iso, k) { const [y, m] = iso.split('-').map(Number); const d = new Date(Date.UTC(y, m - 1 + k, 1)); return d.toISOString().slice(0, 10); }

export const LABEL = {
  status: { paid: 'পরিশোধিত', partial: 'আংশিক', unpaid: 'বকেয়া', overdue: 'মেয়াদোত্তীর্ণ', void: 'বাতিল', vacant: 'খালি', occupied: 'ভাড়া দেওয়া', maintenance: 'মেরামত চলছে',
    active: 'চালু', ended: 'শেষ', trial: 'ট্রায়াল', suspended: 'স্থগিত', cancelled: 'বাতিল', pending: 'যাচাই বাকি', approved: 'অনুমোদিত', rejected: 'বাতিল', queued: 'পাঠানোর অপেক্ষায়', sent: 'পাঠানো হয়েছে', failed: 'ব্যর্থ', unbilled: 'বিল হয়নি' },
  kind: { flat: 'ফ্ল্যাট', room: 'রুম', shop: 'দোকান', office: 'অফিস', garage: 'গ্যারেজ', other: 'অন্যান্য' },
  util: { electricity: 'বিদ্যুৎ', gas: 'গ্যাস', water: 'পানি', service: 'সার্ভিস চার্জ', internet: 'ইন্টারনেট', garbage: 'ময়লা', other: 'অন্যান্য' },
  method: { cash: 'নগদ (হাতে)', bkash: 'বিকাশ', nagad: 'নগদ (Nagad)', rocket: 'রকেট', bank: 'ব্যাংক', card: 'কার্ড', other: 'অন্যান্য' },
  role: { owner: 'মালিক', manager: 'ম্যানেজার', accountant: 'হিসাবরক্ষক' },
  propKind: { residential: 'আবাসিক', commercial: 'বাণিজ্যিক', mixed: 'মিশ্র' },
};
export const chip = (status, text) => html`<span class="chip ${status}">${text || LABEL.status[status] || status}</span>`;

// ---------- Icons (24px stroke) ----------
const P = {
  home: 'M3 10.5 12 3l9 7.5V21H3z M9 21v-6h6v6',
  building: 'M4 21V4h11v17 M15 9h5v12 M8 8h3 M8 12h3 M8 16h3',
  users: 'M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2 M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8z M22 21v-2a4 4 0 0 0-3-3.9 M16 3.1a4 4 0 0 1 0 7.8',
  receipt: 'M5 3h14v18l-3-2-2 2-2-2-2 2-2-2-3 2z M9 8h6 M9 12h6 M9 16h4',
  wallet: 'M3 7h16a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z M3 7l12-4v4 M17 13.5h.01',
  message: 'M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z',
  crown: 'M3 8l4 4 5-7 5 7 4-4-2 11H5z',
  settings: 'M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6z M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z',
  plus: 'M12 5v14 M5 12h14', more: 'M5 12h.01 M12 12h.01 M19 12h.01', logout: 'M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4 M16 17l5-5-5-5 M21 12H9',
  cash: 'M2 7h20v10H2z M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6z M6 12h.01 M18 12h.01', print: 'M6 9V2h12v7 M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2 M6 14h12v8H6z',
  bolt: 'M13 2 3 14h9l-1 8 10-12h-9z', search: 'M11 19a8 8 0 1 0 0-16 8 8 0 0 0 0 16z M21 21l-4.3-4.3', close: 'M18 6 6 18 M6 6l12 12',
  chart: 'M3 3v18h18 M7 16v-5 M12 16V8 M17 16v-9', download: 'M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4 M7 10l5 5 5-5 M12 15V3',
  sun: 'M12 17a5 5 0 1 0 0-10 5 5 0 0 0 0 10z M12 1v2 M12 21v2 M4.2 4.2l1.4 1.4 M18.4 18.4l1.4 1.4 M1 12h2 M21 12h2 M4.2 19.8l1.4-1.4 M18.4 5.6l1.4-1.4',
  moon: 'M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z', key: 'M21 2l-2 2m-7.6 7.6a5.5 5.5 0 1 1-7.8 7.8 5.5 5.5 0 0 1 7.8-7.8zm0 0L15.5 7.5m0 0 3 3L22 7l-3-3m-3.5 3.5L19 4',
  bell: 'M18 8a6 6 0 1 0-12 0c0 7-3 9-3 9h18s-3-2-3-9 M13.7 21a2 2 0 0 1-3.4 0', calendar: 'M3 5h18v16H3z M16 3v4 M8 3v4 M3 10h18',
};
export const icon = (name, cls = 'icon') => raw(`<svg class="${cls}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="${P[name] || ''}"/></svg>`);

// ---------- Toasts ----------
export function toast(msg, err = false) {
  let box = $('.toasts'); if (!box) { box = document.createElement('div'); box.className = 'toasts'; box.setAttribute('role', 'status'); box.setAttribute('aria-live', 'polite'); document.body.append(box); }
  const t = document.createElement('div'); t.className = 'toast' + (err ? ' err' : ''); t.textContent = msg; box.append(t);
  setTimeout(() => t.remove(), err ? 6000 : 3200);
}
export function errText(e) {
  const m = e?.message || String(e || '');
  if (/Invalid login credentials/i.test(m)) return 'ইমেইল বা পাসওয়ার্ড ভুল।';
  if (/Email not confirmed/i.test(m)) return 'ইমেইল এখনো যাচাই হয়নি। আপনার ইনবক্সে পাঠানো লিংকে ক্লিক করুন।';
  if (/already registered/i.test(m)) return 'এই ইমেইলে আগে থেকেই অ্যাকাউন্ট আছে। লগইন করুন।';
  if (/Password should be/i.test(m)) return 'পাসওয়ার্ড কমপক্ষে ৮ অক্ষরের হতে হবে।';
  if (/foreign key/i.test(m)) return 'এর সাথে ভাড়াটিয়া, চুক্তি বা ইনভয়েস যুক্ত আছে, তাই মুছে ফেলা যাবে না।';
  if (/duplicate key/i.test(m)) return 'এই তথ্য আগে থেকেই আছে। নাম বা নম্বর বদলে আবার চেষ্টা করুন।';
  if (/row-level security|permission denied/i.test(m)) return 'এই কাজের অনুমতি নেই, অথবা সাবস্ক্রিপশনের মেয়াদ শেষ।';
  if (/violates check constraint/i.test(m)) return 'কিছু তথ্য সঠিক ফরম্যাটে নেই। ফোন নম্বর, তারিখ ও টাকার ঘর দেখুন।';
  if (/Failed to fetch|NetworkError/i.test(m)) return 'ইন্টারনেট সংযোগ পাওয়া যাচ্ছে না। আবার চেষ্টা করুন।';
  return m || 'কিছু একটা সমস্যা হয়েছে।';
}
export async function run(promise, okMsg) {
  const { data, error } = await promise;
  if (error) { toast(errText(error), true); throw error; }
  if (okMsg) toast(okMsg);
  return data;
}

// ---------- Dialogs ----------
// openSheet({title, body, foot, wide}) -> dialog element; resolves nothing — callers wire buttons.
export function openSheet({ title, body, foot = '', wide = false, onClose }) {
  const d = document.createElement('dialog'); d.className = 'sheet' + (wide ? ' wide' : '');
  d.innerHTML = String(html`<div class="sheet-head"><h3>${title}</h3><button class="btn ghost sm" data-close aria-label="বন্ধ করুন">${icon('close')}</button></div>
    <div class="sheet-body">${raw(String(body))}</div>${foot ? html`<div class="sheet-foot">${raw(String(foot))}</div>` : ''}`);
  document.body.append(d);
  d.addEventListener('click', e => { if (e.target === d || e.target.closest('[data-close]')) d.close(); });
  d.addEventListener('close', () => { d.remove(); onClose?.(); });
  d.showModal();
  d.querySelector('input, select, textarea')?.focus();
  return d;
}
// A form dialog: fields as HTML; onSubmit(formDataObject) returns a promise; closes on success.
export function formSheet({ title, fields, submit = 'সংরক্ষণ করুন', onSubmit, wide }) {
  const d = openSheet({ title, wide, body: html`<form class="form" id="sheetForm" novalidate>${raw(String(fields))}<div class="form-error" hidden></div></form>`,
    foot: html`<button class="btn" data-close type="button">বাতিল</button><button class="btn primary" type="submit" form="sheetForm">${submit}</button>` });
  const form = d.querySelector('form');
  form.addEventListener('submit', async e => {
    e.preventDefault();
    const errBox = form.querySelector('.form-error'); errBox.hidden = true;
    if (!form.checkValidity()) { const bad = form.querySelector(':invalid'); errBox.textContent = (bad?.closest('.field')?.querySelector('span')?.textContent || 'একটি ঘর') + ' ঠিকমতো পূরণ করুন।'; errBox.hidden = false; bad?.focus(); return; }
    const data = Object.fromEntries(new FormData(form).entries());
    const btn = d.querySelector('[type=submit]'); btn.disabled = true;
    try { await onSubmit(data, form); d.close(); }
    catch (err) { errBox.textContent = errText(err); errBox.hidden = false; }
    finally { btn.disabled = false; }
  });
  return d;
}
export function confirmSheet(message, okText = 'হ্যাঁ, নিশ্চিত', danger = true) {
  return new Promise(resolve => {
    let ok = false;
    const d = openSheet({ title: 'নিশ্চিত করুন', body: html`<p>${message}</p>`,
      foot: html`<button class="btn" data-close>না</button><button class="btn ${danger ? 'danger' : 'primary'}" data-ok>${okText}</button>`, onClose: () => resolve(ok) });
    d.querySelector('[data-ok]').addEventListener('click', () => { ok = true; d.close(); });
  });
}
export const field = (label, inner, hint) => html`<label class="field"><span>${label}</span>${inner}${hint ? html`<small>${hint}</small>` : ''}</label>`;
export const opts = (map, sel) => raw(Object.entries(map).map(([v, t]) => `<option value="${esc(v)}"${String(v) === String(sel) ? ' selected' : ''}>${esc(t)}</option>`).join(''));

// ---------- Theme ----------
export function initTheme() {
  let t = null; try { t = localStorage.getItem('basha_theme'); } catch {}
  if (t) document.documentElement.dataset.theme = t;
}
export function toggleTheme() {
  const cur = document.documentElement.dataset.theme || (matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');
  const next = cur === 'dark' ? 'light' : 'dark'; document.documentElement.dataset.theme = next;
  try { localStorage.setItem('basha_theme', next); } catch {}
}
export const poweredBy = () => html`<span class="powered">Powered by <a href="${COMPANY_URL}" target="_blank" rel="noopener" style="color:inherit"><b>${COMPANY}</b></a></span>`;
export function demoBanner() {
  if (!IS_DEMO) return;
  const b = document.createElement('div'); b.className = 'demo-banner';
  b.textContent = 'ডেমো মোড: এখানে নমুনা তথ্য দেখানো হচ্ছে, কিছুই সংরক্ষিত হবে না।'; document.body.prepend(b);
}
// Language switch button (label shows the other language)
export function langButton(cls = 'btn ghost sm') {
  const b = document.createElement('button'); b.type = 'button'; b.className = cls; b.setAttribute('translate', 'no');
  b.setAttribute('data-notr', ''); b.textContent = LANG === 'en' ? 'বাংলা' : 'EN'; b.setAttribute('aria-label', LANG === 'en' ? 'বাংলায় দেখুন' : 'Switch to English');
  b.onclick = () => setLang(LANG === 'en' ? 'bn' : 'en'); return b;
}
export function download(name, text, type = 'application/json') {
  const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([text], { type })); a.download = name; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 2000);
}
export function printDoc(innerHtml) {
  let area = $('.print-area'); if (!area) { area = document.createElement('div'); area.className = 'print-area'; area.style.position = 'fixed'; area.style.left = '-9999px'; document.body.append(area); }
  area.innerHTML = innerHtml; window.print();
}
