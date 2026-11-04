-- Replace legacy aal2 checks with the verified Admin email OTP claim.
-- public.is_verified_admin() checks auth.uid(), admin_email_otp_verified=true,
-- and an active velfrok_admins row with role='admin'.

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
  if auth.uid() is null or not public.is_verified_admin() then
    raise exception 'Verified administrator authorization required';
  end if;
  if p_items is null or jsonb_typeof(p_items) <> 'array' then
    raise exception 'Inventory changes must be a JSON array';
  end if;
  if jsonb_array_length(p_items) = 0 or jsonb_array_length(p_items) > 200 then
    raise exception 'Provide between 1 and 200 inventory changes';
  end if;
  for v_id in
    select distinct (x.item ->> 'product_id')::uuid
    from jsonb_array_elements(p_items) as x(item)
    order by 1
  loop
    perform 1 from public.products p where p.id = v_id for update;
    if not found then raise exception 'Product not found: %', v_id; end if;
  end loop;
  for v_item in select value from jsonb_array_elements(p_items)
  loop
    begin
      v_id := (v_item ->> 'product_id')::uuid;
      v_mode := v_item ->> 'mode';
      v_amount := (v_item ->> 'quantity')::integer;
    exception when others then raise exception 'Invalid inventory change'; end;
    if v_mode is null or v_mode not in ('add', 'subtract', 'set') or v_amount is null or v_amount < 0 then
      raise exception 'Invalid inventory mode or quantity';
    end if;
    select quantity into v_current from public.products where id = v_id for update;
    if v_mode = 'add' then v_new := v_current + v_amount;
    elsif v_mode = 'subtract' then v_new := v_current - v_amount;
    else v_new := v_amount; end if;
    if v_new < 0 then raise exception 'Inventory cannot become negative for product %', v_id; end if;
    update public.products set quantity = v_new, updated_at = now() where id = v_id;
    v_result := v_result || jsonb_build_array(jsonb_build_object('product_id', v_id, 'quantity', v_new));
  end loop;
  return v_result;
end;
$$;
revoke all on function public.admin_adjust_inventory(jsonb) from public, anon;
grant execute on function public.admin_adjust_inventory(jsonb) to authenticated;

create or replace function public.accept_cod_order(p_order_id uuid)
returns text language plpgsql security definer set search_path=''
as $$
declare v_order public.orders%rowtype;
begin
  if auth.uid() is null or not public.is_verified_admin() then raise exception 'Verified administrator required'; end if;
  select * into v_order from public.orders where id=p_order_id for update;
  if not found then raise exception 'Order not found'; end if;
  if v_order.payment_method<>'cod' then raise exception 'Not a COD order'; end if;
  if v_order.order_acceptance_status='accepted' then return 'already_accepted'; end if;
  if v_order.order_acceptance_status<>'pending' or v_order.payment_status<>'due_on_delivery' then raise exception 'COD order cannot be accepted in its current state'; end if;
  update public.orders set order_acceptance_status='accepted' where id=p_order_id;
  return 'accepted';
end;
$$;

create or replace function public.reject_cod_order(p_order_id uuid)
returns text language plpgsql security definer set search_path=''
as $$
declare v_order public.orders%rowtype; v_item record;
begin
  if auth.uid() is null or not public.is_verified_admin() then raise exception 'Verified administrator required'; end if;
  select * into v_order from public.orders where id=p_order_id for update;
  if not found then raise exception 'Order not found'; end if;
  if v_order.payment_method<>'cod' then raise exception 'Not a COD order'; end if;
  if v_order.order_acceptance_status='rejected' then return 'already_rejected'; end if;
  if v_order.order_acceptance_status<>'pending' or v_order.payment_status<>'due_on_delivery' then raise exception 'COD order cannot be rejected in its current state'; end if;
  if exists(select 1 from public.order_items where order_id=p_order_id and product_id is null) then raise exception 'A product in this order no longer exists; manual inventory review required'; end if;
  for v_item in select distinct product_id from public.order_items where order_id=p_order_id order by product_id loop
    perform 1 from public.products where id=v_item.product_id for update;
  end loop;
  update public.products p set quantity=p.quantity+x.qty
  from (select product_id,sum(quantity)::integer qty from public.order_items where order_id=p_order_id group by product_id) x
  where p.id=x.product_id;
  update public.orders set order_acceptance_status='rejected',payment_status='rejected' where id=p_order_id;
  return 'rejected';
end;
$$;

create or replace function public.record_cod_payment(p_order_id uuid)
returns text language plpgsql security definer set search_path=''
as $$
declare v_order public.orders%rowtype;
begin
  if auth.uid() is null or not public.is_verified_admin() then raise exception 'Verified administrator required'; end if;
  select * into v_order from public.orders where id=p_order_id for update;
  if not found then raise exception 'Order not found'; end if;
  if v_order.payment_method<>'cod' then raise exception 'Not a COD order'; end if;
  if v_order.payment_status='accepted' then return 'already_collected'; end if;
  if v_order.order_acceptance_status<>'accepted' or v_order.fulfillment_status<>'delivered' or v_order.payment_status<>'due_on_delivery' then
    raise exception 'Cash can be recorded only after an accepted COD order is delivered';
  end if;
  update public.orders set payment_status='accepted' where id=p_order_id;
  return 'collected';
end;
$$;

revoke all on function public.accept_cod_order(uuid) from public, anon;
revoke all on function public.reject_cod_order(uuid) from public, anon;
revoke all on function public.record_cod_payment(uuid) from public, anon;
grant execute on function public.accept_cod_order(uuid) to authenticated;
grant execute on function public.reject_cod_order(uuid) to authenticated;
grant execute on function public.record_cod_payment(uuid) to authenticated;
