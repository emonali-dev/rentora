-- Cover remaining foreign keys flagged by the Supabase performance advisor.
create index if not exists ledger_entries_created_by_idx on public.ledger_entries(created_by);
create index if not exists organizations_created_by_idx on public.organizations(created_by);
create index if not exists payments_received_by_idx on public.payments(received_by);
create index if not exists subscription_payments_reviewed_by_idx on public.subscription_payments(reviewed_by);
create index if not exists subscription_payments_submitted_by_idx on public.subscription_payments(submitted_by);
