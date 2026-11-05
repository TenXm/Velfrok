-- Monthly delivered-order Excel archive metadata.
begin;

alter table public.orders
  add column if not exists archived_at timestamptz,
  add column if not exists rejected_at timestamptz;

update public.orders
set rejected_at = created_at
where order_acceptance_status = 'rejected' and rejected_at is null;

create index if not exists orders_rejected_retention_idx
  on public.orders (rejected_at)
  where order_acceptance_status = 'rejected' and rejected_at is not null;

create index if not exists orders_monthly_archive_lookup_idx
  on public.orders (delivered_at)
  where fulfillment_status = 'delivered' and archived_at is null;

create table if not exists public.order_archives (
  id uuid primary key default gen_random_uuid(),
  period_start date not null,
  period_end date not null,
  file_name text not null,
  storage_path text not null unique,
  order_count integer not null default 0,
  item_count integer not null default 0,
  generated_at timestamptz not null default now(),
  deleted_at timestamptz,
  created_at timestamptz not null default now(),
  constraint order_archives_period_unique unique (period_start)
);

alter table public.order_archives add column if not exists deleted_at timestamptz;

alter table public.order_archives enable row level security;
revoke all on public.order_archives from anon, authenticated;
grant all on public.order_archives to service_role;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('order-archives', 'order-archives', false, 52428800,
        array['application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'])
on conflict (id) do update
set public = false,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;

commit;
