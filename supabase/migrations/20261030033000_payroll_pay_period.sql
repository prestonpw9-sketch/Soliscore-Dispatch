-- ITDG pay week runs Thursday-Wednesday, paid every two weeks.
-- Current biweekly pay period started Thursday 2026-10-22 (through Wed 2026-11-04).
-- Overtime stays per workweek (> 40 h, Thu-Wed).
--
-- Only adds columns to payroll_settings and updates its single row. Idempotent.
-- week_start_dow keeps its existing encoding: 0 = Sunday ... 6 = Saturday, so Thursday = 4.

alter table public.payroll_settings
  add column if not exists pay_period_length_days smallint not null default 14
    check (pay_period_length_days in (7, 14));

alter table public.payroll_settings
  add column if not exists pay_period_anchor_date date not null default date '2026-10-22';

comment on column public.payroll_settings.pay_period_length_days is
  'Pay period length in days (14 = biweekly). Must be whole pay weeks.';
comment on column public.payroll_settings.pay_period_anchor_date is
  'First day of any pay period (Phoenix date); periods repeat every pay_period_length_days from it. Should fall on week_start_dow.';

update public.payroll_settings
   set week_start_dow = 4,
       pay_period_length_days = 14,
       pay_period_anchor_date = date '2026-10-22',
       updated_at = now()
 where id;
