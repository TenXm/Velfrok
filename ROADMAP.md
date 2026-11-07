# Velfrok Development Roadmap

Last reviewed: 2026-11-07
Source of truth: PRD.md, current main branch, and production checks reported by the project owner.

Status key: [x] Done = production-tested or verified in the reviewed source; [ ] Committed = code is on main but awaits Vercel deployment/production testing; [ ] Pending = external action or further implementation remains. A source-code review is not a substitute for a live production test.

## Verified foundation
- [x] Next.js 15.5.29 production deployment on Vercel.
- [x] Supabase-backed customer, product, order, coupon and admin workflows.
- [x] Customer email OTP and Admin password + email OTP verification.
- [x] Admin APIs enforce membership and the verified Email OTP claim.
- [x] RLS admin policies for core catalogue/order tables use is_verified_admin().
- [x] Rate limiting for Admin OTP, order APIs, payment status and public email check.
- [x] CSP enabled; unsafe-eval removed. unsafe-inline remains intentionally to avoid an unsafe whole-site rendering refactor.
- [x] UPI intent/QR, UTR submission, hCaptcha and manual Admin payment verification.
- [x] Customer order history, cancellation and stock restoration.
- [x] Courier/AWB tracking link flow (customer follows the courier's official tracking page manually).
- [x] Admin Product, Inventory, Coupon, Order and Invoice workflows.
- [x] Product archive, Archived filter and Restore flow; owner verified restore survives refresh.
- [x] Durable Admin Audit Log with order, product, coupon and inventory event coverage.
- [x] Product CRUD fields tested by owner using a dedicated test product.
- [x] Admin camera barcode scanning verified after Permissions Policy update.

## Remaining implementation work

### P0 — Payment and launch readiness
- [ ] Configure authorised business UPI ID and display name in Vercel (NEXT_PUBLIC_UPI_ID, NEXT_PUBLIC_UPI_NAME).
- [ ] Test the configured UPI deep link/QR and end-to-end manual UTR verification with a controlled test transaction.
- [ ] Keep payment acceptance manual unless a trusted payment-provider integration is deliberately introduced. A UTR alone is not proof of payment.

### P1 — Invoice and order operations
- [ ] Committed: Code-128 order-number barcode added to PDF invoices; verify scan/readability after deployment.
- [ ] Committed: QR added with order ID, order number, UTR, payment status and accepted total. Current schema has no separate transaction-reference field; verify QR contents after deployment.
- [ ] Committed: customer invoice endpoint checks bearer-authenticated ownership and accepted payment status; verify download after deployment.
- [ ] Committed: bulk Accept/Reject for up to 20 selected UPI orders in Pending Verification; each item uses the existing payment RPC and audit log. Verify partial-failure behavior after deployment.
- [ ] Compare invoice layout with the owner's sample invoice if exact matching is required.

### P1 — Product detail and sharing
- [ ] Committed: native Web Share plus WhatsApp, Telegram, Facebook, X and Copy Link fallback; Instagram users copy the link and share it in-app. Verify on mobile and desktop.
- [ ] Committed: product gallery pinch zoom and double-click zoom/reset; verify on touch devices.
- [ ] Committed: Product Details now shows low-stock quantity and distinct Out of Stock text/style; verify against live stock.
- [ ] Committed: product cards now have accessible image dots when multiple images exist; verify with a multi-image product.

### P1 — UTR assistance
- [ ] Committed: UTR help dialog includes the exact reminder copy and opens when an empty UTR submission is attempted; verify after deployment.
- [ ] Partial: app-specific text navigation guide is committed for Google Pay, PhonePe and Paytm. Annotated screenshots/illustrations remain pending; labels can vary by app version.
- [ ] Preserve the option to save an order as Pending UTR and submit later from My Orders.

### P1 — SEO launch
- [ ] Committed: per-product metadata, canonical URL, OpenGraph/Twitter image and price tags; verify generated HTML after deployment.
- [ ] Committed: Product JSON-LD uses current product price and quantity-based availability; verify with Google's Rich Results Test.
- [ ] Committed: hourly revalidated sitemap includes homepage and active product URLs. No category-detail route currently exists, so no nonexistent category URLs are emitted.
- [ ] Committed: robots.txt allows storefront and disallows Admin, API, checkout, login, My Orders and payment-token routes.
- [ ] Verify domain ownership in Google Search Console and submit sitemap (owner action).
- [ ] Inspect representative URLs and request indexing (owner action).

### P2 — Documentation and release assurance
- [x] README rewritten to describe current production architecture.
- [x] PRD now includes an as-built addendum documenting Gmail REST + verified Email OTP claim, current routes and manual payment/courier limitations.
- [ ] Add/run the final regression checklist after the current deployment is Ready.
- [ ] Run final production smoke tests after each deployment.

### Still pending outside repository

- [ ] Configure authorised business UPI ID and display name in Vercel, then perform a controlled real-world test payment.
- [ ] Verify the production domain in Google Search Console, submit sitemap.xml and request indexing (requires domain-owner access).
- [ ] Upload/provide the preferred sample invoice only if exact visual matching is required.
- [ ] Prepare approved current annotated UPI guide images; text guide is implemented, image assets are not.

## Safe implementation rules
1. Inspect the existing route, schema, API authorization and UI before changing a feature.
2. Keep changes narrowly scoped; do not refactor unrelated production infrastructure.
3. Never expose Supabase service-role credentials or trust client-submitted prices/payment status.
4. Preserve Admin Email OTP verification, RLS, rate limits and durable audit logging.
5. Use dedicated test products/orders; do not mutate real customer orders or payments for testing.
6. Commit one coherent feature at a time and wait for Vercel deployment before production verification.
7. Mark a task Done only after source review and, where applicable, a production test.

## Known differences between PRD and current implementation
- PRD describes Supabase aal2 MFA and Resend; current Admin protection uses password + separately verified Email OTP and the admin_email_otp_verified=true claim, with Gmail REST API delivery.
- PRD uses /product/[sku]; the current detail route is /products/[id].
- Courier tracking is a manual official tracking-page link, not a courier API integration.
- UPI payment confirmation is manual Admin verification, not automatic bank-side confirmation.