# Velfrok Development Roadmap

Last reviewed: 2026-11-07
Source of truth: PRD.md, current main branch, and production checks reported by the project owner.

Status key: Done = present and/or verified; Partial = implemented in part; Pending = not found in the reviewed source or requires external owner action. A source-code review is not a substitute for a live production test.

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
- [ ] Add Code-128 barcode to generated PDF invoice (Order ID/SKU payload).
- [ ] Add QR code to generated PDF invoice (Order ID, transaction reference, UTR and verified total; never include secrets).
- [ ] Add customer invoice download after payment acceptance, with ownership and status checks.
- [ ] Add safe bulk Accept/Reject payment actions only if they preserve the existing per-order validation, stock and audit behavior.
- [ ] Compare invoice layout with the owner's sample invoice if exact matching is required.

### P1 — Product detail and sharing
- [ ] Add native Web Share and fallback share links (WhatsApp, Telegram, Facebook, X and Copy Link) to product details.
- [ ] Add image zoom/pinch interaction to the product detail gallery.
- [ ] Add clearer low-stock and out-of-stock states.
- [ ] Add product-card image switching/dots if the card gallery is still required.

### P1 — UTR assistance
- [ ] Add the PRD's UTR reminder popup with the exact reminder copy.
- [ ] Add clearly labelled Google Pay, PhonePe and Paytm UTR-location guide assets.
- [ ] Preserve the option to save an order as Pending UTR and submit later from My Orders.

### P1 — SEO launch
- [ ] Add per-product metadata, canonical URL and OpenGraph price/image fields.
- [ ] Add Product JSON-LD with truthful live price and stock availability.
- [ ] Add dynamic sitemap for active products and categories.
- [ ] Add robots.txt with private-route disallow rules and sitemap reference.
- [ ] Verify domain ownership in Google Search Console and submit sitemap (owner action).
- [ ] Inspect representative URLs and request indexing (owner action).

### P2 — Documentation and release assurance
- [ ] Rewrite README to describe the current production architecture rather than the original starter scaffold.
- [ ] Reconcile PRD statements about Resend/aal2, routes and implementation details with the live Gmail REST + verified Email OTP claim architecture.
- [ ] Add a final regression checklist for customer, Admin, payment, inventory, archive/restore, invoice and security boundaries.
- [ ] Run final production smoke tests after each deployment.

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