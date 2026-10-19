-- Make sure Lindsey Ranzau and Megan Stuart are tracked and active.
-- https://www.instagram.com/lindseyranzau/
-- https://www.instagram.com/meganstuartt/
-- Both were seeded in 0001, but re-activate them in case they were removed or
-- switched off since.
insert into public.tracked_accounts (platform, username, display_name, active) values
  ('instagram', 'lindseyranzau', 'Lindsey Ranzau', true),
  ('instagram', 'meganstuartt',  'Megan Stuart',   true)
on conflict (platform, username) do update set active = true;
