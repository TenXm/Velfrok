# Velfrok — Better living.

Velfrok is a production-oriented, mobile-first commerce application built with Next.js App Router, Supabase and Vercel.

## Current capabilities

- Customer email OTP sign-in and private order history.
- Live Supabase product catalogue, product details, multi-image gallery, variants, reviews and cart.
- Server-validated checkout, coupons, stock handling and UPI payment instructions.
- 12-digit UTR submission with hCaptcha and manual Admin payment verification.
- Admin password + Email OTP sign-in, protected Admin APIs and verified-admin database policies.
- Admin Orders, Products, Archive/Restore, Inventory, Coupons, Invoice Settings and order archives.
- Courier/AWB tracking links, CSV export and PDF invoice generation.
- Durable Admin Audit Log for order, product, coupon and inventory operations.
- Product SEO metadata, OpenGraph tags, Product JSON-LD, sitemap and robots rules.

## Architecture and security

- Next.js 15.5.29 App Router runs on Vercel.
- Supabase Postgres, Auth and Storage provide the backend.
- The browser uses only the Supabase anon key. SUPABASE_SERVICE_ROLE_KEY is server-only and must never use a NEXT_PUBLIC_ prefix.
- Admin access requires an Admin membership and a separately verified Email OTP claim (admin_email_otp_verified=true).
- Admin OTP delivery uses Gmail REST API with OAuth refresh credentials. Customer SMTP configuration remains separate.
- Core Admin database policies use public.is_verified_admin(); payment and other protected RPCs retain their own checks.
- Checkout totals, discounts and inventory are verified server-side. Never trust browser-submitted prices or payment state.
- UPI payments are manually verified by an Admin. A submitted UTR or WhatsApp screenshot is not proof of payment.
- Rate limiting prefers Upstash when configured and otherwise uses the Supabase database-backed limiter.
- The active CSP has unsafe-eval removed. unsafe-inline remains for compatibility; do not replace it with nonce-based whole-site rendering without a separate tested migration.

## Important routes

| Route | Purpose |
|---|---|
| / | Storefront |
| /products/[id] | Product details and sharing |
| /checkout | Customer checkout |
| /payment/[token] | UPI instructions and UTR submission |
| /my-orders | Customer order history, tracking and verified invoice download |
| /admin/login | Admin sign-in and Email OTP |
| /admin | Admin workspace |
| /sitemap.xml | Dynamic active-product sitemap |
| /robots.txt | Search crawler rules |

## Vercel environment variables

Required server/public configuration (set values in Vercel Project Settings; never commit secrets):

- NEXT_PUBLIC_SUPABASE_URL
- NEXT_PUBLIC_SUPABASE_ANON_KEY
- SUPABASE_SERVICE_ROLE_KEY (server only)
- GMAIL_CLIENT_ID
- GMAIL_CLIENT_SECRET
- GMAIL_REFRESH_TOKEN
- GMAIL_FROM_EMAIL
- NEXT_PUBLIC_HCAPTCHA_SITEKEY
- NEXT_PUBLIC_UPI_ID (authorised business UPI destination)
- NEXT_PUBLIC_UPI_NAME
- NEXT_PUBLIC_SITE_URL (optional; defaults to https://velfrok.vercel.app)
- UPSTASH_REDIS_REST_URL and UPSTASH_REDIS_REST_TOKEN (optional; database rate limiting is used when absent)

Keep existing customer SMTP variables separate from the Admin Gmail REST OAuth variables.

## Supabase database changes

The live database already contains production tables and policies. Read supabase/README.md before applying SQL. In particular, do not rerun migrations/001_store_schema.sql against the live database; it is the original starter schema and does not match every current production column.

Apply only migrations that are confirmed missing from the correct Velfrok Supabase project. Do not run a migration twice just because it appears in the repository.

## Development

```bash
npm install
npm run dev
```

Production build:

```bash
npm run build
```

The repository currently has no committed package lockfile. Vercel resolves dependencies from package.json during deployment.

## Roadmap and release checks

See [ROADMAP.md](./ROADMAP.md) for the PRD-to-code comparison, remaining work, priorities and verification rules.

Before launch:

1. Configure an authorised business UPI ID and display name; do not accept real payments while UPI configuration is missing.
2. Run a controlled payment/UTR verification test.
3. Test Admin invoice PDF generation and customer invoice download after a payment is accepted.
4. Verify product metadata, OpenGraph, JSON-LD, sitemap.xml and robots.txt in production.
5. Verify domain ownership in Google Search Console, submit the sitemap and request indexing.
6. Run the final customer/Admin/security regression checklist.

## Safe operating rules

- Never expose service-role keys, Gmail OAuth secrets, customer OTPs or Admin OTPs.
- Never ask customers to disclose UPI PINs, passwords or OTPs.
- Never mark a payment accepted solely because a UTR or screenshot was submitted.
- Use dedicated test products and controlled test orders. Do not mutate real customer orders for feature testing.
- Preserve Admin Email OTP verification, RLS, rate limits and audit logging during future changes.