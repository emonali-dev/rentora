// Login, sign-up and password reset for landlords and tenants.
// Leaving a demo: the login page always starts from the real backend.
try { sessionStorage.removeItem('basha_demo'); } catch {}
const { getClient, IS_DEMO, DEMO_ALLOWED, $, $$, errText, poweredBy, initTheme, langButton } = await import('./core.js');
initTheme();
$('#langSlot').append(langButton('btn sm'));
if (DEMO_ALLOWED) $('#demoBox').hidden = false;
['#pw1', '#pw2', '#pw3'].forEach(s => { const el = $(s); if (el) el.innerHTML = String(poweredBy()); });

const qs = new URLSearchParams(location.search);
let mode = qs.get('signup') ? 'signup' : 'login', role = qs.get('role') === 'tenant' ? 'tenant' : 'owner';
const form = $('#authForm'), err = $('.form-error', form), ok = $('.form-ok', form);
const show = (box, msg) => { err.hidden = ok.hidden = true; if (msg) { box.textContent = msg; box.hidden = false; } };

function render() {
  const signup = mode === 'signup', reset = mode === 'reset';
  $('#formTitle').textContent = reset ? 'পাসওয়ার্ড রিসেট' : signup ? (role === 'owner' ? 'বাড়িওয়ালার অ্যাকাউন্ট খুলুন' : 'ভাড়াটিয়ার অ্যাকাউন্ট খুলুন') : 'লগইন করুন';
  $('#formLead').textContent = reset ? 'আপনার ইমেইলে রিসেট লিংক পাঠানো হবে।' : signup ? (role === 'owner' ? '১৪ দিন সম্পূর্ণ ফ্রি। কোনো কার্ড লাগবে না।' : 'বাড়িওয়ালাকে দেওয়া ইমেইলটি ব্যবহার করুন।') : 'আপনার ইমেইল ও পাসওয়ার্ড দিন।';
  $('#nameField').hidden = !signup; $('#passField').hidden = reset;
  $('[name=password]').autocomplete = signup ? 'new-password' : 'current-password';
  $('#submitBtn').textContent = reset ? 'রিসেট লিংক পাঠান' : signup ? 'অ্যাকাউন্ট খুলুন' : 'লগইন';
  $('#modeBtn').textContent = signup || reset ? 'আগের অ্যাকাউন্টে লগইন করুন' : 'নতুন অ্যাকাউন্ট খুলুন';
  $('#forgotBtn').hidden = reset;
  $('#tenantHint').hidden = role !== 'tenant';
  $$('.role-tabs button').forEach(b => b.setAttribute('aria-pressed', b.dataset.role === role));
  show();
}
$$('.role-tabs button').forEach(b => b.onclick = () => { role = b.dataset.role; render(); });
$('#modeBtn').onclick = () => { mode = mode === 'login' ? 'signup' : 'login'; render(); };
$('#forgotBtn').onclick = () => { mode = 'reset'; render(); };

render();
const db = await getClient();
if (IS_DEMO) {
  show(err, 'এই সাইট এখনো সার্ভারের সাথে যুক্ত হয়নি। নিচের ডেমো বাটন দিয়ে সফটওয়্যারটি দেখে নিন।');
  $('#submitBtn').disabled = true;
} else {
  const { data: { session } } = await db.auth.getSession();
  if (session) go();
  // Arrived from a password-reset email: ask for the new password.
  db.auth.onAuthStateChange(ev => { if (ev === 'PASSWORD_RECOVERY') { mode = 'newpass'; $('#formTitle').textContent = 'নতুন পাসওয়ার্ড দিন'; $('#nameField').hidden = true; $('[name=email]').closest('.field').hidden = true; $('#submitBtn').textContent = 'পাসওয়ার্ড সংরক্ষণ'; } });
}

async function go() {
  // Where does this user belong? Landlord team, tenant portal, or super admin.
  const { data: { user } } = await db.auth.getUser();
  const [{ data: mem }, { data: adm }] = await Promise.all([db.from('org_members').select('org_id').eq('user_id', user.id), db.from('platform_admins').select('user_id').eq('user_id', user.id)]);
  if (role === 'tenant') { location.replace('tenant.html'); return; }
  if (mem?.length) { location.replace('app.html'); return; }
  if (adm?.length) { location.replace('admin.html'); return; }
  const { data: linked } = await db.rpc('link_my_tenant_records');
  const { data: t } = await db.from('tenants').select('id').eq('user_id', user.id);
  location.replace(linked > 0 || t?.length ? 'tenant.html' : 'app.html');
}

form.addEventListener('submit', async e => {
  e.preventDefault(); show();
  const v = Object.fromEntries(new FormData(form)); const email = (v.email || '').trim();
  if (mode !== 'newpass' && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return show(err, 'সঠিক ইমেইল দিন।');
  if (mode !== 'reset' && (v.password || '').length < 8) return show(err, 'পাসওয়ার্ড কমপক্ষে ৮ অক্ষরের হতে হবে।');
  const btn = $('#submitBtn'); btn.disabled = true;
  try {
    if (mode === 'login') {
      const { error } = await db.auth.signInWithPassword({ email, password: v.password }); if (error) throw error; await go();
    } else if (mode === 'signup') {
      if (!(v.full_name || '').trim()) throw new Error('আপনার নাম লিখুন।');
      const { data, error } = await db.auth.signUp({ email, password: v.password, options: { data: { full_name: v.full_name.trim(), role }, emailRedirectTo: location.origin + location.pathname.replace(/[^/]*$/, '') + (role === 'tenant' ? 'tenant.html' : 'app.html') } });
      if (error) throw error;
      if (data.session) { await db.from('profiles').upsert({ user_id: data.user.id, full_name: v.full_name.trim() }); await go(); }
      else show(ok, `${email} ঠিকানায় একটি যাচাই লিংক পাঠানো হয়েছে। লিংকে ক্লিক করে লগইন করুন।`);
    } else if (mode === 'reset') {
      const { error } = await db.auth.resetPasswordForEmail(email, { redirectTo: location.origin + location.pathname }); if (error) throw error;
      show(ok, 'ইমেইল থাকলে সেখানে রিসেট লিংক পাঠানো হয়েছে। ইনবক্স ও স্প্যাম ফোল্ডার দেখুন।');
    } else if (mode === 'newpass') {
      const { error } = await db.auth.updateUser({ password: v.password }); if (error) throw error; show(ok, 'নতুন পাসওয়ার্ড সংরক্ষণ হয়েছে।'); setTimeout(go, 800);
    }
  } catch (ex) { show(err, errText(ex)); }
  finally { btn.disabled = IS_DEMO; }
});
