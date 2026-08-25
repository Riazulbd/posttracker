-- ════════════════════════════════════════════════════════════════════════
--  Make scrape runs observable.
--
--  Problem this fixes: the dashboard's "Last scrape" was derived from
--  tracked_accounts.last_scraped_at, which is only written when an account
--  scrapes *successfully*. A run where every account errored therefore left
--  the header showing the last good run (e.g. "Aug 14") even though a scrape
--  had just happened — with no visible trace of the failures.
--
--  Now every run is recorded, and every account records its last attempt and
--  last error independently of its last success.
-- ════════════════════════════════════════════════════════════════════════

-- ── Per-run history ─────────────────────────────────────────────────────
create table if not exists public.scrape_runs (
  id              uuid primary key default gen_random_uuid(),
  trigger         text not null default 'manual',   -- manual | cron | script
  started_at      timestamptz not null default now(),
  finished_at     timestamptz,
  ok              boolean,                          -- null while running
  accounts_total  integer not null default 0,
  accounts_ok     integer not null default 0,
  accounts_failed integer not null default 0,
  scanned         integer not null default 0,
  matched         integer not null default 0,
  inserted        integer not null default 0,
  updated         integer not null default 0,
  error           text,
  results         jsonb not null default '[]'::jsonb
);

create index if not exists scrape_runs_started_idx
  on public.scrape_runs (started_at desc);

alter table public.scrape_runs enable row level security;

-- ── Per-account attempt / error tracking ────────────────────────────────
alter table public.tracked_accounts
  add column if not exists last_attempted_at timestamptz;
alter table public.tracked_accounts
  add column if not exists last_error text;
