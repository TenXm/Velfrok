e# Master Product Requirements Document (PRD): Full-Stack Secure Online Shop (Build to Google Indexing)

**Document Version:** 1.0 (Combined Aesthetic, Functional, Security & SEO Specification)  
**Target Stack (100% Free Tier):** GitHub · Next.js (App Router) · Supabase (Postgres, Auth, Storage, RLS) · Resend (Free Email OTP) · Upstash Redis (Free Rate Limiting) · Vercel · Google Search Console

---

## 1. Executive Summary & Architecture Goals

This Product Requirements Document (PRD) defines the end-to-end functional design, security architecture, database rules, and chronological execution roadmap—from initial repository setup to final Google Search Console indexing—for a modern, high-conversion online shop.

The platform consists of two primary applications sharing a strict server-enforced trust boundary:
1. **Customer Storefront & UPI Checkout Experience**: A fast, mobile-first shopping experience featuring a bold brand header, live search, category filtering, multi-image product galleries, colour variant switching, native social sharing with OpenGraph rich previews, a floating cart launcher, dynamic locked-amount UPI QR payments, and an automated **12-digit UTR Reminder Popup** with a visual UPI app guide.
2. **2FA-Protected Admin Operations Console**: A dedicated back-office portal gated by **Password + Email OTP Two-Factor Authentication (`aal2`)** containing four operational modules—**Orders (with Barcode/QR Invoice Generator)**, **Products (with inline category creation & auto-discount math)**, **Inventory Management (single & multi-select)**, and **Coupon Codes**.

---

## 2. Zero-Cost (100% Free Tier) Technology Stack

| Layer | Selected Free Tool | Free-Tier Allowance & Role in Architecture |
| :--- | :--- | :--- |
| **Source Control & CI/CD** | **GitHub** | Unlimited public/private repositories; automatic push-to-deploy triggers with Vercel. |
| **Frontend & Server Runtime** | **Next.js (App Router) on Vercel** | Free Hobby tier (100 GB bandwidth/month, serverless functions, Server Actions, automatic HTTPS & edge caching). |
| **Database & Row-Level Security** | **Supabase Postgres** | 500 MB database storage, unlimited API requests, native Row-Level Security (RLS), and atomic PL/pgSQL transactions. |
| **Product Image Hosting** | **Supabase Storage** | 1 GB free object storage with CDN caching for multi-image product galleries and UTR guide assets. |
| **Customer & Admin 2FA Auth** | **Supabase Auth + Resend Email Hook** | Free Email OTP & Password + MFA (`aal2`) with Resend email delivery through the signed Supabase Auth Send Email Hook. *(Optional: Firebase Auth Spark Tier for 10k/mo free SMS OTP, or verified 10-digit mobile capture at checkout).* |
| **Rate Limiting & Brute-Force Protection** | **Upstash Redis** | 10,000 free requests/day to cap OTP login requests, coupon lookups, and UTR submissions. |
| **Barcode & QR Generation** | **`bwip-js` / `jsbarcode` + `qrcode`** | Open-source server/client SVG rendering for dynamic UPI payment QR codes and Tax Invoice Code-128 barcodes. |
| **Search Engine Discovery** | **Google Search Console** | Free domain verification, dynamic `sitemap.xml` ingestion, and `Product` JSON-LD rich snippet indexing. |

---

## 3. Customer Interface Requirements (UI/UX & Functional Spec)

### 3.1 Global Storefront Header
* **Left Side**: Store / Current Page Name displayed in **bold typography** (e.g., **STORE NAME — Shop Catalog** / **Checkout** / **My Orders**) acting as a home navigation anchor.
* **Right Side Controls**:
  * **Live Search Input**: Filters catalog products in real time by product name, SKU, colour, or keyword with debounced server/client query matching.
  * **Category Drop-Down Menu**: Lists `All Categories` plus all active categories synced dynamically from the database.
  * **Dynamic Login / Logout Button**: Displays `Login` when unauthenticated (opening the OTP authentication modal) and switches to `My Account / Logout` (with a link to **My Orders**) when an active customer session exists.

