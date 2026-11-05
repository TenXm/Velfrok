-- Defer inventory deduction until an administrator accepts an order.
-- Pending UPI/COD orders must not consume sellable stock.
begin;

do $migration$
declare
  v_definition text;
  v_old text := $old$
    update public.products
    set quantity = quantity - v_qty,
        updated_at = now()
    where id = v_product_id;
$old$;
  v_reject_old text := $old$
  for v_item in select distinct product_id from public.order_items where order_id=p_order_id order by product_id loop
    perform 1 from public.products where id=v_item.product_id for update;
  end loop;
  update public.products p set quantity=p.quantity+x.qty
  from (select product_id,sum(quantity)::integer qty from public.order_items where order_id=p_order_id group by product_id) x
  where p.id=x.product_id;
$old$;
begin
  select pg_get_functiondef(
    'public.place_order_atomic(text,text,text,text,text,text,text,jsonb,text)'::regprocedure
  ) into v_definition;

  if position(v_old in v_definition) = 0 then
    raise exception 'Could not safely locate the stock deduction in place_order_atomic; no function was changed';
  end if;

  v_definition := replace(
    v_definition,
    v_old,
    '    -- Stock is deducted by the order-acceptance trigger, not at checkout.' || chr(10)
  );
  execute v_definition;

  select pg_get_functiondef(
    'public.reject_cod_order(uuid)'::regprocedure
  ) into v_definition;

  if position(v_reject_old in v_definition) > 0 then
    v_definition := replace(
      v_definition,
      v_reject_old,
      '  -- Pending COD orders have not deducted inventory, so rejection does not restock.' || chr(10)
    );
    execute v_definition;
  else
    raise exception 'Could not safely locate the pending COD restock block; no rejection function was changed';
  end if;
end
$migration$;

create or replace function public.velfrok_deduct_stock_on_order_acceptance()
returns trigger
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_item record;
begin
  if new.order_acceptance_status = 'accepted'
     and old.order_acceptance_status is distinct from 'accepted' then

    if exists (
      select 1 from public.order_items
      where order_id = new.id and product_id is null
    ) then
      raise exception 'An order item has no linked product; inventory must be reviewed';
    end if;

    for v_item in
      select product_id, sum(quantity)::integer as quantity
      from public.order_items
      where order_id = new.id
      group by product_id
      order by product_id
    loop
      update public.products
      set quantity = quantity - v_item.quantity,
          updated_at = now()
      where id = v_item.product_id
        and quantity >= v_item.quantity;

      if not found then
        raise exception 'Insufficient stock to accept this order for product %', v_item.product_id;
      end if;
    end loop;
  end if;

  return new;
end;
$function$;

drop trigger if exists velfrok_deduct_stock_on_order_acceptance on public.orders;
create trigger velfrok_deduct_stock_on_order_acceptance
after update on public.orders
for each row
when (old.order_acceptance_status is distinct from new.order_acceptance_status)
execute function public.velfrok_deduct_stock_on_order_acceptance();

commit;
