# Supabase setup — Velfrok

## Existing live database

The live Velfrok project already has its production tables, foreign keys and RLS policies. **Do not re-run `migrations/001_store_schema.sql` against that live database**: it is the original starter schema and its column names differ from the current live schema.

## Admin dashboard migrations

1. Open the correct Velfrok Supabase project and open **SQL Editor**.
2. Confirm that the existing `velfrok_admins`, `admin_email_otp_challenges`, `custom_access_token_hook(jsonb)`, and `is_verified_admin()` objects are present.
3. Run `migrations/008_admin_email_otp_security.sql`. This keeps the OTP challenge table private to service-role code and adds atomic one-time OTP consumption. It also grants the configured Supabase Auth hook permission to execute.
4. Run `migrations/009_admin_email_otp_rpcs.sql`. This changes inventory and COD database operations to require `public.is_verified_admin()`, which checks the signed-in user, the `admin_email_otp_verified=true` JWT claim, and an admin membership row.
5. Run `migrations/010_free_tier_rate_limit.sql`. This provides database-backed rate limiting when Upstash Redis is not configured.
6. Keep `product_attribute_options` inaccessible to direct browser queries. The dashboard accesses it only through the server-side Admin API.
7. The first admin image upload creates the public `product-images` Storage bucket if it does not already exist. Uploads are accepted only through the Admin API (JPG, PNG or WebP, maximum 5 MB each).

## Admin authentication

- Customer sign-in remains at `/login` and continues to use customer email OTP.
- Admin sign-in is separate at `/admin/login`: registered Admin email + password, followed by a 6-digit email code sent through Resend.
- The Admin OTP is bound to the Supabase user and session, expires after 10 minutes, allows at most five attempts, and can be requested no more than once per minute (five requests per day).
- After successful OTP verification, refresh the Supabase session so the Custom Access Token Hook adds `admin_email_otp_verified=true`.
- `requireAdmin()` checks the signed-in user, the `role='admin'` membership, and the verified JWT claim before using the service-role client.
- Never expose `SUPABASE_SERVICE_ROLE_KEY` to the browser. Never create public policies for the OTP table, coupons, orders, Admin writes or product parameter options.
- The database-backed rate limiter is the no-extra-service fallback. If Upstash is configured, the application continues to prefer Upstash.

## Required server environment

Keep these values configured in the Vercel server environment (never expose the service-role key as a `NEXT_PUBLIC_` variable):

- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`
- `RESEND_API_KEY`
- `RESEND_FROM_EMAIL`

The Supabase Custom Access Token Hook must remain configured to call `public.custom_access_token_hook(jsonb)`. Verify the hook is enabled before testing Admin login.