### 3.2 Product Catalog & Product Details Page
* **Multi-Image Product Display**:
  * Every product supports multiple high-resolution images (front angle, detail zoom, lifestyle view, variant view).
  * Product cards feature thumbnail/dot switchers; the Product Details page provides an interactive main stage image with a clickable thumbnail strip and pinch-to-zoom support.
* **Variant & Pricing Display**:
  * Displays **Selling Price**, struck-through **MRP**, and the **Automatically Calculated Discount Percentage Badge** (`((MRP - Selling Price) / MRP) * 100`).
  * Displays interactive **Colour / Variant Pills** and real-time stock urgency badges (e.g., `Only 4 left in stock` when quantity `< 10`, or `Out of Stock` when `0`).
* **Universal "Add to Cart" Availability**:
  * Every product card in the catalog grid includes a direct **Add to Cart** button.
  * Every Product Details page includes a primary **Add to Cart** button alongside quantity controls.
* **Floating Checkout Redirect Button**:
  * As soon as a customer adds at least 1 item to the cart, a persistent **Floating Cart / Checkout Button** appears at the bottom-right corner of the viewport showing the live item count and subtotal, redirecting directly to the **Cart / Checkout Page** when tapped.
* **Multi-Platform Product Share Symbol**:
  * Every Product Details page features a prominent **Share Symbol / Button** that invokes the native Web Share API (`navigator.share` on mobile) and a fallback share sheet for **WhatsApp, Telegram, Instagram/Facebook, X (Twitter), and Copy Link**, backed by dynamic OpenGraph (`og:title`, `og:image`, `og:price:amount`) meta tags.

### 3.3 Cart, Coupon Redemption & UPI/UTR Checkout Flow
* **Guest Browsing with Delayed Login**:
  * Customers can browse products, add items to cart (`localStorage`), and test coupon codes before being prompted for quick OTP authentication at the final shipping/order confirmation step.
* **Coupon Redemption**:
  * Customers can enter a promo code on the Checkout page. A Next.js Server Action validates whether the code is active, unexpired, within usage limits, and meets the `Minimum Order Value`, returning the capped discount amount.
* **Shipping Address Form**:
  * Collects `Full Name`, `10-Digit Mobile Number` (validated via `/^[6-9]\d{9}$/`), `Email Address`, `Full Street Address & Landmark`, `City`, `State`, and `6-Digit PIN Code`.
* **Dynamic Server-Generated UPI QR Code & Deep Link**:
  * The server locks the final payable amount and generates a standard UPI URI (`upi://pay?pa=MERCHANT_VPA&pn=STORE_NAME&am=LOCKED_AMOUNT&cu=INR&tn=ORDER_ID`) rendered as a scannable QR code on desktop and an instant UPI app deep-link button on mobile.
* **Optional 12-Digit UTR Submission & Mandatory UTR Reminder Popup**:
  * The checkout form includes an optional **UTR (Unique Transaction Reference) Number** field (strictly 12 digits).
  * **UTR Reminder Popup Rule**: If the customer clicks **Place Order** without entering a UTR number, the interface displays a dedicated modal popup:
    * **Exact Reminder Message**: *"Please add UTR number to confirm order"*
    * **Visual UPI App Guide**: Displays an annotated reference graphic showing exactly where the customer can locate the 12-digit UTR / UPI Transaction ID inside **Google Pay**, **PhonePe**, and **Paytm**.
    * **Popup Actions**: Allows the customer to paste the 12-digit UTR immediately inside the popup to confirm the order, OR save the order in `Pending UTR` status and submit the UTR later from their **My Orders** page.

### 3.4 Customer "My Orders" & Tracking Page
* Displays the authenticated customer's order history with live status stages: `Pending UTR` → `Payment Verifying` → `Confirmed & Packed` → `Shipped (with Courier & AWB Tracking Link)` → `Delivered`.
* Provides an inline **Submit 12-Digit UTR** input for any order still in `Pending UTR` status.
* Unlocks a **Download Tax Invoice (PDF)** button once the Admin marks the payment status as `Accepted`.

---

## 4. Admin Interface Requirements (2FA + 4 Core Tabs)

