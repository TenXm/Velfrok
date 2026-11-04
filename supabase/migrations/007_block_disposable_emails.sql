-- 007: Block disposable email domains for Velfrok authentication.
-- Run after migrations 001-006 in the Supabase SQL Editor.

begin;

create table if not exists public.disposable_email_domains (
  domain text primary key,
  created_at timestamptz not null default now(),
  constraint disposable_email_domains_domain_format
    check (domain = lower(btrim(domain)) and domain !~ '[[:space:]@]')
);

insert into public.disposable_email_domains (domain) values
  ('10minutemail.com'),
  ('10minutemail.net'),
  ('temp-mail.org'),
  ('tempmail.com'),
  ('tempmail.net'),
  ('tempmail.org'),
  ('mailinator.com'),
  ('mailinator.net'),
  ('yopmail.com'),
  ('yopmail.fr'),
  ('guerrillamail.com'),
  ('guerrillamail.net'),
  ('guerrillamail.org'),
  ('sharklasers.com'),
  ('grr.la'),
  ('getnada.com'),
  ('dispostable.com'),
  ('fakeinbox.com'),
  ('maildrop.cc'),
  ('trashmail.com'),
  ('trashmail.net'),
  ('trashmail.org'),
  ('tempail.com'),
  ('minuteinbox.com'),
  ('emailondeck.com'),
  ('mohmal.com'),
  ('burnermail.io'),
  ('discard.email'),
  ('mailnesia.com'),
  ('mytemp.email'),
  ('tempinbox.com'),
  ('mintemail.com'),
  ('spamgourmet.com'),
  ('throwawaymail.com'),
  ('throwaway.email'),
  ('mailcatch.com'),
  ('tempr.email'),
  ('getairmail.com'),
  ('inboxkitten.com'),
  ('33mail.com'),
  ('mailpoof.com')
on conflict (domain) do nothing;

alter table public.disposable_email_domains enable row level security;
revoke all on table public.disposable_email_domains from anon, authenticated;

create or replace function public.reject_disposable_auth_email()
returns trigger
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_domain text;
begin
  if new.email is null then
    return new;
  end if;

  v_domain := lower(btrim(split_part(new.email, '@', 2)));

  if exists (
    select 1
    from public.disposable_email_domains d
    where d.domain = v_domain
  ) then
    raise exception using
      errcode = '23514',
      message = 'Disposable email addresses are not allowed. Please use a permanent email address.';
  end if;

  return new;
end;
$function$;

drop trigger if exists reject_disposable_auth_email on auth.users;

create trigger reject_disposable_auth_email
before insert on auth.users
for each row
execute function public.reject_disposable_auth_email();

revoke all on function public.reject_disposable_auth_email() from public, anon, authenticated;

commit;
