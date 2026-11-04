-- Velfrok admin catalogue extensions.
-- Compatible with the live products schema: images jsonb, colours text[],
-- discount_pct integer, quantity integer, and is_active boolean.

alter table public.products
  add column if not exists attributes jsonb not null default '{}'::jsonb;

create table if not exists public.product_attribute_options (
  id uuid primary key default gen_random_uuid(),
  attribute_name text not null,
  attribute_slug text not null,
  value text not null,
  normalized_value text not null,
  created_at timestamptz not null default now(),
  constraint product_attribute_options_unique
    unique (attribute_slug, normalized_value),
  constraint product_attribute_name_nonempty check (length(trim(attribute_name)) > 0),
  constraint product_attribute_value_nonempty check (length(trim(value)) > 0)
);

create index if not exists product_attribute_options_lookup_idx
  on public.product_attribute_options (attribute_slug, normalized_value);

alter table public.product_attribute_options enable row level security;

drop policy if exists "Admins manage product attribute options"
  on public.product_attribute_options;
create policy "Admins manage product attribute options"
  on public.product_attribute_options
  for all to authenticated
  using (public.is_velfrok_admin())
  with check (public.is_velfrok_admin());

-- Atomic bulk inventory adjustments. The function checks both admin membership
-- and the elevated MFA assurance claim, then locks products in UUID order.
create or replace function public.admin_adjust_inventory(p_items jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_item jsonb;
  v_id uuid;
  v_mode text;
  v_amount integer;
  v_current integer;
  v_new integer;
  v_result jsonb := '[]'::jsonb;
begin
  if auth.uid() is null
     or coalesce(auth.jwt() ->> 'aal', '') <> 'aal2'
     or not exists (
       select 1 from public.velfrok_admins a where a.user_id = auth.uid()
     ) then
    raise exception 'Admin MFA authorization required';
  end if;

  if jsonb_typeof(p_items) <> 'array'
     or jsonb_array_length(p_items) = 0
     or jsonb_array_length(p_items) > 200 then
    raise exception 'Provide between 1 and 200 inventory changes';
  end if;

  -- Validate and lock every referenced product in deterministic order.
  for v_id in
    select distinct (x.item ->> 'product_id')::uuid
    from jsonb_array_elements(p_items) as x(item)
    order by 1
  loop
    perform 1 from public.products p where p.id = v_id for update;
    if not found then
      raise exception 'Product not found: %', v_id;
    end if;
  end loop;

  for v_item in select value from jsonb_array_elements(p_items)
  loop
    begin
      v_id := (v_item ->> 'product_id')::uuid;
      v_mode := v_item ->> 'mode';
      v_amount := (v_item ->> 'quantity')::integer;
    exception when others then
      raise exception 'Invalid inventory change';
    end;

    if v_mode not in ('add', 'subtract', 'set') or v_amount < 0 then
      raise exception 'Invalid inventory mode or quantity';
    end if;

    select quantity into v_current
    from public.products where id = v_id for update;

    if v_mode = 'add' then
      v_new := v_current + v_amount;
    elsif v_mode = 'subtract' then
      v_new := v_current - v_amount;
    else
      v_new := v_amount;
    end if;

    if v_new < 0 then
      raise exception 'Inventory cannot become negative for product %', v_id;
    end if;

    update public.products
       set quantity = v_new, updated_at = now()
     where id = v_id;

    v_result := v_result || jsonb_build_array(
      jsonb_build_object('product_id', v_id, 'quantity', v_new)
    );
  end loop;

  return v_result;
end;
$$;

revoke all on function public.admin_adjust_inventory(jsonb) from public, anon;
grant execute on function public.admin_adjust_inventory(jsonb) to authenticated;