### 4.1 Admin Security Gate (2-Factor Authentication)
* Visiting the specific `/admin` route requires **2-Factor Authentication**:
  1. **Factor 1**: Admin Email + Master Password verification.
  2. **Factor 2**: 6-digit Email OTP / MFA verification elevating the Supabase session assurance level to `aal2`.
* Server middleware verifies both `aal === 'aal2'` and `auth.jwt() -> 'app_metadata' ->> 'role' === 'admin'` before rendering any admin data or executing any admin Server Action.

### 4.2 Admin Analytics Summary Bar
* Displays real-time operational counters at the top of the Admin portal: `Pending UTR Verifications`, `Accepted Revenue (₹)`, `Low-Stock SKUs (<10)`, and `Bulk CSV Export`.

### 4.3 Tab 1: Order Management & Invoice Generator
* **Multi-Select Capability**: Checkbox on every order row plus a master `Select All` checkbox enabling bulk status updates (`Bulk Accept Payment`, `Bulk Reject Payment`, `Bulk Export CSV`).
* **Order Row Data Fields**:
  * **Unique Order ID** (e.g., `ORD-2026-8491`)
  * **Product SKU(s)** (all line-item SKUs in the order)
  * **Product Image(s)** (multi-image thumbnail strip for ordered products)
  * **Order Quantity** (per line item and total units)
  * **Transaction ID** (system-generated payment reference)
  * **Submitted UTR Number** (displays verified 12-digit UTR badge, or `Pending UTR` warning badge)
  * **Payment Accepted or Rejected Drop-Down Menu** (`Pending UTR` / `Pending Verification` / `Accepted` / `Rejected` — selecting `Rejected` automatically restores reserved product stock inside a database transaction)
  * **Customer Full Address with Mobile Number** (formatted for shipping labels)
  * **Invoice Generator Button (with Barcode & QR Code)**:
    * Generates a print-ready A4/thermal tax invoice embedding a **Code-128 Barcode** (encoding the Unique Order ID / SKU) and a **2D QR Code** (encoding Order ID, Transaction ID, UTR, and Verified Total).
    * **Build Checkpoint — Custom Sample Invoice Training**: *When implementing this module during Phase 5 of development, the developer/agent will prompt you to upload your sample invoice image/PDF so the exact header, table columns, tax breakdown, barcode placement, and footer layout match your sample.*

### 4.4 Tab 2: Product Management (Add, Edit, Delete)
* **Add Product Button & Modal/Form** containing:
  * **Product Image (Multiple)**: Upload multiple images to Supabase Storage (`product-images` bucket) with drag-to-reorder and primary image selection.
  * **Product Name**: Full display title (auto-generates SEO slug).
  * **SKU**: Unique alphanumeric stock-keeping unit code.
  * **Category Drop-Down Selection (with Inline Add Category)**: Selects from existing categories; if the desired category is not found, selecting **"+ Add New Category"** opens an inline input that creates and selects the new category immediately without leaving the form.
  * **Quantity**: Initial available inventory count.
  * **Colour**: Single or multiple comma-separated colour options.
  * **Dimensions**: Length × Width × Height (`cm` or `mm`).
  * **Weight**: Net/shipping weight (`g` or `kg`).
  * **MRP (₹)**: Maximum Retail Price.
  * **Selling Price (₹) with Automatic Discount Calculation**: Live reactive calculation displaying `Discount % = Math.round(((MRP - Selling Price) / MRP) * 100)` automatically as the admin types, plus a generated Postgres column storing the discount percentage.
  * **Description**: Full rich specification and care details.
* **Edit Product Button**: Pre-fills all product fields and existing multi-image gallery for in-place updates.
* **Delete Product Button**: Soft-deletes (`is_active = false`) or permanently deletes products not referenced by existing invoices, protected by a confirmation modal.

### 4.5 Tab 3: Inventory Management
* Dedicated high-speed stock control table supporting both **Single-Select** and **Multi-Select** checkboxes.
* **Bulk Inventory Actions**: Allows the admin to select multiple products and apply `+ Add Stock`, `- Deduct Stock`, or `= Set Exact Stock Quantity` in a single atomic batch, plus quick filters for `Low Stock (<10)` and `Out of Stock (0)`.

