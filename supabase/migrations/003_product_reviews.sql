-- Product reviews: customers must be authenticated; new reviews are held for moderation.
create table if not exists public.product_reviews (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references public.products(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  rating integer not null check (rating between 1 and 5),
  title text not null check (length(trim(title)) between 3 and 120),
  body text not null check (length(trim(body)) between 10 and 3000),
  is_approved boolean not null default false,
  created_at timestamptz not null default now(),
  unique (product_id, user_id)
);

create index if not exists product_reviews_product_approved_idx
  on public.product_reviews (product_id, is_approved, created_at desc);

alter table public.product_reviews enable row level security;

drop policy if exists "Customers can read approved reviews and their own" on public.product_reviews;
create policy "Customers can read approved reviews and their own"
  on public.product_reviews for select to authenticated
  using (is_approved = true or auth.uid() = user_id);

drop policy if exists "Customers can submit one review per product" on public.product_reviews;
create policy "Customers can submit one review per product"
  on public.product_reviews for insert to authenticated
  with check (
    auth.uid() = user_id
    and exists (select 1 from public.products p where p.id = product_id and p.is_active = true)
  );

grant select, insert on public.product_reviews to authenticated;
