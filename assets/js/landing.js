// বাসা ম্যানেজার public home page: features, live prices from the database, language switch.
import { SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY } from './config.js';
import { html, raw, $, $$, n, tk, icon, poweredBy, langButton, initTheme } from './core.js';

initTheme();
$('#langSlot').append(langButton('btn ghost sm'));
$('#pwFoot').innerHTML = String(poweredBy());

const FEATS = [
  ['home', 'ভাড়ার খাতা এক নজরে', 'প্রতিটি ফ্ল্যাট ও দোকানের এ মাসের অবস্থা রঙে দেখুন — পরিশোধিত, আংশিক, বকেয়া বা খালি।'],
  ['receipt', 'এক ক্লিকে মাসিক ইনভয়েস', 'সব চলমান চুক্তির ইনভয়েস একসাথে তৈরি হয়, বিদ্যুৎ, গ্যাস, পানি ও সার্ভিস চার্জসহ।'],
  ['cash', 'সাথে সাথে রসিদ', 'বিকাশ, নগদ, ব্যাংক বা হাতে টাকা — আদায় করলেই নম্বরসহ রসিদ, প্রিন্ট বা WhatsApp-এ পাঠান।'],
  ['bell', 'বকেয়া রিমাইন্ডার', 'কার কত দিনের বকেয়া দেখুন, এক ক্লিকে সবাইকে মনে করিয়ে দিন।'],
  ['chart', 'আয়-ব্যয় ও লাভ-ক্ষতি', 'ভাড়ার আয় নিজে যোগ হয়। খরচ লিখুন, মাসভিত্তিক ও সম্পত্তিভিত্তিক লাভ দেখুন।'],
  ['users', 'ভাড়াটিয়া পোর্টাল', 'ভাড়াটিয়া নিজের মোবাইলে বিল ও রসিদ দেখতে পান। বারবার ফোন করার ঝামেলা কমে।'],
  ['building', 'সব ধরনের সম্পত্তি', 'বাসা, মেস, মার্কেট, অফিস — বাড়ি › ভবন › ফ্ল্যাট/দোকান › রুম পর্যন্ত সাজান।'],
  ['key', 'টিম ও নিরাপত্তা', 'ম্যানেজার ও হিসাবরক্ষককে যুক্ত করুন, প্রত্যেকের আলাদা অনুমতি।'],
];
$('#feats').innerHTML = FEATS.map(([i, t, d]) => String(html`<div class="lp-feat"><span class="lp-ic">${icon(i)}</span><h3>${t}</h3><p>${d}</p></div>`)).join('');

// Prices come from the same table the app charges from, so the page never shows a stale price.
const FALLBACK = [
  { code: 'basic', name_bn: 'বেসিক', monthly_price: 299, yearly_price: 2990, max_units: 15, features: ['১৫টি ইউনিট পর্যন্ত', 'ভাড়া ও বকেয়া হিসাব', 'ইনভয়েস ও রসিদ', 'ইউটিলিটি বিল'] },
  { code: 'standard', name_bn: 'স্ট্যান্ডার্ড', monthly_price: 599, yearly_price: 5990, max_units: 60, features: ['৬০টি ইউনিট পর্যন্ত', 'বেসিকের সবকিছু', 'ভাড়াটিয়া পোর্টাল', 'আয়-ব্যয় রিপোর্ট', 'টিম মেম্বার'] },
  { code: 'premium', name_bn: 'প্রিমিয়াম', monthly_price: 1199, yearly_price: 11990, max_units: null, features: ['আনলিমিটেড ইউনিট', 'স্ট্যান্ডার্ডের সবকিছু', 'SMS/WhatsApp রিমাইন্ডার', 'অগ্রাধিকার সাপোর্ট'] },
];
let plans = FALLBACK, cycle = 'monthly';
const FOR = { basic: 'ছোট বাড়ি বা মেসের জন্য', standard: 'বেশিরভাগ বাড়িওয়ালার জন্য', premium: 'বড় বাড়ি, মার্কেট ও একাধিক ভবন' };
function drawPlans() {
  $$('#cyc button').forEach(b => b.setAttribute('aria-pressed', b.dataset.c === cycle));
  $('#plans').innerHTML = plans.map(p => {
    const y = cycle === 'yearly', price = y ? p.yearly_price : p.monthly_price, perDay = Math.ceil(p.monthly_price / 30);
    const save = p.monthly_price * 12 - p.yearly_price, rec = p.code === 'standard';
    return String(html`<div class="lp-plan ${rec ? 'rec' : ''}">${rec ? html`<span class="lp-badge">প্রস্তাবিত</span>` : ''}
      <h3>${p.name_bn}</h3><p class="lp-for">${FOR[p.code] || ''}</p>
      <div class="lp-price num">${tk(price)}<small> / ${y ? 'বছর' : 'মাস'}</small></div>
      <p class="lp-note">${y && save > 0 ? html`${tk(save)} সাশ্রয়` : html`দিনে মাত্র ${tk(perDay)}`}</p>
      <ul>${(p.features || []).map(f => html`<li>${f}</li>`)}</ul>
      <a class="btn ${rec ? 'gold' : 'primary'} block" href="login.html?signup=1">১৪ দিন ফ্রি শুরু করুন</a></div>`);
  }).join('');
}
$$('#cyc button').forEach(b => b.onclick = () => { cycle = b.dataset.c; drawPlans(); });
drawPlans();
if (SUPABASE_URL) {
  fetch(`${SUPABASE_URL}/rest/v1/plans?select=code,name_bn,monthly_price,yearly_price,max_units,features&active=eq.true&order=sort`, { headers: { apikey: SUPABASE_PUBLISHABLE_KEY } })
    .then(r => r.ok ? r.json() : null).then(d => { if (Array.isArray(d) && d.length) { plans = d.map(p => ({ ...p, monthly_price: Number(p.monthly_price), yearly_price: Number(p.yearly_price) })); drawPlans(); } })
    .catch(() => {});
}
