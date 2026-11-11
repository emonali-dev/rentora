# বাসা ম্যানেজার (Basha Manager) — চালু করার নির্দেশনা

বাসা ম্যানেজার (Basha Manager) সম্পূর্ণ আলাদা: নিজস্ব GitHub রিপো, নিজস্ব Supabase প্রজেক্ট, নিজস্ব সাবডোমেইন।
**hsdmj.com ওয়েবসাইট, তার রিপো বা তার Supabase ডাটাবেসে কোনো পরিবর্তন করতে হবে না।**
DNS-এ শুধু একটি নতুন রেকর্ড যোগ হবে, পুরনো কোনো রেকর্ড বদলাবে না।

মোট সময়: ৩০–৪৫ মিনিট।

---

## ধাপ ১ — GitHub রিপো

1. github.com-এ `emonali-dev` অ্যাকাউন্টে **New repository** খুলুন।
   - নাম: `rentora`
   - Public (GitHub Pages ফ্রিতে চালাতে)। কোডে কোনো গোপন তথ্য নেই; সব ডেটা সুরক্ষিত থাকে Supabase-এ।
   - README বা অন্য কিছু যোগ করবেন না (খালি রিপো)।
2. এই ফোল্ডারের সব ফাইল সেই রিপোর `main` ব্রাঞ্চে পুশ করুন।

## ধাপ ২ — নতুন Supabase প্রজেক্ট

> ✅ **সম্পন্ন (১১ নভেম্বর ২০২৬):** প্রজেক্ট `rentora` (ref `jjmzutebvwaeckcsvgyd`, Singapore, ফ্রি প্ল্যান) তৈরি, ৫টি মাইগ্রেশন চালানো, `config.js`-এ URL ও publishable key বসানো হয়েছে। বাকি শুধু নিচের ৩ ও ৪ নম্বর (Auth সেটিংস)।

1. supabase.com › আপনার অর্গানাইজেশন › **New project**
   - নাম: `rentora`
   - Region: **Southeast Asia (Singapore)** — বাংলাদেশ থেকে সবচেয়ে দ্রুত
   - শক্তিশালী ডাটাবেস পাসওয়ার্ড দিন এবং নিরাপদে লিখে রাখুন।
   > ফ্রি প্ল্যানে একটি অর্গানাইজেশনে ২টি পর্যন্ত সক্রিয় প্রজেক্ট রাখা যায়। hsdmj.com-এর প্রজেক্ট ১টি, বাসা ম্যানেজার ২য়টি হবে।
   > ফ্রি প্রজেক্ট ১ সপ্তাহ অব্যবহৃত থাকলে Supabase সাময়িক বন্ধ (pause) করে দেয়। গ্রাহক নেওয়া শুরু হলে Pro প্ল্যান ($25/মাস) নিন — এতে প্রতিদিনের স্বয়ংক্রিয় ব্যাকআপও পাওয়া যায়।
2. **SQL Editor** খুলে `supabase/full_schema.sql` একবারে চালান (অথবা `supabase/migrations/` ফোল্ডারের ফাইলগুলো ক্রমানুসারে):
   1. `202611110001_rentora_core.sql`
   2. `202611110002_rentora_security.sql`
   3. `202611110003_rentora_functions.sql`
   4. `202611110004_rentora_profiles.sql`
   5. `202611110005_rentora_function_grants.sql`
   6. `202611120001_rentora_audit_fixes.sql`
   7. `202611120002_basha_manager_rename.sql`
3. **Authentication › URL Configuration**
   - Site URL: `https://rentora.hsdmj.com`
   - Redirect URLs-এ যোগ করুন: `https://rentora.hsdmj.com/**`
4. **Authentication › Sign In / Providers › Email**: "Confirm email" চালু রাখুন। (ভাড়াটিয়া পোর্টাল যাচাই করা ইমেইল দিয়েই কাজ করে।)
5. **Authentication › Emails › SMTP**: বেশি গ্রাহক হলে নিজের SMTP (যেমন Resend, Brevo) যুক্ত করুন। Supabase-এর নিজস্ব ইমেইল ঘণ্টায় খুব অল্প কয়েকটি পাঠায়।
6. **Project Settings › API** থেকে দুটি তথ্য কপি করুন:
   - Project URL (যেমন `https://abcd1234.supabase.co`)
   - Publishable key (`sb_publishable_...`)
7. রিপোর `assets/js/config.js` ফাইলে বসান:
   ```js
   export const SUPABASE_URL = 'https://abcd1234.supabase.co';
   export const SUPABASE_PUBLISHABLE_KEY = 'sb_publishable_...';
   ```
   > কখনো `service_role` বা `secret` কি এখানে বসাবেন না।

## ধাপ ৩ — নিজেকে Super Admin বানান

1. সাইট চালু হওয়ার পর `https://rentora.hsdmj.com` থেকে নিজের ইমেইলে একটি অ্যাকাউন্ট খুলুন এবং ইমেইল যাচাই করুন।
2. Supabase › SQL Editor-এ চালান (ইমেইল বদলে নিন):
   ```sql
   insert into public.platform_admins(user_id)
   select id from auth.users where email = 'আপনার-ইমেইল@example.com';
   ```
