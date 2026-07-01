-- Track an additional Instagram account: brownboysbenefit
-- https://www.instagram.com/brownboysbenefit/
insert into public.tracked_accounts (platform, username, display_name) values
  ('instagram', 'brownboysbenefit', 'Brown Boys Benefit')
on conflict (platform, username) do nothing;
