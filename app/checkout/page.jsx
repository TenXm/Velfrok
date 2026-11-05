"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { supabaseBrowser } from "@/lib/supabase";
import { getProducts } from "@/lib/products";

const CART_KEY = "velfrok-cart-v1";
const COD_VISIBLE = process.env.NEXT_PUBLIC_COD_ENABLED === "true";

export default function CheckoutPage() {
  const router = useRouter();
  const [items, setItems] = useState([]);
  const [token, setToken] = useState("");
  const [email, setEmail] = useState("");
  const [authReady, setAuthReady] = useState(false);
  const [paymentMethod, setPaymentMethod] = useState("upi");
  const [form, setForm] = useState({ name: "", phone: "", line1: "", city: "", state: "", pincode: "" });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [couponCode, setCouponCode] = useState("");
  const [appliedCoupon, setAppliedCoupon] = useState(null);
  const [couponBusy, setCouponBusy] = useState(false);
  const [couponError, setCouponError] = useState("");

  useEffect(() => {
    let active = true;
    (async () => {
      const [{ data }, products] = await Promise.all([
        supabaseBrowser().auth.getSession(),
        getProducts(),
      ]);
      if (!active) return;
      setToken(data.session?.access_token || "");
      setEmail(data.session?.user?.email || "");
      const saved = JSON.parse(localStorage.getItem(CART_KEY) || "[]");
      const restored = Array.isArray(saved) ? saved.flatMap((entry) => {
        const product = products.find((p) => p.id === entry?.productId);
        const quantity = Number(entry?.quantity);
        return product && Number.isInteger(quantity) && quantity > 0 && quantity <= 10
          ? [{ productId: product.id, quantity, options: entry?.options && typeof entry.options === "object" && !Array.isArray(entry.options) ? entry.options : {}, name: product.name, price: product.price, image: product.image || product.image_url || "" }]
          : [];
      }) : [];
      setItems(restored);
      setAuthReady(true);
    })().catch(() => {
      if (active) {
        setError("আপনার কার্ট লোড করা যায়নি। স্টোরে ফিরে আবার চেষ্টা করুন।");
        setAuthReady(true);
      }
    });
    return () => { active = false; };
  }, []);

  const subtotal = items.reduce((sum, item) => sum + item.price * item.quantity, 0);
  const totalQuantity = items.reduce((sum, item) => sum + item.quantity, 0);
  const update = (key, value) => setForm((old) => ({ ...old, [key]: value }));

  async function applyCoupon(event) {
    event.preventDefault();
    setCouponError("");
    if (!token) { setCouponError("কুপন ব্যবহার করতে আগে সাইন ইন করুন।"); return; }
    if (!couponCode.trim()) { setCouponError("একটি কুপন কোড লিখুন।"); return; }
    if (!items.length) { setCouponError("আপনার কার্ট খালি।"); return; }
    setCouponBusy(true);
    try {
      const response = await fetch("/api/coupons/validate", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          code: couponCode,
          items: items.map((item) => ({ product_id: item.productId, quantity: item.quantity, options: item.options || {} })),
        }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "কুপন যাচাই করা যায়নি।");
      setAppliedCoupon(result);
      setCouponCode(result.couponCode);
    } catch (e) {
      setAppliedCoupon(null);
      setCouponError(e instanceof Error ? e.message : "কুপন যাচাই করা যায়নি।");
    } finally { setCouponBusy(false); }
  }

  function removeCoupon() {
    setAppliedCoupon(null);
    setCouponCode("");
    setCouponError("");
  }

  async function submit(event) {
    event.preventDefault();
    setError("");
    setMessage("");
    if (!token) { setError("অর্ডার করতে আগে আপনার অ্যাকাউন্টে সাইন ইন করুন।"); return; }
    if (!items.length) { setError("আপনার কার্ট খালি।"); return; }
    if (!form.name.trim() || !form.phone || !form.line1.trim() || !form.city.trim() || !form.state.trim() || !form.pincode) {
      setError("সবগুলো ডেলিভারি তথ্য পূরণ করুন। কোনো ঘর খালি রাখা যাবে না.");
      return;
    }
    if (!/^[0-9]{10}$/.test(form.phone)) {
      setError("মোবাইল নম্বর অবশ্যই ঠিক ১০টি সংখ্যা হতে হবে। ৯ বা ১১/তার বেশি সংখ্যা গ্রহণযোগ্য নয়।");
      return;
    }
    if (!/^[0-9]{6}$/.test(form.pincode)) {
      setError("PIN code অবশ্যই ঠিক ৬টি সংখ্যা হতে হবে।");
      return;
    }
    setBusy(true);
    try {
      const response = await fetch("/api/orders", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          name: form.name,
          phone: form.phone,
          line1: form.line1,
          city: form.city,
          state: form.state,
          pincode: form.pincode,
          email,
          paymentMethod,
          coupon: appliedCoupon?.couponCode || null,
          items: items.map((item) => ({ product_id: item.productId, quantity: item.quantity })),
        }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "অর্ডার সম্পন্ন করা যায়নি।");
      localStorage.removeItem(CART_KEY);
      if (paymentMethod === "upi") {
        router.push(`/payment/${result.order?.id || result.orderId}`);
      } else {
        setItems([]);
        setMessage(`অর্ডার ${result.order?.order_number || ""} তৈরি হয়েছে। ডেলিভারির সময় পেমেন্ট করতে হবে।`);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "অর্ডার সম্পন্ন করা যায়নি।");
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="checkout-page">
      <div className="checkout-shell">
        <header className="checkout-header">
          <Link href="/" className="checkout-brand" aria-label="Velfrok home">
            <span className="checkout-brand-mark">V</span>
            <span><strong>VELFROK</strong><small>BETTER LIVING, EVERY DAY</small></span>
          </Link>
          <Link href="/" className="checkout-back-link"><span aria-hidden="true">←</span> Continue shopping</Link>
        </header>

        <div className="checkout-intro">
          <div>
            <p className="checkout-eyebrow">SECURE CHECKOUT</p>
            <h1>Almost yours.</h1>
            <p className="checkout-subtitle">Add your delivery details and choose how you’d like to pay.</p>
          </div>
          <div className="checkout-progress" aria-label="Checkout progress">
            <span className="checkout-progress-step is-active"><i>1</i> Details</span>
            <span className="checkout-progress-line" />
            <span className="checkout-progress-step"><i>2</i> Payment</span>
          </div>
        </div>

        {!authReady ? (
          <div className="checkout-state"><span className="checkout-spinner" /> Loading your checkout…</div>
        ) : message ? (
          <section className="checkout-success" role="status">
            <span className="checkout-success-icon">✓</span>
            <p className="checkout-eyebrow">ORDER CONFIRMED</p>
            <h2>Thank you for your order.</h2>
            <p>{message}</p>
            <Link href="/" className="checkout-primary-link">Continue shopping <span>→</span></Link>
          </section>
        ) : !items.length ? (
          <section className="checkout-empty">
            <span className="checkout-empty-icon">⌑</span>
            <h2>Your cart is waiting</h2>
            <p>There are no items to check out just yet.</p>
            <Link href="/" className="checkout-primary-link">Explore the store <span>→</span></Link>
          </section>
        ) : (
          <>
            {!token && (
              <div className="checkout-login-note">
                <span>↗</span>
                <p>Please <Link href="/login?next=%2Fcheckout">sign in</Link> to place your order. Your cart will be ready when you return.</p>
              </div>
            )}
            <form className="checkout-layout" onSubmit={submit}>
              <div className="checkout-main-column">
                <section className="checkout-card">
                  <div className="checkout-card-heading">
                    <span className="checkout-section-number">01</span>
                    <div><h2>Delivery address</h2><p>Where should we send your order?</p></div>
                  </div>
                  <div className="checkout-fields">
                    <label className="checkout-field checkout-field-full">
                      <span>Full name</span>
                      <input autoComplete="name" required maxLength={80} placeholder="Enter your full name" value={form.name} onChange={(e) => update("name", e.target.value)} />
                    </label>
                    <label className="checkout-field checkout-field-full">
                      <span>Mobile number</span>
                      <div className="checkout-phone-wrap"><b>+91</b><input autoComplete="tel-national" type="tel" inputMode="numeric" required maxLength={10} minLength={10} pattern="[0-9]{10}" title="Enter exactly 10 digits, without country code or spaces." placeholder="10-digit mobile number" value={form.phone} onChange={(e) => update("phone", e.target.value.replace(/\D/g, "").slice(0, 10))} onPaste={(e) => { e.preventDefault(); const pasted = e.clipboardData.getData("text").replace(/\D/g, ""); const input = e.currentTarget; const next = form.phone.slice(0, input.selectionStart) + pasted + form.phone.slice(input.selectionEnd); if (next.length > 10) { setError("মোবাইল নম্বর ১০টির বেশি সংখ্যা হতে পারবে না।"); return; } update("phone", next); }} /></div>
                    </label>
                    <label className="checkout-field checkout-field-full">
                      <span>Street address</span>
                      <input autoComplete="street-address" required maxLength={200} placeholder="House no., street, area" value={form.line1} onChange={(e) => update("line1", e.target.value)} />
                    </label>
                    <label className="checkout-field">
                      <span>City</span>
                      <input autoComplete="address-level2" required maxLength={60} placeholder="Your city" value={form.city} onChange={(e) => update("city", e.target.value)} />
                    </label>
                    <label className="checkout-field">
                      <span>State</span>
                      <input autoComplete="address-level1" required maxLength={40} placeholder="Your state" value={form.state} onChange={(e) => update("state", e.target.value)} />
                    </label>
                    <label className="checkout-field checkout-field-full">
                      <span>PIN code</span>
                      <input autoComplete="postal-code" inputMode="numeric" required maxLength={6} minLength={6} placeholder="6-digit PIN code" value={form.pincode} onChange={(e) => update("pincode", e.target.value.replace(/\D/g, "").slice(0, 6))} />
                    </label>
                  </div>
                </section>

                <section className="checkout-card">
                  <div className="checkout-card-heading">
                    <span className="checkout-section-number">02</span>
                    <div><h2>Promo code</h2><p>Have a coupon? Apply it to your order.</p></div>
                  </div>
                  <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                    <input aria-label="Coupon code" autoComplete="off" maxLength={40} placeholder="Enter coupon code" value={couponCode} disabled={couponBusy || Boolean(appliedCoupon)} onChange={(e) => setCouponCode(e.target.value.toUpperCase().replace(/\s/g, ""))} style={{ flex: "1 1 180px", minWidth: 0, border: "1px solid #dfe5dc", borderRadius: 9, padding: "12px 13px", textTransform: "uppercase" }} />
                    {appliedCoupon ? <button type="button" onClick={removeCoupon} className="checkout-primary-link">Remove</button> : <button type="button" onClick={applyCoupon} disabled={couponBusy || !token} className="checkout-primary-link">{couponBusy ? "Checking…" : "Apply coupon"}</button>}
                  </div>
                  {appliedCoupon && <p role="status" style={{ color: "#176344", fontSize: 13, marginBottom: 0 }}>✓ {appliedCoupon.couponCode} applied — you save ₹{Number(appliedCoupon.discountAmount).toFixed(2)}.</p>}
                  {couponError && <p role="alert" style={{ color: "#a3332d", fontSize: 12, marginBottom: 0 }}>{couponError}</p>}
                  {!token && <p className="checkout-payment-footnote">Sign in to validate and apply a coupon. <Link href="/login?next=%2Fcheckout">Sign in or create an account →</Link></p>}
                </section>

                <section className="checkout-card">
                  <div className="checkout-card-heading">
                    <span className="checkout-section-number">03</span>
                    <div><h2>Payment method</h2><p>Choose your preferred payment option.</p></div>
                  </div>
                  <div className="checkout-payment-options">
                    <label className={`checkout-payment-option ${paymentMethod === "upi" ? "is-selected" : ""}`}>
                      <input type="radio" name="paymentMethod" value="upi" checked={paymentMethod === "upi"} onChange={() => setPaymentMethod("upi")} />
                      <span className="checkout-payment-icon">↗</span>
                      <span className="checkout-payment-copy"><strong>Pay with UPI</strong><small>Pay securely and submit your 12-digit UTR for verification.</small></span>
                      <span className="checkout-radio-mark" />
                    </label>
                    {COD_VISIBLE && (
                      <label className={`checkout-payment-option ${paymentMethod === "cod" ? "is-selected" : ""}`}>
                        <input type="radio" name="paymentMethod" value="cod" checked={paymentMethod === "cod"} onChange={() => setPaymentMethod("cod")} />
                        <span className="checkout-payment-icon">₹</span>
                        <span className="checkout-payment-copy"><strong>Cash on Delivery</strong><small>Pay in cash when your order is delivered.</small></span>
                        <span className="checkout-radio-mark" />
                      </label>
                    )}
                  </div>
                  {!COD_VISIBLE && <p className="checkout-payment-footnote">Cash on Delivery is currently unavailable.</p>}
                </section>
                {error && <div className="checkout-error" role="alert"><strong>Couldn’t place your order</strong><span>{error}</span></div>}
                <button className="checkout-submit checkout-submit-mobile" type="submit" disabled={busy || !token}>
                  {busy ? "Processing…" : paymentMethod === "upi" ? "Continue to UPI payment" : "Place order"}
                  {!busy && <span>→</span>}
                </button>
              </div>

              <aside className="checkout-summary-column">
                <section className="checkout-summary-card">
                  <div className="checkout-summary-heading"><h2>Your order</h2><span>{totalQuantity} {totalQuantity === 1 ? "item" : "items"}</span></div>
                  <div className="checkout-summary-items">
                    {items.map((item) => (
                      <div className="checkout-summary-item" key={`${item.productId}:${JSON.stringify(item.options || {})}`}>
                        <div className="checkout-item-thumb">
                          {item.image ? <img src={item.image} alt="" loading="lazy" /> : <span>V</span>}
                          <i>{item.quantity}</i>
                        </div>
                        <div className="checkout-item-details"><strong>{item.name}</strong><small>Qty: {item.quantity}{Object.entries(item.options || {}).map(([key, value]) => `, ${key}: ${value}`).join("")}</small></div>
                        <b>₹{(item.price * item.quantity).toFixed(2)}</b>
                      </div>
                    ))}
                  </div>
                  <div className="checkout-totals">
                    <div><span>Subtotal</span><b>₹{Number(appliedCoupon?.subtotal ?? subtotal).toFixed(2)}</b></div>
                    {appliedCoupon && <div><span>Coupon ({appliedCoupon.couponCode})</span><b className="checkout-free">−₹{Number(appliedCoupon.discountAmount).toFixed(2)}</b></div>}
                    <div><span>Delivery</span><b className="checkout-free">Calculated at dispatch</b></div>
                  </div>
                  <div className="checkout-grand-total"><span>Estimated total</span><strong>₹{Number(appliedCoupon?.payable ?? subtotal).toFixed(2)}</strong></div>
                  <p className="checkout-price-note">Final price, availability and stock are verified securely by our server when you place the order.</p>
                  <button className="checkout-submit checkout-submit-desktop" type="submit" disabled={busy || !token}>
                    {busy ? "Processing…" : paymentMethod === "upi" ? "Continue to UPI payment" : "Place order"}
                    {!busy && <span>→</span>}
                  </button>
                  <div className="checkout-trust"><span>⌑</span><p><strong>Secure order processing</strong><small>Your payment and order details are handled securely.</small></p></div>
                </section>
                <Link href="/" className="checkout-edit-cart">← Return to store</Link>
              </aside>
            </form>
          </>
        )}
        <footer className="checkout-footer"><span>© {new Date().getFullYear()} Velfrok</span><span>Thoughtful essentials. Better living.</span></footer>
      </div>
    </main>
  );
}
