-- Phase dependency support: inspection must pass before Trim.
-- Documentation migration (apply on hosted project).

ALTER TABLE public.jobs
  ADD COLUMN IF NOT EXISTS inspection_passed boolean NOT NULL DEFAULT false;

-- Normalize legacy phase labels onto the new pipeline.
UPDATE public.jobs SET phase = 'Trim' WHERE phase IN ('Trim/Finish', 'Trim/finish');
UPDATE public.jobs SET phase = 'Rough-In' WHERE phase IN ('Underground', 'Rough', 'Rough In');
UPDATE public.jobs SET phase = 'Top-Out' WHERE phase IN ('Topout', 'Top Out', 'Top-out');