3. `https://rentora.hsdmj.com/admin.html` খুলুন › **সেটিংস** ট্যাবে বিকাশ/নগদ নম্বর, ট্রায়ালের দিন ইত্যাদি দিন।
   **প্যাকেজ** ট্যাবে দাম ঠিক করুন (এখনকার দাম: বেসিক ৳২৯৯, স্ট্যান্ডার্ড ৳৫৯৯, প্রিমিয়াম ৳১,১৯৯ প্রতি মাসে)।

## ধাপ ৪ — GitHub Pages

1. রিপো › **Settings › Pages**
   - Source: **Deploy from a branch** › Branch: `main` › Folder: `/ (root)` › Save
   - Custom domain: `rentora.hsdmj.com` › Save (রিপোতে `CNAME` ফাইল আগে থেকেই আছে)
2. DNS ঠিক হওয়ার পর **Enforce HTTPS** টিক দিন (সার্টিফিকেট তৈরি হতে ১৫–৬০ মিনিট লাগতে পারে)।

## ধাপ ৫ — DNS (শুধু একটি নতুন রেকর্ড)

hsdmj.com-এর DNS যেখানে ম্যানেজ হয় (ডোমেইন রেজিস্ট্রার বা Cloudflare), সেখানে **নতুন** রেকর্ড যোগ করুন:

| Type | Name/Host | Value/Target | TTL |
|---|---|---|---|
| CNAME | `rentora` | `emonali-dev.github.io` | Auto |

- Cloudflare ব্যবহার করলে প্রথমে **Proxy status: DNS only** (ধূসর মেঘ) রাখুন, যাতে GitHub HTTPS সার্টিফিকেট দিতে পারে।
- `@`, `www` বা অন্য কোনো পুরনো রেকর্ড বদলাবেন না, মুছবেন না।
- যাচাই: কয়েক মিনিট পর `https://rentora.hsdmj.com` খুলুন।

## ধাপ ৬ — রাতের স্বয়ংক্রিয় ব্যাকআপ

রিপোতে `.github/workflows/backup.yml` আছে। এটি প্রতি রাতে ২:১৭-তে (ঢাকা সময়) পুরো ডাটাবেস এনক্রিপ্ট করে রাখে, ৩০ দিন পর্যন্ত।

1. Supabase › **Connect** › **Session pooler** connection string কপি করুন (পাসওয়ার্ডসহ)।
2. রিপো › Settings › Secrets and variables › Actions › **New repository secret**:
   - `RENTORA_DB_URL` = সেই connection string
   - `BACKUP_PASSPHRASE` = লম্বা একটি গোপন বাক্য। **এটি অফলাইনে লিখে রাখুন** — এটা ছাড়া ব্যাকআপ খোলা যাবে না।
3. Actions › "Nightly database backup" › **Run workflow** দিয়ে একবার পরীক্ষা করুন।

ব্যাকআপ থেকে ফেরত আনা:
```bash
gpg --decrypt basha-manager-YYYYMMDD-HHMM.sql.gz.gpg | gunzip > basha-manager.sql
psql "নতুন-ডাটাবেসের-URL" -f basha-manager.sql
```
এছাড়া প্রতিটি বাড়িওয়ালা **সেটিংস › সব তথ্য ডাউনলোড** থেকে নিজের তথ্যের JSON কপি রাখতে পারেন।

## ধাপ ৭ — চালুর পর যাচাই (১০ মিনিট)

- [ ] `https://rentora.hsdmj.com` খোলে, তালার চিহ্ন (HTTPS) আছে
- [ ] নতুন বাড়িওয়ালা অ্যাকাউন্ট খোলা যায়, ইমেইল যাচাইয়ের লিংক আসে
- [ ] সম্পত্তি › ভবন › ফ্ল্যাট যোগ করা যায়
- [ ] ভাড়াটিয়া যোগ করে ফ্ল্যাটে বসানো যায়
- [ ] ইনভয়েস তৈরি, টাকা জমা ও রসিদ প্রিন্ট হয়
- [ ] ভাড়াটিয়ার ইমেইল দিয়ে আলাদা অ্যাকাউন্ট খুললে tenant পোর্টালে নিজের বিল দেখা যায়
- [ ] Super Admin থেকে পেমেন্ট অনুমোদন করলে গ্রাহকের মেয়াদ বাড়ে
- [ ] https://hsdmj.com আগের মতোই চলছে

## SMS / WhatsApp চালু করা (পরবর্তী ধাপ)

সব বার্তা এখন `notification_outbox` টেবিলে `queued` অবস্থায় জমা হয়, আর বাড়িওয়ালা চাইলে প্রতিটি বার্তা এক ক্লিকে নিজের WhatsApp থেকে পাঠাতে পারেন।
স্বয়ংক্রিয়ভাবে পাঠাতে একটি SMS প্রোভাইডার (যেমন BulkSMSBD, SSL Wireless, Alpha SMS) বা WhatsApp Business API বেছে নিন।
তারপর একটি Supabase Edge Function বানানো হবে, যা প্রতি কয়েক মিনিটে `queued` বার্তা পাঠিয়ে `sent`/`failed` করবে। প্রোভাইডারের API key থাকবে শুধু Edge Function-এর secret-এ।

## পরীক্ষা চালানো (ডেভেলপারদের জন্য)

```bash
bash scripts/run-db-tests.sh . -h localhost -p 5432   # ১০৯টি নিরাপত্তা ও হিসাবের টেস্ট
python3 tests/smoke.py .                             # ডেমো ক্লিক-থ্রু
```
প্রতিটি পুশে GitHub Actions এগুলো নিজে চালায়।
