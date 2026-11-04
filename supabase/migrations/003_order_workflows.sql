-- Atomic customer order placement, UTR submission, and admin payment decisions.
-- All totals and product prices are recalculated from trusted database rows.

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
)
returns uuid
language plpgsql
security definer
set search_path = public, auth, pg_temp
as $$
declare
  v_user_id uuid := auth.uid();
  v_order_id uuid := gen_random_uuid();
  v_order_number text;
  v_item jsonb;
  v_product_id uuid;
  v_quantity integer;
  v_product record;
  v_subtotal numeric(10,2) := 0;
  v_line_total numeric(10,2);
begin
  if v_user_id is null then
    raise exception 'Sign in required';
  end if;

  if coalesce(auth.jwt() ->> 'email_verified', 'false') <> 'true' then
    raise exception 'Verified email required';
  end if;

  if p_email is null or lower(p_email) <> lower(coalesce(auth.jwt() ->> 'email', '')) then
    raise exception 'Email does not match the authenticated account';
  end if;

  if p_coupon_code is not null and btrim(p_coupon_code) <> '' then
    raise exception 'Coupons are not available at checkout yet';
  end if;

  if jsonb_typeof(p_items) <> 'array'
     or jsonb_array_length(p_items) < 1
     or jsonb_array_length(p_items) > 30 then
    raise exception 'Invalid cart';
  end if;

  if length(btrim(p_customer_name)) < 2
     or p_mobile !~ '^[6-9][0-9]{9}$'
     or length(btrim(p_address)) < 5
     or length(btrim(p_city)) < 2
     or length(btrim(p_state)) < 2
     or p_pincode !~ '^[0-9]{6}$' then
    raise exception 'Invalid shipping details';
  end if;

  v_order_number := 'VF-' || to_char(now(), 'YYYYMMDD') || '-' ||
                    upper(substr(replace(v_order_id::text, '-', ''), 1, 8));

  insert into public.orders (
    id, order_number, user_id, customer_name, mobile, email,
    street_address, city, state, pin_code,
    subtotal, discount, shipping, total, payment_status, fulfillment_status
  ) values (
    v_order_id, v_order_number, v_user_id, btrim(p_customer_name), p_mobile,
    lower(p_email), btrim(p_address), btrim(p_city), btrim(p_state), p_pincode,
    0, 0, 0, 0, 'pending_utr', 'confirmed'
  );

  for v_item in select value from jsonb_array_elements(p_items)
  loop
    v_product_id := (v_item ->> 'product_id')::uuid;
    v_quantity := (v_item ->> 'quantity')::integer;

    if v_quantity is null or v_quantity < 1 or v_quantity > 10 then
      raise exception 'Invalid product quantity';
    end if;

    select p.id, p.sku, p.name, p.selling_price, p.quantity, p.image_urls
      into v_product
    from public.products p
    where p.id = v_product_id and p.is_active = true
    for update;

    if not found then
      raise exception 'Product unavailable';
    end if;

    if v_product.quantity < v_quantity then
      raise exception 'Insufficient stock for %', v_product.sku;
    end if;

    update public.products
      set quantity = quantity - v_quantity, updated_at = now()
    where id = v_product_id;

    v_line_total := round(v_product.selling_price * v_quantity, 2);
    v_subtotal := v_subtotal + v_line_total;

    insert into public.order_items (
      order_id, product_id, sku, product_name, image_url,
      quantity, unit_price, line_total
    ) values (
      v_order_id, v_product.id, v_product.sku, v_product.name,
      v_product.image_urls[1], v_quantity, v_product.selling_price, v_line_total
    );
  end loop;

  update public.orders
    set subtotal = v_subtotal, total = v_subtotal
  where id = v_order_id;

  return v_order_id;
end;
$$;

create or replace function public.submit_order_utr(
  p_order_id uuid,
  p_utr_number text
)
returns boolean
language plpgsql
security definer
set search_path = public, auth, pg_temp
as $$
declare
  v_updated integer;
begin
  if auth.uid() is null then
    raise exception 'Sign in required';
  end if;

  if p_utr_number !~ '^[0-9]{12}$' then
    raise exception 'UTR must contain exactly 12 digits';
  end if;

  update public.orders
    set utr_number = p_utr_number,
        payment_status = 'pending_verification'
  where id = p_order_id
    and user_id = auth.uid()
    and payment_status = 'pending_utr';

  get diagnostics v_updated = row_count;
  if v_updated = 1 then return true; end if;
  return false;
end;
$$;

create or replace function public.confirm_order_payment(p_order_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public, auth, pg_temp
as $$
declare
  v_order public.orders%rowtype;
begin
  if not public.is_verified_admin() then
    raise exception 'Administrator MFA verification required';
  end if;

  select * into v_order
  from public.orders
  where id = p_order_id
  for update;

  if not found then raise exception 'Order not found'; end if;
  if v_order.payment_status <> 'pending_verification' then
    raise exception 'Only orders awaiting payment verification can be accepted';
  end if;

  update public.orders
    set payment_status = 'accepted'
  where id = p_order_id;

  return jsonb_build_object('order_id', p_order_id, 'payment_status', 'accepted');
end;
$$;

create or replace function public.reject_order_payment(p_order_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public, auth, pg_temp
as $$
declare
  v_order public.orders%rowtype;
  v_item record;
begin
  if not public.is_verified_admin() then
    raise exception 'Administrator MFA verification required';
  end if;

  select * into v_order
  from public.orders
  where id = p_order_id
  for update;

  if not found then raise exception 'Order not found'; end if;
  if v_order.payment_status not in ('pending_utr', 'pending_verification') then
    raise exception 'This order cannot be rejected from its current payment state';
  end if;

  for v_item in
    select product_id, quantity
    from public.order_items
    where order_id = p_order_id and product_id is not null
    for update
  loop
    update public.products
      set quantity = quantity + v_item.quantity, updated_at = now()
    where id = v_item.product_id;
  end loop;

  update public.orders
    set payment_status = 'rejected'
  where id = p_order_id;

  return jsonb_build_object('order_id', p_order_id, 'payment_status', 'rejected', 'stock_restored', true);
end;
$$;

revoke all on function public.place_order_atomic(text,text,text,text,text,text,text,jsonb,text) from public;
revoke all on function public.submit_order_utr(uuid,text) from public;
revoke all on function public.confirm_order_payment(uuid) from public;
revoke all on function public.reject_order_payment(uuid) from public;

grant execute on function public.place_order_atomic(text,text,text,text,text,text,text,jsonb,text) to authenticated;
grant execute on function public.submit_order_utr(uuid,text) to authenticated;
grant execute on function public.confirm_order_payment(uuid) to authenticated;
grant execute on function public.reject_order_payment(uuid) to authenticated;
