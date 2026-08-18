-- Persistent AI memory + technician skills for the in-app dispatch assistant.
-- Documentation + runnable against the hosted project.

-- Crew abilities the AI (and Team roster) can read/write.
alter table public.technicians
  add column if not exists skills text[] not null default '{}';

comment on column public.technicians.skills is
  'Free-form ability tags (e.g. Rough, Top-out, Trim, water heaters). Used by AI scheduling.';

-- Long-lived facts the AI learns across chat sessions.
create table if not exists public.ai_memories (
  id uuid primary key default gen_random_uuid(),
  category text not null default 'general'
    check (category = any (array[
      'crew_ability',
      'schedule_rule',
      'site_note',
      'preference',
      'customer_note',
      'general'
    ])),
  subject text null,
  technician_id uuid null references public.technicians(id) on delete set null,
  content text not null,
  source text not null default 'ai'
    check (source = any (array['user', 'ai', 'system'])),
  created_by uuid null,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists ai_memories_active_updated_idx
  on public.ai_memories (active, updated_at desc);

create index if not exists ai_memories_technician_id_idx
  on public.ai_memories (technician_id)
  where technician_id is not null;

create index if not exists ai_memories_category_idx
  on public.ai_memories (category)
  where active;

alter table public.ai_memories enable row level security;

drop policy if exists ai_memories_read on public.ai_memories;
create policy ai_memories_read
  on public.ai_memories for select
  to authenticated
  using (true);

drop policy if exists ai_memories_insert on public.ai_memories;
create policy ai_memories_insert
  on public.ai_memories for insert
  to authenticated
  with check ("current_role"() = any (array['owner', 'crew']));

drop policy if exists ai_memories_update on public.ai_memories;
create policy ai_memories_update
  on public.ai_memories for update
  to authenticated
  using ("current_role"() = any (array['owner', 'crew']))
  with check ("current_role"() = any (array['owner', 'crew']));

drop policy if exists ai_memories_delete on public.ai_memories;
create policy ai_memories_delete
  on public.ai_memories for delete
  to authenticated
  using ("current_role"() = any (array['owner', 'crew']));
