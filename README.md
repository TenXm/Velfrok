# Velfrok — Better living.

A mobile-first storefront starter inspired by the supplied reference design and aligned with the uploaded Online Shop Master PRD.

> This repository currently contains the storefront UI foundation and a security-minded project scaffold. It is **not production-ready for taking payments or storing customer orders** until the backend, authentication, RLS policies, checkout and admin phases are completed and tested.

## Android-only GitHub workflow (no terminal)

1. Download `velfrok-shop.zip` to your Android phone and extract it with your phone's Files app.
2. Open GitHub in your mobile browser and sign in.
3. Create a repository named `velfrok-shop`. Keep it private while developing.
4. In the repository, use **Add file → Upload files**. Select the extracted project files and folders. If your mobile browser cannot upload folders, create files individually using **Add file → Create new file** and paste each file's contents. Keep the path shown in this repository (for example `app/globals.css`).
5. Commit the upload.
6. Create free accounts for Supabase and Vercel using your phone. Connect the GitHub repository to Vercel. Vercel builds the Next.js project; you do not need a terminal.
7. Add environment variables in Vercel project settings. Never commit `.env.local`, service-role keys, SMTP secrets, or Redis tokens to GitHub.

## Project paths

- `app/layout.tsx` — document metadata and root layout
- `app/page.tsx` — storefront entry
- `app/globals.css` — responsive visual system and mobile layout
- `components/storefront.tsx` — storefront, search/filter, cart drawer, product card actions
- `lib/products.ts` — temporary sample catalog; later replace with Supabase queries
- `lib/store-config.ts` — editable brand/address/contact/UPI details
- `supabase/migrations/001_store_schema.sql` — schema and baseline RLS policy design
- `.env.example` — names of environment variables only; no secrets

## Editable business details

Open `lib/store-config.ts` in GitHub's mobile file editor and change:
- `address`
- `contactEmail`
- `contactPhone`
- `upiId`
- `freeShippingAbove`

The UPI ID is currently a display/configuration value only. The checkout must generate a locked amount on the trusted server and verify payment/UTR according to the PRD before accepting real orders.

## Build phases (follow in order)

1. **Repository & hosting** — upload these files, connect Vercel.
2. **Supabase schema and RLS** — apply and review the SQL migration; test anonymous, customer and admin access.
3. **Authentication** — customer email OTP and admin password + email OTP MFA (`aal2`).
4. **Storefront data** — replace sample catalog with Supabase products, real product details, stock and image storage.
5. **Checkout** — server-side cart price lookup, coupon validation, atomic stock reservation, UPI QR/deep link, UTR reminder and order creation.
6. **Admin console** — orders/invoices, products, inventory, coupons; guard every page and server action.
7. **Security audit** — rate limits, Zod validation, CSP, RLS tests and payment reconciliation.
8. **SEO launch** — dynamic product metadata, Product JSON-LD, sitemap, robots and Google Search Console.

## Important security rules

- Never trust price, subtotal, discount, inventory, role, or payment status submitted by the browser.
- Never expose `SUPABASE_SERVICE_ROLE_KEY` to a browser/client component.
- Store admin role only in server-controlled `app_metadata`, never customer-editable user metadata.
- Verify admin role and MFA assurance on every protected request.
- Confirm UPI payments manually/through a trusted provider before marking orders accepted. A submitted UTR is not proof of payment.
- Test SQL policies before adding real customer data.

## Current sample storefront notes

The catalog uses sample product records and remote demonstration images. Replace these with your own licensed product photos and live database data before public launch. The cart is currently client-side demo state and does not persist across reloads.
