-- Audit fixes (12 Nov 2026): faster policies, foreign-key indexes, and correcting a wrongly recorded payment.

-- Evaluate auth.uid() once per query instead of once per row.
drop policy padmin_self on public.platform_admins;
create policy padmin_self on public.platform_admins for select to authenticated using (user_id = (select auth.uid()) or public.is_platform_admin());
drop policy members_read on public.org_members;
create policy members_read on public.org_members for select to authenticated using (user_id = (select auth.uid()) or public.has_org_role(org_id, array['owner']) or public.is_platform_admin());
drop policy profile_self on public.profiles;
create policy profile_self on public.profiles for all to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
drop policy profile_admin on public.profiles;
create policy profile_admin on public.profiles for select to authenticated using (public.is_platform_admin()
  or exists(select 1 from public.org_members a join public.org_members b on a.org_id = b.org_id where a.user_id = (select auth.uid()) and b.user_id = profiles.user_id));
drop policy tenants_self on public.tenants;
create policy tenants_self on public.tenants for select to authenticated using (user_id = (select auth.uid()));
drop policy orgs_self on public.organizations;
create policy orgs_self on public.organizations for select to authenticated using (id in (select org_id from public.tenants where user_id = (select auth.uid())));

-- Indexes covering the composite (row, org) foreign keys used for isolation.
create index if not exists buildings_property_org_idx on public.buildings(property_id, org_id);
create index if not exists units_building_org_idx on public.units(building_id, org_id);
create index if not exists units_parent_org_idx on public.units(parent_unit_id, org_id);
create index if not exists leases_tenant_org_idx on public.leases(tenant_id, org_id);
create index if not exists leases_unit_org_idx on public.leases(unit_id, org_id);
create index if not exists invoices_lease_org_idx on public.invoices(lease_id, org_id);
create index if not exists invoices_tenant_org_idx on public.invoices(tenant_id, org_id);
create index if not exists invoices_unit_org_idx on public.invoices(unit_id, org_id);
create index if not exists invoice_items_invoice_org_idx on public.invoice_items(invoice_id, org_id);
create index if not exists payments_invoice_org_idx on public.payments(invoice_id, org_id);
create index if not exists ledger_property_org_idx on public.ledger_entries(property_id, org_id);
create index if not exists utility_unit_org_idx on public.utility_bills(unit_id, org_id);
create index if not exists utility_invoice_idx on public.utility_bills(invoice_id);
create index if not exists outbox_invoice_idx on public.notification_outbox(related_invoice_id);
create index if not exists subpay_org_idx on public.subscription_payments(org_id);
create index if not exists subpay_plan_idx on public.subscription_payments(plan_code);
create index if not exists org_plan_idx on public.organizations(plan_code);

-- Owner removes a payment entered by mistake. The invoice due is restored, the automatic income line
-- is removed with it, and the full payment is kept in the audit log with the reason.
create or replace function public.delete_payment(p_payment uuid, p_reason text)
returns void language plpgsql security definer set search_path = public as $$
declare p record;
begin
  select * into p from public.payments where id = p_payment for update;
  if not found then raise exception 'পেমেন্ট পাওয়া যায়নি' using errcode = 'P0002'; end if;
  perform public.require_writable(p.org_id, array['owner']);
  if length(trim(coalesce(p_reason, ''))) < 3 then raise exception 'মুছে ফেলার কারণ লিখুন' using errcode = '22023'; end if;
  insert into public.audit_log(org_id, actor, action, entity, entity_id, details)
  values (p.org_id, auth.uid(), 'delete_payment', 'payments', p.id, jsonb_build_object('payment', to_jsonb(p), 'reason', left(trim(p_reason), 300)));
  delete from public.payments where id = p_payment;   -- its income line is removed by the foreign key
  perform public.recalc_invoice(p.invoice_id);
end $$;
revoke all on function public.delete_payment(uuid, text) from public, anon;
grant execute on function public.delete_payment(uuid, text) to authenticated;
