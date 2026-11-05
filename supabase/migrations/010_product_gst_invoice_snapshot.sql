-- 010: Product GST rate and immutable order-item GST snapshot.
-- Selling prices remain tax-inclusive; checkout totals are unchanged.

alter table public.products add column if not exists gst_rate numeric(5,2) not null default 0;
alter table public.order_items add column if not exists gst_rate numeric(5,2) not null default 0;

alter table public.products drop constraint if exists products_gst_rate_allowed;
alter table public.products add constraint products_gst_rate_allowed check (gst_rate in (0, 5, 10, 12, 18, 28));
alter table public.order_items drop constraint if exists order_items_gst_rate_allowed;
alter table public.order_items add constraint order_items_gst_rate_allowed check (gst_rate in (0, 5, 10, 12, 18, 28));

-- Reinstall the atomic order routine with GST rate snapshotting. Original 006 migration follows.
-- Apply after migrations 001-005. COD remains disabled unless explicitly enabled elsewhere.

begin;

-- The live coupons table was missing this counter even though checkout validation
-- and the original schema expect it.
alter table public.coupons
  add column if not exists usage_count integer not null default 0;

update public.coupons set usage_count = 0 where usage_count is null;

alter table public.coupons
  alter column usage_count set default 0,
  alter column usage_count set not null;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.coupons'::regclass
      and conname = 'coupons_usage_count_nonnegative'
  ) then
    alter table public.coupons
      add constraint coupons_usage_count_nonnegative check (usage_count >= 0) not valid;
  end if;
end;
$$;

alter table public.coupons validate constraint coupons_usage_count_nonnegative;

-- Replace the legacy 9-argument function. All prices, stock, discount and coupon
-- eligibility are calculated/checked in PostgreSQL, never trusted from the client.
create or replace function public.place_order_atomic(
  p_customer_name text,
  p_mobile text,
  p_email text,
  p_address text,
  p_city text,
  p_state text,
  p_pincode text,
  p_items jsonb,
  p_coupon_code text default null
) returns uuid
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_user_id uuid;
  v_order_id uuid;
  v_order_number text;
  v_item jsonb;
  v_product record;
  v_normalized_items jsonb;
  v_product_id uuid;
  v_qty integer;
  v_subtotal numeric(12,2) := 0;
  v_line_total numeric(12,2);
  v_discount numeric(12,2) := 0;
  v_total numeric(12,2) := 0;
  v_coupon_code text := nullif(upper(btrim(coalesce(p_coupon_code, ''))), '');
  v_coupon public.coupons%rowtype;
  v_coupon_matches integer := 0;
  v_customer_uses integer := 0;
