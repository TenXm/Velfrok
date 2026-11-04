# Supabase setup — Velfrok

## Existing live database

The live Velfrok project already has its production tables, foreign keys and RLS policies. **Do not re-run `migrations/001_store_schema.sql` against that live database**: it is the original starter schema and its column names differ from the current live schema.

## Admin dashboard migration

1. Open the correct Velfrok Supabase project.
2. Open **SQL Editor**.
3. Review and run `migrations/002_admin_catalog.sql`.
4. This adds:
   - `products.attributes` (JSONB) for custom product attributes.
   - `product_attribute_options` for searchable, reusable parameter values.
   - `admin_adjust_inventory(jsonb)`, an atomic bulk inventory function that requires an authenticated admin with MFA assurance `aal2`.
5. Keep `product_attribute_options` inaccessible to direct browser queries. The dashboard accesses it only through the MFA-guarded server API.
6. The first admin image upload creates the public `product-images` Storage bucket if it does not already exist. Uploads are accepted only through the MFA-guarded server route (JPG, PNG or WebP, maximum 5 MB each).

## Security

- Do not create public policies for coupons, orders, admin writes or product parameter options.
- Do not expose `SUPABASE_SERVICE_ROLE_KEY` to the browser.
- The admin API checks the signed-in user, membership in `velfrok_admins`, and the `aal2` MFA claim before using the service-role client.
- The inventory RPC independently checks admin membership and `aal2` before changing stock.
