-- QMR: repair public product loading safely.
-- Run this once in Supabase SQL Editor for the EXISTING project.
-- It avoids requiring anonymous visitors to execute qmr_is_admin().
-- It does NOT grant visitors access to read orders.

drop policy if exists "Public read active products" on public.products;
drop policy if exists "Authenticated read active products and admins" on public.products;

create policy "Public read active products" on public.products
for select to anon
using (active = true);

create policy "Authenticated read active products and admins" on public.products
for select to authenticated
using (active = true or public.qmr_is_admin());

revoke all privileges on table public.products from anon;
grant select on table public.products to anon;

-- Preserve admin access while keeping visitor orders private.
revoke all privileges on table public.orders from anon;
grant insert on table public.orders to anon;

-- qmr_is_admin() remains executable only by signed-in users who need it.
revoke execute on function public.qmr_is_admin() from public, anon;
grant execute on function public.qmr_is_admin() to authenticated, service_role;
