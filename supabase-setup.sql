-- Qmr store: run this in Supabase SQL Editor.
-- Before using live, review the policies and create your own admin account in Authentication.
create extension if not exists pgcrypto;

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  role text not null default 'customer' check (role in ('customer','admin')),
  created_at timestamptz not null default now()
);
alter table public.profiles enable row level security;

create table if not exists public.products (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(name) between 1 and 120),
  category text not null check (category in ('women','girls')),
  price numeric(12,2) not null check (price >= 0),
  old_price numeric(12,2) check (old_price is null or old_price >= 0),
  description text not null default '',
  image_url text not null,
  active boolean not null default true,
  created_at timestamptz not null default now()
);
alter table public.products enable row level security;

create table if not exists public.orders (
  id uuid primary key default gen_random_uuid(),
  customer_name text not null check (char_length(customer_name) between 2 and 100),
  phone text not null check (char_length(phone) between 8 and 25),
  wilaya text not null check (char_length(wilaya) between 2 and 80),
  address text not null check (char_length(address) between 4 and 500),
  notes text not null default '',
  items jsonb not null check (jsonb_typeof(items) = 'array'),
  total numeric(12,2) not null check (total >= 0),
  status text not null default 'new' check (status in ('new','confirmed','preparing','shipped','delivered','cancelled')),
  payment_method text not null default 'cash_on_delivery' check (payment_method = 'cash_on_delivery'),
  created_at timestamptz not null default now()
);
alter table public.orders enable row level security;

-- Helper: only users explicitly marked admin can manage private data.
create or replace function public.qmr_is_admin()
returns boolean language sql stable security definer set search_path = ''
as $$
  select exists (
    select 1 from public.profiles p
    where p.id = (select auth.uid()) and p.role = 'admin'
  );
$$;
revoke all on function public.qmr_is_admin() from public;
grant execute on function public.qmr_is_admin() to authenticated;

-- Public visitors can only read active products. Admins can manage all products.
drop policy if exists "Public read active products" on public.products;
create policy "Public read active products" on public.products for select to anon, authenticated
using (active = true or public.qmr_is_admin());
drop policy if exists "Admins insert products" on public.products;
create policy "Admins insert products" on public.products for insert to authenticated
with check (public.qmr_is_admin());
drop policy if exists "Admins update products" on public.products;
create policy "Admins update products" on public.products for update to authenticated
using (public.qmr_is_admin()) with check (public.qmr_is_admin());
drop policy if exists "Admins delete products" on public.products;
create policy "Admins delete products" on public.products for delete to authenticated
using (public.qmr_is_admin());

-- No public read/update/delete access to orders. A visitor can submit a COD order;
-- admin can read and update it. For a production store, add server-side validation/rate limiting
-- (e.g. Edge Function) because browser-submitted totals/items must not be trusted for payment logic.
drop policy if exists "Visitors create orders" on public.orders;
create policy "Visitors create orders" on public.orders for insert to anon, authenticated
with check (
  char_length(customer_name) between 2 and 100
  and char_length(phone) between 8 and 25
  and char_length(wilaya) between 2 and 80
  and char_length(address) between 4 and 500
  and total >= 0
  and status = 'new'
  and payment_method = 'cash_on_delivery'
);
drop policy if exists "Admins read orders" on public.orders;
create policy "Admins read orders" on public.orders for select to authenticated
using (public.qmr_is_admin());
drop policy if exists "Admins update orders" on public.orders;
create policy "Admins update orders" on public.orders for update to authenticated
using (public.qmr_is_admin()) with check (public.qmr_is_admin());
drop policy if exists "Admins delete orders" on public.orders;
create policy "Admins delete orders" on public.orders for delete to authenticated
using (public.qmr_is_admin());

-- Profile rows: user may read their own profile; admin can read profiles.
drop policy if exists "Read own or admin profile" on public.profiles;
create policy "Read own or admin profile" on public.profiles for select to authenticated
using (id = (select auth.uid()) or public.qmr_is_admin());
drop policy if exists "No public profile inserts" on public.profiles;
create policy "No public profile inserts" on public.profiles for insert to authenticated
with check (id = (select auth.uid()) and role = 'customer');
drop policy if exists "No profile role changes" on public.profiles;
create policy "No profile role changes" on public.profiles for update to authenticated
using (false) with check (false);
grant select, insert, update, delete on public.products to anon, authenticated;
grant insert on public.orders to anon, authenticated;
grant select, update, delete on public.orders to authenticated;
grant select, insert, update on public.profiles to authenticated;

-- Create a public image bucket with a 5MB limit. Only admins may upload/change/delete files.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('product-images', 'product-images', true, 5242880, array['image/jpeg','image/png','image/webp'])
on conflict (id) do update set public = true, file_size_limit = 5242880, allowed_mime_types = array['image/jpeg','image/png','image/webp'];
drop policy if exists "Public read Qmr product images" on storage.objects;
create policy "Public read Qmr product images" on storage.objects for select to anon, authenticated
using (bucket_id = 'product-images');
drop policy if exists "Admins upload Qmr product images" on storage.objects;
create policy "Admins upload Qmr product images" on storage.objects for insert to authenticated
with check (bucket_id = 'product-images' and public.qmr_is_admin());
drop policy if exists "Admins update Qmr product images" on storage.objects;
create policy "Admins update Qmr product images" on storage.objects for update to authenticated
using (bucket_id = 'product-images' and public.qmr_is_admin())
with check (bucket_id = 'product-images' and public.qmr_is_admin());
drop policy if exists "Admins delete Qmr product images" on storage.objects;
create policy "Admins delete Qmr product images" on storage.objects for delete to authenticated
using (bucket_id = 'product-images' and public.qmr_is_admin());

-- IMPORTANT: after creating your admin user via Authentication > Users, run this command
-- with that user's actual UUID substituted. Never expose the user's service role key.
-- insert into public.profiles (id, role) values ('YOUR-AUTH-USER-UUID', 'admin')
-- on conflict (id) do update set role = 'admin';
