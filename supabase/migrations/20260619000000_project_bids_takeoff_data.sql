-- Bid Estimator persistence.
--
-- The rebuilt 4-page Bid Estimator (src/components/Bidestimator.tsx) stores the
-- entire BidDocument (page1, page1a, page2, page3, summary) as JSON in the
-- project_bids.takeoff_data column. The existing QuickBidEstimator already reads
-- and writes takeoff_data, so this column is assumed to exist.
--
-- This migration is DOCUMENTATION ONLY — do NOT run it blindly. Apply only the
-- statements that are actually missing in your environment.

-- Ensure the table can hold the takeoff JSON document.
alter table if exists public.project_bids
  add column if not exists takeoff_data jsonb;

-- Columns the estimator also writes on save (already present in current schema):
alter table if exists public.project_bids
  add column if not exists project_name text;

alter table if exists public.project_bids
  add column if not exists is_master boolean default false;

alter table if exists public.project_bids
  add column if not exists total_cost numeric;
