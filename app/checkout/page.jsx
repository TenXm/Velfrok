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
  const [paymentMethod, setPaymentMethod] = useState("upi");
  const [form, setForm] = useState({ name:"", phone:"", line1:"", city:"", state:"", pincode:"" });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  useEffect(() => {
    let active = true;
    (async () => {
      const [{ data }, products] = await Promise.all([supabaseBrowser().auth.getSession(), getProducts()]);
      if (!active) return;
      setToken(data.session?.access_token || "");
      setEmail(data.session?.user?.email || "");
      const saved = JSON.parse(localStorage.getItem(CART_KEY) || "[]");
      const restored = Array.isArray(saved) ? saved.flatMap(entry => {
        const product = products.find(p => p.id === entry?.productId);
        const quantity = Number(entry?.quantity);
        return product && Number.isInteger(quantity) && quantity > 0 && quantity <= 10
          ? [{ productId: product.id, quantity, name: product.name, price: product.price }] : [];
      }) : [];
      setItems(restored);
    })().catch(() => setError("Could not load your cart. Return to the store and try again."));
    return () => { active = false; };
  }, []);

  const subtotal = items.reduce((sum,item) => sum + item.price * item.quantity, 0);
  const update = (key,value) => setForm(old => ({...old,[key]:value}));

  async function submit(event) {
    event.preventDefault(); setError(""); setMessage("");
    if (!token) { setError("Please sign in before checkout."); return; }
    if (!items.length) { setError("Your cart is empty."); return; }
    setBusy(true);
    try {
      const response = await fetch("/api/orders", {
        method:"POST",
        headers:{"Content-Type":"application/json",Authorization:`Bearer ${token}`},
        body:JSON.stringify({...form,email,paymentMethod,items:items.map(item=>({product_id:item.productId,quantity:item.quantity}))})
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "Unable to place your order.");
      localStorage.removeItem(CART_KEY);
      if (paymentMethod === "upi") router.push(`/payment/${result.order?.id || result.orderId}`);
      else { setItems([]); setMessage(`Order ${result.order?.order_number || ""} placed. Payment is due on delivery. Track it from your order history.`); }
    } catch(e) { setError(e instanceof Error ? e.message : "Unable to place your order."); }
    finally { setBusy(false); }
  }

  return <main className="pay" style={{maxWidth:720,margin:"40px auto",padding:24}}>
    <h1>Checkout</h1>
    {message ? <><p className="ok">{message}</p><Link href="/">Continue shopping</Link></> : <>
      {!token && <p>Please <Link href="/login">sign in</Link> to continue checkout.</p>}
      {!items.length ? <p>Your cart is empty. <Link href="/">Continue shopping</Link></p> : <>
        <h2>Order summary</h2>
        {items.map(item=><p key={item.productId}>{item.name} × {item.quantity} — ₹{(item.price*item.quantity).toFixed(2)}</p>)}
        <h3>Estimated subtotal: ₹{subtotal.toFixed(2)}</h3>
        <p>Final price and stock are recalculated and checked by the database when you place the order.</p>
        <form onSubmit={submit} style={{display:"grid",gap:12}}>
          <h2>Delivery details</h2>
          <label>Full name<input required maxLength={80} value={form.name} onChange={e=>update("name",e.target.value)}/></label>
          <label>Mobile number<input required inputMode="numeric" maxLength={10} value={form.phone} onChange={e=>update("phone",e.target.value.replace(/\D/g,"").slice(0,10))}/></label>
          <label>Address<input required maxLength={200} value={form.line1} onChange={e=>update("line1",e.target.value)}/></label>
          <label>City<input required maxLength={60} value={form.city} onChange={e=>update("city",e.target.value)}/></label>
          <label>State<input required maxLength={40} value={form.state} onChange={e=>update("state",e.target.value)}/></label>
          <label>PIN code<input required inputMode="numeric" maxLength={6} value={form.pincode} onChange={e=>update("pincode",e.target.value.replace(/\D/g,"").slice(0,6))}/></label>
          <h2>Payment method</h2>
          <label><input type="radio" name="paymentMethod" value="upi" checked={paymentMethod==="upi"} onChange={()=>setPaymentMethod("upi")}/> UPI (pay and submit UTR)</label>
          {COD_VISIBLE ? <label><input type="radio" name="paymentMethod" value="cod" checked={paymentMethod==="cod"} onChange={()=>setPaymentMethod("cod")}/> Cash on Delivery</label> : <p>Cash on Delivery is not enabled yet.</p>}
          <button type="submit" disabled={busy || !token}>{busy ? "Placing order..." : "Place order"}</button>
        </form>
      </>}
    </>}
    {error && <p className="err" role="alert">{error}</p>}
    <p><Link href="/">Back to store</Link></p>
  </main>;
}