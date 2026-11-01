# Supabase setup — Velfrok

1. Create a Supabase project on your phone.
2. Open **SQL Editor** in Supabase.
3. Copy `migrations/001_store_schema.sql` into a new SQL query and review before running.
4. Confirm RLS is enabled for every table.
5. Do not create a public policy for coupons, orders, or admin writes.
6. Later phases must add server-only atomic order RPCs, verified-admin helper (`app_metadata.role = admin` and `aal = aal2`), image bucket policy, and rate limits.

The schema is intentionally conservative: checkout writes are not enabled until the trusted server RPC is implemented. This prevents accidentally exposing order creation or trusting browser-submitted prices.
