-- Proposal & Change Order PDF archive bucket.
--
-- The ProposalModal / ChangeOrderModal generators always download the PDF
-- client-side, then make a best-effort upload to a Storage bucket named
-- 'proposals' (mirroring the existing 'blueprints' bucket). If the bucket does
-- not exist the upload degrades gracefully and the download still succeeds.
--
-- Storage buckets cannot be created from the anon client, so run this migration
-- (or create the bucket manually in the Supabase dashboard) to enable archiving.
-- NOTE: not run automatically — apply via `supabase db push` or the dashboard.

insert into storage.buckets (id, name, public)
values ('proposals', 'proposals', false)
on conflict (id) do nothing;

-- Allow authenticated users to read/write objects in the 'proposals' bucket.
create policy "proposals_authenticated_read"
  on storage.objects for select
  to authenticated
  using (bucket_id = 'proposals');

create policy "proposals_authenticated_insert"
  on storage.objects for insert
  to authenticated
  with check (bucket_id = 'proposals');
