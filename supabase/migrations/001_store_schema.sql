-- Velfrok baseline schema aligned with the uploaded PRD.
-- Review and apply in Supabase SQL Editor only after creating a project.
-- This migration is a foundation; atomic checkout/admin RPCs are a later phase.

create extension if not exists pgcrypto;

create table if not exists public.categories (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  slug text not null unique,
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists public.products (
  id uuid primary key default gen_random_uuid(),
  category_id uuid references public.categories(id) on delete set null,
  name text not null,
  slug text not null unique,
  sku text not null unique,
  description text not null default '',
  image_urls text[] not null default '{}',
  colors text[] not null default '{}',
  dimensions text,
  weight text,
  mrp numeric(10,2) not null check (mrp > 0),
  selling_price numeric(10,2) not null check (selling_price > 0 and selling_price <= mrp),
  discount_pct integer generated always as (round(((mrp-selling_price)/mrp)*100)::integer) stored,
  quantity integer not null default 0 check (quantity >= 0),
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.coupons (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  discount_type text not null check (discount_type in ('percentage','flat')),
  discount_value numeric(10,2) not null check (discount_value > 0),
  min_order_value numeric(10,2) not null default 0,
  max_discount numeric(10,2),
  expires_at timestamptz,
  usage_limit integer,
  per_customer_limit integer,
  usage_count integer not null default 0,
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists public.orders (
  id uuid primary key default gen_random_uuid(),
  order_number text not null unique,
  user_id uuid not null references auth.users(id),
  customer_name text not null,
  mobile text not null check (mobile ~ '^[6-9][0-9]{9}$'),
  email text not null,
  street_address text not null,
  landmark text,
  city text not null,
  state text not null,
  pin_code text not null check (pin_code ~ '^[0-9]{6}$'),
  subtotal numeric(10,2) not null check (subtotal >= 0),
  discount numeric(10,2) not null default 0 check (discount >= 0),
  shipping numeric(10,2) not null default 0 check (shipping >= 0),
  total numeric(10,2) not null check (total >= 0),
  coupon_code text,
  utr_number text check (utr_number is null or utr_number ~ '^[0-9]{12}$'),
  payment_status text not null default 'pending_utr'
    check (payment_status in ('pending_utr','pending_verification','accepted','rejected')),
  fulfillment_status text not null default 'confirmed'
    check (fulfillment_status in ('confirmed','packed','shipped','delivered')),
  courier text,
  tracking_number text,
  tracking_url text,
  created_at timestamptz not null default now()
);

create unique index if not exists idx_unique_utr
  on public.orders(utr_number) where utr_number is not null;

create table if not exists public.order_items (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders(id) on delete restrict,
  product_id uuid references public.products(id) on delete set null,
  sku text not null,
  product_name text not null,
  image_url text,
  color text,
  quantity integer not null check (quantity between 1 and 20),
  unit_price numeric(10,2) not null check (unit_price > 0),
  line_total numeric(10,2) not null check (line_total > 0),
  created_at timestamptz not null default now()
);

alter table public.categories enable row level security;
alter table public.products enable row level security;
alter table public.coupons enable row level security;
alter table public.orders enable row level security;
alter table public.order_items enable row level security;

-- Public visitors can see active categories/products only.
drop policy if exists "active categories readable" on public.categories;
create policy "active categories readable" on public.categories
for select to anon, authenticated using (is_active = true);

drop policy if exists "active products readable" on public.products;
create policy "active products readable" on public.products
for select to anon, authenticated using (is_active = true);

-- No public coupon reads. Checkout validation must happen in a trusted server action.
-- No direct order or order_items insert/update policy is granted here.
-- Customer order reads are scoped to their own auth.uid().
drop policy if exists "customers read own orders" on public.orders;
create policy "customers read own orders" on public.orders
for select to authenticated using (user_id = auth.uid());

drop policy if exists "customers read own order items" on public.order_items;
create policy "customers read own order items" on public.order_items
for select to authenticated using (
  exists (select 1 from public.orders o where o.id = order_id and o.user_id = auth.uid())
);

-- Admin policies are intentionally withheld until is_verified_admin() is created
-- and the MFA aal2 check is implemented and audited. Do not loosen these policies
-- to "authenticated users" as a shortcut.