begin
  v_user_id := auth.uid();

  if v_user_id is null then
    raise exception 'Authentication required';
  end if;

  if p_customer_name is null or length(btrim(p_customer_name)) < 2
     or length(btrim(p_customer_name)) > 120 then
    raise exception 'Invalid customer name';
  end if;

  if p_mobile is null or p_mobile !~ '^[0-9]{10,15}$' then
    raise exception 'Invalid mobile number';
  end if;

  if p_email is null or length(btrim(p_email)) > 254
     or p_email !~* '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$' then
    raise exception 'Invalid email address';
  end if;

  if p_address is null or length(btrim(p_address)) < 5
     or length(btrim(p_address)) > 500 then
    raise exception 'Invalid shipping address';
  end if;

  if p_city is null or length(btrim(p_city)) < 2 or length(btrim(p_city)) > 100 then
    raise exception 'Invalid city';
  end if;

  if p_state is null or length(btrim(p_state)) < 2 or length(btrim(p_state)) > 100 then
    raise exception 'Invalid state';
  end if;

  if p_pincode is null or p_pincode !~ '^[0-9]{6}$' then
    raise exception 'Invalid pincode';
  end if;

  if p_coupon_code is not null and btrim(p_coupon_code) <> ''
     and (length(btrim(p_coupon_code)) > 64
       or upper(btrim(p_coupon_code)) !~ '^[A-Z0-9][A-Z0-9_-]*$') then
    raise exception 'Invalid coupon code';
  end if;

  if p_items is null or jsonb_typeof(p_items) <> 'array' then
    raise exception 'Invalid cart';
  end if;

  if jsonb_array_length(p_items) < 1 or jsonb_array_length(p_items) > 30 then
    raise exception 'Cart must contain between 1 and 30 items';
  end if;

  for v_item in
    select value from jsonb_array_elements(p_items)
  loop
    if jsonb_typeof(v_item) <> 'object'
       or coalesce(v_item->>'product_id', '') !~
          '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$'
       or coalesce(v_item->>'quantity', '') !~ '^[0-9]+$'
       or (v_item->>'quantity')::integer < 1
       or (v_item->>'quantity')::integer > 10 then
      raise exception 'Invalid cart item';
    end if;
  end loop;

  select jsonb_agg(
    jsonb_build_object(
      'product_id', grouped.product_id::text,
      'quantity', grouped.total_quantity
    )
    order by grouped.product_id
  )
  into v_normalized_items
  from (
    select
      (item->>'product_id')::uuid as product_id,
      sum((item->>'quantity')::integer)::integer as total_quantity
    from jsonb_array_elements(p_items) as entries(item)
    group by (item->>'product_id')::uuid
  ) as grouped;

  if exists (
    select 1
    from jsonb_array_elements(v_normalized_items) as entries(item)
    where (item->>'quantity')::integer > 10
  ) then
    raise exception 'Maximum quantity per product is 10';
  end if;

  -- Lock products in deterministic order and derive subtotal from current DB prices.
  for v_item in
    select value
    from jsonb_array_elements(v_normalized_items)
    order by value->>'product_id'
  loop
    v_product_id := (v_item->>'product_id')::uuid;
    v_qty := (v_item->>'quantity')::integer;

    select id, sku, name, selling_price, quantity, gst_rate
    into v_product
    from public.products
    where id = v_product_id and is_active = true
    for update;

    if not found then
      raise exception 'A product is unavailable';
    end if;

    if v_product.quantity < v_qty then
      raise exception 'Insufficient stock for product %', v_product.sku;
    end if;

    v_subtotal := v_subtotal + (v_product.selling_price * v_qty);
  end loop;

  v_subtotal := round(v_subtotal, 2);

  -- Lock the matching coupon row before checking limits. Duplicate normalized
  -- codes are treated as a configuration error rather than choosing arbitrarily.
  if v_coupon_code is not null then
    select count(*)::integer
    into v_coupon_matches
    from public.coupons
    where upper(btrim(code)) = v_coupon_code;

    if v_coupon_matches = 0 then
      raise exception 'Invalid coupon code';
    elsif v_coupon_matches > 1 then
      raise exception 'Coupon configuration error; contact support';
    end if;

    select *
    into v_coupon
    from public.coupons
    where upper(btrim(code)) = v_coupon_code
    for update;

    if not found then
      raise exception 'Invalid coupon code';
    end if;

    if v_coupon.is_active is not true then
      raise exception 'Coupon is inactive';
    end if;

    if v_coupon.expires_at is not null and v_coupon.expires_at <= now() then
      raise exception 'Coupon has expired';
    end if;

    if v_coupon.usage_limit is not null
       and v_coupon.usage_count >= v_coupon.usage_limit then
      raise exception 'Coupon usage limit reached';
    end if;

    if v_coupon.min_order_value is not null
       and v_subtotal < v_coupon.min_order_value then
      raise exception 'Minimum order value for this coupon is not met';
    end if;

    if v_coupon.per_customer_limit is not null then
      select count(*)::integer
      into v_customer_uses
      from public.orders
      where user_id = v_user_id
        and upper(btrim(coalesce(coupon_code, ''))) = v_coupon_code;

      if v_customer_uses >= v_coupon.per_customer_limit then
        raise exception 'You have reached this coupon usage limit';
      end if;
    end if;

    if v_coupon.discount_value is null or v_coupon.discount_value <= 0 then
      raise exception 'Coupon configuration error; contact support';
    end if;

    if v_coupon.discount_type = 'percentage' then
      v_discount := round(v_subtotal * v_coupon.discount_value / 100, 2);
    elsif v_coupon.discount_type = 'flat' then
      v_discount := round(v_coupon.discount_value, 2);
    else
      raise exception 'Coupon configuration error; contact support';
    end if;

    if v_coupon.max_discount is not null then
      if v_coupon.max_discount < 0 then
        raise exception 'Coupon configuration error; contact support';
      end if;
      v_discount := least(v_discount, v_coupon.max_discount);
    end if;

    -- A discount can never exceed the cart subtotal.
    v_discount := least(greatest(v_discount, 0), v_subtotal);
  end if;

  v_total := greatest(v_subtotal - v_discount, 0);

  v_order_id := gen_random_uuid();
  v_order_number :=
    'VLF-' || upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 12));

  insert into public.orders (
    id, user_id, order_number, customer_name, mobile, email,
    address, city, state, pincode, subtotal, discount_amount,
    total_amount, coupon_code, payment_status, fulfillment_status
  )
  values (
    v_order_id, v_user_id, v_order_number, btrim(p_customer_name),
    p_mobile, lower(btrim(p_email)), btrim(p_address),
    btrim(p_city), btrim(p_state), p_pincode, v_subtotal,
    v_discount, v_total, v_coupon_code, 'pending_utr', 'confirmed'
  );

  for v_item in
    select value
    from jsonb_array_elements(v_normalized_items)
    order by value->>'product_id'
  loop
    v_product_id := (v_item->>'product_id')::uuid;
    v_qty := (v_item->>'quantity')::integer;

    select id, sku, name, selling_price, gst_rate
    into v_product
    from public.products
    where id = v_product_id and is_active = true;

    if not found then
      raise exception 'A product is unavailable';
    end if;

    v_line_total := v_product.selling_price * v_qty;

    insert into public.order_items (
      order_id, product_id, sku, product_name,
      quantity, unit_price, line_total, gst_rate
    )
    values (
      v_order_id, v_product.id, v_product.sku, v_product.name,
      v_qty, v_product.selling_price, v_line_total, coalesce(v_product.gst_rate, 0)
    );

    update public.products
    set quantity = quantity - v_qty,
        updated_at = now()
    where id = v_product_id;
  end loop;

  -- Increment exactly once, in the same transaction as the order and stock changes.
  if v_coupon_code is not null then
    update public.coupons
    set usage_count = usage_count + 1
    where id = v_coupon.id;
  end if;

  return v_order_id;
end;
$function$;

-- Keep the customer RPC callable only by authenticated users.
revoke all on function public.place_order_atomic(text,text,text,text,text,text,text,jsonb,text)
  from public, anon;
grant execute on function public.place_order_atomic(text,text,text,text,text,text,text,jsonb,text)
  to authenticated;

commit;

-- COD remains governed by the existing 10-argument wrapper and feature flag.
-- Do not enable COD as part of this migration.