### 4.6 Tab 4: Coupon Code Management
* Create, toggle (`Active` / `Disabled`), and delete promotional codes immediately redeemable on the Customer Checkout page.
* **Coupon Parameters**: `Coupon Code` (e.g., `WELCOME15`), `Discount Type` (`Percentage %` or `Flat ₹`), `Discount Value`, `Minimum Order Value (₹)`, `Maximum Discount Cap (₹)`, `Expiry Date`, `Total Usage Limit`, and `Per-Customer Limit`.

---

## 5. Security Architecture & Trust Boundary Specification

### 5.1 Data Flow & Trust Boundaries

| Execution Environment | Permitted Responsibilities | Strictly Prohibited (Never Trusted from Client) |
| :--- | :--- | :--- |
| **Client Browser (Untrusted)** | Rendering UI state, multi-image gallery switching, local cart storage (`[{productId, quantity, colour}]`), displaying the auto-discount preview, and capturing form inputs. | Submitting final cart totals, item prices, discount percentages, role flags (`isAdmin: true`), or marking payments as verified. |
| **Next.js Server Actions & Route Handlers (Trusted)** | Querying authoritative `mrp` and `selling_price` from Supabase, validating coupon eligibility, computing final payable totals, snapshotting prices into `order_items`, reserving stock atomically, enforcing Upstash rate limits, and verifying admin `aal2` JWT claims. | Trusting any price, subtotal, discount figure, or user role sent in a client request body. |

### 5.2 Authentication & Role Verification
* **Customer Session State**: Managed via HTTP-only, `Secure`, `SameSite=Lax` cookies issued by `@supabase/ssr`. Customer routes verify `supabase.auth.getUser()` on the server.
* **Admin Session & Role Verification**:
  * The `'admin'` role is stored exclusively inside `auth.users.raw_app_meta_data` (`{"role": "admin"}`), which can only be modified by the Supabase Service Role on the backend—never inside `raw_user_meta_data` (which a user could tamper with via client SDK calls).
  * Every `/admin` page and Admin Server Action executes a server-side guard verifying:
    1. `user.app_metadata?.role === 'admin'`
    2. `mfaData.currentLevel === 'aal2'` (confirming both password and Email OTP 2FA were completed in the current session).

### 5.3 Database Rules (Plain-English Supabase RLS)

Before writing SQL migrations, the following plain-english access rules govern every table and storage bucket:

* **`products` & `categories` tables**:
  * **Who can read**: Any visitor (anonymous or logged-in) can read active products (`is_active = true`); verified admins can read all products including drafts/archived items.
  * **Who can insert/update/delete**: Strictly restricted to authenticated users whose server-verified JWT contains `app_metadata.role = 'admin'` and `aal = 'aal2'`.
* **`coupons` table**:
  * **Who can read**: Only verified admins (`aal2`) and the server-side checkout validator can read the `coupons` table. Public `SELECT` is blocked so malicious users cannot scrape all active promo codes.
  * **Who can insert/update/delete**: Strictly restricted to verified admins (`aal2`).
* **`orders` & `order_items` tables**:
  * **Who can read**: Authenticated customers can read **only** rows where `user_id = auth.uid()`. Verified admins (`aal2`) can read all orders.
  * **Who can insert**: Authenticated customers can create orders exclusively through the atomic `place_order_atomic` Postgres RPC called by the checkout Server Action, which snapshots current product prices and deducts stock.
  * **Who can update**: Customers can update **only** the `utr_number` column on their own order when `payment_status = 'pending_utr'` via a dedicated security-definer RPC. Only verified admins (`aal2`) can update `payment_status` (`accepted` / `rejected`) or fulfillment tracking fields.
* **`product-images` Supabase Storage Bucket**:
  * **Who can read**: Publicly readable via CDN URLs for fast storefront rendering and Google Shopping indexing.
  * **Who can upload/delete**: Strictly restricted to verified admins (`app_metadata.role = 'admin'` and `aal = 'aal2'`), enforcing MIME-type allowlists (`image/jpeg`, `image/png`, `image/webp`) and a 5 MB max file size.

### 5.4 Threat Mitigations & Validation

