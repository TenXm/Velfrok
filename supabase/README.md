# Supabase setup — Velfrok

## Production database warning

The live Velfrok project already has production tables, functions, triggers and RLS policies. Do not run migrations/001_store_schema.sql against the live database: it is the original starter schema and its column names differ from the current production schema.

Before applying any migration:
1. Open the correct Velfrok Supabase project and SQL Editor.
2. Check whether the migration's objects/columns/policies already exist.
3. Apply only migrations confirmed missing, in dependency order.
4. Verify the result and test with the intended role. Do not loosen RLS to make a UI request work.

## Current Admin authentication

- Customer sign-in remains on /login using the customer email OTP flow.
- Admin sign-in is separate on /admin/login: registered Admin email/password followed by a six-digit Email OTP.
- Admin OTP email delivery uses Gmail REST API over HTTPS with OAuth refresh-token credentials. The customer SMTP settings are separate and must remain unchanged.
- Required Admin Gmail server environment: GMAIL_CLIENT_ID, GMAIL_CLIENT_SECRET, GMAIL_REFRESH_TOKEN and GMAIL_FROM_EMAIL.
- OTP challenge data is server-only, expires after 10 minutes, allows at most five attempts and is one-time consumed.
- After successful OTP verification, the Supabase session is refreshed so the Custom Access Token Hook adds admin_email_otp_verified=true.
- requireAdmin() checks the signed-in user, the velfrok_admins membership and the verified JWT claim before protected Admin APIs use the service-role client.
- The current implementation does not rely on Supabase aal2 as the Admin OTP assurance mechanism. Do not re-enable old PRD aal2 assumptions without a separate reviewed migration.

## Important database protections

- Core Admin RLS policies for categories, coupons, order_items, orders and products use public.is_verified_admin().
- is_verified_admin() uses an empty search_path and checks the verified Admin Email OTP claim plus Admin membership.
- Payment RPCs confirm_order_payment and reject_order_payment independently require verified Admin state.
- Inventory and COD operations use the verified Admin database guard.
- OTP challenge and rate-limit data remain inaccessible to anon/authenticated browser roles.
- product_attribute_options must remain inaccessible to direct browser queries; Admin accesses it through the server-side API.
- The public product-images bucket is readable for storefront images; uploads are restricted to the Admin API and validated for image signature/type and size.

## Rate limiting

- UPSTASH_REDIS_REST_URL and UPSTASH_REDIS_REST_TOKEN are optional.
- If Upstash is configured, the app prefers it.
- If Upstash is absent, the app uses the Supabase database-backed velfrok_rate_limit_increment RPC. Keep its grants and security checks intact.

## Required Vercel Supabase environment

- NEXT_PUBLIC_SUPABASE_URL
- NEXT_PUBLIC_SUPABASE_ANON_KEY
- SUPABASE_SERVICE_ROLE_KEY (server only; never expose with NEXT_PUBLIC_ prefix)

Also configure the Admin Gmail REST OAuth variables listed above. Payment and CAPTCHA variables are documented in the root README.

## Operational rules

- Never expose SUPABASE_SERVICE_ROLE_KEY in client code or public environment variables.
- Never create public policies for OTP challenges, coupons, customer orders, Admin writes or product parameter options.
- Do not disable RLS or change Supabase-managed privileged roles to resolve application errors.
- Do not treat a submitted UTR or screenshot as verified payment. Admin must verify the transaction before accepting.
- Use a dedicated test product and controlled test orders for application testing.
- See ROADMAP.md for the current implementation and remaining work.