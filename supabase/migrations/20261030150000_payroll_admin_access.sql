-- Payroll, everyone's time, and the day map are limited to payroll admins:
-- Preston Watson, Carol Murray, Greg Williamson, Squeaky Wheel. Crew keep reading/writing
-- their own shifts and segments (Time Card + Start) exactly as before.
-- Idempotent: safe to run more than once.

alter table public.user_roles
  add column if not exists payroll_admin boolean not null default false;

update public.user_roles set payroll_admin = true
 where user_id in (
   '2fdd9e29-af29-4d81-8288-7d19241cfc2f', -- Preston Watson
   '7b05bd0a-c260-4d2e-a4a3-2af66fa9d25c', -- Carol Murray
   '7464ecf7-ed10-429d-8bc2-dab9814b6597', -- Greg Williamson
   'fb7e48b7-a611-48e0-965f-fd84272031a6'  -- Squeaky Wheel (squeaky@solidcoreplumb.com)
 )
   and payroll_admin is distinct from true;

create or replace function public.is_payroll_admin()
returns boolean
language sql
stable
security definer
set search_path to 'public'
as $$
  select coalesce((select payroll_admin from public.user_roles where user_id = auth.uid()), false)
$$;

-- For the app's UI gate.
create or replace function public.my_payroll_access()
returns boolean
language sql
stable
security definer
set search_path to 'public'
as $$
  select public.is_payroll_admin()
$$;

revoke all on function public.is_payroll_admin() from public, anon;
revoke all on function public.my_payroll_access() from public, anon;
grant execute on function public.is_payroll_admin() to authenticated, service_role;
grant execute on function public.my_payroll_access() to authenticated, service_role;

-- Nobody can flip the flag from the app: user_roles has RLS with only a
-- SELECT policy (no insert/update/delete policies), so client writes are denied.

-- payroll_clear_approvals is SECURITY DEFINER with no permission check; it is
-- only meant to be called from the payroll RPCs (which run as the owner role).
revoke execute on function public.payroll_clear_approvals(uuid, timestamptz) from public, anon, authenticated;

-- ── Read policies: own rows, or payroll admin (was: own, owner, or office) ──
-- Insert/update/delete policies for crew own-rows are not touched.

drop policy if exists shifts_select on public.shifts;
create policy shifts_select on public.shifts for select
  using ((user_id = (select auth.uid())) or public.is_payroll_admin());

drop policy if exists time_segments_select on public.time_segments;
create policy time_segments_select on public.time_segments for select
  using ((user_id = (select auth.uid())) or public.is_payroll_admin());

drop policy if exists shift_battery_samples_select on public.shift_battery_samples;
create policy shift_battery_samples_select on public.shift_battery_samples for select
  using ((user_id = (select auth.uid())) or public.is_payroll_admin());

drop policy if exists payroll_approvals_select on public.payroll_approvals;
create policy payroll_approvals_select on public.payroll_approvals for select
  using ((user_id = (select auth.uid())) or public.is_payroll_admin());

drop policy if exists payroll_approvals_insert on public.payroll_approvals;
create policy payroll_approvals_insert on public.payroll_approvals for insert
  with check (public.is_payroll_admin() and (approved_by = (select auth.uid())));

drop policy if exists payroll_approvals_delete on public.payroll_approvals;
create policy payroll_approvals_delete on public.payroll_approvals for delete
  using (public.is_payroll_admin());

drop policy if exists payroll_edit_audit_select on public.payroll_edit_audit;
create policy payroll_edit_audit_select on public.payroll_edit_audit for select
  using ((worker_user_id = (select auth.uid())) or public.is_payroll_admin());

drop policy if exists payroll_settings_update on public.payroll_settings;
create policy payroll_settings_update on public.payroll_settings for update
  using (public.is_payroll_admin())
  with check (public.is_payroll_admin());

-- ── Owner payroll RPCs: payroll admins only ────────────────────────────────
-- Same bodies as live; only the permission check changes. Done by rewriting
-- the stored definition so the function logic is preserved exactly.
do $$
declare
  fn text;
  def text;
begin
  foreach fn in array array[
    'public.payroll_edit_segment(uuid,text,bigint,text,timestamptz,timestamptz,boolean,text)',
    'public.payroll_insert_segment(uuid,text,timestamptz,timestamptz,bigint,text,text)',
    'public.payroll_delete_segment(uuid,text)',
    'public.payroll_edit_shift(uuid,timestamptz,timestamptz,text)'
  ] loop
    def := pg_get_functiondef(fn::regprocedure);
    if position('if not is_owner() then' in def) > 0 then
      def := replace(def, 'if not is_owner() then', 'if not public.is_payroll_admin() then');
      def := replace(def, 'Only an owner can edit payroll.', 'Only a payroll admin can edit payroll.');
      execute def;
    end if;
  end loop;
end
$$;
