-- Add Facebook as a tracked platform and persist scrape progress for refreshes.

alter table public.tracked_accounts
  drop constraint if exists tracked_accounts_platform_check;
alter table public.tracked_accounts
  add constraint tracked_accounts_platform_check
  check (platform in ('instagram', 'tiktok', 'facebook'));

alter table public.posts
  drop constraint if exists posts_platform_check;
alter table public.posts
  add constraint posts_platform_check
  check (platform in ('instagram', 'tiktok', 'facebook'));

create table if not exists public.scrape_state (
  id text primary key default 'current',
  status jsonb not null,
  updated_at timestamptz not null default now()
);

alter table public.scrape_state enable row level security;

insert into public.scrape_state (id, status)
values (
  'current',
  '{"state":"idle","startedAt":null,"finishedAt":null,"current":0,"total":0,"account":null,"scanned":0,"matched":0,"inserted":0,"updated":0,"error":null,"results":[]}'::jsonb
)
on conflict (id) do nothing;

insert into public.tracked_accounts (platform, username, display_name)
values (
  'facebook',
  'https://www.facebook.com/profile.php?id=100068606020113',
  'Facebook profile 100068606020113'
)
on conflict (platform, username) do nothing;
