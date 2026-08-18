-- DOCUMENTATION ONLY — apply manually on the hosted project (keyldymctpsvdjllliio).
-- Grants Carol Murray full owner access (all nav items, edit, bids, proposals).

insert into public.user_roles (user_id, email, full_name, role)
select
  u.id,
  'carol@itdgconstruction.com',
  'Carol Murray',
  'owner'
from auth.users u
where u.email = 'carol@itdgconstruction.com'
on conflict (user_id) do update
  set role = 'owner',
      email = excluded.email,
      full_name = excluded.full_name;
