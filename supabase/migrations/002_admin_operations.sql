-- Admin membership and verified admin operations.
-- Add an administrator by inserting their auth.users UUID into public.velfrok_admins
-- from the Supabase SQL editor. Never expose the service-role key in the browser.

create table if not exists public.velfrok_admins (
  user_id uuid primary key references auth.users(id) on delete cascade,
  role text not null default 'admin' check (role = 'admin'),
  created_at timestamptz not null default now()
);

alter table public.velfrok_admins enable row level security;

drop policy if exists "admins can read own membership" on public.velfrok_admins;
create policy "admins can read own membership"
on public.velfrok_admins
for select to authenticated
using (user_id = auth.uid());

create or replace function public.is_verified_admin()
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select
    auth.uid() is not null
    and coalesce(auth.jwt() ->> 'aal', '') = 'aal2'
    and exists (
      select 1
      from public.velfrok_admins a
      where a.user_id = auth.uid()
        and a.role = 'admin'
    );
$$;

revoke all on function public.is_verified_admin() from public;
grant execute on function public.is_verified_admin() to authenticated;

drop policy if exists "verified admins manage categories" on public.categories;
create policy "verified admins manage categories"
on public.categories
for all to authenticated
using (public.is_verified_admin())
with check (public.is_verified_admin());

drop policy if exists "verified admins manage products" on public.products;
create policy "verified admins manage products"
on public.products
for all to authenticated
using (public.is_verified_admin())
with check (public.is_verified_admin());

drop policy if exists "verified admins manage coupons" on public.coupons;
create policy "verified admins manage coupons"
on public.coupons
for all to authenticated
using (public.is_verified_admin())
with check (public.is_verified_admin());

create or replace function public.admin_adjust_inventory(p_changes jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  item jsonb;
  target_id uuid;
  operation text;
  amount integer;
  current_quantity integer;
  next_quantity integer;
  updated_items jsonb := '[]'::jsonb;
begin
  if not public.is_verified_admin() then
    raise exception 'Administrator MFA verification required';
  end if;

  if jsonb_typeof(p_changes) <> 'array'
     or jsonb_array_length(p_changes) < 1
     or jsonb_array_length(p_changes) > 100 then
    raise exception 'Provide between 1 and 100 inventory changes';
  end if;

  for item in select value from jsonb_array_elements(p_changes)
  loop
    target_id := (item ->> 'product_id')::uuid;
    operation := item ->> 'operation';
    amount := (item ->> 'quantity')::integer;

    if amount is null or amount < 0 then
      raise exception 'Quantity must be a non-negative integer';
    end if;

    select quantity into current_quantity
    from public.products
    where id = target_id
    for update;

    if not found then
      raise exception 'Product not found: %', target_id;
    end if;

    if operation = 'add' then
      next_quantity := current_quantity + amount;
    elsif operation = 'deduct' then
      next_quantity := current_quantity - amount;
    elsif operation = 'set' then
      next_quantity := amount;
    else
      raise exception 'Invalid inventory operation';
    end if;

    if next_quantity < 0 then
      raise exception 'Stock cannot be negative for product %', target_id;
    end if;

    update public.products
    set quantity = next_quantity, updated_at = now()
    where id = target_id;

    updated_items := updated_items || jsonb_build_array(
      jsonb_build_object(
        'product_id', target_id,
        'previous_quantity', current_quantity,
        'quantity', next_quantity
      )
    );
  end loop;

  return updated_items;
end;
$$;

revoke all on function public.admin_adjust_inventory(jsonb) from public;
grant execute on function public.admin_adjust_inventory(jsonb) to authenticated;
