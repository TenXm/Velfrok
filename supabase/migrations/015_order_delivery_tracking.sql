-- Add manual courier and AWB tracking metadata to orders.
begin;

alter table public.orders
  add column if not exists delivery_partner text,
  add column if not exists awb_number text,
  add column if not exists tracking_url text,
  add column if not exists dispatched_at timestamptz,
  add column if not exists delivered_at timestamptz;

create index if not exists orders_fulfillment_created_idx
  on public.orders (fulfillment_status, created_at desc);

create index if not exists orders_awb_number_idx
  on public.orders (awb_number)
  where awb_number is not null;

commit;
