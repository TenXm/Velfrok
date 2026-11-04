-- Velfrok Admin email OTP hardening.
-- The challenge table is private to trusted server-side code and the Auth hook.
begin;

alter table public.admin_email_otp_challenges enable row level security;
revoke all on table public.admin_email_otp_challenges from public, anon, authenticated;
grant select, insert, update, delete on table public.admin_email_otp_challenges to service_role;

-- Atomically consume a correct OTP exactly once. The caller must already have
-- authenticated the Supabase user and checked admin membership.
create or replace function public.admin_email_otp_consume(
  p_user_id uuid,
  p_session_id uuid,
  p_otp_hash text
) returns boolean
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.admin_email_otp_challenges
     set verified_at = now(),
         verified_until = now() + interval '12 hours',
         otp_hash = null
   where user_id = p_user_id
     and session_id = p_session_id
     and otp_hash = p_otp_hash
     and verified_at is null
     and expires_at > now()
     and attempts < 5;

  return found;
end;
$$;

revoke all on function public.admin_email_otp_consume(uuid, uuid, text) from public, anon, authenticated;
grant execute on function public.admin_email_otp_consume(uuid, uuid, text) to service_role;

-- Auth invokes this SECURITY DEFINER hook after token refresh. It only needs
-- execute permission; the hook itself reads the private challenge table.
grant usage on schema public to supabase_auth_admin;
grant execute on function public.custom_access_token_hook(jsonb) to supabase_auth_admin;
revoke execute on function public.custom_access_token_hook(jsonb) from public, anon, authenticated;

commit;
