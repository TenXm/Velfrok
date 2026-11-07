-- Durable, private Admin audit history.
begin;

create table if not exists public.admin_audit_logs (
  id bigint generated always as identity primary key,
  event text not null check (length(event) between 1 and 100),
  actor_user_id uuid,
  actor_email text,
  resource_id text,
  ip_address text,
  details jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists admin_audit_logs_created_at_idx
  on public.admin_audit_logs (created_at desc);
create index if not exists admin_audit_logs_actor_idx
  on public.admin_audit_logs (actor_user_id, created_at desc);
create index if not exists admin_audit_logs_event_idx
  on public.admin_audit_logs (event, created_at desc);

alter table public.admin_audit_logs enable row level security;
revoke all on table public.admin_audit_logs from public, anon, authenticated;
grant select, insert on table public.admin_audit_logs to service_role;
grant usage, select on sequence public.admin_audit_logs_id_seq to service_role;

commit;