| Attack Vector | Concrete Mitigation Strategy |
| :--- | :--- |
| **Payload & Price Spoofing** | Validate all incoming Server Action inputs with **Zod schemas**. Reject negative or zero quantities (`z.number().int().min(1).max(20)`), strip any client-supplied price fields, and recompute all math from Postgres rows on the server. |
| **Duplicate / Reused UTR Replay** | Enforce a strict 12-digit numeric regex (`/^[0-9]{12}$/`) in both Zod and a Postgres `CHECK` constraint, backed by a partial **unique index** (`CREATE UNIQUE INDEX idx_unique_utr ON orders(utr_number) WHERE utr_number IS NOT NULL`) so a valid UTR from an old order can never be reused to claim a new order. |
| **Inventory Race Conditions (Overselling)** | Use a single Postgres transaction (`UPDATE products SET quantity = quantity - $qty WHERE id = $id AND quantity >= $qty`) during order placement so two concurrent checkouts cannot buy the last unit. Automatically restore stock if an admin marks payment as `Rejected`. |
| **OTP Spam & Brute-Force Attacks** | Integrate **Upstash Redis Rate Limiting** in Next.js middleware and Server Actions: cap OTP generation to **3 attempts per 15 minutes per email/IP**, cap OTP verification to **5 attempts per 15 minutes**, cap coupon validation to **10 attempts per minute**, and cap UTR submission to **5 attempts per 10 minutes**. |
| **XSS & Malicious Image Uploads** | Sanitize all product descriptions, enforce strict Content-Security-Policy (CSP) headers in `next.config.ts`, and restrict image uploads to admin-authenticated sessions with MIME verification. |

---

## 6. Chronological Execution Plan: Start Building to Last Google Indexing

### Phase 1: Project Initialization & Free-Tier Cloud Provisioning
1. Create a GitHub repository and initialize a **Next.js (App Router) + TypeScript + Tailwind CSS + Zod** project.
2. Create a free **Supabase** project, configure **Resend** with a verified sender address, and connect the Supabase Auth **Send Email Hook** to the application's signed email endpoint using the hook secret and Resend API key.
3. Create a free **Upstash Redis** database and copy `UPSTASH_REDIS_REST_URL` and `UPSTASH_REDIS_REST_TOKEN` into `.env.local`.

### Phase 2: Database Schema, Atomic RPCs & Supabase RLS Lockdown
1. Run the SQL migration creating `categories`, `products` (with generated `discount_pct` column), `coupons`, `orders` (with `UNIQUE` partial index on 12-digit `utr_number`), and `order_items` (immutable price snapshot table).
2. Create the `is_verified_admin()` helper function checking `app_metadata.role = 'admin'` and `aal = 'aal2'`, and attach all Row-Level Security (RLS) policies.
3. Create the `place_order_atomic` PL/pgSQL function to lock stock rows (`FOR UPDATE`), verify stock availability, calculate server-side totals and coupon discounts, and insert the order atomically.
4. Create the `product-images` public-read / admin-write Storage bucket.

### Phase 3: Authentication, Admin 2FA (`aal2`) & Rate-Limited Server Actions
1. Build the Customer OTP Login/Logout modal and session provider using `@supabase/ssr`.
2. Build the `/admin/login` 2FA flow requiring Password + Email OTP verification (`aal2`) and enforce server-side role verification in `middleware.ts` and every Admin Server Action.
3. Implement Zod validation schemas and Upstash Redis rate limiters for OTP login, coupon redemption, checkout, and UTR updates.

### Phase 4: Customer Storefront, Multi-Image Details & UPI/UTR Checkout
1. Build the **Global Header** (bold left page title, right search input, category dropdown, and login/logout button).
2. Build the **Storefront Grid** and **Product Details Page** (`/product/[sku]`) with multi-image gallery switching, colour selector, universal **Add to Cart** buttons, **Floating Checkout Button**, and **Multi-Platform Share Sheet**.
3. Build the **Cart & Checkout Page** with coupon redemption, shipping form, dynamic server-generated UPI QR code, optional 12-digit UTR input, and the **UTR Reminder Popup** (*"Please add UTR number to confirm order"* + visual GPay/PhonePe/Paytm UTR location guide).
4. Build the **Customer "My Orders" Page** with live status tracking and late UTR submission.

