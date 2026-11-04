-- Password + email OTP protection for Velfrok administrator sessions.
-- Apply this migration in the Supabase SQL Editor before enabling the Auth Hook.

create table if not exists public.admin_email_otp_challenges (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  session_id uuid not null unique,
  otp_hash text,
  expires_at timestamptz not null,
  attempts integer not null default 0 check (attempts >= 0 and attempts <= 5),
  verified_at timestamptz,
  verified_until timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists admin_email_otp_challenges_user_id_idx
  on public.admin_email_otp_challenges(user_id);

alter table public.admin_email_otp_challenges enable row level security;
revoke all on public.admin_email_otp_challenges from public, anon, authenticated;
grant all on public.admin_email_otp_challenges to service_role;

-- Supabase Custom Access Token Hook: add a server-derived verification claim
-- only after the OTP for this exact authenticated session has been verified.
create or replace function public.custom_access_token_hook(event jsonb)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  claims jsonb := event -> 'claims';
  event_user_id uuid;
  event_session_id uuid;
  otp_verified boolean := false;
begin
  event_user_id := nullif(event ->> 'user_id', '')::uuid;
  event_session_id := nullif(claims ->> 'session_id', '')::uuid;

  if event_user_id is not null and event_session_id is not null then
    select exists (
      select 1
      from public.admin_email_otp_challenges c
      where c.user_id = event_user_id
        and c.session_id = event_session_id
        and c.verified_at is not null
        and c.verified_until > pg_catalog.now()
    )
    into otp_verified;
  end if;

  claims := pg_catalog.jsonb_set(
    pg_catalog.coalesce(claims, '{}'::jsonb),
    '{admin_email_otp_verified}',
    pg_catalog.to_jsonb(otp_verified),
    true
  );

  return pg_catalog.jsonb_build_object('claims', claims);
end;
$$;

revoke all on function public.custom_access_token_hook(jsonb) from public;
grant usage on schema public to supabase_auth_admin;
grant execute on function public.custom_access_token_hook(jsonb) to supabase_auth_admin;

-- Keep every existing RLS policy and RPC check routed through this central guard.
create or replace function public.is_verified_admin()
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select
    auth.uid() is not null
    and coalesce(auth.jwt() ->> 'admin_email_otp_verified', 'false') = 'true'
    and exists (
      select 1
      from public.velfrok_admins a
      where a.user_id = auth.uid()
        and a.role = 'admin'
    );
$$;

revoke all on function public.is_verified_admin() from public;
grant execute on function public.is_verified_admin() to authenticated;
