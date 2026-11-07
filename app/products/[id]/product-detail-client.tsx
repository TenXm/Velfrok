"use client";

import { useEffect, useMemo, useRef, useState, type FormEvent, type TouchEvent } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { ArrowLeft, Check, ChevronLeft, ChevronRight, ShoppingCart, Star, Truck, ShieldCheck, RotateCcw, Share2, Copy } from "lucide-react";
import { getProducts, type Product } from "@/lib/products";
import { supabaseBrowser } from "@/lib/supabase";
import { StoreFooter, StoreHeader } from "@/components/store-chrome";

type Review = { id: string; user_id: string; rating: number; title: string; body: string; created_at: string };
const money = (value: number) => new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 0 }).format(value);
const labelize = (key: string) => key.replace(/[-_]/g, " ").replace(/\b\w/g, c => c.toUpperCase());
const bulletsFrom = (p: Product) => {
  const raw = p.attributes.highlights || p.attributes["bullet-points"] || p.attributes.benefits || [];
  return raw.length ? raw : [];
};

export default function ProductDetailPage() {
  const params = useParams<{ id: string }>();
  const id = params?.id;
  const [product, setProduct] = useState<Product | null>(null);
  const [allProducts, setAllProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [imageIndex, setImageIndex] = useState(0);
  const [imageZoom, setImageZoom] = useState(1);
  const pinchStartDistance = useRef(0);
  const pinchStartScale = useRef(1);
  const [selected, setSelected] = useState<Record<string, string>>({});
  const [reviews, setReviews] = useState<Review[]>([]);
  const [userId, setUserId] = useState<string | null>(null);
  const [reviewRating, setReviewRating] = useState(5);
  const [reviewTitle, setReviewTitle] = useState("");
  const [reviewBody, setReviewBody] = useState("");
  const [reviewMessage, setReviewMessage] = useState("");
  const [reviewError, setReviewError] = useState("");
  const [reviewBusy, setReviewBusy] = useState(false);
  const [cartMessage, setCartMessage] = useState("");
  const [shareOpen, setShareOpen] = useState(false);
  const [shareMessage, setShareMessage] = useState("");

  useEffect(() => {
    let cancelled = false;
    const db = supabaseBrowser();
    Promise.all([
      getProducts(),
      db.auth.getUser(),
    ]).then(async ([items, auth]) => {
      if (cancelled) return;
      setAllProducts(items);
      const current = items.find(item => item.id === id) || null;
      setProduct(current);
      setUserId(auth.data.user?.id || null);
      if (current) {
        const result = await db.from("product_reviews")
          .select("id,user_id,rating,title,body,created_at")
          .eq("product_id", current.id)
          .order("created_at", { ascending: false });
        if (!cancelled && !result.error) setReviews((result.data || []) as Review[]);
        if (result.error) console.warn("Product reviews not available yet:", result.error.message);
      }
    }).catch(err => {
      console.error("Product detail loading failed:", err);
      if (!cancelled) setError("We couldn't load this product. Please try again.");
    }).finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [id]);

  const images = product?.images.length ? product.images : product?.image ? [product.image] : [];
  const attributeEntries = useMemo(() => Object.entries(product?.attributes || {})
    .filter(([key, values]) => values.length && !["highlights", "bullet-points", "benefits"].includes(key) && !(product?.colours.length && ["colour", "color"].includes(key))), [product]);
  const requiredKeys = useMemo(() => [
    ...(product?.colours.length ? ["colour"] : []),
    ...attributeEntries.filter(([key]) => ["size", "sizes", "colour", "color"].includes(key)).map(([key]) => key),
  ], [attributeEntries, product]);
  const visibleReviews = reviews;
  const average = visibleReviews.length ? visibleReviews.reduce((sum, r) => sum + r.rating, 0) / visibleReviews.length : 0;
  const related = product ? allProducts.filter(p => p.id !== product.id).sort((a, b) => Number(b.category === product.category) - Number(a.category === product.category)).filter(p => p.quantity > 0) : [];

  const handleGalleryTouchStart = (event: TouchEvent<HTMLImageElement>) => {
    if (event.touches.length !== 2) return;
    const [first, second] = Array.from(event.touches);
    pinchStartDistance.current = Math.hypot(first.clientX - second.clientX, first.clientY - second.clientY);
    pinchStartScale.current = imageZoom;
  };

  const handleGalleryTouchMove = (event: TouchEvent<HTMLImageElement>) => {
    if (event.touches.length !== 2 || pinchStartDistance.current <= 0) return;
    event.preventDefault();
    const [first, second] = Array.from(event.touches);
    const distance = Math.hypot(first.clientX - second.clientX, first.clientY - second.clientY);
    setImageZoom(Math.max(1, Math.min(3, pinchStartScale.current * distance / pinchStartDistance.current)));
  };

  const handleGalleryTouchEnd = () => {
    pinchStartDistance.current = 0;
    if (imageZoom <= 1.02) setImageZoom(1);
  };

  const chooseOption = (key: string, value: string) => setSelected(old => ({ ...old, [key]: value }));

  const addToCart = () => {
    if (!product) return;
    const missing = requiredKeys.find(key => !selected[key]);
    if (missing) { setCartMessage(`Please select ${labelize(missing)} first.`); return; }
    try {
      const storageKey = "velfrok-cart-v1";
      const saved = JSON.parse(localStorage.getItem(storageKey) || "[]");
      const list = Array.isArray(saved) ? saved : [];
      const existing = list.find((item: any) => item.productId === product.id && JSON.stringify(item.options || {}) === JSON.stringify(selected));
      if (existing) existing.quantity = Math.min(10, Number(existing.quantity || 0) + 1);
      else list.push({ productId: product.id, quantity: 1, options: selected });
      localStorage.setItem(storageKey, JSON.stringify(list));
      setCartMessage("Added to your cart. Your selected options are saved.");
    } catch {
      setCartMessage("Could not save your cart. Please enable browser storage and try again.");
    }
  };

  const openProductShare = async () => {
    if (!product) return;
    const url = window.location.href;
    const shareData = { title: product.name, text: "Check out " + product.name + " on Velfrok.", url };
    if (typeof navigator !== "undefined" && typeof navigator.share === "function") {
      try {
        await navigator.share(shareData);
        setShareMessage("");
      } catch (error) {
        if (error instanceof Error && error.name === "AbortError") return;
        setShareOpen(true);
      }
      return;
    }
    setShareOpen((open) => !open);
  };

  const copyProductLink = async () => {
    try {
      await navigator.clipboard.writeText(window.location.href);
      setShareMessage("Product link copied. You can paste it into Instagram or any chat.");
    } catch {
      setShareMessage("Copy was blocked by your browser. Please copy the page URL from the address bar.");
    }
  };

  const submitReview = async (event: FormEvent) => {
    event.preventDefault();
    if (!product) return;
    setReviewBusy(true); setReviewError(""); setReviewMessage("");
    try {
      const db = supabaseBrowser();
      const auth = await db.auth.getUser();
      if (!auth.data.user) throw new Error("Please sign in to write a review.");
      const { error: insertError } = await db.from("product_reviews").insert({
        product_id: product.id, user_id: auth.data.user.id, rating: reviewRating,
        title: reviewTitle.trim(), body: reviewBody.trim(),
      });
      if (insertError) {
        if (insertError.code === "23505") throw new Error("You have already submitted a review for this product.");
        if (insertError.code === "42P01" || insertError.code === "PGRST205") throw new Error("Customer reviews are not enabled yet. The store owner needs to apply migration 003_product_reviews.sql in Supabase.");
        throw new Error(insertError.message);
      }
      setReviewMessage("Thank you! Your review has been submitted and will appear after moderation.");
      setReviewTitle(""); setReviewBody(""); setReviewRating(5);
      setUserId(auth.data.user.id);
    } catch (err) {
      setReviewError(err instanceof Error ? err.message : "Could not submit your review.");
    } finally { setReviewBusy(false); }
  };

  return <main>
    <StoreHeader />
    <div className="product-detail-page">
      <div className="site">
        <Link className="product-back-link" href="/"><ArrowLeft size={16}/> Back to shopping</Link>
        {loading ? <div className="empty">Loading product...</div> : error ? <div className="empty" role="alert">{error}</div> : !product ? (
          <div className="empty">This product is unavailable or may have been removed.<p><Link className="product-back-link" href="/">Continue shopping</Link></p></div>
        ) : <>
          <section className="product-detail">
            <div className="product-gallery">
              <div className="product-detail-image">
                {images[imageIndex] ? <img src={images[imageIndex]} alt={product.name} style={{ transform: `scale(${imageZoom})`, touchAction: "none" }} onTouchStart={handleGalleryTouchStart} onTouchMove={handleGalleryTouchMove} onTouchEnd={handleGalleryTouchEnd} onDoubleClick={() => setImageZoom(value => value > 1 ? 1 : 2)} /> : <div className="empty">Image coming soon</div>}
                {product.badge && <span className="discount">{product.badge}</span>}
                {images.length > 1 && <><button className="gallery-arrow gallery-prev" onClick={() => setImageIndex(i => (i + images.length - 1) % images.length)} aria-label="Previous image"><ChevronLeft/></button><button className="gallery-arrow gallery-next" onClick={() => setImageIndex(i => (i + 1) % images.length)} aria-label="Next image"><ChevronRight/></button></>}
              </div>
              {images.length > 1 && <div className="product-thumbnails">{images.map((src,i)=><button key={src+i} className={i===imageIndex?"selected":""} onClick={()=>setImageIndex(i)} aria-label={`Show image ${i+1}`}><img src={src} alt=""/></button>)}</div>}
            </div>
            <div className="product-detail-info">
              <p className="product-detail-category">{product.category}</p>
              <h1>{product.name}</h1>
              <div className="product-review-summary">{visibleReviews.length ? <><span className="review-stars">{"★".repeat(Math.round(average))}{"☆".repeat(5-Math.round(average))}</span><span>{average.toFixed(1)} ({visibleReviews.length} reviews)</span></> : <span>Be the first to review this product</span>}</div>
              <div className="product-detail-price"><strong>{money(product.price)}</strong>{product.mrp>product.price && <><del>{money(product.mrp)}</del><span className="product-saving">Save {money(product.mrp-product.price)}</span></>}</div>
              <p className="product-tax-note">Inclusive of applicable taxes</p>
              <div className="product-share">
                <button type="button" className="product-share-trigger" onClick={openProductShare} aria-expanded={shareOpen}>
                  <Share2 size={16} /> Share product
                </button>
                {shareOpen && (
                  <div className="product-share-panel">
                    <strong>Share this product</strong>
                    <div className="product-share-links">
                      <a href={`https://wa.me/?text=${encodeURIComponent("Check out " + product.name + " on Velfrok. " + (typeof window !== "undefined" ? window.location.href : ""))}`} target="_blank" rel="noopener noreferrer">WhatsApp</a>
                      <a href={`https://t.me/share/url?url=${encodeURIComponent(typeof window !== "undefined" ? window.location.href : "")}&text=${encodeURIComponent("Check out " + product.name + " on Velfrok.")}`} target="_blank" rel="noopener noreferrer">Telegram</a>
                      <a href={`https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(typeof window !== "undefined" ? window.location.href : "")}`} target="_blank" rel="noopener noreferrer">Facebook</a>
                      <a href={`https://twitter.com/intent/tweet?text=${encodeURIComponent("Check out " + product.name + " on Velfrok.")}&url=${encodeURIComponent(typeof window !== "undefined" ? window.location.href : "")}`} target="_blank" rel="noopener noreferrer">X</a>
                      <button type="button" onClick={copyProductLink}><Copy size={13} /> Copy link</button>
                    </div>
                    <small>For Instagram, copy the link and paste it into your Instagram post or message.</small>
                    {shareMessage && <p className="product-share-message" role="status">{shareMessage}</p>}
                  </div>
                )}
              </div>
              <div className={product.quantity>0 ? (product.quantity<10 ? "product-stock low-stock" : "product-stock") : "product-stock out-of-stock"}>{product.quantity>0?<><Check size={16}/> {product.quantity<10 ? `Only ${product.quantity} left in stock` : "In stock"}</>:<span>Out of stock</span>}</div>
              {product.colours.length>0 && <div className="product-option"><h3>Colour <span>{selected.colour || selected.color || "Select a colour"}</span></h3><div className="option-chips">{product.colours.map(value=><button key={value} className={(selected.colour===value||selected.color===value)?"active":""} onClick={()=>chooseOption("colour",value)}>{value}</button>)}</div></div>}
              {attributeEntries.map(([key,values])=><div className="product-option" key={key}><h3>{labelize(key)} {requiredKeys.includes(key) && <span>Required</span>}</h3><div className="option-chips">{values.map(value=><button key={value} className={selected[key]===value?"active":""} onClick={()=>chooseOption(key,value)}>{value}</button>)}</div></div>)}
              <button className="product-detail-shop-button product-add-button" disabled={product.quantity<1} onClick={addToCart}><ShoppingCart size={17}/> Add to Cart</button>
              {cartMessage && <p className="cart-feedback" role="status">{cartMessage}</p>}
              <div className="product-promises"><span><Truck size={18}/> Delivery across India</span><span><ShieldCheck size={18}/> Secure payments</span><span><RotateCcw size={18}/> Easy returns</span></div>
            </div>
          </section>

          <section className="product-info-section">
            <h2>Product details</h2>
            {product.description && <div className="product-long-description">{product.description.split(/\n+/).map((line,i)=><p key={i}>{line}</p>)}</div>}
            {bulletsFrom(product).length>0 && <ul className="product-bullet-points">{bulletsFrom(product).map((item,i)=><li key={i}>{item}</li>)}</ul>}
            <div className="product-spec-grid">
              {product.dimensions && <div><span>Dimensions</span><strong>{product.dimensions}</strong></div>}
              {product.weight && <div><span>Weight</span><strong>{product.weight}</strong></div>}
              {attributeEntries.filter(([key])=>!requiredKeys.includes(key)).map(([key,values])=><div key={key}><span>{labelize(key)}</span><strong>{values.join(", ")}</strong></div>)}
            </div>
          </section>

          {related.length>0 && <section className="related-products-section"><div className="section-head"><h2>You may also like</h2><Link className="text-button" href="/#products">View all products</Link></div><div className="related-product-grid">{related.map(item=><Link href={`/products/${item.id}`} className="related-product-card" key={item.id}>{item.image?<img src={item.image} alt={item.name}/>:<div className="empty">Image coming soon</div>}<strong>{item.name}</strong><span>{money(item.price)}</span></Link>)}</div></section>}

          <section className="product-info-section product-reviews-section" id="reviews">
            <div className="review-section-heading"><div><h2>Customer reviews</h2><p>Reviews from Velfrok customers</p></div><div className="review-average">{visibleReviews.length ? <><strong>{average.toFixed(1)}/5</strong><span className="review-stars">{"★".repeat(Math.round(average))}{"☆".repeat(5-Math.round(average))}</span></> : <span>No reviews yet</span>}</div></div>
            {visibleReviews.length ? <div className="review-list">{visibleReviews.map(review=><article className="review-card" key={review.id}><div className="review-card-top"><strong>{review.title}</strong><span className="review-stars">{"★".repeat(review.rating)}{"☆".repeat(5-review.rating)}</span></div><p>{review.body}</p><small>Customer review · {new Date(review.created_at).toLocaleDateString("en-IN")}</small></article>)}</div> : <p className="product-detail-muted">There are no published reviews yet. Share your experience after purchasing this product.</p>}
            <div className="review-form-wrap"><h3>Write a review</h3>{userId ? <form className="review-form" onSubmit={submitReview}><label>Your rating</label><div className="rating-picker">{[1,2,3,4,5].map(n=><button type="button" key={n} className={n<=reviewRating?"active":""} onClick={()=>setReviewRating(n)} aria-label={`${n} stars`}><Star size={22} fill={n<=reviewRating?"currentColor":"none"}/></button>)}</div><label htmlFor="review-title">Review title</label><input id="review-title" value={reviewTitle} onChange={e=>setReviewTitle(e.target.value)} minLength={3} maxLength={120} required placeholder="Summarise your experience"/><label htmlFor="review-body">Your review</label><textarea id="review-body" value={reviewBody} onChange={e=>setReviewBody(e.target.value)} minLength={10} maxLength={3000} required rows={4} placeholder="What did you like or dislike?"/><button className="product-detail-shop-button" disabled={reviewBusy}>{reviewBusy?"Submitting...":"Submit review"}</button></form> : <p><Link href="/login" className="review-login-link">Sign in</Link> to write a review.</p>}{reviewMessage&&<p className="review-success" role="status">{reviewMessage}</p>}{reviewError&&<p className="review-error" role="alert">{reviewError}</p>}</div>
          </section>


        </>}
      </div>
    </div>
    <StoreFooter/>
  </main>;
}
