# Velfrok Production Regression Checklist

Run this checklist only against the latest Ready Vercel deployment. Use a dedicated test product and controlled test orders; do not change real customer orders or payments.

## Customer storefront
- [ ] Homepage loads on desktop and mobile.
- [ ] Search and category filtering work.
- [ ] Product cards with multiple images switch using the image dots.
- [ ] Product cards show low-stock/out-of-stock state; Add to Cart is disabled at zero stock.
- [ ] Product detail gallery changes images, thumbnails work, and pinch/double-click zoom behaves on a touch device.
- [ ] Native Share opens on a supported mobile browser; fallback share links and Copy Link work on desktop.
- [ ] Colour/attribute selection is required where applicable.
- [ ] Customer review submission still works for a signed-in customer.

## Checkout and payment
- [ ] Guest cart survives the sign-in redirect as expected.
- [ ] Server validates current product price, stock and coupon; never rely on browser totals.
- [ ] Shipping validation rejects invalid mobile, PIN and too-short address.
- [ ] UPI page shows the authorised configured business UPI ID, name and exact amount before any transfer.
- [ ] UPI QR/deep link opens with the correct amount and order reference.
- [ ] Empty UTR submission opens the reminder dialog; Google Pay, PhonePe and Paytm guide tabs work.
- [ ] Invalid UTR and missing CAPTCHA are rejected; valid 12-digit UTR is submitted.
- [ ] Admin manually verifies the payment; UTR submission alone never marks it accepted.
- [ ] Customer can leave UTR pending and later return through My Orders to submit it.
- [ ] COD flow remains available only when enabled.

## My Orders and invoices
- [ ] Customer sees only their own orders.
- [ ] Cancellation and stock restoration work only in the allowed order state.
- [ ] Courier name, AWB and official tracking link appear after dispatch details are saved.
- [ ] Invoice download is hidden/blocked until payment_status is accepted.
- [ ] Authenticated owner can download a PDF invoice after acceptance.
- [ ] Another customer cannot download the invoice by changing the order ID.
- [ ] PDF barcode scans to the order number; QR content contains only order identifiers, UTR, status and accepted total.

## Admin and database
- [ ] Admin login requires password and Email OTP; refresh preserves verified Admin session.
- [ ] Admin Product Create/Edit/Archive/Restore works; Restore remains active after refresh.
- [ ] Product image upload validates image file and size.
- [ ] Bulk inventory add/subtract/set works without allowing negative stock.
- [ ] Coupon create/edit/toggle/delete and checkout validation work.
- [ ] Bulk payment actions show only for selected UPI orders in Pending Verification; each selected order is independently checked by the verified payment RPC.
- [ ] A partial bulk failure is visible and failed orders can be reviewed individually.
- [ ] Admin invoice ZIP and combined PDF generation work.
- [ ] Audit log contains the expected order/product/coupon/inventory events.
- [ ] Customer sessions cannot access Admin APIs or another customer's order/invoice.

## SEO and launch
- [ ] Product page HTML contains a unique title, description and canonical URL.
- [ ] OpenGraph/Twitter metadata contains product title and image where available.
- [ ] Product JSON-LD price and stock availability match the current product record.
- [ ] /sitemap.xml returns the homepage and active product URLs; archived products are absent.
- [ ] /robots.txt references the sitemap and disallows private routes.
- [ ] Google Rich Results Test accepts Product structured data without critical errors.
- [ ] Domain is verified in Google Search Console; sitemap submitted; representative URLs inspected.

## Final security checks
- [ ] No service-role key or Gmail OAuth secret appears in browser source, public env or repository.
- [ ] Admin APIs still reject sessions without verified Email OTP claim.
- [ ] RLS policies remain enabled and verified Admin policies use is_verified_admin().
- [ ] Rate limiting remains active.
- [ ] CSP remains active; unsafe-eval stays removed.
- [ ] No real payment is accepted solely from a submitted UTR or screenshot.

Record the deployment URL, test date, tester and any failed item before declaring release readiness.