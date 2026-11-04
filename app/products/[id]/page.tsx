"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { ArrowLeft, ShoppingCart } from "lucide-react";
import { getProducts, type Product } from "@/lib/products";

const CART_STORAGE_KEY = "velfrok-cart-v1";

const money = (value: number) =>
  new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 0,
  }).format(value);

export default function ProductDetailPage() {
  const params = useParams<{ id: string }>();
  const productId = decodeURIComponent(params.id);
  const [product, setProduct] = useState<Product | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [added, setAdded] = useState(false);

  useEffect(() => {
    let cancelled = false;

    getProducts()
      .then((items) => {
        if (!cancelled) {
          const match = items.find((item) => item.id === productId);
          setProduct(match ?? null);
        }
      })
      .catch((loadError) => {
        console.error("Product detail loading failed:", loadError);
        if (!cancelled) {
          setError("This product could not be loaded. Please try again later.");
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [productId]);

  function addToCart() {
    if (!product) return;

    try {
      const saved = localStorage.getItem(CART_STORAGE_KEY);
      const parsed: unknown = saved ? JSON.parse(saved) : [];
      const items = Array.isArray(parsed) ? parsed : [];
      const existing = items.find(
        (item: { productId?: unknown }) => item?.productId === product.id
      );

      if (existing) {
        existing.quantity = Math.min(
          10,
          Math.max(1, Number(existing.quantity) || 1) + 1
        );
      } else {
        items.push({ productId: product.id, quantity: 1 });
      }

      localStorage.setItem(CART_STORAGE_KEY, JSON.stringify(items));
      setAdded(true);
    } catch (storageError) {
      console.error("Could not save product to cart:", storageError);
      setError("Your cart could not be updated. Please enable browser storage and try again.");
    }
  }

  if (loading) {
    return <main className="product-detail-state">Loading product details...</main>;
  }

  if (error && !product) {
    return (
      <main className="product-detail-state" role="alert">
        <p>{error}</p>
        <Link href="/">Return to Velfrok</Link>
      </main>
    );
  }

  if (!product) {
    return (
      <main className="product-detail-state">
        <h1>Product not found</h1>
        <p>This product may no longer be available.</p>
        <Link href="/">Continue shopping</Link>
      </main>
    );
  }

  return (
    <main className="product-detail-page">
      <div className="product-detail-shell">
        <Link className="product-back-link" href="/">
          <ArrowLeft size={16} /> Back to shop
        </Link>

        <div className="product-detail-layout">
          <div className="product-detail-image">
            {product.image ? (
              <img src={product.image} alt={product.name} />
            ) : (
              <div className="product-detail-no-image">Image coming soon</div>
            )}
            {product.badge && (
              <span className="discount">{product.badge}</span>
            )}
          </div>

          <section className="product-detail-info">
            <p className="product-detail-category">{product.category}</p>
            <h1>{product.name}</h1>

            <div className="product-detail-prices">
              <strong>{money(product.price)}</strong>
              {product.mrp > product.price && (
                <del>{money(product.mrp)}</del>
              )}
            </div>

            <div className="product-detail-description">
              <h2>Product Details</h2>
              <p>{product.description || "More information about this product will be added soon."}</p>
            </div>

            <button className="product-detail-add" onClick={addToCart}>
              <ShoppingCart size={18} />
              Add to Cart
            </button>

            {added && (
              <p className="product-detail-success" role="status">
                Added to your cart. Your cart will be updated when you return to the shop.
              </p>
            )}

            {error && <p className="product-detail-error" role="alert">{error}</p>}
            <p className="product-detail-note">
              Price and product information are loaded from the active store catalog.
            </p>
          </section>
        </div>
      </div>
    </main>
  );
}
