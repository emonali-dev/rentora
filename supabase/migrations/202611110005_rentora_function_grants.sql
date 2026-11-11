-- Lock down function execution explicitly. On Supabase, new functions in public are executable
-- by anon and authenticated through default privileges owned by another role, so a schema-wide
-- revoke before the functions exist is not enough.
alter function public.bd_today() set search_path = public;

do $$ declare f record; begin
  for f in select p.oid::regprocedure as sig from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public' loop
    execute format('revoke all on function %s from public, anon, authenticated', f.sig);
  end loop;
end $$;

-- Signed-in users: only the app's entry points (each checks role and subscription itself)
-- and the helpers that Row Level Security policies call.
grant execute on function public.bd_today(), public.is_platform_admin(), public.has_org_role(uuid, text[]), public.org_writable(uuid),
  public.can_manage(uuid), public.my_tenant_ids(),
  public.create_organization(text, text, text), public.add_org_member(uuid, text, text), public.remove_org_member(uuid, uuid),
  public.generate_monthly_invoices(uuid, date), public.record_payment(uuid, numeric, text, text, date), public.void_invoice(uuid, text),
  public.queue_due_reminders(uuid), public.dashboard_summary(uuid, date), public.link_my_tenant_records(),
  public.submit_subscription_payment(uuid, text, text, text, text), public.admin_review_subscription(uuid, boolean, text),
  public.admin_update_org(uuid, text, text, text, timestamptz, timestamptz), public.admin_customers(), public.admin_overview(),
  public.admin_save_plan(text, text, text, numeric, numeric, int, jsonb, boolean),
  public.admin_save_settings(int, int, text, text, text, text, text), public.export_org_data(uuid)
to authenticated;
-- Not granted to anyone: next_number, queue_notification, recalc_invoice, require_writable and the trigger functions.
