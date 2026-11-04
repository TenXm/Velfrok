-- Secure checkout payment-method routing and COD lifecycle. COD is disabled by default.
begin;
create table if not exists public.store_feature_flags (
  flag_key text primary key, enabled boolean not null default false,
  updated_at timestamptz not null default now()
);
insert into public.store_feature_flags(flag_key,enabled) values ('cod_enabled',false) on conflict (flag_key) do nothing;
alter table public.store_feature_flags enable row level security;
revoke all on public.store_feature_flags from anon,authenticated;
grant all on public.store_feature_flags to service_role;

create or replace function public.velfrok_prepare_order_insert()
returns trigger language plpgsql security definer set search_path=''
as $$
declare v_method text := current_setting('velfrok.payment_method',true);
begin
  if v_method not in ('upi','cod') then v_method := 'upi'; end if;
  if v_method='cod' then
    if not exists(select 1 from public.store_feature_flags where flag_key='cod_enabled' and enabled=true) then
      raise exception 'COD is currently unavailable';
    end if;
    new.payment_method := 'cod'; new.payment_status := 'due_on_delivery';
  else
    new.payment_method := 'upi'; new.payment_status := 'pending_utr';
  end if;
  new.order_acceptance_status := 'pending';
  new.fulfillment_status := 'confirmed';
  return new;
end;
$$;
drop trigger if exists velfrok_prepare_order_insert on public.orders;
create trigger velfrok_prepare_order_insert before insert on public.orders
for each row execute function public.velfrok_prepare_order_insert();

create or replace function public.velfrok_sync_upi_acceptance()
returns trigger language plpgsql security definer set search_path=''
as $$
begin
  if new.payment_method='upi' and new.payment_status='accepted' then new.order_acceptance_status:='accepted';
  elsif new.payment_method='upi' and new.payment_status='rejected' then new.order_acceptance_status:='rejected';
  end if;
  return new;
end;
$$;
drop trigger if exists velfrok_sync_upi_acceptance on public.orders;
create trigger velfrok_sync_upi_acceptance before update of payment_status on public.orders
for each row execute function public.velfrok_sync_upi_acceptance();

-- Calls the existing atomic routine, preserving DB price/stock validation.
create or replace function public.place_order_atomic(
  p_customer_name text,p_mobile text,p_email text,p_address text,p_city text,
  p_state text,p_pincode text,p_items jsonb,p_payment_method text,
  p_coupon_code text default null
) returns uuid language plpgsql security definer set search_path=''
as $$
declare v_order_id uuid;
begin
  if auth.uid() is null then raise exception 'Signed in customer required'; end if;
  if p_payment_method not in ('upi','cod') then raise exception 'Invalid payment method'; end if;
  if p_payment_method='cod' and not exists(
    select 1 from public.store_feature_flags where flag_key='cod_enabled' and enabled=true
  ) then raise exception 'COD is currently unavailable'; end if;
  perform set_config('velfrok.payment_method',p_payment_method,true);
  -- Named notation selects the legacy 9-argument function unambiguously.
  v_order_id := public.place_order_atomic(
    p_customer_name => p_customer_name,p_mobile => p_mobile,p_email => p_email,
    p_address => p_address,p_city => p_city,p_state => p_state,
    p_pincode => p_pincode,p_items => p_items,p_coupon_code => p_coupon_code
  );
  perform set_config('velfrok.payment_method','',true);
  return v_order_id;
exception when others then
  perform set_config('velfrok.payment_method','',true);
  raise;
end;
$$;
revoke all on function public.place_order_atomic(text,text,text,text,text,text,text,jsonb,text,text) from public,anon;
grant execute on function public.place_order_atomic(text,text,text,text,text,text,text,jsonb,text,text) to authenticated;

create or replace function public.accept_cod_order(p_order_id uuid)
returns text language plpgsql security definer set search_path=''
as $$
declare v_order public.orders%rowtype;
begin
  if auth.uid() is null or coalesce(auth.jwt()->>'aal','')<>'aal2' or not public.is_velfrok_admin() then raise exception 'Administrator MFA required'; end if;
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
  if auth.uid() is null or coalesce(auth.jwt()->>'aal','')<>'aal2' or not public.is_velfrok_admin() then raise exception 'Administrator MFA required'; end if;
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
  if auth.uid() is null or coalesce(auth.jwt()->>'aal','')<>'aal2' or not public.is_velfrok_admin() then raise exception 'Administrator MFA required'; end if;
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
revoke all on function public.accept_cod_order(uuid) from public,anon;
revoke all on function public.reject_cod_order(uuid) from public,anon;
revoke all on function public.record_cod_payment(uuid) from public,anon;
grant execute on function public.accept_cod_order(uuid) to authenticated;
grant execute on function public.reject_cod_order(uuid) to authenticated;
grant execute on function public.record_cod_payment(uuid) to authenticated;
commit;

-- COD remains disabled. Enable only after full end-to-end verification:
-- update public.store_feature_flags set enabled=true,updated_at=now() where flag_key='cod_enabled';
-- The app server must ALSO set COD_ENABLED=true.