-- Documentation-only for the hosted project (already applied).
-- service_role-only RPC so edge functions can read Twilio creds from Vault
-- when Edge Function env secrets are truncated/missing.
-- This project exposes PostgREST as schema `api` (not `public`).

create or replace function api.get_twilio_edge_secrets()
returns jsonb
language sql
stable
security definer
set search_path = vault, public, api
as $$
  select coalesce(
    jsonb_object_agg(name, decrypted_secret),
    '{}'::jsonb
  )
  from vault.decrypted_secrets
  where name in ('TWILIO_ACCOUNT_SID', 'TWILIO_AUTH_TOKEN', 'TWILIO_PHONE_NUMBER');
$$;

grant usage on schema api to service_role;
revoke all on function api.get_twilio_edge_secrets() from public;
revoke all on function api.get_twilio_edge_secrets() from anon;
revoke all on function api.get_twilio_edge_secrets() from authenticated;
grant execute on function api.get_twilio_edge_secrets() to service_role;

-- Keep a public alias for documentation; this project's PostgREST default schema is `api`.
create or replace function public.get_twilio_edge_secrets()
returns jsonb
language sql
stable
security definer
set search_path = vault, public, api
as $$
  select api.get_twilio_edge_secrets();
$$;

revoke all on function public.get_twilio_edge_secrets() from public;
revoke all on function public.get_twilio_edge_secrets() from anon;
revoke all on function public.get_twilio_edge_secrets() from authenticated;
grant execute on function public.get_twilio_edge_secrets() to service_role;
