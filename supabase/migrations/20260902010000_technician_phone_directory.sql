-- Plumber directory: crew cell numbers + on-call flag.
-- Used by the roster UI, Twilio emergency paging, and the in-house AI contact_crew tool.
-- Documentation + runnable against the hosted project.

alter table public.technicians
  add column if not exists phone text,
  add column if not exists emergency_contact boolean not null default false;

comment on column public.technicians.phone is
  'Crew cell in E.164 (e.g. +15205551234). Used by the plumber directory, Twilio emergency SMS, and the in-house AI contact_crew tool.';

comment on column public.technicians.emergency_contact is
  'When true, inbound Twilio emergencies (and AI on-call paging) text/call this tech.';

create index if not exists technicians_emergency_contact_idx
  on public.technicians (emergency_contact)
  where emergency_contact and phone is not null;
