-- Documentation migration: milestone dates for Schedule Calendar view.
-- Applied to hosted project keyldymctpsvdjllliio via MCP apply_migration.

ALTER TABLE public.jobs
  ADD COLUMN IF NOT EXISTS inspection_date text,
  ADD COLUMN IF NOT EXISTS deadline_date text,
  ADD COLUMN IF NOT EXISTS material_arrival_date text;
