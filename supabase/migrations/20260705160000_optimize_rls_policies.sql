-- RLS performance: split ALL write policies so they no longer duplicate
-- SELECT coverage from read_all_auth, and consolidate overlapping SELECT policies.

-- ---------------------------------------------------------------------------
-- Helper: tables using read_all_auth + write_owner_crew pattern
-- ---------------------------------------------------------------------------

do $$
declare
  t text;
begin
  foreach t in array array[
    'builders', 'cache_breaker', 'customers', 'dispatch_messages',
    'job_tasks', 'jobs', 'projects', 'submittals', 'task_updates', 'technicians'
  ]
  loop
    execute format('drop policy if exists write_owner_crew on public.%I', t);

    execute format($p$
      create policy write_owner_crew_insert on public.%1$I
        for insert to authenticated
        with check ("current_role"() = any (array['owner', 'crew']))
    $p$, t);

    execute format($p$
      create policy write_owner_crew_update on public.%1$I
        for update to authenticated
        using ("current_role"() = any (array['owner', 'crew']))
        with check ("current_role"() = any (array['owner', 'crew']))
    $p$, t);

    execute format($p$
      create policy write_owner_crew_delete on public.%1$I
        for delete to authenticated
        using ("current_role"() = any (array['owner', 'crew']))
    $p$, t);
  end loop;
end $$;

-- ---------------------------------------------------------------------------
-- job_technicians: replace broad ALL policy with read + owner/crew write
-- ---------------------------------------------------------------------------

drop policy if exists "Allow authenticated access" on public.job_technicians;

create policy read_all_auth
  on public.job_technicians for select
  to authenticated
  using (true);

create policy write_owner_crew_insert
  on public.job_technicians for insert
  to authenticated
  with check ("current_role"() = any (array['owner', 'crew']));

create policy write_owner_crew_update
  on public.job_technicians for update
  to authenticated
  using ("current_role"() = any (array['owner', 'crew']))
  with check ("current_role"() = any (array['owner', 'crew']));

create policy write_owner_crew_delete
  on public.job_technicians for delete
  to authenticated
  using ("current_role"() = any (array['owner', 'crew']));

-- ---------------------------------------------------------------------------
-- user_roles: one SELECT policy (own row OR owner reads all)
-- Uses (select auth.uid()) to avoid per-row re-evaluation.
-- ---------------------------------------------------------------------------

drop policy if exists user_roles_owner_read_all on public.user_roles;
drop policy if exists user_roles_read_own on public.user_roles;

create policy user_roles_read
  on public.user_roles for select
  to authenticated
  using (user_id = (select auth.uid()) or is_owner());

-- ---------------------------------------------------------------------------
-- sms_opt_outs: split owner write from read
-- ---------------------------------------------------------------------------

drop policy if exists optouts_write on public.sms_opt_outs;

create policy optouts_write_insert
  on public.sms_opt_outs for insert
  to authenticated
  with check (is_owner());

create policy optouts_write_update
  on public.sms_opt_outs for update
  to authenticated
  using (is_owner())
  with check (is_owner());

create policy optouts_write_delete
  on public.sms_opt_outs for delete
  to authenticated
  using (is_owner());

-- ---------------------------------------------------------------------------
-- Storage: split ALL write policies that duplicate authenticated_read
-- ---------------------------------------------------------------------------

drop policy if exists submittals_write on storage.objects;

create policy submittals_owner_crew_insert
  on storage.objects for insert
  to authenticated
  with check (
    bucket_id = 'submittals'
    and "current_role"() = any (array['owner', 'crew'])
  );

create policy submittals_owner_crew_update
  on storage.objects for update
  to authenticated
  using (
    bucket_id = 'submittals'
    and "current_role"() = any (array['owner', 'crew'])
  );

create policy submittals_owner_crew_delete
  on storage.objects for delete
  to authenticated
  using (
    bucket_id = 'submittals'
    and "current_role"() = any (array['owner', 'crew'])
  );

drop policy if exists proposals_owner_write on storage.objects;

create policy proposals_owner_insert
  on storage.objects for insert
  to authenticated
  with check (bucket_id = 'proposals' and is_owner());

create policy proposals_owner_update
  on storage.objects for update
  to authenticated
  using (bucket_id = 'proposals' and is_owner())
  with check (bucket_id = 'proposals' and is_owner());

create policy proposals_owner_delete
  on storage.objects for delete
  to authenticated
  using (bucket_id = 'proposals' and is_owner());
