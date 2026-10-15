-- Qmr Store global upgrade. Run AFTER supabase-setup.sql in Supabase SQL Editor.
-- This migration does not delete or rewrite existing orders.
alter table public.products add column if not exists stock_quantity integer not null default 0 check (stock_quantity >= 0);
alter table public.products add column if not exists images jsonb not null default '[]'::jsonb check (jsonb_typeof(images) = 'array' and jsonb_array_length(images) <= 4);
alter table public.orders add column if not exists municipality text not null default '';
alter table public.orders add column if not exists coupon_code text;
alter table public.orders add column if not exists discount numeric(12,2) not null default 0 check (discount >= 0);

create table if not exists public.coupons (
 id uuid primary key default gen_random_uuid(),
 code text not null unique check (code = upper(trim(code)) and char_length(code) between 2 and 40),
 discount_type text not null check (discount_type in ('percent','fixed')),
 discount_value numeric(12,2) not null check (discount_value > 0 and (discount_type <> 'percent' or discount_value <= 100)),
 min_order numeric(12,2) not null default 0 check (min_order >= 0),
 expires_at timestamptz,
 active boolean not null default true,
 created_at timestamptz not null default now()
);
alter table public.coupons enable row level security;
drop policy if exists "Admins manage coupons" on public.coupons;
create policy "Admins manage coupons" on public.coupons for all to authenticated using (public.qmr_is_admin()) with check (public.qmr_is_admin());
grant select, insert, update, delete on public.coupons to authenticated;

create or replace function public.qmr_preview_coupon(p_code text, p_subtotal numeric)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare c public.coupons%rowtype; v_code text := upper(trim(coalesce(p_code,'')));
begin
 if v_code = '' then return jsonb_build_object('valid',false,'message','أدخلي رمز الكوبون.'); end if;
 select * into c from public.coupons where code=v_code and active=true and (expires_at is null or expires_at > now());
 if not found then return jsonb_build_object('valid',false,'message','الكوبون غير صالح أو منتهي الصلاحية.'); end if;
 if coalesce(p_subtotal,0) < c.min_order then return jsonb_build_object('valid',false,'message','قيمة الطلب أقل من الحد الأدنى للكوبون.'); end if;
 return jsonb_build_object('valid',true,'code',c.code,'discount_type',c.discount_type,'discount_value',c.discount_value,'discount',least(greatest(coalesce(p_subtotal,0),0),case when c.discount_type='percent' then greatest(p_subtotal,0)*c.discount_value/100 else c.discount_value end));
end; $$;
revoke all on function public.qmr_preview_coupon(text,numeric) from public;
grant execute on function public.qmr_preview_coupon(text,numeric) to anon, authenticated;

-- Orders are created through this SECURITY DEFINER function so browser prices are not trusted.
-- Stock is decremented in the same transaction as the order insert.
create or replace function public.qmr_place_order(p_order jsonb, p_coupon_code text default null)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
 v_item jsonb; v_product public.products%rowtype; v_items jsonb := '[]'::jsonb;
 v_subtotal numeric(12,2) := 0; v_discount numeric(12,2) := 0; v_total numeric(12,2) := 0;
 v_qty integer; v_code text := upper(trim(coalesce(p_coupon_code,''))); v_coupon public.coupons%rowtype;
 v_order_id uuid;
begin
 if p_order is null or jsonb_typeof(p_order->'items') is distinct from 'array' then
   raise exception 'قائمة المنتجات غير صالحة.';
 end if;
 if jsonb_array_length(p_order->'items') < 1 or jsonb_array_length(p_order->'items') > 50 then
   raise exception 'قائمة المنتجات غير صالحة.';
 end if;
 if char_length(trim(coalesce(p_order->>'customer_name',''))) not between 2 and 100 then raise exception 'تحققي من الاسم الكامل.'; end if;
 if char_length(trim(coalesce(p_order->>'phone',''))) not between 8 and 25 then raise exception 'تحققي من رقم الهاتف.'; end if;
 if char_length(trim(coalesce(p_order->>'wilaya',''))) < 2 then raise exception 'اختاري الولاية.'; end if;
 if char_length(trim(coalesce(p_order->>'municipality',''))) < 2 then raise exception 'اختاري البلدية.'; end if;
 if char_length(trim(coalesce(p_order->>'address',''))) not between 4 and 500 then raise exception 'أدخلي العنوان بالتفصيل.'; end if;
 for v_item in select value from jsonb_array_elements(p_order->'items') loop
   if coalesce(v_item->>'product_id','') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
     raise exception 'يوجد منتج غير صالح في السلة.';
   end if;
   if coalesce(v_item->>'quantity','') !~ '^[0-9]{1,2}$' then
     raise exception 'كمية المنتج غير صالحة.';
   end if;
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
 insert into public.orders(customer_name,phone,wilaya,municipality,address,notes,items,total,status,payment_method,coupon_code,discount)
 values(trim(p_order->>'customer_name'),trim(p_order->>'phone'),trim(p_order->>'wilaya'),trim(p_order->>'municipality'),trim(p_order->>'address'),left(coalesce(p_order->>'notes',''),2000),v_items,v_total,'new','cash_on_delivery',nullif(v_code,''),v_discount)
 returning id into v_order_id;
 return jsonb_build_object('success',true,'order_id',v_order_id,'subtotal',v_subtotal,'discount',v_discount,'total',v_total);
end; $$;
revoke all on function public.qmr_place_order(jsonb,text) from public;
grant execute on function public.qmr_place_order(jsonb,text) to anon, authenticated;

-- Close the old browser-direct order insertion path; storefront must use qmr_place_order.
drop policy if exists "Visitors create orders" on public.orders;
revoke insert on public.orders from anon, authenticated;
