-- Record the dates that drive the admin order calendar and retention rules.
begin;

alter table public.orders
  add column if not exists accepted_at timestamptz,
  add column if not exists rejected_at timestamptz;

create or replace function public.velfrok_stamp_order_acceptance()
returns trigger
language plpgsql
set search_path = ''
as $function$
begin
  if new.order_acceptance_status = 'accepted'
     and old.order_acceptance_status is distinct from 'accepted'
     and new.accepted_at is null then
    new.accepted_at := now();
  end if;

  if new.order_acceptance_status = 'rejected'
     and old.order_acceptance_status is distinct from 'rejected'
     and new.rejected_at is null then
    new.rejected_at := now();
  end if;

  return new;
end;
$function$;

drop trigger if exists velfrok_stamp_order_acceptance on public.orders;
create trigger velfrok_stamp_order_acceptance
before update of order_acceptance_status on public.orders
for each row
execute function public.velfrok_stamp_order_acceptance();

create index if not exists orders_rejected_at_idx
  on public.orders (rejected_at desc)
  where rejected_at is not null;

create index if not exists orders_delivered_at_idx
  on public.orders (delivered_at desc)
  where delivered_at is not null;

commit;
