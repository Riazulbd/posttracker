-- Trackable keywords managed from the dashboard instead of hardcoded env vars.
create table if not exists public.tracked_keywords (
  id uuid primary key default gen_random_uuid(),
  keyword text not null unique,
  active boolean not null default true,
  created_at timestamptz not null default now()
);

alter table public.tracked_keywords enable row level security;

insert into public.tracked_keywords (keyword, active)
values ('arthursjewelers', true)
on conflict (keyword) do nothing;
