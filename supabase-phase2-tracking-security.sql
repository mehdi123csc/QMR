-- Qmr Store Phase 2: private customer order tracking.
-- Run this AFTER supabase-setup.sql and supabase-global-upgrade.sql.
-- This migration does not delete or rewrite existing orders.

-- A tracking token is returned to the customer only once; only its SHA-256 hash is stored.
alter table public.orders add column if not exists tracking_token_hash text;

create or replace function public.qmr_place_order(p_order jsonb, p_coupon_code text default null)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
 v_item jsonb; v_product public.products%rowtype; v_items jsonb := '[]'::jsonb;
 v_subtotal numeric(12,2) := 0; v_discount numeric(12,2) := 0; v_total numeric(12,2) := 0;
 v_qty integer; v_code text := upper(trim(coalesce(p_coupon_code,''))); v_coupon public.coupons%rowtype;
 v_order_id uuid; v_tracking_token text;
begin
 if jsonb_typeof(p_order->'items') <> 'array' or jsonb_array_length(p_order->'items') < 1 or jsonb_array_length(p_order->'items') > 50 then raise exception 'قائمة المنتجات غير صالحة.'; end if;
 if char_length(trim(coalesce(p_order->>'customer_name',''))) not between 2 and 100 then raise exception 'تحققي من الاسم الكامل.'; end if;
 if char_length(trim(coalesce(p_order->>'phone',''))) not between 8 and 25 then raise exception 'تحققي من رقم الهاتف.'; end if;
 if char_length(trim(coalesce(p_order->>'wilaya',''))) < 2 then raise exception 'اختاري الولاية.'; end if;
 if char_length(trim(coalesce(p_order->>'municipality',''))) < 2 then raise exception 'اختاري البلدية.'; end if;
 if char_length(trim(coalesce(p_order->>'address',''))) not between 4 and 500 then raise exception 'أدخلي العنوان بالتفصيل.'; end if;
 for v_item in select value from jsonb_array_elements(p_order->'items') loop
   if coalesce(v_item->>'product_id','') !~* '^[0-9a-f-]{36}$' then raise exception 'يوجد منتج غير صالح في السلة.'; end if;
   v_qty := (v_item->>'quantity')::integer;
   if v_qty < 1 or v_qty > 99 then raise exception 'كمية المنتج غير صالحة.'; end if;
   select * into v_product from public.products where id=(v_item->>'product_id')::uuid and active=true for update;
   if not found then raise exception 'أحد المنتجات لم يعد متوفرًا.'; end if;
   if v_product.stock_quantity < v_qty then raise exception 'المخزون غير كافٍ للمنتج: %',v_product.name; end if;
   v_subtotal := v_subtotal + v_product.price * v_qty;
   v_items := v_items || jsonb_build_array(jsonb_build_object('product_id',v_product.id,'name',v_product.name,'price',v_product.price,'quantity',v_qty));
   update public.products set stock_quantity=stock_quantity-v_qty where id=v_product.id;
 end loop;
 if v_code <> '' then
   select * into v_coupon from public.coupons where code=v_code and active=true and (expires_at is null or expires_at > now()) for update;
   if not found then raise exception 'الكوبون غير صالح أو منتهي الصلاحية.'; end if;
   if v_subtotal < v_coupon.min_order then raise exception 'قيمة الطلب أقل من الحد الأدنى للكوبون.'; end if;
   v_discount := least(v_subtotal,case when v_coupon.discount_type='percent' then v_subtotal*v_coupon.discount_value/100 else v_coupon.discount_value end);
 end if;
 v_total := greatest(0,v_subtotal-v_discount);
 -- Random bearer secret; only its hash is stored in the orders table.
 v_tracking_token := replace(gen_random_uuid()::text || gen_random_uuid()::text,'-','');
 insert into public.orders(customer_name,phone,wilaya,municipality,address,notes,items,total,status,payment_method,coupon_code,discount,tracking_token_hash)
 values(trim(p_order->>'customer_name'),trim(p_order->>'phone'),trim(p_order->>'wilaya'),trim(p_order->>'municipality'),trim(p_order->>'address'),left(coalesce(p_order->>'notes',''),2000),v_items,v_total,'new','cash_on_delivery',nullif(v_code,''),v_discount,encode(extensions.digest(v_tracking_token,'sha256'),'hex'))
 returning id into v_order_id;
 return jsonb_build_object('success',true,'order_id',v_order_id,'tracking_token',v_tracking_token,'subtotal',v_subtotal,'discount',v_discount,'total',v_total);
end;
$$;
revoke all on function public.qmr_place_order(jsonb,text) from public;
grant execute on function public.qmr_place_order(jsonb,text) to anon, authenticated;

-- This function reveals only the order status and timestamp. It never returns customer PII.
create or replace function public.qmr_track_order(p_order_id uuid, p_tracking_token text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare v_order public.orders%rowtype;
begin
 if p_order_id is null or coalesce(length(p_tracking_token),0) < 40 or length(p_tracking_token) > 80 then
   return jsonb_build_object('found',false);
 end if;
 select * into v_order from public.orders
 where id=p_order_id
   and tracking_token_hash=encode(extensions.digest(p_tracking_token,'sha256'),'hex')
 limit 1;
 if not found then return jsonb_build_object('found',false); end if;
 return jsonb_build_object(
   'found',true,
   'order_reference',left(v_order.id::text,8),
   'status',v_order.status,
   'created_at',v_order.created_at
 );
end;
$$;
revoke all on function public.qmr_track_order(uuid,text) from public;
grant execute on function public.qmr_track_order(uuid,text) to anon, authenticated;

-- Defense in depth: anonymous clients cannot read, insert, update, or delete orders directly.
-- Order creation and tracking are through the narrowly scoped RPC functions above.
drop policy if exists "Visitors create orders" on public.orders;
revoke all on table public.orders from anon;
revoke insert, update, delete on table public.orders from authenticated;
grant select, update, delete on table public.orders to authenticated;

-- RLS policies from the existing setup must remain enabled. Admin policies continue to gate
-- authenticated direct reads/updates/deletes via qmr_is_admin().
