-- Velfrok checkout payment-method and fulfillment extension.
-- Copy this file into Supabase SQL Editor and run it after the existing store
-- schema / atomic checkout migrations. This does not enable COD: the server-side
-- COD_ENABLED feature flag must remain false until explicitly enabled.
--
-- Important: order acceptance is separate from payment verification. COD orders
-- are accepted for processing while their payment remains due at delivery.

begin;

alter table public.orders
  add column if not exists payment_method text not null default 'upi',
  add column if not exists order_acceptance_status text not null default 'pending';

-- Replace the payment-status constraint in a rerunnable way. COD is not marked
-- as accepted/verified before cash is collected by the delivery agent.
do $$
declare
  c record;
begin
  for c in
    select conname
    from pg_constraint
    where conrelid = 'public.orders'::regclass
      and contype = 'c'
      and pg_get_constraintdef(oid) ilike '%payment_status%'
  loop
    execute format('alter table public.orders drop constraint %I', c.conname);
  end loop;
end $$;

alter table public.orders
  add constraint orders_payment_status_check
  check (payment_status in (
    'pending_utr',
    'pending_verification',
    'accepted',
    'rejected',
    'due_on_delivery'
  ));

do $$
declare
  c record;
begin
  for c in
    select conname
    from pg_constraint
    where conrelid = 'public.orders'::regclass
      and contype = 'c'
      and pg_get_constraintdef(oid) ilike '%payment_method%'
  loop
    execute format('alter table public.orders drop constraint %I', c.conname);
  end loop;
end $$;

alter table public.orders
  add constraint orders_payment_method_check
  check (payment_method in ('upi', 'cod'));

do $$
declare
  c record;
begin
  for c in
    select conname
    from pg_constraint
    where conrelid = 'public.orders'::regclass
      and contype = 'c'
      and pg_get_constraintdef(oid) ilike '%order_acceptance_status%'
  loop
    execute format('alter table public.orders drop constraint %I', c.conname);
  end loop;
end $$;

alter table public.orders
  add constraint orders_acceptance_status_check
  check (order_acceptance_status in ('pending', 'accepted', 'rejected'));

-- Keep existing rows intact; allow the new intermediate fulfillment stage.
do $$
declare
  c record;
begin
  for c in
    select conname
    from pg_constraint
    where conrelid = 'public.orders'::regclass
      and contype = 'c'
      and pg_get_constraintdef(oid) ilike '%fulfillment_status%'
  loop
    execute format('alter table public.orders drop constraint %I', c.conname);
  end loop;
end $$;

alter table public.orders
  add constraint orders_fulfillment_status_check
  check (fulfillment_status in (
    'confirmed',
    'packed',
    'ready_to_ship',
    'shipped',
    'delivered'
  ));

create index if not exists orders_payment_method_created_idx
  on public.orders (payment_method, created_at desc);

create index if not exists orders_acceptance_status_created_idx
  on public.orders (order_acceptance_status, created_at desc);

commit;

-- Server/API implementation contract:
-- 1) Reject payment_method='cod' while COD_ENABLED=false (server-side only).
-- 2) UPI starts payment_status='pending_utr'; after UTR submission it becomes
--    'pending_verification'. Admin payment confirmation sets 'accepted'.
-- 3) COD starts payment_status='due_on_delivery' and order_acceptance_status
--    'pending'. Admin order acceptance changes only acceptance status; do not
--    mark payment accepted. Delivery/cash collection can separately set payment
--    status to 'accepted'.
-- 4) Fulfillment updates require order_acceptance_status='accepted' and, for
--    UPI, payment_status='accepted'. COD may progress while payment is due.
-- 5) Keep the COD flag disabled until all API and admin workflow changes land.
