-- Critical security fix: storage buckets were open to anonymous upload, delete,
-- and listing. Restrict to authenticated users matching the app's role model.

-- ---------------------------------------------------------------------------
-- 1. Remove all public/anon storage policies on job file buckets
-- ---------------------------------------------------------------------------

drop policy if exists "Allow All Action d4nm80_0" on storage.objects;
drop policy if exists "Allow All Action d4nm80_1" on storage.objects;
drop policy if exists "Allow All Action d4nm80_2" on storage.objects;
drop policy if exists "Allow All Action d4nm80_3" on storage.objects;
drop policy if exists "Allow All Action mjc347_0" on storage.objects;
drop policy if exists "Allow All Action mjc347_1" on storage.objects;
drop policy if exists "Allow All Action mjc347_2" on storage.objects;
drop policy if exists "Allow All Action mjc347_3" on storage.objects;
drop policy if exists "Allow public deletes" on storage.objects;
drop policy if exists "Allow public deletes blueprints" on storage.objects;
drop policy if exists "Allow public deletes submittals" on storage.objects;
drop policy if exists "Allow public reads" on storage.objects;
drop policy if exists "Allow public reads blueprints" on storage.objects;
drop policy if exists "Allow public reads submittals" on storage.objects;
drop policy if exists "Allow public uploads" on storage.objects;
drop policy if exists "Allow public uploads blueprints" on storage.objects;
drop policy if exists "Allow public uploads submittals" on storage.objects;
drop policy if exists "proposals_public_read" on storage.objects;
drop policy if exists "submittals_read" on storage.objects;

-- ---------------------------------------------------------------------------
-- 2. Authenticated read + owner/crew write (mirrors public table RLS)
--    Buckets stay public=true so getPublicUrl() keeps working for known paths.
-- ---------------------------------------------------------------------------

create policy "blueprints_authenticated_read"
  on storage.objects for select
  to authenticated
  using (bucket_id = 'blueprints');

create policy "blueprints_owner_crew_write"
  on storage.objects for insert
  to authenticated
  with check (
    bucket_id = 'blueprints'
    and "current_role"() = any (array['owner', 'crew'])
  );

create policy "blueprints_owner_crew_update"
  on storage.objects for update
  to authenticated
  using (
    bucket_id = 'blueprints'
    and "current_role"() = any (array['owner', 'crew'])
  );

create policy "blueprints_owner_crew_delete"
  on storage.objects for delete
  to authenticated
  using (
    bucket_id = 'blueprints'
    and "current_role"() = any (array['owner', 'crew'])
  );

create policy "site_photos_authenticated_read"
  on storage.objects for select
  to authenticated
  using (bucket_id = 'site-photos');

create policy "site_photos_owner_crew_write"
  on storage.objects for insert
  to authenticated
  with check (
    bucket_id = 'site-photos'
    and "current_role"() = any (array['owner', 'crew'])
  );

create policy "site_photos_owner_crew_update"
  on storage.objects for update
  to authenticated
  using (
    bucket_id = 'site-photos'
    and "current_role"() = any (array['owner', 'crew'])
  );

create policy "site_photos_owner_crew_delete"
  on storage.objects for delete
  to authenticated
  using (
    bucket_id = 'site-photos'
    and "current_role"() = any (array['owner', 'crew'])
  );

create policy "submittals_authenticated_read"
  on storage.objects for select
  to authenticated
  using (bucket_id = 'submittals');

create policy "proposals_authenticated_read"
  on storage.objects for select
  to authenticated
  using (bucket_id = 'proposals');

-- submittals_write and proposals_owner_write already cover owner/crew and owner writes.

-- ---------------------------------------------------------------------------
-- 3. Stop exposing SECURITY DEFINER helpers to anonymous callers
-- ---------------------------------------------------------------------------

revoke execute on function public."current_role"() from public, anon;
revoke execute on function public.is_owner() from public, anon;
grant execute on function public."current_role"() to authenticated;
grant execute on function public.is_owner() to authenticated;
