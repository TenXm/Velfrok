"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ArrowLeft, Minus, Plus, Share2, ShoppingCart } from "lucide-react";
import { getProducts, type Product } from "@/lib/products";

const CART_STORAGE_KEY = "velfrok-cart-v1";
const money = (value: number) => new Intl.NumberFormat("en-IN", {
  style: "currency", currency: "INR", maximumFractionDigits: 0,
}).format(value);

export default function ProductDetail({ identifier }: { identifier: string }) {
  const [product, setProduct] = useState<Product | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [imageIndex, setImageIndex] = useState(0);
  const [selectedColor, setSelectedColor] = useState("");
  const [quantity, setQuantity] = useState(1);

  useEffect(() => {
    let cancelled = false;
    getProducts()
      .then((items) => {
        if (cancelled) return;
        const found = items.find((item) =>
          item.id === identifier || item.sku === identifier || item.slug === identifier
        );
        setProduct(found ?? null);
        setSelectedColor(found?.colors?.[0] || "");
      })
      .catch((loadError) => {
        console.error("Product detail loading failed:", loadError);
        if (!cancelled) setError("This product could not be loaded. Please try again later.");
      })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [identifier]);

  const images = product?.images?.length ? product.images : product?.image ? [product.image] : [];
  const stock = product?.stock ?? 0;

  function addToCart() {
    if (!product || stock < 1) return;
    try {
      const parsed: unknown = JSON.parse(localStorage.getItem(CART_STORAGE_KEY) || "[]");
      const items = Array.isArray(parsed) ? parsed : [];
      const color = selectedColor || undefined;
      const existing = items.find((item: { productId?: unknown; color?: unknown }) =>
        item?.productId === product.id && (item?.color || "") === (color || "")
      );
      const existingQuantity = existing ? Math.max(0, Number(existing.quantity) || 0) : 0;
      const nextQuantity = Math.min(10, stock, existingQuantity + quantity);
      if (existing) existing.quantity = nextQuantity;
      else items.push({ productId: product.id, quantity: nextQuantity, ...(color ? { color } : {}) });
      localStorage.setItem(CART_STORAGE_KEY, JSON.stringify(items));
      setMessage("Added to your cart.");
    } catch (storageError) {
      console.error("Could not save cart:", storageError);
      setError("Your cart could not be updated. Please try again.");
    }
  }

  async function shareProduct() {
    if (!product) return;
    const shareData = {
      title: product.name,
      text: `Take a look at ${product.name} on Velfrok.`,
      url: window.location.href,
    };
    try {
      if (navigator.share) {
        await navigator.share(shareData);
      } else {
        await navigator.clipboard.writeText(shareData.url);
        setMessage("Product link copied.");
      }
    } catch (shareError) {
      if (shareError instanceof Error && shareError.name === "AbortError") return;
      try {
        await navigator.clipboard.writeText(shareData.url);
        setMessage("Product link copied.");
      } catch {
        setError("Could not share the product link on this device.");
      }
    }
  }

  if (loading) return <main className="product-detail-state">Loading product details…</main>;
  if (error && !product) return <main className="product-detail-state" role="alert"><p>{error}</p><Link href="/">Return to Velfrok</Link></main>;
  if (!product) return <main className="product-detail-state"><h1>Product not found</h1><p>This product may no longer be available.</p><Link href="/">Continue shopping</Link></main>;

  const shareUrl = typeof window !== "undefined" ? window.location.href : "";
  const whatsappUrl = `https://wa.me/?text=${encodeURIComponent(product.name + " " + shareUrl)}`;
  const telegramUrl = `https://t.me/share/url?url=${encodeURIComponent(shareUrl)}&text=${encodeURIComponent(product.name)}`;

  return (
    <main className="product-detail-page">
      <div className="product-detail-shell">
        <Link className="product-back-link" href="/"><ArrowLeft size={16} /> Back to shop</Link>
        <div className="product-detail-layout">
          <div>
            <div className="product-detail-image">
              {images.length ? <img src={images[imageIndex] || images[0]} alt={product.name} /> : <div className="product-detail-no-image">Image coming soon</div>}
              {product.badge && <span className="discount">{product.badge}</span>}
            </div>
            {images.length > 1 && (
              <div className="product-gallery-thumbs" aria-label="Product images">
                {images.map((image, index) => (
                  <button type="button" key={image + index} className={imageIndex === index ? "selected" : ""} onClick={() => setImageIndex(index)} aria-label={`View product image ${index + 1}`}>
                    <img src={image} alt="" />
                  </button>
                ))}
              </div>
            )}
          </div>

          <section className="product-detail-info">
            <p className="product-detail-category">{product.category} · SKU {product.sku}</p>
            <h1>{product.name}</h1>
            <div className="product-detail-prices">
              <strong>{money(product.price)}</strong>
              {product.mrp > product.price && <del>{money(product.mrp)}</del>}
            </div>
            <p className={stock < 1 ? "product-stock out" : stock < 10 ? "product-stock low" : "product-stock"}>
              {stock < 1 ? "Out of stock" : stock < 10 ? `Only ${stock} left in stock` : "In stock"}
            </p>

            {product.colors.length > 0 && (
              <div className="product-detail-variants">
                <h2>Colour / Variant</h2>
                <div className="product-variant-list">
                  {product.colors.map((color) => (
                    <button type="button" key={color} className={selectedColor === color ? "active" : ""} onClick={() => setSelectedColor(color)} aria-pressed={selectedColor === color}>{color}</button>
                  ))}
                </div>
              </div>
            )}

            <div className="product-detail-description">
              <h2>Product Details</h2>
              <p>{product.description || "More information about this product will be added soon."}</p>
              {(product.dimensions || product.weight) && (
                <dl className="product-specs">
                  {product.dimensions && <div><dt>Dimensions</dt><dd>{product.dimensions}</dd></div>}
                  {product.weight && <div><dt>Weight</dt><dd>{product.weight}</dd></div>}
                </dl>
              )}
            </div>

            <div className="product-detail-buy-row">
              <div className="product-detail-quantity">
                <button type="button" onClick={() => setQuantity((value) => Math.max(1, value - 1))} disabled={quantity <= 1} aria-label="Decrease quantity"><Minus size={15} /></button>
                <span>{quantity}</span>
                <button type="button" onClick={() => setQuantity((value) => Math.min(10, stock, value + 1))} disabled={quantity >= Math.min(10, stock)} aria-label="Increase quantity"><Plus size={15} /></button>
              </div>
              <button className="product-detail-add" onClick={addToCart} disabled={stock < 1}>
                <ShoppingCart size={18} /> {stock < 1 ? "Out of Stock" : "Add to Cart"}
              </button>
            </div>

            <button type="button" className="product-share-button" onClick={shareProduct}><Share2 size={16} /> Share product</button>
            <div className="product-share-links">
              <a href={whatsappUrl} target="_blank" rel="noreferrer">WhatsApp</a>
              <a href={telegramUrl} target="_blank" rel="noreferrer">Telegram</a>
              <button type="button" onClick={shareProduct}>Copy / More options</button>
            </div>
            {message && <p className="product-detail-success" role="status">{message}</p>}
            {error && <p className="product-detail-error" role="alert">{error}</p>}
            <p className="product-detail-note">Product details and availability are loaded from the active store catalog.</p>
          </section>
        </div>
      </div>
    </main>
  );
}
