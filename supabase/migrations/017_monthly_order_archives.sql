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

create or replace function public.purge_rejected_orders_before(
  p_cutoff timestamptz,
  p_limit integer default 500
) returns integer
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_ids uuid[];
  v_deleted integer := 0;
begin
  select array_agg(batch.id)
  into v_ids
  from (
    select id
    from public.orders
    where order_acceptance_status = 'rejected'
      and rejected_at is not null
      and rejected_at <= p_cutoff
    order by rejected_at asc
    limit greatest(1, least(coalesce(p_limit, 500), 1000))
    for update skip locked
  ) as batch;

  if coalesce(array_length(v_ids, 1), 0) = 0 then
    return 0;
  end if;

  delete from public.order_items where order_id = any(v_ids);

  delete from public.orders
  where id = any(v_ids)
    and order_acceptance_status = 'rejected'
    and rejected_at <= p_cutoff;

  get diagnostics v_deleted = row_count;
  return v_deleted;
end;
$function$;

revoke all on function public.purge_rejected_orders_before(timestamptz, integer) from public, anon, authenticated;
grant execute on function public.purge_rejected_orders_before(timestamptz, integer) to service_role;

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
