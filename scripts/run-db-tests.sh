#!/bin/bash
# Rebuilds the Rentora database from supabase/migrations on a throwaway PostgreSQL
# and runs the security/behaviour tests. Never point this at production.
# usage: scripts/run-db-tests.sh <repo-dir> <psql connection args, e.g. -h localhost -p 5432>
set -u
REPO=$1; shift
P="psql $* -U postgres -q"
$P -d postgres -c "drop database if exists rentora_ci" -c "create database rentora_ci" >/dev/null 2>&1 || { echo "CANNOT CREATE TEST DATABASE"; exit 2; }
$P -d rentora_ci -v ON_ERROR_STOP=1 -f $REPO/supabase/tests/00_supabase_stub.sql >/dev/null 2>/tmp/stub_err || { echo "STUB SETUP FAILED"; cat /tmp/stub_err; exit 2; }
for f in $(ls $REPO/supabase/migrations/*.sql | sort); do
  $P -d rentora_ci -v ON_ERROR_STOP=1 -f $f >/dev/null 2>/tmp/mig_err || { echo "MIGRATION FAIL $f"; cat /tmp/mig_err; exit 1; }
done
for t in $(ls $REPO/supabase/tests/[1-9]*_tests.sql | sort); do
  $P -d rentora_ci -t -A -f $t 2>&1
done | grep -E '^(ok|FAIL)|ERROR:' | sed 's/^psql:.*ERROR:/FAIL unexpected error:/' > /tmp/rentora_out
echo "ok: $(grep -c '^ok' /tmp/rentora_out)  fail: $(grep -c FAIL /tmp/rentora_out)"
grep FAIL /tmp/rentora_out && exit 1 || exit 0