### Phase 5: Admin 4-Tab Operations Console & Sample Invoice Training
1. Build **Tab 1 (Orders)** with multi-select checkboxes, SKU & multi-image previews, UTR status, `Accepted`/`Rejected` dropdown (with automatic stock restoration on rejection), customer address + mobile display, and the **Invoice Generator Button**.
2. **Sample Invoice Training Checkpoint**: *Pause and request your sample invoice upload so the Barcode + QR Invoice Generator matches your exact invoice template, branding, GST/tax fields, and print dimensions.*
3. Build **Tab 2 (Products)** with multi-image upload, inline **"+ Add Category"** creation, auto-calculated discount percentage (`MRP - Selling Price`), and Edit/Delete actions.
4. Build **Tab 3 (Inventory Management)** with single-select and multi-select bulk stock adjustments.
5. Build **Tab 4 (Coupon Codes)** with creation, activation toggle, and usage rules.

### Phase 6: Security Audit & Production Deployment on Vercel
1. Verify all RLS policies using anonymous, customer, and admin test sessions (confirming customers cannot read other users' orders, scrape coupons, or spoof prices).
2. Connect the GitHub repository to **Vercel (Free Tier)**, configure production environment variables, and attach your custom domain with automatic SSL/HTTPS.

### Phase 7 (Last Stage): Complete Google Search Console Indexing & SEO Launch
1. **Dynamic SEO Metadata & OpenGraph Tags**: Implement `generateMetadata()` in `app/product/[sku]/page.tsx` so every product page has a unique `<title>`, `<meta name="description">`, canonical URL, and OpenGraph image/price tags for WhatsApp and social sharing.
2. **Schema.org `Product` JSON-LD Structured Data**: Inject a `<script type="application/ld+json">` block on every product page declaring `@type: "Product"`, `sku`, `images`, `description`, and `offers` (`priceCurrency: "INR"`, `price`, `availability: "https://schema.org/InStock"`) so Google Search displays rich product price and stock badges.
3. **Automated `app/sitemap.ts` & `app/robots.ts`**:
   * Configure `app/sitemap.ts` to query all active product SKUs and categories from Supabase and output a dynamic XML sitemap at `https://yourdomain.com/sitemap.xml`.
   * Configure `app/robots.ts` to allow Googlebot across `/` and `/product/*`, disallow private routes (`/admin`, `/checkout`, `/my-orders`, `/api`), and point to `Sitemap: https://yourdomain.com/sitemap.xml`.
4. **Google Search Console Verification & Indexing Submission**:
   * Open **Google Search Console**, add your domain property, and verify ownership via DNS TXT record (on your domain registrar/Vercel DNS).
   * Navigate to **Sitemaps** in Google Search Console and submit `https://yourdomain.com/sitemap.xml`.
   * Use the **URL Inspection Tool** on your homepage and top product URLs and click **Request Indexing** to trigger immediate Googlebot crawling and Rich Results validation.
  
   * • Frontend (ফ্রন্টএন্ড বিশ্বাস): Blindly trusting data, logic, or requests coming from the client-side.
• Access Control (অ্যাক্সেস কন্ট্রোল): Broken object level or function level authorization (BOLA/BFLA).
• Business Logic (বিজনেস লজিক): Flaws in application workflow design that let users bypass intended rules (e.g., manipulating pricing or quantities).
• External APIs (এক্সটার্নাল এপিআই): Insecure integration or lack of validation when communicating with third-party services.
• SSRF (সার্ভার রিকোয়েস্ট): Server-Side Request Forgery, where an attacker tricks the server into making unauthorized requests to internal or external systems.
• Sensitive Data (গোপন ডেটা লিক): Exposing PII, passwords, or tokens in API responses.
• Input Validation (ইনপুট যাচাই): Failing to sanitize or validate incoming payloads, leading to injection attacks.
• Rate Limiting (রেট লিমিটিং): Lack of request throttling, opening the system to brute-force or Denial of Service (DoS) attacks.
• API Inventory (এপিআই ইনভেন্টরি): Unmanaged, forgotten, or shadow/orphan API endpoints left active in production.
• Configuration (কনফিগারেশন): Misconfigured security headers, CORS policies, or verbose error messages.

